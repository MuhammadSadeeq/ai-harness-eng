# BRIEF BP-3.8-facts: harness facts for G1 and G2, and wave 3.6 gaps

Fact-checker rules: `.claude/agents/hx-factchecker.md` and `docs/FACTS.md`.
You edit only `facts/*.yaml`. Run this brief **after** BP-3.2-facts (still
pending: do it first, in the same session), and write one report for both.

Add each fact **only if a primary source supports it**, with a verbatim
quote fetched today; tighten the claim to the quote. A page you cannot fetch
makes the fact `unverifiable` with a note; never a mirror, never a cache, and
never a route around a denied host (openai.com and its docs are denied:
D-052; for Codex use its official repository on github.com, which is the
vendor's own primary source).

## New area: `harnesses` (create `facts/harnesses.yaml`)
Products' own documentation only. Docs pages are not versioned: record the
fetch date, and the product version when the page states one. Each claim says
what the product does, never how well.

| id (proposed) | Claim to check | Primary source | Used by |
|---|---|---|---|
| `harnesses.cc-memory-files` | Claude Code reads project instructions from a `CLAUDE.md` file (name the locations the docs list). | Claude Code docs (code.claude.com/docs, or the docs host Anthropic links from claude.com/product/claude-code) | G1.o1 (control) |
| `harnesses.cc-permission-modes` | Claude Code's permission modes, by the docs' names (for example default, accept edits, plan mode, bypass), and what each allows. | Claude Code docs (permissions / settings) | G1.o1 (permissions), G1 terms |
| `harnesses.cc-plan-mode` | What plan mode does, in the docs' words (it reads and plans without editing). | Claude Code docs | G1 term "plan mode" |
| `harnesses.cc-auto-mode` | What the docs call auto mode (or auto-accept), and what it lets run without asking. | Claude Code docs | G1 term "auto mode" |
| `harnesses.cc-hooks` | Hooks run commands at named points in the session (name the events the docs list, such as before and after a tool use). | Claude Code docs (hooks) | G1.o1 (control, verify) |
| `harnesses.cc-subagents` | Sub-agents run with their own context window (and their own tools, if the docs say so). | Claude Code docs (sub-agents) | G1.o1 (loop, context) |
| `harnesses.cc-compaction` | Claude Code compacts a long conversation (name the command and whether it also happens automatically). | Claude Code docs | G1.o1 (context) |
| `harnesses.cc-mcp` | Claude Code connects to MCP servers for tools. | Claude Code docs (MCP) | G1.o1 (tools) |
| `harnesses.cc-sandbox` | Claude Code's sandbox uses the operating system's isolation to limit file and network access (name the mechanisms the source names). This is BP-3.2's `harnesses.claude-code-os-sandbox`: one fact, one id. | Claude Code docs or anthropic.com/engineering | G1.o1, C10.o5 |
| `harnesses.codex-agents-md` | Codex reads `AGENTS.md` files for instructions (and where it looks). | github.com/openai/codex (README or docs in the repository, at a tag or commit you name) | G2.o1 |
| `harnesses.codex-sandbox-modes` | Codex's sandbox modes, by the repository's names (for example read-only, workspace-write, full access). | github.com/openai/codex | G2.o1, G2 term "sandbox-first" |
| `harnesses.codex-approval-modes` | Codex's approval modes (when it asks before running a command), by the repository's names. | github.com/openai/codex | G2.o1, G2 term "approval mode" |
| `harnesses.mini-swe-agent-mit` | mini-swe-agent is released under the MIT licence. | github.com/SWE-agent/mini-swe-agent, `LICENSE.md` at tag v2.4.6 | G3 credits |

## Anthropic sources
| id (proposed) | Claim to check | Primary source | Used by |
|---|---|---|---|
| `anthropic.postmortem-2025-issues` | Anthropic's postmortem of three issues in 2025 that degraded Claude's responses: name the three causes in the post's words. | anthropic.com/engineering (the postmortem post) | G1.o3 |
| `anthropic.multi-agent-tokens` | Anthropic's account of its multi-agent research system: how many more tokens multi-agent runs used than chat interactions (and single agents), in the post's numbers, labelled as Anthropic's own. | anthropic.com/engineering ("How we built our multi-agent research system") | F1.o1 |
| `anthropic.multi-agent-when` | The same post's statement of which tasks multi-agent systems suit or do not suit (for example heavy parallel work, or tasks needing shared context). | the same post | F1.o1 |

## Acceptance
`.venv/bin/python tools/check_facts.py` passes; then `.venv/bin/python tools/gen_data.py`
(quote both final lines). `harnesses` is already one of `check_facts`' areas.

## Report
For each id: added / unverifiable / contradicted, one line with the source
URL (and tag or commit for repositories). Then the checkers' final lines.
