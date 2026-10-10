"""check_steps: guarded stub for the Rein step checker (final shape arrives in Phase 2).

With no steps under rein/steps/ it passes. With any step present it fails, because step
checking is not built yet: a stub may pass only on empty input (blueprint BP-0.5C).
"""

from __future__ import annotations

import argparse
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_STEPS = REPO_ROOT / "rein" / "steps"


def count_steps(steps_dir: Path) -> int:
    if not steps_dir.is_dir():
        return 0
    return sum(1 for entry in steps_dir.iterdir() if not entry.name.startswith("."))


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Guarded stub: check the Rein steps.")
    parser.add_argument("--steps", type=Path, default=DEFAULT_STEPS, help="steps directory")
    args = parser.parse_args(argv)
    count = count_steps(args.steps)
    if count == 0:
        print("check_steps: 0 steps (Rein steps arrive in Phase 2)")
        return 0
    print(f"{args.steps}:0: {count} step(s) found but step checking is not implemented")
    print("check_steps: FAILED (step checking not implemented yet)")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
