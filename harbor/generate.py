#!/usr/bin/env python3
"""Generate Harbor-format tasks (github.com/harbor-framework/harbor) from the
canonical world document.

Each of the world's tasks becomes one Harbor task directory:

    dist/harbor/tasks/task_XXX/
      instruction.md                the task prompt + interaction contract
      task.toml                     schema 1.4 config + provenance metadata
      environment/Dockerfile        agent container (python + curl + `tool` CLI)
      environment/tool              firm-systems CLI (JSON-RPC over the shim)
      environment/docker-compose.yaml  adds the shared `world` service
      tests/test.sh                 POST /verify -> /logs/verifier/reward.json
      solution/solve.sh             token-gated POST /solve (oracle reference walk)

The world itself (runtime + world doc + v2 contracts + shim) is ONE shared
Docker image (dist/harbor/world-image/, built with --build-image); per-task
compose files select the task via the TASK_ID env var. The agent container
never contains world.json, so verifier code and reference walks are not
readable by the agent.

Usage:
  python3 harbor/generate.py [--world world/blobfish/world-v15.json]
                             [--out dist/harbor] [--tasks task_003,task_010]
                             [--build-image] [--image-tag legal-agent-sim-world:v15]
"""
from __future__ import annotations

import argparse
import json
import os
import secrets
import shutil
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

DISCLAIMER = ("Simulation only - every matter, client, document, attorney, "
              "and figure is synthetic test data.")


def toml_str(s: str) -> str:
    """JSON string escaping is a valid TOML basic string."""
    return json.dumps(str(s))


def load_world(path: str) -> dict:
    with open(path) as f:
        raw = json.load(f)
    return raw.get("world", raw)


# ---------------------------------------------------------------------------
# Per-task files
# ---------------------------------------------------------------------------

def instruction_md(task: dict) -> str:
    prompt = (task.get("prompt") or "").strip()
    parts = [prompt]
    session = task.get("session") or []
    followups = [s.get("user_text") for s in session if s.get("user_text")]
    if followups:
        parts.append(
            "\n## Follow-up messages\n\n"
            "In the original multi-turn session the user sends these additional "
            "messages, in order, while the work is underway. Treat them as part "
            "of the request:\n\n"
            + "\n".join(f"{i}. {json.dumps(t)}" for i, t in enumerate(followups, 1))
        )
    parts.append(f"""
## Environment

You are an agent operating inside a fully synthetic litigation/corporate
law-firm simulation world ("Eve Litigation" — SIMULATED; no real entities,
clients, or matters). The firm's systems of record are exposed as tools from a
world server on the container network.

Two equivalent ways to use the tools:

1. The `tool` CLI (available on PATH):

   ```bash
   tool list                        # every tool: name + description
   tool schema <name>               # input schema for one tool
   tool call <name> '<json-args>'   # e.g. tool call read_matter_document '{{"id": 12}}'
   ```

2. MCP (streamable-http, JSON-RPC `tools/list` / `tools/call`) at
   `http://world:8972/mcp` — also declared to MCP-capable harnesses as the
   `lawfirm` server.

Rules:

- Complete the task using the tools. Be precise with record ids and values.
- Read input documents in full before drafting deliverables from them.
- Deliverables must be produced in the systems of record via tools (for
  example `draft_matter_document`); work only described in chat text does not
  count as done.
- Transient tool errors (`rate_limited`, `stale_reference`) are recoverable —
  retry the same call. Ambiguous write acknowledgements ("queued for
  processing") may still have applied: re-read the record instead of writing
  twice.
- Query tools page their results: when a response says `has_more`, you have
  NOT seen every match — continue with `offset`.

When the work is complete, finish your session; grading is automatic.
""")
    return "\n".join(parts).strip() + "\n"


def task_toml(task: dict, image_tag: str, world_version) -> str:
    tid = task["task_id"]
    prov = task.get("provenance") or {}
    goal = (task.get("goal") or "").strip().replace("\n", " ")
    if len(goal) > 300:
        goal = goal[:297] + "..."
    keywords = [k for k in [
        task.get("difficulty_tier"), task.get("complexity"),
        (prov.get("source_workflow") or "").split("/")[-1] or None,
    ] if k]
    lines = [
        'schema_version = "1.4"', "",
        "[task]",
        f'name = "legal-agent-simulation/{tid.replace("_", "-")}"',
        f'version = "15.{world_version}.0"',
        f"description = {toml_str(goal or tid)}",
        "authors = []",
        f"keywords = {json.dumps(keywords)}",
        "",
        "[metadata]",
        f"task_id = {toml_str(tid)}",
        f"difficulty = {toml_str(task.get('difficulty_tier') or '')}",
        f"complexity = {toml_str(task.get('complexity') or '')}",
        f"acceptance_label = {toml_str(task.get('acceptance_label') or '')}",
        f"source_workflow = {toml_str(prov.get('source_workflow') or '')}",
        f"method = {toml_str(task.get('method') or '')}",
        f"world_image = {toml_str(image_tag)}",
        f"disclaimer = {toml_str(DISCLAIMER)}",
        "",
        "[verifier]",
        "timeout_sec = 180.0",
        "",
        "[agent]",
        "timeout_sec = 1800.0",
        "",
        "[environment]",
        "build_timeout_sec = 900.0",
        "cpus = 1",
        "memory_mb = 2048",
        "storage_mb = 10240",
        "gpus = 0",
        "",
        "[[environment.mcp_servers]]",
        'name = "lawfirm"',
        'transport = "streamable-http"',
        'url = "http://world:8972/mcp"',
        "",
    ]
    return "\n".join(lines)


AGENT_DOCKERFILE = """\
# Agent container. The world (tools, verifiers, state) lives in the separate
# `world` compose service — see docker-compose.yaml.
FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends curl \\
    && rm -rf /var/lib/apt/lists/*
COPY tool /usr/local/bin/tool
RUN chmod +x /usr/local/bin/tool
ENV LAWFIRM_MCP=http://world:8972/mcp
WORKDIR /app
"""


def compose_yaml(task_id: str, image_tag: str) -> str:
    return f"""\
# Merged on top of Harbor's base compose config; `main` (the agent container)
# is configured by Harbor automatically. The shared world image is built once:
#   python3 harbor/generate.py --build-image
services:
  main:
    depends_on:
      world:
        condition: service_healthy

  world:
    image: {image_tag}
    environment:
      TASK_ID: {task_id}
    expose:
      - "8972"
    healthcheck:
      test: ["CMD", "python3", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8972/health', timeout=2)"]
      interval: 2s
      timeout: 5s
      retries: 60
      start_period: 5s
"""


TEST_SH = """\
#!/bin/bash
# Verifier: ask the world container for the trial verdict (shipped VCode,
# executed against the session's final state + the recorded tool trace),
# then emit the Harbor reward file.
mkdir -p /logs/verifier
python3 - <<'PYEOF'
import json, os, urllib.request

verdict, out = None, {"reward": 0.0, "passed": 0.0}
try:
    req = urllib.request.Request("http://world:8972/verify", method="POST")
    req.add_header("Content-Type", "application/json")
    with urllib.request.urlopen(req, data=b"{}", timeout=150) as res:
        verdict = json.loads(res.read().decode() or "{}")
    out["reward"] = round(float(verdict.get("reward") or 0.0), 4)
    out["passed"] = 1.0 if verdict.get("passed") else 0.0
except Exception as e:  # world unreachable / verifier crash -> reward 0
    verdict = {"error": repr(e)}

os.makedirs("/logs/verifier", exist_ok=True)
with open("/logs/verifier/verdict.json", "w") as f:
    json.dump(verdict, f, indent=1)
with open("/logs/verifier/reward.json", "w") as f:
    json.dump(out, f)
print(json.dumps({"passed": out["passed"], "reward": out["reward"],
                  "failed_conditions": (verdict or {}).get("failed_conditions")}))
PYEOF
"""


def solve_sh(token: str) -> str:
    return f"""\
#!/bin/bash
# Oracle solution: the world container replays this task's reference walk
# through the live session (token-gated; the token exists only in the world
# image and in this file, which is never present during agent runs).
set -e
curl -fsS -X POST -H "X-Solve-Token: {token}" http://world:8972/solve
echo
"""


# ---------------------------------------------------------------------------
# Assembly
# ---------------------------------------------------------------------------

def write(path: str, content: str, executable: bool = False) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        f.write(content)
    if executable:
        os.chmod(path, 0o755)


def assemble_world_image(out: str, world_path: str) -> str:
    """Copy runtime + world doc + shim into the shared image build context."""
    img = os.path.join(out, "world-image")
    os.makedirs(img, exist_ok=True)
    local = os.path.join(ROOT, "world", "local")
    for name in ("server.py", "oracle.py", "v2runtime.py", "v3dialects.py"):
        shutil.copyfile(os.path.join(local, name), os.path.join(img, name))
    for name in ("shim.py", "start.sh", "Dockerfile"):
        shutil.copyfile(os.path.join(HERE, "world-image", name),
                        os.path.join(img, name))
    shutil.copyfile(world_path, os.path.join(img, "world.json"))
    contracts = os.path.join(ROOT, "mcp", "v3", "contracts")
    dst = os.path.join(img, "contracts")
    if os.path.isdir(dst):
        shutil.rmtree(dst)
    shutil.copytree(contracts, dst)
    return img


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--world", default=os.path.join(ROOT, "world", "blobfish",
                                                    "world-v15.json"))
    ap.add_argument("--out", default=os.path.join(ROOT, "dist", "harbor"))
    ap.add_argument("--tasks", default="", help="comma-separated task_id filter")
    ap.add_argument("--image-tag",
                    default="ghcr.io/blobfishai/legal-agent-sim-world:v15",
                    help="world image reference baked into every task's compose "
                         "file; --build-image tags the local build with it")
    ap.add_argument("--build-image", action="store_true")
    args = ap.parse_args()

    world = load_world(args.world)
    wanted = {t for t in args.tasks.split(",") if t}
    tasks = [t for t in world["tasks"] if not wanted or t["task_id"] in wanted]
    if wanted and len(tasks) != len(wanted):
        sys.exit(f"unknown task ids: {sorted(wanted - {t['task_id'] for t in tasks})}")

    out = os.path.abspath(args.out)
    os.makedirs(out, exist_ok=True)

    # Solve token: stable across regenerations so committed nothing depends on it.
    token_path = os.path.join(out, "world-image", "solve-token.txt")
    if os.path.exists(token_path):
        token = open(token_path).read().strip()
    else:
        token = secrets.token_hex(16)
    img_dir = assemble_world_image(out, args.world)
    write(token_path, token + "\n")

    tool_src = open(os.path.join(HERE, "agent-image", "tool")).read()
    tasks_root = os.path.join(out, "tasks")
    for task in tasks:
        tid = task["task_id"]
        d = os.path.join(tasks_root, tid)
        if os.path.isdir(d):
            shutil.rmtree(d)
        write(os.path.join(d, "instruction.md"), instruction_md(task))
        write(os.path.join(d, "task.toml"),
              task_toml(task, args.image_tag, world.get("version")))
        write(os.path.join(d, "environment", "Dockerfile"), AGENT_DOCKERFILE)
        write(os.path.join(d, "environment", "tool"), tool_src, executable=True)
        write(os.path.join(d, "environment", "docker-compose.yaml"),
              compose_yaml(tid, args.image_tag))
        write(os.path.join(d, "tests", "test.sh"), TEST_SH, executable=True)
        write(os.path.join(d, "solution", "solve.sh"), solve_sh(token),
              executable=True)

    write(os.path.join(out, "README.md"), f"""\
# legal-agent-simulation — Harbor tasks

{len(tasks)} Harbor-format tasks generated from `{os.path.relpath(args.world, ROOT)}`
(one per world task; regenerate with `python3 harbor/generate.py`).

{DISCLAIMER}

## One-time setup

Build the shared world image (world runtime + world doc + v2 contracts):

```bash
python3 harbor/generate.py --build-image        # tags {args.image_tag}
```

## Run

```bash
harbor run -p "dist/harbor/tasks/task_003" -a claude-code -m anthropic/claude-sonnet-5
harbor run -p "dist/harbor/tasks/task_003" -a oracle       # reference-walk sanity check
```

Multi-container tasks require Harbor's **docker** environment provider
(compose networking); cloud providers are not supported for these tasks.

## Architecture

- `world` service (shared image `{args.image_tag}`): the executable law-firm
  world — 72-table SQLite hydrated from the world doc, {len(world["tools"])} synthesized +
  v2 product tools, deterministic seeded friction, shipped VCode verifiers.
  A per-trial shim creates the task's session, records the tool trace, and
  exposes `POST /mcp` (JSON-RPC), `POST /verify`, and token-gated `POST /solve`.
- `main` (agent container): python + curl + the `tool` CLI. It contains no
  world document, verifier code, or reference walks.
- `tests/test.sh` fetches the VCode verdict and writes `reward.json`
  (`reward` = graded fraction with anti-hack vetoes, `passed` = strict bool).
- `solution/solve.sh` triggers the oracle reference walk server-side — the
  same walk `world/local/oracle.py` proves 291/291 against this world.
""")

    print(f"generated {len(tasks)} Harbor tasks -> {tasks_root}")
    print(f"world image context -> {img_dir}")

    if args.build_image:
        cmd = ["docker", "build", "-t", args.image_tag,
               "--build-arg", f"SOLVE_TOKEN={token}", img_dir]
        print("+", " ".join(cmd))
        subprocess.run(cmd, check=True)


if __name__ == "__main__":
    main()
