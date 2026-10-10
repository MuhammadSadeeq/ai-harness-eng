#!/usr/bin/env bash
# Run the same checks as the CI "Checkers" job, locally, before every push.
# Usage: tools/ci_local.sh            (uses .venv/bin if present)
#        tools/ci_local.sh --qa       (also runs browser QA on site/ pages)
set -euo pipefail
cd "$(dirname "$0")/.."
PY=python; RUFF=ruff; MYPY=mypy
if [ -x .venv/bin/python ]; then PY=.venv/bin/python; RUFF=.venv/bin/ruff; MYPY=.venv/bin/mypy; fi
export PYTHONDONTWRITEBYTECODE=1
step() { printf '\n== %s\n' "$*"; }
step "lint";            $RUFF check tools site/assets/py
step "types";           $MYPY
step "checker tests";   $PY -m pytest -q 2>&1 | tail -1
step "course + docs";   $PY tools/render_curriculum.py --check; $PY tools/check_content.py | tail -1; $PY tools/gen_data.py --check | tail -1
step "content";         for t in facts snippets katas steps scenarios wire; do $PY tools/check_$t.py | tail -1; done
step "palette";         $PY tools/qa/check_palette.py | tail -1
step "rein";            (cd rein && PYTHONPATH=src ../$PY -m pytest -q 2>&1 | tail -1 && ../$RUFF check . && ../$MYPY | tail -1)
if [ "${1:-}" = "--qa" ]; then
  step "browser qa";    PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-/opt/pw-browsers}" node tools/qa/run.mjs --cvd | tail -1
fi
printf '\nci_local: all checks passed\n'
