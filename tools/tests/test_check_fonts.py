"""The font subsets and their check (tools/qa/check_fonts.py, tools/lib/font_text.py; DESIGN §5)."""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO))

from tools.lib import font_text  # noqa: E402
from tools.qa import check_fonts  # noqa: E402


def test_the_site_uses_only_characters_the_faces_draw_or_known_fallbacks() -> None:
    problems, count = check_fonts.check()
    assert problems == [], "\n".join(problems)
    assert count > 100


def test_a_character_no_face_has_fails_with_its_code_point_and_file(tmp_path: Path) -> None:
    site = tmp_path / "site"
    (site / "modules").mkdir(parents=True)
    (site / "modules" / "page.html").write_text(
        "<p>A snowman, \u2603, on the page.</p>", encoding="utf-8"
    )
    problems, _ = check_fonts.check(site, check_fonts.FONT_DIR)
    assert len(problems) == 1
    assert "U+2603" in problems[0] and "modules/page.html" in problems[0]


def test_a_known_fallback_passes_only_for_the_faces_it_is_known_to_miss(tmp_path: Path) -> None:
    site = tmp_path / "site"
    site.mkdir()
    (site / "page.html").write_text("<p>x → y</p>", encoding="utf-8")
    problems, _ = check_fonts.check(site, check_fonts.FONT_DIR)
    assert problems == [], "the arrow is missing from Newsreader only, which is a known fallback"


def test_html_entities_and_source_escapes_are_read_as_the_characters(tmp_path: Path) -> None:
    site = tmp_path / "site"
    (site / "assets").mkdir(parents=True)
    (site / "page.html").write_text("<p>a &mdash; b &#x2603;</p>", encoding="utf-8")
    (site / "assets" / "x.js").write_text('const dash = "\\u2014";', encoding="utf-8")
    found = font_text.scan_site(site)
    assert 0x2014 in found and 0x2603 in found
    assert found[0x2014] == "assets/x.js", "the first file in sorted order that uses it"


def test_json_strings_are_read_decoded_and_zero_width_characters_are_not_counted(
    tmp_path: Path,
) -> None:
    site = tmp_path / "site"
    (site / "data").mkdir(parents=True)
    (site / "data" / "x.json").write_text('{"caf\\u00e9": "\\u2192 ok\\u200b"}', encoding="utf-8")
    found = font_text.scan_site(site)
    assert 0x00E9 in found and 0x2192 in found
    assert 0x200B not in found, "a zero-width space draws no glyph"


def test_the_subset_keeps_every_character_the_scan_finds() -> None:
    keep = font_text.subset_codepoints()
    assert set(font_text.scan_site()) <= keep


def test_the_spec_writes_runs_as_ranges() -> None:
    spec = font_text.spec({0x20, 0x21, 0x22, 0x7E, 0xA0, 0x2014})
    assert spec == "U+0020-0022,U+007E,U+00A0,U+2014"


def test_the_site_scan_skips_vendored_engines(tmp_path: Path) -> None:
    site = tmp_path / "site"
    (site / "vendor" / "pyodide").mkdir(parents=True)
    (site / "vendor" / "pyodide" / "big.js").write_text("☃", encoding="utf-8")
    assert 0x2603 not in font_text.scan_site(site)


@pytest.mark.parametrize("face", check_fonts.FACES)
def test_each_face_is_a_woff2_file(face: str) -> None:
    assert (check_fonts.FONT_DIR / face).read_bytes()[:4] == b"wOF2"
