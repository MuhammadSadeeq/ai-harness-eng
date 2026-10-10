from typing import Any

Row = dict[str, Any]


def parse_table(text: str) -> list[Row]:
    """Read a process table: a header line, then one row per process.

    Columns are PID, PPID, USER, CPU, CWD and COMMAND. The first five are one
    word each. COMMAND is the rest of the line, which may hold spaces. Return one
    dict per row with keys pid (int), ppid (int), user (str), cpu (float), cwd (str)
    and command (str). Skip the header and blank lines.
    """
    raise NotImplementedError("split each row: five words, then the rest is the command")


def runaway_children(rows: list[Row], parent: int, cpu_limit: float) -> list[int]:
    """The pids of the parent's children and grandchildren (any depth) above the cpu limit.

    A child is a row whose ppid is the parent's pid. The parent itself is not in the
    result. The cpu limit is strict: a process exactly at the limit is not listed.
    Return the pids in ascending order.
    """
    raise NotImplementedError("walk down from the parent, then keep the rows over the limit")


def can_write(mode: str, owner: str, group: str, user: str, user_groups: list[str]) -> bool:
    """Whether user may write a file with this mode, owner and group.

    mode is nine characters such as "rw-r--r--": the owner's three, the group's
    three, then everyone else's three. Read, write and execute are each one letter
    or a dash. The owner's triple applies when user is the owner. Otherwise the
    group's triple applies when group is one of user_groups. Otherwise the last
    triple applies. Return True when the chosen triple's write position is "w".
    """
    raise NotImplementedError("choose the triple, then check its write position")
