def make_brief(task, files, fields):
    """Write a sub-agent brief whose result can be checked.

    The brief names the task, every file the sub-agent may read, and the fields the result must
    return, one per line, as 'field: value'. Raises ValueError when a part is missing.
    """
    raise NotImplementedError("name the task, the files, and the fields; refuse a brief without them")


def check_result(result, fields):
    """True when every field comes back on its own line with a value after the colon."""
    raise NotImplementedError("find each field's line and check it has a value")
