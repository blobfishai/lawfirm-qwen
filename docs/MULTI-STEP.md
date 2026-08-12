# Multi-step and interruption evaluation (world-v19)

World-v19 adds two deterministic classes:

- **5 checkpointed capstones**: five phases and exactly 50 successful reference
  calls per matter, spanning PM, DMS, court records/e-filing, DeadlineRules,
  Workspace, and LEDES. Harbor uses `multi_step_reward_strategy = "mean"`;
  every phase has its own verifier and a failed checkpoint aborts later work.
- **30 multi-turn tasks**: 8 fragment/selection, 8 correction, 7 superseding
  letter, and 7 scope-withdrawal sessions. The post-follow-up state is the only
  passing state.

The world shim owns one session for the entire Harbor trial. `GET /step`
exposes only the current public phase name/instruction and completed checkpoint
names. Per-step tests send the phase name to `POST /verify`; the shim rejects
unknown or out-of-order phase verification, and the world server executes that
phase's shipped VCode against the persistent state and cumulative trace.

Harbor-native agents should be run with `--resume-trajectory` when the agent
supports native session resumption. Harbor still delivers the steps correctly
without it, but each phase starts a fresh model conversation while the tool
state persists. Single-instruction harnesses retain the older compatibility
path: `harbor/generate.py` renders `session` follow-ups as ordered addenda only
for tasks that do not declare `multi_step`.

## Mechanical proof

```bash
python3 world/v19/build.py
python3 world/local/oracle.py --world world/blobfish/world-v19.json --tasks <35-v19-ids>
python3 world/local/discriminate.py --world world/blobfish/world-v19.json --tasks <35-v19-ids>
python3 world/local/precorrection.py --world world/blobfish/world-v19.json
python3 tools/check_v19_multistep.py
```

The committed proof artifacts establish:

- oracle: 35/35;
- no-op, text-only, blind-write, and wrong-value: rejected 35/35 each;
- pre-correction/original-instruction walk: rejected 35/35;
- capstone reference length: 50 calls for all five matters.
- real Harbor smoke: 5/5 capstone checkpoints and 2/2 multi-turn checkpoints,
  each with aggregate reward 1.0 and no trial exception.

This tests instruction revision, not merely the presence of a follow-up string:
every task carries an executable pre-correction walk and the final verifier
proves that behavior is wrong.
