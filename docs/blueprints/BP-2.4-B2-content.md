# BLUEPRINT BP-2.4: B2 "The agent loop" (the exemplar module)

Phase 2. Builder rules: `.claude/agents/hx-builder.md`. You never commit. This
module is **the bar**: every later module is held to it. The director reviews
it hardest; expect more than one round.

## Read first
- `docs/AUTHORING.md` (all, twice): skeleton, beats, voice, terms, components,
  facts, katas, cards/say/checks, proving your work.
- `docs/DESIGN.md` §6.3, §7.2–§7.7, §11; `docs/COMPONENTS.md` §10–§12.
- The book chapter "The agent loop" (sections: "Ten lines that change
  everything", "What the loop does with each stop reason", "A loop needs more
  than one exit", "Where the other seven wires plug in") in
  `/tmp/claude-0/-home-user-ai-harness-eng/4512a573-cc00-58ec-8db9-1f17cfd98bb0/scratchpad/book.txt`.
  The book is the owner's; you upgrade it, you don't paste it. Its claims about
  products need verified facts like anything else.
- `course.json` → module `B2` (objectives, misconceptions, terms, interactions,
  family `almost-done-spiral`, prerequisite `B1`), and the modules before it on
  the path (`S0`, `A1`–`A7`, `B1`): only their terms may be used, plus B2's own.
- `facts/api.yaml` (`api.stop-reason-*`, `api.tool-results-single-user-message`,
  `api.tool-result-unrun-call`), `facts/papers.yaml` (`papers.react-*`).
- The tape `scenarios/b2-spiral.json` and boards `b2-old`, `b2-new`; the demo
  pages in `site/labs/` (how each component is used).

## You own
`site/modules/the-agent-loop.html`, `content/B2/{terms,cards,say,checks}.yaml`,
`katas/B2-loop/`. Nothing else (missing component features, facts or terms go in
your report).

## The module, beat by beat (structure decided; you write the words)
Prose budget: ≤ 900 words across beats (the checker warns above 900).
Every objective (`B2.o1`–`B2.o5`) is covered by at least one assessed component
with `data-objective`.

1. **Break** (`#break`): an `hx-check mode="predict"` (`checks.yaml`
   `B2-p1`: "This run has edited and tested four times. What happens next?",
   3 options, each with its `why`; `outcome` line) gating an `hx-incident
   tape="b2-spiral" locked`. After it, 2–4 sentences that name what happened in
   plain words ("the model kept saying it was almost done; nothing in the loop
   could stop it") without explaining the mechanism yet. `data-objective` on
   the incident: `B2.o3 B2.o4`.
2. **See** (`#see`): the mechanism.
   - The loop in about ten lines of Python (a `pre` code block, stdlib only,
     typed): call the model with the full history, read `stop_reason`, run the
     requested tools, append **all** results in **one** user message, repeat.
   - An `hx-clock tape="b2-spiral" board="b2-new" turn="3"` figure ("One turn,
     around the clock") with a Try-this caption.
   - What the loop does with each stop reason: a short table (`end_turn`,
     `tool_use`, `max_tokens`, `refusal`, `pause_turn`, `stop_sequence`) where
     every row's claim is a `.fact` span on its `api.stop-reason-*` fact, and the
     "what the loop does" column is the course's own guidance.
   - `hx-wire tape="b2-spiral" board="b2-new" turn="3" diff` ("What the loop
     sends") to show the history growing: append-only, results matched by id.
   - "A loop needs more than one exit": `end_turn` is a done **claim**, not
     proof; the second exit is the harness's (a turn limit, a token budget).
   - Where the other seven wires plug in: one paragraph pointing at the clock.
   - Define every B2 term with `dfn` at first use: agent loop, turn, ReAct
     (with a `.fact` on `papers.react-*`), turn limit, exit, token budget, done
     claim. `terms.yaml` holds their definitions (AUTHORING §5).
   - Checks: `B2-c1` (check mode, `B2.o2`: a reply with `stop_reason`
     `max_tokens` arrives mid-tool-call; what should the loop do?) and `B2-c2`
     (`B2.o5`: which wire does a turn limit belong to?).
3. **Fix** (`#fix`):
   - Lab: `hx-bench id="bench-par" tape="b2-spiral" old="b2-old" new="b2-new"
     knob="turn_limit.max_turns" knob-min="4" knob-max="30" par="cheapest-worst-case"`
     with one sentence of prose carrying a pointer-only `hx-num` for the knob and
     a reading `hx-num` for `passed.new` (DESIGN §7.7). `data-objective="B2.o3"`.
   - Kata `katas/B2-loop/` (`hx-kata kata="B2-loop"`, `data-objective="B2.o1 B2.o2"`):
     the learner writes `run_loop(model, tools, task, max_turns, max_tokens)`
     against a tiny fake model given in the kata (stdlib only): calls the model,
     runs requested tools by name, returns every result in one user message,
     treats an unknown tool as an `is_error` result (not an exception), stops on
     `end_turn` with `"done"`, on the turn limit with `"max_turns"`, on the
     token budget with `"budget"`, and on `max_tokens` / `refusal` with those
     names. 6–9 plain-assert tests; 3 hints (where to look, what to do, nearly
     the code); `from_memory: true`; at least 3 `wrong_solutions` (results in
     separate messages; no turn limit; an unknown tool raises).
4. **Prove** (`#prove`): `hx-bench tape="b2-spiral" old="b2-old" new="b2-new"
   trials="20"` with the prose: the honest sentence comes from the component;
   you add one sentence on noise for scripted runs ("these runs are scripted, so
   they repeat exactly; real models vary, and later modules measure that").
   `data-objective="B2.o3"`.
5. **Keep** (`#keep`): `p.law` exactly "Every run needs more than one exit.";
   `hx-cards src="B2"` (8–10 cards in `cards.yaml`, mixed types: term,
   wire-question, which-wire, spot-bug-json (results split across two
   messages), order-turn, name-family (a spiral trace)); `hx-say src="B2"` (2
   prompts in `say.yaml`: "Walk me through one iteration of an agent loop." and
   "A run never stops. How do you debug it, and what do you change?", each with
   a ~120-word model answer and a 4-item rubric); `aside.portfolio` with 1–3
   bullets (for example: your kata from memory under 5 minutes; the par value
   with its reason).

## Rules that bite
- Facts: any claim about the API, a product or a paper is a `.fact` span on a
  **verified** fact and says no more than its `claim`. No typed product numbers.
- No typed counts (use `hx-count`); course-made numbers come from components.
- The page skeleton exactly (AUTHORING §2), plus the generated-region markers
  `<!-- gen:module-meta --><!-- /gen -->` inside `header.module-head` and
  `<!-- gen:course-map --><!-- /gen -->` where the shell's course map goes (copy
  the placement from `site/index.html`); `tools/gen_pages.py` fills them.
- Voice: AUTHORING §4. No hype words, no exclamation marks, short sentences.

## Acceptance (quote final lines)
```
.venv/bin/python tools/check_content.py site/modules/the-agent-loop.html
.venv/bin/python tools/check_katas.py && .venv/bin/python tools/check_katas.py --pyodide
.venv/bin/python tools/check_facts.py
.venv/bin/python tools/gen_data.py && .venv/bin/python tools/gen_data.py --check
PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node tools/qa/run.mjs --only modules/the-agent-loop.html
```
`check_content` must pass (terms first-use, prose budget, beats, objectives,
requirements). QA 0 failures. Then read the page top to bottom at 375 px as a
learner who has done B1, and list anything that confused you.

## Report
Files; checks and final lines; the word count per beat; every fact id used;
facts or terms you needed but couldn't use; deviations; open doubts. Don't
commit.
