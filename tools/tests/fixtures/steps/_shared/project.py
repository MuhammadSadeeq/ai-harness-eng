from pathlib import Path

Path("demo").mkdir(exist_ok=True)
Path("demo/calc.py").write_text("def add(a, b):\n    return a + b\n")
Path("demo/test_calc.py").write_text(
    "from calc import add\n"
    "if add(2, 3) == 5:\n"
    "    print('1 passed')\n"
    "else:\n"
    "    print('1 failed')\n"
    "    raise SystemExit(1)\n"
)
Path("demo/test_bad.py").write_text("print('1 failed')\nraise SystemExit(1)\n")
