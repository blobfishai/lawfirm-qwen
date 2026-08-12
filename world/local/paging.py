"""Vendor-neutral paging-discipline diagnostics derived from a tool trace."""
from __future__ import annotations

import json
from typing import Any
from urllib.parse import parse_qs, urlparse


def _object(observation: Any) -> dict[str, Any] | None:
    if isinstance(observation, dict):
        return observation
    try:
        value = json.loads(str(observation or ""))
        return value if isinstance(value, dict) else None
    except (TypeError, json.JSONDecodeError):
        return None


def _requirement(value: dict[str, Any]) -> tuple[str, Any] | None:
    paging = ((value.get("meta") or {}).get("paging") or {}) if isinstance(value.get("meta"), dict) else {}
    if paging.get("next"):
        token = parse_qs(urlparse(str(paging["next"])).query).get("page_token", [None])[0]
        return ("page_token", token) if token else None
    if value.get("next"):
        page = parse_qs(urlparse(str(value["next"])).query).get("page", [None])[0]
        if page:
            try:
                return "page", int(page)
            except ValueError:
                return None
    if value.get("nextPageToken"):
        return "pageToken", value["nextPageToken"]
    if value.get("NextStartIndex") is not None:
        return "start", value["NextStartIndex"]
    data = value.get("data")
    if isinstance(data, dict) and data.get("next_offset") is not None:
        return "offset", data["next_offset"]
    if value.get("has_more") and value.get("next_offset") is not None:
        return "offset", value["next_offset"]
    return None


def paging_diagnostic(trace: list[dict[str, Any]]) -> dict[str, Any]:
    successful = [step for step in trace if step.get("ok") and step.get("tool") != "_final_answer"]
    requirements: list[dict[str, Any]] = []
    pages_seen = 0
    for index, step in enumerate(successful):
        value = _object(step.get("observation"))
        if value is None:
            continue
        requirement = _requirement(value)
        paged_shape = requirement is not None or any(
            key in value for key in ("next", "nextPageToken", "NextStartIndex", "has_more")
        ) or (isinstance(value.get("meta"), dict) and "paging" in value["meta"])
        if paged_shape:
            pages_seen += 1
        if requirement is None:
            continue
        field, expected = requirement
        followed = any(
            later.get("tool") == step.get("tool")
            and str((later.get("arguments") or {}).get(field)) == str(expected)
            for later in successful[index + 1:]
        )
        requirements.append(
            {"tool": step.get("tool"), "field": field, "expected": expected, "followed": followed}
        )
    missing = [{key: value for key, value in item.items() if key != "followed"}
               for item in requirements if not item["followed"]]
    return {
        "paging_complete": not missing,
        "pages_seen": pages_seen,
        "page_followups_required": len(requirements),
        "missing_page_followups": missing,
    }
