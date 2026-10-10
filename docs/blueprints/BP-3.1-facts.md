# BRIEF BP-3.1-facts: facts for wave 3.1 (S0, A1, A2, A3, T1–T3)

Fact-checker rules: `.claude/agents/hx-factchecker.md` and `docs/FACTS.md` (all).
You edit only `facts/*.yaml`. A new area file `facts/python.yaml` is allowed for
the Python standard-library facts below (area `python`). Write your report to
the path you are given.

Add each fact **only if a primary source supports it**, with a verbatim quote
fetched today; tighten the claim to the quote. The primary source for `python.*`
is the official documentation at docs.python.org (the 3.11 or later pages;
name the version in the URL). If a page can't be fetched, the fact is
`unverifiable` with a note; never a mirror.

| id (proposed) | Claim to check | Used by |
|---|---|---|
| `python.type-hints-not-enforced` | The Python runtime does not enforce function and variable type annotations; they are for tools such as type checkers. | T1 |
| `python.dataclass-generates-init` | The `@dataclass` decorator adds generated special methods such as `__init__()` to the class, from its annotated fields. | T1, H1 |
| `python.mypy-static-checker` | mypy is a static type checker: it checks a program's types without running it (source: mypy's own docs, mypy.readthedocs.io). | T1 |
| `python.asyncio-run` | `asyncio.run()` runs a coroutine, creating and closing an event loop. | T2 |
| `python.await-suspends` | `await` suspends the coroutine until the awaited thing is done, letting the event loop run other tasks; and `time.sleep()` blocks (the docs' wording). | T2 |
| `python.gather-order` | `asyncio.gather()` returns the results in the order of the awaitables passed, when all succeed. | T2 |
| `python.wait-for-timeout` | `asyncio.wait_for()` cancels the task and raises `TimeoutError` when the timeout expires. | T2 |
| `python.subprocess-run-completed` | `subprocess.run()` waits for the command and returns a `CompletedProcess` with `returncode` and, when captured, `stdout`. | T3 |
| `python.subprocess-timeout` | With `timeout`, `subprocess.run()` kills the child and raises `TimeoutExpired` when the timeout expires. | T3 |
| `python.signal-sigint-keyboardinterrupt` | Python turns `SIGINT` into a `KeyboardInterrupt` exception by default. | T3 |
| `python.signal-sigterm` | What the docs say SIGTERM is (a termination request) and that a handler can be set with `signal.signal()`. | T3 |
| `python.returncode-negative-signal` | A negative `returncode` `-N` means the child was terminated by signal `N` (POSIX only). | T3 |
| `papers.react-iclr` | The ReAct paper's own venue page: "ReAct: Synergizing Reasoning and Acting in Language Models", ICLR 2023 (try openreview.net; arXiv is blocked, and a blocked host stays unverifiable). If verified, it replaces the repository README as B2's source. | B2 |

## Acceptance
`.venv/bin/python tools/check_facts.py` passes; then `.venv/bin/python tools/gen_data.py`
(quote both final lines). If `check_facts` does not know the area `python`, say so;
don't edit the checker.

## Report
For each id: added / unverifiable / contradicted, one line with the source URL.
Then the checkers' final lines.
