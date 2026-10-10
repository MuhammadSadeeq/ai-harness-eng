from typing import Any, Callable

Message = dict[str, Any]
Runner = Callable[[str, dict[str, Any]], str]


def results_message(tool_uses: list[dict[str, Any]], run: Runner) -> Message:
    """Run each tool_use and return ONE user message that answers all of them.

    Each tool_use is {"id": ..., "name": ..., "input": ...}. Call run(name, input)
    for each one, in order. Every tool_result block carries the id of its tool_use.
    If run raises, the block is an error: set is_error to True and put the
    exception text in content. Other blocks have no is_error key.
    """
    raise NotImplementedError("build one user message with one tool_result per call")
