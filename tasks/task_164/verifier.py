"""Generated v16 verifier for task_164.

Source: explicit check_grammar embedded beside this VCode. Regenerate with
world/migrate/gen1_to_v16.py; never patch this string directly.
"""
import json

READ_TOOLS = ['documents_search_fulltext', 'documents_download']
WRITE_TOOLS = ['notes_create']

def _rows(state, table):
    return state.get(table, []) if isinstance(state, dict) else []

def _ids(rows):
    return {str(r.get("id")) for r in rows if isinstance(r, dict) and r.get("id") is not None}

def _new_rows(initial_state, final_state, table):
    before = _ids(_rows(initial_state, table))
    return [r for r in _rows(final_state, table) if str(r.get("id")) not in before]

def _norm(value):
    if value is None: return "null"
    if value is True: return "true"
    if value is False: return "false"
    text = str(value).strip().lower()
    try:
        return repr(float(text))
    except (TypeError, ValueError):
        return text

def _payload(row, field):
    value = row.get(field)
    if isinstance(value, dict): return value
    try:
        parsed = json.loads(value or "{}")
        return parsed if isinstance(parsed, dict) else {}
    except (TypeError, ValueError):
        return {}

def _payload_text(row, payload_field, field):
    return str(_payload(row, payload_field).get(field) or "")

def verify(initial_state, final_state, trace):
    results, failed = [], []
    def chk(name, passed, detail):
        results.append({"name": name, "passed": bool(passed), "details": detail})
        if not passed: failed.append(name)

    successful_steps = [s for s in trace if s.get("tool") != "_final_answer" and s.get("ok")]
    tools = [s.get("tool", "") for s in successful_steps]
    changed = initial_state != final_state
    chk("state_changed", changed, "world state changed" if changed else "NO state change")

    reads = [tool for tool in tools if tool in READ_TOOLS]
    writes = [tool for tool in tools if tool in WRITE_TOOLS]
    read_first = bool(reads) and (not writes or tools.index(reads[0]) < tools.index(writes[0]))
    chk("reads_before_writes", read_first,
        f"reads={len(reads)}, writes={len(writes)}, read_first={read_first}")
    chk("no_shortcut_direct_update", not (writes and not reads),
        "inspected data before writing" if reads else "SHORTCUT: wrote without reading")

    required_path = ['documents_search_fulltext', 'documents_download', 'notes_create', 'notes_create', 'notes_create', 'notes_create', 'notes_create', 'notes_create', 'notes_create', 'notes_create', 'notes_create', 'notes_create', 'notes_create']
    cursor = 0
    for tool in tools:
        if cursor < len(required_path) and tool == required_path[cursor]:
            cursor += 1
    chk("required_workflow_path", cursor == len(required_path),
        "completed: " + " -> ".join(required_path) if cursor == len(required_path)
        else "INCOMPLETE: missing " + " -> ".join(required_path[cursor:]))

    _required_reads = [{'tool': 'documents_download', 'id': 100138}]
    _missing_reads = []
    for _need in _required_reads:
        if not any(s.get("tool") == _need["tool"] and s.get("ok") and
                   _norm((s.get("arguments") or {}).get("id")) == _norm(_need["id"])
                   for s in successful_steps):
            _missing_reads.append(_need)
    chk("required_documents_read", not _missing_reads,
        "all required documents downloaded in full" if not _missing_reads
        else "EVIDENCE GAP: " + str(_missing_reads))

    _new_0 = _new_rows(initial_state, final_state, 'pm_notes')
    chk('rows_inserted_into_pm_notes', len(_new_0) >= 11,
        f"pm_notes: {len(_new_0)} new row(s), need >= 11")
    _effect_rows_0 = _new_rows(initial_state, final_state, 'pm_notes')
    _effect_match_0 = [r for r in _effect_rows_0 if _norm(r.get('matter_id')) == _norm(100000) and _norm(r.get('subject')) == _norm('litigation_cases_evidence_records') and _norm(_payload(r, 'detail').get('litigation_cases_id')) == _norm('litigation_cases_001') and _norm(_payload(r, 'detail').get('evidence_type')) == _norm('minimum_commitment')]
    chk('effect_0_direct_matter_id', len(_effect_match_0) > 0,
        'expected one new pm_notes row matching all direct pins, including matter_id=100000' if _effect_match_0
        else 'no new pm_notes row matched the declared direct pins')
    chk('effect_0_direct_subject', len(_effect_match_0) > 0,
        'expected one new pm_notes row matching all direct pins, including subject=litigation_cases_evidence_records' if _effect_match_0
        else 'no new pm_notes row matched the declared direct pins')
    chk('effect_0_payload_litigation_cases_id', len(_effect_match_0) > 0,
        'expected one new pm_notes payload matching all pins, including litigation_cases_id=litigation_cases_001' if _effect_match_0
        else 'no new pm_notes payload matched the declared pins')
    chk('effect_0_payload_evidence_type', len(_effect_match_0) > 0,
        'expected one new pm_notes payload matching all pins, including evidence_type=minimum_commitment' if _effect_match_0
        else 'no new pm_notes payload matched the declared pins')
    _effect_rows_1 = _new_rows(initial_state, final_state, 'pm_notes')
    _effect_match_1 = [r for r in _effect_rows_1 if _norm(r.get('matter_id')) == _norm(100000) and _norm(r.get('subject')) == _norm('litigation_cases_evidence_records') and _norm(_payload(r, 'detail').get('litigation_cases_id')) == _norm('litigation_cases_001') and _norm(_payload(r, 'detail').get('evidence_type')) == _norm('volume_restriction')]
    chk('effect_1_direct_matter_id', len(_effect_match_1) > 0,
        'expected one new pm_notes row matching all direct pins, including matter_id=100000' if _effect_match_1
        else 'no new pm_notes row matched the declared direct pins')
    chk('effect_1_direct_subject', len(_effect_match_1) > 0,
        'expected one new pm_notes row matching all direct pins, including subject=litigation_cases_evidence_records' if _effect_match_1
        else 'no new pm_notes row matched the declared direct pins')
    chk('effect_1_payload_litigation_cases_id', len(_effect_match_1) > 0,
        'expected one new pm_notes payload matching all pins, including litigation_cases_id=litigation_cases_001' if _effect_match_1
        else 'no new pm_notes payload matched the declared pins')
    chk('effect_1_payload_evidence_type', len(_effect_match_1) > 0,
        'expected one new pm_notes payload matching all pins, including evidence_type=volume_restriction' if _effect_match_1
        else 'no new pm_notes payload matched the declared pins')
    _effect_rows_2 = _new_rows(initial_state, final_state, 'pm_notes')
    _effect_match_2 = [r for r in _effect_rows_2 if _norm(r.get('matter_id')) == _norm(100000) and _norm(r.get('subject')) == _norm('litigation_cases_evidence_records') and _norm(_payload(r, 'detail').get('litigation_cases_id')) == _norm('litigation_cases_001') and _norm(_payload(r, 'detail').get('evidence_type')) == _norm('price_restrictions')]
    chk('effect_2_direct_matter_id', len(_effect_match_2) > 0,
        'expected one new pm_notes row matching all direct pins, including matter_id=100000' if _effect_match_2
        else 'no new pm_notes row matched the declared direct pins')
    chk('effect_2_direct_subject', len(_effect_match_2) > 0,
        'expected one new pm_notes row matching all direct pins, including subject=litigation_cases_evidence_records' if _effect_match_2
        else 'no new pm_notes row matched the declared direct pins')
    chk('effect_2_payload_litigation_cases_id', len(_effect_match_2) > 0,
        'expected one new pm_notes payload matching all pins, including litigation_cases_id=litigation_cases_001' if _effect_match_2
        else 'no new pm_notes payload matched the declared pins')
    chk('effect_2_payload_evidence_type', len(_effect_match_2) > 0,
        'expected one new pm_notes payload matching all pins, including evidence_type=price_restrictions' if _effect_match_2
        else 'no new pm_notes payload matched the declared pins')
    _effect_rows_3 = _new_rows(initial_state, final_state, 'pm_notes')
    _effect_match_3 = [r for r in _effect_rows_3 if _norm(r.get('matter_id')) == _norm(100000) and _norm(r.get('subject')) == _norm('litigation_cases_evidence_records') and _norm(_payload(r, 'detail').get('litigation_cases_id')) == _norm('litigation_cases_001') and _norm(_payload(r, 'detail').get('evidence_type')) == _norm('non_compete')]
    chk('effect_3_direct_matter_id', len(_effect_match_3) > 0,
        'expected one new pm_notes row matching all direct pins, including matter_id=100000' if _effect_match_3
        else 'no new pm_notes row matched the declared direct pins')
    chk('effect_3_direct_subject', len(_effect_match_3) > 0,
        'expected one new pm_notes row matching all direct pins, including subject=litigation_cases_evidence_records' if _effect_match_3
        else 'no new pm_notes row matched the declared direct pins')
    chk('effect_3_payload_litigation_cases_id', len(_effect_match_3) > 0,
        'expected one new pm_notes payload matching all pins, including litigation_cases_id=litigation_cases_001' if _effect_match_3
        else 'no new pm_notes payload matched the declared pins')
    chk('effect_3_payload_evidence_type', len(_effect_match_3) > 0,
        'expected one new pm_notes payload matching all pins, including evidence_type=non_compete' if _effect_match_3
        else 'no new pm_notes payload matched the declared pins')
    _effect_rows_4 = _new_rows(initial_state, final_state, 'pm_notes')
    _effect_match_4 = [r for r in _effect_rows_4 if _norm(r.get('matter_id')) == _norm(100000) and _norm(r.get('subject')) == _norm('litigation_cases_evidence_records') and _norm(_payload(r, 'detail').get('litigation_cases_id')) == _norm('litigation_cases_001') and _norm(_payload(r, 'detail').get('evidence_type')) == _norm('no_solicit_of_customers')]
    chk('effect_4_direct_matter_id', len(_effect_match_4) > 0,
        'expected one new pm_notes row matching all direct pins, including matter_id=100000' if _effect_match_4
        else 'no new pm_notes row matched the declared direct pins')
    chk('effect_4_direct_subject', len(_effect_match_4) > 0,
        'expected one new pm_notes row matching all direct pins, including subject=litigation_cases_evidence_records' if _effect_match_4
        else 'no new pm_notes row matched the declared direct pins')
    chk('effect_4_payload_litigation_cases_id', len(_effect_match_4) > 0,
        'expected one new pm_notes payload matching all pins, including litigation_cases_id=litigation_cases_001' if _effect_match_4
        else 'no new pm_notes payload matched the declared pins')
    chk('effect_4_payload_evidence_type', len(_effect_match_4) > 0,
        'expected one new pm_notes payload matching all pins, including evidence_type=no_solicit_of_customers' if _effect_match_4
        else 'no new pm_notes payload matched the declared pins')
    _effect_rows_5 = _new_rows(initial_state, final_state, 'pm_notes')
    _effect_match_5 = [r for r in _effect_rows_5 if _norm(r.get('matter_id')) == _norm(100000) and _norm(r.get('subject')) == _norm('litigation_cases_evidence_records') and _norm(_payload(r, 'detail').get('litigation_cases_id')) == _norm('litigation_cases_001') and _norm(_payload(r, 'detail').get('evidence_type')) == _norm('rofr_rofo_rofn')]
    chk('effect_5_direct_matter_id', len(_effect_match_5) > 0,
        'expected one new pm_notes row matching all direct pins, including matter_id=100000' if _effect_match_5
        else 'no new pm_notes row matched the declared direct pins')
    chk('effect_5_direct_subject', len(_effect_match_5) > 0,
        'expected one new pm_notes row matching all direct pins, including subject=litigation_cases_evidence_records' if _effect_match_5
        else 'no new pm_notes row matched the declared direct pins')
    chk('effect_5_payload_litigation_cases_id', len(_effect_match_5) > 0,
        'expected one new pm_notes payload matching all pins, including litigation_cases_id=litigation_cases_001' if _effect_match_5
        else 'no new pm_notes payload matched the declared pins')
    chk('effect_5_payload_evidence_type', len(_effect_match_5) > 0,
        'expected one new pm_notes payload matching all pins, including evidence_type=rofr_rofo_rofn' if _effect_match_5
        else 'no new pm_notes payload matched the declared pins')
    _effect_rows_6 = _new_rows(initial_state, final_state, 'pm_notes')
    _effect_match_6 = [r for r in _effect_rows_6 if _norm(r.get('matter_id')) == _norm(100000) and _norm(r.get('subject')) == _norm('litigation_cases_evidence_records') and _norm(_payload(r, 'detail').get('litigation_cases_id')) == _norm('litigation_cases_001') and _norm(_payload(r, 'detail').get('evidence_type')) == _norm('change_of_control')]
    chk('effect_6_direct_matter_id', len(_effect_match_6) > 0,
        'expected one new pm_notes row matching all direct pins, including matter_id=100000' if _effect_match_6
        else 'no new pm_notes row matched the declared direct pins')
    chk('effect_6_direct_subject', len(_effect_match_6) > 0,
        'expected one new pm_notes row matching all direct pins, including subject=litigation_cases_evidence_records' if _effect_match_6
        else 'no new pm_notes row matched the declared direct pins')
    chk('effect_6_payload_litigation_cases_id', len(_effect_match_6) > 0,
        'expected one new pm_notes payload matching all pins, including litigation_cases_id=litigation_cases_001' if _effect_match_6
        else 'no new pm_notes payload matched the declared pins')
    chk('effect_6_payload_evidence_type', len(_effect_match_6) > 0,
        'expected one new pm_notes payload matching all pins, including evidence_type=change_of_control' if _effect_match_6
        else 'no new pm_notes payload matched the declared pins')
    _effect_rows_7 = _new_rows(initial_state, final_state, 'pm_notes')
    _effect_match_7 = [r for r in _effect_rows_7 if _norm(r.get('matter_id')) == _norm(100000) and _norm(r.get('subject')) == _norm('litigation_cases_evidence_records') and _norm(_payload(r, 'detail').get('litigation_cases_id')) == _norm('litigation_cases_001') and _norm(_payload(r, 'detail').get('evidence_type')) == _norm('liquidated_damages')]
    chk('effect_7_direct_matter_id', len(_effect_match_7) > 0,
        'expected one new pm_notes row matching all direct pins, including matter_id=100000' if _effect_match_7
        else 'no new pm_notes row matched the declared direct pins')
    chk('effect_7_direct_subject', len(_effect_match_7) > 0,
        'expected one new pm_notes row matching all direct pins, including subject=litigation_cases_evidence_records' if _effect_match_7
        else 'no new pm_notes row matched the declared direct pins')
    chk('effect_7_payload_litigation_cases_id', len(_effect_match_7) > 0,
        'expected one new pm_notes payload matching all pins, including litigation_cases_id=litigation_cases_001' if _effect_match_7
        else 'no new pm_notes payload matched the declared pins')
    chk('effect_7_payload_evidence_type', len(_effect_match_7) > 0,
        'expected one new pm_notes payload matching all pins, including evidence_type=liquidated_damages' if _effect_match_7
        else 'no new pm_notes payload matched the declared pins')
    _effect_rows_8 = _new_rows(initial_state, final_state, 'pm_notes')
    _effect_match_8 = [r for r in _effect_rows_8 if _norm(r.get('matter_id')) == _norm(100000) and _norm(r.get('subject')) == _norm('litigation_cases_evidence_records') and _norm(_payload(r, 'detail').get('litigation_cases_id')) == _norm('litigation_cases_001') and _norm(_payload(r, 'detail').get('evidence_type')) == _norm('insurance')]
    chk('effect_8_direct_matter_id', len(_effect_match_8) > 0,
        'expected one new pm_notes row matching all direct pins, including matter_id=100000' if _effect_match_8
        else 'no new pm_notes row matched the declared direct pins')
    chk('effect_8_direct_subject', len(_effect_match_8) > 0,
        'expected one new pm_notes row matching all direct pins, including subject=litigation_cases_evidence_records' if _effect_match_8
        else 'no new pm_notes row matched the declared direct pins')
    chk('effect_8_payload_litigation_cases_id', len(_effect_match_8) > 0,
        'expected one new pm_notes payload matching all pins, including litigation_cases_id=litigation_cases_001' if _effect_match_8
        else 'no new pm_notes payload matched the declared pins')
    chk('effect_8_payload_evidence_type', len(_effect_match_8) > 0,
        'expected one new pm_notes payload matching all pins, including evidence_type=insurance' if _effect_match_8
        else 'no new pm_notes payload matched the declared pins')
    _effect_rows_9 = _new_rows(initial_state, final_state, 'pm_notes')
    _effect_match_9 = [r for r in _effect_rows_9 if _norm(r.get('matter_id')) == _norm(100000) and _norm(r.get('subject')) == _norm('litigation_cases_evidence_records') and _norm(_payload(r, 'detail').get('litigation_cases_id')) == _norm('litigation_cases_001') and _norm(_payload(r, 'detail').get('evidence_type')) == _norm('third_party_beneficiary')]
    chk('effect_9_direct_matter_id', len(_effect_match_9) > 0,
        'expected one new pm_notes row matching all direct pins, including matter_id=100000' if _effect_match_9
        else 'no new pm_notes row matched the declared direct pins')
    chk('effect_9_direct_subject', len(_effect_match_9) > 0,
        'expected one new pm_notes row matching all direct pins, including subject=litigation_cases_evidence_records' if _effect_match_9
        else 'no new pm_notes row matched the declared direct pins')
    chk('effect_9_payload_litigation_cases_id', len(_effect_match_9) > 0,
        'expected one new pm_notes payload matching all pins, including litigation_cases_id=litigation_cases_001' if _effect_match_9
        else 'no new pm_notes payload matched the declared pins')
    chk('effect_9_payload_evidence_type', len(_effect_match_9) > 0,
        'expected one new pm_notes payload matching all pins, including evidence_type=third_party_beneficiary' if _effect_match_9
        else 'no new pm_notes payload matched the declared pins')
    _effect_rows_10 = _new_rows(initial_state, final_state, 'pm_notes')
    _effect_match_10 = [r for r in _effect_rows_10 if _norm(r.get('matter_id')) == _norm(100000) and _norm(r.get('subject')) == _norm('litigation_cases_evidence_records') and _norm(_payload(r, 'detail').get('litigation_cases_id')) == _norm('litigation_cases_001') and _norm(_payload(r, 'detail').get('evidence_type')) == _norm('governing_law')]
    chk('effect_10_direct_matter_id', len(_effect_match_10) > 0,
        'expected one new pm_notes row matching all direct pins, including matter_id=100000' if _effect_match_10
        else 'no new pm_notes row matched the declared direct pins')
    chk('effect_10_direct_subject', len(_effect_match_10) > 0,
        'expected one new pm_notes row matching all direct pins, including subject=litigation_cases_evidence_records' if _effect_match_10
        else 'no new pm_notes row matched the declared direct pins')
    chk('effect_10_payload_litigation_cases_id', len(_effect_match_10) > 0,
        'expected one new pm_notes payload matching all pins, including litigation_cases_id=litigation_cases_001' if _effect_match_10
        else 'no new pm_notes payload matched the declared pins')
    chk('effect_10_payload_evidence_type', len(_effect_match_10) > 0,
        'expected one new pm_notes payload matching all pins, including evidence_type=governing_law' if _effect_match_10
        else 'no new pm_notes payload matched the declared pins')

    _forbidden_0 = [r for r in _new_rows(initial_state, final_state, 'pm_notes')
                         if _norm(_payload(r, 'detail').get('subject')) == _norm('litigation_cases_evidence_records') and _norm(_payload(r, 'detail').get('evidence_type')) == _norm('audit_rights')]
    chk('forbidden_0', not _forbidden_0,
        "forbidden value absent" if not _forbidden_0
        else 'FABRICATION: new pm_notes row contains forbidden evidence_type=audit_rights')
    _forbidden_1 = [r for r in _new_rows(initial_state, final_state, 'pm_notes')
                         if _norm(_payload(r, 'detail').get('subject')) == _norm('litigation_cases_evidence_records') and _norm(_payload(r, 'detail').get('evidence_type')) == _norm('most_favored_nation')]
    chk('forbidden_1', not _forbidden_1,
        "forbidden value absent" if not _forbidden_1
        else 'FABRICATION: new pm_notes row contains forbidden evidence_type=most_favored_nation')

    allowed_tables = set(['pm_notes'])
    damaged = []
    fabricated = []
    destroyed = []
    for table in set(initial_state) | set(final_state):
        before = _rows(initial_state, table)
        after = _rows(final_state, table)
        if before != after and table not in allowed_tables:
            damaged.append(table)
        before_ids, after_ids = _ids(before), _ids(after)
        if len(after) < len(before) or before_ids - after_ids:
            destroyed.append(table)
        if table not in allowed_tables and (len(after) > len(before) or after_ids - before_ids):
            fabricated.append(table)
    chk("no_offtask_table_changes", not damaged,
        "no off-task tables changed" if not damaged else "OFF-TASK DAMAGE: " + str(sorted(damaged)))
    chk("no_rows_destroyed", not destroyed,
        "no rows destroyed" if not destroyed else "ROWS DESTROYED: " + str(sorted(destroyed)))
    chk("no_undeclared_rows_created", not fabricated,
        "all created rows declared" if not fabricated else "UNDECLARED CREATION: " + str(sorted(fabricated)))

    real_trace = [s for s in trace if s.get("tool") != "_final_answer"]
    ok_count = sum(1 for s in real_trace if s.get("ok"))
    chk("all_tools_succeeded", bool(real_trace) and ok_count * 5 >= len(real_trace) * 4,
        f"{ok_count}/{len(real_trace)} calls succeeded")

    anti = {"reads_before_writes", "no_shortcut_direct_update", "required_workflow_path", "required_documents_read"}
    guards = {"no_offtask_table_changes", "no_rows_destroyed", "no_undeclared_rows_created"}
    veto = {r["name"] for r in results if "grounded" in r["name"] or "unsupported" in r["name"]}
    advisory = {"all_tools_succeeded"}
    structural = [name for name in failed if name not in advisory]
    core = [r for r in results if r["name"] not in anti | guards | advisory | {"state_changed"}]
    core_failed = [r for r in core if not r["passed"]]
    if any(name in anti | guards | veto for name in failed):
        reward = 0.0
    elif core:
        reward = (len(core) - len(core_failed)) / len(core)
    else:
        reward = 0.0 if structural else 1.0
    return {
        "task_id": 'task_164',
        "passed": not structural,
        "reward": round(reward, 4),
        "explanation": "All task checks passed" if not structural else "Failed: " + ", ".join(structural),
        "failed_conditions": structural,
        "advisory_conditions": [name for name in failed if name in advisory],
        "assertions": results,
    }
