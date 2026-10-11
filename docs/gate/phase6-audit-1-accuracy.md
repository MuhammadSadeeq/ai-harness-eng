# Phase 6 audit 1: technical accuracy (BP-6.0 section 1)

Reviewer: hx-reviewer 1. Audited commit 0fef4ca, clean worktree at `scratchpad/audit-1`.
All `file:line` references are relative to the repository root. Scratch and evidence:
`scratchpad/audit-scratch-1/` (`spans/`, `steps_out/`, `keep/`, `probe/`, `h12tree/`).
No project file was edited, nothing was committed, no web source was fetched, and no model
API was called. Each bullet is one finding; the no-JS dash bullet lists 18 locations.

Summary: blocker 1, major 56 bullets (73 if each of the 18 no-JS dash locations is counted alone), minor 1.

## Blocker

- [blocker] site/modules/statistics-for-a-random-system.html:118 — "Two results differ only when their intervals do not overlap." This rule is false: overlapping 95% intervals do not show that two rates are the same. Evidence: Wilson 95% intervals for 50/100 are 0.404 to 0.596 and for 65/100 are 0.553 to 0.736, which overlap. A two-proportion z-test on the same counts gives z = 2.15, two-sided p = 0.032 (computed with `.venv/bin/python`; scratch session). Suggested fix: say that non-overlapping intervals show a difference, that overlapping ones do not prove there is none, and name a two-proportion test as the exact check. The page's own arithmetic is right: 6/10 vs 4/10 overlap, and 60/100 vs 40/100 do not (0.502 to 0.691 vs 0.309 to 0.498).

## Major: a span says more than its claim

- [major] site/labs/sampler.html:26 — The span says "On current Claude models you can't change temperature: the API accepts only 1.0." Its claim (`api.temperature-deprecated-after-opus-4-6`) covers only models released after Claude Opus 4.6, and it says other values are rejected with a 400 error. "Current Claude models" is wider, and the 400 detail is dropped. Evidence: `scratchpad/audit-scratch-1/spans/spans.tsv` and `claims.tsv`, the row for this id. Suggested fix: "On models released after Claude Opus 4.6, you can't change temperature: 1.0 is accepted for backwards compatibility and any other value is rejected with a 400 error."

## Major: Rein behaviour and numbers

- [major] site/modules/rein-10-project-rules.html:143 — "The hook denies the edit, the gate refuses both claims, and the run ends unverified." The checkpoint has one claim of done, not two. Evidence: `scratchpad/audit-scratch-1/steps_out/H10.txt`. Turn 4 is "The test passes now. Done."; turns 5 and 6 are "(the script has run out)". The gate ran three times (verify lines at turns 4, 5 and 6 in `scratchpad/audit-scratch-1/keep/H10-check/trace.jsonl`). The source `steps/H10/step.yaml` (checkpoint explain) has the same wrong "claims done twice". Suggested fix: "The model claims done once; the gate refuses it, the script runs out, and after two fix rounds the run ends unverified." Correct `steps/H10/step.yaml` too.
- [major] site/modules/rein-extensions.html:157 — "Tokens and outcomes are the same in both runs, so the process is the only thing the check changed." The control's outcomes differ. The same page's control gives 10 of 10 passing without the check and 0 of 10 with it. Evidence: `scratchpad/audit-scratch-1/h12tree` runs, `h13_control_baseline.md` and `h13_control_extension.md`. Tokens are equal at 31,770 in and 1,910 out; outcomes are not. Suggested fix: "Tokens are the same in both runs, and only the pass count changes."
- [major] site/modules/rein-7-retries-and-a-breaker.html:111 — "A spend-cap 429 carries no retry-after value and keeps failing until access comes back" has no span. The matching fact `api.error-429-spend-cap-no-retry-after` exists (facts/api.yaml:302-306 and site/data/facts.json), and no page uses it. Suggested fix: wrap the sentence in `<span class="fact" data-fact="api.error-429-spend-cap-no-retry-after">`.
- [major] site/modules/rein-7-retries-and-a-breaker.html:130 — "The official SDK retries transient failures twice by default" has no span. Fact `api.error-sdk-retries` exists. Suggested fix: span it with that id.
- [major] site/modules/rein-setup.html:141 — "Rein's real-model step reads the key from ANTHROPIC_API_KEY" has no span. The code agrees (rein/src/rein/live.py:27, KEY_ENV). Fact `api.sdk-env-api-key` exists (facts/api.yaml:477-484). Suggested fix: span it with that id.
- [major] site/modules/rein-setup.html:170 — "In the ANTHROPIC_API_KEY environment variable. Never in a file under git, never in the browser." has no span. Same fact as line 141. Suggested fix: span it.
- [major] No-JS reading of a typed number is a dash. Eighteen hx-num fallbacks on 15 pages show "—" where the number belongs, so the no-JS sentence reads "After the run, — of 20 runs pass". Evidence: site/modules/rein-11-a-reviewer.html:160. With JavaScript the rendered value is 14 (scratch `probe/ran.json`). Locations: compaction-and-memory.html:163; context-budget.html:181; control-plane.html:165; cost-and-latency.html:186; defense-in-layers.html:185 and :200; eval-anatomy.html:174; evals-in-practice.html:187; observability.html:200; permissions.html:173; prompt-injection-and-the-trifecta.html:171 and :179; reasoning-and-effort.html:131; rein-11-a-reviewer.html:160; statistics-for-a-random-system.html:175 and :193; the-agent-loop.html:220; verification.html:197. Suggested fix: write the computed value into the static HTML, or reword the sentence so the no-JS reading has no blank. Coordinate with QA's no-JS pass.

## Major: API or product claims with no span

Search: API names, model names, prices, limits, status codes and SDK names in prose, outside
every span (`scratchpad/audit-scratch-1/spans/fam_hits.tsv`, `hits_pmsd.tsv`, `hits_alhd.tsv`).
A hit is a finding when it states how the API or a named product behaves, returns, accepts or
charges. Bare headings, quiz questions, objectives, chapter pointers and Rein-internal numbers
are coverage.

site/glossary.html (definitions stated without a span):
- [major] site/glossary.html:347 — cache hit: "A call that reads some of its input from the cache. The hit rate is the share of the input that was read."
- [major] site/glossary.html:356 — cache invalidation: "A change that makes earlier cache entries stop matching, so the next call writes the request again."
- [major] site/glossary.html:365 — cache prefix: "A cache matches a prefix whole, or not at all."
- [major] site/glossary.html:374 — cache read: "Input that a call takes from the cache instead of processing it again."
- [major] site/glossary.html:383 — cache TTL: "How long a cache entry lasts after it was last written or read." The refresh on read is not in fact `api.cache-ttl-default-5m-and-1h`.
- [major] site/glossary.html:392 — cache write: "Input that a call stores in the cache, so that a later call can read it."
- [major] site/glossary.html:753 — end_turn: "The model's own statement that it has finished, carried by end_turn."
- [major] site/glossary.html:945 — extended thinking: "The thinking is billed as output." Spanned elsewhere (reasoning-and-effort.html:114, `api.thinking-billed-as-output`).
- [major] site/glossary.html:1388 — is_error: "An optional field of a tool_result. It is set to true when the tool call failed, and says so to the model."
- [major] site/glossary.html:1807 — overloaded error: "The error the API returns when it is temporarily overloaded. It is a transient error."
- [major] site/glossary.html:1819 — tool_use blocks: "Several tool_use blocks in one reply, so the harness runs them together and answers all of them in one message."
- [major] site/glossary.html:1889 — pause_turn: "The stop reason for a server-side loop that reached its iteration limit." Fact `api.stop-reason-pause-turn` exists.
- [major] site/glossary.html:2030 — prompt caching: "Keeping the start of a request, so that a later call with the same start can read it back instead of processing it again."
- [major] site/glossary.html:2149 — refusal: "The stop reason for a response where the model declined to answer. It arrives as a normal reply, not an error." Fact `api.stop-reason-refusal` exists.
- [major] site/glossary.html:2527 — stop_reason: "The field in every response that says why the model stopped: end_turn, tool_use, max_tokens and a few others."
- [major] site/glossary.html:2653 — thinking block: "In a tool loop, it goes back to the model unchanged with the tool call."
- [major] site/glossary.html:2777 — tool_result: "The block that answers one tool_use. It carries the tool_use_id of the call and the output the harness got back."
- [major] site/glossary.html:2795 — tool_use_id: "A tool_result names the id of the call it answers."

site/modules/prompt-caching.html:
- [major] site/modules/prompt-caching.html:59 — "A cache reads the start of a request again on the next call. One line near the top that changes on every call makes it write everything again."
- [major] site/modules/prompt-caching.html:109 — "Nothing before the end of the request matches the call before it, so the cache writes all of the request again and reads none of it."
- [major] site/modules/prompt-caching.html:131 — "The cache TTL is how long an entry lasts after it was last written or read." The refresh on read is not in fact `api.cache-ttl-default-5m-and-1h`.
- [major] site/modules/prompt-caching.html:194 — quiz answer: "The cache matches a whole prefix or none of it."

site/modules/the-agent-loop.html:
- [major] site/modules/the-agent-loop.html:182 — quiz answer: "Retry with a higher max_tokens, so the whole tool call comes back."
- [major] site/modules/the-agent-loop.html:256 — "The model's own statement that it finished, carried by end_turn."

site/modules/the-api-call-on-the-wire.html:
- [major] site/modules/the-api-call-on-the-wire.html:186 — code comment with prices: `input_price, output_price = 2, 10  # Claude Sonnet 5.5, dollars per million tokens`. The figures match the fact; the code line has no span (the prose price is spanned at line 183).

site/modules/reasoning-and-effort.html:
- [major] site/modules/reasoning-and-effort.html:170 — quiz answer: "Passes it back complete and unmodified, with the tool call it belongs to."
- [major] site/modules/reasoning-and-effort.html:190 — "They are billed as output." Spanned at line 114.
- [major] site/modules/reasoning-and-effort.html:191 — "It goes back to the model complete and unmodified, with the tool call that it belongs to."

site/modules/rein-2-one-tool-and-the-loop.html:
- [major] site/modules/rein-2-one-tool-and-the-loop.html:157 — quiz answer: "The tool_use_id of the request it answers."
- [major] site/modules/rein-2-one-tool-and-the-loop.html:173 — "One result for each tool_use, all together in the next user message."
- [major] site/modules/rein-2-one-tool-and-the-loop.html:186 — "A tool_result with is_error set to true, and a short reason."
- [major] site/modules/rein-2-one-tool-and-the-loop.html:223 — "All in one user message, one per tool_use, each with the tool_use_id of its request."
- [major] site/modules/rein-2-one-tool-and-the-loop.html:226 — "A tool_result with is_error set to true and a short reason. The run carries on."

site/modules/tools-give-the-model-hands.html:
- [major] site/modules/tools-give-the-model-hands.html:116 — "Parallel tool calls are several tool_use blocks in one reply."
- [major] site/modules/tools-give-the-model-hands.html:131 — "Each call keeps the id of its tool_use, so the output can be matched back to the call that asked for it."
- [major] site/modules/tools-give-the-model-hands.html:227 — "It writes a tool_use block that names the tool and its input. It does not run the tool. The harness does."
- [major] site/modules/tools-give-the-model-hands.html:231 — quiz answer: "The tool_use_id of the call it answers."

site/modules/http-and-sse.html:
- [major] site/modules/http-and-sse.html:106 — quiz answer: "The retry-after header."
- [major] site/modules/http-and-sse.html:121 — "A 400 means the request is wrong... A 529 means the API is temporarily overloaded... A 500 is an internal error." No span on this sentence.
- [major] site/modules/http-and-sse.html:174 — quiz answer: "529, with the error type overloaded_error."
- [major] site/modules/http-and-sse.html:175 — quiz answer: "429." for rate_limit_error.
- [major] site/modules/http-and-sse.html:176 — quiz answer: "The request has a format or content problem."

site/modules/errors-and-recovery.html:
- [major] site/modules/errors-and-recovery.html:125 — quiz answer: "An invalid request, a format or content problem."

site/modules/rein-1-talk-to-a-model.html:
- [major] site/modules/rein-1-talk-to-a-model.html:213 — "Why the model stopped, such as tool_use or end_turn. The harness decides its next step from it."

site/modules/production.html:
- [major] site/modules/production.html:118 — "Wait the number of seconds retry-after gives, then retry." Spanned at line 113.

site/labs/cards.html:
- [major] site/labs/cards.html:29 — "the API rejects the next request. Every tool_use needs a tool_result with the same id in the next user message."

site/labs/cacheline.html:
- [major] site/labs/cacheline.html:18 — "The cache reads a prefix that did not change."

site/design.html:
- [major] site/design.html:258 — popover definition: "stop_reason is the field in every model reply that says why the model stopped."

## Minor

- [minor] site/modules/rein-5-a-trace.html:109 — "A run emits six kinds: run_start once; model_call and model_reply for each turn; permission...; tool_call...; and run_end." This holds for the step 5 run (`steps_out/H5.txt`; the trace has exactly these six kinds). A run with a check, guard, retry or compaction also writes verify, guard, retry_wait, model_error, compaction or breaker lines (`keep/H10-check/trace.jsonl`). Suggested fix: "A plain run emits six kinds; a check, guard, retry or compaction adds more."

## Coverage (checked and found clean)

1. Span audit: 136 `data-fact` spans on 79 pages. All 136 ids exist in site/data/facts.json, and all 242 facts are status "verified". Every span was printed beside its claim and read: 135 say the claim or less, and one says more (sampler.html:26). The span on design.html:255 has an extra `data-verified` attribute; the widened pattern caught it. Files: `scratchpad/audit-scratch-1/spans/spans.tsv`, `claims.tsv`.
2. Keyword sweep, all 108 pages (text outside spans): API names, status codes, prices, model names, SDK names, limits, dates. Rein-internal numbers, lesson minutes, "C4 · Prompt caching" chapter pointers, objectives, quiz questions, generic sampler and HTTP teaching, and bare headings were not counted. Model IDs in prose appear only at observability.html:133-135, as an example ID that matches fact `models.ids-current`. Simulated Rein costs ("≈ $0.3988" in bench.html and check.html) are not API prices; they are covered by the numbers check. The SDK mention in pip install (rein-setup.html:145) is a code block; the prose SDK claims are findings above. MCP mentions outside spans are navigation labels or objectives.
3. Rein steps H1 to H11 (`tools/check_steps.py`): CPython 11 steps OK, 36 breaks, 1 local; Pyodide also 11 steps OK, and CPython and Pyodide agree. I ran every checkpoint and break myself in scratch copies and saved the output (`steps_out/H1.txt` to `H11.txt`). Each output was compared with its step explain text and with the page prose. Checked in detail: H1 empty reply and missing file; H2 small limit, FileNotFoundError, KeyError; H3 resolve, ambiguous text, absolute path, hostile tape, cap, shell; H4 answer n, chained (y then n), rm after, auto mode, wall; H5 key redaction in trace.jsonl ([REDACTED]), ask/approve/allow trace line, 1,993 tokens; H6 1,310 to 751 compaction, 2 cuts (11,293 and 11,464 to 2,000), tight limit (2 compactions); H7 six retry_wait, three model_error, one breaker, circuit_open, one-try, rate-limit (retry-after 2.0 s), hiccup; H8 seven calls done, limit-2 ends at turn 3 with loop, budget 701 of 700, loop-ignored, max-seconds (wait_ms 461 and 878, t=1340, max_time), Ctrl+C interrupted (history valid, 11 messages), max_turns guard; H9 two verify lines (fail, pass) and done, no-check, never-passes unverified; H10 (see finding) and show-prompt (run twice, byte-identical, includes AGENTS.md layer); H11 FAIL then PASS, done after seven calls, no-review (four calls), rubber-stamp. Only H10 is wrong on its page.
4. Three commands run by hand as the pages print them, in learner-style folders (rein.py, scenarios, reset_demo): the H1 checkpoint (`Say hello`), the H7 checkpoint after reset_demo, and H10 `--show-prompt` twice. All match the saved output and the page.
5. H12 (rein-from-one-file-to-a-project.html) and H13 (rein-extensions.html): these have no step folder, so check_steps does not cover them. In a scratch copy with rein/src, scenarios/ and site/data/facts.json, I ran every offline command the pages print: `run`, `eval` and `results` for d1-new and d1-old, the control eval, `git apply` and `git apply -R` of the H13 patch. The H12 tables match the page exactly, and the H13 baseline and extension tables match page Table H13.1. The control result is 10 of 10 without the check and 0 of 10 with it (the page's text says the same, but see the finding at line 157). Their `--live` command was not run (no key).
6. Numbers, 15 pages: tokens-and-the-window, reasoning-and-effort, context-budget, prompt-caching, errors-and-recovery, verification, eval-anatomy, statistics-for-a-random-system, cost-and-latency, rein-6-a-context-budget, rein-7-retries-and-a-breaker, rein-8-guards, rein-9-the-verification-gate, rein-11-a-reviewer, rein-from-one-file-to-a-project. Plus rein-extensions for its tables. Each bench was run once by clicking its Run button in Chromium (`probe/render2.mjs`, served from the audit worktree's site/ on 127.0.0.1; no `__test` hooks). Results: effort 20/20 vs 20/20 (worst cost $0.1897 vs $0.0121); cap 0/20 vs 20/20; gate 0/20 vs 20/20 (worst turns 4 vs 6); d1 20/20 vs 0/20 (worst turns 8 vs 4); d2 10/20 vs 8/20; f4 20/20 vs 6/20 (cost per pass ≈ $0.0038 vs ≈ $0.0066); c6 outage 0/20 vs 12/20 (breaker-open runs on the new board match "some runs end with the breaker open"); false-done (s0) 13/20 vs 20/20; interrupt 0/20 vs 20/20; reviewer new board 14/20. Typed numbers were checked against the boards and tapes: c6-old (30 tries, 200 ms, no breaker), c6-new (10 tries, 1 to 8 s, full jitter, breaker at 8), c2-new (600-token cap), c6-outage (0 to 20,000 ms), c2-flood (43,964 characters, which is 10,991 tokens at 4 characters per token), d1 example tapes (2 replies) and held-out (8), the tokenizer lab's "40 KB log" (422 x 96 characters, about 40.5 KB), statistics pass@3 about 99% and pass^3 about 51% (80%, 3 tries). Every typed result sentence agrees with its bench, except the statistics rule (blocker above) and the rein-10 sentence (finding above).
7. Denied hosts: none was contacted. No web source was re-verified; no claim looked wrong enough to require it. The facts for the spend-cap 429, SDK retries and the SDK env var exist in the registry and were used only as cross-references.

## Limits

- The `--live` command (rein-from-one-file-to-a-project.html:117) was not run: no API key, and no real-model call was allowed.
- The keyword sweep is keyword-driven. It can miss claims that use none of the listed words (for example "usage" or "billed" without an API name). I read every keyword hit; I did not read every sentence of all 108 pages.
- MCP protocol claims were checked only through the keyword sweep, not sentence by sentence.
- The in-page benches are the site's JavaScript engine. I checked them against the Python engine only for H12 and H13 tables, and against the tape and board files; I did not compare seed by seed.
- Browser probes ran one at a time in Chromium from /opt/pw-browsers. QA's `tools/qa/run.mjs`, axe and the full no-JS pass are QA's, and I did not run them.
- The H13 `git apply` ran in the scratch copy only, never in the worktree.
- Coverage is 15 pages for numbers, as briefed, not the whole site.
