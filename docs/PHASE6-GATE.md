# Phase 6 gate: the audit

**Status:** round 1 in progress. Audits 1, 2, 3 and 5 are in and their
findings are fixed, being fixed (BP-6.2) or ruled below; audit 4 is
finishing. Round 2 (each
reviewer re-checks its own findings on the fixed commit) follows.

SPEC §10 sets the Phase 6 exit gate: **no blockers; majors are fixed; round 2
confirms.** Five reviewers, one area each, worked on a clean worktree of
0fef4ca under BP-6.0 (the evidence rule: command output, a screenshot or a
quote; a severity; a `file:line`). Reports: `docs/gate/phase6-audit-*.md`.

## Round 1

| Audit | Blockers | Majors | Minors | Report |
|---|---|---|---|---|
| 1. Technical accuracy | 1 | 56 (73 counting each no-JS dash) | 1 | phase6-audit-1-accuracy.md |
| 2. Sequencing and pedagogy | 1 | 10 | 13 groups | phase6-audit-2-pedagogy.md |
| 3. Interaction QA | 0 | 11 | 3 | phase6-audit-3-interaction.md |
| 4. Accessibility and mobile | — | 1 so far | — | running |
| 5. Code and tests | 0 | 12 | 11 | phase6-audit-5-code.md |

### Blockers (both fixed)

- **D2 taught a false rule** ("two results differ only when their
  intervals do not overlap"; 50/100 and 65/100 overlap, yet p = 0.03).
  Overlap now reads as "this data cannot tell them apart yet" on the page,
  its card, check, say prompt and kata (732c1ff).
- **I5.o2 could not be earned**, so I5 and Part I could never be done. A
  passing memory kata in the Interview Room or the on-call drill credits
  it, declared once on the slot that mounts it (9c8d35f).

### Majors, by what fixed them

- **Credit on success only (D-061, 18c320c):** a wrong incident hunt
  credited its objective; card reviews credited nothing; replays credited
  on any finish. check_content B4 counts only components that credit on
  success.
- **Term order inside components (18c320c):** check_content B7 now reads
  component text; 23 uses before the owning module were reworded or
  glossed. S0.o5 gained a real check.
- **The shift, the board and the bank (D-062, 9c8d35f):** drawn only from
  modules the learner has started, mixed by wire; an exhausted pool
  repeats only a hunt three or more days old.
- **Misconceptions (18c320c):** the 13 no page confronted each get a
  sentence in See.
- **API claims without a fact (3cf18ed, f62be69, cfa7445):** terms and
  cards can carry a fact; 18 glossary terms, 20 card backs and every
  listed sentence are bound; three facts added (BP-6.1).
- **Rein's behavior and numbers (18c320c):** H10's checkpoint retold, H13's
  control sentence, H7 and H0 spans, the sampler span.
- **No-JS dashes (0da426d):** 82 fallbacks carry the true value, computed
  by the components' own code and checked in CI.
- **Code and tests (e5cd18e, 89c134d):** Rein fails cleanly on a malformed
  200 and a bad board; tests pin the spend cap and cache pricing against
  the audit's mutants; parity counts parameterless modules; eight katas
  catch the reviewer's wrong solutions; check_facts checks each span's
  hard tokens (known limit in FACTS §6).
- **A term popover ignored Escape (3cf18ed).**

- **A filtered replay could not be stepped by keyboard (audit 4's blocker,
  BP-6.2 A1):** the arrow keys and the − and + buttons now pass their
  direction, so they move to the next event on the filtered wire; a test
  drives it.
- **Focus lost to BODY in twelve components (D-063, BP-6.2):** a press that
  disabled or hid its own control dropped keyboard focus. Busy and
  range-end controls stay focusable (`aria-disabled`); a control that hides
  itself names its successor; the base moves focus to the same key, that
  successor or the component, and also when the pressed control is still
  focused but hidden. QA walks every lab page by keyboard: 32 losses on the
  audited commit, none now.
- **No-JS blanks (64bab50):** the I5 cards and say prompts and the shift's
  deck had no fallback. They have one; check_content B11 fails an `hx-*`
  element with no fallback text.
- **The skip link (64bab50):** 44 px tall, and it moves focus to `<main>`
  (tabindex -1 on every page; check_content B1 requires it).
- **"Copied" when the copy failed; the hunt scroll ignored the stored
  reduce-motion setting (BP-6.2 A6, A7).** Component reduced-motion blocks
  no longer override a stored "Full" (64bab50).

### Ruled, not changed

- `katas/lab-turn-limit` is the kata demo page's example, not dead content.
- The 42 misconceptions the audit called "addressed only by the topic" are
  left as they are (the audit marked the fix optional).
- A locked run control with `aria-disabled` only (hx-bench) is the intended
  form (D-063); COMPONENTS §10 now says so.
- A hunt is saved when it ends, so a reload mid-hunt restarts it (a few
  taps); COMPONENTS §5 now says so.
- Term markers alone in a table cell (audit 4): their tap area is already
  44 px. The audit measured the element box; `.term::before` is the hit
  area. A hit test at 375 px lands on the term from 0 to 40 px below its
  top on all five cells, in rows 82 to 235 px tall.

## Round 2

Each reviewer re-checks its own findings on the fixed commit and reports
FIXED, NOT FIXED or RULED for each, then any new problem a fix introduced.

| Audit | Commit | Fixed | Not fixed | Ruled | New | Report |
|---|---|---|---|---|---|---|
| 1. Technical accuracy | 283d660 | 55 | 3 | 0 | 4 (1 major) | phase6-audit-1-round2.md |
| 2. Sequencing and pedagogy | 283d660 | 20 | 2 | 2 | 3 (1 major) | phase6-audit-2-round2.md |
| 3. Interaction QA | 509ef41 | — | — | — | — | running |
| 4. Accessibility and mobile | — | — | — | — | — | waits on BP-6.2 |
| 5. Code and tests | 283d660 | 22 | 0 | 1 | 4 (minor) | phase6-audit-5-round2.md |

No blocker in any report so far.

### Round 2 findings, and what closed them

- **Audit 1, not fixed (3):** the glossary's done claim and prompt caching
  now carry facts; B1's "several tools in one reply" is bound to a new
  fact, `api.parallel-tool-calls-one-response`, quoted from the parallel
  tool use page today.
- **Audit 1, new (4):** the spend-cap span had dropped "tier" (major); two
  SDK spans had dropped "Python"; the 429 span was wider than its
  rate-limit claim. Each span now says what its claim says.
- **Audit 2, new major:** a passing on-call drill kata credited I5.o2 under
  I5 and so started I5, pulling it into the pool ahead of its
  prerequisites. The drill now credits I5.o2 only once I5 is started
  (D-062, amended again); a test pins it.
- **Audit 2, new minor:** the "nothing new" note named a new learner's
  first module, which was already the pool. It names the next module
  outside the pool; a replay test pins it.
- **Audit 2, not fixed:** F6's misconception "more tasks fix a weak
  grader" now has its sentence.

- **Audit 5, new (4 minor):** an unclosed fact span flooded check_facts
  with false problems; check_katas named a helper's or an async def's line
  instead of the kata's function; D2's touching test stubbed `wilson`, so a
  correct solution computing its own intervals failed (being fixed).

### Ruled in round 2

- **Term collisions (audit 2, m9):** Rein's "checkpoint" is defined where
  it first appears (rein-setup.html:91: "a checkpoint that compares your
  output with the expected output"); "retry policies" is the everyday
  word. Neither is the strict term the checker reads; left as they are.
- **A price swapped for another number from the same claim (audit 5,
  N5):** check_facts passes it, since the token is in the claim. That is
  the known limit of the hard-token rule (FACTS §6): the rule catches a
  number the claim does not have, not a number moved to the wrong place.
  Spans that state prices are read by the accuracy reviewer.
- **A one-module drill (audit 2, N3):** with one module in the pool and no
  memory kata, the drill is that module's say prompts every day. That is
  intended: the drill reviews what was seen (D-062).
