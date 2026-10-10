def changed_lines(diff: str) -> dict[str, list[int]]:
    """Map each file in a unified diff to the new-file line numbers it adds.

    A file's name comes from its "+++ b/<path>" line. A hunk header
    "@@ -a,b +c,d @@" starts the new-file count at c. A "+" line is added and
    counts; a " " line counts; a "-" line is not in the new file and does not
    count. A file deleted in the diff ("+++ /dev/null") is not listed.
    """
    result: dict[str, list[int]] = {}
    current: str | None = None
    in_hunk = False
    new_line = 0
    for line in diff.split("\n"):
        if line.startswith("diff "):
            in_hunk = False
            continue
        if not in_hunk and line.startswith("+++ "):
            target = line[4:]
            if target == "/dev/null":
                current = None
            else:
                current = target[2:] if target.startswith("b/") else target
                result.setdefault(current, [])
            continue
        if not in_hunk and line.startswith("--- "):
            continue
        if line.startswith("@@ "):
            in_hunk = True
            new_line = int(line.split(" +", 1)[1].split(" ", 1)[0].split(",", 1)[0])
            continue
        if not in_hunk or current is None:
            continue
        if line.startswith("+"):
            result[current].append(new_line)
            new_line += 1
        elif line.startswith(" "):
            new_line += 1
    return result
