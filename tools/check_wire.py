"""check_wire: guarded stub for wire-payload validation (arrives in Phase 1).

With no payload files under scenarios/wire/ it passes. With any payload it fails, because wire
validation is not built yet (DECISIONS D-019 names the types it will validate against).
"""

from __future__ import annotations

import argparse
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_WIRE = REPO_ROOT / "scenarios" / "wire"


def payloads(wire_dir: Path) -> list[Path]:
    if not wire_dir.is_dir():
        return []
    return sorted(
        path
        for path in wire_dir.rglob("*")
        if path.is_file()
        and not any(part.startswith(".") for part in path.relative_to(wire_dir).parts)
    )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Guarded stub: validate wire payloads.")
    parser.add_argument("--wire", type=Path, default=DEFAULT_WIRE, help="wire payload directory")
    args = parser.parse_args(argv)
    found = payloads(args.wire)
    if not found:
        print("check_wire: 0 payloads")
        return 0
    for payload in found:
        print(f"{payload}:0: wire validation not implemented (Phase 1)")
    print(f"check_wire: FAILED ({len(found)} problems)")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
