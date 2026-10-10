from typing import Any

Row = dict[str, Any]


def parse_table(text: str) -> list[Row]:
    """Read a process table: a header line, then one row per process."""
    rows: list[Row] = []
    for line in text.split("\n"):
        if not line.strip() or line.split()[0] == "PID":
            continue
        parts = line.split(None, 5)
        pid, ppid, user, cpu, cwd = parts[:5]
        command = parts[5] if len(parts) > 5 else ""
        rows.append({"pid": int(pid), "ppid": int(ppid), "user": user,
                     "cpu": float(cpu), "cwd": cwd, "command": command})
    return rows


def runaway_children(rows: list[Row], parent: int, cpu_limit: float) -> list[int]:
    """The pids of the parent's children and grandchildren (any depth) above the cpu limit."""
    children: dict[int, list[int]] = {}
    for row in rows:
        children.setdefault(row["ppid"], []).append(row["pid"])
    found: set[int] = set()
    frontier = [parent]
    while frontier:
        current = frontier.pop()
        for child in children.get(current, []):
            if child not in found:
                found.add(child)
                frontier.append(child)
    cpu = {row["pid"]: row["cpu"] for row in rows}
    return sorted(pid for pid in found if cpu[pid] > cpu_limit)


def can_write(mode: str, owner: str, group: str, user: str, user_groups: list[str]) -> bool:
    """Whether user may write a file with this mode, owner and group."""
    if user == owner:
        triple = mode[0:3]
    elif group in user_groups:
        triple = mode[3:6]
    else:
        triple = mode[6:9]
    return triple[1] == "w"
