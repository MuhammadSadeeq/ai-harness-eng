# BLUEPRINT BP-1.4: `hx-replay` (the Replay Deck) and `hx-incident` (the Incident Room)

Phase 1, wave 2. Builder rules: `.claude/agents/hx-builder.md`. You never commit.

## Read first
`docs/COMPONENTS.md` (all; binding), `docs/DESIGN.md` §2–§4, §7.2, §7.4,
§7.9, §8, §9, §11, §12, `docs/ENGINE.md` §9 (events) and A4 (the incident
block), `site/assets/components/lib/{hx-element,data}.js`,
`site/assets/core/hx.css` (shared patterns: keys, readouts, plates, chips,
radios; reuse them), `site/assets/core/glyphs.svg` (one symbol per event kind
and per wire), the seed tapes in `scenarios/`, and the approved prototype
`site/proto/v2/break.html` + `app.js` (its replay is the visual starting point:
reuse and clean up, don't reinvent).

## You own
- `site/assets/components/hx-replay.js`, `hx-replay.css`
- `site/assets/components/hx-incident.js`, `hx-incident.css`
- `site/assets/components/lib/explain.js` (event → plain sentence)
- `site/assets/components/lib/transcript.js` (the shared transcript and lane
  strip both components draw)
- `site/assets/components/test/{explain,transcript}.test.mjs` (pure logic, Node)
- `site/labs/replay.html`, `site/labs/incident.html` (demo pages)

Nothing else. Other builders are writing `hx-clock`, `hx-wire`, `hx-bench`,
`hx-check`, `hx-num`, `hx-kata` and `hx-cards` at the same time. To get your tags
loaded, tell me in your report and I add them to `components/registry.js`
(paths relative to `site/assets/core/shell/loader.js`, for example
`"hx-replay": "../../components/hx-replay.js"`). Until then your demo pages may
load your modules with their own `<script type="module">`, which I remove at
integration.

## Data
`setup()`: `getTape(id)`, `getBoard(id)`, `getFacts()`, then
`runTrial(tape, board, seed, { facts })` once. All state derives from the
returned `events` (and `result`). Never re-implement harness logic.

## 1. `lib/explain.js`
`explain(event, ctx) -> { text, terms }` where `ctx` = `{ events, index }`
(the full list and this event's index) and `terms` lists the course terms the
sentence uses (for the first-use checker later). Use **exactly** these
templates. `{x}` is a field and `N` a count; numbers are written with
thousands separators (`10,991`). Plurals follow the count ("1 tool call",
"2 tool calls").

| kind | text |
|---|---|
| `run_start` | `The run starts. Task: "{task}".` |
| `prompt_built` | `The harness builds the prompt from {layers as "system, tools and history"}: {tokens} tokens.` |
| `context_check` none | `The prompt fills {percent}% of the {window}-token window.` |
| `context_check` overflow | `The prompt is {tokens} tokens, but the window holds {window}. It can't be sent.` |
| `model_call` attempt 1 | `The harness sends the prompt to the model.` |
| `model_call` attempt > 1 | `Attempt {attempt}: the harness sends the same prompt again.` |
| `model_error` | `The call fails: {message}.` + (retry_after_ms > 0: ` The server asks for a wait of {s} s.`) |
| `retry_wait` | `The harness waits {wait as "1.2 s" or "800 ms"} before trying again.` |
| `breaker` | `{failures} failures in a row: the breaker opens and the run stops.` |
| `recovery_check` attempts 1 | `The call went through on the first try.` |
| `recovery_check` attempts > 1 | `The call went through after {attempts} attempts.` |
| `model_reply` tool_use | `The model asks for N tool call(s): {names joined "read_file and edit_file"}.` |
| `model_reply` end_turn | `The model says it is done.` |
| `model_reply` max_tokens | `The reply hit its length limit and stops mid-way.` |
| `model_reply` refusal | `The model declines the task.` |
| `interrupt` human | `You stop the run. N tool call(s) were still waiting to run.` |
| `interrupt` operator | `Turn 60: an operator notices the run and stops it.` |
| `permission` rule `none` | `No permission policy: {tool} runs.` |
| `permission` allow | `{tool} is allowed by {rule}: {reason}.` |
| `permission` ask | `The policy asks a person about {tool} ({reason}). They {approve / deny}.` |
| `permission` deny | `{tool} is denied by {rule}: {reason}.` |
| `sandbox` allowed | `The sandbox lets {tool} through.` |
| `sandbox` blocked | `The sandbox blocks {tool}: {reason}.` |
| `tool_call` ok | `{tool} runs and returns {output_tokens} tokens.` + (truncated: ` The result is cut to fit.`) |
| `tool_call` not ok | `{tool} fails: {first line of output, at most 80 characters}.` |
| `verify` passed | `The harness checks the work: the tests pass.` |
| `verify` failed | `The harness checks the work: the tests fail, so it sends the failure back.` |
| `guard` max_turns | `The turn limit ({limit}) is reached, so the harness stops the run.` |
| `guard` budget | `The token budget ({limit}) is spent, so the harness stops the run.` |
| `guard` loop | `The last {limit} tool calls were identical, so the loop guard stops the run.` |
| `trace_write` | `The trace records N event(s).` + (redacted > 0: ` N secret(s) are hidden.`) |
| `run_end` done, passed | `The run ends: done, and the checks pass.` |
| `run_end` done, not passed | `The run ends "done", but the checks fail: a false done.` |
| `run_end` unverified | `The run ends unverified: the work still fails its checks.` |
| `run_end` max_turns / budget / loop | `The run ends: stopped by the {turn limit / token budget / loop guard}.` |
| `run_end` circuit_open | `The run ends: the breaker stopped it.` |
| `run_end` interrupted | `The run ends: interrupted.` |
| `run_end` error | `The run ends with an error.` |
| `run_end` refused / max_tokens_reply | `The run ends: the model declined.` / `The run ends: a reply hit its length limit.` |

Also export `turnSummary(events, turn)`: the live-region sentence for a turn,
`Turn {n} of {N}: {explain(the turn's model_reply, or its last event)}`.

## 2. `lib/transcript.js` (shared)
Pure functions plus small DOM builders, used by both components:
- `rows(events, { detail })`: transcript rows. `detail="story"` (default)
  hides `prompt_built`, `context_check` with action none, `model_call`,
  `recovery_check` and `trace_write` from the transcript (they still appear
  as lane marks); `detail="full"` shows every event. A `model_reply` row shows
  the model's words as a quoted line (serif); a `tool_call` row is a small card
  (tool name, its input as compact JSON, its result, at most 6 lines with
  "show all"); every other event is a one-line harness row with its glyph.
- `repeats(events)`: for each `tool_call`, the turn of the first earlier
  identical call (same tool and `pyjson(input)`), or null. A repeat shows a
  `seen at turn 4` chip.
- `laneStrip(...)`: the 8-lane strip (lanes in turn order: control, context,
  loop, errors, tools, permissions, verify, observe; DESIGN §3 colors and line
  styles; the glyph of each event kind as its mark). The x of an event is its
  **index** (step order), not `t`; faint rules mark turn boundaries, labelled
  with the turn number where there is room. A playhead marks the current event.

## 3. `hx-replay`
Attributes: `tape` (required), `board` (default `tape.boards[0]`), `seed`
(default `tape.golden_seeds[0]`), `start` (seq, default 0), `detail`
(`story` | `full`, default story), `wire` (an initial filter), `locked`.

Layout (DESIGN §7.2, all of it):
- **Phone (< 700 px)**: compact instrument bar
  (`Turn 4/14 · Desk 26% · ≈ $0.0264`), then the lane strip (≤ 96 px tall),
  then the transcript (current row highlighted, its explanation inline under
  it), then the **sticky transport** in the thumb zone: Back · **Step**
  (primary) · Play/Pause · speed 1×/2×/4× · counter `12 / 100`. The transport
  is at most 22 % of an 812 px screen; keys 48 px.
- **≥ 700 px**: three readout windows (Turn, Desk, Cost), the lane strip with
  lane labels, and the transcript beside or under it; the explanation is a
  callout on the selected row.
- The **strip is one scrubber control**: `role="slider"` with
  `aria-valuemin=0`, `aria-valuemax=<events-1>`, `aria-valuenow`, and
  `aria-valuetext` = `Event 12 of 100, turn 3: <explain text>`. Arrow keys
  ±1, PageUp/PageDown ±10, Home/End, and a pointer tap or drag selects the
  nearest event. Its hit area is ≥ 44 px tall. − / + steppers sit beside it.
- **Readouts** derive from the playhead: Turn = the event's turn of the run's
  `turns`; Desk = the latest `context_check.percent` at or before the playhead
  (0 before the first); Cost = the latest `model_reply.cost` at or before it,
  shown as `≈ $0.0264` (4 decimals, `cost / 1e9`) when the tape's pricing names
  a fact, else `≈ 0.0264 units`. Readout values use mono 600 in the instrument
  window style from `hx.css`.
- **Step/Back** move to the next/previous **visible** row (respecting
  `detail` and the wire filter). **Play** steps every 700 ms at 1× (350 ms at
  2×, 175 ms at 4×), stops at the end, and is a Pause key while playing. No
  autoplay: the replay starts paused at `start`.
- **Wire filter**: lane labels (≥ 700 px) or a row of 8 wire chips (phones)
  isolate one wire; Step/Back then move between that wire's events and a text
  line says `Showing: Permissions only · Show all`.
- **Friendly / Wire** toggle for the current event's detail: the sentence, or
  the event as pretty-printed JSON (2-space indent, keys sorted).
- **Live region**: at most one message per turn while stepping or playing
  (`turnSummary`), and the result at the end
  (`The run ends: …`, from explain).
- **End**: the first time the playhead reaches the last event, dispatch
  `hx-result` `{source: "replay", status, passed, turns, cost}` and
  `this.evidence("replay", {tape, board, seed, status, passed})`.
- **locked**: the transport and the scrubber are disabled (not hidden) and
  one line reads `Make your prediction above to unlock the run.`
- Values (COMPONENTS §10): `hxValue("seq")` (read-only), `hxValue("turn")`
  (read-only); `hx-change` when they change.
- Long runs: the b2-old spiral has 484 events. Stepping, scrubbing and Play
  must stay smooth (no full re-render of 484 rows per step: update the
  highlighted row and the readouts; render the transcript once per filter or
  detail change). Measure: 200 consecutive Step presses on b2-old in the demo
  page take under 2 s in headless Chromium.

## 4. `hx-incident`
Attributes: `tape` (required; must have an `incident` block), `locked`.
Replays `incident.board` at `incident.seed` with `detail="full"` (the first
bad event can be a system event, such as c5's `prompt_built`).

Flow (DESIGN §7.4):
1. **Hunt.** Heading `Tap the first event where things went wrong.` Every
   transcript row is a target (≥ 44 px), in one list with roving focus (arrow
   keys move, Enter or Space taps). The lane strip above is for orientation
   and selects the row it points at.
   - A tap on `first_bad_seq` or any `accept_seqs` entry: found.
   - A tap on a seq with a `notes` entry: show that note.
   - Otherwise earlier than `first_bad_seq`: `Too early: that step was reasonable.`;
     later: `Too late: things had already gone wrong before this.`
   - From the second wrong tap on, also show `incident.hint`.
   - The hunt is **never hidden or reset** by a wrong tap; the tapped row gets
     a mark and a word ("too early"), so the learner sees what they tried.
2. **Found.** The row gets a found mark; show `incident.why`. Then **name it**:
   the failure family (whole-row radios: the right family and two others from
   `course.json` `failure_families`, picked deterministically with the
   simulator's PRNG seeded by the sum of the tape id's character codes, then
   shuffled with the same PRNG) and the wire (8 radios in turn order with
   glyphs). Commit with one key; feedback per choice in one line each.
3. **Fix it.** `incident.fixes` as whole-row radios; after commit every option
   shows its `why`, the right one marked.
4. **Result.** `Found in 38 s. Par is 60 s.` and `2 wrong taps`. Time is
   measured from unlock (or the first render when not locked) to the found
   tap; it is shown only after success. Dispatch `hx-result`
   `{source: "incident", wrong_taps, seconds, fix_ok}` and
   `this.evidence("incident", {tape, wrong_taps, seconds, family_ok, wire_ok, fix_ok})`.

## 5. Both components
- Follow COMPONENTS.md completely (fallback, ready, state, evidence, a11y,
  motion, `__test`, size ≤ 40 KB per module + CSS).
- Reduced motion: no smooth scroll and no tweening; the highlight and the
  playhead jump.
- Copy: the templates above, DESIGN §11 voice, no other jargon. Anything else
  the UI says (button labels, headings, empty states) goes in your report so I
  can review it.
- `selfTest()` drives the real UI:
  - replay: click Step 3 times, check the counter and the Turn readout; press
    End on the scrubber; check that the `hx-result` fired and the live text is
    the end sentence;
  - incident: tap an early row (expect "Too early"), tap a late row (expect the
    hint to show), tap `first_bad_seq` (expect found), commit the right family,
    wire and fix, and check the result line.

## 6. Demo pages
`site/labs/replay.html`: `b2-spiral` on `b2-old` (story), `c9-approval` on
`c9-new` (full), and a third replay with `locked` (it stays locked; the page
says so). `site/labs/incident.html`: the `s0-false-done` and `c5-interrupt`
incidents. Use the AUTHORING §2 page skeleton (no beats, no `data-module`),
`tokens.css` + `hx.css` + `app.js` like `site/design.html`. Every component
needs a real no-JS fallback (a sentence plus a small static summary, for
example the run's outcome line).

## Acceptance (quote final lines)
```
node --test "site/assets/components/test/*.test.mjs"
PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node tools/qa/run.mjs --only labs/replay.html labs/incident.html
```
(`check_content.py` checks module pages only; demo pages are covered by QA.)
QA must report 0 failures (axe at 375 and 1280, both themes, before and after
your self-tests; the 14 px floor including SVG text; no horizontal scroll).
Then open the screenshots in `tools/qa/out/` at 375 and 1280, light and dark,
and say what you checked in each. Also report: module + CSS sizes, the
200-step timing, and the explain-copy test count (every template row covered).

## Report
Files; checks and final lines; sizes and timing; screenshots reviewed and what
you fixed after looking; any UI copy beyond the templates; deviations; open
doubts (with the choice you made). Don't commit.
