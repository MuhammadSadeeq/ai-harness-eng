"""Built-in and scripted tools over the virtual workspace (ENGINE.md 6.4; A3.1 to A3.5, A3.11)."""

from __future__ import annotations

import copy
import json
from pathlib import Path
from typing import Any

from .pyjson import pyjson
from .spec import (
    BUILTIN_LATENCY_MS,
    CUSTOM_TOOL_DEFAULT_LATENCY_MS,
    UNKNOWN_TOOL_LATENCY_MS,
)
from .tape import Tape
from .vfs import Resolution, Vfs, normalize

_TOOLDEFS_PATH = Path(__file__).with_name("tooldefs.json")


def load_tooldefs() -> list[dict[str, Any]]:
    """The fixed built-in definitions, in file order (ENGINE.md section 6.4)."""
    data: Any = json.loads(_TOOLDEFS_PATH.read_text(encoding="utf-8"))
    return [dict(item) for item in data]


def text_field(tool_input: dict[str, Any], key: str) -> str:
    """A missing or non-string input reads as "" (A3.4)."""
    value = tool_input.get(key, "")
    return value if isinstance(value, str) else ""


def cat_path(cmd: str) -> str | None:
    """The path of `cat <path>` (exactly one argument), or None."""
    words = cmd.split()
    if len(words) == 2 and words[0] == "cat":
        return words[1]
    return None


def line_count(text: str) -> int:
    """A14.4: the lines of a file. Each newline ends a line, and a last line with no newline counts,
    so "" has 0 lines, "a\\n" has 1, and "a" has 1."""
    return text.count("\n") + (1 if text and not text.endswith("\n") else 0)


def _missing(path: str) -> str:
    return f"No file at '{path}'. Call list_files to see what exists."


def _too_many(path: str) -> str:
    return f"Too many levels of links: {path}"


class Toolbox:
    def __init__(self, tape: Tape, rejected: frozenset[str] = frozenset()) -> None:
        self.tape = tape
        self.vfs = Vfs(tape.workspace, tape.outside)
        self._available = set(tape.tools)
        # A11.5: a rejected tool is not in the toolbox; a call to it is an unknown tool (A12.1).
        self._custom = {
            str(c["name"]): c for c in tape.custom_tools if str(c["name"]) not in rejected
        }

    def definitions(self) -> list[dict[str, Any]]:
        """Built-ins named in `tools`, in tooldefs order; then custom tools in tape order (A3.1)."""
        defs = [copy.deepcopy(d) for d in load_tooldefs() if str(d["name"]) in self._available]
        for custom in self.tape.custom_tools:
            if str(custom["name"]) not in self._custom:
                continue
            defs.append(
                {
                    "name": custom["name"],
                    "description": custom["description"],
                    "input_schema": copy.deepcopy(custom["input_schema"]),
                }
            )
        return defs

    def run(self, name: str, tool_input: dict[str, Any]) -> tuple[bool, str, int]:
        """(ok, output, latency_ms). Workspace changes happen here."""
        if name in self._custom:
            return self._run_custom(self._custom[name], tool_input)
        if name not in self._available:
            return False, f"Unknown tool: {name}", UNKNOWN_TOOL_LATENCY_MS
        latency = BUILTIN_LATENCY_MS[name]
        if name == "read_file":
            return (*self._read(text_field(tool_input, "path")), latency)
        if name == "write_file":
            return (*self._write(tool_input), latency)
        if name == "edit_file":
            return (*self._edit(tool_input), latency)
        if name == "list_files":
            return True, "\n".join(self.vfs.workspace_paths()), latency
        return (*self._command(text_field(tool_input, "cmd")), latency)

    def checks_hold(self) -> bool:
        """Every check holds. A check on a missing file fails, whichever kind it is (A3.5)."""
        return all(self._check_holds(check) for check in self.tape.checks)

    def append_ledger(self, path: str, line: str) -> None:
        """A14.4: a ledger line goes at the end of its file; a missing file is created by it."""
        current = self.vfs.read(path).entry or ""
        self.vfs.write(path, current + line)

    def _check_holds(self, check: dict[str, Any]) -> bool:
        text = self.vfs.read(str(check["file"])).entry
        if text is None:
            return False
        if "lines" in check:
            return line_count(text) == int(check["lines"])
        if "contains" in check:
            return str(check["contains"]) in text
        return str(check["not_contains"]) not in text

    def suite_holds(self, pristine: bool) -> bool:
        """A9.3: every active test's check holds. A test is active while its marker's file holds the
        marker text. With pristine, the markers are read from the tape's original workspace.
        The checks always read the live files."""
        original = Vfs(self.tape.workspace, {})
        for test in self.tape.tests:
            marker = test["marker"]
            source = original if pristine else self.vfs
            entry = source.read(str(marker["file"])).entry
            if entry is None or str(marker["contains"]) not in entry:
                continue
            if not self._check_holds(test["check"]):
                return False
        return True

    def _read(self, path: str) -> tuple[bool, str]:
        resolution = self.vfs.read(path)
        if resolution.too_many:
            return False, _too_many(path)
        if resolution.entry is None:
            return False, _missing(path)
        return True, resolution.entry

    def _write(self, tool_input: dict[str, Any]) -> tuple[bool, str]:
        path = text_field(tool_input, "path")
        content = text_field(tool_input, "content")
        if normalize(path) in (".", "/"):  # A3.4: the root is a directory, nothing is written
            return False, f"Is a directory: {path}"
        resolution: Resolution = self.vfs.write(path, content)
        if resolution.too_many:
            return False, _too_many(path)
        return True, f"Wrote {path} ({len(content)} chars)"

    def _edit(self, tool_input: dict[str, Any]) -> tuple[bool, str]:
        path = text_field(tool_input, "path")
        old = text_field(tool_input, "old_text")
        new = text_field(tool_input, "new_text")
        resolution = self.vfs.read(path)
        if resolution.too_many:
            return False, _too_many(path)
        content = resolution.entry
        if content is None:
            return False, _missing(path)
        count = content.count(old) if old else 0
        if count == 0:
            return False, f"old_text was not found in {path}. Read the file again."
        if count > 1:
            return False, f"old_text appears {count} times in {path}; include more context."
        self.vfs.write(path, content.replace(old, new, 1))
        return True, f"Edited {path} (1 change)"

    def _command(self, cmd: str) -> tuple[bool, str]:
        """A3.3: the command is split on whitespace; `ls` ignores its arguments."""
        words = cmd.split()
        if not words:
            return False, "command not found: "
        first = words[0]
        if words in (["pytest"], ["pytest", "-q"]):
            passed = self.suite_holds(pristine=False) if self.tape.tests else self.checks_hold()
            return passed, self.tape.test_output["pass" if passed else "fail"]
        if first == "ls":
            return True, "\n".join(self.vfs.workspace_paths())
        if first == "cat":
            if len(words) != 2:
                return False, "usage: cat <path>"
            return self._read(words[1])
        return False, f"command not found: {first}"

    def _run_custom(
        self, custom: dict[str, Any], tool_input: dict[str, Any]
    ) -> tuple[bool, str, int]:
        latency = int(custom.get("latency_ms", CUSTOM_TOOL_DEFAULT_LATENCY_MS))
        for result in custom.get("results", []):
            match = dict(result["match"])
            if all(
                field in tool_input and pyjson(tool_input[field]) == pyjson(value)
                for field, value in match.items()
            ):
                return bool(result.get("ok", True)), str(result["output"]), latency
        default = custom.get("default")
        if default is None:
            return False, "", latency
        return bool(default.get("ok", False)), str(default["output"]), latency
