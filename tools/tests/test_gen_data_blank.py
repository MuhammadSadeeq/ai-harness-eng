"""gen_data writes a from-memory kata's blank: memory_blank in site/data/katas/<id>.json.

The blank is one comment line, the imports its stubs need, then one stub per name the tests import
from kata: the reference solution's header as written, with a body of `...`. No docstring, no hint.
"""

from __future__ import annotations

import json
import shutil
from pathlib import Path
from typing import Any

from tools.gen_data import build_plan
from tools.lib.course import REPO

COMMENT = "# Write it from memory. The tests import these names."


def _compiled(root: Path, kata: str) -> dict[str, Any]:
    plan = build_plan(root)
    out = {o.rel: o.text for o in plan.outputs}
    data: dict[str, Any] = json.loads(out[f"site/data/katas/{kata}.json"])
    return data


def _course(root: Path) -> None:
    (root / "course.json").write_text(json.dumps({"modules": []}), encoding="utf-8")


def test_the_c9_policy_blank_is_its_stub_text_exactly(tmp_path: Path) -> None:
    _course(tmp_path)
    folder = tmp_path / "katas" / "C9-policy"
    folder.mkdir(parents=True)
    for name in ("meta.yaml", "solution.py", "test_kata.py", "starter.py"):
        shutil.copyfile(REPO / "katas" / "C9-policy" / name, folder / name)
    blank = _compiled(tmp_path, "C9-policy")["memory_blank"]
    assert blank == f"{COMMENT}\ndef decide(call, rules, mode):\n    ...\n"


def test_a_blank_keeps_annotations_defaults_imports_and_classes(tmp_path: Path) -> None:
    _course(tmp_path)
    folder = tmp_path / "katas" / "X1-demo"
    folder.mkdir(parents=True)
    (folder / "meta.yaml").write_text(
        "id: X1-demo\nmodule: X1\ntitle: Demo\nobjectives: [X1.o1]\nminutes: 5\n"
        "hints:\n  - a\n  - b\n  - c\nfrom_memory: true\n",
        encoding="utf-8",
    )
    starter = "def pick(x):\n    raise NotImplementedError\n"
    (folder / "starter.py").write_text(starter, encoding="utf-8")
    (folder / "solution.py").write_text(
        '"""Demo."""\n'
        "import json\n"
        "from typing import Any\n"
        "import math\n"
        "\n"
        "\n"
        "class Box:\n"
        '    """A box."""\n'
        "\n"
        "    def __init__(self, size: int) -> None:\n"
        "        self.size = size\n"
        "\n"
        "\n"
        "def pick(items: list[Any], limit: int = 3) -> list[Any]:\n"
        '    """Pick."""\n'
        "    return items[:limit]\n"
        "\n"
        "\n"
        "def helper():\n"
        "    return json.dumps(math.pi)\n",
        encoding="utf-8",
    )
    (folder / "test_kata.py").write_text(
        "from kata import Box, pick\n\n\ndef test_pick():\n    assert pick([1]) == [1]\n",
        encoding="utf-8",
    )
    blank = _compiled(tmp_path, "X1-demo")["memory_blank"]
    assert blank == (
        f"{COMMENT}\n"
        "from typing import Any\n"
        "class Box:\n"
        "    ...\n"
        "\n"
        "def pick(items: list[Any], limit: int = 3) -> list[Any]:\n"
        "    ...\n"
    )


def test_a_name_the_solution_does_not_define_is_a_problem(tmp_path: Path) -> None:
    _course(tmp_path)
    folder = tmp_path / "katas" / "X2-missing"
    folder.mkdir(parents=True)
    (folder / "meta.yaml").write_text(
        "id: X2-missing\nmodule: X2\ntitle: M\nobjectives: [X2.o1]\nminutes: 5\n"
        "hints:\n  - a\n  - b\n  - c\nfrom_memory: true\n",
        encoding="utf-8",
    )
    (folder / "starter.py").write_text("x = 1\n", encoding="utf-8")
    (folder / "solution.py").write_text("x = 1\n", encoding="utf-8")
    (folder / "test_kata.py").write_text("from kata import gone\n", encoding="utf-8")
    plan = build_plan(tmp_path)
    assert "site/data/katas/X2-missing.json" not in {o.rel for o in plan.outputs}
    assert any("does not define: gone" in problem.message for problem in plan.problems)


def _write_kata(tmp_path: Path, kata_id: str, solution: str, tests: str) -> None:
    _course(tmp_path)
    folder = tmp_path / "katas" / kata_id
    folder.mkdir(parents=True)
    (folder / "meta.yaml").write_text(
        f"id: {kata_id}\nmodule: X9\ntitle: T\nobjectives: [X9.o1]\nminutes: 5\n"
        "hints:\n  - a\n  - b\n  - c\nfrom_memory: true\n",
        encoding="utf-8",
    )
    (folder / "starter.py").write_text("x = 1\n", encoding="utf-8")
    (folder / "solution.py").write_text(solution, encoding="utf-8")
    (folder / "test_kata.py").write_text(tests, encoding="utf-8")


def test_a_name_only_in_an_annotation_gets_the_future_import(tmp_path: Path) -> None:
    solution = "Number = int\n\n\ndef total(values: list[Number]) -> int:\n    return sum(values)\n"
    _write_kata(tmp_path, "X3-alias", solution, "from kata import total\n")
    blank = _compiled(tmp_path, "X3-alias")["memory_blank"]
    assert blank == (
        f"{COMMENT}\nfrom __future__ import annotations\n"
        "def total(values: list[Number]) -> int:\n    ...\n"
    )


def test_a_default_naming_an_undefined_name_is_a_blank_error(tmp_path: Path) -> None:
    solution = (
        "Number = int\n\n\ndef total(values: list[int], start: int = Number(0)) -> int:\n"
        "    return sum(values)\n"
    )
    _write_kata(tmp_path, "X4-default", solution, "from kata import total\n")
    plan = build_plan(tmp_path)
    assert "site/data/katas/X4-default.json" not in {o.rel for o in plan.outputs}
    messages = [problem.message for problem in plan.problems]
    named = [m for m in messages if "X4-default" in m and "Number" in m and "annotation" in m]
    assert named, messages
