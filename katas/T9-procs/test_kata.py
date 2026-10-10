from kata import can_write, parse_table, runaway_children

TABLE = """PID PPID USER CPU CWD COMMAND
100 1 agent 2.0 /work python agent.py
101 100 agent 95.0 /work/tmp python loop.py --forever
102 101 agent 1.0 /work/tmp sleep 10
103 100 agent 80.0 /work python fetch.py
200 1 root 0.5 / sshd -D
"""


def test_parse_reads_each_column():
    rows = parse_table(TABLE)
    assert len(rows) == 5, "one row per process, with the header skipped"
    first = rows[0]
    assert (first["pid"], first["ppid"], first["user"]) == (100, 1, "agent"), "pid, parent and user"
    assert first["cwd"] == "/work", "the working directory is its own column"


def test_the_command_keeps_its_spaces():
    rows = parse_table(TABLE)
    assert rows[1]["command"] == "python loop.py --forever", "COMMAND is the rest of the line"
    assert rows[2]["command"] == "sleep 10", "a short command is kept whole"


def test_cpu_is_read_as_a_number():
    assert parse_table(TABLE)[1]["cpu"] == 95.0, "cpu is a float"


def test_blank_lines_are_skipped():
    assert len(parse_table("\n\n" + TABLE + "\n\n")) == 5, "blank lines are not processes"


def test_children_over_the_limit_are_listed():
    rows = parse_table(TABLE)
    assert runaway_children(rows, 100, 50.0) == [101, 103], "101 and 103 are over 50; 102 is not a child of 100"


def test_a_runaway_grandchild_is_found():
    rows = [
        {"pid": 101, "ppid": 100, "user": "a", "cpu": 0.0, "cwd": "/", "command": "x"},
        {"pid": 102, "ppid": 101, "user": "a", "cpu": 99.0, "cwd": "/", "command": "y"},
    ]
    assert runaway_children(rows, 100, 50.0) == [102], "a grandchild counts, at any depth"


def test_the_parent_is_not_in_the_result():
    rows = parse_table(TABLE)
    assert 100 not in runaway_children(rows, 100, 0.0), "the parent is not its own child"


def test_a_process_exactly_at_the_limit_is_not_listed():
    rows = [{"pid": 2, "ppid": 1, "user": "a", "cpu": 50.0, "cwd": "/", "command": "x"}]
    assert runaway_children(rows, 1, 50.0) == [], "the limit is strict: over it, not at it"


def test_an_unrelated_process_is_not_listed():
    rows = parse_table(TABLE)
    assert 200 not in runaway_children(rows, 100, 0.0), "sshd is not under pid 100"


def test_the_owner_may_write_with_the_owner_triple():
    assert can_write("rw-r--r--", "agent", "agent", "agent", ["agent"]) is True, "the owner may write"


def test_a_group_member_uses_the_group_triple():
    assert can_write("rw-rw-r--", "root", "staff", "agent", ["staff"]) is True, "a group member may write"
    assert can_write("rw-r--r--", "root", "staff", "agent", ["staff"]) is False, "this group may only read"


def test_everyone_else_uses_the_last_triple():
    assert can_write("rw-rw-rw-", "root", "root", "agent", []) is True, "everyone may write here"
    assert can_write("rw-r--r--", "root", "root", "agent", []) is False, "others may only read"


def test_the_owner_triple_is_checked_first():
    assert can_write("r--rw-rw-", "agent", "agent", "agent", ["agent"]) is False, (
        "the owner is checked before the group, even when the group could write"
    )
