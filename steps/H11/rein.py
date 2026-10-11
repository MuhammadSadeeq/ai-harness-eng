"""Rein: a small coding-agent harness, built one step at a time.

Each section below is one system of the harness. Read it from top to bottom.
"""
import argparse
import difflib
import json
import os
import random
import re
import subprocess
import time
from dataclasses import dataclass, field
from pathlib import Path


def show(tag, text, indent=""):
    """Print one line of the live transcript: line breaks become spaces, and it is cut to fit."""
    print(f"{indent}{tag:<8} {' '.join(str(text).splitlines())}"[:100])


def one_line(text):
    """Join the lines of a tool result with ' | ' for the transcript. The model still gets all of it."""
    return " | ".join(line.strip() for line in str(text).splitlines() if line.strip())


# ============ CLOCK: time you can skip ============

class RealClock:
    """Real time: a retry really waits. Used when Rein talks to a real model."""

    def __init__(self):
        self.start = time.monotonic()

    def now(self):
        return time.monotonic() - self.start

    def sleep(self, seconds):
        time.sleep(seconds)


class VirtualClock:
    """Virtual time: sleep() only moves the clock forward, so a retry costs no waiting. Used under --fake."""

    def __init__(self):
        self.t = 0.0

    def now(self):
        return self.t

    def sleep(self, seconds):
        self.t += seconds


# ============ MODEL: one interface, two models ============

class TransientError(Exception):
    """A failure worth retrying. kind is one of the model_error types the trace records."""

    def __init__(self, kind, message="", retry_after_ms=0):
        super().__init__(message or kind)
        self.kind = kind
        self.retry_after_ms = retry_after_ms  # the provider's retry-after in ms; 0 when none was sent


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
        if "error" in step:  # a script can pretend the API failed
            if step.get("forever"):  # an outage that never ends
                self.replies.insert(0, step)
            raise TransientError(step["error"], retry_after_ms=step.get("retry_after_ms", 0))
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


# SDK errors worth another try, and the trace type each one is recorded as.
RETRYABLE = {"RateLimitError": "rate_limit", "APIConnectionError": "api_error",
             "InternalServerError": "api_error", "OverloadedError": "overloaded"}


def read_retry_after(error):
    """The retry-after header of the error's response, in milliseconds. A missing or non-numeric value is 0."""
    response = getattr(error, "response", None)
    headers = getattr(response, "headers", None)
    try:
        return max(0, int(float(headers.get("retry-after", 0)) * 1000))
    except (AttributeError, TypeError, ValueError, OverflowError):
        return 0


class ClaudeModel:
    """The real model, behind exactly the same interface."""

    def __init__(self, model=None):
        import anthropic
        self.client = anthropic.Anthropic(max_retries=0)  # reads your ANTHROPIC_API_KEY; the harness owns retries
        self.model = model or os.environ.get("REIN_MODEL", "claude-sonnet-5-5")  # facts: models.ids-current
        self.model_id = self.model

    def call(self, system, messages, tools):
        extra = {"tools": tools} if tools else {}
        try:
            r = self.client.messages.create(model=self.model, max_tokens=4096,
                                            system=system, messages=messages, **extra)
        except Exception as e:
            if type(e).__name__ not in RETRYABLE:
                raise  # a bug or a bad request: waiting will not help
            raise TransientError(RETRYABLE[type(e).__name__], str(e), read_retry_after(e)) from e
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
TESTS = re.compile(r"^(tests?/|test_)")  # "never touch the tests": a rule that holds in code

@dataclass
class Verdict:
    decision: str  # "allow", "ask", or "deny"
    reason: str    # the model reads this too, so say why
    rule: str = ""  # the policy rule that decided it, for the trace

def decide(tool, args, mode):
    """The policy. Deny rules are checked before allow rules."""
    if tool.read_only:
        return Verdict("allow", "read-only tool", "read-only")
    if mode == "read_only":
        return Verdict("deny", "this agent is read-only", "read-only-mode")
    if tool.name in ("edit_file", "write_file") and TESTS.match(args.get("path", "")):
        return Verdict("deny", "tests are off limits: this rule holds in code", "tests-off-limits")
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

def ascii_only(error):
    """The trace stores messages as printable ASCII, so a stray character from an SDK error cannot break it."""
    return "".join(ch if " " <= ch <= "~" else "?" for ch in str(error))

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

    def __init__(self, path, run, clock):
        self.path, self.run, self.clock = path, run, clock
        self.seq, self.turn, self.events = 0, 0, []
        self.agent = "main"  # the label of whoever is running: main, or reviewer#k while a reviewer runs
        Path(path).write_text("")  # a fresh trace file for every run

    def event(self, kind, wire, **fields):
        record = {"v": 1, "run": self.run, "seq": self.seq, "t": int(self.clock.now() * 1000),
                  "turn": self.turn, "agent": self.agent, "kind": kind, "wire": wire, **redact(fields)}
        self.seq += 1
        self.events.append(record)
        with open(self.path, "a") as f:
            f.write(json.dumps(record, sort_keys=True, separators=(",", ":")) + "\n")

    def summary(self):
        counts = {}
        for e in self.events:
            if e["kind"] not in ("run_start", "run_end", "model_reply", "subagent_start"):  # a reply is counted by its model_call
                kind = "subagent" if e["kind"] == "subagent_end" else e["kind"]  # one count per sub-agent
                counts[kind] = counts.get(kind, 0) + 1
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


# ============ RECOVERY: counted, limited, able to give up ============

def with_retries(call, clock, rng, on_retry, attempts=3, base=0.5, cap=8.0):
    """Try again after a transient failure, waiting longer each time, with jitter."""
    for attempt in range(1, attempts + 1):
        try:
            return call()
        except TransientError as e:
            if attempt == attempts:
                raise  # out of attempts: the caller decides
            delay = min(cap, base * 2 ** (attempt - 1))  # 0.5s, 1s, 2s, 4s... never above cap
            wait = delay * rng.uniform(0.5, 1.0)  # jitter: clients that failed together do not retry together
            wait = max(wait, e.retry_after_ms / 1000)  # never sooner than the provider asks (retry-after)
            on_retry(attempt, delay, wait, e)
            clock.sleep(wait)


class CircuitBreaker:
    """After `threshold` failed calls in a row, stop trying and say so clearly."""

    def __init__(self, threshold=3):
        self.threshold, self.failures = threshold, 0

    def record(self, ok):
        self.failures = 0 if ok else self.failures + 1

    @property
    def is_open(self):
        return self.failures >= self.threshold


# ============ GUARDS: a run ends for a reason ============

class LoopDetector:
    """Notices the exact same tool call, made several times in a row."""

    def __init__(self, limit=3):
        self.limit, self.last, self.count = limit, None, 0

    def repeated(self, call):
        key = call.name + json.dumps(call.input, sort_keys=True)
        self.count = self.count + 1 if key == self.last else 1
        self.last = key
        return self.count >= self.limit


def close_open_calls(messages):
    """After an interrupt, every tool request still needs a result, or the history is broken."""
    last = messages[-1]
    if last["role"] == "assistant":
        ids = [b["id"] for b in last["content"] if b.get("type") == "tool_use"]
        if ids:
            messages.append({"role": "user", "content": [
                {"type": "tool_result", "tool_use_id": i, "content": "Interrupted before it ran.",
                 "is_error": True} for i in ids]})


# ============ THE LOOP ============

SYSTEM_PROMPT = ("You are Rein, a careful coding agent working inside one project folder. "
                 "Look before you change anything, and run the tests to prove your work.")

BASE_PROMPT = """You are Rein, a careful coding agent working inside one project folder.
Rules, most important first:
1. Stay inside the project folder. Use relative paths.
2. Look before you change anything. Make the smallest change that solves the task.
3. Never say something works unless you ran a check that proves it.
4. If a tool call is denied, do not repeat it. Find another way, or explain what you need."""

def build_system_prompt(workspace):
    """Build the prompt from layers. When two layers disagree, the earlier one wins."""
    layers = [BASE_PROMPT]
    rules = Path(workspace) / "AGENTS.md"
    if rules.is_file():
        layers.append("Project rules from AGENTS.md (follow them unless they break a rule above):\n"
                      + rules.read_text())
    return "\n\n".join(layers)


REVIEWER_PROMPT = """You are an independent reviewer. You did NOT write this change.
Read the files and decide whether the task is truly solved for every input, not only for the tests.
You cannot change anything. Start your answer with exactly VERDICT: PASS or VERDICT: FAIL."""


@dataclass
class Config:
    max_turns: int = 10  # hard stop: the most model calls one run may use
    workspace: str = "demo"  # the only folder the agent may touch
    tool_output_chars: int = 2000  # cap on each tool result that enters the context
    mode: str = "ask"        # "ask": edits need a human yes. "auto": edits are allowed
    trace_file: str = "trace.jsonl"  # every event of the run is recorded here
    context_limit: int = 20000       # estimated tokens before old history is compacted
    token_budget: int = 200000       # hard stop: the most tokens one run may spend
    max_seconds: int | None = None   # the time limit for one run, in seconds on the clock; None is off
    check: str = ""                  # a command that proves the work, like "python test_calc.py"
    max_fix_rounds: int = 2          # how many times the gate may send work back
    review: bool = False             # also ask an independent reviewer (a sub-agent, read-only) after the check passes


def snapshot(root):
    """The text of every project file, so the reviewer can be shown what changed."""
    files = {}
    for path in sorted(Path(root).rglob("*")):
        if path.is_file() and "__pycache__" not in path.parts:
            files[path.relative_to(root).as_posix()] = path.read_text(errors="replace")
    return files


def diff_of(before, after):
    """A unified diff of every file that changed. The reviewer judges this, not the author's story about it."""
    lines = []
    for name in sorted(set(before) | set(after)):
        if before.get(name) != after.get(name):
            lines += difflib.unified_diff((before.get(name) or "").splitlines(), (after.get(name) or "").splitlines(),
                                          f"a/{name}", f"b/{name}", lineterm="")
    return "\n".join(lines) or "(no change)"


def ascii_text(text):
    """Printable ASCII with line breaks kept, for the trace fields that hold text."""
    return "".join(ch if (" " <= ch <= "~") or ch in "\n\t" else "?" for ch in str(text))


class Agent:
    def __init__(self, model, cfg, trace, clock, rng, name="main", system=None, reviewer_model=None):
        self.model, self.cfg, self.trace = model, cfg, trace
        self.clock, self.rng = clock, rng  # virtual under --fake: a retry costs no real time
        self.name = name  # main, or reviewer for a sub-agent
        self.reviewer_model = reviewer_model or model  # the model a reviewer runs on
        self.reviews = 0  # how many reviewers this run has started
        self.before = {}  # the project as it was when the run started
        self.breaker = CircuitBreaker()
        self.attempt = 1
        self.loops = LoopDetector()  # counts the same call in a row
        self.tools = make_tools(Workspace(cfg.workspace))
        self.system = system or build_system_prompt(cfg.workspace)  # built once per run: stable, so it caches well
        self.specs = [t.spec() for t in self.tools.values()]
        self.denied = set()  # once denied, always denied
        self.turns, self.tokens_in, self.tokens_out, self.cost = 0, 0, 0, 0

    def say(self, tag, text):
        show(tag, text, "" if self.name == "main" else "    ")

    def finish(self, status, note, answer=""):
        """Every way a run can end goes through here, so none of them gets forgotten."""
        self.say(status, note)
        ended = status  # every ending now names its schema status
        self.status = ended
        if self.name == "main":  # a sub-agent ends with its subagent_end line, written by its parent
            self.trace.event("run_end", "loop", status=ended, passed=False, turns=self.turns,
                             tokens={"input": self.tokens_in, "output": self.tokens_out}, cost=self.cost)
        return answer

    def guard_stop(self, guard, limit, value, note):
        """A guard ends the run: it records which guard fired, and the run ends with that guard's own status."""
        self.trace.event("guard", "loop", guard=guard, limit=limit, value=value)
        return self.finish(guard, note)

    def on_retry(self, attempt, delay, wait, error):
        self.attempt = attempt + 1  # the next try is the one after this
        if error.retry_after_ms > 0 and error.retry_after_ms / 1000 >= wait:  # retry-after set the wait
            text = f"attempt {attempt} failed ({error}); retry-after asks for {error.retry_after_ms / 1000:.1f}s, waiting that long"
        else:
            text = f"attempt {attempt} failed ({error}); waiting up to {delay:.1f}s"
        self.say("retry", text)
        self.trace.event("retry_wait", "errors", attempt=attempt, wait_ms=int(wait * 1000))

    def run(self, task):
        messages = [{"role": "user", "content": task}]
        try:
            return self.loop(task, messages)
        except KeyboardInterrupt:  # Ctrl+C: stop cleanly and leave a valid history behind
            pending = [b["id"] for b in messages[-1]["content"] if b.get("type") == "tool_use"] \
                if messages[-1]["role"] == "assistant" else []
            self.trace.event("interrupt", "loop", by="human", pending=pending)
            close_open_calls(messages)
            return self.finish("interrupted", f"interrupted; history left valid ({len(messages)} messages)")

    def loop(self, task, messages):
        self.started = self.clock.now()  # the time guard counts from here
        self.before = snapshot(self.cfg.workspace)  # the change is shown against this
        self.say("task", task)
        if self.name == "main":
            self.trace.event("run_start", "loop", task=task, board=self.cfg.mode, seed=0, model_id=self.model.model_id)
        fix_rounds = 0  # how many times the gate has sent the work back
        for turn in range(1, self.cfg.max_turns + 1):
            self.trace.turn = turn
            spent = self.tokens_in + self.tokens_out
            if spent >= self.cfg.token_budget:
                return self.guard_stop("budget", self.cfg.token_budget, spent,
                                       f"token budget spent ({spent} of {self.cfg.token_budget})")
            elapsed = self.clock.now() - self.started
            if self.cfg.max_seconds is not None and elapsed >= self.cfg.max_seconds:
                return self.guard_stop("max_time", self.cfg.max_seconds, int(elapsed),
                                       f"time limit reached: {elapsed:.1f} seconds spent, the limit is {self.cfg.max_seconds}")
            size = estimate_tokens(messages)
            smaller = compact(messages, task) if size > self.cfg.context_limit else None
            if smaller:
                dropped = len(messages) - len(smaller) + 1  # the summary replaces the messages it covers
                messages[:] = smaller  # change the list in place, so every holder sees it
                after = estimate_tokens(messages)
                self.say("compact", f"~{size} tokens is over the limit ({self.cfg.context_limit}); now ~{after}")
                self.trace.event("compaction", "context", tokens_before=size, tokens_after=after,
                                 dropped_messages=dropped, kept_notes=[task])
            self.attempt = 1  # the first try; on_retry counts the ones after it
            try:
                reply = with_retries(lambda: self.model.call(self.system, messages, self.specs),
                                     self.clock, self.rng, on_retry=self.on_retry)
            except TransientError as e:
                self.breaker.record(ok=False)
                self.say("error", f"model call failed ({e}); breaker at "
                                  f"{self.breaker.failures} of {self.breaker.threshold}")
                self.trace.event("model_error", "errors", type=e.kind, attempt=self.attempt,
                                 retry_after_ms=e.retry_after_ms, message=ascii_only(e))
                if self.breaker.is_open:
                    self.trace.event("breaker", "errors", state="open", failures=self.breaker.failures)
                    return self.finish("circuit_open", "the model API keeps failing; the circuit breaker is open")
                continue
            self.breaker.record(ok=True)
            cost = cost_nano(self.model.model_id, reply.usage)
            self.turns += 1
            self.tokens_in += reply.usage["input_tokens"]
            self.tokens_out += reply.usage["output_tokens"]
            self.cost += cost
            self.trace.event("model_call", "loop", attempt=self.attempt, tokens_in=reply.usage["input_tokens"])
            self.trace.event("model_reply", "loop", stop_reason=reply.stop_reason, text=reply.text,
                             tool_uses=[{"id": c.id, "name": c.name, "input": c.input} for c in reply.tool_calls],
                             usage=reply.usage, cost=cost)
            messages.append({"role": "assistant", "content": reply.content})
            self.say(f"turn {turn}", f"model: {reply.text}" if reply.text else "model asks for tools")
            if reply.stop_reason == "max_tokens" and not reply.tool_calls:
                self.say("cut", "the reply was cut off; asking the model to continue")
                messages.append({"role": "user", "content": "You were cut off. Continue exactly where you stopped."})
                continue
            if not reply.tool_calls:  # the model says it is done. That is a claim: check it.
                passed, report = self.verify(task)
                if passed:
                    return self.finish("done", f"after {turn} model calls", reply.text)
                if fix_rounds == self.cfg.max_fix_rounds:
                    return self.finish("unverified", f"still failing after {fix_rounds} fix rounds", reply.text)
                fix_rounds += 1
                self.say("check", f"not done: {one_line(report)}")
                messages.append({"role": "user", "content": "The harness checked your work and it is not done "
                                 f"yet:\n{report}\nFix the problem, and check it yourself before you finish."})
                continue
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
            if self.loops.count > self.loops.limit:  # the model repeated the call after the redirect
                return self.guard_stop("loop", self.loops.limit, self.loops.count,
                                       f"the model repeated the same call {self.loops.count} times; the run is stuck")
        return self.guard_stop("max_turns", self.cfg.max_turns, self.cfg.max_turns,
                               f"turn limit reached ({self.cfg.max_turns} model calls)")

    def run_tool(self, call):
        """Run one tool call. Any error becomes a message for the model, never a crash."""
        tool = self.tools.get(call.name)
        if tool is None:
            output, is_error = f"Unknown tool '{call.name}'. Available tools: {', '.join(self.tools)}.", True
        elif self.loops.repeated(call):  # the same call again and again: answer it, do not run it
            output, is_error = f"You made this exact call {self.loops.limit} times in a row. It is not helping. Try something else.", True
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


    def verify(self, task):
        """'Done' is a claim. Run the check through run_command's own path and see for ourselves."""
        if not self.cfg.check:
            return True, "ok"
        try:
            output = self.tools["run_command"].run(command=self.cfg.check)
        except ToolError as e:
            output = str(e)
        passed = output.startswith("exit code 0")  # the exit code decides: 0 passes, anything else fails
        self.trace.event("verify", "verify", check="tests", passed=passed, output=ascii_only(output))
        if not passed:
            return False, output
        self.say("check", f"passed: {self.cfg.check}")
        if self.cfg.review:
            return self.review(task, output)
        return True, "ok"

    def review(self, task, check_output):
        """A reviewer sub-agent: fresh history, read-only powers, its own turn limit. Only its verdict comes back."""
        self.reviews += 1
        k = self.reviews
        self.say("review", "starting an independent reviewer (fresh context, read-only)")
        brief = (f"Task: {task}\n"
                 f"The diff of the change:\n{diff_of(self.before, snapshot(self.cfg.workspace))}\n"
                 f"The check output: {check_output}\n"
                 "Answer with VERDICT: PASS or VERDICT: FAIL.")
        self.trace.event("subagent_start", "loop", name="reviewer", k=k, context="isolated", brief=ascii_text(brief))
        cfg = Config(workspace=self.cfg.workspace, mode="read_only", max_turns=6)
        reviewer = Agent(self.reviewer_model, cfg, self.trace, self.clock, self.rng, name="reviewer",
                         system=REVIEWER_PROMPT, reviewer_model=self.reviewer_model)
        saved_turn, saved_agent = self.trace.turn, self.trace.agent
        self.trace.agent = f"reviewer#{k}"  # the reviewer's own lines carry its label
        answer = reviewer.run(brief)
        self.trace.turn, self.trace.agent = saved_turn, saved_agent
        self.trace.event("subagent_end", "loop", name="reviewer", k=k, status=reviewer.status, turns=reviewer.turns,
                         tokens={"input": reviewer.tokens_in, "output": reviewer.tokens_out}, cost=reviewer.cost,
                         output=ascii_text(answer))
        passed = answer.lstrip().startswith("VERDICT: PASS")
        self.say("review", f"verdict: {'PASS' if passed else 'FAIL'}")
        return passed, answer

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
    p.add_argument("task", nargs="?", help="what you want done, in plain words")
    p.add_argument("--fake", metavar="SCENARIO", help="use a scripted model from this JSON file")
    p.add_argument("--workspace", default="demo", help="the project folder the agent works in")
    p.add_argument("--mode", default="ask", choices=["ask", "auto"], help="auto: allow edits without asking")
    p.add_argument("--context-limit", type=int, default=20000, help="compact above this many tokens")
    p.add_argument("--budget", type=int, default=200000, help="stop after spending this many tokens")
    p.add_argument("--max-seconds", type=int, default=None, help="stop when the run has taken this many seconds; off by default")
    p.add_argument("--check", default="", help='a command that proves the work, e.g. "python test_calc.py"')
    p.add_argument("--show-prompt", action="store_true", help="print the system prompt and stop")
    p.add_argument("--review", action="store_true", help="also ask an independent reviewer sub-agent")
    args = p.parse_args()
    if args.show_prompt:
        print(build_system_prompt(args.workspace))
        return
    if not args.task:
        p.error("tell Rein what to do, in quotes")

    reviewer_model = None
    if args.fake:
        with open(args.fake) as f:
            scenario = json.load(f)
        model = FakeModel(scenario["replies"])
        reviewer_model = FakeModel(scenario.get("reviewer", []))  # the reviewer has its own script
        clock, rng = VirtualClock(), random.Random(0)  # no waiting, and the same jitter every run
    else:
        model = ClaudeModel()
        clock, rng = RealClock(), random.Random()

    cfg = Config(
        workspace=args.workspace,
        mode=args.mode,
        context_limit=args.context_limit,
        token_budget=args.budget,
        max_seconds=args.max_seconds,
        check=args.check,
        review=args.review,
    )
    trace = Tracer(cfg.trace_file, run=f"rein:{cfg.mode}:0", clock=clock)
    agent = Agent(model, cfg, trace, clock, rng, reviewer_model=reviewer_model)
    agent.run(args.task)
    print(f"{'trace':<8} {trace.summary()} (details in {cfg.trace_file})")  # not cut: a sub-agent makes it long


if __name__ == "__main__":
    main()
