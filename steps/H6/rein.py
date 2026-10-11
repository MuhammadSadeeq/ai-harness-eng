"""Rein: a small coding-agent harness, built one step at a time.

Each section below is one system of the harness. Read it from top to bottom.
"""
import argparse
import json
import os
import re
import subprocess
import time
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
        self.model_id = "fake"  # no price entry: the fake model costs 0

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
        self.model_id = self.model

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


# ============ PERMISSIONS: allow, ask, or deny ============

BLOCKED = [r"\brm\s", r"\bsudo\b", r"\bgit\s+push\b", r"\bcurl\b", r"\bwget\b"]  # never
ALLOWED = [r"^python\s+test_\w+\.py\b", r"^python\s+-m\s+pytest\b"]            # always fine
CHAINING = re.compile(r"[;&|`$<>]")  # an allowed command must not smuggle in a second one

@dataclass
class Verdict:
    decision: str  # "allow", "ask", or "deny"
    reason: str    # the model reads this too, so say why
    rule: str = ""  # the policy rule that decided it, for the trace

def decide(tool, args, mode):
    """The policy. Deny rules are checked before allow rules."""
    if tool.read_only:
        return Verdict("allow", "read-only tool", "read-only")
    if tool.name == "run_command":
        command = args.get("command", "").strip()
        if any(re.search(p, command) for p in BLOCKED):
            return Verdict("deny", "destructive, network, or admin command", "deny-list")
        if any(re.search(p, command) for p in ALLOWED) and not CHAINING.search(command):
            return Verdict("allow", "allow-listed command", "allow-list")
        return Verdict("ask", "this command is not on the allow-list", "allow-list-miss")
    if mode == "auto":
        return Verdict("allow", "edits are allowed in auto mode", "auto-mode")
    return Verdict("ask", "this tool changes files", "edit-ask")

def ask_human(call, reason):
    answer = input(f"         ? allow {call.name}? ({reason}) [y/N] ")
    return answer.strip().lower() == "y"



# ============ TRACE: a record of everything ============

KEY = re.compile(r"sk-[A-Za-z0-9_-]{12,}")  # looks like an API key: never stored in a trace

def redact(value):
    """Replaces anything that looks like an API key, in every string of an event."""
    if isinstance(value, str):
        return KEY.sub("[REDACTED]", value)
    if isinstance(value, dict):
        return {k: redact(v) for k, v in value.items()}
    if isinstance(value, list):
        return [redact(v) for v in value]
    return value

# Dollars per million tokens (facts: models.sonnet-5-5-price). A model without an entry costs 0.
PRICES = {"claude-sonnet-5-5": (2, 10)}

def cost_nano(model_id, usage):
    """The cost of one reply, in nano-dollars: tokens times the price per million, times 1000."""
    if model_id not in PRICES:
        return 0
    price_in, price_out = PRICES[model_id]
    return usage["input_tokens"] * price_in * 1000 + usage["output_tokens"] * price_out * 1000

class Tracer:
    """Writes one JSON object per event to a file (JSONL), in the course's format (ENGINE section 9)."""

    def __init__(self, path, run):
        self.path, self.run = path, run
        self.start = time.monotonic()
        self.seq, self.turn, self.events = 0, 0, []
        Path(path).write_text("")  # a fresh trace file for every run

    def event(self, kind, wire, **fields):
        record = {"v": 1, "run": self.run, "seq": self.seq, "t": int((time.monotonic() - self.start) * 1000),
                  "turn": self.turn, "agent": "main", "kind": kind, "wire": wire, **redact(fields)}
        self.seq += 1
        self.events.append(record)
        with open(self.path, "a") as f:
            f.write(json.dumps(record, sort_keys=True, separators=(",", ":")) + "\n")

    def summary(self):
        counts = {}
        for e in self.events:
            if e["kind"] not in ("run_start", "run_end", "model_reply"):  # a reply is counted by its model_call
                counts[e["kind"]] = counts.get(e["kind"], 0) + 1
        tokens = sum(e["usage"]["input_tokens"] + e["usage"]["output_tokens"]
                     for e in self.events if e["kind"] == "model_reply")
        return ", ".join(f"{n} {kind}" for kind, n in counts.items()) + f", {tokens} tokens"



# ============ CONTEXT: keep the desk clear ============

def estimate_tokens(messages):
    """About 4 characters per token. Rough, but good enough to decide when to compact."""
    return len(json.dumps(messages)) // 4

def compact(messages, task, keep_last=4):
    """Swap old history for a short summary. Keep the newest messages word for word."""
    cut = len(messages) - keep_last
    while cut > 1 and messages[cut]["role"] != "assistant":  # never split a tool call from its result
        cut -= 1
    if cut <= 1:
        return None  # nothing old enough to summarize yet
    used = [b["name"] for m in messages[:cut] if isinstance(m["content"], list)
            for b in m["content"] if b.get("type") == "tool_use"]
    summary = ("[The harness summarized earlier work to save space.]\n"
               f"Original task: {task}\n"
               f"Tools used so far: {', '.join(used) or 'none'}\n"
               "Re-read any file before you edit it. Then continue the task.")
    return [{"role": "user", "content": summary}] + messages[cut:]


# ============ THE LOOP ============

SYSTEM_PROMPT = ("You are Rein, a careful coding agent working inside one project folder. "
                 "Look before you change anything, and run the tests to prove your work.")


@dataclass
class Config:
    max_turns: int = 10  # hard stop: the most model calls one run may use
    workspace: str = "demo"  # the only folder the agent may touch
    tool_output_chars: int = 2000  # cap on each tool result that enters the context
    mode: str = "ask"        # "ask": edits need a human yes. "auto": edits are allowed
    trace_file: str = "trace.jsonl"  # every event of the run is recorded here
    context_limit: int = 20000       # estimated tokens before old history is compacted


class Agent:
    def __init__(self, model, cfg, trace):
        self.model, self.cfg, self.trace = model, cfg, trace
        self.tools = make_tools(Workspace(cfg.workspace))
        self.specs = [t.spec() for t in self.tools.values()]
        self.denied = set()  # once denied, always denied
        self.turns, self.tokens_in, self.tokens_out, self.cost = 0, 0, 0, 0

    def say(self, tag, text):
        show(tag, text)

    def finish(self, status, note, answer=""):
        """Every way a run can end goes through here, so none of them gets forgotten."""
        self.say(status, note)
        ended = {"done": "done", "stopped": "max_turns"}[status]  # the schema's status names
        self.trace.event("run_end", "loop", status=ended, passed=False, turns=self.turns,
                         tokens={"input": self.tokens_in, "output": self.tokens_out}, cost=self.cost)
        return answer

    def run(self, task):
        messages = [{"role": "user", "content": task}]
        self.say("task", task)
        self.trace.event("run_start", "loop", task=task, board=self.cfg.mode, seed=0, model_id=self.model.model_id)
        for turn in range(1, self.cfg.max_turns + 1):
            self.trace.turn = turn
            size = estimate_tokens(messages)
            smaller = compact(messages, task) if size > self.cfg.context_limit else None
            if smaller:
                dropped = len(messages) - len(smaller) + 1  # the summary replaces the messages it covers
                messages[:] = smaller  # change the list in place, so every holder sees it
                after = estimate_tokens(messages)
                self.say("compact", f"~{size} tokens is over the limit ({self.cfg.context_limit}); now ~{after}")
                self.trace.event("compaction", "context", tokens_before=size, tokens_after=after,
                                 dropped_messages=dropped, kept_notes=[task])
            reply = self.model.call(SYSTEM_PROMPT, messages, self.specs)
            cost = cost_nano(self.model.model_id, reply.usage)
            self.turns += 1
            self.tokens_in += reply.usage["input_tokens"]
            self.tokens_out += reply.usage["output_tokens"]
            self.cost += cost
            self.trace.event("model_call", "loop", attempt=1, tokens_in=reply.usage["input_tokens"])
            self.trace.event("model_reply", "loop", stop_reason=reply.stop_reason, text=reply.text,
                             tool_uses=[{"id": c.id, "name": c.name, "input": c.input} for c in reply.tool_calls],
                             usage=reply.usage, cost=cost)
            messages.append({"role": "assistant", "content": reply.content})
            self.say(f"turn {turn}", f"model: {reply.text}" if reply.text else "model asks for tools")
            if not reply.tool_calls:
                return self.finish("done", f"after {turn} model calls", reply.text)
            results = []
            for call in reply.tool_calls:
                self.say("", f"tool   {call.name} {json.dumps(call.input)}")
                output, is_error, truncated = self.run_tool(call)
                self.trace.event("tool_call", "tools", tool=call.name, input=call.input, ok=not is_error,
                                 output=output, output_tokens=len(output) // 4, truncated=truncated,
                                 tool_use_id=call.id)
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
            verdict = self.check_permission(tool, call)
            self.say("", f"{verdict.decision:<6} {verdict.reason}")
            if verdict.decision == "deny":
                output, is_error = f"Permission denied: {verdict.reason}. Do not retry this; find another way.", True
            else:
                try:
                    output, is_error = tool.run(**call.input), False
                except ToolError as e:
                    output, is_error = str(e), True
                except Exception as e:  # a bug, or an argument the model made up
                    output, is_error = f"{type(e).__name__}: {e}", True
        if len(output) > self.cfg.tool_output_chars:
            self.say("", f"cut    {len(output)} characters down to {self.cfg.tool_output_chars}")
        return truncate(output, self.cfg.tool_output_chars), is_error, len(output) > self.cfg.tool_output_chars


    def check_permission(self, tool, call):
        key = call.name + json.dumps(call.input, sort_keys=True)
        if key in self.denied:
            decided = Verdict("deny", "this exact call was already denied", "already-denied")
        else:
            decided = decide(tool, call.input, self.cfg.mode)
        verdict, human = decided, None
        if decided.decision == "ask":
            yes = ask_human(call, decided.reason)
            human = "approve" if yes else "deny"
            verdict = Verdict("allow", "a human said yes", "human") if yes else Verdict("deny", "a human said no", "human")
        if verdict.decision == "deny":
            self.denied.add(key)
        self.trace.event("permission", "permissions", tool=call.name, decision=decided.decision,
                         rule=decided.rule, reason=decided.reason, human=human, final=verdict.decision,
                         tool_use_id=call.id)
        return verdict


# ============ COMMAND LINE ============

def main():
    p = argparse.ArgumentParser(description="Rein: a small coding-agent harness")
    p.add_argument("task", help="what you want done, in plain words")
    p.add_argument("--fake", metavar="SCENARIO", help="use a scripted model from this JSON file")
    p.add_argument("--workspace", default="demo", help="the project folder the agent works in")
    p.add_argument("--mode", default="ask", choices=["ask", "auto"], help="auto: allow edits without asking")
    p.add_argument("--context-limit", type=int, default=20000, help="compact above this many tokens")
    args = p.parse_args()

    if args.fake:
        with open(args.fake) as f:
            scenario = json.load(f)
        model = FakeModel(scenario["replies"])
    else:
        model = ClaudeModel()

    cfg = Config(
        workspace=args.workspace,
        mode=args.mode,
        context_limit=args.context_limit,
    )
    trace = Tracer(cfg.trace_file, run=f"rein:{cfg.mode}:0")
    agent = Agent(model, cfg, trace)
    agent.run(args.task)
    show("trace", f"{trace.summary()} (details in {cfg.trace_file})")


if __name__ == "__main__":
    main()
