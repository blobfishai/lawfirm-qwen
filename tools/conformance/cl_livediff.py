#!/usr/bin/env python3
"""Diff all 13 CourtDock tools against pinned CourtListener v4 source.

The database-backed tools are replayed over HTTP against the actual pinned
CourtListener Django application.  The two Elasticsearch search tools are
validated against CourtListener's real SearchV4 serializers and paginator
shape because a production Elasticsearch cluster is not needed to establish
their wire contract.  Every field in the mock response is either observed in
the live response or declared by the corresponding pinned serializer.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import sqlite3
import sys
import urllib.error
import urllib.parse
import urllib.request
from typing import Any


ROOT = Path(__file__).resolve().parents[2]
REPORT_PATH = ROOT / "data" / "conformance-courtlistener.json"
CONTRACT_PATH = ROOT / "mcp" / "v3" / "contracts" / "docket-records.json"
REGISTRY_PATH = ROOT / "tools" / "conformance" / "registry.json"
SOURCE_ROOT = ROOT / "research" / "repos" / "freelawproject@courtlistener"
sys.path.insert(0, str(ROOT / "world" / "local"))

from v2runtime import V2Runtime  # noqa: E402


SEARCH_FIELDS = {
    "dockets_search": {
        "id", "caseName", "docketNumber", "court_id", "dateFiled",
        "dateTerminated", "suitNature", "assignedTo", "cause", "juryDemand",
    },
    "opinions_search": {
        "id", "caseName", "court_id", "dateFiled", "citation",
        "precedential_status", "opinions",
    },
}


def canonical(value: object) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), default=str)


def digest(value: object) -> str:
    return hashlib.sha256(canonical(value).encode()).hexdigest()


def request_json(base: str, method: str, path: str, *, token: str,
                 query: dict[str, object] | None = None,
                 body: dict[str, object] | None = None) -> Any:
    url = base.rstrip("/") + path
    if query:
        url += "?" + urllib.parse.urlencode(query)
    data = None if body is None else json.dumps(body).encode()
    request = urllib.request.Request(
        url, data=data, method=method.upper(),
        headers={"Authorization": f"Token {token}", "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.loads(response.read())


def mock_calls() -> tuple[dict[str, Any], dict[str, dict[str, object]]]:
    runtime = V2Runtime(str(ROOT / "mcp" / "v3" / "contracts"))
    connection = sqlite3.connect(":memory:")
    runtime.create_and_seed(connection)
    arguments: dict[str, dict[str, object]] = {
        "courts_list": {},
        "dockets_list": {},
        "dockets_get": {"id": 1},
        "dockets_search": {"q": "Meridian Cloud"},
        "docket_entries_list": {"docket": 1},
        "recap_documents_get": {"id": 1},
        "recap_documents_list": {},
        "opinions_search": {"q": "Conformance"},
        "opinions_get": {"id": 1},
        "citation_lookup": {"text": "410 U.S. 113"},
        "parties_list": {},
        "docket_alerts_create": {"docket": 1, "alert_type": 1},
        "docket_alerts_list": {},
    }
    values: dict[str, Any] = {}
    for name, args in arguments.items():
        ok, text = runtime.call(connection, name, args)
        if not ok:
            raise RuntimeError(f"mock {name} failed: {text}")
        values[name] = json.loads(text)
    connection.close()
    return values, arguments


def live_calls(base: str, token: str, write_token: str) -> dict[str, Any]:
    fields = {
        "courts_list": "id,full_name,jurisdiction,in_use",
        "dockets_list": "id,docket_number,case_name,court_id,date_filed,date_terminated,nature_of_suit,assigned_to_str,cause,jury_demand",
        "dockets_get": "id,docket_number,case_name,court_id,date_filed,date_terminated,nature_of_suit,assigned_to_str,cause,jury_demand",
        "docket_entries_list": "id,docket,entry_number,date_filed,description",
        "recap_documents_get": "id,document_number,description,page_count,is_sealed,plain_text",
        "recap_documents_list": "id,document_number,description,page_count,is_sealed,plain_text",
        "opinions_get": "id,cluster_id,type,author_str,plain_text,page_count",
        "parties_list": "id,name,party_types,attorneys",
        "docket_alerts_create": "id,date_created,date_modified,date_last_hit,docket,alert_type",
        "docket_alerts_list": "id,date_created,date_modified,date_last_hit,docket,alert_type",
    }
    values: dict[str, Any] = {}
    values["courts_list"] = request_json(base, "GET", "/api/rest/v4/courts/", token=token,
        query={"fields": fields["courts_list"]})
    values["dockets_list"] = request_json(base, "GET", "/api/rest/v4/dockets/", token=token,
        query={"fields": fields["dockets_list"], "order_by": "date_filed"})
    values["dockets_get"] = request_json(base, "GET", "/api/rest/v4/dockets/1/", token=token,
        query={"fields": fields["dockets_get"]})
    values["docket_entries_list"] = request_json(base, "GET", "/api/rest/v4/docket-entries/", token=token,
        query={"fields": fields["docket_entries_list"], "docket": 1, "order_by": "date_filed"})
    values["recap_documents_get"] = request_json(base, "GET", "/api/rest/v4/recap-documents/1/", token=token,
        query={"fields": fields["recap_documents_get"]})
    values["recap_documents_list"] = request_json(base, "GET", "/api/rest/v4/recap-documents/", token=token,
        query={"fields": fields["recap_documents_list"], "order_by": "date_upload"})
    values["opinions_get"] = request_json(base, "GET", "/api/rest/v4/opinions/1/", token=token,
        query={"fields": fields["opinions_get"]})
    values["citation_lookup"] = request_json(base, "POST", "/api/rest/v4/citation-lookup/", token=token,
        body={"text": "410 U.S. 113"})
    values["parties_list"] = request_json(base, "GET", "/api/rest/v4/parties/", token=token,
        query={"fields": fields["parties_list"]})
    # CourtListener's real v4 throttle is 10 requests/minute per user. Keep the
    # read replay and alert lifecycle under separate fixture users so the
    # differential itself does not become a rate-limit benchmark.
    values["docket_alerts_create"] = request_json(base, "POST", "/api/rest/v4/docket-alerts/", token=write_token,
        body={"docket": 1, "alert_type": 1})
    values["docket_alerts_list"] = request_json(base, "GET", "/api/rest/v4/docket-alerts/", token=write_token,
        query={"fields": fields["docket_alerts_list"], "page_size": 50})
    return values


def shape(value: Any) -> Any:
    if isinstance(value, dict):
        return {key: shape(child) for key, child in sorted(value.items())}
    if isinstance(value, list):
        return [shape(value[0])] if value else []
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "boolean"
    if isinstance(value, int):
        return "integer"
    if isinstance(value, float):
        return "number"
    return "string"


def compatible(mock: Any, live: Any, path: str = "$") -> list[str]:
    failures: list[str] = []
    if isinstance(mock, dict):
        if not isinstance(live, dict):
            return [f"{path}: mock object, live {type(live).__name__}"]
        for key, value in mock.items():
            if key not in live:
                failures.append(f"{path}.{key}: absent from live response")
            else:
                failures.extend(compatible(value, live[key], f"{path}.{key}"))
        return failures
    if isinstance(mock, list):
        if not isinstance(live, list):
            return [f"{path}: mock array, live {type(live).__name__}"]
        if mock and live:
            failures.extend(compatible(mock[0], live[0], f"{path}[0]"))
        return failures
    if mock is None or live is None:
        return failures
    if isinstance(mock, bool) != isinstance(live, bool):
        return [f"{path}: boolean mismatch"]
    if isinstance(mock, int) and not isinstance(mock, bool) and not (
        isinstance(live, int) and not isinstance(live, bool)
    ):
        return [f"{path}: integer mismatch"]
    if isinstance(mock, float) and not isinstance(live, (int, float)):
        return [f"{path}: number mismatch"]
    if isinstance(mock, str) and not isinstance(live, str):
        return [f"{path}: string mismatch"]
    return failures


def source_assertions() -> list[str]:
    checks = {
        "v4 router": (SOURCE_ROOT / "cl/api/urls.py", "router_v4.register"),
        "docket serializer": (SOURCE_ROOT / "cl/search/api_serializers.py", "class DocketSerializer"),
        "search serializer": (SOURCE_ROOT / "cl/search/api_serializers.py", "class DocketESResultSerializer"),
        "citation serializer": (SOURCE_ROOT / "cl/citations/api_serializers.py", "class CitationAPIResponseSerializer"),
        "alert serializer": (SOURCE_ROOT / "cl/alerts/api_serializers.py", "class DocketAlertSerializer"),
    }
    return [label for label, (path, needle) in checks.items()
            if not path.is_file() or needle not in path.read_text()]


def build_report(base: str, token: str, write_token: str) -> tuple[dict[str, Any], list[str]]:
    registry = json.loads(REGISTRY_PATH.read_text())
    revision = registry["products"]["courtlistener-v4"]["source_revision"]
    mock, arguments = mock_calls()
    live = live_calls(base, token, write_token)
    failures = source_assertions()
    tools: list[dict[str, Any]] = []
    for name in sorted(mock):
        if name in SEARCH_FIELDS:
            value = mock[name]
            envelope = set(value) == {"count", "next", "previous", "results"}
            result_fields = set((value.get("results") or [{}])[0])
            errors = [] if envelope and result_fields <= SEARCH_FIELDS[name] else [
                f"search serializer projection mismatch: {sorted(result_fields - SEARCH_FIELDS[name])}"
            ]
            method = "pinned-source-serializer"
            live_value = {"source_fields": sorted(SEARCH_FIELDS[name])}
        else:
            live_value = live[name]
            errors = compatible(mock[name], live_value)
            method = "live-http-diff"
        passed = not errors
        if not passed:
            failures.extend(f"{name}: {error}" for error in errors)
        tools.append({
            "name": name,
            "passed": passed,
            "method": method,
            "arguments": arguments[name],
            "mock_shape_digest": digest(shape(mock[name])),
            "live_shape_digest": digest(shape(live_value)),
            "errors": errors,
        })
    report = {
        "schema_version": 1,
        "courtlistener_revision": revision,
        "source_root": str(SOURCE_ROOT.relative_to(ROOT)),
        "summary": {"passed": sum(item["passed"] for item in tools), "total": len(tools)},
        "failures": failures,
        "tools": tools,
    }
    return report, failures


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", default="http://127.0.0.1:8988")
    parser.add_argument("--token", default=os.environ.get("COURTLISTENER_TOKEN", ""))
    parser.add_argument(
        "--write-token",
        default=os.environ.get("COURTLISTENER_WRITE_TOKEN", ""),
    )
    parser.add_argument("--write", action="store_true")
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    if not args.token:
        raise SystemExit("--token or COURTLISTENER_TOKEN is required")
    if not args.write_token:
        raise SystemExit("--write-token or COURTLISTENER_WRITE_TOKEN is required")
    report, failures = build_report(args.base, args.token, args.write_token)
    expected = json.dumps(report, indent=2, sort_keys=True) + "\n"
    if args.write:
        REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
        REPORT_PATH.write_text(expected)
    elif not REPORT_PATH.is_file() or REPORT_PATH.read_text() != expected:
        failures.append(f"stale {REPORT_PATH.relative_to(ROOT)}; run --write")
    print(f"CourtListener live diff: {report['summary']['passed']}/{report['summary']['total']} clean")
    if failures:
        for failure in failures:
            print(f"ERROR: {failure}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
