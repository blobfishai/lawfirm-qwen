# Vendor conformance

The permanent gate has three layers:

1. `live.py` executes every agent-visible MCP tool and validates all applicable
   request, published input, and success-response schemas against pinned vendor
   documents.
2. `behavior.py` checks vendor pagination, error, encoding, query, LEDES,
   Relativity, ECF, deadline, and e-signature fixtures.
3. `cl_livediff.py` replays CourtDock against the pinned official CourtListener
   Django server and checks its two Elasticsearch search shapes against pinned
   source serializers.

Run the ordinary offline gate against a local world:

```bash
python3 tools/conformance/live.py --base http://127.0.0.1:8974 --strict
python3 tools/conformance/behavior.py --base http://127.0.0.1:8974
python3 tools/conformance/run.py --strict
```

Run the scheduled CourtListener proof (first run builds the pinned official
image and applies its migrations):

```bash
tools/conformance/run_courtlistener.sh --check
```

The script uses disposable, explicitly named Docker resources on the
`legal-sim-cl-conformance` network. Its two fixed tokens are fixture
credentials scoped to that local database. Eleven database-backed operations
run through CourtListener itself; the two search endpoints are checked against
the exact pinned `SearchV4` serializers so Elasticsearch is not required.
