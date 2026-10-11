# Phase 6 audit 1, round 2: technical accuracy re-check

Reviewer: hx-reviewer 1. Fixed commit 283d660, clean worktree at `scratchpad/audit-1r2`
(`.venv` and `node_modules` symlinks only). Round-1 report: `scratchpad/phase6-audit-1-accuracy.md`.
Scratch: `scratchpad/audit-scratch-1r2/`. Line numbers are current (283d660); round-1 line numbers
are in brackets where they moved. No project file was edited, nothing committed, no git state
changed, no web fetch, no real-model call, no background process.

Counts: FIXED 55 · NOT FIXED 3 · RULED 0 · NEW 4 (1 major, 3 minor). Blocker: none.

## Round-1 findings

### Blocker (1)
- FIXED — statistics-for-a-random-system.html:118 [118] "Two results differ only when…" is replaced by "When two intervals do not overlap, the results really differ. When they overlap, this data cannot tell them apart yet." (also :203). Evidence: raw HTML at lines 118 and 203; `grep -rn "differ only when|only when their intervals"` over site/, content/, katas/, steps/, scenarios/ finds no surviving copy; the card, check, say prompt and kata now say the same thing (`content/D2/*`, `site/data/cards/D2.json`, `say/D2.json`, `katas/D2-wilson/meta.yaml`).

### Majors, direct (8 bullets)
- FIXED — labs/sampler.html:26 [26]: span text is now the claim verbatim ("On models released after Claude Opus 4.6, temperature is deprecated: 1.0 is accepted … rejected with a 400 error."). Evidence: `scratchpad/audit-scratch-1r2/added_spans.json` #21.
- FIXED — rein-10-project-rules.html:143 [143]: "The model claims done once, the gate refuses it, the script runs out, and after two fix rounds the run ends unverified." `steps/H10/step.yaml:119` says the same. Evidence: H10 outputs identical to round 1 (`steps_out/H10.txt` diff, see Checks), three verify lines in the trace, one claim.
- FIXED — rein-extensions.html:157 [157]: "Tokens are the same in both runs, and only the pass count changes…". Evidence: scratch h12tree `h13_control_baseline.md` 10 of 10 vs `h13_control_extension.md` 0 of 10, tokens 31,770 in and 1,910 out in both; identical to round 1.
- FIXED — rein-7-retries-and-a-breaker.html:111 [111]: span now wraps "A spend-cap 429 carries no retry-after value…" (`api.error-429-spend-cap-no-retry-after`). The span drops "tier" from its claim; see NEW-1.
- FIXED — rein-7-retries-and-a-breaker.html:130 [130]: span `api.error-sdk-retries` wraps "The official SDK retries transient failures twice by default" (check_facts passes).
- FIXED — rein-setup.html:141 [141]: span `api.sdk-env-api-key` wraps the SDK sentence. The Rein-specific sentence stays unspanned; rein/src/rein/live.py:27 (KEY_ENV) confirms it. See NEW-2.
- FIXED — rein-setup.html:170 [170]: the definition now has span `api.sdk-env-api-key`. See NEW-3.
- FIXED — No-JS dashes, 18 locations on 15 pages (now 0): `grep -rn '>—</hx-num>' site` returns nothing. Static values equal the values a learner gets after clicking each bench: 39 values from 13 benches, zero differences from round 1 (`probe/ran_r2.json` vs `probe/ran.json`). Example: rein-11-a-reviewer.html:160 now reads "14 of 20".

### Majors, claim gaps (48 bullets)
- FIXED (16) — glossary: 347, 356, 365, 374, 383, 392, 945, 1388, 1807, 1819, 1889, 2149, 2527, 2653, 2777, 2795 [same lines]. Each definition is now a fact span whose text matches its claim (`added_spans.json` #1–#17).
- NOT FIXED — glossary.html:753 [753] (term "done claim"): "The model's own statement that it has finished, carried by end_turn…" is still plain text. Evidence: raw HTML at line 753, no `data-fact` on it.
- NOT FIXED — glossary.html:2030 [2030] (term "prompt caching"): "Reusing the work done on the start of a request when a later call starts the same way, so that start costs less." is plain text, rewritten by the fix without a span. Evidence: raw HTML at line 2030.
- FIXED (4) — prompt-caching.html:59, 109, 131, 195 [59, 109, 131, 194]: spans `api.cache-prefix-whole-match`, `api.cache-invalidation-hierarchy`, `api.cache-read-refreshes-ttl`.
- FIXED (2) — the-agent-loop.html:182, 256 [182, 256]: spans `api.max-tokens-incomplete-tool-use`, `api.stop-reason-end-turn`.
- FIXED — the-api-call-on-the-wire.html:186 [186]: the comment now says "the prose above gives their source" (spanned at line 183). The figures 2 and 10 stay on an unspanned code line; I accept this as sourced.
- FIXED (3) — reasoning-and-effort.html:172, 192, 193 [170, 190, 191]: spans `api.thinking-blocks-pass-back-tool-use`, `api.thinking-billed-as-output`.
- FIXED (5) — rein-2-one-tool-and-the-loop.html:157, 173, 186, 223, 226 [same lines]: spans `api.tool-result-ids-must-match`, `api.tool-results-single-user-message`, `api.tool-result-unrun-call`.
- NOT FIXED (partial) — tools-give-the-model-hands.html:116 [116]: only "their results go back together in one user message." is spanned (`api.parallel-results-one-message`). "Parallel tool calls are several requests for tools in one reply" is still plain. Evidence: raw line 116.
- FIXED (3) — tools-give-the-model-hands.html:131, 227, 231 [same lines]: spans `api.tool-result-ids-must-match`, `api.stop-reason-tool-use`.
- FIXED (5) — http-and-sse.html:106, 121, 175, 176, 177 [106, 121, 174, 175, 176]: spans `api.retry-after-meaning`, `api.error-400-invalid-request`, `api.error-529-overloaded`, `api.error-429-rate-limit`. See NEW-4 for line 121.
- FIXED — errors-and-recovery.html:125 [125]: span `api.error-400-invalid-request`.
- FIXED — rein-1-talk-to-a-model.html:213 [213]: span `api.stop-reason-field`.
- FIXED — production.html:118 [118]: span `api.error-429-retry-after`.
- FIXED — labs/cards.html:29 [29]: spans `api.tool-use-without-result-error`.
- FIXED — labs/cacheline.html:18 [18]: span `api.cache-prefix-whole-match`.
- FIXED — design.html:258 [258]: span `api.stop-reason-field`; the term "stop_reason" itself stays a term, not a claim.

### Minor (1)
- FIXED — rein-5-a-trace.html:109 [109]: "A plain run emits six kinds; …".

## NEW problems introduced by the fixes

- [major] site/modules/rein-7-retries-and-a-breaker.html:111 — the new span says "A spend-cap 429 carries no retry-after value and keeps failing…", but its fact `api.error-429-spend-cap-no-retry-after` says "A tier spend-cap 429 has no retry-after header…". The span drops "tier", so it says more than the claim. Evidence: `added_spans.json` #47; facts/api.yaml:302-306. Suggested fix: restore "tier".
- [minor] site/modules/rein-setup.html:141 — span `api.sdk-env-api-key` reads "The SDK reads the key from ANTHROPIC_API_KEY when you do not pass one." The claim is about the Python SDK ("In the Python SDK, passing api_key is optional…", facts/api.yaml:477-480). Page context (pip install anthropic) makes the referent clear, so minor. Suggested fix: "The Python SDK reads…".
- [minor] site/modules/rein-setup.html:170 — same scope drop in the definition ("The SDK reads it by default…"). Suggested fix: same.
- [minor] site/modules/http-and-sse.html:121 — span reads "A 429 has a retry-after header when the API can say how long to wait…", but its fact `api.error-429-retry-after` covers rate-limit 429s only. The subject is wider, and the condition narrows it again, so the sentence is consistent with the spend-cap fact but reads differently from the claim. Suggested fix: "A rate-limit 429 includes a retry-after header that says how long to wait."

## Corrections to round 1

- Round-1 coverage said all 242 facts were verified. That was true of `site/data/facts.json` only. The registry `facts/*.yaml` held 279 ids in the audited tree (`grep -h '^- id:' | wc -l`), 37 of them with status `unverifiable` (denied hosts such as docs.docker.com, git-scm.com, docs.python.org, openai.com). No span I checked uses one of the 37. In the fixed tree the registry holds 282 ids (245 verified, 37 unverifiable).

## Checks re-run (round 2)

- check_facts, no `--links`: `check_facts: 282 facts OK (245 verified, 37 unverifiable, 0 contradicted), 194 page references` (scratch `check_facts.txt`). The hard-token rule raised no problem on any span, including the 59 spans the fixes added or changed.
- Limit observed: the hard-token rule would pass the round-1 sampler span. Its only hard token is "1.0", which the claim contains (`hard_tokens` and `_token_in`, run with `python -B`, scratch). The rule checks numbers, code, quotes and identifiers, not scope words. This is a point for section 5 (checkers), not a finding on the fixed commit.
- check_steps, CPython: `check_steps: 11 steps OK (36 breaks, 1 local; CPython)`. Pyodide: `11 steps OK (36 breaks, 1 local; CPython and Pyodide agree)` (scratch `check_steps_cpython.txt`, `check_steps_pyodide.txt`).
- H1–H11 checkpoints and all 36 breaks dumped again (`steps_out/H1.txt`…`H11.txt`). All 11 files are byte-identical to round 1, so the behaviour the pages describe is unchanged.
- H12 and H13 have no step folders (course.json defines them; check_steps covers H1–H11). Their offline commands were re-run in a scratch copy of rein/, scenarios/ and site/data/facts.json: H12 `run`, `eval` and `results` (new and old), H13 baseline, extension (patch applied and reverted in scratch) and control. Every table is identical to round 1. The `--live` command was not run (no key).
- Hand-run commands, learner-style folders built from the fixed tree's step files: H1 checkpoint (`Say hello`) printed the expected three lines, exit 0. H7 checkpoint after `reset_demo.py`: 6 retry_wait, 3 model_error, 1 breaker, circuit_open. H10 `--show-prompt` run twice: byte-identical, 13 lines, and identical to round 1.
- Benches on the fixed tree: 13 pages (`probe/render3.mjs`, Chromium from /opt/pw-browsers, one browser process at a time, each Run button clicked once, no `__test` hooks), 39 values, all equal to round 1 and to the static fallbacks.

## Worktree note (mine)

Running Python tools from the worktrees left git-ignored `__pycache__` folders: `tools/__pycache__` and `tools/lib/__pycache__` in `audit-1` (created 07:25 in round 1), and `audit-1r2/tools/__pycache__/check_katas.cpython-313.pyc` (rewritten 10:39 by my check_steps run). The `.gitignore` lists `__pycache__/`, so git state is unchanged. I did not delete them, because the rule forbids deletion. From now on I run Python with `PYTHONDONTWRITEBYTECODE=1`. The director may want these removed.

## Limits

- QA (`tools/qa/run.mjs`), axe and the CVD pass were not run; they are not part of this section.
- The span-to-claim review of the 59 added or changed spans is by reading (`added_spans.json`). check_facts checks only hard tokens.
- No web source was fetched, so the sources of the three new facts (api.cache-output-unchanged, api.cache-prefix-whole-match, api.stop-reason-field) and of api.cache-read-refreshes-ttl were not re-checked. The page text matches their claims.
- The keyword sweep and its limits are as in round 1. I re-checked the 58 round-1 bullets and the 59 new spans; I did not re-sweep all 108 pages.

## 3-line summary

1. FIXED 55 · NOT FIXED 3 · RULED 0 · NEW 4 (1 major, 3 minor).
2. NOT FIXED: glossary.html:753 and :2030 (plain claims about end_turn and prompt caching) and tools-give-the-model-hands.html:116 (first clause still plain); NEW major: rein-7-retries-and-a-breaker.html:111 span drops "tier".
3. Blocker: none. The round-1 blocker (the false overlap rule) is fixed on the page, card, check, say prompt and kata; no copy survives.
