"""gen_data's slim course (site/data/course-core.json): what the components read, nothing more."""

from __future__ import annotations

import json
import shutil
from pathlib import Path

from tools.gen_data import COURSE_CORE_KEYS, COURSE_CORE_MODULE_KEYS, main

FIXTURES = Path(__file__).resolve().parent / "fixtures" / "content"


def copy_root(tmp_path: Path) -> Path:
    root = tmp_path / "root"
    shutil.copytree(FIXTURES, root)
    return root


def test_the_slim_course_has_the_components_fields_and_no_objectives(tmp_path: Path) -> None:
    root = copy_root(tmp_path)
    assert main(["--root", str(root)]) == 0
    core = json.loads((root / "site" / "data" / "course-core.json").read_text(encoding="utf-8"))
    full = json.loads((root / "site" / "data" / "course.json").read_text(encoding="utf-8"))
    assert set(core) <= set(COURSE_CORE_KEYS) | {"modules"}
    assert set(core) >= {"modules", "parts", "path"} & set(full)
    assert [m["id"] for m in core["modules"]] == [m["id"] for m in full["modules"]]
    for module in core["modules"]:
        assert set(module) <= set(COURSE_CORE_MODULE_KEYS) | {"built"}
        assert "objectives" not in module
    assert core["parts"] == full["parts"]


def test_the_slim_course_is_smaller_than_the_full_one(tmp_path: Path) -> None:
    root = copy_root(tmp_path)
    assert main(["--root", str(root)]) == 0
    core_size = (root / "site" / "data" / "course-core.json").stat().st_size
    full_size = (root / "site" / "data" / "course.json").stat().st_size
    assert core_size < full_size


def test_the_slim_course_is_up_to_date_after_a_write(tmp_path: Path) -> None:
    root = copy_root(tmp_path)
    assert main(["--root", str(root)]) == 0
    assert main(["--root", str(root), "--check"]) == 0


def test_a_module_is_built_when_its_page_exists(tmp_path: Path) -> None:
    root = copy_root(tmp_path)
    assert main(["--root", str(root)]) == 0
    core = json.loads((root / "site" / "data" / "course-core.json").read_text(encoding="utf-8"))
    pages = {p.stem for p in (root / "site" / "modules").glob("*.html")}
    assert pages, "the fixture has module pages"
    for module in core["modules"]:
        assert module["built"] is (module["slug"] in pages)
    first = next(m for m in core["modules"] if m["built"])
    (root / "site" / "modules" / f"{first['slug']}.html").unlink()
    assert main(["--root", str(root), "--check"]) == 1
