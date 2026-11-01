# Harness Design Brief — StoreOps

**System:** StoreOps API (TypeScript 5 strict, Express 5, zod, Jest + supertest, in-memory) · **Harness:** `CLAUDE.md` orchestrator + Planner / Generator / Evaluator / Monitor in `.harness/` · **Demo feature:** shift handover bulk update (`PROMPT.md`) · **Demo run:** `2026-10-30-bulk-status` — 4 sprints, 20 ACs, all PASS on iteration 1 (evidence in `.harness/reviews/2026-10-30-bulk-status/`; lessons in `REFLECTION.md`).

```
 developer ── @planner prompt ──► PLANNER ──► spec.md (AWAITING APPROVAL) + sprint-N-contract.md
     ▲                                                   │
     │ APPROVED / CHANGES / RETRY / REPLAN / ABORT        ▼
     │                         ┌──────── for each sprint, K = 1..3 ────────┐
     │                         │ GENERATOR ─► code, tests, generator-summary │
     │                         │ EVALUATOR ─► run-checks.mjs (automated)     │
     │                         │            ─► llm-checks.json (evidence)    │
     │                         │            ─► compute-verdict.mjs ─► VERDICT│
     │                         └──── PASS → next · FAIL/COND → retry ────────┘
     └──── escalation.md (FAIL at K=3) ◄─── MONITOR ─► .harness/reviews/<run>/run-log.md + index.md
```

---

## A. Intent decomposition

**Agent responsibilities follow the client's distrust, not the SDLC.** The standards team's concern is that AI output drifts from agreed rules, so the agent boundaries separate *who decides what to build* (Planner, approved by a human), *who builds* (Generator), *who judges* (Evaluator, fresh context, cannot edit code) and *who records* (Monitor, cannot change outcomes). No agent grades its own work, and the only agent allowed to touch `src/` is the one whose output is independently verified.

**Sprint boundaries.** The sprint-decomposition skill draws a boundary wherever a different module becomes the subject of the acceptance criteria, requires producer-before-consumer, and requires every sprint to be green on its own. The Planner's first spec had two sprints (activities, alerts). At the approval gate I asked for programmes, staff and reports to take part; the revised, approved spec gave each consumer its own sprint:

| Sprint | Scope | ACs | Why the line is here |
|---|---|---|---|
| 1 | activities: `PATCH /bulk-status` with per-id results, store/region permission, audit trail + `GET /:id/audit` (actor name via `StaffReader`), publishes `activity.status_changed` per task and `activity.handover_completed` | 8 | single owning module, fully testable over HTTP, and the producer of the new event |
| 2 | alerts: SHIFT_HANDOVER notification per affected store's manager; regression proof that BLOCKED alerts and activity metrics still react | 5 | first consumer; isolates the FM4 integration |
| 3 | reports: handover counters per store and region | 3 | read-only consumer (R5) proved separately |
| 4 | programmes: handover history per programme, `GET /api/programmes/:id/handovers` | 4 | consumer that keys off data carried in the event (`programmeId`), never imports activities |

Staff has no sprint of its own by design (developer decision at approval: "reader-only"): it participates only through `StaffReader`, which is the R1 rule for staff.

**Testable acceptance criteria.** Each AC is GIVEN/WHEN/THEN with seeded identities (Priya `stf_001` STORE_MANAGER store_001, `tsk_001`…), the exact request, and a THEN that names an observable outcome *beyond* the status code — body fields, a state read-back, an event, or an error `code`. Vague words ("correctly", "appropriate") are banned in the skill. This is what makes failure mode 3 checkable: if the THEN contains a state or event, the Evaluator can demand a test assertion on it (rubric B3).

**Example contract entry** (verbatim from `.harness/reviews/2026-10-30-bulk-status/sprint-1-contract.md`)
> **S1-AC2 — Partial failure: one bad id does not fail the others**
> **GIVEN** Priya (stf_001, STORE_MANAGER, store_001) is signed in, A1 is TODO, A3 is DONE, A4 is BLOCKED, all in store_001
> **WHEN** she sends `PATCH /api/activities/bulk-status` with `{ ids: [A1, 'tsk_999', A3, A4], status: 'BLOCKED' }`
> **THEN** the response is 200 with results in request order: A1 `UPDATED` (TODO → BLOCKED); `tsk_999` `FAILED` with `error.code: 'NOT_FOUND'`; A3 `FAILED` with `error.code: 'INVALID_STATUS_TRANSITION'`; A4 `FAILED` with `error.code: 'INVALID_STATUS_TRANSITION'` (already BLOCKED); each failed `error.message` is a non-empty string; `summary` = `{ updated: 1, failed: 3 }`; A1 reads back BLOCKED, A3 still DONE, A4 still BLOCKED

What makes it testable: every input is a concrete id or a task the test creates; each failure names its `code`; and the THEN demands **read-backs** ("A3 still DONE"), so a test that only checks `200` cannot satisfy B3.

---

## B. Governance framework

**Skill strategy — one concern per file, loaded only by the agents that need it.**

| Skill | Read by | StoreOps-specific content |
|---|---|---|
| app-context | all | the 5 modules and their §3.3 enums, seeded staff/tasks/programmes ids used in ACs and tests, commands |
| architecture-principles | all | R1–R6 mapped to FM1–FM4; the only legal cross-module import (`staff.reader.ts`, type-only); AppError table with existing codes; protected-file list |
| sprint-decomposition | Planner | sprint sizing (≤2 modules, producer before consumer), GIVEN/WHEN/THEN rules with StoreOps examples |
| coding-conventions | Generator | file/ID/enum naming, Express 5 param typing, static-before-param routes, service method ordering |
| api-integration | Generator | recipes: endpoint, domain event, subscriber; partial-failure and audit patterns; "looks right but fails" table |
| how-to-test | Generator, Evaluator | per-file coverage thresholds, outcome-assertion rule (FM3), permission and event test patterns |
| how-to-review | Evaluator | procedure, "no evidence, no pass", per-check decision rules, finding format |
| evaluation-criteria (+ `rubric.json`) | Evaluator, Monitor | dimensions, weights, hard gates, verdict rules, ambiguity fallbacks |

Shared files are shared because the same rule must be read identically by the agent that writes code and the agent that judges it (architecture-principles, how-to-test). Generation recipes are *not* given to the Evaluator — it grades against rules, not against the Generator's playbook.

**Audit trail.** The Monitor copies the approved spec, each contract, the final generator summary, *every* iteration's evaluator feedback and any escalation into `.harness/reviews/<run-id>/`, writes a run log with machine-readable front matter (verdict, iterations, scores by iteration, hard gates failed, escalated, est. tokens) and appends a row to `reviews/index.md`. The folder is committed with the PR, so the reviewer, tech lead and standards team see why each sprint was accepted. A recurring issue surfaces as the same check id in the "hard gates failed (iter 1)" column across runs; the Monitor maps check ids to the skill that should have prevented them, turning a pattern into a reviewed skill-file change.

**Rule traced to a StoreOps decision — event bus only (architecture-principles R2):**
> When a change in one module must cause something in another, the owning service publishes an event declared in `src/shared/events/domainEvents.ts` after its repository write, and the other module subscribes in its own `*.subscribers.ts`. Importing another module's service is a hard-gate failure.

Without it, the bulk endpoint's easiest implementation is to inject `AlertsService` into activities and call `notify()` — exactly FM4. That couples deploy and test of two modules, bypasses the reports module (metrics silently stop counting bulk updates), and makes the next feature (SLA breach alerting) copy the pattern. The rule is enforced twice: deterministically (dependency-cruiser `no-direct-service-imports`, check A1) and by the Evaluator (A4) for the case a linter can't see — a state change that *should* have published but didn't.

---

## C. Non-determinism strategy

**Dimensions and weights.** A — Architecture compliance **40%** (FM1, FM2, FM4: the standards team's veto); B — Behaviour & test evidence **35%** (FM3 and the §3.6 coverage thresholds); C — Contract fidelity & hygiene **25%** (scope and gate integrity). Checks are binary; a dimension scores `weight × passed/total`.

**Hard gates and why each cannot be soft.**

| Gate | Prevents | Why not soft |
|---|---|---|
| A1 dependency-cruiser 0 violations (automated) | FM1 cross-module repository/service imports; reports writing | one import is enough to break module isolation; partial credit would let it merge |
| A2 eslint 0 errors (automated) | FM2 raw `Error` throws, forbidden imports | a raw throw becomes a 500 with no error code — a contract break for API consumers |
| A3 tsc 0 errors (automated) | code that doesn't compile | nothing else is meaningful if it doesn't build |
| A4 event bus (LLM, evidence-bound) | FM4 missing integration | a missing publish produces no error anywhere — only review catches it, and it silently breaks alerts/reports |
| A5 layer separation (LLM) | business rules in routes / repositories with side effects | the brief lists it as non-negotiable; violations compound across features |
| B1 tests pass, B2 coverage (automated) | regressions, untested branches (FM3) | client-mandated thresholds |
| B3 outcome assertions (LLM) | FM3 status-only tests | a suite can be 100% green and prove nothing — coverage can't detect it |
| C1 protected files unchanged (automated, hash snapshot) | the Generator weakening gates (e.g. lowering `jest.config.js` thresholds) | a soft penalty would make gaming the gate a viable strategy |

Every dimension has at least one automated hard gate (A1–A3, B1–B2, C1).

**Variable output → deterministic verdict.** The Evaluator never writes the verdict. It records one PASS/FAIL per LLM check with `path:line` evidence ("no evidence, no pass"; "unsure → FAIL"); `run-checks.mjs` records the automated ones; `compute-verdict.mjs` applies the rubric in fixed order: any hard-gate FAIL → FAIL; any dimension < 50% → FAIL; ≥ 90 → PASS; ≥ 75 → CONDITIONAL PASS; else FAIL. A missing result counts as FAIL. Identical check results always yield the identical verdict — verified on the baseline: all checks PASS → 100; one soft fail (A6) → 93.3 PASS; two soft fails (A6, C4) → 88.3 CONDITIONAL PASS; any hard gate → FAIL.

*Walk-through (demo run, sprint 1):* `run-checks.mjs` recorded A1–A3, B1–B2, C1, C5 = PASS (133/133 tests, 99.09 % lines, 36 protected files unchanged). The Evaluator then recorded nine binary LLM results, each citing `path:line` — e.g. A4: "`activity.handover_completed` … published from service after all writes at `src/modules/activities/activities.service.ts:161`"; B3 mapped every AC id to the asserting lines (`tests/api/activities.bulk-status.test.ts:80-92` for S1-AC2). `compute-verdict.mjs --sprint 1 --iteration 1` applied the rules: no hard-gate FAIL → no dimension below 50 % → score 100 ≥ 90 → **PASS**; the orchestrator read `VERDICT: PASS` from line 1, confirmed it against `sprint-1-verdict.json`, and routed to the Monitor. All four sprints followed this path.

*The FAIL path* was not triggered in the demo run (see `REFLECTION.md`); it was verified on the baseline with synthetic check files: one soft FAIL → 93.3 PASS; A6 + C4 FAIL → 88.3 CONDITIONAL PASS; an ESLint error (A2) → FAIL at 93.3, because rule 1 (any hard gate) is applied before the score is considered; a one-line edit to `jest.config.js` → C1 FAIL. Because the verdict is a pure function of the per-check results in `rubric.json` order, identical check files always yield the identical verdict.

**Escalation.** Triggered by FAIL at iteration 3, a second malformed evaluation (HARNESS_FAULT), or an unresolved Planner decision (SPEC_CONFLICT). The orchestrator writes `.harness/output/escalation.md`: sprint, iterations used, last verdict/score, blocking finding(s) with path:line, findings that repeated across iterations, likely cause, and reply options (`RETRY SPRINT N: guidance`, `REPLAN`, `ABORT`). It goes to the developer who started the run (in-session) and is archived to `reviews/` so the tech lead sees it at PR review. Expected response within the working session; a repeated escalation on the same check is a skill-file defect, not a developer task.

---

## D. Architectural decisions

**D1 — The verdict is computed by a script, not written by the Evaluator.**
*Options:* (a) Evaluator LLM writes the verdict from the rubric; (b) Evaluator records per-check results and a script computes the verdict; (c) automated checks only.
*Rationale:* (a) is where LLM leniency lives — the same findings could be called PASS one day and CONDITIONAL the next. (c) can't see FM3/FM4. (b) confines non-determinism to individual, evidence-bound binary judgements and makes the aggregation exact and auditable.
*Assumption:* the rubric's checks are granular enough that each LLM judgement is close to binary; if a check needs nuance, it should be split, not weighted.

**D2 — Fresh subagent per agent invocation; all context through files.**
*Options:* (a) one long session playing all roles; (b) subagents sharing the orchestrator's conversation; (c) fresh subagents with fixed reading lists and file handoffs.
*Rationale:* (a) degrades over a 2-sprint × 3-iteration run and lets the Evaluator "remember" the Generator's intent instead of reading the code. (c) gives a reset between every role and every sprint, makes each handoff inspectable, and lets `run-state.json` resume a run after compaction.
*Assumption:* the handoff files carry everything an agent needs; any time an agent has to re-derive context, that context belongs in a skill or template.

**D3 — Protect the gates with a hash snapshot taken at approval.**
*Options:* (a) trust the Generator's instructions; (b) `git diff` against the base commit; (c) SHA-256 snapshot of protected paths at APPROVED.
*Rationale:* (b) breaks when harness files are uncommitted and couples the check to git state; (c) is deterministic, works on any working tree and detects edits, additions and deletions under protected paths.
*Assumption:* legitimate gate changes (e.g. a new dependency in `package.json`) are rare and are made by the developer between runs, after which a fresh snapshot is taken.

*Also recorded:* Express 5 kept instead of the brief's 4.x (async error propagation removes try/catch boilerplate the Generator would otherwise get wrong); the harness never commits — the developer commits code and the review archive together.
