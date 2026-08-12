#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SOURCE="$ROOT/research/repos/freelawproject@courtlistener"
IMAGE="legal-sim-courtlistener:f7f4569"
NETWORK="legal-sim-cl-conformance"
POSTGRES="legal-sim-cl-postgres"
REDIS="legal-sim-cl-redis"
SERVER="legal-sim-cl-server"
READ_TOKEN="c0ffee0000000000000000000000000000000000"
WRITE_TOKEN="decaf00000000000000000000000000000000000"

if [[ ! -f "$SOURCE/docker/django/Dockerfile" ]]; then
  echo "missing pinned CourtListener source at $SOURCE" >&2
  exit 1
fi
if ! grep -q '"freelawproject@courtlistener": "f7f45696fca0"' "$ROOT/research/repos-commits.json"; then
  echo "CourtListener source revision does not match the conformance registry" >&2
  exit 1
fi

docker image inspect "$IMAGE" >/dev/null 2>&1 || \
  docker build -t "$IMAGE" -f "$SOURCE/docker/django/Dockerfile" "$SOURCE"
docker network inspect "$NETWORK" >/dev/null 2>&1 || docker network create "$NETWORK" >/dev/null

if ! docker container inspect "$POSTGRES" >/dev/null 2>&1; then
  docker run -d --name "$POSTGRES" --network "$NETWORK" \
    -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=courtlistener -e POSTGRES_USER=postgres \
    postgres:15-alpine >/dev/null
elif [[ "$(docker inspect -f '{{.State.Running}}' "$POSTGRES")" != "true" ]]; then
  docker start "$POSTGRES" >/dev/null
fi

if ! docker container inspect "$REDIS" >/dev/null 2>&1; then
  docker run -d --name "$REDIS" --network "$NETWORK" redis:7-alpine >/dev/null
elif [[ "$(docker inspect -f '{{.State.Running}}' "$REDIS")" != "true" ]]; then
  docker start "$REDIS" >/dev/null
fi

for _ in $(seq 1 60); do
  docker exec "$POSTGRES" pg_isready -U postgres -d courtlistener >/dev/null 2>&1 && break
  sleep 1
done
docker exec "$POSTGRES" pg_isready -U postgres -d courtlistener >/dev/null
docker exec "$REDIS" redis-cli FLUSHALL >/dev/null

docker rm -f "$SERVER" >/dev/null 2>&1 || true
docker run -d --name "$SERVER" --network "$NETWORK" -p 8988:8000 \
  --entrypoint /opt/venv/bin/python \
  -e DB_HOST="$POSTGRES" -e DB_SSL_MODE=disable -e REDIS_HOST="$REDIS" \
  -e ELASTICSEARCH_DISABLED=true -e DEVELOPMENT=true \
  -e ALLOWED_HOSTS=127.0.0.1,localhost \
  -v "$ROOT/tools/conformance/courtlistener_harness.py:/opt/courtlistener/courtlistener_harness.py:ro" \
  "$IMAGE" courtlistener_harness.py >/dev/null

ready=false
for _ in $(seq 1 180); do
  if curl -fsS http://127.0.0.1:8988/ >/dev/null 2>&1; then
    ready=true
    break
  fi
  if [[ "$(docker inspect -f '{{.State.Running}}' "$SERVER" 2>/dev/null || echo false)" != "true" ]]; then
    docker logs "$SERVER" >&2
    exit 1
  fi
  sleep 1
done
if [[ "$ready" != "true" ]]; then
  docker logs "$SERVER" >&2
  echo "CourtListener did not become ready within 180 seconds" >&2
  exit 1
fi

python3 "$ROOT/tools/conformance/cl_livediff.py" \
  --base http://127.0.0.1:8988 \
  --token "$READ_TOKEN" --write-token "$WRITE_TOKEN" "$@"
