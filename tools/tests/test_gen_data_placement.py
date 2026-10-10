"""gen_data's placement kind (BP-3.1b §1): content/<module>/placement.yaml to site/data."""

from __future__ import annotations

import json
import shutil
from pathlib import Path

import pytest

from tools.gen_data import main

FIXTURES = Path(__file__).resolve().parent / "fixtures" / "content"

GOOD = """\
questions:
  - id: s0-q1
    part: S
    question: What does the model see on each call?
    options:
      - text: Only the newest message
      - text: Everything the harness sends, including the system prompt
        right: true
      - text: Its own memory
    why: The model sees exactly what the harness sends on that call.
  - id: a1-q1
    part: A
    question: Is a model's answer the same every time?
    options:
      - text: "Yes"
      - text: "No"
        right: true
    why: Sampling makes answers vary from run to run.
  - id: a1-q2
    part: A
    question: What is a context window?
    options:
      - text: The number of tokens a model can take in at once
        right: true
      - text: A browser tab
    why: The window bounds the prompt, the reply and the tools together.
rules:
  - part: S
    skip_if_right: 1
    of: 1
    start: S0
  - part: A
    skip_if_right: 2
    of: 2
    start: A1
start: T1
"""


def placement_root(tmp_path: Path, text: str) -> Path:
    root = tmp_path / "root"
    shutil.copytree(FIXTURES, root)
    folder = root / "content" / "S0"
    folder.mkdir(parents=True, exist_ok=True)
    (folder / "placement.yaml").write_text(text, encoding="utf-8")
    return root


def test_placement_compiles_to_one_json_per_module(tmp_path: Path) -> None:
    root = placement_root(tmp_path, GOOD)
    assert main(["--root", str(root)]) == 0
    output = root / "site" / "data" / "placement" / "S0.json"
    compiled = json.loads(output.read_text(encoding="utf-8"))
    assert compiled["start"] == "T1"
    assert [q["id"] for q in compiled["questions"]] == ["s0-q1", "a1-q1", "a1-q2"]
    assert compiled["rules"][1] == {"part": "A", "skip_if_right": 2, "of": 2, "start": "A1"}


def test_placement_output_is_up_to_date_after_a_write(tmp_path: Path) -> None:
    root = placement_root(tmp_path, GOOD)
    assert main(["--root", str(root)]) == 0
    assert main(["--root", str(root), "--check"]) == 0


def test_a_placement_with_no_rules_is_valid(tmp_path: Path) -> None:
    text = GOOD.split("rules:\n", 1)[0] + "rules: []\nstart: A1\n"
    root = placement_root(tmp_path, text)
    assert main(["--root", str(root)]) == 0


BAD = [
    ("part: S\n    question", "part: Z\n    question", "is not a course part"),
    ('      - text: "Yes"\n      - text: "No"\n        right: true',
     '      - text: "Yes"\n        right: true\n'
     '      - text: "No"\n        right: true', "exactly one option with right"),
    ("of: 2\n    start: A1", "of: 3\n    start: A1", "of is 3"),
    ("start: T1", "start: Q9", "is not a course module"),
    ("start: T1", "start: T1\nextra: 1", "unknown key: extra"),
]


@pytest.mark.parametrize(
    ("old", "new", "message"), BAD, ids=["part", "two-rights", "of-count", "start", "extra-key"],
)
def test_a_bad_placement_is_named_and_not_written(
    tmp_path: Path, capsys: pytest.CaptureFixture[str], old: str, new: str, message: str,
) -> None:
    assert old in GOOD, "the fixture text changed; update the case"
    root = placement_root(tmp_path, GOOD.replace(old, new))
    assert main(["--root", str(root)]) == 1
    assert message in capsys.readouterr().out
    assert not (root / "site" / "data" / "placement" / "S0.json").exists()
