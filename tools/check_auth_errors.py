#!/usr/bin/env python3
"""M2.5 acceptance check for auth, HTTP friction, and outage separation.

Requires a live product runtime. The check proves the wire behavior, while the
pure helpers are also exercised across every dialect so a vendor error cannot
silently fall back to a generic body.
"""
from __future__ import annotations

import argparse
from http.server import BaseHTTPRequestHandler, HTTPServer
import json
from pathlib import Path
import sys
import urllib.error


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "world" / "local"))

from oracle import OracleSession, http  # noqa: E402
from server import Friction  # noqa: E402
from wire_errors import friction_http  # noqa: E402


def fail(message: str) -> None:
    raise AssertionError(message)


def expect_http_error(fn, code: int, auth_error: str | None = None):
    try:
        fn()
    except urllib.error.HTTPError as exc:
        if exc.code != code:
            fail(f"expected HTTP {code}, received {exc.code}")
        payload = json.loads(exc.read().decode() or "{}")
        if auth_error and payload.get("auth_error") != auth_error:
            fail(f"expected auth_error={auth_error!r}, received {payload!r}")
        return exc, payload
    fail(f"expected HTTP {code}, request succeeded")


def rpc(base: str, sid: str, token: str, method: str = "tools/list", params=None):
    return http(base, "POST", "/mcp", {
        "jsonrpc": "2.0", "id": 1, "method": method, "params": params or {},
    }, session=sid, token=token)


def check_auth(base: str) -> None:
    opened = http(base, "POST", "/sessions", {"auth_ttl": 1})
    sid = opened["session_id"]
    access = opened["access_token"]
    refresh = opened["refresh_token"]
    if not access or not refresh or access == refresh:
        fail("session did not issue distinct access and refresh tokens")

    expect_http_error(lambda: rpc(base, sid, ""), 401, "invalid_token")
    listed = rpc(base, sid, access)
    if not listed.get("result", {}).get("tools"):
        fail("authorized tools/list did not return tools")
    expect_http_error(lambda: rpc(base, sid, access), 401, "token_expired")

    rotated = http(base, "POST", f"/sessions/{sid}/refresh",
                   {"refresh_token": refresh})
    new_access = rotated.get("access_token")
    if not new_access or new_access == access:
        fail("refresh did not rotate the access token")
    expect_http_error(
        lambda: http(base, "POST", f"/sessions/{sid}/refresh",
                     {"refresh_token": refresh}),
        401, "refresh_token_already_used",
    )
    rpc(base, sid, new_access)
    http(base, "DELETE", f"/sessions/{sid}", session=sid, token=new_access)


def check_friction(base: str, world_path: Path) -> tuple[str, int]:
    raw = json.loads(world_path.read_text())
    world = raw.get("world", raw)
    schedule = Friction(world.get("friction") or {})
    tool = "matters_list"
    scheduled = next(
        ((index, schedule.fails(tool, index)) for index in range(1, 2001)
         if schedule.fails(tool, index)),
        None,
    )
    if scheduled is None:
        fail("friction schedule produced no failure in the first 2,000 calls")
    target_index, expected_signature = scheduled

    opened = http(base, "POST", "/sessions", {})
    sid, token = opened["session_id"], opened["access_token"]
    observed = None
    try:
        for index in range(1, target_index + 1):
            try:
                rpc(base, sid, token, "tools/call", {
                    "name": tool, "arguments": {"limit": 1},
                })
            except urllib.error.HTTPError as exc:
                if index != target_index:
                    fail(f"unexpected friction at call {index}; expected {target_index}")
                signature = exc.headers.get("X-Simulator-Failure")
                payload = json.loads(exc.read().decode() or "{}")
                expected_status = 429 if signature == "rate_limited" else 412
                if signature != expected_signature or exc.code != expected_status:
                    fail(f"wrong scheduled failure: HTTP {exc.code}, {signature!r}")
                if signature == "rate_limited" and exc.headers.get("Retry-After") != "1":
                    fail("HTTP 429 omitted Retry-After: 1")
                if "simulator_signature" in payload:
                    fail("simulator metadata leaked into the vendor response body")
                if not isinstance(payload.get("error"), dict):
                    fail(f"Clio friction body is not vendor-shaped: {payload!r}")
                observed = signature
        if observed is None:
            fail("scheduled friction call returned HTTP 200")
    finally:
        try:
            http(base, "DELETE", f"/sessions/{sid}", session=sid, token=token)
        except Exception:
            pass

    for dialect in ("clio", "courtlistener", "google", "relativity",
                    "imanage", "docusign", "ledes"):
        for signature in ("rate_limited", "stale_reference"):
            status, body, headers = friction_http(signature, dialect)
            if status not in {409, 412, 429} or not isinstance(body, dict):
                fail(f"invalid {dialect} {signature} HTTP fixture")
            if headers.get("X-Simulator-Failure") != signature:
                fail(f"missing harness-only signature header for {dialect}")
    return observed, target_index


def check_infrastructure_separation() -> None:
    class QuietHandler(BaseHTTPRequestHandler):
        def log_message(self, *_args):
            pass

    doomed = HTTPServer(("127.0.0.1", 0), QuietHandler)
    port = doomed.server_address[1]
    doomed.server_close()  # the transport disappears before the pending tool call

    probe = OracleSession.__new__(OracleSession)
    probe.base = f"http://127.0.0.1:{port}"
    probe.sid = "killed-server"
    probe.access_token = "dead-token"
    probe.refresh_token = "dead-refresh"
    probe.trace = []
    probe._rpc_id = 0
    ok, text = probe.call("matters_list", {"limit": 1}, retries=0)
    payload = json.loads(text)
    if ok or payload.get("infrastructure_error") is not True:
        fail(f"killed server was not classified as infrastructure_error: {payload!r}")
    if "simulator_signature" in payload or "rate_limited" in text:
        fail("infrastructure outage masqueraded as benchmark friction")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", default="http://127.0.0.1:8974")
    parser.add_argument("--world", default=str(ROOT / "world" / "blobfish" / "world-v16.json"))
    args = parser.parse_args()
    check_auth(args.base.rstrip("/"))
    signature, index = check_friction(args.base.rstrip("/"), Path(args.world))
    check_infrastructure_separation()
    print(f"auth/errors: bearer+one-use refresh clean; {signature} at call {index}; "
          "infrastructure_error distinct")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
