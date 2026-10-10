import asyncio
import inspect
import time

from kata import fetch, fetch_all


def test_fetch_is_a_coroutine_function():
    assert inspect.iscoroutinefunction(fetch), "fetch should be async def"


async def test_fetch_returns_its_name():
    assert await fetch("a", 0.01) == "a", "fetch should return its name"


async def test_results_come_back_in_job_order():
    jobs = [("slow", 0.2), ("fast", 0.05)]
    result = await fetch_all(jobs, 1.0)
    assert result == ["slow", "fast"], (
        "results follow the order of jobs, not the finish order"
    )


async def test_the_jobs_overlap_in_time():
    jobs = [("a", 0.2), ("b", 0.2), ("c", 0.2)]
    start = time.perf_counter()
    result = await fetch_all(jobs, 2.0)
    elapsed = time.perf_counter() - start
    assert sorted(result) == ["a", "b", "c"], "every name is in the result"
    assert elapsed < 0.4, (
        f"three 0.2 s jobs took {elapsed:.2f} s; "
        "they should overlap, not queue one after another"
    )


async def test_a_timeout_raises_timeouterror():
    try:
        await fetch_all([("slow", 0.2)], 0.05)
    except TimeoutError:
        return
    raise AssertionError("a 0.2 s job should time out at 0.05 s")


async def test_fetch_lets_another_task_run_while_it_waits():
    ticks = []

    async def ticker():
        for _ in range(10):
            ticks.append(time.perf_counter())
            await asyncio.sleep(0.05)

    task = asyncio.create_task(ticker())
    await fetch("a", 0.2)
    seen = len(ticks)
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass
    assert seen >= 2, (
        f"the ticker ran {seen} time(s) while fetch waited 0.2 s; "
        "fetch should let other tasks run while it waits"
    )
