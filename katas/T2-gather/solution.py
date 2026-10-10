import asyncio


async def fetch(name: str, delay: float) -> str:
    await asyncio.sleep(delay)
    return name


async def fetch_all(
    jobs: list[tuple[str, float]], timeout: float
) -> list[str]:
    calls = [fetch(name, delay) for name, delay in jobs]
    return await asyncio.wait_for(asyncio.gather(*calls), timeout)
