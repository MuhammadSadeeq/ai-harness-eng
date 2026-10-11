# BRIEF BP-7.1: the first ten minutes (launch walkthrough)

Reviewer rules: `.claude/agents/hx-reviewer.md`. **The reviewer never edits
project files.** It writes only its report and keeps scripts and screenshots
in the scratch path it is given. Phase 7 (SPEC §10) asks for the 10-minute
"first session" path polished; this walkthrough finds what to polish.

## Set-up
- Serve the clean worktree's `site/` under `/ai-harness-eng/`, as GitHub
  Pages serves a project site (the director gives a server script). Any
  request outside that folder must 404.
- Real input only: clicks, taps, keys, typing. Never `__test` hooks. A fresh
  browser profile per persona (no stored progress).

## Two personas, each timed from the first page load
1. **The newcomer, on a phone (375 × 812).** Knows what a chatbot is, has
   written a little code, has never built an agent. Lands on the home page.
2. **The engineer, on a laptop (1280 × 800).** Has shipped software and
   called a model API; wants to know quickly whether this course is worth
   their time and where to start. Lands on the home page, takes the
   placement check honestly as such a person would.

For each, walk the first ten minutes the way the page invites: what the
course is, the first module (Same model, different harness: its Break
prediction, the replay, See, and on), and the placement check at its end.
Stop at ten minutes of active time, or when the placement has sent you on.

## What to record
- A timeline: minute and second of each step (page shown, first control
  pressed, prediction made, replay finished, first "I get it" moment and why,
  placement started and finished, where it sent you).
- Every friction, with the evidence rule of BP-6.0 (a screenshot or quote, a
  severity, a `file:line`): a control whose purpose is unclear, a word used
  before it is explained, a dead end or a missing next step, a wait (with its
  length), anything that reads as for someone else, a layout that hides the
  next step at 375, an error or a console message.
- Severity: **blocker** (the persona cannot go on or is misled), **major**
  (they hesitate, guess or would likely leave), **minor** (rough, does not
  stop them).
- Whether the home page says, within the first screen, what the course is,
  who it is for and how to start.
- The weight and load time of each page on the path (QA's numbers are
  enough), and whether anything heavy (Pyodide) loads in the first ten
  minutes.

## Report
`<scratch>/phase7-first-session.md`: the two timelines, findings ranked by
severity (each with its evidence and `file:line`), what worked well (so it is
kept), then limits. End with a 3-line summary.
