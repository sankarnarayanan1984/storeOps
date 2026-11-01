SPRINT: 1
ITERATION: 1
SELF_CHECK: ALL_MET

# Generator summary — sprint 1, iteration 1

## What changed
Added `PATCH /api/activities/bulk-status` (also via `/api/tasks`) that processes each id sequentially and independently (NOT_FOUND → FORBIDDEN → INVALID_STATUS_TRANSITION), returning per-id results in request order plus a summary. Each UPDATED task gets an audit entry (shared `hnd_` batch id, `actorId`, `actorName` resolved once per request via the injected `StaffReader`, optional note) and an `activity.status_changed` event; one `activity.handover_completed` event (stores + programmes groupings, `completedByName`) is published per request with ≥1 update. Added `GET /api/activities/:id/audit`. The audit repository is created in `activities/index.ts`, so `src/app.ts` is untouched.

## Files changed
| File | Layer | Change |
|---|---|---|
| src/shared/events/domainEvents.ts | events | `HandoverStoreGroup`, `HandoverProgrammeGroup`, `ActivityHandoverCompletedEvent`; `'activity.handover_completed'` in `DomainEvents` |
| src/modules/activities/activities.types.ts | types | `BULK_STATUSES`, `BulkStatus`, `BulkStatusInput`, `BulkStatusItemResult`, `BulkStatusResult`, `TaskAuditEntry` |
| src/modules/activities/activities.repository.ts | repository | `ActivityAuditRepository` + `InMemoryActivityAuditRepository` (clone in/out) |
| src/modules/activities/activities.service.ts | service | `bulkUpdateStatus`, private `applyBulkStatus`, `listAudit`, `groupByStore`/`groupByProgramme`; audit repo constructor param |
| src/modules/activities/activities.routes.ts | routes | `bulkStatusBody` zod schema; `PATCH /bulk-status` before `PATCH /:id`; `GET /:id/audit` (auth) |
| src/modules/activities/index.ts | wiring | injects `new InMemoryActivityAuditRepository()` |
| tests/api/activities.bulk-status.test.ts | test | new — S1-AC1..AC8 + auth/alias + BLOCKED grouping |
| tests/unit/activities.bulk-status.test.ts | test | new — stub `StaffReader` actorName; non-AppError re-throw |
| README.md | docs | endpoint rows (bulk-status, audit) and event row (`activity.handover_completed`) |

## Acceptance criteria self-check
| AC | Status (MET / PARTIAL / NOT MET) | Implementation (path:line) | Test (path:line — assertion) |
|---|---|---|---|
| S1-AC1 | MET | src/modules/activities/activities.service.ts:141; activities.routes.ts:71 | tests/api/activities.bulk-status.test.ts:44 — results/summary/batchId `hnd_`, both read back DONE |
| S1-AC2 | MET | src/modules/activities/activities.service.ts:141-157, 186-198 | tests/api/activities.bulk-status.test.ts:66 — request-order results, codes NOT_FOUND/INVALID_STATUS_TRANSITION ×2, non-empty messages, summary 1/3, read-backs |
| S1-AC3 | MET | src/modules/activities/activities.service.ts:192 | tests/api/activities.bulk-status.test.ts:95 — B1 FORBIDDEN, A1 UPDATED, B1 still TODO, B1 audit `[]` |
| S1-AC4 | MET | src/modules/activities/activities.service.ts:190-192 (REGION_SCOPED_ROLES) | tests/api/activities.bulk-status.test.ts:112 — A1 UPDATED, B1 FORBIDDEN, read-backs |
| S1-AC5 | MET | src/modules/activities/activities.routes.ts:40 | tests/api/activities.bulk-status.test.ts:129 — 5 bodies → 400 VALIDATION_ERROR, A1 TODO, audit `[]` |
| S1-AC6 | MET | src/modules/activities/activities.service.ts:144, 202 | tests/api/activities.bulk-status.test.ts:163 — one entry each, actorName 'Arun Kumar', shared batchId, id + ISO createdAt; tests/unit/activities.bulk-status.test.ts:42 — stub reader → 'Test Actor' |
| S1-AC7 | MET | src/modules/activities/activities.service.ts:132 (→ getById NotFoundError line 45); routes.ts:58 | tests/api/activities.bulk-status.test.ts:202 — 404 NOT_FOUND "Activity 'tsk_999' not found", 401 UNAUTHORIZED |
| S1-AC8 | MET | src/modules/activities/activities.service.ts:161, 213 | tests/api/activities.bulk-status.test.ts:213 — 2 status_changed (none for A3), 1 handover_completed with full payload incl. stores/programmes, ISO occurredAt; all-failed request publishes neither |

## Events and error codes
- Published: `activity.handover_completed` at src/modules/activities/activities.service.ts:161 — consumed: none yet (alerts S2, reports S3, programmes S4)
- Published: `activity.status_changed` at src/modules/activities/activities.service.ts:213 — consumed by existing alerts and reports subscribers
- Error codes thrown: `FORBIDDEN` at activities.service.ts:192; `INVALID_STATUS_TRANSITION` at activities.service.ts:194-197; `NOT_FOUND` via `getById` at activities.service.ts:45; `VALIDATION_ERROR` via `parse()` at activities.routes.ts:72. Non-AppError per-item failures re-throw at activities.service.ts:154. No new codes.

## Automated checks (local run of run-checks.mjs)
| Check | Result |
|---|---|
| A1 | PASS — 0 violations |
| A2 | PASS — 0 lint errors |
| A3 | PASS — 0 type errors |
| B1 | PASS — 133/133 tests |
| B2 | PASS — 99.09% lines overall |
| C1 | PASS — 36 protected files unchanged |
| C5 | PASS |

## Feedback addressed (iteration ≥ 2)
| Finding | Fix (path:line) |
|---|---|
| — | — |

## Known gaps
- None. Note: `actorName` lookup calls `StaffReader.getById(caller.id)` without a fallback; the caller is always an authenticated staff member, so a NOT_FOUND there would only arise if staff were deleted mid-request (surfaces as 404).
