"""gen_data's slim facts (site/data/facts-core.json): the fields the page reads, no claim."""

from __future__ import annotations

import json
import shutil
from pathlib import Path

from tools.gen_data import FACTS_CORE_KEYS, main

FIXTURES = Path(__file__).resolve().parent / "fixtures" / "content"

FACTS = """\
- id: api.effort
  claim: The effort page says the model has five levels.
  kind: spec
  source: https://example.com/effort
  status: verified
  verified_on: 2026-10-10
  volatility: volatile
- id: models.price
  claim: The list price of the model is below.
  kind: price
  source: https://example.com/price
  status: verified
  verified_on: 2026-10-09
  volatility: volatile
  value: {input_usd_per_mtok: 3.0, output_usd_per_mtok: 15.0}
- id: old.claim
  claim: A claim that is no longer verified.
  kind: spec
  source: https://example.com/old
  status: retired
  verified_on: 2025-01-01
  volatility: stable
"""


def facts_root(tmp_path: Path) -> Path:
    root = tmp_path / "root"
    shutil.copytree(FIXTURES, root)
    shutil.rmtree(root / "facts")
    (root / "facts").mkdir()
    (root / "facts" / "test.yaml").write_text(FACTS, encoding="utf-8")
    return root


def test_the_slim_facts_keep_status_date_source_and_value_and_no_claim(tmp_path: Path) -> None:
    root = facts_root(tmp_path)
    assert main(["--root", str(root)]) == 0
    core = json.loads((root / "site" / "data" / "facts-core.json").read_text(encoding="utf-8"))
    full = json.loads((root / "site" / "data" / "facts.json").read_text(encoding="utf-8"))
    assert set(core) == set(full) == {"api.effort", "models.price"}, "retired facts are in neither"
    for fact_id, entry in core.items():
        assert entry["id"] == fact_id
        assert set(entry) <= set(FACTS_CORE_KEYS) | {"id"}
        assert "claim" not in entry and "kind" not in entry and "volatility" not in entry
    assert core["models.price"]["value"] == {"input_usd_per_mtok": 3.0, "output_usd_per_mtok": 15.0}
    assert "value" not in core["api.effort"]
    assert core["api.effort"]["source"] == "https://example.com/effort"


def test_the_slim_facts_are_smaller_and_up_to_date_after_a_write(tmp_path: Path) -> None:
    root = facts_root(tmp_path)
    assert main(["--root", str(root)]) == 0
    core_size = (root / "site" / "data" / "facts-core.json").stat().st_size
    full_size = (root / "site" / "data" / "facts.json").stat().st_size
    assert core_size < full_size
    assert main(["--root", str(root), "--check"]) == 0
