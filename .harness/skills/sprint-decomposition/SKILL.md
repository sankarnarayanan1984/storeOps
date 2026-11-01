# Skill: sprint-decomposition

**Purpose:** how the Planner turns one StoreOps feature request into `spec.md` and testable sprint contracts. Read by the Planner only.

## 1. Sizing a sprint
A sprint is the unit the Generator implements and the Evaluator judges in one pass. Draw boundaries so each sprint:
- is **independently green**: `npm run check` passes at the end of it, with no stubs that later sprints must fill in;
- changes **at most two modules** plus `src/shared/` and `src/app.ts`;
- has **3–8 acceptance criteria** (more means split; fewer than 3 usually means merge);
- puts **producer before consumer**: the sprint that publishes a new event comes before (or is the same as) the sprint that subscribes to it.

Typical StoreOps split for an endpoint + cross-module reaction:
| Sprint | Contains | Why the boundary is here |
|---|---|---|
| 1 | owning module: types, repository, service rules, route, tests, new event declared + published | one module, fully testable through HTTP |
| 2 | consumer module(s): subscriber, notification/report behaviour, tests through the bus | proves FM4 integration separately; failure here doesn't block sprint 1 |
| 3 (optional) | UI page / README / extra endpoints | non-core, cheap to retry |

Do not create a sprint for "write tests" or "refactor" — tests ship with the behaviour they prove.

## 2. Acceptance criteria: GIVEN / WHEN / THEN
Every AC has an id `S<sprint>-AC<n>` and three clauses. It is testable when **every clause names concrete StoreOps data** and the THEN names an observable outcome a supertest test can assert.

| Clause | Must contain | Example |
|---|---|---|
| GIVEN | seeded ids/roles or explicit setup | "GIVEN Priya (stf_001, STORE_MANAGER, store_001) is signed in and tsk_001 and tsk_002 are TODO / IN_PROGRESS" |
| WHEN | exact method + path + body | "WHEN she sends PATCH /api/activities/bulk-status with `{ ids: ['tsk_001','tsk_002'], status: 'DONE' }`" |
| THEN | status code **and** body/state/event, error `code` for failures | "THEN the response is 200 with `updated: ['tsk_001','tsk_002']`, both tasks read back as DONE, and one `activity.status_changed` event is published per task" |

Rules:
- A THEN with only a status code is rejected (FM3). Add the state read-back or the body field.
- Each error path is its own AC with the `AppError` class and `code` (e.g. 409 `INVALID_STATUS_TRANSITION`).
- Any AC touching another module's behaviour states the **event name** that carries it (FM4).
- Forbidden words in ACs: "appropriate", "correctly", "properly", "should handle", "etc." — replace with the concrete value.
- Permissions are explicit: list which `StaffRole`s succeed and which get 403.

## 3. What goes in spec.md (template: `.harness/templates/spec.md`)
First line exactly `STATUS: AWAITING APPROVAL`. Then: the feature prompt verbatim (quote `PROMPT.md`), goal, in/out of scope, API changes (method, path, request, response, errors), new types/events, architecture notes (which rules R1–R6 the feature touches and how it stays compliant), sprint table, open questions/assumptions. If the feature would need an architecture exception (e.g. a new cross-module reader), it goes under **Decisions needed** — never silently.

## 4. What goes in sprint-N-contract.md (template: `.harness/templates/sprint-contract.md`)
Header markers, the sprint goal, **files in scope** (paths the Generator may create/edit), the ACs, the definition of done (`node .harness/scripts/run-checks.mjs` all PASS), and the event/error codes introduced. The contract is the only thing the Generator implements — anything not in it is out of scope.

## 5. Self-check before writing AWAITING APPROVAL
- [ ] Every AC has GIVEN/WHEN/THEN with concrete ids and an observable THEN beyond the status code
- [ ] Every error path has a code; every cross-module effect names its event
- [ ] Sprint 1 is green on its own; consumers come after producers
- [ ] Files-in-scope lists respect module boundaries (no file of module B in a sprint whose ACs are about module A unless it's a subscriber)
- [ ] No protected file appears in any files-in-scope list
