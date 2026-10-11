"""The characters the site's text uses: the scan that sizes the font subsets and checks them (DESIGN
§5).

The scan reads every page under site/ (except the vendored Pyodide and CodeMirror), every JSON file
under site/data, and the JS, CSS and Python under site/assets. HTML entities are decoded, and
\\uXXXX / \\u{...} escapes in source are read as the characters they name, so a character the page
renders is found whichever way it is written.
"""

from __future__ import annotations

import html
import json
import re
import unicodedata
from pathlib import Path
from typing import Any, Final

REPO: Final[Path] = Path(__file__).resolve().parents[2]
SITE: Final[Path] = REPO / "site"
SUFFIXES: Final[frozenset[str]] = frozenset({".html", ".js", ".mjs", ".css", ".json", ".py"})
SKIPPED_TOP: Final[frozenset[str]] = frozenset({"vendor"})
# The margin the subset keeps beyond what the scan finds: Basic Latin and the Latin-1 punctuation
# and symbols. Dashes, quotes, arrows and math signs are kept when the scan finds them ("in use"),
# not as whole blocks.
MARGIN: Final[tuple[tuple[int, int], ...]] = (
    (0x20, 0x7E),
    (0xA0, 0xBF),
    (0xD7, 0xD7),
    (0xF7, 0xF7),
)
# Categories that draw no glyph: control, format (zero-width, soft hyphen), unassigned or
# noncharacter, surrogate.
NO_GLYPH: Final[frozenset[str]] = frozenset({"Cc", "Cf", "Cn", "Cs"})
UNICODE_ESCAPE: Final = re.compile(r"\\u([0-9a-fA-F]{4})|\\u\{([0-9a-fA-F]{1,6})\}")


def printable(code_point: int) -> bool:
    """A character that draws a glyph: not a control, format, unassigned or surrogate code point."""
    return unicodedata.category(chr(code_point)) not in NO_GLYPH


def _strings(value: Any) -> list[str]:
    if isinstance(value, str):
        return [value]
    if isinstance(value, dict):
        return [part for key, item in value.items() for part in (_strings(key) + _strings(item))]
    if isinstance(value, list):
        return [part for item in value for part in _strings(item)]
    return []


def codepoints_of(text: str, suffix: str) -> set[int]:
    """The printable characters one file's text uses, read as the file's language writes them."""
    if suffix == ".json":
        try:
            found = {ord(char) for part in _strings(json.loads(text)) for char in part}
        except json.JSONDecodeError:
            found = {ord(char) for char in text}
    else:
        if suffix == ".html":
            text = html.unescape(text)
        found = {ord(char) for char in text}
        for match in UNICODE_ESCAPE.finditer(text):
            found.add(int(match.group(1) or match.group(2), 16))
    return {code_point for code_point in found if printable(code_point)}


def scan_site(site: Path = SITE) -> dict[int, str]:
    """Each printable character the site uses, mapped to the first file (sorted) that uses it."""
    found: dict[int, str] = {}
    for path in sorted(site.rglob("*")):
        if not path.is_file() or path.suffix not in SUFFIXES:
            continue
        relative = path.relative_to(site)
        if relative.parts[0] in SKIPPED_TOP:
            continue
        for code_point in codepoints_of(path.read_text(encoding="utf-8"), path.suffix):
            found.setdefault(code_point, relative.as_posix())
    return found


def subset_codepoints(site: Path = SITE) -> set[int]:
    """What the font subsets keep: every character the scan finds, plus the margin."""
    keep = set(scan_site(site))
    for low, high in MARGIN:
        keep.update(range(low, high + 1))
    return {code_point for code_point in keep if printable(code_point)}


def spec(code_points: set[int]) -> str:
    """The code points as a compact unicodes spec (U+0020-007E,U+00A0-00FF,...) for the font log."""
    runs: list[tuple[int, int]] = []
    for code_point in sorted(code_points):
        if runs and code_point == runs[-1][1] + 1:
            runs[-1] = (runs[-1][0], code_point)
        else:
            runs.append((code_point, code_point))
    parts = [f"U+{low:04X}" if low == high else f"U+{low:04X}-{high:04X}" for low, high in runs]
    return ",".join(parts)
