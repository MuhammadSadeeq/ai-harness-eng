import subprocess

from kata import build_argv, run_checked


class FakeResult:
    def __init__(self, returncode, stdout):
        self.returncode = returncode
        self.stdout = stdout


class FakeRunner:
    """Stands in for subprocess.run: it records each call, then returns or raises what it was given."""

    def __init__(self, result=None, error=None):
        self.result = result
        self.error = error
        self.calls = []

    def __call__(self, argv, **kwargs):
        self.calls.append((argv, kwargs))
        if self.error is not None:
            raise self.error
        return self.result


def test_build_argv_puts_the_script_and_the_value_in_order():
    assert build_argv("print(1)", 4) == [
        "python3",
        "-c",
        "print(1)",
        "4",
    ], "the argument list, in order"


def test_the_runner_gets_capture_text_and_the_timeout():
    runner = FakeRunner(result=FakeResult(0, "ok\n"))
    run_checked(runner, ["python3", "-c", "pass"], 5.0)
    argv, kwargs = runner.calls[0]
    assert argv == ["python3", "-c", "pass"], (
        "the runner gets the argument list"
    )
    assert kwargs.get("capture_output") is True, (
        "capture_output should be True"
    )
    assert kwargs.get("text") is True, (
        "text should be True, so stdout is a str"
    )
    assert kwargs.get("timeout") == 5.0, "the timeout should be passed on"


def test_returns_the_exit_code_and_the_output():
    runner = FakeRunner(result=FakeResult(0, "hi\n"))
    assert run_checked(runner, ["x"], 1.0) == (0, "hi\n"), (
        "exit code 0 and the output"
    )


def test_a_failing_exit_code_is_returned_not_raised():
    runner = FakeRunner(result=FakeResult(3, ""))
    assert run_checked(runner, ["x"], 1.0) == (3, ""), (
        "a non-zero exit code is a result"
    )
    assert runner.calls[0][1].get("check", False) is False, (
        "do not ask the runner to check the exit code"
    )


def test_a_timeout_is_handled_and_reported():
    runner = FakeRunner(error=subprocess.TimeoutExpired(["x"], 1.0))
    assert run_checked(runner, ["x"], 1.0) == (None, "timed out"), (
        "a timeout returns (None, 'timed out')"
    )
