#!/usr/bin/env python3
"""Evidence-only M7.2 difficulty calibration for a three-episode sweep.

The tool never infers model difficulty from task metadata, oracle success, or
document length. A label exists only when three non-infrastructure,
non-refusal model episodes exist for that exact world version.
"""
from __future__ import annotations

import argparse
from collections import Counter, defaultdict
import gzip
import json
from pathlib import Path
import re
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_WORLD = ROOT / "world" / "blobfish" / "world-v19.json"
REFUSAL_RE = re.compile(
    r"\b(cannot assist|can't assist|cannot help with|unable to (help|assist)|"
    r"i (must|have to) (decline|refuse)|against my (guidelines|principles))\b",
    re.I,
)


def final_text(episode: dict[str, Any]) -> str:
    parts = [str(episode.get("finalText") or "")]
    for step in reversed(episode.get("steps") or []):
        if step.get("tool") == "_final_answer":
            parts.append(str(step.get("observation") or ""))
            break
    return "\n".join(parts)


def usable(episode: dict[str, Any], world_version: int,
           expected_tool_scope: str | None = None) -> tuple[bool, str]:
    if episode.get("infraError"):
        return False, "infrastructure"
    if (episode.get("toolCalls") or 0) == 0 and REFUSAL_RE.search(final_text(episode)):
        return False, "refusal"
    if episode.get("worldVersion") != world_version:
        return False, "wrong_world_version"
    if expected_tool_scope is not None:
        actual_scope = (episode.get("toolScope") or {}).get("mode")
        if actual_scope != expected_tool_scope:
            return False, "wrong_tool_scope"
    return True, "measured"


def classify_task(task: dict[str, Any], episodes: list[dict[str, Any]],
                  expected: int = 3) -> dict[str, Any]:
    if len(episodes) != expected:
        return {"label": "unmeasured", "episodes": len(episodes),
                "needed": expected - len(episodes)}
    passes = sum(episode.get("passed") is True for episode in episodes)
    calls = [int(episode.get("toolCalls") or 0) for episode in episodes]
    conditions = [set(map(str, episode.get("failedConditions") or []))
                  for episode in episodes if episode.get("passed") is not True]
    common = sorted(set.intersection(*conditions)) if conditions and all(conditions) else []
    reference_calls = len(task.get("walk") or [])
    trivial_limit = max(3, reference_calls + 1)
    if passes == expected:
        label = "easy" if all(value <= trivial_limit for value in calls) else "medium"
    elif passes:
        label = "boundary"
    elif common:
        label = "suspect"
    else:
        label = "hard"
    return {
        "label": label,
        "episodes": expected,
        "passes": passes,
        "tool_calls": calls,
        "reference_calls": reference_calls,
        "trivial_call_limit": trivial_limit,
        "systematic_failed_assertions": common,
    }


def episode_paths(path: Path) -> list[Path]:
    """Return one physical file per logical record; reject raw/gzip collisions."""
    logical: dict[str, Path] = {}
    for episode_path in sorted((*path.glob("*.json"), *path.glob("*.json.gz"))):
        key = episode_path.name[:-3] if episode_path.name.endswith(".json.gz") else episode_path.name
        if key in logical:
            raise ValueError(f"duplicate raw/compressed episode record: {path / key}")
        logical[key] = episode_path
    return [logical[key] for key in sorted(logical)]


def read_episode(path: Path) -> dict[str, Any]:
    if path.name.endswith(".json.gz"):
        with gzip.open(path, "rt", encoding="utf-8") as handle:
            return json.load(handle)
    return json.loads(path.read_text())


def load_episodes(path: Path, world_version: int,
                  expected_tool_scope: str | None = None) -> tuple[dict[str, list[dict]], Counter]:
    by_task: dict[str, list[dict]] = defaultdict(list)
    exclusions: Counter = Counter()
    if not path.exists():
        return by_task, exclusions
    for episode_path in episode_paths(path):
        try:
            episode = read_episode(episode_path)
        except (OSError, json.JSONDecodeError, gzip.BadGzipFile):
            exclusions["malformed"] += 1
            continue
        task_id = episode.get("taskId")
        if not task_id:
            exclusions["missing_task_id"] += 1
            continue
        is_usable, reason = usable(episode, world_version, expected_tool_scope)
        if not is_usable:
            exclusions[reason] += 1
            continue
        by_task[str(task_id)].append(episode)
    return by_task, exclusions


def build_report(world_path: Path, episodes_path: Path, expected: int,
                 expected_tool_scope: str | None = None) -> dict[str, Any]:
    raw = json.loads(world_path.read_text())
    world = raw.get("world", raw)
    version = int(world["version"])
    by_task, exclusions = load_episodes(episodes_path, version, expected_tool_scope)
    labels = {}
    unknown_episode_tasks = sorted(set(by_task) - {task["task_id"] for task in world["tasks"]})
    for task in world["tasks"]:
        labels[task["task_id"]] = classify_task(task, by_task.get(task["task_id"], []), expected)
    counts = Counter(item["label"] for item in labels.values())
    measured = sum(label != "unmeasured" for label in (item["label"] for item in labels.values()))
    return {
        "schema_version": 1,
        "world": world_path.relative_to(ROOT).as_posix() if world_path.is_relative_to(ROOT) else str(world_path),
        "world_version": version,
        "episodes_path": episodes_path.relative_to(ROOT).as_posix() if episodes_path.is_relative_to(ROOT) else str(episodes_path),
        "expected_episodes_per_task": expected,
        "tool_scope": expected_tool_scope,
        "tasks": len(world["tasks"]),
        "tasks_fully_measured": measured,
        "episodes_required": len(world["tasks"]) * expected,
        "usable_episodes": sum(len(value) for key, value in by_task.items()
                               if key in labels),
        "excluded_episodes": dict(sorted(exclusions.items())),
        "unknown_episode_tasks": unknown_episode_tasks,
        "label_counts": dict(sorted(counts.items())),
        "flaky_band": sorted(task_id for task_id, item in labels.items()
                              if item["label"] == "boundary"),
        "suspect_tasks": sorted(task_id for task_id, item in labels.items()
                                if item["label"] == "suspect"),
        "complete": measured == len(world["tasks"]),
        "labels": labels,
    }


def project_cost(history_path: Path, remaining: int) -> dict[str, Any] | None:
    costs = []
    for path in episode_paths(history_path):
        try:
            value = read_episode(path).get("costUsd")
        except (OSError, json.JSONDecodeError, gzip.BadGzipFile):
            continue
        if isinstance(value, (int, float)) and value >= 0:
            costs.append(float(value))
    if not costs:
        return None
    mean = sum(costs) / len(costs)
    return {
        "historical_episode_count": len(costs),
        "historical_mean_usd_per_episode": round(mean, 6),
        "remaining_episode_estimate_usd": round(mean * remaining, 2),
        "warning": "Empirical projection from older, shorter tasks; not a spend ceiling. Program envelope remains $2,000.",
    }


def markdown(report: dict[str, Any]) -> str:
    counts = report["label_counts"]
    lines = [
        "# Triage — world-v19",
        "",
        "> Difficulty labels come only from three model episodes on this exact world version. "
        "Oracle success and task metadata are never substituted for missing measurements.",
        "",
        f"- Tasks fully measured: **{report['tasks_fully_measured']}/{report['tasks']}**",
        f"- Usable episodes: **{report['usable_episodes']}/{report['episodes_required']}**",
        f"- Complete: **{'yes' if report['complete'] else 'no'}**",
        f"- Episode source: `{report['episodes_path']}`",
        f"- Tool-scope protocol: `{report['tool_scope'] or 'unrestricted'}`",
        "",
        "| Label | Tasks | Rule |",
        "|---|---:|---|",
        f"| easy | {counts.get('easy', 0)} | 3/3 pass; each run uses ≤ max(3, reference calls + 1) tools |",
        f"| medium | {counts.get('medium', 0)} | 3/3 pass, but at least one non-trivial call count |",
        f"| **boundary** | {counts.get('boundary', 0)} | mixed result (1/3 or 2/3); headline flaky band |",
        f"| hard | {counts.get('hard', 0)} | 0/3 with no assertion common to every miss |",
        f"| suspect | {counts.get('suspect', 0)} | 0/3 with a systematic shared failed assertion; audit required |",
        f"| unmeasured | {counts.get('unmeasured', 0)} | fewer than 3 usable episodes |",
        "",
    ]
    if report["excluded_episodes"]:
        lines.extend(["## Episodes excluded from grading", ""])
        for reason, count in report["excluded_episodes"].items():
            lines.append(f"- `{reason}`: {count}")
        lines.append("")
    if report["flaky_band"]:
        lines.extend(["## Flaky band", "", " ".join(f"`{task}`" for task in report["flaky_band"]), ""])
    if report["suspect_tasks"]:
        lines.extend(["## Suspect audit queue", "", " ".join(f"`{task}`" for task in report["suspect_tasks"]), ""])
    if not report["complete"]:
        remaining = report["episodes_required"] - report["usable_episodes"]
        projection = report.get("cost_projection")
        lines.extend([
            "## Gate status",
            "",
            f"**M7.2 remains open.** {remaining} usable episodes are still required. Run:",
            "",
            "```bash",
            "node sim/run-leaderboard.mjs --engines deepseek-chat --tasks all --episodes 3 \\",
            "  --world-file world/blobfish/world-v19.json --label v19-triage \\",
            "  --episode-namespace v19-triage --resume --retry-ungraded --compress-episodes \\",
            "  --tool-scope systems --max-cost-usd 1700 --max-episode-cost-usd 10",
            "python3 tools/triage_world.py --engine deepseek-chat --namespace v19-triage",
            "```",
            "",
        ])
        if projection:
            lines.extend([
                f"Empirical projection from {projection['historical_episode_count']} older episodes: "
                f"**${projection['remaining_episode_estimate_usd']:.2f}** remaining at "
                f"${projection['historical_mean_usd_per_episode']:.4f}/episode. This is not a ceiling; "
                "the approved planning envelope is $2,000.",
                "",
            ])
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--world", type=Path, default=DEFAULT_WORLD)
    parser.add_argument("--engine", default="deepseek-chat")
    parser.add_argument("--namespace", default="v19-triage")
    parser.add_argument("--episodes", type=Path)
    parser.add_argument("--expected", type=int, default=3)
    parser.add_argument("--tool-scope", choices=("all", "systems"), default="systems")
    parser.add_argument("--json-out", type=Path,
                        default=ROOT / "data" / "triage" / "world-v19.json")
    parser.add_argument("--md-out", type=Path, default=ROOT / "docs" / "TRIAGE-v19.md")
    parser.add_argument("--require-complete", action="store_true")
    args = parser.parse_args()
    if args.expected < 1:
        parser.error("--expected must be positive")
    episodes = args.episodes or (ROOT / "data" / "leaderboard" / "episodes" /
                                 args.engine / args.namespace)
    report = build_report(
        args.world.resolve(), episodes.resolve(), args.expected, args.tool_scope,
    )
    remaining = report["episodes_required"] - report["usable_episodes"]
    report["cost_projection"] = project_cost(episodes, remaining)
    args.json_out.parent.mkdir(parents=True, exist_ok=True)
    args.md_out.parent.mkdir(parents=True, exist_ok=True)
    args.json_out.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
    args.md_out.write_text(markdown(report).rstrip() + "\n")
    print(f"triage: {report['tasks_fully_measured']}/{report['tasks']} tasks; "
          f"labels={report['label_counts']}; complete={report['complete']}")
    return 2 if args.require_complete and not report["complete"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
