import asyncio  # noqa: F401  (gather is the tool for the safe calls)
from collections.abc import Awaitable, Callable

Call = tuple[bool, Callable[[], Awaitable[str]]]


async def run_tool_calls(calls: list[Call]) -> list[str]:
    """Run the calls and return their results in the order they were given.

    Each call is (safe, run). run is a function with no arguments that returns an
    awaitable str. Safe calls may overlap: start them together and wait for all of
    them. Unsafe calls change shared state: run them one at a time, in order, so
    that no two unsafe calls overlap. Results come back in the order of calls.
    """
    raise NotImplementedError("gather the safe calls, run the unsafe ones in turn, keep the order")
