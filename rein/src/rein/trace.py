"""Events: construction, redaction and bookkeeping (ENGINE.md sections 7.1, 9 and 10).

Every event has the envelope v, run, seq, t, turn, agent, kind, wire and its payload fields.
Redaction changes payload strings only (never keys or the envelope), and it works on copies,
so the messages the model sees are never altered.
"""

from __future__ import annotations

from typing import Any

from .spec import KIND_WIRE, REDACTED


class Recorder:
    def __init__(self, run_id: str, patterns: list[str]) -> None:
        self.run_id = run_id
        self.patterns = patterns
        self.events: list[dict[str, Any]] = []
        self.seq = 0
        self.pending = 0  # events emitted since the last trace_write (not counting it)
        self.redacted = 0  # replacements since the last trace_write

    def emit(self, kind: str, t: int, turn: int, fields: dict[str, Any]) -> dict[str, Any]:
        payload: dict[str, Any] = {}
        for key, value in fields.items():
            payload[key] = self._redact(value)
        event: dict[str, Any] = {
            "v": 1,
            "run": self.run_id,
            "seq": self.seq,
            "t": t,
            "turn": turn,
            "agent": "main",
            "kind": kind,
            "wire": KIND_WIRE[kind],
        }
        event.update(payload)
        self.seq += 1
        self.events.append(event)
        self.pending += 1
        return event

    def trace_write(self, t: int, turn: int) -> dict[str, Any]:
        event = self.emit(
            "trace_write", t, turn, {"events": self.pending, "redacted": self.redacted}
        )
        self.pending = 0
        self.redacted = 0
        return event

    def _redact(self, value: Any) -> Any:
        if isinstance(value, str):
            for pattern in self.patterns:
                count = value.count(pattern)
                if count:
                    value = value.replace(pattern, REDACTED)
                    self.redacted += count
            return value
        if isinstance(value, list):
            return [self._redact(item) for item in value]
        if isinstance(value, dict):
            return {key: self._redact(item) for key, item in value.items()}
        return value
