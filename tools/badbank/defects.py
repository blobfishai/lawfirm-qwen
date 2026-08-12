"""M0.2 badbank — six deliberately defective tasks the admission gates must
reject on every run. This is the test suite FOR the gates: if a gate change
lets any of these through, the gate is broken, not the task.

Each defect models a real historical failure class:

  bad_001 wrong_key      verifier pins a value the reference walk never writes
                         (defect-8 class)                 -> oracle must FAIL
  bad_002 unsolvable     walk references a tool that does not exist
                                                          -> oracle must FAIL
  bad_003 missing_guard  verifier passes unconditionally (no guard at all)
                                                          -> discrimination: noop leaks
  bad_004 text_only_ok   verifier only checks that a read happened
                         (deliverable-in-chat blindness)  -> discrimination: text_only leaks
  bad_005 blind_write_ok verifier only counts rows, no reads-before-writes
                         (Bug-13 class)                   -> discrimination: blind_write leaks
  bad_006 drift          prompt names record id 9, verifier pins id 1
                         (task_016's defect) — invisible to oracle AND
                         discrimination                   -> drift LINT must flag

Note: the plan's original sixth defect (distractor colliding with the answer
value) requires the M4.2 round-trip gate to detect; it moves to
world/manifest mutation tests when M4.2 lands. bad_005 substitutes.
"""

def _vcode(task_id: str, body: str) -> str:
    return (
        "def verify(initial_state, final_state, trace):\n"
        f"    task_id = {task_id!r}\n"
        + body
    )


DRAFT_ARGS = {"title": "Badbank memo", "doc_type": "memo",
              "body": "Badbank reference deliverable body."}


def build() -> tuple[list, list, dict]:
    """Returns (tasks, verifiers, expectations)."""
    tasks, verifiers, expect = [], [], {}

    # -- bad_001: wrong answer key -----------------------------------------
    tasks.append({
        "task_id": "bad_001",
        "prompt": 'File a memo titled "Badbank memo" to the matter record.',
        "walk": ["draft_matter_document"],
        "reference_args": [dict(DRAFT_ARGS)],
    })
    verifiers.append({"task_id": "bad_001", "assertions": ["beta_memo_exists"],
                      "vcode": _vcode("bad_001", """
    rows = final_state.get("matter_documents") or []
    hit = any((r.get("title") or "") == "Beta memo" for r in rows)
    return {"task_id": task_id, "passed": bool(hit),
            "reward": 1.0 if hit else 0.0,
            "failed_conditions": [] if hit else ["beta_memo_exists"],
            "assertions": [{"name": "beta_memo_exists", "passed": bool(hit)}]}
""")})
    expect["bad_001"] = {"gate": "oracle", "why": "pins a value the walk never writes"}

    # -- bad_002: unsolvable walk ------------------------------------------
    tasks.append({
        "task_id": "bad_002",
        "prompt": "Run the nightly badbank reconciliation.",
        "walk": ["badbank_tool_that_does_not_exist"],
        "reference_args": [{}],
    })
    verifiers.append({"task_id": "bad_002", "assertions": ["memo_exists"],
                      "vcode": _vcode("bad_002", """
    rows = final_state.get("matter_documents") or []
    base = initial_state.get("matter_documents") or []
    hit = len(rows) > len(base)
    return {"task_id": task_id, "passed": bool(hit),
            "reward": 1.0 if hit else 0.0,
            "failed_conditions": [] if hit else ["memo_exists"],
            "assertions": [{"name": "memo_exists", "passed": bool(hit)}]}
""")})
    expect["bad_002"] = {"gate": "oracle", "why": "walk tool does not exist"}

    # -- bad_003: no guard at all (passes everything) -----------------------
    tasks.append({
        "task_id": "bad_003",
        "prompt": 'File a memo titled "Badbank memo" to the matter record.',
        "walk": ["read_matter_document", "draft_matter_document"],
        "reference_args": [{"id": 1}, dict(DRAFT_ARGS)],
    })
    verifiers.append({"task_id": "bad_003", "assertions": [],
                      "vcode": _vcode("bad_003", """
    return {"task_id": task_id, "passed": True, "reward": 1.0,
            "failed_conditions": [], "assertions": []}
""")})
    expect["bad_003"] = {"gate": "discrimination", "mode": "noop",
                         "why": "verifier passes unconditionally"}

    # -- bad_004: text-only passes ------------------------------------------
    tasks.append({
        "task_id": "bad_004",
        "prompt": 'Read the deal file, then file a memo titled "Badbank memo".',
        "walk": ["read_matter_document", "draft_matter_document"],
        "reference_args": [{"id": 1}, dict(DRAFT_ARGS)],
    })
    verifiers.append({"task_id": "bad_004", "assertions": ["deal_file_read"],
                      "vcode": _vcode("bad_004", """
    hit = any(e.get("tool") == "read_matter_document" and e.get("ok")
              for e in (trace or []))
    return {"task_id": task_id, "passed": bool(hit),
            "reward": 1.0 if hit else 0.0,
            "failed_conditions": [] if hit else ["deal_file_read"],
            "assertions": [{"name": "deal_file_read", "passed": bool(hit)}]}
""")})
    expect["bad_004"] = {"gate": "discrimination", "mode": "text_only",
                         "why": "verifier never checks the write"}

    # -- bad_005: blind write passes (Bug-13 class) --------------------------
    tasks.append({
        "task_id": "bad_005",
        "prompt": 'Read the deal file, then file a memo titled "Badbank memo".',
        "walk": ["read_matter_document", "draft_matter_document"],
        "reference_args": [{"id": 1}, dict(DRAFT_ARGS)],
    })
    verifiers.append({"task_id": "bad_005", "assertions": ["rows_inserted"],
                      "vcode": _vcode("bad_005", """
    rows = final_state.get("matter_documents") or []
    base = initial_state.get("matter_documents") or []
    hit = len(rows) > len(base)
    return {"task_id": task_id, "passed": bool(hit),
            "reward": 1.0 if hit else 0.0,
            "failed_conditions": [] if hit else ["rows_inserted"],
            "assertions": [{"name": "rows_inserted", "passed": bool(hit)}]}
""")})
    expect["bad_005"] = {"gate": "discrimination", "mode": "blind_write",
                         "why": "row count only; reads not required"}

    # -- bad_006: prompt/verifier drift (task_016's defect) ------------------
    tasks.append({
        "task_id": "bad_006",
        "prompt": ('Update the flagged record "matter_documents_9" by filing a '
                   'memo titled "Badbank memo" against it.'),
        "walk": ["read_matter_document", "draft_matter_document"],
        "reference_args": [{"id": 1}, dict(DRAFT_ARGS)],
    })
    verifiers.append({"task_id": "bad_006",
                      "assertions": ["matter_documents_1_title_is_badbank"],
                      "vcode": _vcode("bad_006", """
    rows = final_state.get("matter_documents") or []
    hit = any((r.get("title") or "") == "Badbank memo" for r in rows)
    return {"task_id": task_id, "passed": bool(hit),
            "reward": 1.0 if hit else 0.0,
            "failed_conditions": [] if hit else ["matter_documents_1_title_is_badbank"],
            "assertions": [{"name": "matter_documents_1_title_is_badbank",
                            "passed": bool(hit)}]}
""")})
    expect["bad_006"] = {"gate": "lint", "why": "prompt names id 9, verifier pins id 1"}

    return tasks, verifiers, expect
