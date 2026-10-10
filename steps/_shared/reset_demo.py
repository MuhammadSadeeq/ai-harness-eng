"""Create (or re-create) the small demo project that Rein practices on."""
import shutil
from pathlib import Path

demo = Path("demo")
shutil.rmtree(demo, ignore_errors=True)
demo.mkdir()

(demo / "calc.py").write_text("def add(a, b):\n    return a - b\n")

(demo / "test_calc.py").write_text("""from calc import add


def test_add():
    result = add(2, 3)
    assert result == 5, f"add(2, 3) returned {result}, expected 5"


if __name__ == "__main__":
    try:
        test_add()
        print("1 test passed")
    except AssertionError as e:
        print(f"test_add failed: {e}")
        raise SystemExit(1)
""")

(demo / "AGENTS.md").write_text("""# Rules for agents in this project
- Run the tests with: python test_calc.py
- Keep changes small. Do not rename functions.
- Never delete app.log. The support team reads it.
""")

lines = [f"2026-09-26 10:{i // 60:02d}:{i % 60:02d} INFO request {i} served in {5 + i % 7} ms"
         for i in range(1, 401)]
lines[396] = "2026-09-26 10:06:37 ERROR add(2, 3) returned -1, expected 5"
(demo / "app.log").write_text("\n".join(lines) + "\n")

print("Demo project ready: demo/calc.py, demo/test_calc.py, demo/app.log, demo/AGENTS.md")
