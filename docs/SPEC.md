# HARNESSED: build spec for an interactive AI harness engineering course

**Who this is for:** the director (an Opus session) in a fresh repository, plus the owner.
**Source material:** the owner's study book, *Harness Engineering, Wire by Wire* (place it at `source/wire-by-wire.html`).
**Status:** v1 spec, October 2026. Every volatile fact in this file is marked **(verify)**.

---

## Owner setup (before the first session)

1. Create the new repository. Put this file in it as `docs/SPEC.md`, and copy your book into it as `source/wire-by-wire.html`.
2. Open a Claude Code session on the repository, with Opus as the main model.
3. Paste the kickoff prompt below. The director creates the Haiku agent definitions itself in Phase 0 (§9.2).

## 0. Kickoff prompt (paste this into the fresh repo's first session)

```text
You are the director of HARNESSED, an interactive, visual course that takes a
learner from zero to a hireable AI harness engineer. The full spec is in
docs/SPEC.md and the owner's study book is in source/wire-by-wire.html.

Your job: decide, plan, orchestrate, integrate and review. Haiku agents
(model: haiku, effort: xhigh, defined in .claude/agents/) do the
implementation and the first-line review.

Rules:
1. Read docs/SPEC.md completely, then skim the source book's outline.
2. Work phase by phase (SPEC section 10). Do not start a phase before the
   previous phase's exit gate passes.
3. Never delegate a decision. Write blueprints with exact file ownership,
   acceptance checks and a report format (SPEC section 9 and appendices).
4. At most 4 agents run at once. Re-use an agent through SendMessage before
   spawning a new one.
5. Review by evidence: run the checkers, look at screenshots at 375 px and
   1280 px, read diffs, and spot-check facts against their sources.
6. Only you commit. Keep CI green. Record every decision in docs/DECISIONS.md.
7. Ask the owner only about the open decisions in SPEC section 14.
   Otherwise use the recommended defaults and keep going.

Start with Phase 0.
```

---

## 1. The product in one paragraph

HARNESSED teaches **harness engineering**: everything around an AI model that turns it into a reliable agent. That covers the loop, tools, permissions, sandboxes, context, recovery, verification, observability, evals and security.

The learner starts with no AI background. They watch real agent runs fail, see the mechanism, fix the harness, prove the fix with numbers, and keep the idea through deliberate practice. They build **Rein**, a complete harness, first in the browser and then locally against a real model. They finish with a measured portfolio and rehearsed interviews for applied-AI, agent-infrastructure and evals roles at AI labs.

**The thesis the learner must feel by chapter 3:** *same model, different harness, different results.*

---

## 2. What makes it different (vs. the owner's earlier course, Oxidize)

Oxidize (a Rust course) used a cast of characters, an island map, XP and a CLI quest trainer. HARNESSED deliberately differs in identity, medium and pedagogy.

| | Oxidize | HARNESSED |
|---|---|---|
| Memory device | Mascot characters per concept | **The system itself is the character**: 8 colored wires, the **Turn Clock**, and the learner's own **Harness Board** |
| Primary medium | Illustrated explainers | A **deterministic agent simulator**: every lesson is a replayable run |
| Lesson rhythm | Read, see, try, check | **Break → See → Fix → Prove → Keep** (failure first, measurement always) |
| Progress | XP and levels | **Readiness**: per-wire skill levels earned only by demonstrated work |
| Code practice | CLI quests in a terminal | **Python in the page** (Pyodide katas and the Rein build), then local runs |
| Look | Dark, ink and oxide, condensed display type | **Light-first engineering schematic**: drafting paper, colored wires, signal pulses. The dark theme is "night shift". |
| Gamification | Bosses, quests | **On-call shifts**: daily incident diagnosis, spaced review that keeps your board "energized", design drills |

### 2.1 Course opinions (pedagogy)

1. **Failure first.** Every lesson opens on a broken run the learner can replay. People remember incidents, not definitions.
2. **Simulation over illustration.** If a concept can be shown as a run, it is shown as a run with real events, not a drawing.
3. **Measure everything.** No fix is "done" until a number proves it, even in the first module (the "Prove" beat).
4. **Real terms only.** Metaphors are allowed as scaffolding, but every picture carries its real term (`tool_use`, `stop_reason`, "circuit breaker") on screen.
5. **Retrieval beats rereading.** Every lesson ends in practice: cards, a kata, and an interview prompt said out loud.
6. **Dated facts.** This field changes monthly. Every volatile claim shows a "verified on" chip that links to its primary source.
7. **Hireability is evidence.** Progress counts only what the learner can show: passed katas, eval numbers, design drills and write-ups.

### 2.2 Technical stances the course teaches (each with evidence *and* counterpoints)

These are positions, not dogma. Each stance's lesson must cite primary sources and present the strongest counter-argument.

1. **Start with a plain loop.** Learn the raw loop before any framework.
2. **Words guide, code enforces.** Rules that matter go in code (hooks, gates), not only in prompts.
3. **Test the harness deterministically; eval the agent statistically.** Scripted models test the harness; evals measure the agent.
4. **Cost per completed task, not per call.**
5. **The smallest context that works.** Prefer just-in-time retrieval over stuffing.
6. **Errors are the main path.** Design recovery first.
7. **Add agents only with a reason**, such as parallelism or context isolation. Many agents bring distributed-systems costs.
8. **Security by removing a leg of the lethal trifecta**, not by prompt wording.

---

## 3. The memory system (the core identity)

### 3.1 The eight wires

These come from the source book. Each wire keeps the same color, glyph, line style, clock position, question and law everywhere in the course. Color is never the only cue: every wire also has a glyph, a label and a line pattern, so the course stays readable for color-blind learners.

| # | Wire | The question it answers | Law (one line to memorize) | Clock position |
|---|---|---|---|---|
| 1 | Control plane | What is the model told, and which instruction wins? | Words guide, code enforces. | 12 |
| 2 | Context & memory | What is on the desk this call, and what is saved? | The smallest window that works. | 1–2 |
| 3 | Loop & state | What happens next, what do we carry, when do we stop? | Every run needs more than one exit. | 3 (the hand) |
| 4 | Errors & recovery | When something fails, how do we continue without spinning? | Errors are the main path. | 4–5 |
| 5 | Tools | What can the model do, and is each tool easy to use? | A tool is a user interface for a model. | 6 |
| 6 | Permissions & sandbox | Which actions are allowed, and how bad can a mistake get? | Judge the action and its target. | 7–8 |
| 7 | Verification & evals | How do we know it's really done, and did the change help? | "Done" is a claim. | 9–10 |
| 8 | Observability | What exactly happened, and where did time and money go? | If it isn't in the trace, it didn't happen. | 11 (rim) |

**One order everywhere.** The table follows the order of a single turn around the clock: Control, Context, Loop, Errors, Tools, Permissions, Verification, Observability. The source book lists the wires in a different order. The course uses the turn order everywhere: lessons, cards, the board and the interview walkthrough. That way learners memorize one sequence that is also a story.

**Mnemonic:** **"Clever Crews Launch Early; Test Pilots Verify Often."**

In design interviews, the learner walks one turn around the clock out loud: "Control assembles the prompt, context checks the budget, the loop calls the model, errors are retried, tools run behind permissions, verification judges done, and observability records it all."

### 3.2 The Turn Clock (signature diagram)

One agent turn is drawn as a clock face. The control plane assembles the prompt at 12. Context checks the budget at 1–2. The model call (with recovery) runs at 3–5. Tools run at 6, gated by permissions at 7–8. Verification judges "done" at 9–10. Observability runs around the rim.

- Each wire plugs in at a **fixed angle, everywhere in the course**, so learners build spatial memory ("permissions live at 7 o'clock").
- A signal pulse travels the clock on every replayed turn.
- Reduced-motion mode replaces the pulse with step highlights.

### 3.3 The Harness Board (persistent progress)

The learner's own harness is a schematic board with 8 sockets.

- **Modules plug in as they're learned.** Lessons unlock modules such as a retry policy, a breaker, a permission policy, a compactor or a verification gate.
- **Any scenario can run on the learner's current board**, so their own harness gets better as they learn.
- **The board shows decay.** Each wire's brightness reflects due spaced-repetition cards. Reviews re-energize it. This replaces the island map and XP.

### 3.4 Failure families

The course keeps a catalog of failure families, each a memorable incident with a trace, the wire at fault and the fix. Seed list, from the source book's field guide (extend it):

- infinite loop / "almost done" spiral
- false "done"
- context flood from one tool output
- approval fatigue
- prompt injection via a fetched page
- cache stampede / cold cache cost
- retry storm without jitter
- non-idempotent retry (double charge)
- lost interrupt (orphaned `tool_use`)
- compaction amnesia
- reviewer rubber-stamp
- eval noise mistaken for improvement
- sandbox escape via a symlink or path traversal
- secret in the trace

---

## 4. Lesson anatomy: Break → See → Fix → Prove → Keep

Every core module follows these five beats. The checker enforces the structure (§8).

1. **Break.** A cold open: an incident replay (10–40 s) on the simulator. The learner predicts what went wrong before scrubbing the trace.
2. **See.** The mechanism, in plain words and short sentences, made visible with the Turn Clock, the Wire View or a diagram. Every new term is tagged and defined on first use.
3. **Fix.** A lab (knobs and choices on the simulator), then a **kata**: write the actual Python piece in the page, with tests.
4. **Prove.** Run the scenario N times (seeded) on the old board and the new one, and read the numbers: pass rate, pass^k, cost, turns. One sentence on noise.
5. **Keep.**
   - the wire's **law**;
   - 6–12 **cards** added to the spaced-repetition deck;
   - 2+ **interview prompts** to answer out loud, each with a model answer and a rubric;
   - a portfolio note: "what to show from this module".

Concept-only modules (for example "What a model does") may replace Fix and Prove with a lab and a prediction check. The checker allows this only when the module is flagged `concept`.

### 4.1 Voice and writing rules

- **Plain English.** Short sentences. Define every term on first use. No hype words ("revolutionary", "magic").
- **Real terms with metaphors.** Name the real term next to every metaphor.
- **Code first in Python.** Show wire JSON in the Wire View, and show Messages-API shapes as they really are, dated (verify).
- **Show the uncertainty.** Wherever results vary, say so and show the spread.
- **Max lengths:** about 900 words of prose per module beat set, excluding code, labs and cards. Split the module if it runs longer.

---

## 5. Curriculum (draft module map; the director finalizes it in Phase 0)

The modules form a prerequisite graph, not a fixed line. A **placement check** at the start lets experienced engineers skip ahead, but cards for skipped modules still enter the deck.

**Learning objectives:** each module lists 3–6 measurable objectives ("By the end you can …"). Each objective maps to at least one assessment item (a card, kata, drill or lab check), and the checker enforces that link.

**Part A — The model (foundations)**

- A1 What a model does: next-token prediction, sampling, temperature. *Lab: Sampler, including "the confident lie".*
- A2 Tokens and the context window: the desk, input and output limits. *Lab: Tokenizer.*
- A3 The stateless model: the messages array *is* the memory. *Lab: the forgetful model.*
- A4 The API call on the wire: roles, content blocks, `stop_reason`, usage, streaming events. *Introduces the Wire View.* (verify)
- A5 Why a model alone is unreliable: six failure modes, and how small errors compound (0.95^n).
- A6 Reasoning and effort as harness knobs: thinking, effort, latency and cost tradeoffs. (verify; vendor-neutral principles, Claude as the concrete example)
- A7 Structured outputs and schemas: JSON Schema, validation, strict tool inputs. (verify)

**Part B — From chatbot to agent**

- B1 Tools give the model hands: `tool_use` / `tool_result` on the wire, ids, `is_error`, parallel calls returned in one message. (verify)
- B2 The agent loop: the ten-line loop, stop reasons, why one exit is not enough.
- B3 What a harness is: Agent = Model + Harness; prompt, context and harness engineering; the OS picture; product vs. user harness.
- B4 The Turn Clock: all eight wires in one turn. *Lab: walk the clock.*

**Part C — The eight wires**

- C1 Control plane: layered instructions rebuilt every turn, the right altitude, AGENTS.md/CLAUDE.md as a map, hooks. *Lab: Instruction Stack.*
- C2 Loop and state: one state object, exits, interrupts that close the books (no orphaned tool calls), pause and resume, append-only history (verify current API constraints).
- C3 Tool design is agent UX: the agent-computer interface, six rules, annotations, shrinking choices, scheduling parallel-safe calls. *Lab: Tool Workbench.*
- C4 MCP, skills and tool scale: the protocol's shape (clients, servers, transports), skills loaded on demand, tool search and deferred loading. (verify)
- C5 Permissions: allow, ask or deny with reasons; risk as action × target; approval fatigue; decision order. *Game: Gatekeeper.*
- C6 Sandboxes: blast walls, containers, network egress allow-lists, secrets handling.
- C7 Context budget: context rot, what eats the budget, four levers in order, readable repos, ordering. *Lab: the Desk.*
- C8 Compaction, memory and caching: compaction vs. reset, memory tiers, prompt caching as prefix matching and its silent invalidators. *Lab: Cache Line.* (verify)
- C9 Errors and recovery: the field guide, keeping wrong outputs in context, backoff with jitter, breakers, idempotent retries. *Lab: Outage Sim.*
- C10 Verification: computational beats inferential, guides and sensors, the verification gate, independent reviewers.
- C11 Observability: traces, spans, what to record, reading traces as the core skill (OpenTelemetry GenAI conventions, verify). *Lab: Trace reading.*

**Part D — Measure**

- D1 Eval anatomy: tasks, environments, graders (code, model, human), transcripts.
- D2 Statistics for a random system: pass@k vs. pass^k, variance, confidence intervals, sample size, infrastructure noise. *Lab: Dice Tower.*
- D3 Evals in practice: regression evals in CI, calibrating an LLM judge, contamination, models that notice tests. *Lab: Eval Bench.*

**Part E — Secure**

- E1 Prompt injection and the lethal trifecta. *Game: Escape Room.*
- E2 Defense in layers: tool supply chain (MCP servers), excessive agency, red-teaming your own agent.

**Part F — Scale**

- F1 Many agents: two honest reasons and one warning; topologies; the bill; isolated vs. forked; it is a distributed system. *Lab: Topologies.*
- F2 Long-running agents: the shift-worker problem, the initializer pattern, planner/generator/evaluator, handoffs. *Lab: Shift Change.*
- F3 Managed agents, where the harness becomes a service: brain, hands and session. (verify; dated)
- F4 Cost and latency engineering: caching, batching, effort, routing, budgets; cost per completed task.
- F5 Production: rate limits, queues, idempotency keys, durable execution and resume, streaming UX, human-in-the-loop UX, gradual rollout.
- F6 **Environments: harnesses that train and test models.** Tasks, graders, sandboxes, determinism, reward hacking. This is the research-engineer track that labs hire for.

**Part G — Real harnesses** (dated teardowns; every claim verified)

- G1 Inside Claude Code, wire by wire.
- G2 Codex, open harnesses and managed agents: what everyone agrees on.
- G3 Reading a real harness repository: a guided code tour method on one small open-source harness (choose the repo, version and license in Phase 0).
- G4 The daily craft: the steering loop, naming the failure family first, build to delete, fighting entropy, harnessable codebases, self-tuning harnesses.

**Part H — Build Rein**

The book's 11 steps, kept and upgraded so every step runs **in the browser** via Pyodide with the FakeModel. Each step can also run locally with a real model.

- H0 Setup: in-browser (no install) or local (venv).
- H1–H11:
  - H1 talk to a model
  - H2 one tool and the loop
  - H3 real tools inside a wall
  - H4 the permission gate
  - H5 a trace
  - H6 a context budget
  - H7 retries and a breaker
  - H8 guards that stop the run well
  - H9 the verification gate
  - H10 project rules
  - H11 a reviewer sub-agent
- H12 From one file to a project: automated checkpoints, the reference package, real evals, the first experiment, the showcase README.
- H13 Extensions, ranked.

**Part I — Get hired**

- I1 The job map, and what labs look for (dated, verify).
- I2 Readiness self-assessment. It is **auto-filled from the learner's evidence**, and they adjust it honestly.
- I3 Four portfolio projects, with templates and checklists.
- I4 Interview Room:
  - coding katas (timed, from memory);
  - Design Room (system design);
  - Trace Debugging;
  - a take-home template;
  - behavioral prompts;
  - 40+ out-loud questions with rubrics.
- I5 A 12-week plan after the course, and mock interview kits for practicing with a friend.

**Toolbelt (optional primers, pulled in by placement):**

- Python typing and dataclasses
- asyncio
- subprocess and signals
- JSON Schema
- HTTP and SSE streaming
- pytest
- containers
- git
- Linux processes
- threads vs. async

Each primer is short, with one kata.

**Mapping from the source book:**

- **Parts and chapters:** Parts 1–6 of the source map to Parts A–I. Chapter content is mined, rewritten into the five beats, and re-verified.
- **Labs:** the 23 source labs map to the interactions in §6.
- **Interview material:** the source's interview questions and system-design answer seed Part I.

---

## 6. Interactions

Every interaction is a web component (`<hx-…>`). It must be deterministic (seeded), keyboard-operable and usable at 375 px. It must expose a test hook (`el.__test`) for Playwright and have a no-JS fallback (a static figure plus text).

### 6.1 Signature interactions (built in the engine phase)

1. **`<hx-replay>`, the Replay Deck.**
   - A timeline scrubber over a simulated run, with one lane per wire in its color and an event glyph per kind.
   - Play, step and scrub.
   - Clicking an event opens its payload.
   - A context-budget bar and a cost meter update live.
2. **`<hx-wire>`, the Wire View.**
   - Toggles between **Friendly** (plain-language cards) and **Wire** (the exact request/response JSON of that turn).
   - Diffs consecutive requests, so learners *see* append-only history and cache prefixes.
3. **`<hx-clock>`, the Turn Clock.** Plays one turn with pulses (§3.2). Tapping a wire shows its question, law and modules.
4. **`<hx-board>`, the Harness Board.** Persistent; it runs any scenario on the learner's board. In the Prove beat it compares "old board vs. new board".
5. **`<hx-bench>`, the Knob Bench.**
   - Knobs (max turns, compaction threshold, retry policy, permission mode, verifier on/off) and a "Run ×20" button.
   - Shows result distributions (pass rate, pass^k, cost and turns histograms), seeded so they are reproducible.
   - It is the Prove beat's engine.
6. **`<hx-incident>`, the Incident Room.**
   - The learner gets a failing trace, clicks the first event where things went wrong, names the failure family and the wire, and proposes the fix.
   - Scored on accuracy and time.
   - It powers Break beats and the daily on-call shift.

### 6.2 Lab interactions (upgraded from the source book's labs)

| Component | Teaches | Mechanic |
|---|---|---|
| `hx-sampler` | Sampling, temperature, confident lies | Pick-the-next-word with a probability bar; temperature slider |
| `hx-tokenizer` | Tokens | Type text and watch tokens (a labeled approximation if no real tokenizer is bundled) |
| `hx-forgetful` | Statelessness | Chat where the learner must resend history to be remembered |
| `hx-workbench` | Tool design | Edit a tool's name, description and schema; a scripted model's misuse rate changes; run ×20 |
| `hx-stack` | Instruction layers | Order layers; see which instruction wins and why |
| `hx-gatekeeper` | Permissions | Stream of tool calls; allow, ask or deny under time pressure; an approval-fatigue meter; consequences replay |
| `hx-scheduler` | Parallel-safe tools | Batch calls into rounds; see time saved and conflicts |
| `hx-desk` | Context budget, compaction | Pack items into the window; watch recall degrade as it fills; choose compaction |
| `hx-cacheline` | Prompt caching | Reorder prompt blocks; see cache reads and cost live; find the silent invalidator |
| `hx-outage` | Retries, jitter, breakers | Simulated provider outage; tune backoff; see retry storms vs. a calm breaker |
| `hx-bugcatch` | Verification | Which checks catch which bugs: self-report vs. tests vs. an independent reviewer |
| `hx-topology` | Multi-agent shapes | Five topologies; cost, latency and failure trade-offs |
| `hx-dice` | pass@k vs. pass^k | Dice-tower visual of independent trials; compute both live |
| `hx-evalbench` | Eval design | Assemble tasks and graders; see noise; compute confidence intervals |
| `hx-escape` | Prompt injection | Red team: plant instructions in a page or email. Blue team: remove a trifecta leg; replay the attack |
| `hx-shift` | Long-running handoffs | Write the handoff note; the next "shift" agent succeeds or fails based on it |
| `hx-costcalc` | Cost engineering | Model tier, effort, cache hit rate and turns → cost per completed task (prices are dated facts) |
| `hx-envbuilder` | RL/eval environments | Build a task, grader and sandbox; find the reward hack the scripted policy exploits |

### 6.3 Practice interactions

- **`<hx-kata>`: Python in the page.** Monaco or CodeMirror (pick one, pinned) with Pyodide, running pytest-style tests. Shows the failing test, a hint ladder (3 levels) and the solution after an attempt.
  - **From-memory mode:** a blank file and a timer, checked by the same tests.
- **`<hx-step>`, the Rein build step.** Diff chunks (green, red, grey), a "copy new lines" button, a run button (Pyodide with FakeModel), the expected output and "break it on purpose" toggles.
- **`<hx-cards>`: spaced repetition.** Leitner or SM-2-lite. Card types:
  - term;
  - wire-question;
  - "which wire?";
  - "spot the bug in this JSON";
  - "order the turn";
  - "name the failure family from this trace snippet".
- **`<hx-design>`, the Design Room.** A system-design prompt, a timer and an 8-wire checklist canvas: drag wire modules into a design and write notes. A model answer and rubric follow, with a self-grade that is stored as evidence.
- **`<hx-say>`: say it out loud.** An interview prompt, a 60–90 s timer, a model answer and a rubric checklist.
- **`<hx-placement>`:** a 15-question placement check that suggests a path.

### 6.4 Global features

- **Daily on-call shift (about 10 minutes):** one incident, the due cards, and one micro-kata or say-it drill.
- **Glossary and keyword index:** every term with its definition, wire, first-use module and a card.
- **Readiness radar:** levels per wire, following the source's rubric:
  - **L1 can explain:** the module's checks passed.
  - **L2 have built:** katas and build steps passed.
  - **L3 can defend with data:** Prove-beat experiments, eval work and design drills.

  Each level links to its evidence, and a printable "brag sheet" summarizes it.
- **Progress store:** `localStorage` under one versioned key. **Export and import a JSON file from day one** (a lesson from Oxidize: learners lose progress across devices). Reset keeps preferences.

---

## 7. The simulator (the engine everything rests on)

### 7.1 One scenario format, two runtimes

A **scenario tape** (JSON) describes the task, the starting virtual workspace, the scripted model turns, injected errors, probabilistic branches and success checks. Every tape runs on:

- the **JS simulator** in the browser (Replay, Bench, Incident, labs);
- the **Python reference harness** (Rein) with its `FakeModel`, in CI and locally.

**Parity is enforced:** for every tape, both runtimes must produce the same golden trace (event kinds and key fields; timing excluded). Any divergence fails CI.

Sketch of the tape (the director finalizes the schema in Phase 1 as `scenarios/schema.json`):

```json
{
  "id": "fix-add-basic",
  "task": "Fix the failing test in calc.py",
  "workspace": { "calc.py": "def add(a, b):\n    return a - b\n" },
  "checks": { "tests": { "pass_if": { "calc.py": { "contains": "a + b" } } } },
  "model": [
    { "say": "I'll read the file.", "tools": [["read_file", { "path": "calc.py" }]] },
    { "error": "overloaded" },
    { "branch": [ { "p": 0.7, "then": [ { "tools": [["edit_file", { "path": "calc.py", "old_text": "a - b", "new_text": "a + b" }]] } ] },
                  { "p": 0.3, "then": [ { "say": "Done." } ] } ] },
    { "say": "Done." }
  ]
}
```

### 7.2 The trace event schema (shared by the sim, Rein and every lab)

Every event carries `v`, `run`, `seq`, `t` (virtual seconds), `turn`, `agent`, `kind` and `wire`, plus kind-specific fields.

**Kinds (seed list):**

- `run_start`
- `prompt_built` (layers, tokens)
- `model_call`, `model_reply` (stop_reason, usage)
- `model_error` (type, attempt), `retry_wait`, `breaker` (state)
- `tool_call` (tool, input, ok, error, output_tokens)
- `permission` (decision, rule, reason)
- `compaction` (before, after), `cache` (read, write)
- `verify` (check, passed, output)
- `guard` (max_turns, loop, budget)
- `interrupt`
- `subagent_start`, `subagent_end`
- `run_end` (status, turns, tokens, cost)

**Final statuses:** `done`, `unverified`, `max_turns`, `budget`, `circuit_open`, `interrupted`.

### 7.3 Simulator rules

- **Virtual clock:** no real waiting.
- **Seeded randomness:** one PRNG per trial.
- **Token counts:** a documented deterministic approximation, always labeled "≈".
- **Virtual file system:** in memory. `run_command` supports a small, documented command set. Test outcomes come from the tape's `checks`.
- **Costs:** taken from the facts registry (dated prices), with a "relative units" toggle so lessons don't break when prices change.
- **Wire View payloads:** built from the tape. They must validate against the pinned official Python SDK's request/response types (`tools/check_wire.py`). (verify the type names at build time; never guess SDK names)

### 7.4 Real model runs

These happen **only locally** (Python CLI) with the learner's own key. **The site never asks for or stores an API key.**

- The local Rein accepts `--fake <tape>` for deterministic runs, or a real model.
- The default model ID comes from config and is checked against the Models API. Recommend a cheap current tier for practice runs and the current flagship for comparisons. (verify: as of Oct 2026 the IDs include `claude-haiku-5-5`, `claude-sonnet-5-5` and `claude-opus-5-5`)
- Teach and handle the current API's behavioral constraints. These are prime harness lessons; for each, verify and date it:
  - `refusal` stop reason handling;
  - append-only history and its effect on thinking blocks;
  - removal of forced `tool_choice` and of assistant prefill on recent models;
  - effort as the main thinking control;
  - parallel `tool_result` blocks returned in one user message.

---

## 8. Correctness system (nothing hallucinated, nothing stale)

**Rule:** a claim, snippet or number that no checker covers is a bug.

| Checker | What it proves |
|---|---|
| `tools/check_snippets.py` | Every `<pre data-run>` Python snippet executes. Expected output matches. `data-raises="X"` must raise X. |
| `tools/check_katas.py` | Every kata's starter fails its tests and its solution passes, in **both** CPython and Pyodide (Node). |
| `tools/check_steps.py` | Applying each Rein step's diffs to the previous step's file reproduces the tested file. The checkpoint output matches exactly. |
| `tools/check_scenarios.py` | JS sim and Python Rein produce identical golden traces for every tape. Tapes validate against the schema. |
| `tools/check_wire.py` | Every Wire View payload validates against the pinned SDK's types. |
| `tools/check_facts.py` | Every `data-fact` id exists in `facts/*.yaml`. Volatile facts were verified within 90 days. Every fact has a source URL, quote and date. |
| `tools/check_content.py` | Module structure (five beats or `concept`), required assets, objectives mapped to assessments, **term first-use order** (no term used before its defining module in the prerequisite graph), no hard-coded counts. |
| `tools/qa/` (Playwright) | Every page loads with zero console errors. Every widget passes its scripted interaction via `__test`. Screenshots at 375/768/1280. axe-core accessibility. Reduced-motion. Color-blind simulation of the wire palette. |
| Rein package | ruff, mypy (strict on the package), pytest (offline, FakeModel), eval runner smoke test. |

**Facts registry.** `facts/*.yaml` entries look like this:

```yaml
- id: api.parallel-tool-results
  claim: "Multiple tool_result blocks for one assistant turn go back in a single user message."
  source: <primary URL>
  quote: "<exact sentence from the source>"
  verified_on: 2026-10-10
  volatility: volatile   # or: stable
```

- In the page, a fact renders as a "verified Oct 2026" chip that links to the source.
- A scheduled CI job flags facts older than 90 days and dead links.
- **Primary sources only:** vendor docs, specs, papers, and the authors' own posts. Company numbers are labeled as the company's own report.

**Single source of truth.** `course.json` holds modules, counts, the prerequisite graph and the wire metadata. Pages and the README read counts from it, and the checker forbids typed-in counts. (Oxidize shipped "77 quests" on one page and "88" on another.)

---

## 9. How Opus and Haiku work (the orchestration contract)

### 9.1 Roles

- **Director (Opus, the main session):**
  - all decisions;
  - specs and blueprints;
  - integration fixes small enough to do in place;
  - review and acceptance;
  - every commit and push;
  - the decision log (`docs/DECISIONS.md`).
- **Builders (Haiku, effort xhigh):** implement exactly one blueprint each, with disjoint file ownership. They verify with the checkers before reporting.
- **Reviewers (Haiku, effort xhigh):** audit against a brief and report findings with evidence. They never edit.
- **Fact-checkers (Haiku, effort xhigh):** fill and verify `facts/*.yaml` from primary sources, with an exact quote.

### 9.2 Agent definitions (create these in Phase 0)

`.claude/agents/hx-builder.md`

```markdown
---
name: hx-builder
description: Builds HARNESSED course pieces (engine, components, modules, katas, scenarios) to an exact blueprint, and proves them with the project's checkers before reporting.
model: haiku
effort: xhigh
---
You build one blueprint for the HARNESSED course. You follow it exactly,
you never guess facts (you check them in the facts registry or report a
missing fact), and you never report success until the named checkers pass
on your files.

Rules:
- Read every file the blueprint lists before writing.
- Touch only the files the blueprint gives you. Never commit, push, branch,
  or delete files you did not create.
- Never run two heavy checks at once (Playwright, Pyodide, full suites).
- Put scratch work under the scratch path you are given; delete it at the end.
- If a tool or command is denied, stop that line of work and report it.
  Never work around a denial.
- Don't start background monitors or watchers.
- Finish with the report format in the blueprint: files, checks run (with
  their final output lines), deviations, open doubts. Keep it short.
```

`.claude/agents/hx-reviewer.md` follows the same frontmatter (haiku, xhigh). Its body:

- it audits against a brief and **never edits** files;
- every finding needs evidence (command output, screenshot path, or source URL plus an exact quote), a severity (blocker / major / minor) and a `file:line`;
- it writes findings to its report file as it goes, so an interruption loses nothing.

`.claude/agents/hx-factchecker.md` uses the same frontmatter. Its body:

- it may only edit `facts/*.yaml`;
- it uses primary sources and quotes them exactly;
- it marks a claim `unverifiable` rather than guessing.

### 9.3 Director rules

1. **Blueprints are complete.** A builder should never need to make a product decision. Each blueprint names the files to read, the files owned, the exact content and behavior, the acceptance checks, and the report format (Appendix A).
2. **Concurrency:**
   - At most **4 agents** at once.
   - Prefer re-tasking an existing agent through SendMessage (it keeps its context) over spawning a new one.
   - Two agents never own the same file.
3. **Review by evidence, every time:**
   - Run the checkers yourself.
   - Look at the screenshots (375 and 1280) of everything that changed.
   - Play each new interaction through its `__test` hook.
   - Read the diff.
   - Spot-check about 10 % of new facts against the source.
4. **One round of notes per deliverable is normal; two is the limit.** Notes are concrete: what to change, where, and how to check it. If a third round is needed, the blueprint was wrong, so fix the blueprint.
5. **Commit after each accepted deliverable.** Make work-in-progress commits only from the director, never from agents. CI stays green on every push.
6. **Permission discipline:** never perform an action an agent reports it was denied. Surface it to the owner.
7. **No silent scope growth.** New ideas go to `docs/BACKLOG.md`, and the owner decides at phase gates.

### 9.4 Pitfalls already paid for in Oxidize (avoid them)

- **Shared build directories:** two agents running heavy checks on a shared build directory raced. Give each agent its own scratch and cache dirs, and serialize Playwright and Pyodide runs.
- **Disk space:** build artifacts filled the disk. Agents clean up their scratch, and the director prunes caches between waves.
- **Leftover watchers:** a lingering watcher kept re-waking a finished agent, which re-sent its report. No background monitors.
- **Concept order:** the audits found terms used before they were taught. That's why there is an automated first-use check (§8).
- **Unproven success:** builders claimed success without running the checkers. Reports must quote the checkers' final output lines.
- **Unseen visuals:** visual bugs were only caught by looking. The director must view screenshots and contact sheets.
- **Drifting counts:** counts drifted between pages. Use `course.json`.
- **No progress export:** learners had no way to move progress. Ship export and import on day one.
- **CDN fonts:** fonts came from a CDN. Self-host OFL fonts.
- **Large media:** large media in git bloats every clone. Put media in Git LFS or a release asset.

---

## 10. Phases and exit gates

| Phase | Work | Agents | Exit gate |
|---|---|---|---|
| **0. Foundations** | The director reads the source and writes `docs/DESIGN.md` (identity, design system, motion rules), `docs/CURRICULUM.md` (final module map, objectives, prerequisite graph, misconceptions per module), `docs/AUTHORING.md` (content contract), `docs/FACTS.md` (policy) and `course.json`. Sets up the repo skeleton, CI, agent definitions and the checker stubs. | Director (+1 builder for skeleton/CI) | Owner approves DESIGN and CURRICULUM. CI is green on the skeleton. |
| **1. Engine** | Design system and app shell, the progress store with export/import, the scenario schema, the JS simulator, Python Rein core + FakeModel, golden-trace parity, and `hx-replay`, `hx-wire`, `hx-clock`, `hx-board`, `hx-bench`, `hx-incident`, `hx-kata` (Pyodide) and `hx-cards`. | 2–3 builders | All checkers run in CI. Parity passes on 5 seed tapes. Every signature component passes QA at 375 and 1280. |
| **2. Exemplar** | **One module built to final quality**, end to end: B2 "The agent loop", with all five beats, an incident, a lab, a kata, Prove, cards, say-it prompts and facts. Plus Rein steps H1–H2. The director reviews hardest here and updates AUTHORING.md with every lesson learned. | 1 builder | The director signs it off as "the bar". AUTHORING.md is final. |
| **3. Content waves** | Parts A → I in prerequisite order: 2–3 modules per builder per wave, then a fact-checker pass, then director review. | 3–4 builders + 1 fact-checker | Each wave is checker-green and reviewed, its facts are verified, and its screenshots are approved. |
| **4. Build track** | Rein H3–H13 in-browser, the local `rein` package (tests, eval runner, real-model adapter), and real eval numbers recorded by the director on a small budget. | 2 builders | `check_steps` and parity are green. The local package passes ruff, mypy and pytest. The eval runner works offline and with a real model. |
| **5. Career track** | Interview Room, Design Room prompts with rubrics, the question bank, portfolio templates, the readiness radar and brag sheet, and the placement check. | 2 builders | The career-track gate list (Appendix D) passes. |
| **6. Audit** | 5 independent Haiku reviewers with distinct briefs (Appendix B): technical accuracy, sequencing and pedagogy, interaction QA, accessibility and mobile, code and tests. Findings go to the original builders as fixes. Then a re-verification round. | 5 reviewers, then builders | No blockers. Majors are fixed. Round 2 confirms. |
| **7. Launch** | README, Pages deploy, the 10-minute "first session" path polished, the facts freshness job scheduled, and optionally a code-generated launch film. | 1–2 builders | The owner's acceptance. |

---

## 11. Tech stack and repo layout

**Stack.**

- **Site:** a static site with no build step, using ES modules and web components (`hx-*`).
- **Fonts:** self-hosted OFL fonts. Recommended: **IBM Plex Sans / Plex Mono**, with Plex Sans Condensed for display; distinct from Oxidize.
- **In-browser Python and editor:** Pyodide and the code editor, each pinned to an exact version at least two weeks old, lazy-loaded only when a kata or step opens, and cached by a service worker.
- **Local Python and tooling:** Python 3.11+ for the local Rein, with ruff and mypy.
- **Browser QA:** Playwright, with `@axe-core/playwright` for accessibility.
- **Hosting:** GitHub Pages, with a GitHub Actions workflow.
- **Budget:** each page under 300 KB, excluding Pyodide.

**Layout.**

```text
source/              owner's study book (reference only)
docs/                SPEC, DESIGN, CURRICULUM, AUTHORING, FACTS, DECISIONS, BACKLOG
course.json          single source of truth (modules, graph, wires, counts)
site/                index, modules/, labs/, assets/{core,components,sim,py,fonts}
scenarios/           tapes (*.json), schema.json, golden/ traces
rein/                local reference harness package, tests/, evals/
katas/               <id>/{starter.py,test_*.py,solution.py,meta.yaml}
facts/               facts registry (*.yaml)
tools/               checkers + qa/ (Playwright)
.claude/agents/      hx-builder.md, hx-reviewer.md, hx-factchecker.md
.github/workflows/   ci.yml, pages.yml, facts-freshness.yml
```

**Design system (outline; DESIGN.md finalizes it).**

- **Surfaces:** drafting-paper light theme with a subtle grid; "night shift" dark theme.
- **Wires:** 8 CVD-tested wire colors, each with a glyph and a line pattern.
- **Trace glyphs, one per event kind:**

  | Event | Glyph |
  |---|---|
  | Model call | rounded box |
  | Tool call | hexagon |
  | Permission | diamond |
  | Error | zigzag |
  | Verify | shield |
  | Compaction | squeeze |

- **Motion:** "signal flow" (pulses along wires) at 150–600 ms, with step-based reduced-motion alternatives.
- **Type size:** no text under 14 px on phones; body text 17–18 px.

---

## 12. Definition of done

**Per module:**

- Five beats present (or flagged `concept`).
- At least 1 incident, 1 lab, 1 kata (unless `concept`), a Prove experiment, 6–12 cards, 2+ say-it prompts, a law, and objectives mapped to assessments.
- All facts registered and verified.
- All checkers green.
- Screenshots at 375 and 1280 approved by the director.

**Whole course:**

- Every Part shipped.
- Rein builds fully in the browser and locally.
- The local package has 20+ offline tests and an eval runner with recorded real numbers.
- Two audit rounds passed.
- The placement check, daily shift, readiness radar, export/import and glossary all work.
- The site is deployed.

---

## 13. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Facts go stale quickly | Facts registry, 90-day freshness CI, visible "verified on" chips, principles taught separately from parameter names |
| Simulator complexity | Exemplar-first. Start with 5 tapes. Parity on event kinds before fields. |
| Pyodide weight and startup | Lazy-load, service-worker cache, a progress indicator; katas also runnable locally |
| Haiku output quality varies | Exact blueprints, exemplar module as the bar, checkers as gates, a hard limit on note rounds |
| Scope creep (this is a big course) | Phase gates, a backlog, owner approval for additions |
| Overclaiming hireability | Honest framing: no course guarantees an offer. Emphasize public, verifiable evidence. |
| Learners running agents unsafely | Sandbox guidance in H3/H4/C6. Fake model by default. Keys never in the browser. Practice folders only. |

---

## 14. Open decisions for the owner (the recommended default is used if no answer)

1. **Product name:** HARNESSED (default), or another.
2. **Build project name:** Rein (default, from the source book).
3. **Primary code language:** Python (default). A TypeScript track can go in the backlog.
4. **Hosting:** GitHub Pages (default).
5. **Licenses:** code MIT; content CC BY-NC-SA 4.0 (default), or all rights reserved.
6. **Source book:** keep `source/` in the repo private, or exclude it from Pages (default: exclude it from the deploy).
7. **Real-model budget** for the director's recorded eval numbers (default: a small capped budget; the director asks before spending).

---

## Appendix A — Builder blueprint template

```text
BLUEPRINT <id>: <title>
Read first: docs/AUTHORING.md, docs/DESIGN.md §…, <exemplar files>, <source book sections>
You own (create/edit only these): <exact paths>
Do not touch: everything else (especially course.json, shared components, other modules)
Build:
  - <exact content/behavior, beat by beat or component API>
  - Facts needed: <fact ids>; missing facts -> list them in your report, do not invent
Acceptance (all must pass; quote final output lines in your report):
  - python tools/check_content.py <paths>
  - python tools/check_snippets.py <paths>
  - python tools/check_katas.py <kata ids>
  - node tools/qa/run.mjs --only <pages>   (one heavy check at a time)
Scratch: <scratch path>; delete when done.
Report (short): files written; checks + final lines; deviations from this
blueprint and why; open doubts.
```

## Appendix B — Audit briefs (Phase 6, five Haiku reviewers)

1. **Technical accuracy:**
   - every API shape, claim and number checked against primary sources or by running code;
   - Rein's behavior checked against its claims.
2. **Sequencing and pedagogy:**
   - prerequisite order and term first use;
   - objectives vs. assessments;
   - five-beat quality;
   - misconceptions addressed;
   - interleaving in drills.
3. **Interaction QA:** every component on every page:
   - seeded determinism;
   - edge inputs;
   - reduced motion;
   - keyboard use;
   - the no-JS fallback;
   - console errors.
4. **Accessibility and mobile:**
   - axe;
   - 375 px layouts;
   - text sizes;
   - the wire palette under color-blind simulation;
   - focus order.
5. **Code and tests:**
   - Rein package quality (types, errors, tests that test behavior);
   - parity coverage;
   - kata test strength (would a wrong solution pass?).

The evidence rule, for every finding:

- command output, a screenshot path, or a source URL with an exact quote;
- a severity;
- a `file:line`.

Reviewers never edit files.

## Appendix C — Say-it rubric format

Each say-it prompt has three parts:

- **Prompt:** "Walk me through one iteration of an agent loop."
- **Model answer:** about 120 words.
- **Rubric:** 4–6 checkable points, for example "mentions trimming to budget", "permission check before running", "read-only tools in parallel", "verifies before accepting done" and "checks limits". The learner ticks what they said, and the results feed readiness L1/L3 evidence.

## Appendix D — Career-track gate list

- 40+ say-it prompts with rubrics, covering every wire plus design, debugging and behavioral.
- 6+ Design Room prompts, each with clarifying questions, a wire-by-wire model answer, named cheating risks, cost and rollout.
- 10+ timed from-memory katas: loop, tool validation, retries with a breaker, permission policy, compaction, trace writer, verification gate, eval runner, pass^k calculator, idempotent retry.
- 4 portfolio project templates (from the source book), each with a README skeleton, a results table and a write-up outline.
- The readiness radar reads real evidence, and the brag sheet prints cleanly.
