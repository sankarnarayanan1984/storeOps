SPRINT: 4
ITERATION: 1
SELF_CHECK: ALL_MET

# Generator summary — sprint 4, iteration 1

## What changed
Programmes now subscribes to `activity.handover_completed` in a new `programmes.subscribers.ts` (registered from `programmes/index.ts`) and calls `ProgrammesService.recordHandover(event)`, which appends one `ProgrammeHandover` per `programmes[]` group whose programme exists in its own repository (unknown ids skipped, no throw). The new signed-in `GET /api/programmes/:id/handovers` returns the history oldest first, hiding unknown/non-enrolled programmes as 404 `NOT_FOUND`. Programme status, members and enrolments are never written; programmes imports nothing from activities.

## Files changed
| File | Layer | Change |
|---|---|---|
| src/modules/programmes/programmes.types.ts | types | `ProgrammeHandover` interface |
| src/modules/programmes/programmes.repository.ts | repository | `appendHandover` / `listHandovers` (interface + in-memory, cloned) |
| src/modules/programmes/programmes.service.ts | service | `listHandovers(id, caller)` (NotFound hiding rule), `recordHandover(event)` |
| src/modules/programmes/programmes.routes.ts | routes | `GET /:id/handovers` (auth, one service call) |
| src/modules/programmes/programmes.subscribers.ts | subscribers | new; `activity.handover_completed` → `recordHandover` |
| src/modules/programmes/index.ts | wiring | `registerProgrammesSubscribers(deps.eventBus, service)` |
| tests/api/programmes.handovers.test.ts | tests | new; S4-AC1..AC4 |
| README.md | docs | endpoint row for `/api/programmes/:id/handovers`; programmes added as consumer of `activity.handover_completed` |

## Acceptance criteria self-check
| AC | Status | Implementation (path:line) | Test (path:line — assertion) |
|---|---|---|---|
| S4-AC1 | MET | src/modules/programmes/programmes.subscribers.ts:6; programmes.service.ts:217 | tests/api/programmes.handovers.test.ts:59 — `summary.updated` 3, exact single entry via `toEqual` (batchId, counts, A1/A2 only, Arun Kumar, note, ISO occurredAt), programme status/members/enrolments unchanged |
| S4-AC2 | MET | programmes.service.ts:217 (per-group append) | tests/api/programmes.handovers.test.ts:85 — prg_001 → [A1], prg_002 → [A4], both blockedCount 1 and response batchId; prg_004 by Meera `[]` |
| S4-AC3 | MET | programmes.service.ts:217 (`if (!programme) continue`) | tests/api/programmes.handovers.test.ts:105 — direct bus publish; prg_004 single entry, prg_002 `[]`, prg_999 still 404 NOT_FOUND, error reporter received nothing |
| S4-AC4 | MET | programmes.service.ts:206; programmes.routes.ts:49 | tests/api/programmes.handovers.test.ts:139 — Vikram 404 NOT_FOUND, prg_999 404 NOT_FOUND, anonymous 401, Priya `[]` |

## Events and error codes
- Published: none new. Consumed: `activity.handover_completed` at src/modules/programmes/programmes.subscribers.ts:6
- Error codes thrown: `NOT_FOUND` (`NotFoundError('Programme', id)`) at src/modules/programmes/programmes.service.ts:209 and via `getProgramme`; 401 from existing `requireAuth`

## Automated checks (local run of run-checks.mjs)
| Check | Result |
|---|---|
| A1 | PASS (0 violations) |
| A2 | PASS (0 lint errors) |
| A3 | PASS (0 type errors) |
| B1 | PASS (145/145) |
| B2 | PASS (99.14% lines overall) |
| C1 | PASS (protected files unchanged) |
| C5 | PASS |

## Feedback addressed (iteration ≥ 2)
| Finding | Fix (path:line) |
|---|---|
| — | — |

## Known gaps
- none
