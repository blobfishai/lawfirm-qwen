# World lineage — how the canonical world was built

Only two snapshots are kept: `world.json` (the original 156-task world as
generated) and `world-v15.json` (canonical). The intermediates were 11 files of
~7 MB each, ~80 MB of near-identical JSON, and every one is reproducible from
the step that made it — each pack is a *generator*, not static data.

| step | from → to | tasks | command |
|---|---|---|---|
| eval packs | `world.json` → `world-expanded.json` | 156 → 231 | `node world/expansion/assemble.mjs --in world/blobfish/world.json --out world/blobfish/world-expanded.json --packs-dir world/expansion/packs` |
| ERP purge | → `world-lawnative.json` | 231 → 230 | `node world/expansion/purge-domain.mjs` |
| v3 workflows | → `world-v3.json` | 230 → 245 | `node world/expansion/build-v3-tasks.mjs` |
| growth | → `world-v4.json` | 245 → 255 | `node sim/grow-tasks.mjs` |
| gap packs | → `world-v5.json` | 255 → 270 | `assemble.mjs --packs-dir world/expansion/packs-v3` |
| retire recipes | → `world-v5-pruned.json` | 270 → 232 | `node world/expansion/retire-recipe-tasks.mjs` |
| packs-v4 | → `world-v6.json` | 232 → 270 | `assemble.mjs --packs-dir world/expansion/packs-v4` |
| LAB pack | → `world-v7.json` | 270 → 274 | `node world/expansion/packs-lab/build-lab-pack.mjs` then `assemble.mjs` |
| gap disclosure | → `world-v8.json` | 274 → 277 | `packs-gap/build-gap-pack.mjs` then `assemble.mjs` |
| ethical wall | → `world-v9.json` | 277 → 280 | `packs-wall/build-wall-pack.mjs` then `assemble.mjs` |
| async queue | → `world-v10/11` | 280 → 284 | `packs-posture/build-posture-pack.mjs`, `add-analysis-queue.mjs` |
| async pack | → `world-v12.json` | 284 → 286 | `packs-async/build-async-pack.mjs` then `assemble.mjs` |
| growth pack | → `world-v13.json` | 286 → 288 | `packs-grow/build-grow-pack.mjs` then `assemble.mjs` |
| corpus tools | → `world-v14.json` | 288 | `node world/expansion/add-corpus-tools.mjs` |
| grounded drafting | → `world-v15.json` | 288 → 291 | `assemble.mjs --in world/blobfish/world-v14.json --out world/blobfish/world-v15.json --packs-dir world/expansion/packs-grounded` |
| v3 verifier revision 2 | `world-v15.json` → in place | 291 → 291 | `node world/expansion/build-v3-tasks.mjs --in world/blobfish/world-v15.json --out world/blobfish/world-v15.json --refresh-only` (same-row pin binding; tasks and seeds preserved) |

After any rebuild: re-derive seeds and re-prove.

```bash
node world/expansion/derive-task-seeds.mjs --world world/blobfish/world-v15.json
python3 world/local/server.py --world world/blobfish/world-v15.json \
    --v2-contracts mcp/v3/contracts --port 8791          # --v2-contracts is REQUIRED
python3 world/local/oracle.py       --base http://localhost:8791 --world world/blobfish/world-v15.json
python3 world/local/discriminate.py --base http://localhost:8791 --world world/blobfish/world-v15.json --report-only
node world/expansion/discrimination-report.mjs --world world/blobfish/world-v15.json
```
