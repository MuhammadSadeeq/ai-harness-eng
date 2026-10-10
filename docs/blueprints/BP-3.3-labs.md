# BLUEPRINT BP-3.3-labs: wave 3.3 labs: `hx-stack`, `hx-outage`, `hx-desk`, `hx-cacheline`

Phase 3, wave 3.3 platform. Builder rules: `.claude/agents/hx-builder.md`. You
never commit. These labs serve C1–C4 and C6; their module builders write the
data that feeds them.

**Order.** Build `hx-stack` and `hx-outage` first. `hx-desk` and `hx-cacheline`
reuse simulator functions that the JS builder is adding for ENGINE A6
(compaction and caching); start them when I tell you those exports exist, and
never copy their logic into your component.

## Read first
`docs/COMPONENTS.md` (all), `docs/DESIGN.md` §7.5–§7.7, §7.9, §7.10, §8, §9,
§11, `docs/ENGINE.md` §7.3 (backoff) and amendment **A6**, DECISIONS D-051,
`site/assets/components/lib/{hx-element,data,format}.js`,
`site/assets/sim/{prng,tokens}.js`, `site/assets/core/hx.css`, and your own
accepted `hx-bench`, `hx-sort` and `hx-costcalc` (patterns).

## Shared rules
As BP-3.1/3.2: illustrative numbers labelled; seeded draws with a `seed`
attribute and `New seed`; charts at measured width; nothing under 14 px;
marks plus words, never color alone; reduced motion: no tweening; `selfTest()`
drives the real UI; a demo page `site/labs/<name>.html` with one demo data file
`site/labs/data/<name>-demo.json`; module + CSS ≤ 40 KB; values protocol
(COMPONENTS §10). Every reorder works with keys (`Move up` / `Move down`
buttons on each item; drag is optional extra, never the only way).

## 1. `hx-stack` (C1: instruction layers)
`src` JSON: `{layers: [{id, label, source, text}], conflicts: [{id, question, says: [{layer, text}], winner, why, fact?}], note?}`.
`source` is who wrote the layer (`operator`, `project`, `user`, `tool`).
- The stack: one card per layer in request order (first sent at the top),
  with its label, its source, its text (collapsed after two lines, `Show all`)
  and its course token estimate (`≈ N tokens`, the simulator's rule). A total
  line: `≈ N tokens in the prompt before the task.`
- Conflicts, one at a time (`Conflict 1 of 3`): the question, then the layers
  that disagree, each quoting what it says. The learner taps the layer they
  think wins; then the component marks the winner (mark plus words: `This one
  wins`), shows `why` (and the fact chip when `fact` is given), and offers
  `Next conflict`. A wrong pick gets the why too, never a bare "wrong".
- `Enforce it in code`: a switch on each conflict. When on, the winning rule
  shows a lock mark and the line `Enforced by a pre-tool hook: it holds whatever the prompt says.`
  This is the C1 law in one control; the component does not simulate the hook.
- Evidence: `this.evidence("stack", {src, conflict, right})` on each pick.
- Values: `right` (read-only, picks right so far), `tokens` (read-only).

## 2. `hx-outage` (C6: retries across a fleet)
The course's model of a provider and a fleet of clients (D-051), seeded,
labelled on screen: `The course's model of a provider and its clients, not a measurement.`
- Model (all integers, time in ms, slots of `slot_ms`, default 100):
  - `clients` (default 50) each send one request at a time; after a success a
    client waits `think_ms` (default 500) before its next request.
  - The provider serves at most `capacity` requests per slot (default 40).
    During the outage window `[outage_from_ms, outage_to_ms)` (default
    2,000–8,000) it serves none. Requests arriving in a slot are served in order
    of arrival time, then client index; the rest fail as `overloaded`.
  - A failed request is retried by the client's policy: the engine's backoff
    (ENGINE §7.3: `base = min(cap_ms, base_ms * 2^(attempt-1))`, jitter `none`
    or `full` with `below(base + 1)`), at most `max_attempts`; after that the
    client gives up on that request (a failed task) and starts its next one
    after `think_ms`.
  - Optional breaker per client: after `threshold` consecutive failures it
    opens for `cooldown_ms` (no requests), then sends one trial request.
  - Each client draws from its own PRNG stream, seeded `seed * 1000 + index`
    (the simulator's mulberry32).
  - The run covers `duration_ms` (default 20,000).
- Knobs (steppers or selects with readouts): `max_attempts` (1–10),
  `base_ms` (0–2,000), `cap_ms` (100–20,000), jitter (`none`/`full`), breaker
  (off, or threshold 2–10 with `cooldown_ms` 1,000–10,000). `src` JSON gives
  the defaults and the provider (`{provider: {...}, policy: {...}, presets: [{label, policy}]}`;
  the demo's presets: `Retry at once, no jitter`, `Backoff with full jitter`,
  `Backoff, jitter and a breaker`).
- Chart: requests sent per slot (bars) against the capacity line, the outage
  window shaded and labelled, over the run's time axis. Readouts:
  `Recovered at {s} s` (the first slot after the outage ends from which, for 10
  slots in a row, fewer than 10% of requests fail; `Not recovered` if none),
  `{n} requests sent`, `{n} tasks failed`, peak requests in one slot.
- `Run` recomputes at once (no animation needed; with motion allowed, the bars
  may grow in once). A one-line comparison when the learner pins a policy
  (`Pin this`, up to two pins), as in `hx-costcalc`.
- Evidence: `this.evidence("outage", {policy, recovered_ms, failed})` on each
  pin.
- Values: `recovered_ms`, `requests`, `failed` (read-only).

## 3. `hx-desk` (C2, C3: the context budget and compaction) — after A6 JS
`src` JSON: `{window, items: [{id, label, kind, tokens, needed, pointer_tokens?, summary_tokens?}], recall: [[fill_percent, recall_percent], ...], notes: [ENGINE A6 notes], questions: 20}`.
- The desk: a bar for the window with each loaded item as a segment (label
  and tokens in words beside the bar on phones), the fill as `{pct}% of a {window}-token window`.
- Each item offers the four levers (C2.o3), in this order: `Don't load it`
  (removes it), `Shrink it` (caps it: tokens to `ceil(tokens/4)`; marked
  `capped`), `Move it out` (replaced by a pointer of `pointer_tokens`, default
  20: the model can fetch it, marked `pointer`), `Summarize it` (to
  `summary_tokens`, default `ceil(tokens/5)`; a summarized `needed` item keeps
  only what its note keeps, below). Each lever can be undone.
- Recall: the share of the 20 seeded questions about `needed` items answered
  right, from the `recall` curve at the current fill (linear between points),
  labelled `Illustrative numbers, not from a real model.`; a needed item that
  was not loaded answers wrong, a pointer answers right (one extra fetch,
  counted), a summarized one answers right only if a kept note covers it.
  `Ask 20` runs them with the PRNG and shows right / wrong marks per question.
- Compaction: `Compact now` with the A6 `keep` kinds as checkboxes; the
  summary text comes from the simulator's A6 summary function (no copy), shown
  as the new first message, with the notes kept and dropped listed in words.
- Values: `fill_percent`, `recall_percent` (read-only), `window` (settable).
- Evidence: `this.evidence("desk", {fill_percent, recall_percent, levers})` on
  each `Ask 20`.

## 4. `hx-cacheline` (C4: prompt caching) — after A6 JS
`src` JSON: `{blocks: [{id, label, part, text, changes}], calls, pricing: {fact}, cache_rules: {min_tokens, ttl_ms, facts: [...]}, invalidator?}`.
`part` is `tools`, `system` or `messages` (the request's three parts, cached in
that order); `changes` is `never`, `every_call` (a timestamp) or `grows` (the
history and the new turn).
- The request as a column of blocks in send order, each with tokens and a
  `changes` mark in words. The learner reorders blocks within the rules of the
  API (tools before system before messages; within a part, freely) with
  `Move up` / `Move down`.
- Simulate `calls` calls (default 6): call `c` renders each `every_call` block
  with `t=<c>` and appends one history block per call to `grows`. The cache
  numbers come from the simulator's A6 cache function (no copy): per call, a
  stacked bar of read, write and uncached tokens (marks plus words:
  `from cache`, `written`, `not cached`), and the cost with and without the
  cache. Totals: hit rate and the saving, with each price's fact chip.
- `Find the silent invalidator` (when `invalidator` names a block): the
  learner taps the block they think breaks the cache; right or wrong, show the
  first block that differs between call 1 and call 2 and why.
- A line under the figure: `The course's model of prompt caching: one breakpoint at the end, exact prefix match.`
- Values: `hit_percent`, `saving_percent` (read-only).
- Evidence: `this.evidence("cacheline", {order, hit_percent})` on each
  reorder that changes the hit rate, and on the invalidator pick.

## Acceptance (quote final lines)
```
node --test "site/assets/components/test/*.test.mjs"
PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node tools/qa/run.mjs --only labs/stack.html labs/outage.html --out <your scratch>/qa
```
(then `labs/desk.html labs/cacheline.html` in the second round). QA 0 failures
with self-tests counted. View each at 375 and 1280, both themes.

## Report
Per round: files; checks and final lines; sizes; UI copy beyond the strings
above; demo data; model choices you made inside the rules above; deviations;
open doubts. Don't commit.
