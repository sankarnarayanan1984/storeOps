ESCALATION: <ITERATION_LIMIT | HARNESS_FAULT | SPEC_CONFLICT>
RUN_ID: <run-id>
SPRINT: <N>
ITERATIONS_USED: <K>
LAST_VERDICT: <FAIL | CONDITIONAL PASS | n/a>

# Escalation — sprint <N> needs a developer decision

## Blocking issue
<one paragraph: what keeps failing and why the Generator could not fix it>

## Evidence
| Iteration | Verdict | Score | Hard gates failed |
|---|---|---|---|
- Latest feedback: `.harness/output/sprint-<N>-evaluator-feedback.md`
- Findings that repeated across iterations: <check ids + path:line>

## Likely cause
<contract ambiguity | missing skill rule | genuine architecture conflict | harness defect>

## Options for the developer
Reply with one of:
- `RETRY SPRINT <N>: <guidance>` — reset the iteration count; guidance is appended to the contract
- `REPLAN` — return to the Planner with this escalation as input
- `ABORT` — stop the run; the Monitor archives what exists
