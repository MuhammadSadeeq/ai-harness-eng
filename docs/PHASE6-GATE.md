# Phase 6 gate: the audit

**Status:** round 1 in progress. Audits 1, 2 and 5 are in and their findings
are fixed or ruled below; audits 3 and 4 are still running. Round 2 (each
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
| 3. Interaction QA | — | — | — | running |
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

### Ruled, not changed

- `katas/lab-turn-limit` is the kata demo page's example, not dead content.
- The 42 misconceptions the audit called "addressed only by the topic" are
  left as they are (the audit marked the fix optional).

## Round 2

Not started.
