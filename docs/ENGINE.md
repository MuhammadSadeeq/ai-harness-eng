# HARNESSED: engine spec (simulator and reference harness)

Status: v1 + amendments A1–A2 (Phase 1). Director-owned. Two implementations follow this file
exactly: the **JS simulator** (`site/assets/sim/`, runs in the browser and in
Node) and the **Python reference harness** (`rein/src/rein/`). For every tape,
board and seed they must produce **identical traces** (`check_scenarios.py`
compares them event by event, field by field). When the two disagree, this
file decides which one is wrong; when this file is silent, the builder stops
and asks.

---

## 1. Determinism rules (why every number is an integer)

1. **Integers only** in tapes, boards, events and payloads. Time is integer
   **milliseconds** (`t`), cost is integer **nano-units** (`cost`, see §8),
   probabilities are integer **percent** (0–100), tokens are integers.
2. **ASCII only** in tapes and boards (every string matches
   `^[\x20-\x7E\n\t]*$`), so string length and slicing agree between JS
   (UTF-16) and Python (code points). Friendly, translated or typographic
   text lives in the course pages, never in tapes.
3. **No numeric-string object keys** (`"12": …`) anywhere: JS reorders them.
4. **One PRNG per trial** (D-029), drawn in a fixed order (§3).
5. **Canonical JSON** `pyjson(x)` is exactly Python's `json.dumps(x)` with its
   defaults (`ensure_ascii=True`, separators `", "` and `": "`, insertion key
   order). JS implements it by hand (§2). It is used for token estimates; trace
   files are written with sorted keys and compact separators (§10).

## 2. Canonical JSON in JS (`pyjson`)

- `null`, `true`, `false` as is. Integers: `String(n)` (floats are rejected
  with an error). Strings: `JSON.stringify(s)` then replace every code unit
  above `0x7E` with `\u` + 4 lowercase hex digits (the schema keeps tapes
  ASCII, so this only matters for robustness). Arrays: `"[" + items.join(", ") + "]"`
  (`"[]"` when empty). Objects: `"{" + entries.map(([k, v]) => pyjson(k) + ": " + pyjson(v)).join(", ") + "}"`
  in insertion order (`"{}"` when empty).
- Unit test both sides against the same 20 fixtures (nested, empty, escapes,
  quotes, newlines, tabs, backslashes).

## 3. PRNG: mulberry32

State is one unsigned 32-bit integer, seeded with the trial seed
(`seed >>> 0`). `next()` returns an unsigned 32-bit integer:

```text
JS:     a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return (t ^ (t >>> 14)) >>> 0;

Python: a = (a + 0x6D2B79F5) & 0xFFFFFFFF
        t = a
        t = imul(t ^ (t >> 15), t | 1)
        t ^= (t + imul(t ^ (t >> 7), t | 61)) & 0xFFFFFFFF
        return (t ^ (t >> 14)) & 0xFFFFFFFF
        # imul(x, y) = (x * y) & 0xFFFFFFFF, all values kept in 0..2^32-1
```

Helpers: `percent() = next() % 100` (0–99); `below(n) = next() % n` (n ≥ 1).
Both sides unit-test the first 1,000 outputs for seeds 0, 1 and 20261010
against one shared fixture file (`scenarios/fixtures/prng.json`).

**Draw order** (the only places randomness is used), in the order they occur
during a run: (1) a `fault` check before each model call (§6.3), (2) a
`branch` choice when the script cursor reaches one, (3) retry jitter when a
retry wait is computed, (4) a simulated human's choice on an `ask`. Nothing
else may call the PRNG.

## 4. Tokens and time

- `tokens(x) = floor(len(pyjson(x)) / 4)` (the book's rule, D-039).
- Prompt tokens for a model call: `tokens({"system": system, "tools": tool_defs, "messages": messages})`.
- Reply output tokens: `tokens(content)` where `content` is the reply's block list.
- Time (`t`, ms) starts at 0 and only advances by these amounts:
  - model call: `latency_ms` of the step if given, else `600 + 20 * output_tokens`;
  - model error: `error_ms` of the error step if given, else `300`;
  - retry wait: the computed wait (§7.3);
  - tool call: the tool's `latency_ms` (tape) or the default (§6.4).

## 5. Tape format (`scenarios/<id>.json`)

```json
{
  "id": "b2-spiral",
  "schema": 1,
  "title": "The almost-done spiral",
  "task": "Fix the failing test in calc.py",
  "model_id": "claude-sonnet-5-5",
  "pricing": {"fact": "models.sonnet-5-5-price"},
  "window": 8000,
  "system": "You are a coding agent. Use the tools to change files and run tests.",
  "rules": [],
  "workspace": {"calc.py": "def add(a, b):\n    return a - b\n\ndef total(xs):\n    return sum(xs) + 1\n"},
  "outside": {"../secrets.env": "API_KEY=sk-test-planted"},
  "tools": ["read_file", "edit_file", "run_command"],
  "custom_tools": [],
  "checks": [{"file": "calc.py", "contains": "a + b"}, {"file": "calc.py", "not_contains": "+ 1"}],
  "test_output": {"pass": "4 passed", "fail": "1 failed, 3 passed: test_total expected 6"},
  "script": [ ... steps, §6 ... ],
  "human": {"default": "approve"},
  "interrupt": null,
  "boards": ["b2-old", "b2-new"],
  "golden_seeds": [1, 2, 3],
  "seed_base": 20261010,
  "incident": {"family": "almost-done-spiral", "first_bad_seq": 30, "wire": "loop"}
}
```

- `pricing` is either `{"fact": "<id>"}` (resolved by the runner from the
  facts registry: Python from `facts/models.yaml`, JS from
  `site/data/facts.json`) or inline integers
  `{"input_milli_per_mtok": 3000, "output_milli_per_mtok": 15000}`.
  A fact value in USD per MTok `p` becomes `round(p * 1000)` milli-units.
- `workspace` paths are relative to the workspace root; `outside` holds files
  that a path escape can reach (planted secrets for sandbox lessons). A value
  may be `{"link": "<target path>"}` to make a symlink.
- `tools` lists built-in tools (§6.4); `custom_tools` defines scripted tools:
  `{"name", "description", "input_schema", "latency_ms", "results": [{"match": {<field>: <value>}, "output": "...", "ok": true}], "default": {"output": "...", "ok": false}}`
  and an optional `"effect": "network"` (used by egress rules).
- `rules` are project-rule lines added to the system prompt as a layer.
- `human`: the simulated approver for `ask` decisions:
  `{"default": "approve" | "deny"}` or
  `{"default": "approve", "fatigue": {"after": 10, "approve_percent": 90}}`
  (after N asks, approve with that probability, drawn from the PRNG).
- `interrupt`: `null` or `{"turn": 5, "resume": true}` (§7.6).
- Optional `faults`: `[{"percent": 20, "type": "overloaded"}]` and optional
  `outage`: `{"from_ms": 0, "to_ms": 30000, "type": "overloaded", "retry_after_ms": 0}` (§6.3).

## 6. The scripted model

### 6.1 Script steps
The script is a list; a cursor walks it. Each model call consumes steps until
it produces one reply or one error:

| Step | Meaning |
|---|---|
| `{"say": "...", "tools": [["name", {input}], ...], "stop": "end_turn"}` | a reply; `stop` defaults to `tool_use` if `tools` is non-empty, else `end_turn`; `say` may be omitted |
| `{"error": "overloaded" \| "rate_limit" \| "api_error" \| "timeout" \| "invalid_request", "retry_after_ms": 2000, "error_ms": 300}` | this call fails |
| `{"branch": [{"percent": 70, "then": [steps]}, {"percent": 30, "then": [steps]}]}` | draw `percent()`; pick the first option whose cumulative percent exceeds the draw; its steps replace the branch in the cursor's queue. Percents must sum to 100. |
| `{"when": [{"if": "<condition>", "then": [steps]}, {"else": [steps]}]}` | pick the first true condition (else the `else` steps); splice in like a branch |
| `{"repeat": {"steps": [steps], "times": 3}}` / `"times": "forever"` | splice the steps in that many times; `forever` re-splices whenever reached |

Conditions (evaluated on the harness state just before the call):
`last_result_error` (any `tool_result` in the last user message has
`is_error: true`), `last_denied` (the last permission decision was `deny`),
`verify_feedback` (the last user message is verification feedback),
`last_truncated` (the last tool output was truncated), `turn_gte:<n>`.

When the script runs out, the model replies `{"say": "(the script has run out)"}`
with `stop: end_turn`.

### 6.2 Reply blocks
A reply's `content` is: a `text` block `{"type": "text", "text": say}` if
`say` is present, then one `tool_use` block per tool:
`{"type": "tool_use", "id": "toolu_<turn>_<k>", "name": name, "input": input}`
(`k` from 1 within the reply). `usage = {"input_tokens": prompt_tokens, "output_tokens": tokens(content)}`.

### 6.3 Faults and outages
Before each model call, in this order: if an `outage` window contains `t`,
the call fails with the outage's type (no PRNG draw); otherwise, for each
`fault` in order, draw `percent()` and fail if it is below `percent`. A failed
call does **not** consume a script step. Script `error` steps fail the call
and are consumed.

### 6.4 Built-in tools (virtual workspace)
| Tool | Input | Result | Default latency |
|---|---|---|---|
| `read_file` | `{"path"}` | file text; error `No file at '<path>'. Call list_files to see what exists.` | 100 ms |
| `write_file` | `{"path", "content"}` | `Wrote <path> (<n> chars)` | 100 ms |
| `edit_file` | `{"path", "old_text", "new_text"}` | `Edited <path> (1 change)`; errors: not found (`old_text was not found in <path>. Read the file again.`), not unique (`old_text appears <n> times in <path>; include more context.`) | 100 ms |
| `list_files` | `{}` | workspace paths, sorted, one per line | 100 ms |
| `run_command` | `{"cmd"}` | `pytest` or `pytest -q`: `test_output.pass` if every check holds, else `test_output.fail` (`ok` is false on fail); `ls`: like `list_files`; `cat <path>`: like `read_file`; anything else: error `command not found: <first word>` | 2000 ms |

Tool definitions sent to the model (`tool_defs`, for prompt tokens and the
Wire View) are fixed in `site/assets/sim/tooldefs.json` and its byte-identical
copy `rein/src/rein/tooldefs.json` (name, description, input_schema), plus each
custom tool's definition, in the order listed in the tape.

## 7. The board (`scenarios/boards/<id>.json`)

```json
{"id": "b2-new", "label": "New board",
 "modules": {"turn_limit": {"max_turns": 12}, "token_budget": {"max_tokens": 60000}}}
```

Modules (any subset; absent = not plugged):

| Module | Params | Effect |
|---|---|---|
| `turn_limit` | `max_turns` | guard before a turn |
| `token_budget` | `max_tokens` | guard before a turn on `tokens_in + tokens_out` so far |
| `loop_detect` | `window` (≥ 2) | guard: the last `window` tool calls are identical (name + pyjson(input)) |
| `output_cap` | `max_tokens` | caps each tool output (§7.4) |
| `retry` | `max_attempts`, `base_ms`, `cap_ms`, `jitter` (`none`/`full`) | retries transient errors (§7.3) |
| `breaker` | `threshold` | consecutive failed calls ≥ threshold opens it; the run ends `circuit_open` |
| `permissions` | `mode` (`allow`/`ask`/`deny`), `rules` | decision per tool call (§7.5) |
| `sandbox` | `egress` (list of hosts) | confines paths to the workspace, resolves links, checks egress |
| `verify_gate` | `max_feedback` | checks the work on a done claim (§7.2) |
| `close_books` | `{}` | on interrupt, answers pending tool calls (§7.6) |
| `rules_file` | `{}` | adds the tape's `rules` as a layer |
| `redact` | `patterns` (literal substrings) | replaces them with `[REDACTED]` in events |

## 7.1 The run (reference algorithm)

The harness keeps one state: `messages`, `turn`, `t`, `tokens_in`,
`tokens_out`, `cost`, `consecutive_failures`, `feedback_count`,
`last_permission`, `recent_calls`, `asks`. Events are appended with
`emit(kind, **fields)` (§9). Pseudocode (Python-flavored; JS mirrors it):

```text
emit run_start(task, board, seed, model_id)
messages = [user(text(task))]
loop:
  # ---- loop wire: guards (before a new turn)
  if turn_limit and turn >= max_turns:          emit guard(guard="max_turns", limit=max_turns, value=turn); end("max_turns")
  if token_budget and tokens_in+tokens_out >= max_tokens: emit guard(guard="budget", limit=max_tokens, value=tokens_in+tokens_out); end("budget")
  if loop_detect and last `window` tool calls identical: emit guard(guard="loop", limit=window, value=window); end("loop")
  if turn >= 60: emit interrupt(by="operator", pending=[]); end("interrupted")     # safety stop (§11)
  turn += 1

  # ---- control wire
  layers = ["system"] + (["rules"] if rules_file and tape.rules else []) + ["tools", "history"]
  system = tape.system + ("\n\nProject rules:\n- " + "\n- ".join(tape.rules) if rules_file and tape.rules else "")
  request = {"system": system, "tools": tool_defs, "messages": messages}
  prompt_tokens = tokens(request)
  emit prompt_built(layers=layers, tokens=prompt_tokens)

  # ---- context wire
  over = prompt_tokens > tape.window
  emit context_check(tokens=prompt_tokens, window=tape.window, percent=floor(100*prompt_tokens/tape.window),
                     action=("overflow" if over else "none"))
  if over:                                          # the request can't be sent (amendment A1)
    emit model_call(attempt=1, tokens_in=prompt_tokens)
    t += 300
    emit model_error(type="invalid_request", attempt=1, retry_after_ms=0,
                     message="prompt is too long: " + str(prompt_tokens) + " tokens > " + str(tape.window) + " maximum")
    end("error")

  # ---- loop + errors wires: the call, with recovery
  attempt = 0
  repeat:
    attempt += 1
    emit model_call(attempt=attempt, tokens_in=prompt_tokens)
    outcome = model.call(state)                    # §6: outage, faults, script
    if outcome is an error:
      t += error_ms
      consecutive_failures += 1
      emit model_error(type=..., attempt=attempt, retry_after_ms=...)
      if breaker and consecutive_failures >= threshold:
        emit breaker(state="open", failures=consecutive_failures); end("circuit_open")
      if retry and attempt < max_attempts and type in TRANSIENT:
        wait = backoff(attempt)                    # §7.3, may draw jitter
        emit retry_wait(attempt=attempt, wait_ms=wait); t += wait; continue
      end("error")
    consecutive_failures = 0
    break
  emit recovery_check(attempts=attempt, breaker=("closed" if breaker else "none"))

  reply = outcome.reply
  t += reply_latency
  tokens_in += prompt_tokens; tokens_out += reply.output_tokens
  cost += prompt_tokens*input_milli + reply.output_tokens*output_milli      # nano-units, §8
  messages.append(assistant(reply.content))
  emit model_reply(stop_reason=..., text=say_or_empty, tool_uses=[{"id","name","input"}...],
                   usage={"input_tokens","output_tokens"}, cost=cost)

  if interrupt and interrupt.turn == turn and reply has tool_uses: handle_interrupt()   # §7.6

  if stop_reason == "tool_use":
    results = []
    for call in reply.tool_uses (in order):
      decision, rule, reason = policy(call)                                   # §7.5
      human = null
      if decision == "ask": human = simulated_human(); final = human          # draws only on fatigue
      else: final = decision
      emit permission(tool=call.name, decision=decision, rule=rule, reason=reason, human=human, final=final, tool_use_id=call.id)
      last_permission = final
      if final == "deny":
        results.append(tool_result(call.id, "Denied: " + reason, is_error=true)); continue
      if sandbox: allowed, why = sandbox_check(call)                           # paths, links, egress
        emit sandbox(tool=call.name, allowed=allowed, reason=why, tool_use_id=call.id)
        if not allowed: results.append(tool_result(call.id, "Blocked by the sandbox: " + why, is_error=true)); continue
      ok, output = run_tool(call)                                              # §6.4, workspace changes
      shown, truncated = cap(output)                                           # §7.4
      t += tool_latency
      emit tool_call(tool=call.name, input=call.input, ok=ok, output=shown, output_tokens=tokens(shown),
                     truncated=truncated, tool_use_id=call.id)
      recent_calls.append(call.name + " " + pyjson(call.input))
      results.append(tool_result(call.id, shown, is_error=not ok))
    messages.append(user(results))                                             # ALL results in ONE message
    emit trace_write(events=<events since the previous trace_write>, redacted=<count>)
    continue

  if stop_reason == "end_turn":
    if verify_gate:
      passed = checks_hold(workspace)
      emit verify(check="tests", passed=passed, output=(test_output.pass if passed else test_output.fail))
      if passed: end("done")
      if feedback_count < max_feedback:
        feedback_count += 1
        messages.append(user(text("Verification failed: " + test_output.fail + " Fix it, then say done.")))
        emit trace_write(...); continue
      end("unverified")
    end("done")                                       # a done CLAIM; ground truth is in run_end.passed

  if stop_reason == "max_tokens": end("max_tokens_reply")
  if stop_reason == "refusal":    end("refused")
  end("error")

end(status): emit trace_write(...) if any events since the last one;
             emit run_end(status=status, passed=checks_hold(workspace), turns=turn,
                          tokens={"input": tokens_in, "output": tokens_out}, cost=cost)
```

Notes: every event's `turn` is the value of `turn` when it is emitted (so
`run_start` and guards before the first call carry 0, and a guard carries the
turn that just finished). `text` is `""` when the step has no `say`. `human`
is `null` unless the decision was `ask`. `trace_write.events` counts the events
emitted since the previous `trace_write` (not counting itself).
`model_error.message` is fixed per type: overloaded `Overloaded`, rate_limit
`Rate limited`, api_error `Internal server error`, timeout `Request timed out`,
invalid_request as given in §7.6. `tool_result(id, content, is_error)` is
`{"type": "tool_result", "tool_use_id": id, "content": content, "is_error": is_error}`
(`is_error` is always present). `user(x)` is `{"role": "user", "content": [x...]}`
(content is always a block list); `text(s)` is `{"type": "text", "text": s}`.

### 7.2 Done is a claim
`run_end.passed` is ground truth (the tape's checks on the final workspace);
`status` is what the harness concluded. `status: done` with `passed: false`
is a **false done**.

### 7.3 Backoff
`TRANSIENT = {overloaded, rate_limit, api_error, timeout}`; `invalid_request`
is permanent. `base = min(cap_ms, base_ms * 2^(attempt-1))`; with
`jitter: full`, `wait = below(base + 1)`; with `none`, `wait = base`; then
`wait = max(wait, retry_after_ms)` if the error carried one.

### 7.4 Output cap
If `tokens(output) > max_tokens`: keep the first `2 * max_tokens` characters
and the last `2 * max_tokens` characters, joined by
`"\n[... <n> characters cut; ask for a smaller range ...]\n"` where `n` is the
number removed; `truncated = true`.

### 7.5 Permissions
Without the module every call is `allow` (rule `"none"`, reason `"no permission policy"`).
With it, rules are checked in **decision order: all `deny` rules, then `ask`,
then `allow`**, first match wins; otherwise the mode's default
(rule `"default"`). A rule: `{"decision", "tool", "match": {<field>: <glob>}, "reason"}`;
it matches when `tool` equals the call's tool name (or is `"*"`) and every
`match` field's glob matches the input string. Globs: `**` = any characters,
`*` = any characters except `/`, `?` = one character, everything else literal,
anchored at both ends (both sides translate to the same regex).

### 7.6 Interrupts
When `interrupt.turn == turn` and the reply asked for tools, before running
any: `emit interrupt(by="human", pending=[ids])`. With `close_books`: append
`user([tool_result(id, "Interrupted by the user before this ran.", is_error=true) for each])`.
Without `resume`, end `"interrupted"`. With `resume`: if any `tool_use` in
`messages` lacks a matching `tool_result`, the next model call fails with
`model_error(type="invalid_request", message="tool_use ids were found without tool_result blocks immediately after")`
and the run ends `"error"`; otherwise the loop continues normally.

### 7.7 Sandbox
Paths are joined to the root and normalized lexically (`.`/`..`); links are
followed (at most 8 hops); the final path must be inside the workspace, else
`allowed=false, reason="path outside the workspace: <path>"`. A custom tool
with `"effect": "network"` and an input field `url` is allowed only if its
host is in `egress`. Without the module, paths may escape into `outside` and
network tools always run.

## 8. Cost
`cost` is cumulative integer **nano-units**:
`prompt_tokens * input_milli + output_tokens * output_milli`, where
`*_milli` are the tape's prices in milli-units per million tokens (§5). With
real USD prices from the facts registry, 1 nano-unit = 1e-9 USD; the UI shows
`≈ $0.0138` (or "units" when the tape's pricing is illustrative).

## 9. Events

Every event has: `v` (1), `run` (`"<tape>:<board>:<seed>"`), `seq` (0, 1, …),
`t` (ms), `turn`, `agent` (`"main"`), `kind`, `wire`, plus its fields:

| kind | wire | fields |
|---|---|---|
| `run_start` | loop | `task`, `board`, `seed`, `model_id` |
| `prompt_built` | control | `layers`, `tokens` |
| `context_check` | context | `tokens`, `window`, `percent`, `action` |
| `model_call` | loop | `attempt`, `tokens_in` |
| `model_error` | errors | `type`, `attempt`, `retry_after_ms` (0 if none), `message` |
| `retry_wait` | errors | `attempt`, `wait_ms` |
| `breaker` | errors | `state`, `failures` |
| `recovery_check` | errors | `attempts`, `breaker` |
| `model_reply` | loop | `stop_reason`, `text`, `tool_uses`, `usage`, `cost` |
| `interrupt` | loop | `by`, `pending` |
| `permission` | permissions | `tool`, `decision`, `rule`, `reason`, `human`, `final`, `tool_use_id` |
| `sandbox` | permissions | `tool`, `allowed`, `reason`, `tool_use_id` |
| `tool_call` | tools | `tool`, `input`, `ok`, `output`, `output_tokens`, `truncated`, `tool_use_id` |
| `verify` | verify | `check`, `passed`, `output` |
| `guard` | loop | `guard`, `limit`, `value` |
| `trace_write` | observe | `events`, `redacted` |
| `run_end` | loop | `status`, `passed`, `turns`, `tokens`, `cost` |

Statuses: `done`, `unverified`, `max_turns`, `budget`, `loop`,
`circuit_open`, `interrupted`, `refused`, `max_tokens_reply`, `error`
(SPEC §7.2's list, extended; D-039). Reserved for later phases (in the schema
now, not emitted yet): `compaction`, `cache`, `subagent_start`, `subagent_end`.

Every turn emits at least `prompt_built`, `context_check`, `model_call`,
`recovery_check` (or `model_error`), `model_reply` and `trace_write`; tool
turns add `permission` and `tool_call`; done claims add `verify` when the gate
is plugged (D-033 as implemented).

`redact`: before an event is stored, every string field has each pattern
replaced by `[REDACTED]`; `trace_write.redacted` counts replacements since the
previous `trace_write`.

## 10. Files and parity

- Trace file: one event per line, `json.dumps(event, sort_keys=True, separators=(",", ":"))`
  in Python and the same canonical form in JS (sorted keys, no spaces).
- Golden traces: `scenarios/golden/<tape>.<board>.<seed>.jsonl`, written by
  `python tools/check_scenarios.py --update <tape>` from the Python harness,
  and accepted only if the JS simulator produces the identical file.
- Wire payloads: for each turn, the request
  `{"model", "max_tokens": 4096, "system", "tools", "messages"}` and the
  response `{"id": "msg_<turn>", "type": "message", "role": "assistant", "model",
  "content", "stop_reason", "stop_sequence": null, "usage"}`, as JSONL
  (`--wire`). Both runtimes produce them; parity covers them too;
  `check_wire.py` validates the Python ones against `anthropic` 1.8.0 types (D-019).
- CLIs: `python -m rein.sim run --tape T --board B --seed N [--wire]` and
  `node tools/sim_cli.mjs run --tape T --board B --seed N [--wire]`; both print
  JSONL to stdout.

## 11. Example: the B2 tape's script

```json
"script": [
  {"say": "I'll read the file first.", "tools": [["read_file", {"path": "calc.py"}]]},
  {"say": "The bug is in add(). Fixing it.", "tools": [["edit_file", {"path": "calc.py", "old_text": "a - b", "new_text": "a + b"}]]},
  {"say": "Running the tests.", "tools": [["run_command", {"cmd": "pytest -q"}]]},
  {"branch": [
    {"percent": 60, "then": [
      {"say": "total() adds 1 for no reason. Removing it.", "tools": [["edit_file", {"path": "calc.py", "old_text": "sum(xs) + 1", "new_text": "sum(xs)"}]]},
      {"say": "Running the tests again.", "tools": [["run_command", {"cmd": "pytest -q"}]]},
      {"say": "All tests pass. Done."}]},
    {"percent": 40, "then": [
      {"repeat": {"times": "forever", "steps": [
        {"say": "Almost done: one more fix.", "tools": [["edit_file", {"path": "calc.py", "old_text": "sum(xs) + 1", "new_text": "sum(xs) - 1"}]]},
        {"say": "Nearly there. Re-running the tests.", "tools": [["run_command", {"cmd": "pytest -q"}]]},
        {"say": "One last change should do it.", "tools": [["edit_file", {"path": "calc.py", "old_text": "sum(xs) - 1", "new_text": "sum(xs) + 1"}]]},
        {"say": "Almost done. Re-running the tests.", "tools": [["run_command", {"cmd": "pytest -q"}]]}]}}]}
  ]}
]
```

With board `b2-old` (no modules) a spiral seed never ends on its own; the
simulator therefore has a hard **safety stop** at turn 60 that ends the run
`interrupted` with `interrupt(by="operator")` (it represents the person who
eventually notices; lessons say so).

## Amendments

- **A1 (2026-10-10): context overflow.** If the prompt is larger than the
  tape's `window`, `context_check.action` is `"overflow"`, one `model_call`
  (attempt 1) is followed by `model_error(type="invalid_request", ...)` with the
  message shown in §7.1, `t` advances 300 ms, no fault draw and no script step
  are consumed, and the run ends `"error"`. Retry never applies (permanent).
- **A2 (2026-10-10): the simulated human.** `human` is
  `{"default": "approve" | "deny", "deny_if": {<input field>: <glob>, ...}, "fatigue": {"after": N, "approve_percent": P}}`
  (`deny_if` and `fatigue` optional). On each `ask`: `asks += 1`; if `fatigue`
  is set and `asks > after`, draw `percent()`: below `P` the human answers
  `"approve"` without looking (rubber-stamp). Otherwise the human is careful:
  `"deny"` if every `deny_if` field's glob matches the call's input (and
  `deny_if` is non-empty), else `default`. The `permission` event's `human` is
  `"approve"` or `"deny"`, and `final` is `"allow"` for approve, `"deny"` for
  deny. No draw happens before fatigue sets in.
- **A3 (2026-10-10): rulings from building both runtimes.** Building the JS
  simulator and Rein independently surfaced these gaps; each ruling below is
  binding for both, and the golden traces are regenerated after it.
  1. *Tool definitions:* the built-ins named in `tools`, in `tooldefs.json`
     order (not tape order), then `custom_tools` in tape order.
  2. *Unknown tool* (not listed, not custom): `ok` false, output
     `Unknown tool: <name>`, latency 100 ms. A custom tool's `latency_ms`
     defaults to 100.
  3. *`run_command`:* split `cmd` on whitespace into words. `["pytest"]` or
     `["pytest", "-q"]` runs the checks; first word `ls` lists files (arguments
     ignored); `cat` with exactly one argument reads that path, otherwise output
     `usage: cat <path>` with `ok` false; anything else
     `command not found: <first word>` (empty `cmd`: `command not found: `).
  4. *Inputs:* a missing or non-string `path`, `cmd`, `content`, `old_text` or
     `new_text` reads as `""`. Messages echo the path as the model wrote it. An
     empty `old_text` is "not found". `edit_file` on a missing file gives
     `read_file`'s error. `list_files` lists every workspace key (links
     included), sorted, joined by `"\n"`, no trailing newline. `write_file` to
     the root (`""`, `.` or `/`) writes nothing: `ok` false, `Is a directory: <path>`.
  5. *Checks:* a check on a missing file fails (`contains` and `not_contains`
     alike); deleting the file never passes a check.
  6. *Paths:* normalized lexically. A path starting with `/` is absolute: it is
     never inside the workspace and is looked up in `outside` by its normalized
     form (tapes may plant `/etc/passwd`). A relative path whose normal form
     starts with `../` is looked up in `outside` the same way.
  7. *Links:* a link's target is relative to the link's own directory and is
     followed by reads and writes, with or without the sandbox. More than 8
     hops gives `ok` false, output `Too many levels of links: <path>`.
  8. *Sandbox reasons:* `path outside the workspace: <path>` with the path as
     written, or `<path> -> <resolved>` when a link was followed, or
     `too many levels of links: <path>`. Egress: `host` is the text after the
     first `://` up to the first `/`, `?` or `#`; drop everything through the
     last `@`; drop a trailing `:<digits>`; lowercase (no `://` gives `""`).
     Reason `host not in egress: <host>`. An allowed call has reason `""`.
     The board loader rejects an `egress` entry that is not lowercase, so hosts
     compare as plain strings. The
     check applies only to custom tools with `"effect": "network"` and a string
     `url`. The `sandbox` event is emitted for every tool call that reaches the
     sandbox check when the module is plugged (a call denied by permissions
     never does, §7.1 order); a blocked call emits no `tool_call`.
  9. *Permissions:* a matched rule is named `rules[<i>]`, its 0-based index in
     the board's `rules` list as written. Every rule must have a non-empty
     `reason` (the schema requires it). No match: rule `default`, reason
     `no rule matched (mode <mode>)`. A denied call's result is
     `Denied: <reason>` (also when a human denies an `ask`).
  10. *Globs:* `**` and `?` match any character (newlines and `/` included),
      `*` any character except `/`; the whole string must match (Python
      `fullmatch`). A non-string input value is matched against its `pyjson`
      form; an absent field never matches (rules and `deny_if` alike).
  11. *Custom tool results:* the first `results` entry whose every `match`
      field equals the input field by `pyjson` wins; its `ok` defaults to true.
      No match: the `default` entry, whose `ok` defaults to **false**; no match
      and no `default`: output `""`, `ok` false.
  12. *Tape defaults:* `human` absent means `{"default": "deny"}`; `seed_base`
      0; `faults` `[]`; `outage` none; `interrupt` null; `rules` `[]`.
  13. *Tape validity (the loader rejects the tape):* a non-integer number, a
      non-ASCII string, an object key that is a non-negative canonical integer
      (`0|[1-9][0-9]*`, such as `"0"` or `"12"`: JS reorders those keys; `"-3"`
      is fine), a reply step with an explicit `stop: "tool_use"` and no tools, or
      with tools and an explicit other `stop` (no `stop` key with tools means
      `tool_use`), a `workspace` key whose normal form is not a relative path
      inside the root, an `outside` key whose normal form is inside it, or two
      keys (across `workspace` and `outside`) with the same normal form. A call that expands
      100000 steps without a reply raises a script error (a tape bug, not a run
      outcome; no event).
  14. *Script:* reply steps take an optional `latency_ms` (§4). Error steps
      default `error_ms` 300 and `retry_after_ms` 0; a scripted
      `invalid_request` has message `Invalid request`. Outage and fault failures
      take `error_ms` 300; an outage carries its `retry_after_ms`, a fault 0.
      Faults are drawn in order and stop at the first failure. The outage
      window is `[from_ms, to_ms)`. A text block exists only when `say` is
      present. `assistant(blocks)` is `{"role": "assistant", "content": blocks}`.
  15. *Conditions:* `turn_gte:<n>` compares the current (1-based) turn;
      `last_denied` reads the last permission's `final`; `last_truncated` reads
      the last `tool_call` of the run; `verify_feedback` is true when the last
      user message is the gate's feedback.
  16. *Permanent request errors* (A1 overflow and the §7.6 missing-result
      error) take one path: before outage and fault checks, emit
      `model_call(attempt=1)`, `t += 300`, emit `model_error`, end `"error"`.
      They never touch `consecutive_failures` or the breaker, are never retried
      and write no wire payload. When both apply, the overflow comes first (the
      context check runs before the call).
  17. *Interrupt with resume:* the pending calls never run; the turn ends with
      `trace_write` (every turn emits one, D-033), then the loop goes to the
      next turn's guards.
  18. *Output cap:* cut only when `tokens(output) > max_tokens` **and**
      `len(output) > 4 * max_tokens`; `n = len(output) - 4 * max_tokens`.
      Otherwise the output is unchanged and `truncated` is false. Error outputs
      are capped too; denials and sandbox blocks are not tool outputs.
  19. *Pricing:* fact keys `input_usd_per_mtok` and `output_usd_per_mtok`;
      milli-units are `floor(p * 1000 + 0.5)`. Both CLIs default `--facts` to
      `site/data/facts.json` (relative to the working directory), the file
      `tools/gen_data.py` generates from `facts/`.
  20. *Redaction* applies to every string inside an event's own fields
      (recursively; keys excluded; never the envelope `v`, `run`, `seq`, `t`,
      `turn`, `agent`, `kind`, `wire`), counting occurrences. Wire payloads are
      never redacted: they show what the model was sent.
  21. *Output files:* every line ends with `"\n"`; a run with no lines (for
      example `--wire` when no call got a reply) prints zero bytes. The run id
      uses `tape.id` and `board.id`, not file names.
  22. *Golden coverage:* a tape's `golden_seeds` must, across its boards, take
      every option of every `branch` step that the run reaches at least once;
      `check_scenarios` reports an option no golden seed takes (Rein records the
      choices; they are not events). Both CLIs print them with `--choices`: one
      canonical line `["<location>",<option>]` per choice, in the order taken
      (`<location>` is the JSON pointer of the branch step in the tape's
      `script`; repeated copies share it). Parity covers this output too.
  23. *Golden files:* events in full
      (`scenarios/golden/<tape>.<board>.<seed>.jsonl`), the wire as the SHA-256
      of its JSONL output (`….wire.sha256`, one hex line): wire files for long
      runs are megabytes, parity already compares the two runtimes' wire output
      byte for byte on every check, and `check_wire.py` validates it live.
- **A4 (2026-10-10): the incident block** (replaces the sketch in §5 and
  AUTHORING §9). An incident tape's `incident` is
  `{"family", "wire", "board", "seed", "first_bad_seq", "accept_seqs", "why", "hint", "notes", "fixes", "correct_fix", "par_s"}`:
  `family` is a `failure_families` id in `course.json` whose `wire` equals
  `wire`; the hunt replays `board` (one of the tape's `boards`) at `seed` (one of
  its `golden_seeds`, so a golden trace exists); `first_bad_seq` is the seq of
  the first event where things went wrong and `accept_seqs` (optional, default
  `[]`) lists other seqs that also count as found; `why` (one or two sentences)
  is shown on success; `hint` is the pointer shown after the second wrong tap;
  `notes` (optional) is a list of `{"seq", "text"}` shown when that seq is
  tapped (a tempting wrong answer gets a specific reply); `fixes` is a list of
  2–4 `{"text", "why"}` and `correct_fix` the index of the right one; `par_s` is
  the par time to diagnose, in seconds. `check_scenarios` checks every
  reference: the family and its wire, the board and seed, and that every seq
  named exists in that golden trace. A tape without an incident omits the block.
- **A5 (2026-10-10): harness bugs on purpose, and a prompt-aware condition.**
  Some failure families are bugs in the harness code itself (DECISIONS
  D-049). These board modules make the simulated harness have the bug, so a
  lesson can show it and the fix is removing the module (the new board).
  1. *`history: {"resend": false}`* (absent: resend). The forgetful harness:
     every model call sends `messages = [user(text(task))]`, the first message
     only; the harness still keeps its own history (so `last_*` conditions and
     the missing-result check still use the full history), but the request,
     `prompt_built.tokens`, `context_check` and the wire payload use the sent
     messages. `prompt_built.layers` ends with `"history (not resent)"` instead
     of `"history"`.
  2. *Condition `history_lt:<n>`*: true when the request about to be sent has
     fewer than `n` messages (a scripted model can "start from nothing" when its
     prompt has no history).
  3. *`first_block_only: {}`*. The harness reads tool calls only from
     `content[0]`: if it is a `tool_use` block, that one call runs and any later
     `tool_use` blocks in the reply are missed (the next call then fails with the
     missing-result error, A3.16); if `content[0]` is not a `tool_use`, the
     harness found no call. When `stop_reason` is `tool_use` and no call was
     found, the harness takes the `end_turn` branch of §7.1 (verify gate
     included) as the buggy code would. The assistant message stored is the full
     reply (the bug is in reading, not storing), and `model_reply` still lists
     every `tool_use` (the trace tells the truth).
  4. Both modules map to the loop wire on the board (`hx-clock`) with the tag
     labels `history not resent` and `reads the first block only`, drawn with
     the warning mark: they are bugs, not features.
