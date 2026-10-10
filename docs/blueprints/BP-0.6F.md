# BLUEPRINT BP-0.6F: seed the facts registry from the Phase 0 research drafts

Phase 0. Fact-checker rules: `.claude/agents/hx-factchecker.md` (read it
first; it binds you). You may edit only `facts/*.yaml`. You never commit.

## Read first
- `docs/FACTS.md` (all; especially §2 format, §3 sources, §4 status rules)
- `tools/check_facts.py` (the checker you must satisfy; read only)
- Drafts (read only):
  - `…/scratchpad/research/R2/facts-draft.yaml` (Claude API/SDK; entries under a top-level `facts:` key)
  - `…/scratchpad/research/R4/facts-draft.yaml` (standards, papers, vendor posts; a top-level list)
  where `…` = `/tmp/claude-0/-home-user-ai-harness-eng/4512a573-cc00-58ec-8db9-1f17cfd98bb0`

## You own
`facts/<area>.yaml` for the areas in FACTS §2 that the drafts cover. Delete
nothing outside `facts/`. `facts/.gitkeep` may stay.

## Do
1. Move every draft entry into the file named by its id prefix, as a
   top-level YAML list, sorted by id, one blank line between entries.
2. **Model IDs, context windows, output limits and prices** move from `api.*`
   to `models.*` (rename the id: `api.model-opus-5-5-price` → `models.opus-5-5-price`, etc.). Prices get a
   machine-readable `value`, for example
   `value: {input_usd_per_mtok: 4, output_usd_per_mtok: 20}`, using only
   numbers that appear in the quote.
3. Claude docs sources: `source` is the rendered page URL (drop a trailing
   `.md`); put the `.md` URL in `source_alt`. Don't change quotes.
4. Keep `status: unverifiable` entries with their `note`. Remove draft-only
   keys that `check_facts.py` rejects; if an entry would need a key the
   format doesn't have, put it in `note` instead.
5. Add `kind` where obvious: `docs` for vendor docs, `spec` for specs and
   their repos, `paper` for papers, `company-report` for any company-reported
   number (e.g. the OpenAI harness-engineering figures).
6. Re-fetch and re-verify **every entry whose source host you can reach
   today** only if its quote looks suspicious to you (e.g. truncated); do not
   re-verify the rest (they were substring-checked on 2026-10-10).
7. Run `/home/user/ai-harness-eng/.venv/bin/python tools/check_facts.py`
   until it passes.

## Report
```
REPORT BP-0.6F
Files: facts/<area>.yaml (entries per file)
Moved/renamed ids: <old → new, one per line>
Unverifiable: <count> (ids)
Checks: python tools/check_facts.py → <final line>
Open doubts: … | none
```
