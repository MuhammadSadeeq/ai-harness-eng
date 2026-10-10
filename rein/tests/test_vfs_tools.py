"""The virtual workspace and the built-in tools (ENGINE.md 6.4, 7.7; A3.2 to A3.8, A3.11)."""

from __future__ import annotations

from typing import Any

import pytest
from support import make_tape

from rein.spec import CUSTOM_TOOL_DEFAULT_LATENCY_MS, UNKNOWN_TOOL_LATENCY_MS
from rein.tools import Toolbox
from rein.vfs import Vfs, egress_host, egress_reason, is_outside, normalize, sandbox_reason


@pytest.mark.parametrize(
    ("path", "expected"),
    [
        ("", "."),
        (".", "."),
        ("./a/./b", "a/b"),
        ("a/b/../c", "a/c"),
        ("a/../../x", "../x"),
        ("../secrets.env", "../secrets.env"),
        ("/abs/x", "/abs/x"),  # A3.6: absolute paths keep their leading "/"
        ("/", "/"),
        ("/..", "/"),  # a ".." above "/" stays at "/"
        ("/a/../../b", "/b"),
    ],
)
def test_normalize_is_lexical(path: str, expected: str) -> None:
    assert normalize(path) == expected


@pytest.mark.parametrize(
    ("normal", "outside"),
    [("a.txt", False), ("a/b", False), ("../x", True), ("..", True), ("/etc/passwd", True)],
)
def test_outside_is_absolute_or_escaping(normal: str, outside: bool) -> None:
    assert is_outside(normal) is outside


# A3.6: absolute paths are never inside the workspace and are looked up in `outside`.
def test_absolute_path_reads_the_planted_outside_file() -> None:
    vfs = Vfs({"a.txt": "in"}, {"/etc/passwd": "root:x:0:0"})
    assert vfs.read("/etc/passwd").entry == "root:x:0:0"
    assert vfs.read("/etc//passwd/").entry == "root:x:0:0"  # the normalized form is the key
    assert sandbox_reason(vfs.read("/etc/passwd")) == "path outside the workspace: /etc/passwd"


def test_escaping_relative_path_reads_outside() -> None:
    vfs = Vfs({"a.txt": "in"}, {"../secrets.env": "KEY=1"})
    assert vfs.read("a/../../secrets.env").entry == "KEY=1"
    assert vfs.read("a.txt").entry == "in"
    assert vfs.read("missing").entry is None


def test_a_workspace_key_cannot_be_absolute_or_escaping_in_the_tape() -> None:
    from rein.tape import TapeError  # noqa: PLC0415

    with pytest.raises(TapeError, match="not a relative path inside the root"):
        make_tape(workspace={"/etc/x": "a"})
    with pytest.raises(TapeError, match="not a relative path inside the root"):
        make_tape(workspace={"../x": "a"})


def test_an_outside_key_cannot_be_inside_the_root() -> None:
    from rein.tape import TapeError  # noqa: PLC0415

    with pytest.raises(TapeError, match="inside the root"):
        make_tape(outside={"a.txt": "x"})


# A3.7: a link's target is relative to the link's own directory.
def test_link_target_is_relative_to_the_links_directory() -> None:
    vfs = Vfs({"dir/a.txt": "one", "dir/link": {"link": "a.txt"}}, {})
    resolution = vfs.read("dir/link")
    assert resolution.final == "dir/a.txt" and resolution.entry == "one"
    up = Vfs({"a.txt": "root", "dir/link": {"link": "../a.txt"}}, {})
    assert up.read("dir/link").entry == "root"


def test_link_to_an_absolute_target() -> None:
    vfs = Vfs({"link": {"link": "/etc/passwd"}}, {"/etc/passwd": "root"})
    assert vfs.read("link").entry == "root"


def test_links_are_followed_eight_hops_but_not_nine() -> None:
    eight = {f"l{i}": {"link": f"l{i + 1}"} for i in range(8)} | {"l8": "end"}
    assert Vfs(eight, {}).read("l0").entry == "end"
    nine = {f"l{i}": {"link": f"l{i + 1}"} for i in range(9)} | {"l9": "end"}
    assert Vfs(nine, {}).read("l0").too_many is True


def test_too_many_links_is_a_tool_error_and_writes_nothing() -> None:
    nine = {f"l{i}": {"link": f"l{i + 1}"} for i in range(9)} | {"l9": "end"}
    box = Toolbox(make_tape(workspace=nine))
    assert box.run("read_file", {"path": "l0"})[:2] == (False, "Too many levels of links: l0")
    assert box.run("write_file", {"path": "l0", "content": "x"})[:2] == (
        False,
        "Too many levels of links: l0",
    )
    assert box.vfs.read("l9").entry == "end"  # the chain was not replaced


def test_write_through_a_link_writes_its_target() -> None:
    box = Toolbox(make_tape(workspace={"dir/link": {"link": "../a.txt"}, "a.txt": "old"}))
    assert box.run("write_file", {"path": "dir/link", "content": "new"})[:2] == (
        True,
        "Wrote dir/link (3 chars)",
    )
    assert box.vfs.read("a.txt").entry == "new"


# A3.8: sandbox reasons.
def test_sandbox_reason_as_written_or_with_the_resolved_path() -> None:
    vfs = Vfs({"link.txt": {"link": "../secrets.env"}}, {"../secrets.env": "KEY=1"})
    assert sandbox_reason(vfs.read("../secrets.env")) == (
        "path outside the workspace: ../secrets.env"
    )
    assert sandbox_reason(vfs.read("link.txt")) == (
        "path outside the workspace: link.txt -> ../secrets.env"
    )


def test_sandbox_allows_a_link_that_stays_inside() -> None:
    vfs = Vfs({"a.txt": "in", "link": {"link": "a.txt"}}, {})
    assert sandbox_reason(vfs.read("link")) is None


def test_sandbox_too_many_links_reason() -> None:
    nine = {f"l{i}": {"link": f"l{i + 1}"} for i in range(9)} | {"l9": "end"}
    assert sandbox_reason(Vfs(nine, {}).read("l0")) == "too many levels of links: l0"


@pytest.mark.parametrize(
    ("url", "host"),
    [
        ("https://Evil.Test:8080/x?y=1", "evil.test"),
        ("http://user:pw@api.example.com/a", "api.example.com"),
        ("https://host.example#frag", "host.example"),
        ("ftp://X.y@Z.w:99", "z.w"),
        ("https://a.example?q=1@b", "a.example"),
        ("example.com/x", ""),  # no "://": empty
        ("https://[::1]:8080/x", "[::1]"),
    ],
)
def test_egress_host_follows_the_ruling(url: str, host: str) -> None:
    assert egress_host(url) == host


def test_egress_reason_uses_that_host() -> None:
    assert egress_reason("https://api.example.com/x", ["api.example.com"]) is None
    assert egress_reason("https://Evil.Test/x", ["api.example.com"]) == (
        "host not in egress: evil.test"
    )


def make_box(**changes: Any) -> Toolbox:
    return Toolbox(make_tape(**changes))


# A3.2: unknown tools and custom latencies.
def test_unknown_tool_is_an_error_with_a_100_ms_latency() -> None:
    box = make_box(tools=["read_file"])
    assert box.run("run_command", {"cmd": "ls"}) == (
        False,
        "Unknown tool: run_command",
        UNKNOWN_TOOL_LATENCY_MS,
    )
    assert UNKNOWN_TOOL_LATENCY_MS == 100


def test_custom_tool_latency_defaults_to_100_ms() -> None:
    custom = {
        "name": "ping",
        "description": "Ping",
        "input_schema": {"type": "object"},
        "results": [{"match": {}, "output": "pong"}],
    }
    box = make_box(custom_tools=[custom])
    assert box.run("ping", {}) == (True, "pong", CUSTOM_TOOL_DEFAULT_LATENCY_MS)
    assert CUSTOM_TOOL_DEFAULT_LATENCY_MS == 100


# A3.3: run_command.
@pytest.mark.parametrize(
    ("cmd", "expected"),
    [
        ("pytest", (False, "1 failed")),
        ("pytest  -q", (False, "1 failed")),  # whitespace splits; spacing does not matter
        ("pytest -q extra", (False, "command not found: pytest")),
        ("ls", (True, "a.txt")),
        ("ls -la /nowhere", (True, "a.txt")),  # ls ignores its arguments
        ("cat a.txt", (True, "hello")),
        ("cat", (False, "usage: cat <path>")),
        ("cat a.txt b.txt", (False, "usage: cat <path>")),
        ("", (False, "command not found: ")),
        ("   ", (False, "command not found: ")),
        ("rm -rf /", (False, "command not found: rm")),
    ],
)
def test_run_command_words(cmd: str, expected: tuple[bool, str]) -> None:
    box = make_box(workspace={"a.txt": "hello"}, checks=[{"file": "a.txt", "contains": "bye"}])
    assert box.run("run_command", {"cmd": cmd})[:2] == expected


def test_pytest_q_runs_the_checks_and_passes() -> None:
    box = make_box(workspace={"a.txt": "hi"}, checks=[{"file": "a.txt", "contains": "hi"}])
    assert box.run("run_command", {"cmd": "pytest -q"})[:2] == (True, "2 passed")


# A3.4: inputs and messages.
def test_non_string_inputs_read_as_empty() -> None:
    box = make_box(workspace={"a.txt": "x"})
    assert box.run("read_file", {"path": 5})[:2] == (
        False,
        "No file at ''. Call list_files to see what exists.",
    )
    assert box.run("write_file", {"path": "n.txt"})[:2] == (True, "Wrote n.txt (0 chars)")


def test_messages_echo_the_path_as_written() -> None:
    box = make_box(workspace={"./a.py": "x = 1"})
    assert box.run("read_file", {"path": "./nope.py"})[1] == (
        "No file at './nope.py'. Call list_files to see what exists."
    )


def test_edit_with_an_empty_old_text_is_not_found() -> None:
    box = make_box(workspace={"a.py": "x"})
    assert box.run("edit_file", {"path": "a.py", "old_text": "", "new_text": "q"})[:2] == (
        False,
        "old_text was not found in a.py. Read the file again.",
    )


def test_edit_on_a_missing_file_gives_the_read_error() -> None:
    box = make_box()
    assert box.run("edit_file", {"path": "nope.py", "old_text": "a", "new_text": "b"})[:2] == (
        False,
        "No file at 'nope.py'. Call list_files to see what exists.",
    )


def test_list_files_lists_every_key_including_links_sorted_without_a_trailing_newline() -> None:
    box = make_box(workspace={"b.txt": "b", "a.txt": "a", "c/link": {"link": "../a.txt"}})
    assert box.run("list_files", {})[1] == "a.txt\nb.txt\nc/link"


def test_write_to_the_root_is_a_directory_error() -> None:
    box = make_box(workspace={"a.txt": "a"})
    assert box.run("write_file", {"path": "", "content": "x"})[:2] == (False, "Is a directory: ")
    assert box.run("write_file", {"path": ".", "content": "x"})[:2] == (False, "Is a directory: .")
    assert box.vfs.workspace_paths() == ["a.txt"]


# A3.5: checks on missing files fail, whatever their kind.
def test_a_check_on_a_missing_file_fails_both_kinds() -> None:
    contains = make_box(checks=[{"file": "missing.txt", "contains": ""}])
    assert contains.checks_hold() is False
    not_contains = make_box(checks=[{"file": "missing.txt", "not_contains": "x"}])
    assert not_contains.checks_hold() is False


# A3.11: custom tool results.
def custom(**extra: Any) -> dict[str, Any]:
    base: dict[str, Any] = {
        "name": "lookup",
        "description": "Lookup",
        "input_schema": {"type": "object"},
        "latency_ms": 7,
        "results": [
            {"match": {"key": "a"}, "output": "first"},
            {"match": {"key": "a"}, "output": "second"},
            {"match": {"n": 1}, "output": "one", "ok": False},
        ],
    }
    base.update(extra)
    return base


def test_first_matching_result_wins_and_ok_defaults_to_true() -> None:
    box = make_box(custom_tools=[custom()])
    assert box.run("lookup", {"key": "a"}) == (True, "first", 7)


def test_match_compares_by_pyjson() -> None:
    box = make_box(custom_tools=[custom()])
    assert box.run("lookup", {"n": 1}) == (False, "one", 7)  # 1 matches 1 by pyjson
    assert box.run("lookup", {"n": "1"}) == (False, "", 7)  # "1" is not 1


def test_no_match_and_no_default_is_empty_and_not_ok() -> None:
    box = make_box(custom_tools=[custom()])
    assert box.run("lookup", {"key": "zzz"}) == (False, "", 7)
    assert box.run("lookup", {}) == (False, "", 7)  # an absent field never matches


def test_default_is_used_when_nothing_matches() -> None:
    box = make_box(custom_tools=[custom(default={"output": "fallback", "ok": True})])
    assert box.run("lookup", {"key": "zzz"}) == (True, "fallback", 7)
