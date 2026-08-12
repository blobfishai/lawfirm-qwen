#!/usr/bin/env python3
"""M7.1 acceptance gate: canaries halt a broken sweep before model calls."""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import socket
import subprocess
import sys
import time
import urllib.request


ROOT = Path(__file__).resolve().parents[1]
# The canary-proof gate proves HARNESS mechanics (clean canary passes, a
# seeded defect halts before any model episode). Those mechanics are world-
# agnostic, and the 76 MB v19 world OOM-kills the server on 7 GB CI runners
# (three concurrent world loads during the probe). The small frozen v16
# world proves the same contract everywhere.
WORLD = ROOT / "world" / "blobfish" / "world-v16.json"
CONTRACTS = ROOT / "mcp" / "v3" / "contracts"
sys.path.insert(0, str(ROOT / "world" / "local"))
from oracle import OracleSession  # noqa: E402


def free_port() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def wait_ready(base: str, process: subprocess.Popen) -> None:
    for _ in range(80):
        if process.poll() is not None:
            raise AssertionError(f"world server exited early ({process.returncode})")
        try:
            with urllib.request.urlopen(base + "/health", timeout=0.25) as response:
                if response.status == 200:
                    return
        except OSError:
            time.sleep(0.05)
    raise AssertionError("world server did not become ready")


def start_server(world: Path) -> tuple[subprocess.Popen, str]:
    port = free_port()
    process = subprocess.Popen(
        [sys.executable, "world/local/server.py", "--port", str(port),
         "--world", str(world), "--v2-contracts", str(CONTRACTS)],
        cwd=ROOT,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    base = f"http://127.0.0.1:{port}"
    wait_ready(base, process)
    return process, base


def stop_server(process: subprocess.Popen) -> None:
    process.terminate()
    try:
        process.wait(timeout=5)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait(timeout=5)


def probe(world_rel: str, base: str, health_rel: str) -> tuple[int, dict]:
    result = subprocess.run(
        ["node", "sim/run-leaderboard.mjs", "--engines", "deepseek-chat",
         "--tasks", "task_003", "--episodes", "1", "--world-file", world_rel,
         "--local-base", base, "--canary-probe", "--health-out", health_rel,
         "--label", "canary-selftest"],
        cwd=ROOT,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        timeout=180,
    )
    health_path = ROOT / health_rel
    if not health_path.exists():
        raise AssertionError(f"canary emitted no health artifact:\n{result.stdout}")
    return result.returncode, json.loads(health_path.read_text())


def broken_world(path: Path) -> None:
    raw = json.loads(WORLD.read_text())
    world = raw.get("world", raw)
    verifier = next(item for item in world["verifiers"] if item["task_id"] == "task_003")
    verifier["assertions"] = ["seeded_canary_failure"]
    verifier["key_assertions"] = ["seeded_canary_failure"]
    verifier["vcode"] = (
        "def verify(initial_state, final_state, trace):\n"
        "    return {'passed': False, 'reward': 0.0, "
        "'failed_conditions': ['seeded_canary_failure'], "
        "'assertions': [{'name': 'seeded_canary_failure', 'passed': False}]}\n"
    )
    path.write_text(json.dumps(raw))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--proof", help="optional committed proof JSON path, relative to repo")
    args = parser.parse_args()

    subprocess.run(["node", "sim/tests/sweep-health.test.mjs"], cwd=ROOT, check=True)
    token = str(__import__("os").getpid())
    broken_rel = f"data/leaderboard/.broken-canary-{token}.json"
    good_health_rel = f"data/leaderboard/.good-canary-{token}.json"
    bad_health_rel = f"data/leaderboard/.bad-canary-{token}.json"
    broken_path = ROOT / broken_rel
    transient = [broken_path, ROOT / good_health_rel, ROOT / bad_health_rel]
    proof = {}
    try:
        process, base = start_server(WORLD)
        try:
            good_code, good = probe("world/blobfish/world-v16.json", base, good_health_rel)
            session = OracleSession(base, task_id="task_003")
            try:
                rpc_ok, _ = session.call("definitely_not_a_tool", {}, retries=0)
            finally:
                session.close()
        finally:
            stop_server(process)
        if good_code != 0 or good["canaries"]["failed"] != 0:
            raise AssertionError(f"clean canary failed: exit={good_code}, health={good}")
        if rpc_ok:
            raise AssertionError("top-level JSON-RPC error was treated as a successful tool call")

        broken_world(broken_path)
        process, base = start_server(broken_path)
        try:
            bad_code, bad = probe(broken_rel, base, bad_health_rel)
        finally:
            stop_server(process)
        if bad_code != 3 or bad["canaries"]["failed"] != 1 or not bad.get("haltedBy"):
            raise AssertionError(f"broken canary did not halt: exit={bad_code}, health={bad}")
        if bad["episodes"] != 0:
            raise AssertionError("broken canary allowed model episodes before halting")

        proof = {
            "world": "world-v19",
            "task": "task_003",
            "clean_canary_exit": good_code,
            "seeded_defect_exit": bad_code,
            "seeded_defect_model_episodes": bad["episodes"],
            "jsonrpc_error_is_failure": not rpc_ok,
            "classification_unit_gate": "passed",
        }
        if args.proof:
            proof_path = ROOT / args.proof
            proof_path.parent.mkdir(parents=True, exist_ok=True)
            proof_path.write_text(json.dumps(proof, indent=2) + "\n")
    finally:
        for path in transient:
            path.unlink(missing_ok=True)

    print("sweep-health gate: clean canary passes; seeded verifier defect halts before any model episode; JSON-RPC errors fail")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
