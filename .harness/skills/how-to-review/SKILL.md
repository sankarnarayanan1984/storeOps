# Skill: how-to-review

**Purpose:** the Evaluator's procedure for turning a Generator iteration into per-check PASS/FAIL results with file:line evidence. Read by the Evaluator. The verdict itself is computed by a script — your job is to produce **binary, evidenced** check results, never a gut-feel overall grade.

## Procedure (in this order)
1. **Run the automated checks** — `node .harness/scripts/run-checks.mjs`. Never re-implement or override them. Results land in `.harness/output/automated-checks.json` (A1 A2 A3 B1 B2 C1 C5) together with `changed.files` (diff vs the run's base commit).
2. **Read the inputs**: `sprint-N-contract.md` (the ACs and files in scope), `sprint-N-generator-summary.md`, and **only** the changed files listed in `automated-checks.json` plus the specific existing files they call into. Do not read unrelated modules.
3. **Assess each LLM check** (A4 A5 A6 B3 B4 B5 C2 C3 C4) using the decision rules below. For each, write `PASS` or `FAIL` and the evidence.
4. **Write** `.harness/output/sprint-N-llm-checks.json`:
   ```json
   { "results": {
       "A4": { "status": "PASS", "evidence": "activities.service.ts:142 publishes activity.status_changed per updated task; alerts.subscribers.ts:31 consumes it" },
       "B3": { "status": "FAIL", "evidence": "S1-AC4 has no test asserting audit entries; only status 200 at activities.test.ts:388" }
   } }
   ```
5. **Compute** — `node .harness/scripts/compute-verdict.mjs --sprint N --iteration K`. Paste its output block verbatim at the top of `evaluator-feedback.md`. You may not change the verdict.
6. **Write feedback** for every FAIL (hard or soft) using the finding format below, then the AC verification table.

## Decision rules — converting judgement into PASS/FAIL
- **No evidence, no pass.** A PASS must cite at least one `path:line`. If you cannot find the line that satisfies the check, it is FAIL.
- **Any single counter-example fails the check.** One route with a business rule fails A5; one AC without an outcome assertion fails B3.
- **Judge against the contract, not your taste.** Style preferences that no rule in architecture-principles / coding-conventions / how-to-test states are notes, never FAILs.
- **Generator claims are hypotheses.** A `MET` in generator-summary counts only if you verified it in code and a test (C2).
- **Unsure between PASS and FAIL → FAIL**, and say exactly what evidence would flip it. This bias is deliberate: a false FAIL costs one iteration; a false PASS ships a violation to main.

### Check-specific rules
| Check | PASS when | FAIL examples |
|---|---|---|
| A4 event bus | every state change another module reacts to (per contract) is `events.publish(...)` with an event declared in `domainEvents.ts`, published from a service after the write; consumers subscribe in their own `*.subscribers.ts` | service calls another module; event declared but never published; subscriber placed in the producer module; publish before the write |
| A5 layers | routes: parse/auth/one service call/status only; services hold rules; repositories store only | `if (task.status === …)` or role checks in a route; repository publishes events or throws |
| A6 errors | each contract error path throws the named class + code | generic `ValidationError` where contract says `ConflictError('…', 'INVALID_STATUS_TRANSITION')` |
| B3 outcome tests | each AC id maps to ≥1 test asserting body/state/event | AC tested only via `.expect(200)`; AC with no test |
| B4 error codes | each error AC asserts `error.code` | asserts status only |
| B5 event tests | each new/changed `publish` has a test on payload or downstream effect | event never asserted |
| C2 summary | AC table lists every contract AC; every MET verified | missing AC row; MET that isn't implemented |
| C3 scope | every changed file is in the contract's files-in-scope (README, tests and seed files for touched modules are implicitly in scope) | edits in an unrelated module |
| C4 docs | README endpoint/event tables include the sprint's additions | new endpoint absent from README |

## Finding format (one per FAIL — must be fixable without asking a human)
```
### [A4][HARD] Cross-module notification written directly
- **File:** src/modules/activities/activities.service.ts:157
- **Rule:** architecture-principles R2 (event bus only) — FM4
- **Found:** `await this.alerts.notify(...)` — activities holds a reference to AlertsService.
- **Fix:** publish `activity.bulk_updated` from the service after the save; add the subscriber in src/modules/alerts/alerts.subscribers.ts; remove the alerts dependency from ActivitiesModuleDeps.
```
Order findings: hard-gate FAILs first, then soft FAILs, then optional notes (clearly labelled "note — not scored").

## Determinism checklist before you finish
- [ ] Every rubric check id has exactly one result (automated from the script, LLM in your JSON)
- [ ] Every PASS cites `path:line`; every FAIL has a finding with File/Rule/Found/Fix
- [ ] The verdict block is the unedited output of `compute-verdict.mjs`
- [ ] First line of `evaluator-feedback.md` is `VERDICT: …`
