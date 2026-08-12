#!/usr/bin/env python3
"""Gate the LAB file-lane staging and lane-split artifact contract."""
from __future__ import annotations

import importlib.util
import json
import os
import subprocess
import tempfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
GENERATOR_PATH = ROOT / "harbor" / "generate.py"
def load_generator():
    spec = importlib.util.spec_from_file_location("harbor_generate", GENERATOR_PATH)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def main() -> int:
    generator = load_generator()
    commit = json.loads((ROOT / "research" / "repos-commits.json").read_text())["harveyai@harvey-labs"]
    live_checked = False
    with tempfile.TemporaryDirectory(prefix="harbor-file-lane-") as temporary:
        base = Path(temporary)
        documents_source = base / "source-documents"
        skills_source = base / "source-skills"
        documents_source.mkdir()
        for index in range(9):
            (documents_source / f"evidence-{index + 1}.txt").write_text(f"Evidence {index + 1}\n")
        for name in ("docx", "xlsx", "pptx"):
            skill = skills_source / name
            skill.mkdir(parents=True)
            (skill / "SKILL.md").write_text(f"# {name}\n")
        source_instruction = "Review the evidence and output `antitrust-risk-memo.docx`."
        task = {
            "task_id": "lab_file_lane_gate",
            "prompt": source_instruction,
            "file_lane": {
                "source_task": "antitrust-competition/analyze-antitrust-hsr-strategy",
                "source_commit": commit,
                "documents_source": str(documents_source),
                "skills_source": str(skills_source),
                "deliverables": ["antitrust-risk-memo.docx"],
                "skills": ["docx", "xlsx", "pptx"],
            },
        }
        task_dir = base / "task"
        generator.stage_file_lane(task, str(task_dir))
        documents = sorted(path for path in (task_dir / "environment" / "documents").rglob("*") if path.is_file())
        assert len(documents) == 9, len(documents)
        assert all((task_dir / "environment" / "skills" / name / "SKILL.md").is_file()
                   for name in ("docx", "xlsx", "pptx"))

        instruction = generator.instruction_md(task)
        assert source_instruction in instruction
        assert "/workspace/documents" in instruction
        assert "/workspace/output/antitrust-risk-memo.docx" in instruction
        compose = generator.compose_yaml(task["task_id"], "world:v17", True)
        assert "source: ./documents" in compose and "read_only: true" in compose
        dockerfile = generator.lab_agent_dockerfile("lab-agent:v17")
        assert dockerfile.startswith("# File-lane") and "FROM lab-agent:v17" in dockerfile

        output = base / "output"
        logs = base / "logs"
        output.mkdir()
        (output / "antitrust-risk-memo.docx").write_bytes(b"fixture deliverable")
        script = base / "test.sh"
        script.write_text(generator.test_sh(task))
        script.chmod(0o755)
        environment = {
            **os.environ,
            "WORKSPACE_OUTPUT": str(output),
            "HARBOR_LOGS": str(logs),
            "WORLD_VERIFY_URL": "http://127.0.0.1:1/verify",
        }
        subprocess.run(["bash", str(script)], env=environment, check=True,
                       capture_output=True, text=True)
        lane = json.loads((logs / "verifier" / "file-lane.json").read_text())
        reward = json.loads((logs / "verifier" / "reward.json").read_text())
        assert lane["file_passed"] is True
        assert lane["grade_kind"] == "output_contract_only"
        assert lane["state_passed"] is False
        assert lane["lane_split"] is True
        assert reward["reward"] == 0.0  # lanes are diagnosed, never averaged
        assert (logs / "artifacts" / "antitrust-risk-memo.docx").read_bytes() == b"fixture deliverable"

        # A symlink with the expected filename is not a deliverable and cannot
        # be used to smuggle an input/system file into the artifact lane.
        (output / "antitrust-risk-memo.docx").unlink()
        (output / "outside.docx").write_bytes(b"outside")
        (output / "antitrust-risk-memo.docx").symlink_to(output / "outside.docx")
        subprocess.run(["bash", str(script)], env=environment, check=True,
                       capture_output=True, text=True)
        symlink_lane = json.loads((logs / "verifier" / "file-lane.json").read_text())
        assert symlink_lane["file_passed"] is False
        assert any(row["reason"] == "symlink" for row in symlink_lane["rejected_artifacts"])

        unsafe = {**task, "task_id": "unsafe", "file_lane": {
            **task["file_lane"], "deliverables": ["../escape.docx"]}}
        try:
            generator.test_sh(unsafe)
            raise AssertionError("unsafe output path was accepted")
        except RuntimeError as error:
            assert "unsafe deliverable path" in str(error)

        live_task = (ROOT / "research" / "repos" / "harveyai@harvey-labs" / "tasks" /
                     "antitrust-competition" / "analyze-antitrust-hsr-strategy")
        if (live_task / "task.json").is_file():
            live_source = json.loads((live_task / "task.json").read_text())
            live = {
                "task_id": "lab_file_lane_live_gate",
                "prompt": live_source["instructions"],
                "file_lane": {
                    "source_task": "antitrust-competition/analyze-antitrust-hsr-strategy",
                    "source_commit": commit,
                    "documents_source": str(live_task / "documents"),
                    "deliverables": list(live_source["deliverables"]),
                    "skills": ["docx", "xlsx", "pptx"],
                },
            }
            live_dir = base / "live-task"
            generator.stage_file_lane(live, str(live_dir))
            live_documents = [path for path in (live_dir / "environment" / "documents").rglob("*")
                              if path.is_file()]
            assert len(live_documents) == 9
            live_checked = True

    print("Harbor file lane: 9 source docs staged read-only, LAB skills present, "
          f"artifact/state lanes stay separate (live_source={str(live_checked).lower()})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
