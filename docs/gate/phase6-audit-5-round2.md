# Phase 6 audit 5, round 2: code and tests

Commit re-checked: 283d660 (worktree scratchpad/audit-5r2, clean at the end: `git status` shows only the .venv and node_modules symlinks; `git diff` empty; no stash).
Scratch: scratchpad/audit-scratch-5r2 (base = a copy of 283d660; mut/, broken2/, probes, logs). Python runs used PYTHONDONTWRITEBYTECODE=1 and -p no:cacheprovider. No real-model call. No action denied.
Round 1 report: scratchpad/phase6-audit-5-code.md (23 findings: 12 major, 11 minor).

## Round-1 findings: verdicts

### Majors

1. FIXED: malformed 200 crashed the CLI (live.py:158, :169). Probe: a loopback server answers 200 text/html and 200 without usage; `python -m rein run ... --live claude-haiku-5-5 --max-cost-usd 1` now prints one line, exit 2: `rein: the API answered with something other than a Messages API reply: check the API address` (no traceback). Guard at live.py:248-256; tests test_an_html_200_is_a_live_error_not_a_crash and test_a_200_message_without_usage_is_a_live_error_not_a_crash. Mutant M12b (guard removed) caught by both.
2. FIXED: a board without id/label loaded with exit 0 (board.py:56-57). Probe `board-no-id-no-label.json` now exits 2: `rein: board.id must be a non-empty string`; a good board still runs. Loop at board.py:55-58; test_a_board_needs_a_non_empty_id_and_label. Mutant M13 (round-1 defaults restored) caught.
3. FIXED: the spend-cap test did not pin the output term (live.py:213). New test test_the_spend_cap_refuses_a_request_whose_output_could_pass_it (test_live_constraints.py:145). Round-1 mutant M2 (output term dropped) now fails the full suite (1 failed, 736 passed).
4. FIXED: cache pricing untested (live.py:141-147). New test test_cache_writes_and_reads_are_priced_in_the_run_cost_and_the_cap (test_live_constraints.py:163). Mutants M3 (cache-read at input rate) and M11 (cache-write dropped from the cap) both fail the full suite.
5. FIXED: parity --assign missed parameterless board modules (parity.py:178, :250). Now `board = {k: (v if v else True) ...}` (parity.py:250-252). `--assign` on 283d660: 440 golden lines, features with zero goldens: none (was first-block-only and clock). The diff against round 1 is the same 9 lines as my scratch fix, and milestone counts are unchanged (M1 27, M2 18, M3 75, M4 93, M5 54, M6 66, M7 107). Judge (python -m rein.sim run) still 440 of 440.
6. FIXED: kata A5-validate accepted "" as missing. Test test_an_empty_string_is_a_present_field (katas/A5-validate/test_kata.py:62). My wrong solution (falsy-required-counts-as-missing, now in meta.yaml) is CAUGHT by the new test; baseline passes.
7. FIXED: kata B2-loop strict budget. Test test_the_budget_is_spent_exactly_at_the_limit (katas/B2-loop/test_kata.py:112). Wrong solution CAUGHT.
8. FIXED: kata C2-cap token estimate. Test test_a_length_of_four_times_the_limit_plus_three_is_still_unchanged (katas/C2-cap/test_kata.py:33). Wrong solution CAUGHT.
9. FIXED: kata C6-backoff blacklist. Test test_an_error_that_is_not_listed_is_permanent (katas/C6-backoff/test_kata.py:46). Wrong solution CAUGHT.
10. FIXED: kata C9-policy prefix as substring. Test test_a_prefix_must_be_at_the_start_of_the_path (katas/C9-policy/test_kata.py:53). Wrong solution CAUGHT.
11. FIXED: kata E1-trifecta lethal counted mentions. Test test_a_leg_named_by_two_tools_still_counts_once_for_the_trifecta (katas/E1-trifecta/test_kata.py:63). Wrong solution CAUGHT.
12. RULED (partly FIXED): check_facts passed a span that contradicted its claim (codex-and-open-harnesses.html:117). Fixed for the hard tokens: a changed number, a new identifier, a changed code token and a new number inside a fact span now FAIL (evidence below). The round-1 input itself, which keeps the claim's tokens and changes their meaning ("workspace-write (the default)"), still PASSES and is the known limit in docs/FACTS.md:119-122 (commit 89c134d). See N5 for the price variant, which is the most consequential instance.

### Minors

13. FIXED: `--max-cost-usd inf` raised OverflowError (live.py:52). Now `if not math.isfinite(usd) or usd <= 0` raises LiveError; probe: inf, nan, 0, -1 all exit 2 with `rein: --max-cost-usd must be a finite number above zero`.
14. FIXED: the cap was checked after the Models lookup (cli.py:98 now calls SpendCap.from_usd in _require_cap, before _live_model). Probe: `requests_before_refusal=[]` for -1, 0, inf, nan. Test test_an_unusable_cap_is_refused_before_any_request (test_live_cli.py:129). Mutant M14 (check removed) caught (4 failed).
15. FIXED: tape missing model_id printed `'model_id'` (tape.py:87-88). Now `rein: tape 'd1-example-a' is missing model_id`.
16. FIXED: cli.py:232 formatting. `ruff format --check rein`: 57 files already formatted.
17. FIXED: redaction tested one occurrence. Test now asserts `redact("a K b K")` removes both (test_live_constraints.py:253+). Mutant M10 (first occurrence only) fails the full suite.
18. FIXED: same-seed test ignored the seed. test_same_seed_gives_identical_output now asserts seed 0 differs from seed 3 (test_harness.py:73-76). Mutant M6 (seed ignored) now fails the targeted test and 13 others.
19. FIXED: capstone page gave the judge command without an entry point. site/modules/capstone-rein-in-rust.html:133 now names `python -m rein.sim` and says not to use `python -m rein run` for the judge.
20. FIXED: kata A4-parse dropped empty text blocks. Test test_an_empty_text_block_still_makes_a_line (katas/A4-parse/test_kata.py:65). Wrong solution CAUGHT.
21. FIXED (see N4): kata D2-wilson touching intervals. Test test_intervals_that_only_touch_do_not_differ (katas/D2-wilson/test_kata.py:47). Wrong solution CAUGHT. Residual: the test stubs `wilson`, which a correct differ may not call (N4).
22. FIXED: check_steps reported step.yaml:0. Now checkpoint mismatch at step.yaml:156 and break mismatch at step.yaml:169 (H1). Evidence: `check_steps.py --steps <broken> ` output `.../step.yaml:156: checkpoint output differs` and `.../step.yaml:169: break empty-reply output differs`.
23. FIXED (residual: N2, N3): check_katas reported line 0. Now: wrong solution at meta.yaml:37 (A4-parse); starter at starter.py:3 and solution at solution.py:1 (A4-parse). Residual: async-def katas get line 1 (N2), and helper-first katas point at the helper (N3).

Totals for round-1 findings: FIXED 22, NOT FIXED 0, RULED 1 (finding 12, partly).

## Re-run evidence (summary)

- Rein tests on 283d660: 737 passed (Python 3.13); 737 passed under Python 3.11 (scratch venv from round 1). mypy strict: no issues in 23 files. ruff check rein: clean; ruff format --check rein: 57 files already formatted.
- Round-1 mutants on the round-2 suite: M1, M4, M5, M7, M8, M9 still CAUGHT; M2, M3, M6, M10, M11 now CAUGHT (by the new tests named above); M12a (remove the `isinstance` guard) survives because the `usage` clause alone catches an HTML body (equivalent in practice, the test pins behaviour, not the clause); M12b, M13, M14, M15 CAUGHT.
- Malformed-200 and board probes: see findings 1 and 2. Cap probe: findings 13-14. Tape probe: finding 15.
- Parity: `tools/parity.py --assign` (round 2): 440 lines, features with zero goldens: none; 9 lines changed vs round 1; milestone counts unchanged. Judge `python -m rein.sim run`: 440 of 440.
- Katas (ten wrong solutions, the eight strengthened katas plus I5 and F5): A4, A5, B2, C2, C6, C9, D2, E1 CAUGHT by the new test; I5 CAUGHT; F5 (timeout matched anywhere) still SURVIVES, a coverage note, not a finding. check_katas (43 katas, 317 candidates, was 309): OK. check_katas --pyodide on the eight strengthened katas: 8 katas OK (63 candidates, CPython and Pyodide agree).
- Checkers, one broken input each (clean baseline first, all clean):
  - check_facts baseline: 282 facts OK (245 verified), 194 page references. Broken inputs: meaning change (tokens kept) PASS = RULED; `$4` -> `$40` FAIL (`says '40', in neither its claim nor its quote`); `rate_limit_error` -> `rate_limited_error` FAIL (identifier); `<code>max_tokens</code>` -> `<code>max_token</code>` FAIL; `<code>max_tokens_out</code>` FAIL; a new number `9000` inside a fact span FAIL; unknown fact id FAIL (round-1 control).
  - check_content: typed count `70 modules` / `5 parts` in main -> B6 FAIL; inline style -> B8 FAIL.
  - check_snippets: wrong expected output -> FAIL (`output differs`); `import requests` -> FAIL (`non-stdlib import: requests`).
  - check_steps: checkpoint `tokens_in=1O` -> FAIL at step.yaml:156; break expected changed -> FAIL at step.yaml:169.
  - check_katas: A4-parse wrong solution passing its tests -> FAIL at meta.yaml:37; starter passing -> starter.py:3; broken solution -> solution.py:1.
  - check_scenarios: one golden line changed by 1 nano-unit -> FAIL (`differs from the python output`); baseline `68 tapes, 423 runs, 7 evals, 17 eval runs, parity OK`.
  - check_wire: baseline 4237 payloads OK; unknown key injected in a scratch copy of rein/src/rein/tools.py -> FAIL, 845 problems.
- Root tools tests: 398 passed (round 1: 369). ruff check tools site/assets/py: clean. mypy strict (tools, site/assets/py; 51 files): clean.

## NEW problems introduced by the fixes

N1 (minor). tools/check_facts.py:394 — an unclosed `data-fact` span makes check_facts report the rest of the page as the span's text. `element_inner_html` falls through to `return text[open_end:]` when no closing tag matches, so every later span on the page is checked against the unclosed fact. Evidence: on a correct page (tokens-and-the-window.html), with the `</span>` removed from the api.stop-reason-max-tokens span at line 118, `check_facts` exits 1 with `FAILED (104 problems)`, e.g. `span for 'api.stop-reason-max-tokens' says 'model_context_window_exceeded', in neither its claim nor its quote`. The same page passes check_content (`1 pages OK`), so no checker names the unclosed tag. Suggested fix: when no closing tag is found, return "" and report `unclosed <span> for data-fact '<id>'`.

N2 (minor). tools/check_katas.py:279-287 (`_def_line`) — matches only `def `, so an `async def` candidate reports line 1. Evidence: T2-gather (async def fetch at starter.py:4) with starter = solution: `.../T2-gather/starter.py:1: starter passes every test; it must fail at least one`. Suggested fix: match `async def` too.

N3 (minor). tools/check_katas.py:279-287 (`_def_line`) — takes the first `def`, which can be a helper. Evidence: C4-hit-rate with `return 99 * read // total` in hit_percent (line 8-12): `.../solution.py:1: solution fails: test_hit_percent_...`, the line of the helper `_parts`, not of hit_percent. Also C10-confine (helper `_outside` at solution.py:6) is affected. Suggested fix: use the first def whose name the test file imports (`from kata import ...`).

N4 (minor). katas/D2-wilson/test_kata.py:47-56 — `test_intervals_that_only_touch_do_not_differ` stubs `kata.wilson`, so it fails a correct differ that computes its own intervals. Evidence: an inline differ (intervals computed in the function, same numbers, correct on all touching and overlapping cases) run against that test file: `1 failed, 8 passed` (the touching test). The starter's wording (differ "judged by their Wilson intervals") does not require calling wilson(). Suggested fix: test the touching case through the real wilson with two results whose intervals touch, or accept any implementation by checking differ's output only.

Not new, recorded as RULED with the same known limit (FACTS §6):
N5 (ruling, not a new finding). A price swapped for a number that appears elsewhere in the same claim passes: `Claude Opus 5.5 base input is $4 per MTok` -> `$20 per MTok` (20 is the claim's output price) exits 0 (check_facts: `282 facts OK`). It keeps the claim's tokens and changes their meaning, so it is the documented limit. Flagged because prices are the most consequential numbers on the site; the director may want a rule for it.

## Coverage notes (not findings)

- Round-1 mutants M1-M11 and the two new probes were run in scratch copies only.
- Not re-run in round 2: the JavaScript and Rust parity judges (the Rein fixes do not touch their code; the Python judge was re-run), the kata Pyodide run for the other 35 katas, and check_scenarios --update.
- The `1e-12` spend cap (exit 0, a budget stop before any call) is the designed behaviour for a cap below one request's worst case, not a finding.
- Terms and card facts are checked for id and status only, not tokens (FACTS §6 says so; check_content B10). Not a fix regression.
- A LiveError on a malformed 200 aborts a live eval with exit 2 and no partial results file, as the earlier traceback did. Behaviour unchanged in kind; not new.

## Limits

- No real-model call. The live path was run only against the loopback mock and a closed local port.
- Git-ignored caches from round 1 remain in audit-5 (.ruff_cache, rein/.mypy_cache, rein/.pytest_cache, rein/.ruff_cache, rein/src/rein/__pycache__, rein/tests/__pycache__, tools/__pycache__); round-2 runs were made in the scratch copy, so none were added to audit-5r2.
- Round-2 checks in the scratch copy used symlinked node_modules (for Pyodide and the sim) and omitted site/vendor.

## Summary

- Counts: FIXED 22, NOT FIXED 0, RULED 1 (finding 12: check_facts meaning-only change, FACTS §6), NEW 4 (N1-N4, all minor).
- Blocker: none. Round 1 of this audit had no blocker, and no round-2 problem rises to blocker (N1-N4 are checker messages and one test's coupling).
- Most important remaining point: N5, a price swapped for another number in the same claim still passes check_facts (the documented known limit); and N1, an unclosed fact span gives 104 false problems with no checker naming the unclosed tag.
