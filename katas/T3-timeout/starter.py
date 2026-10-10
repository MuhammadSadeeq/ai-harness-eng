import subprocess


def build_argv(script: str, value: int) -> list[str]:
    """Return the argument list.

    That is python3, -c, the script, and the value.
    """
    raise NotImplementedError("return the argument list")


def run_checked(
    runner, argv: list[str], timeout: float
) -> tuple[int | None, str]:
    """Run argv with runner. Return (exit code, stdout).

    Return (None, "timed out") when the timeout passes.
    Call runner(argv, capture_output=True, text=True,
    timeout=timeout). A non-zero exit code is a result.
    """
    raise NotImplementedError("call runner, return the result")
