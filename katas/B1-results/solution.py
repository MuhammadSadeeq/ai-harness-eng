from typing import Any, Callable

Message = dict[str, Any]
Runner = Callable[[str, dict[str, Any]], str]


def results_message(tool_uses: list[dict[str, Any]], run: Runner) -> Message:
    """Run each tool_use and return ONE user message that answers all of them."""
    blocks: list[dict[str, Any]] = []
    for use in tool_uses:
        try:
            output = run(use["name"], use["input"])
        except Exception as exc:
            blocks.append({"type": "tool_result", "tool_use_id": use["id"],
                           "content": f"Error: {exc}", "is_error": True})
            continue
        blocks.append({"type": "tool_result", "tool_use_id": use["id"], "content": output})
    return {"role": "user", "content": blocks}
