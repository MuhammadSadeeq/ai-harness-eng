import subprocess


def build_argv(script: str, value: int) -> list[str]:
    return ["python3", "-c", script, str(value)]


def run_checked(runner, argv: list[str], timeout: float) -> tuple[int | None, str]:
    try:
        result = runner(argv, capture_output=True, text=True, timeout=timeout)
    except subprocess.TimeoutExpired:
        return None, "timed out"
    return result.returncode, result.stdout
