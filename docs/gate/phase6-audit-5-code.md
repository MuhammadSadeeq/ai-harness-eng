# Phase 6 audit 5: code and tests (BP-6.0 section 5)

Audited commit: 0fef4ca (worktree: scratchpad/audit-5, clean at the start; git diff is empty at the end).
Scratch: scratchpad/audit-scratch-5 (all mutants, broken inputs, logs). Rules: hx-reviewer.md.
Reviewer: audit 5 (code and tests). No project file was edited, committed or staged. No real-model call.

## Scope
BP-6.0 section 5 (code and tests): the Rein package, the parity judge, ten katas, ten Rein tests, and the seven checkers. Every finding has evidence, a severity and a file:line. Coverage and limits are at the end.

## Ranked findings
### Major (12)

- [major] rein/src/rein/live.py:158 (and :169) — a 200 response that is not a Message object (for example an HTML page from a proxy or captive portal) or that has no usage block crashes the CLI with an uncaught AttributeError. `reply_from_response` sits outside the try in `LiveModel.call`, and `cli.py:219` catches only BoardError, EvalError, LiveError, PricingError, ResultsError, ScriptError, TapeError, OSError and ValueError. The CLI contract (cli.py docstring: "Errors are one line on stderr with exit status 2") is broken. Evidence: a loopback server (scratch: `audit-scratch-5/bad_200_subproc.py html`) answers the Models lookup, then POST /v1/messages with `200 text/html`. The real `python -m rein run ... --live claude-haiku-5-5 --max-cost-usd 1` prints a Traceback ending `live.py line 158: for block in response.content:` / `AttributeError: 'str' object has no attribute 'content'` and exits 1. The same happens with a 200 JSON body that omits `usage` (live.py:169, `AttributeError: 'NoneType' object has no attribute 'input_tokens'`, exit 1). Suggested fix: validate the response shape inside `LiveModel.call` (for example `isinstance(response, anthropic.types.Message)` and `usage is not None`) and raise LiveError or return ErrorOutcome; also add `AttributeError`/`TypeError` only with a wrapped message, not bare.

- [major] rein/src/rein/board.py:56-57 (`id=str(raw.get("id", ""))`, `label=str(raw.get("label", ""))`) — a board without `id` or `label` loads and runs with exit 0 and `"board":""` in the run_start event. `scenarios/board.schema.json` lists both as required, and the schema rejects `{"modules":{}}` (`'id' is a required property`). A bad board is not an error on the path the brief asks about, and an eval results file records an empty board name. Evidence: `audit-scratch-5/errors/board-no-id-no-label.json`; `python -m rein run --tape tape-good.json --board board-no-id-no-label.json` exits 0; run_start has `"board":""`. Suggested fix: `board_from_dict` raises BoardError when `id` or `label` is missing or not a non-empty string.

- [major] rein/tests/test_live_constraints.py:134-143 (the test) with rein/src/rein/live.py:213 (the worst-case bound in `LiveModel.call`) — the spend-cap test does not pin the bound. Mutant M2 removes the output term from the worst-case estimate, so the cap can be passed by up to the output cost of a request, and all 725 tests still pass. The test passes `cap=1` (one nano-unit), where any request is refused, so it cannot tell a full worst-case check from a partial one. Evidence: `mutate.py M2` output: `targeted test: 1 passed`, `full suite: 725 passed`. Suggested fix: add a test with a cap between the input-only bound and the full bound (for example, cap = input cost + one nano-unit, with a body of known length), and assert that no request is sent.

- [major] rein/tests/test_live_constraints.py:239-243 and :145-152 (tests) with rein/src/rein/live.py:141-147 (`cost_nano`) — the live cost formula has no test with cache tokens. Every live fixture has `cache_read_input_tokens: 0` (tests/fixtures/live/*.json, grep count), and the cost test uses only input and output. Mutant M3 (cache-read priced at the input rate) and mutant M11 (cache-write term dropped from the live cap accounting) both pass all 725 tests. The live cap is the learner's money guard, so an under-count from a cache write lets a run pass its cap. Evidence: `mutate.py M11`: `targeted test: 1 passed`, `full suite: 725 passed`; `mutate.py M3`: same. The scripted cache cost in harness.py:428 is tested (test_a6_cache.py::test_the_cost_uses_the_cache_prices), but the live copy of the formula is not. Suggested fix: add a live fixture or unit case with nonzero cache_creation and cache_read tokens, and assert `cost_nano` and `result.cost` agree on the same usage.

- [major] tools/parity.py:178 (`_has_path`: `return node not in (None, [], {}, "")`) with tools/parity.py:250 (`board = board_file.get("modules", {})`) — a board module with no parameters is seen as absent, so `--assign` credits no feature for it. Board modules `first_block_only: {}` and `system_clock: {}` are then reported as having no goldens. Evidence: `python -c "parity._has_key({'first_block_only': {}}, 'first_block_only')"` returns False. Goldens that use them: `h1-first-block.h1-old.{0,1,2}` (scenarios/boards/h1-old.json:5), `c4-cold-cache.c4-old.{0,1,2}` (scenarios/boards/c4-old.json, `system_clock`), `eng-cache-clock.eng-cache-clock.{0,1,2}` (scenarios/engine/boards/eng-cache-clock.json). `--assign` (audit-scratch-5/assign_orig.txt) lists them as `incident` / `cache` / `list-output cache` with no `first-block-only` or `clock`. Other parameterless board keys are missed the same way (cache, cost-attribution, crash-resume, input-checks, model-profiles, side-effects, split-results; the golden set is unaffected for most of them because another feature credits the same golden). A scoped scratch fix (`board = {k: (v if v else True) ...}` at line 250) changes 9 `--assign` lines, adds those two features, and changes no milestone (`audit-scratch-5/assign_fixed.txt`). Do NOT fix by dropping `{}` in `_has_path` for all documents: that marks `"outside": {}` in every tape as the outside-paths feature (415 lines change, scratch experiment). Suggested fix: the scoped change above, plus a test in tools/tests/test_parity.py: a board with `"first_block_only": {}` credits `first-block-only`.

- [major] katas/A5-validate/test_kata.py:22-24 (no empty-string case) with katas/A5-validate/solution.py:35 — a present field whose value is "" is reported as missing. The starter's spec (check order 2: "each name in required ... missing") is about absence, so `""` must be valid for a string. Evidence: `kata_mutants.py` output `A5-validate / falsy-required-counts-as-missing: SURVIVED ... 10 passed`; with the extra test `check_value(WRITE, {"path": "", "content": ""}) == ""` the candidate fails and the baseline passes. Suggested fix: add that test.

- [major] katas/B2-loop/test_kata.py:87-92 (pins 110 and 220 only) with katas/B2-loop/solution.py:18 — the budget is checked strictly. A run that has used exactly `max_tokens` makes one more call and goes over the budget. Evidence: `B2-loop / budget-strictly-greater: SURVIVED ... 9 passed`; the extra test (a reply of 150 tokens with a budget of 150 must return "budget" after one call) fails the candidate and passes the baseline. Suggested fix: add that test.

- [major] katas/C2-cap/test_kata.py:8-11 (the boundary case has len 20) with katas/C2-cap/solution.py:8 — the estimate `len(text) // 4 <= max_tokens` is written as `len(text) <= 4 * max_tokens`. The two differ for lengths 4m+1 to 4m+3: a 21-character text with max_tokens 5 estimates to 5 tokens (unchanged, per the spec) but is cut. This is the most natural translation of the spec's estimate, so a learner is likely to write it. Evidence: `C2-cap / limit-as-four-chars-per-token: SURVIVED ... 5 passed`; extra test `cap_output("x" * 21, 5) == "x" * 21` fails the candidate, passes the baseline. Suggested fix: add that test.

- [major] katas/C6-backoff/solution.py:5 with katas/C6-backoff/test_kata.py:10-11 — the starter says "Anything else, such as 'invalid_request', is permanent: False". A learner who writes `error_type != "invalid_request"` retries "refusal" and any other unlisted error. The test only pins invalid_request. Evidence: `C6-backoff / blacklist-only-invalid-request: SURVIVED ... 8 passed`; extra test `should_retry("refusal", 1, 5) is False` fails the candidate, passes the baseline. Suggested fix: add that test.

- [major] katas/C9-policy/solution.py:13 with katas/C9-policy/test_kata.py:23-26 — the spec says "input["path"] starts with the prefix". The table has no path that contains a prefix without starting with it. With `prefix in path`, a deny rule for `tests/` matches `src/tests/t.py`. Evidence: `C9-policy / prefix-as-substring: SURVIVED ... 5 passed`; the extra test (deny on prefix "tests/", path "src/tests/t.py", mode allow, must return "allow") fails the candidate, passes the baseline. Suggested fix: add that test.

- [major] katas/E1-trifecta/solution.py:24 with katas/E1-trifecta/test_kata.py:36-37 — the spec is "True when all three legs are open". The candidate counts leg mentions after the cut, so a second tool that carries the same leg makes `lethal` false. Evidence: `E1-trifecta / lethal-counts-leg-mentions: SURVIVED ... 11 passed`; extra test `lethal([READER, READER, FETCH, POST]) is True` fails the candidate, passes the baseline. (The kata's own test covers the same point for `legs_open` only, test_kata.py:22-23.) Suggested fix: add that test.

- [major] tools/check_facts.py:124-165 (`run`, which checks ids and status but not span text) with site/modules/codex-and-open-harnesses.html:117 — the checker passes a page span whose text contradicts its fact's claim. The span text in the page says the default sandbox mode is workspace-write and the fact claim (facts/harnesses.yaml:104-105) says read-only is the default. Evidence: `audit-scratch-5/broken-facts-out.txt`: `check_facts: 279 facts OK (242 verified, 0 contradicted), 136 page references`, exit 0. docs/FACTS.md:6 says "a claim ... that no checker covers is a bug", and the span text is hand-written in the page (no generator writes it), so no checker covers "span says what the claim says". Suggested fix: have check_facts compare each span's normalized text with its claim (or quote), or generate the span text from the registry claim (the way FACTS.md §6 describes the chip). Until then, the manual check in section 1 is the only guard.

### Minor (11)

- [minor] rein/src/rein/live.py:53 — `--max-cost-usd inf` passes `if not usd > 0` and then `round(inf * 1e9)` raises an uncaught OverflowError (exit 1, traceback). Evidence: `audit-scratch-5/cap_probe.py` output: `cap='inf' exit=UNCAUGHT OverflowError: cannot convert float infinity to integer stderr=''`. Suggested fix: `if not math.isfinite(usd) or usd <= 0: raise LiveError(...)`.

- [minor] rein/src/rein/cli.py:105 (`check_model` runs before `live_prices` at cli.py:106 and `SpendCap.from_usd` in `_live_model`) — the spend cap is validated after the Models API lookup, so `--max-cost-usd -1` or `0` or `nan` still sends a GET to the API before the one-line refusal. Evidence: `cap_probe.py` output: `cap='-1' exit=2 ... requests_before_refusal=['GET /v1/models/claude-haiku-5-5']` (same for 0 and nan). No model call and no spend, so it is a polish issue. Suggested fix: validate the cap in `_run`/`_eval` next to `_require_cap`, before `_live_model`.

- [minor] rein/src/rein/tape.py:87 — a tape missing a required key reports only the bare key name: `rein: tape 'd1-example-a': 'model_id'` (KeyError text). Evidence: `audit-scratch-5/errors/tape-no-model.json` run gives exactly that line, exit 2. Suggested fix: catch KeyError separately and print "tape is missing model_id".

- [minor] rein/src/rein/cli.py:232 — trailing blank line; `ruff format --check rein` fails on this file (the only file out of 57). CI does not gate on ruff format (ci.yml runs `ruff check .` and `mypy`), so this is polish. Evidence: `ruff format --check rein` output `cli.py:232:1 File would be reformatted`. Suggested fix: run `ruff format rein/src/rein/cli.py`.

- [minor] rein/tests/test_live_constraints.py:188-189 — the redaction test checks one occurrence of the key only. Mutant M10 (`text.replace(key, REDACTED, 1)`) passes all 725 tests, and the test name says "replaces the key in any error text". Current code is correct (live.py:65 replaces all occurrences), so this is a test gap, not a live defect. Evidence: `mutate.py M10`: `targeted test: 1 passed`, `full suite: 725 passed`. Suggested fix: assert the key is absent from `"a K b K"` (two occurrences).

- [minor] rein/tests/test_harness.py:68-73 — `test_same_seed_gives_identical_output` alone passes when the seed is ignored (mutant M6). The seed dependence is caught elsewhere (12 failures in the full suite, including test_new_board_never_runs_past_twelve_turns and test_a3_rulings), so the suite is not blind to it, but the named test does not check it. Evidence: `mutate.py M6`: targeted `1 passed`, full suite `12 failed, 713 passed`. Suggested fix: add `assert run_trial(..., 4).events != first.events` for seeds whose branch differs, or rename the test.

- [minor] site/modules/capstone-rein-in-rust.html:132 — the capstone page gives `python3 tools/parity.py --cmd "<your command> run"` and does not say which Python entry point is the shared runtime. `python -m rein run` passes all 423 run goldens but fails all 17 eval goldens (Markdown instead of the golden JSON; audit-scratch-5/parity-python.txt). BP-4.3 names `python -m rein.sim` (docs/blueprints/BP-4.3-capstone.md:36, :78). Evidence: the two judge runs above (17 failures vs 440 of 440). Suggested fix: name `python -m rein.sim run` as the Python runtime on the page, or add a one-line note that `rein eval` prints the table and `rein.sim eval` prints the golden form.

- [minor] katas/A4-parse/test_kata.py:12-17 and :60-63 — no test has an empty text block. A candidate that drops empty text blocks passes all 8 tests; the spec says "the text of every text block, in order". Evidence: `A4-parse / empty-text-blocks-dropped: SURVIVED ... 8 passed`; extra test `read_reply({"stop_reason": "end_turn", "content": [text(""), text("a")]})[0] == "\na"` fails the candidate. Severity minor: empty text blocks are rare in real replies. Suggested fix: add the test.

- [minor] katas/D2-wilson/test_kata.py:35-36 — the spec says "their Wilson intervals do not overlap". Intervals that only touch (hi of one equal to lo of the other) are not pinned. A candidate using `<=` passes all 8 tests. Boundary case; exact float touching is hard to construct, so this is minor. Suggested fix: pin a constructed touching case, or state in the starter that touching counts as overlap.

- [minor] tools/check_steps.py:625-629 (the `checkpoint output differs` problem is emitted with line 0) — the problem is reported as `step.yaml:0`, so the learner-author cannot find the `expected:` block (it is at step.yaml:156 in steps/H1). Evidence: `audit-scratch-5/broken-steps-out.txt`: `.../step.yaml:0: checkpoint output differs: line 3: got ...`. Suggested fix: record the line of `expected:` (the YAML composer gives it) and print it.

- [minor] tools/check_katas.py:262, :272 and :274 (`report.error(where, 0, ...)` for wrong-solution, starter and memory-blank problems) — the problem is reported as `meta.yaml:0` or `test_kata.py:0`, so a candidate's line is not shown. Evidence: `audit-scratch-5/broken-katas-out.txt`: `.../A4-parse/meta.yaml:0: wrong solution 'text-joined-without-newlines' passes every test; it must fail at least one`. Suggested fix: print the line of the candidate's `code:` key in meta.yaml, or the `def` line for starter and solution.

## Coverage and detail by area

## Rein tests: wrong-implementation check (ten tests, plus one extra mutant M11)

Method: each of ten tests was picked. A plausible wrong implementation was applied to a scratch copy of the repository layout (`audit-scratch-5/mut/`, runner `audit-scratch-5/mutate.py`). The targeted test and the full Rein suite (`rein/tests`, 725 tests) were run against each mutant. The worktree was not touched.

| # | Test (rein/tests) | Wrong implementation | Targeted test | Full suite |
|---|---|---|---|---|
| M1 | test_policy.py::test_deny_rules_win_over_ask_and_allow | first matching rule in list order wins (no deny-first) | fails (caught) | 1 failed (caught) |
| M2 | test_live_constraints.py::test_the_spend_cap_stops_the_run_before_any_request_is_sent | worst-case bound drops the output term (`WIRE_MAX_TOKENS * output_milli`) | passes | 725 passed (SURVIVES) |
| M3 | test_live_constraints.py::test_the_cost_of_a_reply_is_its_usage_times_the_price_per_token | cache-read tokens priced at the input rate in live `cost_nano` | passes | 725 passed (SURVIVES) |
| M4 | test_harness.py::test_retry_backoff_without_jitter_doubles_and_caps | backoff without the `cap_ms` cap | fails (caught) | 1 failed (caught) |
| M5 | test_harness.py::test_invalid_request_is_never_retried | `invalid_request` added to the retried types | fails (caught) | 1 failed (caught) |
| M6 | test_harness.py::test_same_seed_gives_identical_output | seed ignored (`Mulberry32(0)`) | passes | 12 failed (caught elsewhere) |
| M7 | test_a11_tapes_boards.py::test_a11_3_a_canary_nested_in_the_input_is_found | canary search only over top-level string values | fails (caught) | 2 failed (caught) |
| M8 | test_a6_cache.py::test_an_entry_older_than_the_ttl_is_not_read | TTL ignored | fails (caught) | 2 failed (caught) |
| M9 | test_tape_board_pricing.py::test_usd_per_mtok_rounds_half_up_to_milli | Python `round()` (half to even) | fails (caught) | 1 failed (caught) |
| M10 | test_live_constraints.py::test_redaction_replaces_the_key_in_any_error_text | `redact` replaces the first occurrence only | passes | 725 passed (SURVIVES) |
| M11 | test_live_constraints.py::test_the_spend_the_cap_counts_is_the_run_cost | live cap accounting drops the cache-write term (`cache_creation_input_tokens`) | passes | 725 passed (SURVIVES) |


Checked and clean for this section: M1, M4, M5, M7, M8, M9 are caught by the targeted test. 725 tests pass on the audited commit (`PYTHONPATH=rein/src .venv/bin/python -m pytest -q rein/tests`, 19.8 s).

## Rein types and errors

- Types: `cd rein && ../.venv/bin/mypy` (strict, `rein/pyproject.toml`, mypy 2.3.1): "Success: no issues found in 23 source files". Clean.
- Lint: `ruff check rein` passes. `ruff format --check rein` reports one file (see the cli.py:232 minor above). CI does not gate on format.
- Python 3.11 (CI matrix): `/usr/bin/python3.11` parses all rein/src and rein/tests with `feature_version=(3,11)` with no errors, and the full Rein suite passes under 3.11 in a scratch venv (`725 passed in 23.45 s`).
- Error paths, through `python -m rein` and `main()` (scratch: `audit-scratch-5/errors/`):
  - Truncated tape JSON: `rein: tape-truncated.json: Expecting value: line 1 column 27 (char 26)`, exit 2, one line. Clean.
  - Tape without `model_id`, schema 2, tape that is a list, `window` as a string: each one line, exit 2, with the field named except the KeyError case (see tape.py:87 minor above).
  - Board that is malformed JSON, `modules` as a list, unknown module, missing file (`[Errno 2] No such file or directory: 'does-not-exist.json'`), `--seed -1`: each exit 2, one line. Clean.
  - Live with the key unset: `rein: ANTHROPIC_API_KEY is not set: a live run needs your own key in that variable`, exit 2, no key text. Clean. Without `--max-cost-usd`: refused before any network call (exit 2). Clean.
  - A fake key with a closed loopback base URL: `the API could not be reached`, exit 2, the key does not appear in the output. Clean (redaction holds on this path).
  - Unlisted model against the loopback mock: exit 2, names the id, key not shown (`test_live_cli.py`, passes).

## Parity coverage (tools/parity.py)

Judged on the audited commit, all 440 golden entries (423 run goldens and 17 eval goldens, engine goldens included), with `--jobs 2`:

| Runtime | Command passed to `--cmd` | Result |
|---|---|---|
| Python shared CLI | `.venv/bin/python -m rein.sim run` (PYTHONPATH=rein/src) | 440 of 440 |
| JavaScript simulator | `node tools/sim_cli.mjs run` | 440 of 440 |
| Rust reference (capstone/reference, built in scratch, release) | `rein-rs run` | 440 of 440 |

Notes on these runs:
- The Python entry point for the judge is `rein.sim` (BP-4.3 line 78 names it). With `python -m rein run` the run goldens match (423 of 423), but the 17 eval goldens fail, because the package CLI `rein eval` prints a Markdown table and not the golden JSON. The package CLI behaves as BP-4.2 specifies ("prints a short table"), so this is a wrong-entry-point trap, not a runtime bug. Evidence: `audit-scratch-5/parity-python.txt` (18 lines, 17 eval failures). The course page (site/modules/capstone-rein-in-rust.html) does not name a Python entry point, so a learner can pick the wrong one without a warning. Minor, see below.
- The judge is not blind: `--cmd "/bin/echo run" --only a1-confident-lie` gives `parity: 0 of 6 runs match`, exit 1.
- The Rust reference's `cargo test --release --offline` passes 7 unit tests (run in the scratch layout, which copies `scenarios/fixtures` to where prng.rs reads it).
- Commands used: `audit-scratch-5/parity-python-sim.txt`, `parity-js.txt`, `parity-rust.txt`.

Coverage by feature (`tools/parity.py --assign`, output in `audit-scratch-5/assign_orig.txt`, 440 golden lines, 32 features in capstone/milestones.json):
- Every feature with a golden is matched by all three runtimes (the three tables above cover all 440 goldens).
- Features with thin coverage (one tape each, except redaction): `overflow` (3 goldens, c2-flood), `links` (9, c10-escape), `interrupt-resume` (6, c5-interrupt), `board-rules` (3, g4-stale-map), and `redaction` (9 goldens on two tapes). Thin coverage, not a defect.
- `--assign` reports two features with NO golden: `first-block-only` (A5.3, M3) and `clock` (A6.4, M4). Both are wrong; see the finding below.


## Kata test strength

Ten katas were picked (A4-parse, A5-validate, B2-loop, C2-cap, C6-backoff, C9-policy, D2-wilson, E1-trifecta, F5-idempotent, I5-pass-k). For each, one plausible wrong solution was written as a one-line change to the kata's own solution.py, and checked against that kata's test_kata.py. The wrong solutions were chosen to differ from the kata's own `wrong_solutions` in meta.yaml (the first draft used two that duplicated the kata's own, and they were replaced). The baseline (the kata's own solution.py) passed every test in every case. Runner: `audit-scratch-5/kata_mutants.py`; extra-test check: `audit-scratch-5/kata_extra_tests.py`. Nothing in the worktree was changed.

| Kata | Plausible wrong solution | Caught by test_kata.py? |
|---|---|---|
| A4-parse | empty text blocks dropped from the joined text (`and block["text"]`) | SURVIVED (8 of 8 pass) |
| A5-validate | a required field whose value is "" counts as missing (`if not value.get(name)`) | SURVIVED (10 of 10 pass) |
| B2-loop | budget checked strictly (`used > max_tokens`), one call past the budget | SURVIVED (9 of 9 pass) |
| C2-cap | "at or under the limit" written as `len(text) <= 4 * max_tokens` | SURVIVED (5 of 5 pass) |
| C6-backoff | only `invalid_request` is permanent (`!= "invalid_request"`), not "anything else" | SURVIVED (8 of 8 pass) |
| C9-policy | prefix matched as a substring (`prefix in path`), not a start | SURVIVED (5 of 5 pass) |
| D2-wilson | intervals that only touch counted as different (`<=`) | SURVIVED (8 of 8 pass) |
| E1-trifecta | lethal counts leg mentions (`sum(... for tool ... for leg ...) == 3`), so a leg named twice breaks it | SURVIVED (11 of 11 pass) |
| F5-idempotent | a timed-out reply recognised by `in` instead of `startswith` | SURVIVED (6 of 6 pass); see coverage note |
| I5-pass-k | pass^k as the independent power `(c/n) ** k` | CAUGHT (3 tests fail) |

Each survivor was then checked with one extra test written against the kata's own spec (`kata_extra_tests.py`): the extra test fails the wrong solution and passes the baseline in every case (A4, A5, B2, C2, C6, C9, E1, and F5 for completeness). Suggested tests are listed in each finding below.


Coverage note (not a finding): F5-idempotent. The starter says "A reply that timed out is retried" and does not say how a timed-out reply is recognised. The reference recognises it by `startswith("Timed out")` (solution.py:15). A candidate that matches the text anywhere in the reply (`TIMED_OUT not in output`) passes all 6 tests. Recognising a timeout is not defined by the spec, so no finding is made, but the tests do not pin the choice (`audit-scratch-5/kata_extra_tests.py` shows the extra test that does).

Checked and caught: I5-pass-k with `(c/n) ** k` for pass^k is caught by 3 tests (test_a_mixed_row_at_k_two, test_k_equal_to_the_trials, test_the_average_is_over_tasks).

Pattern: 9 of the 10 plausible candidates pass the kata's tests. The kata's own listed wrong solutions are all caught: `tools/check_katas.py` (run on the 43 katas, see the checkers section) requires every listed wrong solution to fail a test, and it passes on the audited commit. The unlisted plausible ones are not caught, so the test suites look tuned to the listed mistakes. Each survivor's gap is one missing case in the test file, which is why the extra tests above are small.

## Checkers (tools/check_*.py, one broken input each)

Each checker first passed on a clean copy of the audited commit (`audit-scratch-5/chk`, a copy of the repository; baseline outputs in `audit-scratch-5/baseline-*.txt`). Then one broken input was made in a scratch copy and the checker was run on it. Outputs are in `audit-scratch-5/broken-*-out.txt`.

| Checker | Baseline (clean) | Broken input (scratch) | Result |
|---|---|---|---|
| check_facts.py | `279 facts OK (242 verified, 37 unverifiable, 0 contradicted), 136 page references` | span text in codex-and-open-harnesses.html:117 changed to a false claim (sandbox default becomes workspace-write) | PASSES (major, below). Control: an unknown fact id is caught (`unknown fact id`). |
| check_content.py | `course.json OK (70 modules), 70 pages OK` | a typed count ("70 modules and 5 parts") in the main of asyncio.html | caught: `[B6] typed count '70 modules'` and `'5 parts'`. Inline style: `[B8]` caught. |
| check_snippets.py | `36 snippets OK in 17 files` | (a) data-output changed to a wrong line; (b) `import requests` added to a snippet | caught both (`output differs`; `non-stdlib import: requests`). |
| check_steps.py | `11 steps OK (36 breaks, 1 local; CPython)` | H1 checkpoint `tokens_in=10` changed to `tokens_in=1O` (letter O) | caught (`checkpoint output differs`), but at `step.yaml:0` (minor, below). |
| check_katas.py | `43 katas OK (309 candidates, runners agree)` | A4-parse wrong solution `text-joined-without-newlines` changed to join with newlines (so it passes every test) | caught (`passes every test; it must fail at least one`), at `meta.yaml:0` (minor, below). |
| check_scenarios.py | `68 tapes, 423 runs, 7 evals, 17 eval runs, parity OK` | one golden line of a1-confident-lie.a1-new.0 (run_end cost) changed by 1 nano-unit | caught (golden file mismatch). |
| check_wire.py | `4237 payloads OK` | an unknown key added to the tool definition in the scratch copy of Rein (rein/src/rein/tools.py, around line 76) | caught: 845 problems (`unknown key 'cache_hint'`). |

Notes on the wire check:
- A first attempt added the same unknown key to a custom tool in a scratch tape. The check still passed (4224 payloads), because Rein builds the wire tool from name, description and input_schema only (tools.py:76). That is correct behavior, not a checker miss, so it is not a finding. The count moved from 4237 to 4224 only because the live fixtures are counted when the scenarios folder is the default one (check_wire.py:328).


Checked and clean for this section:
- Root tools tests (`python -m pytest` at the scratch copy, the CI checker-test step): `369 passed in 124.72s`.
- Root `ruff check tools site/assets/py`: All checks passed. Root `mypy` (strict, tools and site/assets/py): `Success: no issues found in 51 source files`.
- The scratch copy of Rein was used only for the wire-check injection and was restored (`cmp` against the worktree is identical).

## Environment and run notes

- Rein tests on the audited commit: `PYTHONPATH=rein/src .venv/bin/python -m pytest -q rein/tests`: 725 passed in 19.8 s (Python 3.13).
- Rein tests under Python 3.11 (the CI matrix's other version): a venv built in scratch (`/usr/bin/python3.11`, pytest 9.1.1, pyyaml 6.0.3, anthropic 1.8.0 installed from the package index): `725 passed in 23.45 s`.
- Rust reference: built in scratch with `cargo build --release --offline` (in a copy with the repository layout, because src/run.rs includes `../../../site/assets/sim/tooldefs.json`); `cargo test --release --offline`: 7 passed.
- No real-model call was made. The live path was exercised only against a loopback mock (`127.0.0.1`, from rein/tests/live_mock.py) and a closed local port. The fake key `sk-ant-fake-KEY-123` was sent only to `127.0.0.1:9`.
- Git state: `git status` in audit-5 shows only the two symlinks (`.venv`, `node_modules`) as untracked; `git diff` is empty; HEAD is 0fef4ca. Nothing was committed or staged.
- Caveat on the worktree: my runs created git-ignored caches in audit-5: `.ruff_cache/`, `rein/.mypy_cache/`, `rein/.pytest_cache/`, `rein/.ruff_cache/`, `rein/src/rein/__pycache__/`, `rein/tests/__pycache__/`, `tools/__pycache__/`. I did not delete them, because the rules forbid deleting in the worktree. They are ignored by git (.gitignore) and are not tracked changes. The `site/vendor/pyodide/` folder was already there.
- Denied actions: none. No tool call was refused.

## Limits (not checked, and why)

- Pyodide runs (`check_katas.py --pyodide`, `check_steps.py --pyodide`): not run. They are heavy, and section 5 does not require them; the CPython runs were run and pass.
- `check_scenarios.py --update` was not run (it writes goldens; no golden was changed in the worktree).
- Rein's package CLI `python -m rein eval` prints a Markdown table (per BP-4.2), so it is not a parity runtime; I used the shared `rein.sim` entry point for the judge. Whether a learner would find that entry point is in the minor finding in the parity section.
- The kata survivors are judged against the kata's own spec text (starter docstrings and the solution docstring). Where the spec is ambiguous (F5 timeout recognition), I did not count the survivor as a finding.
- I did not review the kata content beyond test strength (out of scope for section 5).
- Only the 10 katas, 10 Rein tests and 7 checkers named in the brief's section 5 were used; the others are coverage by the baseline runs only.

## Summary
- Counts: 23 findings, 12 major, 11 minor, 0 blocker.
- Most important: tools/check_facts.py:124-165 passes a page span whose text contradicts its fact's claim (site/modules/codex-and-open-harnesses.html:117), so a wrong fact can reach learners while the checker reports all OK.
- Also: rein/src/rein/live.py:158 crashes with a traceback (exit 1, not the one-line exit 2) on a malformed 200 response; Rein's 725 tests pass on Python 3.13 and 3.11 and mypy strict is clean.
