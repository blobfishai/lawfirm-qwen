#!/bin/bash
# M0.3 harbor smoke — prove generated Harbor tasks work end-to-end:
# oracle solve must score 1.0, and a no-op agent must score 0.0.
#
# Usage: tools/harbor_smoke.sh [task_id ...]   (default: the 3 CI tasks)
# Requires: docker compose; the world image built by harbor/generate.py.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TASKS=("${@:-task_003 task_v3_001 task_194}")
[ $# -eq 0 ] && TASKS=(task_003 task_v3_001 task_194)

fail=0
run_one() { # $1=task_id $2=mode(solve|noop)
  local tid="$1" mode="$2"
  local task="$ROOT/dist/harbor/tasks/$tid"
  local proj="smoke-$(echo "$tid-$mode" | tr '_' '-')"
  local ovr; ovr="$(mktemp)"
  cat > "$ovr" <<EOF
services:
  main:
    build: $task/environment
    command: ["sleep", "infinity"]
    volumes:
      - $task/solution:/solution:ro
      - $task/tests:/tests:ro
EOF
  local cf=(-p "$proj" -f "$task/environment/docker-compose.yaml" -f "$ovr")
  docker compose "${cf[@]}" up -d --build --quiet-pull >/dev/null 2>&1
  if [ "$mode" = "solve" ]; then
    docker compose "${cf[@]}" exec -T main bash /solution/solve.sh >/dev/null
  fi
  docker compose "${cf[@]}" exec -T main bash /tests/test.sh >/dev/null
  local reward
  reward="$(docker compose "${cf[@]}" exec -T main cat /logs/verifier/reward.json)"
  docker compose "${cf[@]}" down -v --remove-orphans >/dev/null 2>&1
  rm -f "$ovr"
  local want='"passed": 1.0' ; [ "$mode" = "noop" ] && want='"passed": 0.0'
  if echo "$reward" | grep -qF "$want"; then
    echo "  OK   $tid $mode -> $reward"
  else
    echo "  FAIL $tid $mode -> $reward (wanted $want)"
    fail=1
  fi
}

for tid in ${TASKS[@]}; do
  run_one "$tid" solve
done
# no-op discrimination on the first task only (cheap, catches guard breakage)
run_one "${TASKS[0]}" noop

exit $fail
