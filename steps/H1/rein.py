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

    messages = [{"role": "user", "content": args.task}]
    reply = model.call("You are a helpful assistant.", messages, [])
    show("you", args.task)
    show("model", reply.text)
    show("", f"stop_reason={reply.stop_reason} tokens_in={reply.usage['input_tokens']} "
             f"tokens_out={reply.usage['output_tokens']}")


if __name__ == "__main__":
    main()
