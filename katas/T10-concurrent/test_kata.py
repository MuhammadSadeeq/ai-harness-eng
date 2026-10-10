import asyncio
import inspect

from kata import run_tool_calls


def test_run_tool_calls_is_declared_async():
    assert inspect.iscoroutinefunction(run_tool_calls), "write run_tool_calls as async def"


async def quick(text):
    return text


def make_quick(text):
    return lambda: quick(text)


async def test_results_come_back_in_call_order():
    calls = [(True, make_quick("a")), (True, make_quick("b")), (False, make_quick("c"))]
    assert await run_tool_calls(calls) == ["a", "b", "c"], "results follow the order the calls were given"


async def test_safe_calls_overlap_and_keep_their_order():
    started_b = asyncio.Event()

    async def first():
        await asyncio.wait_for(started_b.wait(), timeout=1.0)
        return "first"

    async def second():
        started_b.set()
        return "second"

    calls = [(True, first), (True, second)]
    result = await asyncio.wait_for(run_tool_calls(calls), timeout=2.0)
    assert result == ["first", "second"], "the first call waits for the second, so they overlap"


async def test_unsafe_calls_never_overlap():
    running = 0
    most = 0

    def make(text):
        async def run():
            nonlocal running, most
            running += 1
            most = max(most, running)
            await asyncio.sleep(0)
            running -= 1
            return text
        return run

    calls = [(False, make("x")), (False, make("y")), (False, make("z"))]
    assert await run_tool_calls(calls) == ["x", "y", "z"], "unsafe results still come back in order"
    assert most == 1, "unsafe calls run one at a time"


async def test_a_safe_call_that_finishes_last_is_still_listed_last():
    done_second = asyncio.Event()

    async def slow():
        await asyncio.wait_for(done_second.wait(), timeout=1.0)
        return "slow"

    async def fast():
        done_second.set()
        return "fast"

    result = await asyncio.wait_for(run_tool_calls([(True, slow), (True, fast)]), timeout=2.0)
    assert result == ["slow", "fast"], "the order is the call order, not the finish order"


async def test_an_empty_list_gives_no_results():
    assert await run_tool_calls([]) == [], "nothing to run, nothing back"
