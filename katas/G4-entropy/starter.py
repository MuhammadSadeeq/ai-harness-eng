def defined_names(source):
    """Every function and class name defined anywhere in the source.

    Use the ast module, not a text search: a name in a comment or a string is not a definition.
    """
    raise NotImplementedError("walk the parsed tree and keep FunctionDef, AsyncFunctionDef and ClassDef names")


def stale_references(rules, names):
    """(line number, name) for every call written with empty parentheses whose name is not in names.

    Only "name()" counts: a call with arguments is not checked. Lines are numbered from 1.
    """
    raise NotImplementedError("scan each line for name() with a regular expression; keep the ones not in names")
