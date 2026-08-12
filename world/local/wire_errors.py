"""Vendor-shaped operational failures and transport-failure classification.

Scheduled benchmark friction is an HTTP failure, not a successful JSON-RPC
response containing an error-looking string. The simulator-only signature is
carried in a response header so the vendor body stays faithful while the
harness can distinguish intentional friction from an infrastructure outage.
"""
from __future__ import annotations

import json


def friction_http(signature: str, dialect: str | None) -> tuple[int, dict, dict[str, str]]:
    rate = signature == "rate_limited"
    stale_status = 409 if dialect in {"courtlistener", "relativity", "imanage", "docusign"} else 412
    status = 429 if rate else stale_status
    message = ("Upstream rate limit exceeded; retry after one second."
               if rate else "The referenced resource changed; re-read it before retrying.")
    headers = {"X-Simulator-Failure": signature}
    if rate:
        headers["Retry-After"] = "1"
    if dialect == "google":
        body = {"error": {"code": status, "message": message,
                          "status": "RESOURCE_EXHAUSTED" if rate else "FAILED_PRECONDITION"}}
        return status, body, headers
    if dialect == "courtlistener":
        return status, {"detail": message}, headers
    if dialect == "clio":
        body = {"error": {"type": "rate_limit_exceeded" if rate else "stale_object",
                          "message": message}}
        return status, body, headers
    if dialect == "relativity":
        return status, {"ErrorCode": status, "Message": message}, headers
    if dialect == "docusign":
        body = {"errorCode": "HOURLY_APIINVOCATION_LIMIT_EXCEEDED" if rate else "ENVELOPE_LOCKED",
                "message": message}
        return status, body, headers
    return status, {"error": signature, "message": message}, headers


def friction_error(signature: str, dialect: str | None) -> str:
    """Compatibility helper for tests and non-HTTP adapters."""
    _, body, _ = friction_http(signature, dialect)
    return json.dumps(body)


def infrastructure_error(error: BaseException) -> str:
    """A transport outage can never masquerade as scheduled benchmark friction."""
    return json.dumps({"infrastructure_error": True, "kind": type(error).__name__,
                       "message": str(error)[:240]})
