import posixpath  # noqa: F401  (you may use it, or write your own normal form)

MAX_HOPS = 8


def confine(path: str, links: dict[str, str]) -> str:
    """Resolve path inside the workspace root, following links; refuse an escape.

    path is what the model wrote, relative to the workspace root.
    links maps a link's path (inside the root) to its target, which is relative
    to the link's own folder. Normalize "." and ".." first. Refuse, with
    ValueError("path outside the workspace: <path>"), an absolute path, or a path
    that normalizes to "..", or to something that starts with "../". Follow each
    link in turn; when a link's target leaves the root, refuse with
    ValueError("path outside the workspace: <path> -> <target>"). After more than
    MAX_HOPS links, refuse with ValueError("too many levels of links: <path>").
    Return the normal form of the final path.
    """
    raise NotImplementedError("normalize, refuse an escape, follow links, and count the hops")
