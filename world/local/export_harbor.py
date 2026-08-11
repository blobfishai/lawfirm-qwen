#!/usr/bin/env python3
"""Harbor package exporter — emits a self-contained Harbor-style bundle from
the world document, matching the layout blobfish's s09_harbor stage produces
(README, task.yaml, Dockerfile, environment DB + server, tasks.jsonl,
integrity manifest) so any Harbor-compatible harness can run this world
without this repo.

One honest deviation from the hosted packages: hosted bundles carried
per-tool generated Python sources under tools/. Those sources died with the
hosted world; here tool behavior is implemented by the bundled runtime
(server.py synthesizes each tool deterministically from its spec, proven by
the 231/231 oracle fidelity pass). tools/tool_manifest.json therefore maps
every tool to the runtime with its schema + an integrity digest of the spec.

Usage: python3 world/local/export_harbor.py [--world world/blobfish/world-v7.json]
                                            [--out dist/harbor]
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)

import server as runtime  # noqa: E402  (build_seed_db, set_state_dir, load_world)


def sha256_file(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    return h.hexdigest()


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--world", default=os.path.join(ROOT, "world", "blobfish", "world-v7.json"))
    ap.add_argument("--out", default=os.path.join(ROOT, "dist", "harbor"))
    args = ap.parse_args()

    world = runtime.load_world(args.world)
    out = os.path.abspath(args.out)
    if os.path.exists(out):
        shutil.rmtree(out)
    env_dir = os.path.join(out, "environment")
    os.makedirs(env_dir, exist_ok=True)
    os.makedirs(os.path.join(out, "tasks"), exist_ok=True)
    os.makedirs(os.path.join(out, "tools"), exist_ok=True)

    # ---- environment: pristine DB + runtime + world document ----
    runtime.set_state_dir(args.world)
    runtime.build_seed_db(world)
    shutil.copyfile(runtime.SEED_DB, os.path.join(env_dir, "db.sqlite"))
    shutil.copyfile(os.path.join(HERE, "server.py"), os.path.join(env_dir, "server.py"))
    shutil.copyfile(os.path.join(HERE, "oracle.py"), os.path.join(env_dir, "oracle.py"))
    shutil.copyfile(args.world, os.path.join(env_dir, "world.json"))
    # v3 real-API contract layer ships with the package
    contracts_src = os.path.join(ROOT, "mcp", "v3", "contracts")
    if os.path.isdir(contracts_src):
        shutil.copytree(contracts_src, os.path.join(env_dir, "contracts"))
        shutil.copyfile(os.path.join(HERE, "v2runtime.py"), os.path.join(env_dir, "v2runtime.py"))
        shutil.copyfile(os.path.join(HERE, "v3dialects.py"), os.path.join(env_dir, "v3dialects.py"))

    # ---- tasks/tasks.jsonl (instruction + verifier + reference walk) ----
    verifiers = {v["task_id"]: v for v in world.get("verifiers", [])}
    tasks_path = os.path.join(out, "tasks", "tasks.jsonl")
    with open(tasks_path, "w") as f:
        for t in world["tasks"]:
            v = verifiers.get(t["task_id"], {})
            f.write(json.dumps({
                "task_id": t["task_id"],
                "instruction": t.get("prompt"),
                "difficulty": t.get("difficulty_tier") or t.get("complexity"),
                "origin": (t.get("provenance") or {}).get("source_workflow"),
                "acceptance_label": t.get("acceptance_label"),
                "required_tools": t.get("required_tools"),
                "walk": t.get("walk"),
                "reference_args": t.get("reference_args"),
                "vcode": v.get("vcode"),
                "assertions": v.get("assertions"),
            }, default=str) + "\n")

    # ---- tools/tool_manifest.json (schema + integrity, runtime-backed) ----
    manifest = {}
    for tool in world["tools"]:
        spec = json.dumps(tool, sort_keys=True, default=str).encode()
        manifest[tool["name"]] = {
            "runtime": "environment/server.py#ToolRuntime",
            "type": tool.get("type"),
            "target_tables": tool.get("target_tables"),
            "parameters": tool.get("parameters"),
            "spec_sha256": hashlib.sha256(spec).hexdigest(),
        }
    with open(os.path.join(out, "tools", "tool_manifest.json"), "w") as f:
        json.dump(manifest, f, indent=1, default=str)

    # ---- task.yaml / Dockerfile / compose / README ----
    n_tasks = len(world["tasks"])
    with open(os.path.join(out, "task.yaml"), "w") as f:
        f.write(f"""name: eve-litigation-lawfirm-simulated
version: {world.get("version")}
domain: legal/law-firm
disclaimer: Simulation only — every matter, party, document, and figure is synthetic.
environment:
  database: environment/db.sqlite
  server: environment/server.py
  port: 8971
  surface: [POST /sessions, POST /mcp (JSON-RPC tools/list+tools/call), POST /verify/{{task_id}}]
tools:
  count: {len(world["tools"])}
  manifest: tools/tool_manifest.json
tasks:
  count: {n_tasks}
  source: tasks/tasks.jsonl
  verification: embedded VCode (deterministic, per-assertion, anti-hack vetoes)
fidelity:
  oracle: all {n_tasks} reference walks execute and pass their verifiers (environment/oracle.py)
""")
    with open(os.path.join(out, "Dockerfile"), "w") as f:
        f.write("""FROM python:3.12-slim
WORKDIR /app
COPY . /app
EXPOSE 8971
CMD ["python", "/app/environment/server.py", "--port", "8971", "--world", "/app/environment/world.json", "--v2-contracts", "/app/environment/contracts"]
""")
    with open(os.path.join(out, "docker-compose.yml"), "w") as f:
        f.write("""services:
  world:
    build: .
    ports: ["8971:8971"]
""")
    with open(os.path.join(out, "README.md"), "w") as f:
        f.write(f"""# Eve Litigation (SIMULATED) — Harbor package

Self-contained executable law-firm world: {n_tasks} tasks, {len(world["tools"])} tools,
deterministic VCode verifiers. Everything synthetic.

Run:  python environment/server.py --port 8971 --world environment/world.json --v2-contracts environment/contracts
Prove: python environment/oracle.py --base http://127.0.0.1:8971 --world environment/world.json
Or:   docker compose up

Surface: POST /sessions · POST /mcp (JSON-RPC) · POST /verify/{{task_id}} (body {{"trace": [...]}}).
Tool behavior is synthesized by the bundled runtime from each tool's spec
(see tools/tool_manifest.json); fidelity is proven by the oracle pass above.
""")

    # ---- integrity manifest ----
    files = {}
    for dirpath, _, names in os.walk(out):
        for n in names:
            p = os.path.join(dirpath, n)
            files[os.path.relpath(p, out)] = sha256_file(p)
    with open(os.path.join(out, "manifest.json"), "w") as f:
        json.dump({"schema": "lawfirm-qwen.harbor-export.v1", "files": files}, f, indent=1)

    total = sum(os.path.getsize(os.path.join(out, p)) for p in files)
    print(f"harbor package: {out} — {len(files) + 1} files, {total / 1e6:.1f} MB, {n_tasks} tasks")


if __name__ == "__main__":
    main()
