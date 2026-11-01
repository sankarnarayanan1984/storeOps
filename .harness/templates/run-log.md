---
run_id: <run-id>
sprint: <N>
title: <sprint title>
verdict: <PASS | CONDITIONAL PASS | FAIL>
score: <final score>
iterations_used: <1-3>
max_iterations: 3
escalated: <true|false>
accepted_conditional: <true|false>
hard_gates_failed_by_iteration: [<e.g. "A4,B3">, <"none">]
scores_by_iteration: [<72.5>, <93.3>]
measured_tokens: <integer — platform-reported, Generator + Evaluator for this sprint>
est_tokens: <integer — chars ÷ 4 estimate, for comparison>
est_cost_usd_low: <0.00 — measured_tokens at the input rate>
est_cost_usd_high: <0.00 — measured_tokens at the output rate>
cost_basis: claude-opus-5-5 @ $4.00 in / $20.00 out per MTok (2026-10-06)
started_at: <ISO>
finished_at: <ISO>
---

# Run log — <run-id> sprint <N>

## Iterations
| Iteration | Verdict | Score | Hard gates failed | Main findings |
|---|---|---|---|---|

## Token and cost estimate
| Agent | Invocations | Input chars | Output chars | Est. tokens |
|---|---|---|---|---|
Method: tokens ≈ characters ÷ 4 over files each agent read and wrote (skills + handoff files + changed code), × invocations. Cost uses the rate in monitor.agent.md. Order-of-magnitude only.

## Quality trend notes
- <which checks failed first time, whether the same check failed in earlier runs (see .harness/reviews/index.md), and which skill file most likely needs a rule>

## Skill-file signals
| Signal | Skill file | Suggested change |
|---|---|---|
