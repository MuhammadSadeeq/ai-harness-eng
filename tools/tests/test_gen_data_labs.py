"""gen_data compiles a module's lab data.

content/<ID>/labs/<name>.json becomes site/data/labs/<ID>/<name>.json.
"""

from __future__ import annotations

import json
from pathlib import Path

from tools.gen_data import build_plan


def _root(tmp_path: Path) -> Path:
    (tmp_path / "content" / "A1" / "labs").mkdir(parents=True)
    return tmp_path


def test_lab_data_is_written_under_its_module(tmp_path: Path) -> None:
    root = _root(tmp_path)
    lab = root / "content" / "A1" / "labs" / "sampler.json"
    lab.write_text('{"prompt": "The sky is", "candidates": []}')
    plan = build_plan(root)
    out = {o.rel: o.text for o in plan.outputs}
    expected = {"prompt": "The sky is", "candidates": []}
    assert json.loads(out["site/data/labs/A1/sampler.json"]) == expected


def test_lab_data_that_is_not_an_object_is_a_problem_and_not_written(tmp_path: Path) -> None:
    root = _root(tmp_path)
    (root / "content" / "A1" / "labs" / "bad.json").write_text("[1, 2]")
    (root / "content" / "A1" / "labs" / "broken.json").write_text("{")
    plan = build_plan(root)
    rels = {o.rel for o in plan.outputs}
    assert "site/data/labs/A1/bad.json" not in rels and "site/data/labs/A1/broken.json" not in rels
    messages = [p.message for p in plan.problems]
    assert any("must be a JSON object" in m for m in messages)
    assert any("invalid JSON" in m for m in messages)
