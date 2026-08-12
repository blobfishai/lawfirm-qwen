#!/usr/bin/env python3
"""Emit the safe environment block for agentic-ops/legal-mcp BYO mode."""

from __future__ import annotations

import argparse
import json

from courtlistener_facade import DEFAULT_TOKEN


def environment(base_url: str, token: str) -> dict[str, str]:
    return {
        "COURTLISTENER_ENABLED": "true",
        "COURTLISTENER_BASE_URL": base_url.rstrip("/") + "/api/rest/v4",
        "COURTLISTENER_API_TOKEN": token,
        "PACER_ENABLED": "false",
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default="http://127.0.0.1:8993")
    parser.add_argument("--token", default=DEFAULT_TOKEN)
    parser.add_argument("--format", choices=("json", "shell"), default="json")
    args = parser.parse_args()
    values = environment(args.base_url, args.token)
    if args.format == "shell":
        for key, value in values.items():
            escaped = value.replace("'", "'\\''")
            print(f"export {key}='{escaped}'")
    else:
        print(json.dumps(values, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
