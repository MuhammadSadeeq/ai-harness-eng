def make_brief(task, files, fields):
    """Write a sub-agent brief whose result can be checked.

    The brief names the task, every file the sub-agent may read, and the fields the result must
    return, one per line, as 'field: value'. Raises ValueError when a part is missing.
    """
    if not task.strip():
        raise ValueError("a brief needs a task")
    if not files:
        raise ValueError("a brief names the files the sub-agent may read")
    if not fields:
        raise ValueError("a brief says what the result must return")
    lines = [f"Task: {task.strip()}", f"Files: {', '.join(files)}", "Return these fields, one per line, as 'field: value':"]
    lines += [f"- {field}" for field in fields]
    return "\n".join(lines) + "\n"


def check_result(result, fields):
    """True when every field comes back on its own line with a value after the colon."""
    values = {}
    for line in result.splitlines():
        key, sep, value = line.partition(":")
        if sep:
            values[key.strip()] = value.strip()
    return all(values.get(field, "") != "" for field in fields)
