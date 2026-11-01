SPRINT: 1
RUN_ID: 2026-10-30-bulk-status
SPEC: .harness/output/spec.md

# Sprint 1 contract: Bulk status endpoint, audit trail and handover event

## Goal
Add `PATCH /api/activities/bulk-status` to the activities module. Each id is processed independently and sequentially: existence (`NOT_FOUND`), store/region permission (`FORBIDDEN`), transition rule (`INVALID_STATUS_TRANSITION`). The caller's display name (`"<firstName> <lastName>"`) is resolved once per request through the injected type-only `StaffReader.getById` (staff participation; no staff file changes). Every UPDATED task gets an audit entry (with `actorId` and `actorName`) sharing one `batchId` and an `activity.status_changed` event; the request then publishes one `activity.handover_completed` event (only when ≥1 task was updated) carrying `completedByName`, per-store groups and per-programme groups. Add `GET /api/activities/:id/audit`. Declare the new event in `domainEvents.ts`. No other module changes.

## Files in scope
The Generator may create or edit only these paths (plus tests for them and README tables):
- `src/modules/activities/activities.types.ts`
- `src/modules/activities/activities.repository.ts`
- `src/modules/activities/activities.audit.repository.ts` (new, optional — may live in `activities.repository.ts` instead)
- `src/modules/activities/activities.service.ts`
- `src/modules/activities/activities.routes.ts`
- `src/modules/activities/index.ts`
- `src/shared/events/domainEvents.ts`
- `src/app.ts` (only if the audit repository is injected via `ActivitiesModuleDeps`)
- `tests/` — new test file(s) for this sprint, e.g. `tests/api/activities.bulk-status.test.ts`

## Acceptance criteria
Setup convention: tasks are created in the GIVEN with `createActivity(app, auth, overrides)` and moved with `setStatus(...)` where a non-TODO start is stated. `createActivity` defaults to store_001/region_south, so A-tasks use no store override; B-tasks (store_003) use overrides `{ storeId: 'store_003', regionId: 'region_north' }` and are created by Vikram (stf_006).

### S1-AC1 — Bulk DONE in own store
- **GIVEN** Arun (stf_002, ASSOCIATE, store_001) is signed in and A1 (TODO) and A2 (IN_PROGRESS) exist in store_001 (created by Priya, stf_001)
- **WHEN** Arun sends `PATCH /api/activities/bulk-status` with `{ ids: [A1, A2], status: 'DONE', note: 'End of morning shift' }`
- **THEN** the response is 200 with `status: 'DONE'`, a `batchId` starting `hnd`, `results` = `[{ id: A1, outcome: 'UPDATED', from: 'TODO', to: 'DONE' }, { id: A2, outcome: 'UPDATED', from: 'IN_PROGRESS', to: 'DONE' }]`, `summary` = `{ updated: 2, failed: 0 }`, and `GET /api/activities/A1` and `/A2` both return `status: 'DONE'`

### S1-AC2 — Partial failure: one bad id does not fail the others
- **GIVEN** Priya (stf_001, STORE_MANAGER, store_001) is signed in, A1 is TODO, A3 is DONE, A4 is BLOCKED, all in store_001
- **WHEN** she sends `PATCH /api/activities/bulk-status` with `{ ids: [A1, 'tsk_999', A3, A4], status: 'BLOCKED' }`
- **THEN** the response is 200 with results in request order: A1 `UPDATED` (TODO → BLOCKED); `tsk_999` `FAILED` with `error.code: 'NOT_FOUND'`; A3 `FAILED` with `error.code: 'INVALID_STATUS_TRANSITION'`; A4 `FAILED` with `error.code: 'INVALID_STATUS_TRANSITION'` (already BLOCKED); each failed `error.message` is a non-empty string; `summary` = `{ updated: 1, failed: 3 }`; A1 reads back BLOCKED, A3 still DONE, A4 still BLOCKED

### S1-AC3 — Another store's task is FORBIDDEN per id
- **GIVEN** Vikram (stf_006, STORE_MANAGER, store_003) created B1 (TODO, store_003) and Arun (stf_002, ASSOCIATE, store_001) is signed in with A1 (TODO, store_001)
- **WHEN** Arun sends `PATCH /api/activities/bulk-status` with `{ ids: [B1, A1], status: 'DONE' }`
- **THEN** the response is 200 with B1 `FAILED` and `error.code: 'FORBIDDEN'`, A1 `UPDATED` (TODO → DONE), `summary` = `{ updated: 1, failed: 1 }`, B1 still reads back TODO, and `GET /api/activities/B1/audit` returns `data: []`

### S1-AC4 — REGIONAL_MANAGER scope is the caller's region
- **GIVEN** Meera (stf_003, REGIONAL_MANAGER, store_002, region_south) is signed in, A1 (TODO, store_001, region_south) and B1 (TODO, store_003, region_north) exist
- **WHEN** Meera sends `PATCH /api/activities/bulk-status` with `{ ids: [A1, B1], status: 'DONE' }`
- **THEN** the response is 200 with A1 `UPDATED` (TODO → DONE) and B1 `FAILED` with `error.code: 'FORBIDDEN'`, `summary` = `{ updated: 1, failed: 1 }`; A1 reads back DONE and B1 reads back TODO

### S1-AC5 — Invalid body is rejected as a whole
- **GIVEN** Priya (stf_001) is signed in and A1 (TODO, store_001) exists
- **WHEN** she sends `PATCH /api/activities/bulk-status` with each of: `{ ids: [], status: 'DONE' }`; `{ ids: [A1, A1], status: 'DONE' }`; 51 distinct ids with `status: 'DONE'`; `{ ids: [A1], status: 'TODO' }`; `{ ids: [A1], status: 'DONE', note: <501 chars> }`
- **THEN** every response is 400 with `code: 'VALIDATION_ERROR'` (thrown as `ValidationError` via `parse()`), A1 still reads back TODO, and `GET /api/activities/A1/audit` returns `data: []`

### S1-AC6 — Audit entry per updated task with shared batch id and staff-resolved actor name
- **GIVEN** Arun (stf_002, store_001; seeded profile Arun Kumar) is signed in, A1 (TODO) and A2 (IN_PROGRESS) exist in store_001
- **WHEN** Arun sends `PATCH /api/activities/bulk-status` with `{ ids: [A1, A2, 'tsk_999'], status: 'BLOCKED', note: 'Stockroom locked' }` and then `GET /api/activities/A1/audit` and `GET /api/activities/A2/audit`
- **THEN** each audit response is 200 with exactly one entry in `data`: A1 `{ activityId: A1, from: 'TODO', to: 'BLOCKED', actorId: 'stf_002', actorName: 'Arun Kumar', note: 'Stockroom locked' }`, A2 `{ activityId: A2, from: 'IN_PROGRESS', to: 'BLOCKED', actorId: 'stf_002', actorName: 'Arun Kumar', note: 'Stockroom locked' }`; both entries' `batchId` equals the bulk response's `batchId`; each entry has `id` and ISO `createdAt`; `actorName` comes from the injected `StaffReader` (a unit test with a stub `StaffReader` returning profile `{ firstName: 'Test', lastName: 'Actor' }` yields `actorName: 'Test Actor'`)

### S1-AC7 — Audit trail of an unknown activity
- **GIVEN** Priya (stf_001) is signed in
- **WHEN** she sends `GET /api/activities/tsk_999/audit`
- **THEN** the response is 404 with `code: 'NOT_FOUND'` (thrown as `NotFoundError('Activity', 'tsk_999')`), and `GET /api/activities/tsk_999/audit` without a token returns 401

### S1-AC8 — Events: status_changed per update, one handover_completed per request with store and programme groups
- **GIVEN** a test subscriber on the app's event bus records `activity.status_changed` and `activity.handover_completed`; Arun (stf_002, store_001) is signed in; A1 (TODO, `programmeId: 'prg_001'`), A2 (IN_PROGRESS, no programme) and A3 (DONE) exist in store_001
- **WHEN** Arun sends `PATCH /api/activities/bulk-status` with `{ ids: [A1, A2, A3], status: 'DONE', note: 'Close' }`, then separately `{ ids: [A3, 'tsk_999'], status: 'DONE' }`
- **THEN** the first request publishes exactly two `activity.status_changed` events (A1 `from: 'TODO'`, A2 `from: 'IN_PROGRESS'`, both `to: 'DONE'`, `changedBy: 'stf_002'`, `storeId: 'store_001'`) and none for A3, plus exactly one `activity.handover_completed` with `batchId` = response `batchId`, `completedBy: 'stf_002'`, `completedByName: 'Arun Kumar'`, `note: 'Close'`, `closedCount: 2`, `blockedCount: 0`, `stores: [{ storeId: 'store_001', regionId: 'region_south', closedCount: 2, blockedCount: 0, activityIds: [A1, A2] }]`, `programmes: [{ programmeId: 'prg_001', storeId: 'store_001', closedCount: 1, blockedCount: 0, activityIds: [A1] }]`, ISO `occurredAt`; the second (all-failed) request publishes neither event

## Error codes introduced
| Code | Class | Status | When |
|---|---|---|---|
| — (none new) | — | — | Reused: `VALIDATION_ERROR` (`ValidationError`, 400) for body; `NOT_FOUND` (`NotFoundError`), `FORBIDDEN` (`ForbiddenError`), `INVALID_STATUS_TRANSITION` (`ConflictError`) as per-id result codes in the 200 body; `NOT_FOUND` 404 for audit of unknown id |

## Events introduced or published
| Event | Payload | Published by | Consumed by |
|---|---|---|---|
| `activity.handover_completed` (new) | `{ batchId, completedBy, completedByName, note?, closedCount, blockedCount, stores: [{ storeId, regionId, closedCount, blockedCount, activityIds }], programmes: [{ programmeId, storeId, closedCount, blockedCount, activityIds }], occurredAt }` | `ActivitiesService.bulkUpdateStatus`, once per request with ≥1 update, after all writes | alerts (S2), reports (S3), programmes (S4) |
| `activity.status_changed` (existing) | unchanged payload, `changedBy` = caller id | `ActivitiesService.bulkUpdateStatus`, once per UPDATED task after its repository write | alerts, reports (existing subscribers) |

## Definition of done
- `node .harness/scripts/run-checks.mjs` reports PASS for A1 A2 A3 B1 B2 C1 C5
- Every AC above has a test named with its id that asserts the THEN outcome
