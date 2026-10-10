"""tools/gen_glossary.py: the glossary list, wire tags, taught-in links and the --check contract."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest

import tools.gen_glossary as gen

PAGE_HEAD = "<!doctype html>\n<html><body>\n"
PAGE_TAIL = "</body></html>\n"


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=1), encoding="utf-8")


def make_root(
    tmp_path: Path,
    terms: dict[str, Any],
    *,
    built: dict[str, bool] | None = None,
    glyphs: tuple[str, ...] = ("layers", "hexagon", "cycle"),
) -> Path:
    root = tmp_path / "repo"
    built = built if built is not None else {"A1": True, "T1": False}
    write_json(root / "site" / "data" / "terms.json", terms)
    write_json(
        root / "site" / "data" / "course.json",
        {
            "wires": [
                {"id": "control", "short": "Control", "glyph": "layers"},
                {"id": "tools", "short": "Tools", "glyph": "hexagon"},
                {"id": "loop", "short": "Loop", "glyph": "cycle"},
            ],
            "modules": [
                {
                    "id": "A1",
                    "title": "Talk to a model",
                    "slug": "talk-to-a-model",
                    "wires": ["control"],
                },
                {"id": "T1", "title": "Python tools", "slug": "python-tools", "wires": ["tools"]},
            ],
        },
    )
    write_json(
        root / "site" / "data" / "course-core.json",
        {
            "modules": [{"id": key, "built": value} for key, value in built.items()],
        },
    )
    symbols = "".join(
        f'<symbol id="g-{name}" viewBox="0 0 24 24"><path d="M0 0"/></symbol>' for name in glyphs
    )
    (root / "site" / "assets" / "core").mkdir(parents=True, exist_ok=True)
    (root / "site" / "assets" / "core" / "glyphs.svg").write_text(
        f'<svg xmlns="http://www.w3.org/2000/svg">{symbols}</svg>', encoding="utf-8"
    )
    (root / "site" / "glossary.html").write_text(
        PAGE_HEAD + "<main>\n<!-- gen:glossary -->\n<!-- /gen:glossary -->\n</main>\n" + PAGE_TAIL,
        encoding="utf-8",
    )
    return root


def term(
    tid: str,
    text: str,
    *,
    module: str = "A1",
    wire: str | None = "control",
    definition: str = "A plain definition.",
    aliases: list[str] | None = None,
) -> dict[str, Any]:
    return {
        "id": tid,
        "term": text,
        "definition": definition,
        "module": module,
        "wire": wire,
        "aliases": aliases if aliases is not None else [text],
        "strict": True,
    }


def render(tmp_path: Path, terms: dict[str, Any], **kwargs: Any) -> str:
    root = make_root(tmp_path, terms, **kwargs)
    assert gen.main(["--root", str(root)]) == 0
    return (root / "site" / "glossary.html").read_text(encoding="utf-8")


def test_built_module_links_to_its_page_and_an_unbuilt_one_says_coming(tmp_path: Path) -> None:
    text = render(
        tmp_path,
        {
            "alpha": term("alpha", "alpha", module="A1"),
            "tokens": term("tokens", "tokens", module="T1", wire="tools"),
        },
    )
    assert 'href="modules/talk-to-a-model.html">A1 · Talk to a model</a>' in text
    assert "T1 · Python tools · coming" in text
    assert 'href="modules/python-tools.html"' not in text


def test_aliases_show_only_where_they_differ_from_the_term(tmp_path: Path) -> None:
    text = render(
        tmp_path,
        {
            "same": term("same", "same", aliases=["same"]),
            "other": term(
                "other",
                "additionalProperties",
                aliases=["additionalProperties", "additional properties"],
            ),
        },
    )
    assert text.count("Also written:") == 1
    assert "Also written: additional properties" in text


def test_a_term_with_no_wire_says_so_in_words_and_carries_no_wire_filter_value(
    tmp_path: Path,
) -> None:
    text = render(tmp_path, {"coroutine": term("coroutine", "coroutine", wire=None)})
    assert "Not on a wire" in text
    assert 'data-wire=""' in text
    assert "wire w-" not in text


def test_wire_tag_names_the_wire_and_uses_its_glyph_and_token(tmp_path: Path) -> None:
    text = render(tmp_path, {"loop": term("loop", "loop", wire="loop", module="A1")})
    assert 'class="wire w-loop"' in text
    assert "assets/core/glyphs.svg#g-cycle" in text
    assert 'data-wire="loop"' in text and 'data-wire-name="Loop"' in text


def test_definitions_are_escaped(tmp_path: Path) -> None:
    text = render(tmp_path, {"x": term("x", "x", definition="Use <b>this</b> & that.")})
    assert "Use &lt;b&gt;this&lt;/b&gt; &amp; that." in text
    assert "<b>this" not in text


def test_letters_are_grouped_and_indexed_in_order_with_other_last(tmp_path: Path) -> None:
    text = render(
        tmp_path,
        {
            "zed": term("zed", "zed"),
            "alpha": term("alpha", "alpha"),
            "digits": term("digits", "3d"),
            "alder": term("alder", "alder"),
        },
    )
    index = text[text.index('<nav class="glossary-index"') : text.index("</nav>")]
    assert (
        index.index('href="#letter-a"')
        < index.index('href="#letter-z"')
        < index.index('href="#letter-other"')
    )
    assert (
        text.index('id="letter-a"') < text.index('id="letter-z"') < text.index('id="letter-other"')
    )
    assert "4 terms" in text


def test_unknown_module_is_an_error_and_writes_nothing(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    root = make_root(tmp_path, {"x": term("x", "x", module="Z9")})
    before = (root / "site" / "glossary.html").read_text(encoding="utf-8")
    assert gen.main(["--root", str(root)]) == 2
    assert "unknown module 'Z9'" in capsys.readouterr().err
    assert (root / "site" / "glossary.html").read_text(encoding="utf-8") == before


def test_unknown_wire_is_an_error(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    root = make_root(tmp_path, {"x": term("x", "x", wire="nope")})
    assert gen.main(["--root", str(root)]) == 2
    assert "unknown wire 'nope'" in capsys.readouterr().err


def test_a_wire_glyph_missing_from_the_sprite_is_an_error(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    root = make_root(tmp_path, {"x": term("x", "x")}, glyphs=("hexagon", "cycle"))
    assert gen.main(["--root", str(root)]) == 2
    assert "glyph 'layers' is not in glyphs.svg" in capsys.readouterr().err


def test_the_marker_pair_must_be_present_exactly_once(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    root = make_root(tmp_path, {"x": term("x", "x")})
    (root / "site" / "glossary.html").write_text(PAGE_HEAD + PAGE_TAIL, encoding="utf-8")
    assert gen.main(["--root", str(root)]) == 2
    assert "marker pairs (need exactly 1)" in capsys.readouterr().err


def test_write_then_check_is_clean_and_a_changed_term_is_stale(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    root = make_root(tmp_path, {"x": term("x", "x")})
    assert gen.main(["--root", str(root)]) == 0
    assert capsys.readouterr().out.strip().splitlines()[-1] == "gen_glossary: 1 terms, page written"
    assert gen.main(["--root", str(root), "--check"]) == 0
    assert (
        capsys.readouterr().out.strip().splitlines()[-1] == "gen_glossary: 1 terms, page up to date"
    )

    write_json(
        root / "site" / "data" / "terms.json", {"x": term("x", "x", definition="A new definition.")}
    )
    stale = (root / "site" / "glossary.html").read_text(encoding="utf-8")
    assert gen.main(["--root", str(root), "--check"]) == 1
    captured = capsys.readouterr()
    assert "stale: site/glossary.html" in captured.err
    assert captured.out.strip().splitlines()[-1] == "gen_glossary: 1 terms, page stale"
    assert (root / "site" / "glossary.html").read_text(encoding="utf-8") == stale


def test_the_real_terms_and_course_generate_a_page_that_checks_clean() -> None:
    assert gen.main(["--check"]) == 0
