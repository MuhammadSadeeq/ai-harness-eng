"""The virtual workspace (ENGINE.md sections 5, 6.4 and 7.7; amendment A3.6, A3.7, A3.8).

Paths are normalized lexically (empty and "." segments dropped, ".." removes the previous
segment). A path that starts with "/" is absolute: it is never inside the workspace, and it is
looked up in the tape's `outside` table by its normalized form. A relative path whose normal form
starts with "../" is looked up there too. Anything else lives in the workspace.

A link's target is relative to the link's own directory (absolute targets are absolute). Links
are followed by reads and writes, with or without the sandbox. More than 8 hops is an error.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

from .pyjson import pyjson

MAX_LINK_HOPS = 8
_EGRESS_PORT = re.compile(r":[0-9]+$")


def normalize(path: str) -> str:
    """The lexical normal form. Absolute paths keep their leading "/"; ".." at "/" is dropped."""
    absolute = path.startswith("/")
    stack: list[str] = []
    for segment in path.split("/"):
        if segment in ("", "."):
            continue
        if segment == "..":
            if stack and stack[-1] != "..":
                stack.pop()
            elif not absolute:
                stack.append("..")
            continue
        stack.append(segment)
    body = "/".join(stack)
    if absolute:
        return "/" + body
    return body or "."


def is_outside(normalized: str) -> bool:
    """Absolute, or escaping the workspace root (a "../" prefix)."""
    return normalized.startswith("/") or normalized == ".." or normalized.startswith("../")


def directory_of(normalized: str) -> str:
    if normalized == "/":
        return "/"
    if "/" not in normalized:
        return "."
    head = normalized.rsplit("/", 1)[0]
    return head or "/"


def link_target(link_path: str, target: str) -> str:
    """A link's target, relative to the directory that holds the link."""
    if target.startswith("/"):
        return normalize(target)
    return normalize(directory_of(link_path) + "/" + target)


@dataclass(frozen=True)
class Resolution:
    """Where a path ends up after following links."""

    path: str  # as the model wrote it
    final: str  # the normalized final path
    linked: bool  # a link was followed
    entry: str | None  # the file text, or None when there is no file
    too_many: bool  # more than MAX_LINK_HOPS links


class Vfs:
    def __init__(self, workspace: dict[str, Any], outside: dict[str, Any]) -> None:
        self._workspace: dict[str, Any] = {}
        self._outside: dict[str, Any] = {}
        for key, value in workspace.items():
            normal = normalize(key)
            self._store(normal)[normal] = value
        for key, value in outside.items():
            normal = normalize(key)
            self._outside[normal] = value

    def _store(self, normalized: str) -> dict[str, Any]:
        return self._outside if is_outside(normalized) else self._workspace

    def resolve(self, path: str) -> Resolution:
        current = normalize(path)
        linked = False
        hops = 0
        while True:
            entry = self._store(current).get(current)
            if isinstance(entry, dict):
                if hops == MAX_LINK_HOPS:
                    return Resolution(path, current, linked, None, too_many=True)
                hops += 1
                linked = True
                current = link_target(current, str(entry["link"]))
                continue
            text = entry if isinstance(entry, str) else None
            return Resolution(path, current, linked, text, too_many=False)

    def read(self, path: str) -> Resolution:
        return self.resolve(path)

    def write(self, path: str, content: str) -> Resolution:
        """Writes through links. A chain that is too long writes nothing."""
        resolution = self.resolve(path)
        if not resolution.too_many:
            self._store(resolution.final)[resolution.final] = content
        return resolution

    def workspace_paths(self) -> list[str]:
        return sorted(self._workspace)


def sandbox_reason(resolution: Resolution) -> str | None:
    """None when the path stays inside the workspace; otherwise the sandbox's reason (A3.8)."""
    if resolution.too_many:
        return f"too many levels of links: {resolution.path}"
    if is_outside(resolution.final):
        shown = f"{resolution.path} -> {resolution.final}" if resolution.linked else resolution.path
        return f"path outside the workspace: {shown}"
    return None


def egress_host(url: str) -> str:
    """A3.8: the text after the first "://" up to "/", "?" or "#"; through the last "@" dropped;
    a trailing ":<digits>" dropped; lowercased. No "://" gives ""."""
    marker = url.find("://")
    if marker < 0:
        return ""
    rest = url[marker + 3 :]
    end = len(rest)
    for stop in "/?#":
        index = rest.find(stop)
        if 0 <= index < end:
            end = index
    host = rest[:end]
    at = host.rfind("@")
    if at >= 0:
        host = host[at + 1 :]
    host = _EGRESS_PORT.sub("", host)
    return host.lower()


def egress_reason(url: str, egress: list[str]) -> str | None:
    host = egress_host(url)
    if host in egress:
        return None
    return f"host not in egress: {host}"


def pyjson_text(value: Any) -> str:
    """A string value as itself; anything else as its pyjson form (A3.10)."""
    return value if isinstance(value, str) else pyjson(value)
