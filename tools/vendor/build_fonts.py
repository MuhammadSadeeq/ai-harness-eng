#!/usr/bin/env python3
"""Build the seven self-hosted HARNESSED font files (DESIGN v2 §5).

All seven are subsets of the pinned npm packages, keeping exactly the characters the site's text
uses plus Basic Latin and the Latin-1 punctuation (tools/lib/font_text.py). Harnessed Sans 400 and
600, Harnessed Mono 400 and 600 come from IBM Plex and are renamed, because IBM Plex reserves the
name "Plex" under OFL 1.1 (DESIGN §5, D-013). Newsreader 400, 400 italic and 600 come from the
pinned @fontsource/newsreader package and keep their names: its licence names no Reserved Font Name.

Sources: node_modules/@ibm/<package>/fonts/complete/woff2/ and
node_modules/@fontsource/newsreader/files/ (both installed by `npm ci`). Output: site/assets/fonts/.
Writes LICENSE-OFL.txt, LICENSE-newsreader.txt and FONTLOG.txt. The Plex output is reproducible:
head.modified is set to head.created.
"""

from __future__ import annotations

import datetime as dt
import json
import shutil
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Final

from fontTools import subset
from fontTools.ttLib import TTFont

REPO: Final[Path] = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO))
from tools.lib.font_text import scan_site, spec, subset_codepoints  # noqa: E402

NODE_MODULES: Final[Path] = REPO / "node_modules"
PLEX_DIR: Final[Path] = NODE_MODULES / "@ibm"
NEWSREADER_DIR: Final[Path] = NODE_MODULES / "@fontsource" / "newsreader"
OUT_DIR: Final[Path] = REPO / "site" / "assets" / "fonts"

# The Plex faces keep the features they always had. Newsreader keeps kern, liga and tnum (the site's
# tabular figures), and mark and mkmk, which place accents on their letters.
LAYOUT_FEATURES: Final[list[str]] = ["kern", "liga", "zero"]
NEWSREADER_FEATURES: Final[list[str]] = ["kern", "liga", "tnum", "mark", "mkmk"]
RENAMED_NAME_IDS: Final[tuple[int, ...]] = (1, 3, 4, 6, 16, 17, 21, 22)
# Longest match first, so "IBM Plex Sans" is never renamed before a longer name it belongs to.
RENAMES: Final[tuple[tuple[str, str], ...]] = (
    ("IBM Plex Sans", "Harnessed Sans"),
    ("IBM Plex Mono", "Harnessed Mono"),
    ("IBMPlexSans", "HarnessedSans"),
    ("IBMPlexMono", "HarnessedMono"),
)
PLEX_LICENSE_PACKAGE: Final[str] = "plex-sans"


@dataclass(frozen=True)
class Face:
    package: str
    source: str
    output: str
    face: str


PLEX_FACES: Final[tuple[Face, ...]] = (
    Face("plex-sans", "IBMPlexSans-Regular.woff2", "harnessed-sans-400.woff2", "Sans Regular 400"),
    Face(
        "plex-sans", "IBMPlexSans-SemiBold.woff2", "harnessed-sans-600.woff2", "Sans SemiBold 600"
    ),
    Face("plex-mono", "IBMPlexMono-Regular.woff2", "harnessed-mono-400.woff2", "Mono Regular 400"),
    Face(
        "plex-mono", "IBMPlexMono-SemiBold.woff2", "harnessed-mono-600.woff2", "Mono SemiBold 600"
    ),
)

# Newsreader: static Latin files, subset to the same characters and kept under their own names.
NEWSREADER_FACES: Final[tuple[Face, ...]] = (
    Face(
        "newsreader",
        "newsreader-latin-400-normal.woff2",
        "newsreader-latin-400-normal.woff2",
        "Newsreader Regular 400",
    ),
    Face(
        "newsreader",
        "newsreader-latin-400-italic.woff2",
        "newsreader-latin-400-italic.woff2",
        "Newsreader Italic 400",
    ),
    Face(
        "newsreader",
        "newsreader-latin-600-normal.woff2",
        "newsreader-latin-600-normal.woff2",
        "Newsreader SemiBold 600",
    ),
)


def package_version(path: Path) -> str:
    data: dict[str, Any] = json.loads((path / "package.json").read_text(encoding="utf-8"))
    return str(data["version"])


def rename_name_table(font: Any) -> None:
    """Rename the family-bearing name records so no renamed record contains "Plex"."""
    for record in font["name"].names:
        if record.nameID not in RENAMED_NAME_IDS:
            continue
        text = str(record.toUnicode())
        renamed = text
        for old, new in RENAMES:
            renamed = renamed.replace(old, new)
        if renamed != text:
            record.string = renamed.encode(record.getEncoding())


def subset_face(
    source: Path, target: Path, codepoints: set[int], features: list[str], rename: bool
) -> None:
    # The bounds of each glyph are kept as the package stores them. The subsetter would recalculate
    # them, and a composite glyph's bounds then move by a unit, which changes the anti-aliasing of
    # its pixels.
    font: Any = TTFont(str(source), recalcTimestamp=False, recalcBBoxes=False)
    options = subset.Options()
    options.flavor = "woff2"
    options.layout_features = list(features)
    options.name_IDs = ["*"]
    options.name_legacy = True
    options.name_languages = ["*"]
    subsetter = subset.Subsetter(options=options)
    subsetter.populate(unicodes=sorted(codepoints))
    subsetter.subset(font)
    if rename:
        rename_name_table(font)
    font["head"].modified = font["head"].created
    font.flavor = "woff2"
    font.save(str(target))


def assert_renamed(path: Path) -> None:
    """Re-open a written Plex-derived file and fail if a renamed record still says "Plex"."""
    font: Any = TTFont(str(path))
    for record in font["name"].names:
        if record.nameID in RENAMED_NAME_IDS and "Plex" in str(record.toUnicode()):
            raise RuntimeError(f"{path.name}: name record {record.nameID} still contains Plex")


def assert_woff2(path: Path) -> None:
    with path.open("rb") as handle:
        if handle.read(4) != b"wOF2":
            raise RuntimeError(f"{path.name}: not a WOFF2 file")


def write_licenses() -> None:
    shutil.copyfile(PLEX_DIR / PLEX_LICENSE_PACKAGE / "LICENSE.txt", OUT_DIR / "LICENSE-OFL.txt")
    shutil.copyfile(NEWSREADER_DIR / "LICENSE", OUT_DIR / "LICENSE-newsreader.txt")


def write_fontlog(today: str, unicodes: str, sites: int) -> None:
    lines = [
        "HARNESSED font log",
        f"Generated by tools/vendor/build_fonts.py on {today} from the pinned npm packages below.",
        "",
        "Source packages (exact versions, see package.json):",
        f"  @ibm/plex-sans {package_version(PLEX_DIR / 'plex-sans')}",
        f"  @ibm/plex-mono {package_version(PLEX_DIR / 'plex-mono')}",
        f"  @fontsource/newsreader {package_version(NEWSREADER_DIR)}",
        "",
        "Every face is a subset of its pinned package, to the characters the site's text uses plus",
        f"Basic Latin and Latin-1 punctuation: {sites} characters found on the site",
        "  (tools/lib/font_text.py).",
        f"  unicodes: {unicodes}",
        "  flavor: woff2",
        "",
        "Harnessed Sans and Harnessed Mono: IBM Plex complete static WOFF2 files.",
        f"  layout features: {','.join(LAYOUT_FEATURES)}",
        "",
        'Rename: IBM Plex reserves the name "Plex" under the SIL OFL 1.1 (Reserved Font Name).',
        "A subset is a modified version, so the family names in the name table are changed:",
        "  IBM Plex Sans -> Harnessed Sans; IBM Plex Mono -> Harnessed Mono; PostScript",
        "  IBMPlexSans-* and IBMPlexMono-* -> HarnessedSans-* and HarnessedMono-*.",
        f"  renamed name IDs: {', '.join(str(n) for n in RENAMED_NAME_IDS)}",
        "  kept name IDs (notices): 0, 7, 13, 14",
        "Licence: LICENSE-OFL.txt is the package LICENSE.txt, copied verbatim (IBM Corp.",
        "  copyright notice and the SIL OFL 1.1 text).",
        "",
        "Newsreader: @fontsource/newsreader Latin static WOFF2 files, subset as above.",
        f"  layout features: {','.join(NEWSREADER_FEATURES)}",
        "  not renamed: its licence (LICENSE-newsreader.txt, the package LICENSE, SIL OFL 1.1)",
        "  names no Reserved Font Name, so no rename is needed.",
        "",
        "Files:",
    ]
    for face in PLEX_FACES + NEWSREADER_FACES:
        lines.append(f"  {face.output}  <- {face.package} ({face.face})")
    lines += [
        "",
        "Removed in DESIGN v2: the Harnessed Sans Condensed face and",
        "the Harnessed Sans italic face.",
    ]
    (OUT_DIR / "FONTLOG.txt").write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> int:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    codepoints = subset_codepoints()
    unicodes = spec(codepoints)
    sites = len(scan_site())
    total = 0
    for face in PLEX_FACES:
        source = PLEX_DIR / face.package / "fonts" / "complete" / "woff2" / face.source
        target = OUT_DIR / face.output
        subset_face(source, target, codepoints, LAYOUT_FEATURES, rename=True)
        assert_woff2(target)
        assert_renamed(target)
        total += target.stat().st_size
        print(f"{face.output}\t{target.stat().st_size} bytes")
    for face in NEWSREADER_FACES:
        source = NEWSREADER_DIR / "files" / face.source
        target = OUT_DIR / face.output
        subset_face(source, target, codepoints, NEWSREADER_FEATURES, rename=False)
        assert_woff2(target)
        total += target.stat().st_size
        print(f"{face.output}\t{target.stat().st_size} bytes")
    write_licenses()
    write_fontlog(dt.date.today().isoformat(), unicodes, sites)
    print(f"total (seven files)\t{total} bytes")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
