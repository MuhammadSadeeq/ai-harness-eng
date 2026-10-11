import subprocess
import sys
from pathlib import Path


def run_command(command):
    done = subprocess.run(command, shell=True, cwd="demo", capture_output=True, text=True, timeout=60)
    return f"exit code {done.returncode}\n{(done.stdout + done.stderr).strip() or '(no output)'}"


argv = sys.argv[1:]
if argv[0] == "edit-then-test":
    print(run_command("python test_calc.py"))
    Path("demo/calc.py").write_text("def add(a, b):\n    return a - b\n")
    print(run_command("python test_calc.py"))
elif argv[0] == "ask":
    answer = input("allow run_command? [y/N] ")
    print("allowed" if answer.strip().lower() == "y" else "denied")
else:
    print(run_command(argv[0]))
