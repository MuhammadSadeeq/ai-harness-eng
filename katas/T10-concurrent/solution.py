import asyncio
from collections.abc import Awaitable, Callable

Call = tuple[bool, Callable[[], Awaitable[str]]]


async def run_tool_calls(calls: list[Call]) -> list[str]:
    """Run the calls and return their results in the order they were given.

    Each call is (safe, run). The safe calls may overlap, so they run together with
    asyncio.gather. The unsafe calls change shared state, so they run one at a time,
    in order, and never overlap with each other.
    """
    results: list[str] = [""] * len(calls)
    for index, (ok, run) in enumerate(calls):
        if not ok:
            results[index] = await run()
    safe = [(index, run) for index, (ok, run) in enumerate(calls) if ok]
    outputs = await asyncio.gather(*(run() for _, run in safe))
    for (index, _), output in zip(safe, outputs):
        results[index] = output
    return results
