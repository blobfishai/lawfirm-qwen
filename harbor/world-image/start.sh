#!/bin/bash
# World-container entrypoint: world server (:8971, container-internal) in the
# background, shim (:8972, the only surface tasks talk to) in the foreground.
set -e
python3 /world/server.py --port 8971 \
    --world /world/world.json --v2-contracts /world/contracts &
exec python3 /world/shim.py
