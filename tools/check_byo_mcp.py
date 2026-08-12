#!/usr/bin/env python3
"""End-to-end proof that legal-mcp can use CourtDock through a base-URL swap."""

from __future__ import annotations

import argparse
import contextlib
import importlib
import json
import os
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
LEGAL_MCP = ROOT / "research/repos/agentic-ops@legal-mcp"
WORLD = ROOT / "world/blobfish/world-v19.json"
PROOF = ROOT / "data/ecosystem/byo-mcp-proof.json"
TOKEN = "courtlistener-local-simulation-token"


def free_port() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def wait_ready(url: str, process: subprocess.Popen[str]) -> None:
    deadline = time.monotonic() + 20
    last_error: Exception | None = None
    while time.monotonic() < deadline:
        if process.poll() is not None:
            raise RuntimeError(f"process exited before readiness: {process.stderr.read()}")
        try:
            with urllib.request.urlopen(url, timeout=0.5) as response:
                if response.status == 200:
                    return
        except (urllib.error.URLError, TimeoutError, ConnectionError) as exc:
            last_error = exc
            time.sleep(0.05)
    raise RuntimeError(f"service not ready at {url}: {last_error}")


class UrllibResponse:
    def __init__(self, response: Any) -> None:
        self.status_code = response.status
        self._body = response.read()

    def raise_for_status(self) -> None:
        if self.status_code >= 400:
            raise RuntimeError(f"HTTP {self.status_code}")

    def json(self) -> dict[str, Any]:
        return json.loads(self._body)


class UrllibClient:
    """The tiny httpx-compatible seam supported by legal-mcp's client."""

    def get(self, url: str, params: dict[str, Any], headers: dict[str, str]) -> UrllibResponse:
        encoded = urllib.parse.urlencode(params)
        request = urllib.request.Request(f"{url}?{encoded}", headers=headers)
        return UrllibResponse(urllib.request.urlopen(request, timeout=10))


def terminate(process: subprocess.Popen[str]) -> None:
    if process.poll() is None:
        process.terminate()
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=5)


def run_proof() -> dict[str, Any]:
    world_port, facade_port = free_port(), free_port()
    world_base = f"http://127.0.0.1:{world_port}"
    facade_base = f"http://127.0.0.1:{facade_port}"
    world = subprocess.Popen(
        [sys.executable, "world/local/server.py", "--port", str(world_port),
         "--world", str(WORLD), "--v2-contracts", "mcp/v3/contracts"],
        cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
    )
    facade: subprocess.Popen[str] | None = None
    try:
        wait_ready(world_base + "/health", world)
        facade = subprocess.Popen(
            [sys.executable, "mcp/byo/courtlistener_facade.py", "--port", str(facade_port),
             "--world-base", world_base, "--token", TOKEN],
            cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
        )
        wait_ready(facade_base + "/health", facade)

        old_path = list(sys.path)
        sys.path.insert(0, str(LEGAL_MCP))
        previous = {key: os.environ.get(key) for key in (
            "COURTLISTENER_ENABLED", "COURTLISTENER_BASE_URL",
            "COURTLISTENER_API_TOKEN", "PACER_ENABLED",
        )}
        os.environ.update({
            "COURTLISTENER_ENABLED": "true",
            "COURTLISTENER_BASE_URL": facade_base + "/api/rest/v4",
            "COURTLISTENER_API_TOKEN": TOKEN,
            "PACER_ENABLED": "false",
        })
        try:
            config = importlib.import_module("integrations.config")
            courtlistener = importlib.import_module("integrations.courtlistener")
            settings = config.CourtListenerSettings.from_env()
            client = courtlistener.CourtListenerClient(settings, http_client=UrllibClient())
            result = client.search("court", result_type="o", limit=5)
        finally:
            sys.path[:] = old_path
            for key, value in previous.items():
                if value is None:
                    os.environ.pop(key, None)
                else:
                    os.environ[key] = value

        if result.get("source") != "courtlistener" or result.get("enabled") is not True:
            raise AssertionError(f"legal-mcp did not use the configured CourtListener path: {result}")
        if result.get("result_count") is None or not isinstance(result.get("results"), list):
            raise AssertionError(f"invalid search result: {result}")

        unauthenticated = urllib.request.Request(
            facade_base + "/api/rest/v4/search/?q=court&type=o"
        )
        try:
            urllib.request.urlopen(unauthenticated, timeout=5)
            raise AssertionError("facade accepted a search without its synthetic token")
        except urllib.error.HTTPError as exc:
            if exc.code != 401:
                raise

        return {
            "schema": "legal-agent-simulation.byo-mcp-proof.v1",
            "source": {
                "repo": "agentic-ops/legal-mcp",
                "commit": "e726301bfdc7",
                "license": "AGPL-3.0-only",
            },
            "target": "CourtListenerClient.search",
            "configuration": {
                "base_url_swapped": True,
                "pacer_disabled": True,
                "synthetic_token_required": True,
            },
            "translation": {"type=o": "opinions_search", "type=r": "dockets_search"},
            "external_network": False,
            "query": "court",
            "result_count": result["result_count"],
            "results_returned": len(result["results"]),
            "passed": True,
        }
    finally:
        if facade is not None:
            terminate(facade)
        terminate(world)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--write-proof", action="store_true")
    parser.add_argument("--check-proof", action="store_true")
    args = parser.parse_args()
    proof = run_proof()
    rendered = json.dumps(proof, indent=2, sort_keys=True) + "\n"
    if args.write_proof:
        PROOF.parent.mkdir(parents=True, exist_ok=True)
        PROOF.write_text(rendered)
    if args.check_proof and (not PROOF.exists() or PROOF.read_text() != rendered):
        raise AssertionError("committed BYO-MCP proof is stale")
    print(
        f"BYO-MCP accepted: legal-mcp CourtListenerClient returned "
        f"{proof['results_returned']} deterministic results; external network disabled"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
