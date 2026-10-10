import asyncio


async def fetch(name: str, delay: float) -> str:
    """Wait delay seconds, then return name.

    Wait with await asyncio.sleep(delay).
    """
    raise NotImplementedError("await asyncio.sleep, then return name")


async def fetch_all(
    jobs: list[tuple[str, float]], timeout: float
) -> list[str]:
    """Run every fetch at the same time, under one timeout.

    jobs holds (name, delay) pairs. Return the names in the
    order of jobs, not the order they finish. Use one
    asyncio.gather call for all the jobs, and wrap it in
    asyncio.wait_for with the timeout.
    """
    raise NotImplementedError("gather the fetches under the timeout")
