"""A local mock of the Messages API for the live tests (BP-4.2 §4, decision D-038).

It listens on 127.0.0.1 only, serves the recorded exchange of a fixture in order, records every
request it receives, and answers the Models API lookup from the models fixture. No test opens a
connection anywhere else: ``assert_loopback`` checks every base URL a test uses.
"""

from __future__ import annotations

import json
import threading
from collections.abc import Sequence
from dataclasses import dataclass, field
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

FIXTURES = Path(__file__).resolve().parent / "fixtures" / "live"
Recorded = tuple[int, dict[str, Any], dict[str, str]]  # status, body, headers


def load_exchange(name: str) -> list[Recorded]:
    """The recorded responses of one fixture file, in the order the mock serves them."""
    data = json.loads((FIXTURES / f"{name}.json").read_text(encoding="utf-8"))
    return [
        (int(item["status"]), dict(item["body"]), {k: str(v) for k, v in item["headers"].items()})
        for item in data["exchange"]
    ]


def load_models() -> dict[str, Any]:
    data: dict[str, Any] = json.loads((FIXTURES / "models.json").read_text(encoding="utf-8"))
    return data


def assert_loopback(url: str) -> None:
    """Every base URL a test uses names 127.0.0.1, and nothing else."""
    assert url.startswith("http://127.0.0.1:"), f"tests may only reach 127.0.0.1, not {url}"


@dataclass
class RecordedRequest:
    method: str
    path: str
    headers: dict[str, str]
    body: dict[str, Any] | None


@dataclass
class MockAnthropic:
    """Use as a context manager. ``echo_key`` writes the request's API key into error
    bodies, to test that the learner's key never reaches an output."""

    exchange: Sequence[Recorded] = ()
    models: dict[str, Any] = field(default_factory=load_models)
    echo_key: bool = False
    requests: list[RecordedRequest] = field(default_factory=list)
    _queue: list[Recorded] = field(default_factory=list)
    _server: ThreadingHTTPServer | None = None
    _thread: threading.Thread | None = None

    @property
    def url(self) -> str:
        assert self._server is not None, "the mock is not running"
        host, port = self._server.server_address[:2]
        url = f"http://{host}:{port}"
        assert_loopback(url)
        return url

    def __enter__(self) -> MockAnthropic:
        self._queue = list(self.exchange)
        mock = self

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, format: str, *args: object) -> None:  # silence the server
                return

            def _send(self, status: int, body: dict[str, Any], headers: dict[str, str]) -> None:
                raw = json.dumps(body).encode("utf-8")
                self.send_response(status)
                self.send_header("content-type", "application/json")
                self.send_header("content-length", str(len(raw)))
                for name, value in headers.items():
                    self.send_header(name, value)
                self.end_headers()
                self.wfile.write(raw)

            def do_POST(self) -> None:
                length = int(self.headers.get("content-length", "0"))
                body = json.loads(self.rfile.read(length).decode("utf-8")) if length else None
                headers = {k.lower(): v for k, v in self.headers.items()}
                mock.requests.append(RecordedRequest("POST", self.path, headers, body))
                if not mock._queue:
                    self._send(
                        500,
                        {
                            "type": "error",
                            "error": {"type": "api_error", "message": "exchange exhausted"},
                        },
                        {},
                    )
                    return
                status, payload, extra = mock._queue.pop(0)
                if mock.echo_key:
                    key = headers.get("x-api-key", "")
                    payload = json.loads(json.dumps(payload).replace("{key}", key))
                self._send(status, payload, extra)

            def do_GET(self) -> None:
                mock.requests.append(
                    RecordedRequest(
                        "GET", self.path, {k.lower(): v for k, v in self.headers.items()}, None
                    )
                )
                model_id = self.path.rsplit("/", 1)[-1]
                if model_id in mock.models["models"]:
                    self._send(200, mock.models["models"][model_id], {})
                else:
                    self._send(404, mock.models["not_found"], {})

        self._server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self._thread = threading.Thread(target=self._server.serve_forever, daemon=True)
        self._thread.start()
        return self

    def __exit__(self, *exc: object) -> None:
        if self._server is not None:
            self._server.shutdown()
            self._server.server_close()
        if self._thread is not None:
            self._thread.join(timeout=5)

    def bodies(self) -> list[dict[str, Any]]:
        """The bodies of the POSTed requests, in order."""
        return [r.body for r in self.requests if r.method == "POST" and r.body is not None]
