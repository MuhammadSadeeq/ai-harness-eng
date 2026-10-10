# HARNESSED: authoring contract

Status: **v0 (Phase 0), aligned with DESIGN v2.** File layout, markup and data formats below are
binding now. Component attributes (§6) are provisional until each component
ships in Phase 1. The whole file is finalized in Phase 2 against the exemplar
module (B2), and every lesson learned there is written back here.

If this file and a blueprint disagree, the blueprint wins for that task and
the director fixes this file afterwards.

---

## 1. What you own when you build a module

A module builder owns exactly these paths for module `<ID>` (e.g. `B2`) with
slug `<slug>` (from `course.json`):

```text
site/modules/<slug>.html          the page
content/<ID>/cards.yaml           spaced-repetition cards
content/<ID>/say.yaml             say-it-out-loud interview prompts
content/<ID>/terms.yaml           the terms this module owns (course.json → terms)
content/<ID>/checks.yaml          prediction checks / quiz items (hx-check)
katas/<ID>-<name>/                one folder per kata (see §8)
scenarios/<ID>-<name>.json        scenario tapes used by this module
scenarios/golden/<ID>-<name>.jsonl   their golden traces (generated, see §9)
```

You never edit `course.json`, `facts/`, shared components, other modules,
`site/data/` (generated) or anything in `docs/`. Missing facts, missing
component features and wrong prerequisites go in your report.

## 2. The page skeleton

Every module page is static HTML that reads well **without JavaScript**.
Components upgrade it. Copy this skeleton exactly; fill only the marked parts.

```html
<!doctype html>
<html lang="en" data-module="B2">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>The agent loop · HARNESSED</title>
<meta name="description" content="ONE SENTENCE: what the learner can do after this module.">
<link rel="stylesheet" href="../assets/core/hx.css">
<script type="module" src="../assets/core/app.js"></script>
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<main id="main" class="module">
  <header class="module-head">
    <p class="plate-label">B2 · Part B · From chatbot to agent</p>
    <h1>The agent loop</h1>
    <p class="lede">ONE OR TWO SENTENCES.</p>
    <!-- wires, objectives, prerequisites and the beat strip are rendered by
         app.js from course.json; the checker verifies the h1 matches. -->
  </header>

  <section class="beat" data-beat="break" id="break"> … </section>
  <section class="beat" data-beat="see"   id="see">   … </section>
  <section class="beat" data-beat="fix"   id="fix">   … </section>
  <section class="beat" data-beat="prove" id="prove"> … </section>
  <section class="beat" data-beat="keep"  id="keep">  … </section>
</main>
</body>
</html>
```

- The `<title>` is `<module title> · HARNESSED`; the `<h1>` is the module
  title from `course.json`, character for character.
- Beats appear in the order of the module's kind (`course.json` → `kinds`),
  each exactly once, each with an `<h2>` as its first heading.
- Headings go h1 → h2 → h3 without skipping levels.
- Only these elements are allowed in prose: `p h2 h3 ul ol li a em strong
  code pre figure figcaption table thead tbody tr th td dfn span aside
  details summary img svg` and `hx-*` components. No inline `style`, no inline
  scripts, no external URLs except in `href` of links to primary sources.

## 3. The five beats (core modules)

**1 Break: a cold open on a real failure.**
- One `<hx-incident>` (or `<hx-replay>` with a prediction gate) on the
  module's failure family (`course.json` → `family`).
- Before the replay, the learner commits to a prediction (`hx-check`
  `mode="predict"`). After it, two to four sentences name what happened, in
  plain words, without yet explaining the mechanism.

**2 See: the mechanism, made visible.**
- Plain explanation in short sentences, using the Turn Clock, the Wire View,
  the Replay Deck or a figure. Every new term is introduced with `<dfn>` (§5).
- Metaphors are allowed only next to the real term (`aside.realterm`).

**3 Fix: change the harness.**
- A lab (knobs on the simulator, or the module's lab component), then a
  kata (`<hx-kata>`): the learner writes the actual Python piece.

**4 Prove: show the fix with numbers.**
- `<hx-bench>` comparing the old board with the new one over N seeded
  trials (N ≥ 20), reporting pass rate, pass^k where it matters, cost and turns.
- One sentence on noise: how much of the difference could be luck, and why
  this result is or isn't trustworthy. Scripted runs that are deterministic
  say so ("these runs are scripted, so they repeat exactly; real models vary").

**5 Keep: make it stick.**
- The law (`<p class="law">`), exactly the module's `law` from `course.json`.
- `<hx-cards src="B2">` (6–12 cards from `content/B2/cards.yaml`).
- `<hx-say src="B2">` (2+ prompts from `content/B2/say.yaml`).
- `<aside class="portfolio">`: "What to show from this module", 1–3 bullets.

Concept modules replace Fix and Prove with **Lab** (`data-beat="lab"`) and
**Check** (`data-beat="check"`, at least one `hx-check` with 3+ items). Build
modules put `<hx-step>` in Fix. Guide and career modules use See → Do → Keep.

## 4. Voice and writing rules

- **Plain English, short sentences.** Aim for 15 words; rarely over 25.
- **Second person, present tense.** "You add a turn limit." not "One should…".
- **Define every term at first use** (§5). Never use a term before its module
  (the checker enforces this against the prerequisite graph).
- **Real terms with every metaphor.** "The context window (the desk)…".
- **No hype**: never "revolutionary", "magic", "game-changing", "supercharge",
  "seamless", "unlock", "simply", "just". No exclamation marks.
- **Show uncertainty.** Wherever results vary, show the spread and say so.
  Simulated tokens and costs carry "≈".
- **Numbers carry units and sources.** A number about a product, a company or
  a paper is a fact (§7). Course-made numbers (from our own scripted runs)
  come from a component, never typed into prose.
- **No typed-in counts.** Never write "69 modules" or "eight katas"; counts
  come from `course.json` via `<hx-count of="modules">`. The exception is the
  fixed identity: "eight wires" and "five beats" are allowed.
- **Length.** About 900 words of prose per module across all beats,
  excluding code, components, cards and say-it prompts. The checker warns
  above 900 and fails above 1,000; split the module instead (ask the
  director).
- **Code is Python 3.11+, standard library only** in snippets and katas,
  typed, and runnable. Show API payloads in the Wire View, not in prose.

## 5. Terms

Each term belongs to exactly one module (`course.json` → `modules[].terms`).
The owner module writes its definition in `content/<ID>/terms.yaml`:

```yaml
- id: stop-reason            # kebab-case, unique across the course
  term: stop_reason          # display form, exactly as in course.json
  aliases: [stop reason, stop reasons]   # surface forms the checker scans for
  strict: true               # true: scan prose; false: only tagged uses are checked
  wire: loop
  definition: >-
    The field in every model reply that says why the model stopped:
    end_turn, tool_use, max_tokens and a few others.
```

In the page:

- **First (defining) use**, once, in the owner module:
  `<dfn data-term="stop-reason">stop_reason</dfn>`.
- **Later uses** (any module downstream) may be tagged for a popover:
  `<span class="term" data-term="stop-reason">stop reasons</span>`.
- `strict: false` is for terms that are also everyday words ("task",
  "session", "event", "turn", "run"); they're checked only where tagged.
- A deliberate forward reference ("you'll meet compaction in C3") is written
  `<span class="fwd" data-term="compaction">compaction</span>` and is the only
  allowed early use. Use it at most twice per module.

## 6. Components (provisional until Phase 1)

| Element | Purpose | Key attributes (provisional) |
|---|---|---|
| `hx-replay` | Replay Deck over a tape | `tape`, `board`, `predict` |
| `hx-wire` | Wire View of a turn | `tape`, `turn`, `mode="friendly\|wire"`, `diff` |
| `hx-clock` | Turn Clock; with `board` it is the learner's Harness Board (DESIGN v2 §7.1, D-035) | `tape`, `turn`, `focus`, `board`, `compare="old,new"` |
| `hx-bench` | Knob Bench, Run ×N | `tape`, `trials`, `knobs`, `old`, `new` |
| `hx-incident` | Incident Room | `tape`, `family` |
| `hx-kata` | Python kata (Pyodide) | `kata` (the kata id), `mode="practice\|memory"` |
| `hx-step` | Rein build step | `step` |
| `hx-cards` | Spaced repetition | `src` |
| `hx-say` | Say-it drill | `src` |
| `hx-check` | Prediction check / quiz | `src`, `item`, `mode="predict\|check"` |
| `hx-sort` | Sort items into buckets | `src` |
| `hx-count` | A count from course.json | `of` |
| `hx-num` | A reactive number in prose that drives or reads a figure (DESIGN v2 §7.7) | `for`, `min`, `max`, `step`, `value` |
| labs (§6.2 of SPEC) | `hx-sampler`, `hx-desk`, … | per component |

Every component in a page must contain its **no-JS fallback** as children: a
static figure or table plus a sentence saying what the interaction shows.
Example:

```html
<hx-replay tape="B2-spiral" predict>
  <figure><img src="../assets/figs/B2-spiral.svg" alt="Timeline: 14 tool calls, no end">
  <figcaption>The run calls tools 14 times and never ends on its own.</figcaption></figure>
</hx-replay>
```

Every assessment item carries `data-objective="<ID>.oN"` (one or more,
space-separated), on the component or on the item in its YAML file. Every
objective of the module must be covered at least once.

## 7. Facts

Any claim about a product, API, price, version, date, standard, company
number, paper result or quote must come from the facts registry
(`docs/FACTS.md`). Mark it in the page:

```html
<span class="fact" data-fact="api.parallel-tool-results">All tool results for one
assistant turn go back in a single user message.</span>
```

- The page text must say no more than the fact's `claim`.
- Only facts with `status: verified` may be used. Missing fact → don't write
  the claim; list the needed fact (claim + where you'd source it) in your
  report.
- The chip ("verified Oct 2026") is added by `app.js`; don't type dates.

## 8. Katas

```text
katas/B2-loop/
  meta.yaml        id, module, title, objectives, minutes, hints (3), from_memory (bool)
  starter.py       what the learner starts with; must FAIL the tests
  solution.py      reference solution; must PASS the tests
  test_kata.py     plain-assert tests, no fixtures, no third-party imports
```

- Standard library only, Python 3.11+. Tests import from `kata` (the runner
  copies starter or solution to `kata.py`).
- Tests are plain functions named `test_*` using bare `assert` with a message
  where the failure would otherwise be unclear. No pytest fixtures, marks or
  plugins: the same file runs under pytest (CPython CI) and under the course's
  stdlib runner in Pyodide, and both must agree.
- At least one test must fail for each plausible wrong solution you can think
  of; list those wrong solutions in `meta.yaml` → `wrong_solutions:` as short
  code snippets, and `check_katas.py` verifies each one fails.
- Hints are a ladder: 1 = where to look, 2 = what to do, 3 = nearly the code.

## 9. Scenario tapes and incidents

Tapes follow `scenarios/schema.json` and `docs/ENGINE.md` (A3 lists what the
loader rejects). An incident tape adds the block defined in ENGINE A4:

```json
"incident": {
  "family": "almost-done-spiral", "wire": "loop", "board": "b2-old", "seed": 1,
  "first_bad_seq": 29, "accept_seqs": [31],
  "why": "Here the model stops fixing and starts circling ...",
  "hint": "Look at what the model does right after the first failed test run in turn 3.",
  "notes": [{"seq": 23, "text": "A failing test is useful news, not the failure. ..."}],
  "fixes": [{"text": "Give the loop more exits: a turn limit and a token budget", "why": "..."},
            {"text": "Tell the model in the prompt to stop when it is stuck", "why": "..."}],
  "correct_fix": 0, "par_s": 60
}
```

How to choose them: `first_bad_seq` is the first event where things went
wrong, judged as the harness engineer (a model's ordinary mistake is not the
failure; the harness letting it through is). `accept_seqs` holds the events of
the same mistake (the tool call of the bad reply, the permission that let it
through). Give every tempting wrong tap a `notes` entry that says why it is
tempting and where to look instead (the symptom at the end, the earlier
ordinary mistake). Each fix's `why` says why it works, or why it is tempting
and wrong.

Golden traces in `scenarios/golden/` are generated by
`python tools/check_scenarios.py --update <tape>` and must match in both the
JS simulator and Rein (parity).

## 10. Cards, say-it prompts, checks

`content/<ID>/cards.yaml`:

```yaml
- id: B2-c1
  type: term            # term | wire-question | which-wire | spot-bug-json | order-turn | name-family
  objective: B2.o2
  front: "The model replied with stop_reason end_turn. What should the loop do?"
  back: "Treat it as a done claim: verify, then return or send back. It is not proof the task is done."
```

Type-specific fields: `which-wire` adds `wire`; `spot-bug-json` adds `json`
and `bug_path`; `order-turn` adds `items` (correct order); `name-family` adds
`trace` (5–10 trace lines) and `family`.

`content/<ID>/say.yaml` (SPEC Appendix C):

```yaml
- id: B2-s1
  objectives: [B2.o1, B2.o3]
  prompt: "Walk me through one iteration of an agent loop."
  model_answer: >-
    About 120 words, in the voice of a strong candidate.
  rubric:
    - "Mentions calling the model with the full history"
    - "Runs only the tools the model requested, after a permission check"
    - "Returns all tool results in one message, matched by id"
    - "Names at least two exits besides end_turn"
```

`content/<ID>/checks.yaml`: `id`, `objective`, `mode` (predict | check),
`question`, `options` (2–5, each `{text, why}`: `why` says why it's right, or
why it's tempting and wrong; **every** option has one), and `answer` (index). A predict item also
has `outcome`: the one line the reveal states after the run (DESIGN §7.3).

## 11. Proving your work

Before reporting, run `tools/ci_local.sh` (the CI checkers job, locally; it
must end `ci_local: all checks passed`), then the checks for your files (one
heavy check at a time) and quote the final lines:

```text
python tools/check_content.py site/modules/<slug>.html
python tools/check_snippets.py site/modules/<slug>.html
python tools/check_katas.py <kata ids>
python tools/check_scenarios.py <tape ids>
python tools/check_facts.py
node tools/qa/run.mjs --only modules/<slug>.html
```

Then look at your own screenshots (375 and 1280 px, day and night) in the QA
output folder and fix anything that looks wrong before reporting.

## 12. Report format

```text
REPORT <blueprint id>
Files: <created/changed paths>
Checks: <command> → <final output line>   (one line per check)
Deviations: <what differs from the blueprint, and why> | none
Missing facts: <claim — suggested primary source> | none
Open doubts: <questions for the director> | none
```
