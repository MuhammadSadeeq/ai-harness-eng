import re

from kata import narrow

NEEDS = [("list_files", None), ("read_file", "notes/**"), ("write_file", "notes/done/**")]


def _regex(glob: str) -> str:
    """A glob as a regex: ** crosses folders, * does not; the whole path must match (A3.10)."""
    out = ""
    i = 0
    while i < len(glob):
        if glob.startswith("**", i):
            out += ".*"
            i += 2
        elif glob[i] == "*":
            out += "[^/]*"
            i += 1
        else:
            out += re.escape(glob[i])
            i += 1
    return out


def decide(policy: dict, tool: str, path: str | None = None) -> str:
    """The policy's decision for one call: the first rule that matches, else the mode."""
    for rule in policy["rules"]:
        if rule["tool"] != tool:
            continue
        glob = rule["match"].get("path")
        if glob is None or (path is not None and re.fullmatch(_regex(glob), path)):
            return rule["decision"]
    return policy["mode"]


def test_the_listing_is_allowed():
    assert decide(narrow(NEEDS), "list_files") == "allow", "the task lists the folder"


def test_reads_are_allowed_inside_the_notes_only():
    policy = narrow(NEEDS)
    assert decide(policy, "read_file", "notes/one.txt") == "allow", "the task reads its notes"
    assert decide(policy, "read_file", "config/app.env") == "deny", "the config file is not part of the task"


def test_writes_are_allowed_only_in_the_done_folder():
    policy = narrow(NEEDS)
    assert decide(policy, "write_file", "notes/done/one.txt") == "allow", "the finished note goes to done"
    assert decide(policy, "write_file", "notes/archive/old-1.txt") == "deny", "the archive is not part of the task"


def test_a_shell_is_not_needed_so_it_is_refused():
    assert decide(narrow(NEEDS), "run_command", "rm -r notes/archive") == "deny", "the task runs no command"


def test_the_mode_refuses_whatever_no_rule_allows():
    assert narrow(NEEDS)["mode"] == "deny", "anything not needed is refused by default"


def test_a_repeated_need_is_one_rule():
    policy = narrow(NEEDS + [("read_file", "notes/**")])
    assert len(policy["rules"]) == 3, "one allow rule per distinct need"


def test_a_task_that_needs_nothing_allows_nothing():
    policy = narrow([])
    assert decide(policy, "list_files") == "deny", "no need, no allow"
    assert policy["rules"] == [], "no rules at all"
