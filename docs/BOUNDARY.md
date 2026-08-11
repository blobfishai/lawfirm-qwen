# Boundary characterisation — deepseek-chat

Tasks with at least 6 pooled episodes. Rate is passes/episodes; the interval is 
a 95% Wilson score interval, which is what makes "2/3" and "6/11" different claims.

11 tasks · 88 episodes · $13.18

| Class | Tasks | Meaning |
|---|---|---|
| **MIXED** | 6 | the boundary — same prompt, sometimes passes |
| NO-FAILURES | 5 | no evidence of a boundary at this n; grow, or measure deeper |
| NO-PASSES | 0 | past the model; keep for the failure mode |

## Every measured task, weakest first

| Task | Family | Pass | Rate | 95% interval | Class | Dominant failure | Avg calls |
|---|---|---|---|---|---|---|---|
| task_310 | lab-employment-compensation-escalation | 1/8 | 13 | [2, 47] | MIXED | collateral-write (7) | 71 |
| task_312 | lab-employment-compensation-escalation | 2/8 | 25 | [7, 59] | MIXED | collateral-write (6) | 38 |
| task_320 | posture-dependent-chronology | 2/8 | 25 | [7, 59] | MIXED | wrong-value (6) | 19 |
| task_309 | lab-employment-compensation-escalation | 4/8 | 50 | [22, 78] | MIXED | collateral-write (4) | 39 |
| task_287 | bankruptcy-claim-classification | 7/8 | 88 | [53, 98] | MIXED | collateral-write (1) | 16 |
| task_296 | hsr-merger-notification | 7/8 | 88 | [53, 98] | MIXED | collateral-write (1) | 30 |
| task_271 | arbitration-clause-review | 8/8 | 100 | [68, 100] | NO-FAILURES | — | 20 |
| task_297 | hsr-merger-notification | 8/8 | 100 | [68, 100] | NO-FAILURES | — | 28 |
| task_303 | multi-hop-damages | 8/8 | 100 | [68, 100] | NO-FAILURES | — | 16 |
| task_306 | multi-hop-damages | 8/8 | 100 | [68, 100] | NO-FAILURES | — | 21 |
| task_326 | covenant-portfolio-sweep | 8/8 | 100 | [68, 100] | NO-FAILURES | — | 28 |

## Failure modes across every miss

| Mode | Episodes |
|---|---|
| collateral-write | 19 |
| wrong-value | 6 |
