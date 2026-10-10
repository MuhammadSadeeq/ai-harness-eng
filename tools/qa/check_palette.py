#!/usr/bin/env python3
"""Check the HARNESSED wire palette against contrast and color-vision thresholds (DESIGN 3.1).

Reads site/assets/core/tokens.css: day values from the first `:root {` block, night values
from `:root[data-theme="dark"]`, and asserts the `prefers-color-scheme: dark` block declares
the same values. Thresholds: each wire >= 3.0 contrast against paper and panel; ring-adjacent
wire pairs >= 12 under normal, protan, deutan and tritan; every pair >= 8 normal and >= 3.5
under each CVD type. Distances are 100 x Euclidean distance in OKLab (Machado et al. 2009,
severity 1.0, applied to linear RGB).
"""

from __future__ import annotations

import argparse
import itertools
import math
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Final

REPO: Final[Path] = Path(__file__).resolve().parents[2]
TOKENS: Final[Path] = REPO / "site" / "assets" / "core" / "tokens.css"

WIRES: Final[tuple[str, ...]] = (
    "control",
    "context",
    "loop",
    "errors",
    "tools",
    "permissions",
    "verify",
    "observe",
)
SURFACES: Final[tuple[str, ...]] = ("hx-paper", "hx-panel")
THEME_SELECTORS: Final[dict[str, str]] = {
    "day": ":root {",
    "night": ':root[data-theme="dark"] {',
}
MEDIA_NIGHT_SELECTOR: Final[str] = ':root:not([data-theme="light"]) {'

CONTRAST_MIN: Final[float] = 3.0
RING_MIN: Final[float] = 12.0
ANY_NORMAL_MIN: Final[float] = 8.0
ANY_CVD_MIN: Final[float] = 3.5

MACHADO: Final[dict[str, tuple[tuple[float, float, float], ...]]] = {
    "protan": (
        (0.152286, 1.052583, -0.204868),
        (0.114503, 0.786281, 0.099216),
        (-0.003882, -0.048116, 1.051998),
    ),
    "deutan": (
        (0.367322, 0.860646, -0.227968),
        (0.280085, 0.672501, 0.047413),
        (-0.011820, 0.042940, 0.968881),
    ),
    "tritan": (
        (1.255528, -0.076749, -0.178779),
        (-0.078411, 0.930809, 0.147602),
        (0.004733, 0.691367, 0.303900),
    ),
}
VISIONS: Final[tuple[str, ...]] = ("normal", "protan", "deutan", "tritan")

Rgb = tuple[float, float, float]
DECL_RE: Final[re.Pattern[str]] = re.compile(r"(--[a-z0-9-]+|color-scheme)\s*:\s*([^;]+);")
HEX_RE: Final[re.Pattern[str]] = re.compile(r"^#[0-9A-Fa-f]{6}$")


def srgb_to_linear(channel: float) -> float:
    return channel / 12.92 if channel <= 0.04045 else ((channel + 0.055) / 1.055) ** 2.4


def hex_to_srgb(value: str) -> Rgb:
    if not HEX_RE.match(value):
        raise ValueError(f"not a #RRGGBB color: {value!r}")
    return (int(value[1:3], 16) / 255, int(value[3:5], 16) / 255, int(value[5:7], 16) / 255)


def luminance(srgb: Rgb) -> float:
    r, g, b = (srgb_to_linear(c) for c in srgb)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contrast(a: Rgb, b: Rgb) -> float:
    hi, lo = sorted((luminance(a), luminance(b)), reverse=True)
    return (hi + 0.05) / (lo + 0.05)


def simulate(linear: Rgb, vision: str) -> Rgb:
    if vision == "normal":
        return linear
    matrix = MACHADO[vision]
    out: list[float] = []
    for row in matrix:
        value = row[0] * linear[0] + row[1] * linear[1] + row[2] * linear[2]
        out.append(min(1.0, max(0.0, value)))
    return (out[0], out[1], out[2])


def oklab(linear: Rgb) -> Rgb:
    r, g, b = linear
    l_ = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b
    m_ = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b
    s_ = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b
    l_, m_, s_ = (math.copysign(abs(x) ** (1 / 3), x) for x in (l_, m_, s_))
    return (
        0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_,
        1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_,
        0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_,
    )


def distance(a: Rgb, b: Rgb, vision: str) -> float:
    la = oklab(simulate(a_linear(a), vision))
    lb = oklab(simulate(a_linear(b), vision))
    return 100 * math.dist(la, lb)


def a_linear(srgb: Rgb) -> Rgb:
    return (srgb_to_linear(srgb[0]), srgb_to_linear(srgb[1]), srgb_to_linear(srgb[2]))


def block_body(text: str, selector: str) -> str:
    """Return the text between the braces that open after the first occurrence of selector."""
    start = text.find(selector)
    if start < 0:
        raise ValueError(f"selector not found in tokens.css: {selector}")
    open_at = text.index("{", start)
    depth = 0
    for index in range(open_at, len(text)):
        if text[index] == "{":
            depth += 1
        elif text[index] == "}":
            depth -= 1
            if depth == 0:
                return text[open_at + 1 : index]
    raise ValueError(f"unbalanced braces after {selector}")


def declarations(body: str) -> dict[str, str]:
    return {m.group(1): " ".join(m.group(2).split()) for m in DECL_RE.finditer(body)}


@dataclass
class Palette:
    name: str
    paper: Rgb
    panel: Rgb
    wires: dict[str, Rgb]


def load_palettes(text: str) -> tuple[dict[str, Palette], list[str]]:
    problems: list[str] = []
    decls_by_theme: dict[str, dict[str, str]] = {}
    for theme, selector in THEME_SELECTORS.items():
        decls_by_theme[theme] = declarations(block_body(text, selector))
    media = declarations(block_body(text, MEDIA_NIGHT_SELECTOR))
    if media != decls_by_theme["night"]:
        differing = sorted(
            k
            for k in set(media) | set(decls_by_theme["night"])
            if media.get(k) != decls_by_theme["night"].get(k)
        )
        problems.append(f"prefers-color-scheme block differs from data-theme=dark: {differing}")

    palettes: dict[str, Palette] = {}
    for theme, decls in decls_by_theme.items():
        local: list[str] = []
        values: dict[str, Rgb] = {}
        for token in (*SURFACES, *(f"w-{w}" for w in WIRES)):
            raw = decls.get(f"--{token}")
            if raw is None:
                local.append(f"{theme}: --{token} is not declared as a hex color")
                continue
            try:
                values[token] = hex_to_srgb(raw)
            except ValueError as error:
                local.append(f"{theme}: --{token}: {error}")
        if local:
            problems.extend(local)
            continue
        palettes[theme] = Palette(
            name=theme,
            paper=values["hx-paper"],
            panel=values["hx-panel"],
            wires={w: values[f"w-{w}"] for w in WIRES},
        )
    return palettes, problems


def check_theme(palette: Palette) -> list[str]:
    problems: list[str] = []
    print(f"theme: {palette.name}")
    print(f"{'wire':<12}{'vs paper':>10}{'vs panel':>10}  status")
    for wire in WIRES:
        color = palette.wires[wire]
        c_paper = contrast(color, palette.paper)
        c_panel = contrast(color, palette.panel)
        status = "ok"
        if c_paper < CONTRAST_MIN or c_panel < CONTRAST_MIN:
            status = "FAIL"
            problems.append(f"{palette.name}: {wire} contrast {c_paper:.2f}/{c_panel:.2f} < 3.0")
        print(f"{wire:<12}{c_paper:>10.2f}{c_panel:>10.2f}  {status}")

    dist: dict[tuple[int, int], dict[str, float]] = {}
    for i, j in itertools.combinations(range(len(WIRES)), 2):
        a = palette.wires[WIRES[i]]
        b = palette.wires[WIRES[j]]
        dist[(i, j)] = {vision: distance(a, b, vision) for vision in VISIONS}

    ring = {tuple(sorted((i, (i + 1) % len(WIRES)))) for i in range(len(WIRES))}
    print()
    print(f"{'pair':<26}" + "".join(f"{v:>9}" for v in VISIONS) + "  status")
    for key in sorted(dist):
        is_ring = key in ring
        values = dist[key]
        status = "ok"
        for vision in VISIONS:
            value = values[vision]
            if is_ring and value < RING_MIN:
                status = "FAIL"
                problems.append(
                    f"{palette.name}: ring pair {WIRES[key[0]]}-{WIRES[key[1]]} {vision} "
                    f"{value:.1f} < 12"
                )
            if not is_ring and vision == "normal" and value < ANY_NORMAL_MIN:
                status = "FAIL"
                problems.append(
                    f"{palette.name}: pair {WIRES[key[0]]}-{WIRES[key[1]]} normal {value:.1f} < 8"
                )
            if not is_ring and vision != "normal" and value < ANY_CVD_MIN:
                status = "FAIL"
                problems.append(
                    f"{palette.name}: pair {WIRES[key[0]]}-{WIRES[key[1]]} {vision} "
                    f"{value:.1f} < 3.5"
                )
        label = f"{WIRES[key[0]]}-{WIRES[key[1]]}" + (" (ring)" if is_ring else "")
        print(f"{label:<26}" + "".join(f"{values[v]:>9.1f}" for v in VISIONS) + f"  {status}")

    ring_min = {v: min(dist[k][v] for k in dist if k in ring) for v in VISIONS}
    all_min = {v: min(dist[k][v] for k in dist) for v in VISIONS}
    print()
    print("min ring    " + "".join(f"{v} {ring_min[v]:.1f}  " for v in VISIONS))
    print("min all     " + "".join(f"{v} {all_min[v]:.1f}  " for v in VISIONS))
    print()
    return problems


def run(text: str) -> tuple[list[str], dict[str, bool]]:
    palettes, problems = load_palettes(text)
    results: dict[str, bool] = {}
    for theme in THEME_SELECTORS:
        palette = palettes.get(theme)
        if palette is None:
            results[theme] = False
            continue
        theme_problems = check_theme(palette)
        problems.extend(theme_problems)
        results[theme] = not theme_problems
    return problems, results


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Check the HARNESSED wire palette.")
    parser.add_argument("--tokens", type=Path, default=TOKENS, help="path to tokens.css")
    args = parser.parse_args(argv)
    text = Path(args.tokens).read_text(encoding="utf-8")
    problems, results = run(text)
    for problem in problems:
        print(f"problem: {problem}")
    if problems:
        print(f"check_palette: FAILED ({len(problems)} problems)")
        return 1
    print("check_palette: day OK, night OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
