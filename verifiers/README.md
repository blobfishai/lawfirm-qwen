# verifiers/ — all 270 VCode verifiers, verbatim

One Python file per task, extracted from the world document by `node sim/build-catalog.mjs`.
Contract: `verify(initial_state, final_state, trace) -> {passed, reward, failed_conditions, assertions}`
where the states are `{table: [row, ...]}` snapshots and trace is the rollout's step list.
Structural conditions decide pass/fail; anti-hack conditions (workflow shortcuts, fabricated rows,
collateral damage) veto reward to 0; `all_tools_succeeded` is advisory.
