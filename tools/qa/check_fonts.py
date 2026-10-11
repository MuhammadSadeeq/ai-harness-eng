#!/usr/bin/env python3
"""Check that every character the site's text uses is in the font faces that draw it (DESIGN §5).

The seven faces in site/assets/fonts are subsets built from the site's own text
(tools/vendor/build_fonts.py). A page renders a character from one of them, so a character that is
missing from a face falls back to the system font, and the page looks different on each machine.
This check scans the site the way the build does (tools/lib/font_text.py) and fails with the
character, its code point and one file that uses it, when a face that should draw it does not.

A character is fine when every face has it. KNOWN_FALLBACKS lists the characters that no face of a
family can draw (the source fonts do not have them), with the faces they are missing from and why.
Such a character is shown with a system font today, and this list keeps that the only exception. A
new character that is missing from a face fails until it is added here with a reason, or the text is
changed. Rebuild the subsets with `python tools/vendor/build_fonts.py` after the text changes.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import Final

from fontTools.ttLib import TTFont

REPO: Final[Path] = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO))
from tools.lib.font_text import SITE, scan_site  # noqa: E402

FONT_DIR: Final[Path] = SITE / "assets" / "fonts"
FACES: Final[tuple[str, ...]] = (
    "newsreader-latin-400-normal.woff2",
    "newsreader-latin-400-italic.woff2",
    "newsreader-latin-600-normal.woff2",
    "harnessed-sans-400.woff2",
    "harnessed-sans-600.woff2",
    "harnessed-mono-400.woff2",
    "harnessed-mono-600.woff2",
)
NEWSREADER: Final[frozenset[str]] = frozenset(
    face for face in FACES if face.startswith("newsreader")
)
ALL_FACES: Final[frozenset[str]] = frozenset(FACES)
# code point -> (faces that lack it, why). The source fonts do not have these characters.
KNOWN_FALLBACKS: Final[dict[int, tuple[frozenset[str], str]]] = {
    0x03C4: (ALL_FACES, "Greek tau in a fact's text (data/facts.json); no face has Greek"),
    0x1D70F: (ALL_FACES, "math italic tau in a fact's text (data/facts.json), outside the BMP"),
    0x2420: (ALL_FACES, "symbol for space, drawn by hx-tokenizer.js; no face has it"),
    0x25A0: (ALL_FACES, "black square, drawn by hx-desk.js; no face has it"),
    0x25A1: (ALL_FACES, "white square, drawn by hx-desk.js; no face has it"),
    0x2192: (NEWSREADER, "rightwards arrow, in board-tags.js; Plex has it, Newsreader does not"),
    0x2194: (NEWSREADER, "left-right arrow, in hx.css; Plex has it, Newsreader does not"),
    0x2248: (NEWSREADER, "almost equal to, in hx-forgetful.js; Plex has it, Newsreader does not"),
    0x2265: (NEWSREADER, "greater-than or equal to, in design.html; Plex has it, not Newsreader"),
}


def cmaps(fonts: Path) -> dict[str, set[int]]:
    return {face: set(TTFont(str(fonts / face)).getBestCmap()) for face in FACES}


def check(site: Path = SITE, fonts: Path = FONT_DIR) -> tuple[list[str], int]:
    """The problems found, and how many characters the site uses."""
    maps = cmaps(fonts)
    used = scan_site(site)
    problems: list[str] = []
    for code_point, where in sorted(used.items()):
        missing = {face for face in FACES if code_point not in maps[face]}
        if not missing:
            continue
        allowed = KNOWN_FALLBACKS.get(code_point)
        if allowed is not None and missing <= allowed[0]:
            continue
        problems.append(
            f"U+{code_point:04X} {chr(code_point)!r} is not in "
            f"{', '.join(sorted(missing))}; used in {where}"
        )
    return problems, len(used)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Check the site's characters against its fonts.")
    parser.add_argument("--site", type=Path, default=SITE, help="site directory to scan")
    parser.add_argument(
        "--fonts", type=Path, default=FONT_DIR, help="directory of the seven font files"
    )
    args = parser.parse_args(argv)
    problems, count = check(args.site, args.fonts)
    for problem in problems:
        print(f"problem: {problem}")
    if problems:
        print(f"check_fonts: FAILED ({len(problems)} characters)")
        return 1
    print(
        f"check_fonts: {count} characters in {len(FACES)} faces OK "
        f"({len(KNOWN_FALLBACKS)} known fallbacks)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
