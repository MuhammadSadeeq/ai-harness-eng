"""Rein: a small coding-agent harness, built one step at a time.

Each section below is one system of the harness. Read it from top to bottom.
"""
import argparse
import json
import os
from dataclasses import dataclass, field


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

def read_file(path):
    with open(path) as f:
        return f.read()


FUNCTIONS = {"read_file": read_file}  # tool name -> the Python function that runs it

TOOL_SPECS = [{                        # what the model reads about each tool
    "name": "read_file",
    "description": "Read a text file and return what is in it.",
    "input_schema": {"type": "object",
                     "properties": {"path": {"type": "string", "description": "the file's path"}},
                     "required": ["path"]},
}]


# ============ THE LOOP ============

SYSTEM_PROMPT = "You are Rein, a careful coding agent. Look at the files before you answer."


@dataclass
class Config:
    max_turns: int = 10  # hard stop: the most model calls one run may use


class Agent:
    def __init__(self, model, cfg):
        self.model, self.cfg = model, cfg

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
            reply = self.model.call(SYSTEM_PROMPT, messages, TOOL_SPECS)
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
        try:
            return FUNCTIONS[call.name](**call.input), False
        except Exception as e:
            return f"{type(e).__name__}: {e}", True


# ============ COMMAND LINE ============

def main():
    p = argparse.ArgumentParser(description="Rein: a small coding-agent harness")
    p.add_argument("task", help="what you want done, in plain words")
    p.add_argument("--fake", metavar="SCENARIO", help="use a scripted model from this JSON file")
    args = p.parse_args()

    if args.fake:
        with open(args.fake) as f:
            scenario = json.load(f)
        model = FakeModel(scenario["replies"])
    else:
        model = ClaudeModel()

    Agent(model, Config()).run(args.task)


if __name__ == "__main__":
    main()
