"""Every fact id that the live path cites is in the registry (BP-4.2: each claim about the API cites
its fact id, and a claim with no fact waits)."""

from __future__ import annotations

import re
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[2]
LIVE_SOURCES = [
    Path(__file__).resolve().parents[1] / "src" / "rein" / "live.py",
]
CITED = re.compile(r"\b((?:api|models)\.[a-z0-9][a-z0-9.\-]*[a-z0-9])")


def registry_ids() -> set[str]:
    ids: set[str] = set()
    for path in (ROOT / "facts").glob("*.yaml"):
        for entry in yaml.safe_load(path.read_text(encoding="utf-8")) or []:
            ids.add(str(entry["id"]))
    return ids


def test_every_cited_fact_id_exists_in_the_registry() -> None:
    known = registry_ids()
    cited: set[str] = set()
    for source in LIVE_SOURCES:
        # every fact id the live path cites has a hyphen (models.retrieve and file names do not)
        cited.update(t for t in CITED.findall(source.read_text(encoding="utf-8")) if "-" in t)
    assert cited, "the live path cites no facts"
    missing = sorted(cited - known)
    assert not missing, f"cited but not in facts/: {missing}"
