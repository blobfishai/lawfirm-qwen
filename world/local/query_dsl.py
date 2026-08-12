"""Bounded parsers for vendor query languages used by the mock contracts."""
from __future__ import annotations

import re
import shlex
from typing import Any


class QuerySyntaxError(ValueError):
    pass


def gmail_where(query: str) -> tuple[str, list[Any]]:
    """Compile the documented benchmark subset of Gmail's ``q`` language."""
    try:
        tokens = shlex.split(query)
    except ValueError as exc:
        raise QuerySyntaxError(f"Invalid Gmail search syntax: {exc}") from exc
    clauses: list[str] = []
    values: list[Any] = []
    text_fields = ("subject", "body", "from_addr", "to_addr")
    for token in tokens:
        if ":" not in token:
            clauses.append("(" + " OR ".join(f'"{field}" LIKE ?' for field in text_fields) + ")")
            values.extend([f"%{token}%"] * len(text_fields))
            continue
        operator, value = token.split(":", 1)
        if not value:
            raise QuerySyntaxError(f"Gmail operator {operator}: requires a value")
        if operator == "from":
            clauses.append('"from_addr" LIKE ?'); values.append(f"%{value}%")
        elif operator == "to":
            clauses.append('"to_addr" LIKE ?'); values.append(f"%{value}%")
        elif operator == "subject":
            clauses.append('"subject" LIKE ?'); values.append(f"%{value}%")
        elif operator == "after":
            clauses.append('"sent_at" > ?'); values.append(value)
        elif operator == "before":
            clauses.append('"sent_at" < ?'); values.append(value)
        elif operator == "has" and value == "attachment":
            # The lightweight message table stores extracted message text rather
            # than a MIME part table; explicit attachment language is the bounded
            # deterministic proxy and is documented as such.
            clauses.append('("body" LIKE ? OR "subject" LIKE ?)')
            values.extend(["%attach%", "%attach%"])
        else:
            raise QuerySyntaxError(f"Unsupported Gmail search operator: {operator}")
    if not clauses:
        raise QuerySyntaxError("Gmail search query must not be empty")
    return " AND ".join(clauses), values


RELATIVITY_FIELDS = {
    "Custodian": "custodian",
    "Responsive": "responsive",
    "Privileged": "privileged",
    "Document Date": "doc_date",
    "Control Number": "control_number",
    "Reviewed By": "reviewed_by",
}


def relativity_where(condition: str) -> tuple[str, list[Any]]:
    """Compile equality/date comparisons joined by AND/OR, with no eval/SQL input."""
    pieces = re.split(r"\s+(AND|OR)\s+", condition.strip(), flags=re.IGNORECASE)
    if not pieces or not pieces[0]:
        raise QuerySyntaxError("Relativity condition must not be empty")
    clauses: list[str] = []
    values: list[Any] = []
    connectors: list[str] = []
    for index, piece in enumerate(pieces):
        if index % 2:
            connectors.append(piece.upper())
            continue
        expression = piece.strip()
        while expression.startswith("(") and expression.endswith(")"):
            expression = expression[1:-1].strip()
        match = re.fullmatch(r"'([^']+)'\s*(==|!=|>=|<=)\s*'([^']*)'", expression)
        if not match:
            raise QuerySyntaxError(f"Unsupported Relativity condition expression: {piece}")
        field, operator, value = match.groups()
        column = RELATIVITY_FIELDS.get(field)
        if column is None:
            raise QuerySyntaxError(f"Unsupported Relativity field: {field}")
        clauses.append(f'"{column}" {"=" if operator == "==" else "<>" if operator == "!=" else operator} ?')
        values.append(value)
    if len(connectors) != len(clauses) - 1:
        raise QuerySyntaxError("Malformed Relativity boolean condition")
    sql = clauses[0]
    for connector, clause in zip(connectors, clauses[1:]):
        sql = f"({sql} {connector} {clause})"
    return sql, values


def vendor_error(dialect: str | None, message: str) -> str:
    import json
    if dialect == "google":
        return json.dumps({"error": {"code": 400, "message": message, "status": "INVALID_ARGUMENT"}})
    if dialect == "relativity":
        return json.dumps({"ErrorCode": 400, "Message": message})
    if dialect == "courtlistener":
        return json.dumps({"detail": message})
    if dialect == "clio":
        return json.dumps({"error": {"type": "invalid_request", "message": message}})
    return f"ERROR 400: {message}"
