#!/usr/bin/env python3
"""CourtListener REST compatibility facade over the deterministic CourtDock MCP.

The first BYO-MCP target, agentic-ops/legal-mcp, already accepts a configurable
``COURTLISTENER_BASE_URL``.  CourtDock is an MCP surface rather than a REST
server, so this narrow facade translates the two search modes that the target
can safely consume.  It never reaches the public CourtListener service.
"""

from __future__ import annotations

import argparse
import json
import signal
import sys
import threading
import urllib.parse
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[2]
LOCAL_WORLD = ROOT / "world/local"
if str(LOCAL_WORLD) not in sys.path:
    sys.path.insert(0, str(LOCAL_WORLD))

from oracle import OracleSession  # noqa: E402


DEFAULT_TOKEN = "courtlistener-local-simulation-token"
SUPPORTED_TYPES = {"o": "opinions_search", "r": "dockets_search"}


class FacadeState:
    def __init__(self, world_base: str, token: str) -> None:
        self.world_base = world_base.rstrip("/")
        self.token = token
        self._session: OracleSession | None = None
        self._lock = threading.Lock()

    def call(self, tool: str, arguments: dict[str, Any]) -> tuple[bool, dict[str, Any]]:
        with self._lock:
            if self._session is None:
                self._session = OracleSession(self.world_base)
            ok, text = self._session.call(tool, arguments)
        try:
            payload = json.loads(text)
        except json.JSONDecodeError:
            payload = {"detail": text}
        return ok, payload

    def close(self) -> None:
        with self._lock:
            if self._session is not None:
                self._session.close()
                self._session = None


class CourtListenerHandler(BaseHTTPRequestHandler):
    server_version = "CourtDockCourtListenerFacade/1.0"

    @property
    def state(self) -> FacadeState:
        return self.server.facade_state  # type: ignore[attr-defined]

    def log_message(self, fmt: str, *args: Any) -> None:
        # Keep the compatibility process quiet unless the caller captures errors.
        return

    def send_json(self, status: int, payload: dict[str, Any]) -> None:
        body = json.dumps(payload, ensure_ascii=False, sort_keys=True).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("X-Legal-Agent-Simulation", "courtdock-byo-facade")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:  # noqa: N802 - BaseHTTPRequestHandler API
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path.rstrip("/") or "/"
        if path == "/health":
            self.send_json(HTTPStatus.OK, {
                "ok": True,
                "service": "courtdock-courtlistener-facade",
                "external_network": False,
                "supported_search_types": sorted(SUPPORTED_TYPES),
            })
            return
        if path != "/api/rest/v4/search":
            self.send_json(HTTPStatus.NOT_FOUND, {"detail": "Not found."})
            return
        if self.headers.get("Authorization") != f"Token {self.state.token}":
            self.send_json(HTTPStatus.UNAUTHORIZED, {"detail": "Invalid token."})
            return

        params = urllib.parse.parse_qs(parsed.query)
        query = (params.get("q") or [""])[0].strip()
        result_type = (params.get("type") or ["o"])[0]
        if not query:
            self.send_json(HTTPStatus.BAD_REQUEST, {"q": ["This field may not be blank."]})
            return
        tool = SUPPORTED_TYPES.get(result_type)
        if tool is None:
            self.send_json(HTTPStatus.BAD_REQUEST, {
                "type": [
                    f"Unsupported deterministic search type '{result_type}'. "
                    f"Supported values: {', '.join(sorted(SUPPORTED_TYPES))}."
                ]
            })
            return

        arguments: dict[str, Any] = {"q": query}
        cursor = (params.get("cursor") or [None])[0]
        if cursor:
            arguments["cursor"] = cursor
        ok, payload = self.state.call(tool, arguments)
        if not ok:
            self.send_json(HTTPStatus.BAD_GATEWAY, {
                "detail": "The deterministic CourtDock backing call failed.",
                "backing_error": payload,
            })
            return
        if not isinstance(payload, dict) or not isinstance(payload.get("results"), list):
            self.send_json(HTTPStatus.BAD_GATEWAY, {
                "detail": "CourtDock returned an invalid CourtListener envelope.",
                "backing_response": payload,
            })
            return
        # The V2 CourtListener dialect already emits count/next/previous/results.
        # Preserve the envelope exactly; callers such as legal-mcp consume only
        # these public fields.
        self.send_json(HTTPStatus.OK, {
            "count": payload.get("count", len(payload["results"])),
            "next": payload.get("next"),
            "previous": payload.get("previous"),
            "results": payload["results"],
        })


def build_server(host: str, port: int, world_base: str, token: str) -> ThreadingHTTPServer:
    server = ThreadingHTTPServer((host, port), CourtListenerHandler)
    server.facade_state = FacadeState(world_base, token)  # type: ignore[attr-defined]
    return server


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8993)
    parser.add_argument("--world-base", default="http://127.0.0.1:8972")
    parser.add_argument("--token", default=DEFAULT_TOKEN)
    args = parser.parse_args()

    server = build_server(args.host, args.port, args.world_base, args.token)

    def stop(_signum: int, _frame: Any) -> None:
        threading.Thread(target=server.shutdown, daemon=True).start()

    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    print(
        json.dumps({
            "listening": f"http://{args.host}:{args.port}/api/rest/v4",
            "world_base": args.world_base,
            "external_network": False,
        }, sort_keys=True),
        flush=True,
    )
    try:
        server.serve_forever()
    finally:
        server.facade_state.close()  # type: ignore[attr-defined]
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
