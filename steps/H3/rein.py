"""Rein: a small coding-agent harness, built one step at a time.

Each section below is one system of the harness. Read it from top to bottom.
"""
import argparse
import json
import os
import subprocess
from dataclasses import dataclass, field
from pathlib import Path


def show(tag, text):
    """Print one line of the live transcript: line breaks become spaces, and it is cut to fit."""
    print(f"{tag:<8} {' '.join(str(text).splitlines())}"[:100])


def one_line(text):
    """Join the lines of a tool result with ' | ' for the transcript. The model still gets all of it."""
    return " | ".join(line.strip() for line in str(text).splitlines() if line.strip())


# ============ MODEL: one interface, two models ============

@dataclass
class ToolCall:
    id: str      # every request gets an id, so its result can be matched to it
    name: str    # which tool the model wants
    input: dict  # the arguments the model chose


@dataclass
class Reply:
    text: str          # what the model wrote
    tool_calls: list   # the tools it asked for (maybe none)
    stop_reason: str   # why it stopped: "end_turn", "tool_use", "max_tokens", ...
    content: list      # the raw blocks, saved into the history exactly as they came
    usage: dict = field(default_factory=dict)  # input and output token counts


class FakeModel:
    """Replays a script of replies, so every run is free, offline, and repeatable."""

    def __init__(self, replies):
        self.replies = list(replies)
        self.calls = 0

    def call(self, system, messages, tools):
        step = self.replies.pop(0) if self.replies else {"say": "(the script has run out)"}
        content, tool_calls = [], []
        if step.get("say"):
            content.append({"type": "text", "text": step["say"]})
        for name, args in step.get("tools", []):
            self.calls += 1
            call = ToolCall(f"call_{self.calls}", name, args)
            tool_calls.append(call)
            content.append({"type": "tool_use", "id": call.id, "name": name, "input": args})
        stop = step.get("stop") or ("tool_use" if tool_calls else "end_turn")
        usage = {"input_tokens": len(json.dumps(messages)) // 4,
                 "output_tokens": len(json.dumps(content)) // 4}
        return Reply(step.get("say", ""), tool_calls, stop, content, usage)


class ClaudeModel:
    """The real model, behind exactly the same interface."""

    def __init__(self, model=None):
        import anthropic
        self.client = anthropic.Anthropic()  # reads your ANTHROPIC_API_KEY
        self.model = model or os.environ.get("REIN_MODEL", "claude-sonnet-5-5")  # facts: models.ids-current

    def call(self, system, messages, tools):
        extra = {"tools": tools} if tools else {}
        r = self.client.messages.create(model=self.model, max_tokens=4096,
                                        system=system, messages=messages, **extra)
        content = [block.model_dump(exclude_none=True) for block in r.content]
        return Reply(
            text="".join(b["text"] for b in content if b["type"] == "text"),
            tool_calls=[ToolCall(b["id"], b["name"], b["input"])
                        for b in content if b["type"] == "tool_use"],
            stop_reason=r.stop_reason,
            content=content,
            usage={"input_tokens": r.usage.input_tokens,
                   "output_tokens": r.usage.output_tokens},
        )


# ============ TOOLS: the model's hands ============

class ToolError(Exception):
    """An expected failure. Its message goes back to the model, so write it for the model."""

class Workspace:
    """Every path goes through here, so the agent cannot leave its project folder."""

    def __init__(self, root):
        self.root = Path(root).resolve()

    def path(self, rel):
        p = (self.root / rel).resolve()
        if p != self.root and self.root not in p.parents:
            raise ToolError(f"'{rel}' is outside the project. Use a path inside it.")
        return p

@dataclass
class Tool:
    name: str
    description: str         # the model reads this, so write it for the model
    schema: dict             # the inputs, described as JSON Schema
    run: object              # the Python function the harness calls
    read_only: bool = False  # True if the tool never changes anything

    def spec(self):
        return {"name": self.name, "description": self.description, "input_schema": self.schema}


# Commands run without writing .pyc caches, so a check never runs stale code.
CLEAN_ENV = {**os.environ, "PYTHONDONTWRITEBYTECODE": "1"}

def truncate(text, max_chars):
    """Keep the head and the tail. In logs, the error is usually near the end."""
    if len(text) <= max_chars:
        return text
    half = max_chars // 2
    return f"{text[:half]}\n[... {len(text) - max_chars} characters cut by the harness ...]\n{text[-half:]}"


def make_tools(ws):
    """Four tools. Every error message tells the model what to do next."""

    def list_files():
        files = [p.relative_to(ws.root).as_posix() for p in sorted(ws.root.rglob("*")) if p.is_file()]
        return "\n".join(f for f in files if "__pycache__" not in f) or "(no files)"

    def read_file(path, start_line=1):
        p = ws.path(path)
        if not p.is_file():
            raise ToolError(f"No file at '{path}'. Call list_files to see what exists.")
        lines = p.read_text().splitlines()
        page = lines[start_line - 1:start_line + 199]
        text = "\n".join(f"{n}| {line}" for n, line in enumerate(page, start_line))
        last = start_line + len(page) - 1
        if last < len(lines):
            text += f"\n[lines {start_line}-{last} of {len(lines)}. Call again with start_line={last + 1}.]"
        return text or "(empty file)"

    def edit_file(path, old_text, new_text):
        p = ws.path(path)
        if not p.is_file():
            raise ToolError(f"No file at '{path}'. Call list_files to see what exists.")
        text = p.read_text()
        count = text.count(old_text)
        if count == 0:
            raise ToolError("old_text was not found. Read the file again: spaces must match exactly.")
        if count > 1:
            raise ToolError(f"old_text appears {count} times. Include more lines so it is unique.")
        p.write_text(text.replace(old_text, new_text))
        return f"Edited {path}."

    def run_command(command):
        try:
            r = subprocess.run(command, shell=True, cwd=ws.root, capture_output=True,
                               text=True, timeout=60, env=CLEAN_ENV)
        except subprocess.TimeoutExpired:
            raise ToolError("Timed out after 60 seconds. Try a smaller command.")
        return f"exit code {r.returncode}\n{(r.stdout + r.stderr).strip() or '(no output)'}"

    string = {"type": "string"}
    tools = [
        Tool("list_files", "List every file in the project. Start here.",
             {"type": "object", "properties": {}}, list_files, read_only=True),
        Tool("read_file", "Read a text file with line numbers, 200 lines per page.",
             {"type": "object", "properties": {"path": string, "start_line": {"type": "integer"}},
              "required": ["path"]}, read_file, read_only=True),
        Tool("edit_file", "Replace one exact, unique piece of text in a file. Read the file first.",
             {"type": "object", "properties": {"path": string, "old_text": string, "new_text": string},
              "required": ["path", "old_text", "new_text"]}, edit_file),
        Tool("run_command", "Run a shell command in the project folder, for example the tests.",
             {"type": "object", "properties": {"command": string}, "required": ["command"]},
             run_command),
    ]
    return {t.name: t for t in tools}


# ============ THE LOOP ============

SYSTEM_PROMPT = ("You are Rein, a careful coding agent working inside one project folder. "
                 "Look before you change anything, and run the tests to prove your work.")


@dataclass
class Config:
    max_turns: int = 10  # hard stop: the most model calls one run may use
    workspace: str = "demo"  # the only folder the agent may touch
    tool_output_chars: int = 2000  # cap on each tool result that enters the context


class Agent:
    def __init__(self, model, cfg):
        self.model, self.cfg = model, cfg
        self.tools = make_tools(Workspace(cfg.workspace))
        self.specs = [t.spec() for t in self.tools.values()]

    def say(self, tag, text):
        show(tag, text)

    def finish(self, status, note, answer=""):
        """Every way a run can end goes through here, so none of them gets forgotten."""
        self.say(status, note)
        return answer

    def run(self, task):
        messages = [{"role": "user", "content": task}]
        self.say("task", task)
        for turn in range(1, self.cfg.max_turns + 1):
            reply = self.model.call(SYSTEM_PROMPT, messages, self.specs)
            messages.append({"role": "assistant", "content": reply.content})
            self.say(f"turn {turn}", f"model: {reply.text}" if reply.text else "model asks for tools")
            if not reply.tool_calls:
                return self.finish("done", f"after {turn} model calls", reply.text)
            results = []
            for call in reply.tool_calls:
                self.say("", f"tool   {call.name} {json.dumps(call.input)}")
                output, is_error = self.run_tool(call)
                self.say("", ("error  " if is_error else "result ") + one_line(output))
                results.append({"type": "tool_result", "tool_use_id": call.id,
                                "content": output, "is_error": is_error})
            messages.append({"role": "user", "content": results})
        return self.finish("stopped", f"turn limit reached ({self.cfg.max_turns} model calls)")

    def run_tool(self, call):
        """Run one tool call. Any error becomes a message for the model, never a crash."""
        tool = self.tools.get(call.name)
        if tool is None:
            output, is_error = f"Unknown tool '{call.name}'. Available tools: {', '.join(self.tools)}.", True
        else:
            try:
                output, is_error = tool.run(**call.input), False
            except ToolError as e:
                output, is_error = str(e), True
            except Exception as e:  # a bug, or an argument the model made up
                output, is_error = f"{type(e).__name__}: {e}", True
        return truncate(output, self.cfg.tool_output_chars), is_error


# ============ COMMAND LINE ============

def main():
    p = argparse.ArgumentParser(description="Rein: a small coding-agent harness")
    p.add_argument("task", help="what you want done, in plain words")
    p.add_argument("--fake", metavar="SCENARIO", help="use a scripted model from this JSON file")
    p.add_argument("--workspace", default="demo", help="the project folder the agent works in")
    args = p.parse_args()

    if args.fake:
        with open(args.fake) as f:
            scenario = json.load(f)
        model = FakeModel(scenario["replies"])
    else:
        model = ClaudeModel()

    cfg = Config(
        workspace=args.workspace,
    )
    Agent(model, cfg).run(args.task)


if __name__ == "__main__":
    main()
