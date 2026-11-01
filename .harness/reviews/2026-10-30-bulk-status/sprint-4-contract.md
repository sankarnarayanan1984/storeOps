SPRINT: 4
RUN_ID: 2026-10-30-bulk-status
SPEC: .harness/output/spec.md

# Sprint 4 contract: Programmes — handover history per programme

## Goal
The programmes module gets a new `programmes.subscribers.ts` (registered from `programmes/index.ts`) that subscribes to `activity.handover_completed` and, for each `programmes[]` entry whose `programmeId` exists in its own repository, appends a `ProgrammeHandover { batchId, programmeId, storeId, closedCount, blockedCount, activityIds, completedBy, completedByName, note?, occurredAt }` through `ProgrammesService.recordHandover(event)`. Unknown programme ids are skipped without throwing. Programme leads read the history at the new `GET /api/programmes/:id/handovers` (signed in; unknown id or caller's store not enrolled → 404 `NOT_FOUND`, same hiding rule as `POST /:id/members`), oldest first. Programme status, members and enrolments are never changed by this feature. Programmes imports nothing from activities; the only cross-module import stays the type-only `StaffReader`.

## Files in scope
The Generator may create or edit only these paths (plus tests for them and README tables):
- `src/modules/programmes/programmes.types.ts`
- `src/modules/programmes/programmes.repository.ts`
- `src/modules/programmes/programmes.service.ts`
- `src/modules/programmes/programmes.routes.ts`
- `src/modules/programmes/programmes.subscribers.ts` (new)
- `src/modules/programmes/index.ts`
- `tests/` — new test file(s) for this sprint, e.g. `tests/api/programmes.handovers.test.ts`

## Acceptance criteria
Setup convention as in sprint 1; tasks pass `programmeId` in `createActivity` overrides. Seeded programmes: `prg_001` (store_001), `prg_002` (store_001 + store_002), `prg_004` (store_002). Each test uses a fresh `createApp()` so handover lists start empty.

### S4-AC1 — Bulk handover records programme history for programme tasks only
- **GIVEN** Arun (stf_002, store_001, Arun Kumar) is signed in; A1 and A2 (TODO, `programmeId: 'prg_001'`) and A3 (TODO, no programme) exist in store_001
- **WHEN** Arun sends `PATCH /api/activities/bulk-status` `{ ids: [A1, A2, A3], status: 'DONE', note: 'Morning close' }` and then `GET /api/programmes/prg_001/handovers`
- **THEN** the bulk response is 200 with `summary.updated: 3`; the handovers response is 200 with exactly one entry `{ batchId: <response batchId>, programmeId: 'prg_001', storeId: 'store_001', closedCount: 2, blockedCount: 0, activityIds: [A1, A2], completedBy: 'stf_002', completedByName: 'Arun Kumar', note: 'Morning close' }` with ISO `occurredAt`; `GET /api/programmes/prg_001` still returns the same `status`, `members` and `enrolledStoreIds` as before the request

### S4-AC2 — Each programme sees only its own tasks from a mixed batch
- **GIVEN** Priya (stf_001, STORE_MANAGER, store_001) is signed in; A1 (TODO, `prg_001`) and A4 (IN_PROGRESS, `prg_002`) exist in store_001
- **WHEN** Priya sends `PATCH /api/activities/bulk-status` `{ ids: [A1, A4], status: 'BLOCKED' }`, then reads `GET /api/programmes/prg_001/handovers` and `GET /api/programmes/prg_002/handovers`
- **THEN** prg_001 has exactly one entry `{ closedCount: 0, blockedCount: 1, activityIds: [A1] }` and prg_002 exactly one `{ closedCount: 0, blockedCount: 1, activityIds: [A4] }`, both with the response `batchId`; `GET /api/programmes/prg_004/handovers` by Meera (stf_003, store_002) returns `data: []`

### S4-AC3 — Event-bus driven; unknown programme ids are ignored
- **GIVEN** a fresh app; Meera (stf_003, REGIONAL_MANAGER, store_002) is signed in
- **WHEN** a test publishes `activity.handover_completed` on the app's event bus with `{ batchId: 'hnd_prg', completedBy: 'stf_003', completedByName: 'Meera Iyer', closedCount: 2, blockedCount: 1, stores: [{ storeId: 'store_002', regionId: 'region_south', closedCount: 2, blockedCount: 1, activityIds: ['x1','x2','x3'] }], programmes: [{ programmeId: 'prg_004', storeId: 'store_002', closedCount: 1, blockedCount: 1, activityIds: ['x1','x2'] }, { programmeId: 'prg_999', storeId: 'store_002', closedCount: 1, blockedCount: 0, activityIds: ['x3'] }], occurredAt: <now> }`, awaits it, and Meera reads `GET /api/programmes/prg_004/handovers` and `GET /api/programmes/prg_002/handovers`
- **THEN** prg_004 has exactly one entry `{ batchId: 'hnd_prg', storeId: 'store_002', closedCount: 1, blockedCount: 1, activityIds: ['x1','x2'], completedByName: 'Meera Iyer' }`; prg_002 returns `data: []`; `GET /api/programmes/prg_999` is still 404 `NOT_FOUND` (no programme was created) and the bus error reporter received no error for this publish

### S4-AC4 — Handover history access rules
- **GIVEN** a fresh app; Vikram (stf_006, STORE_MANAGER, store_003) and Priya (stf_001, store_001) can sign in
- **WHEN** Vikram sends `GET /api/programmes/prg_001/handovers`; Priya sends `GET /api/programmes/prg_999/handovers`; an unauthenticated client sends `GET /api/programmes/prg_001/handovers`; Priya sends `GET /api/programmes/prg_001/handovers`
- **THEN** Vikram gets 404 with `code: 'NOT_FOUND'` (store_003 not enrolled in prg_001; thrown as `NotFoundError('Programme', 'prg_001')`); Priya gets 404 `NOT_FOUND` for prg_999; the unauthenticated request gets 401; Priya gets 200 with `data: []` for prg_001

## Error codes introduced
| Code | Class | Status | When |
|---|---|---|---|
| — (none new) | — | — | Reused: `NOT_FOUND` (`NotFoundError`, 404) for unknown programme or caller's store not enrolled; 401 from existing `requireAuth` |

## Events introduced or published
| Event | Payload | Published by | Consumed by |
|---|---|---|---|
| `activity.handover_completed` (from sprint 1) | see sprint 1 (uses `programmes[]`, `batchId`, `completedBy`, `completedByName`, `note`, `occurredAt`) | activities | **programmes** `programmes.subscribers.ts` (new file, new subscription) → `ProgrammesService.recordHandover(event)` |
| — | programmes publishes no new event | — | — |

## Definition of done
- `node .harness/scripts/run-checks.mjs` reports PASS for A1 A2 A3 B1 B2 C1 C5
- Every AC above has a test named with its id that asserts the THEN outcome
- Tests from sprints 1–3 still pass unchanged
