# Skill → task compiler

This is an evidence-backed demand census, not an automatic task import. The vendored Chinese-law skills provide procedural shapes; every scored task still needs US-practice evidence and mechanically proven answer keys.

## Provenance and scope

- Source: `CSlawyer1985/claude-for-legal-ZH@68a5e8d2fbb8` (Apache-2.0)
- Skills inspected: **175** across **14** areas; every source file is SHA-256 pinned.
- Workflow-shape candidates: **100**; admitted tasks: **0**.
- Jurisdiction boundary: no Chinese legal proposition or deadline is copied into the US benchmark. A candidate cannot advance without a US authority pack.

## Disposition by area

| Area | Skills | Candidates | Census-only |
|---|---:|---:|---:|
| `.agents` | 18 | 0 | 18 |
| `ai-governance-legal` | 10 | 7 | 3 |
| `commercial-legal` | 12 | 9 | 3 |
| `corporate-legal` | 13 | 10 | 3 |
| `criminal-legal` | 7 | 4 | 3 |
| `employment-legal` | 20 | 17 | 3 |
| `ip-legal` | 12 | 9 | 3 |
| `law-student` | 13 | 0 | 13 |
| `legal-builder-hub` | 10 | 0 | 10 |
| `legal-clinic` | 16 | 12 | 4 |
| `litigation-legal` | 19 | 16 | 3 |
| `privacy-legal` | 9 | 6 | 3 |
| `product-legal` | 7 | 4 | 3 |
| `regulatory-legal` | 9 | 6 | 3 |

## Candidate capability mix

| Type | Capability | Candidates |
|---:|---|---:|
| 1 | Extraction & determination | 7 |
| 2 | Rule application | 25 |
| 3 | Computation | 6 |
| 4 | Retrieval & review at scale | 11 |
| 5 | Grounded drafting & redlining | 17 |
| 6 | Workflow execution | 23 |
| 7 | Abstention & escalation | 4 |
| 8 | Operational robustness | 2 |
| 9 | Multi-turn & interruption | 4 |
| 10 | Long-horizon composite matters | 1 |

## Compiler contract

For each candidate the compiler preserves source provenance, extracts only explicit procedure steps, maps the shape onto existing spec-backed tools, and emits a grading template. It does not invent facts or law.

A candidate remains `not_admitted` until all six gates pass:

1. Manifest round trip proves every planted fact and distractor.
2. A reference walk passes the compiled verifier.
3. No-op behavior fails.
4. Chat/text-only behavior fails when state must change.
5. Blind writes fail required-read checks.
6. Corrupted values fail grounded assertions.

## Rebuild

```bash
python3 world/ecosystem/compile_skills.py
python3 tools/check_skill_task_compiler.py
```

Machine-readable artifacts: `data/ecosystem/skill-census.json` and `data/ecosystem/skill-task-candidates.json`.
