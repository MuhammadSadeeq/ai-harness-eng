#!/usr/bin/env python3
"""Build the six self-hosted HARNESSED font files from the pinned IBM Plex npm packages.

Source: node_modules/@ibm/<package>/fonts/complete/woff2/ (installed by `npm ci`).
Output: site/assets/fonts/harnessed-*.woff2, LICENSE-OFL.txt, FONTLOG.txt.

Each face is subset to the HARNESSED Latin set with kern, liga and zero kept, and its
`name` records are renamed, because IBM Plex reserves the name "Plex" under OFL 1.1
(DESIGN section 5). The output is reproducible: head.modified is set to head.created.
"""

from __future__ import annotations

import datetime as dt
import json
import shutil
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Final

from fontTools import subset
from fontTools.ttLib import TTFont

REPO: Final[Path] = Path(__file__).resolve().parents[2]
PLEX_DIR: Final[Path] = REPO / "node_modules" / "@ibm"
OUT_DIR: Final[Path] = REPO / "site" / "assets" / "fonts"

UNICODE_SPEC: Final[str] = (
    "U+0000-00FF,U+0131,U+0152-0153,U+02C6,U+02DA,U+02DC,U+2000-206F,"
    "U+2190-2199,U+2212,U+2248,U+2260,U+2264-2265"
)
LAYOUT_FEATURES: Final[list[str]] = ["kern", "liga", "zero"]
RENAMED_NAME_IDS: Final[tuple[int, ...]] = (1, 3, 4, 6, 16, 17, 21, 22)
# Longest match first, so "IBM Plex Sans Condensed" wins over "IBM Plex Sans".
RENAMES: Final[tuple[tuple[str, str], ...]] = (
    ("IBM Plex Sans Condensed", "Harnessed Sans Condensed"),
    ("IBM Plex Sans Cond", "Harnessed Sans Cond"),
    ("IBM Plex Sans", "Harnessed Sans"),
    ("IBM Plex Mono", "Harnessed Mono"),
    ("IBMPlexSansCond", "HarnessedSansCond"),
    ("IBMPlexSans", "HarnessedSans"),
    ("IBMPlexMono", "HarnessedMono"),
)
LICENSE_SOURCE_PACKAGE: Final[str] = "plex-sans"


@dataclass(frozen=True)
class Face:
    package: str
    source: str
    output: str
    face: str


FACES: Final[tuple[Face, ...]] = (
    Face("plex-sans", "IBMPlexSans-Regular.woff2", "harnessed-sans-400.woff2", "Sans Regular 400"),
    Face("plex-sans", "IBMPlexSans-Italic.woff2", "harnessed-sans-400i.woff2", "Sans Italic 400"),
    Face(
        "plex-sans",
        "IBMPlexSans-SemiBold.woff2",
        "harnessed-sans-600.woff2",
        "Sans SemiBold 600",
    ),
    Face(
        "plex-sans-condensed",
        "IBMPlexSansCondensed-SemiBold.woff2",
        "harnessed-sans-cond-600.woff2",
        "Sans Condensed SemiBold 600",
    ),
    Face(
        "plex-mono",
        "IBMPlexMono-Regular.woff2",
        "harnessed-mono-400.woff2",
        "Mono Regular 400",
    ),
    Face(
        "plex-mono",
        "IBMPlexMono-SemiBold.woff2",
        "harnessed-mono-600.woff2",
        "Mono SemiBold 600",
    ),
)


def parse_unicodes(spec: str) -> set[int]:
    """Expand a comma-separated list of U+XXXX and U+XXXX-YYYY items to code points."""
    codepoints: set[int] = set()
    for item in spec.split(","):
        token = item.strip().removeprefix("U+")
        if "-" in token:
            low, high = token.split("-", 1)
            codepoints.update(range(int(low, 16), int(high, 16) + 1))
        else:
            codepoints.add(int(token, 16))
    return codepoints


def package_version(package: str) -> str:
    manifest = PLEX_DIR / package / "package.json"
    data: dict[str, Any] = json.loads(manifest.read_text(encoding="utf-8"))
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


def subset_face(source: Path, target: Path, codepoints: set[int]) -> None:
    font: Any = TTFont(str(source), recalcTimestamp=False)
    options = subset.Options()
    options.flavor = "woff2"
    options.layout_features = list(LAYOUT_FEATURES)
    options.name_IDs = ["*"]
    options.name_legacy = True
    options.name_languages = ["*"]
    subsetter = subset.Subsetter(options=options)
    subsetter.populate(unicodes=sorted(codepoints))
    subsetter.subset(font)
    rename_name_table(font)
    font["head"].modified = font["head"].created
    font.flavor = "woff2"
    font.save(str(target))


def assert_renamed(path: Path) -> None:
    """Re-open a written file and fail if a renamed record still says "Plex"."""
    font: Any = TTFont(str(path))
    for record in font["name"].names:
        if record.nameID in RENAMED_NAME_IDS and "Plex" in str(record.toUnicode()):
            raise RuntimeError(f"{path.name}: name record {record.nameID} still contains Plex")
    with path.open("rb") as handle:
        if handle.read(4) != b"wOF2":
            raise RuntimeError(f"{path.name}: not a WOFF2 file")


def write_license() -> None:
    source = PLEX_DIR / LICENSE_SOURCE_PACKAGE / "LICENSE.txt"
    shutil.copyfile(source, OUT_DIR / "LICENSE-OFL.txt")


def write_fontlog(today: str) -> None:
    lines = [
        "HARNESSED font log",
        f"Generated by tools/vendor/build_fonts.py on {today} from the pinned npm packages below.",
        "",
        "Source packages (exact versions, see package.json):",
    ]
    for package in ("plex-sans", "plex-mono", "plex-sans-condensed"):
        lines.append(f"  @ibm/{package} {package_version(package)}")
    lines += [
        "",
        "Subset: IBM Plex complete static WOFF2 files, Latin subset.",
        f"  unicodes: {UNICODE_SPEC}",
        f"  layout features: {','.join(LAYOUT_FEATURES)}",
        "  flavor: woff2",
        "",
        "Rename: IBM Plex reserves the name \"Plex\" under the SIL OFL 1.1 (Reserved Font Name).",
        "A subset is a modified version, so the family names in the name table are changed:",
        "  IBM Plex Sans -> Harnessed Sans; IBM Plex Sans Condensed -> Harnessed Sans",
        "  Condensed; IBM Plex Mono -> Harnessed Mono; PostScript IBMPlexSans-* and",
        "  IBMPlexMono-* -> HarnessedSans-* and HarnessedMono-*.",
        f"  renamed name IDs: {', '.join(str(n) for n in RENAMED_NAME_IDS)}",
        "  kept name IDs (notices): 0, 7, 13, 14",
        "Reason: OFL reserved font name. CSS uses the new family names only.",
        "",
        "License: LICENSE-OFL.txt is the package LICENSE.txt, copied verbatim",
        "  (IBM Corp. copyright notice and the SIL OFL 1.1 text).",
        "",
        "Files:",
    ]
    for face in FACES:
        lines.append(f"  {face.output}  <- {face.package} {face.source} ({face.face})")
    (OUT_DIR / "FONTLOG.txt").write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> int:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    codepoints = parse_unicodes(UNICODE_SPEC)
    for face in FACES:
        source = PLEX_DIR / face.package / "fonts" / "complete" / "woff2" / face.source
        target = OUT_DIR / face.output
        subset_face(source, target, codepoints)
        assert_renamed(target)
        print(f"{face.output}\t{target.stat().st_size} bytes")
    write_license()
    write_fontlog(dt.date.today().isoformat())
    for name in ("LICENSE-OFL.txt", "FONTLOG.txt"):
        print(f"{name}\t{(OUT_DIR / name).stat().st_size} bytes")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
