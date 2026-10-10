import posixpath

MAX_HOPS = 8


def _outside(path: str) -> bool:
    return path.startswith("/") or path == ".." or path.startswith("../")


def confine(path: str, links: dict[str, str]) -> str:
    """Resolve path inside the workspace root, following links; refuse an escape.

    links maps a link's path (inside the root) to its target, which is relative
    to the link's own folder. Returns the normal form of the final path.
    """
    current = posixpath.normpath(path)
    if _outside(current):
        raise ValueError(f"path outside the workspace: {path}")
    hops = 0
    while current in links:
        hops += 1
        if hops > MAX_HOPS:
            raise ValueError(f"too many levels of links: {path}")
        target = posixpath.normpath(posixpath.join(posixpath.dirname(current), links[current]))
        if _outside(target):
            raise ValueError(f"path outside the workspace: {path} -> {target}")
        current = target
    return current
