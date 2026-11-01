SPRINT: 2
RUN_ID: 2026-10-30-bulk-status
SPEC: .harness/output/spec.md

# Sprint 2 contract: SHIFT_HANDOVER notifications from activity.handover_completed

## Goal
The alerts module subscribes to `activity.handover_completed` (declared and published in sprint 1) and, for each entry in the payload's `stores`, sends one IN_APP `SHIFT_HANDOVER` notification to every active STORE_MANAGER of that store via `AlertsService.notifyStore` (recipients resolved through the existing type-only `StaffReader` — the staff module's participation here), titled `"Shift handover"` with message `"Shift handover by <completedByName>: <closedCount> closed, <blockedCount> blocked"`, `sourceEvent: 'activity.handover_completed'`, `entityId` = `batchId`. The sprint also proves through HTTP that bulk updates keep the existing `activity.status_changed` consumers (BLOCKED alerts, activity report metrics) working. Activities code is not changed in this sprint.

## Files in scope
The Generator may create or edit only these paths (plus tests for them and README tables):
- `src/modules/alerts/alerts.subscribers.ts`
- `src/modules/alerts/alerts.service.ts` (only if a dedicated `notifyHandover` helper is wanted; must delegate to `notifyStore`)
- `src/modules/alerts/index.ts` (only if subscriber registration needs it)
- `tests/` — new test file(s) for this sprint, e.g. `tests/api/alerts.shift-handover.test.ts`

## Acceptance criteria
Setup convention as in sprint 1: A-tasks are created with `createActivity` in store_001 (default), B-tasks with overrides `{ storeId: 'store_003', regionId: 'region_north' }`, moved with `setStatus` where a start status is stated.

### S2-AC1 — Store manager receives one SHIFT_HANDOVER summary naming the actor
- **GIVEN** Arun (stf_002, ASSOCIATE, store_001, Arun Kumar) is signed in, A1 (TODO) and A2 (IN_PROGRESS) exist in store_001, and Priya (stf_001) is the only active STORE_MANAGER of store_001
- **WHEN** Arun sends `PATCH /api/activities/bulk-status` with `{ ids: [A1, A2], status: 'BLOCKED' }`
- **THEN** the response is 200 with `summary.updated: 2`, and Priya's `GET /api/alerts?type=SHIFT_HANDOVER` returns exactly one notification with `type: 'SHIFT_HANDOVER'`, `channel: 'IN_APP'`, `status: 'UNREAD'`, `storeId: 'store_001'`, `sourceEvent: 'activity.handover_completed'`, `entityId` equal to the response `batchId`, `title: 'Shift handover'`, `message: 'Shift handover by Arun Kumar: 0 closed, 2 blocked'`; Arun's and Kavya's (stf_005) `GET /api/alerts?type=SHIFT_HANDOVER` return `data: []`

### S2-AC2 — Closed and blocked counts for a DONE batch
- **GIVEN** Kavya (stf_005, DEPARTMENT_LEAD, store_001, Kavya Reddy) is signed in, A1 (TODO), A2 (IN_PROGRESS) and A3 (BLOCKED) exist in store_001
- **WHEN** Kavya sends `PATCH /api/activities/bulk-status` with `{ ids: [A1, A2, A3], status: 'DONE', note: 'Evening close' }`
- **THEN** the response is 200 with `summary.updated: 3`, and Priya's `GET /api/alerts?type=SHIFT_HANDOVER` contains exactly one notification whose `entityId` is the response `batchId` and whose `message` is `'Shift handover by Kavya Reddy: 3 closed, 0 blocked'`

### S2-AC3 — Regional batch notifies each store's manager with its own counts (event-bus driven)
- **GIVEN** Priya (stf_001) manages store_001 and Vikram (stf_006) manages store_003; a test publishes `activity.handover_completed` on the app's event bus with `{ batchId: 'hnd_test', completedBy: 'stf_003', completedByName: 'Meera Iyer', closedCount: 3, blockedCount: 1, stores: [{ storeId: 'store_001', regionId: 'region_south', closedCount: 2, blockedCount: 0, activityIds: ['x1','x2'] }, { storeId: 'store_003', regionId: 'region_north', closedCount: 1, blockedCount: 1, activityIds: ['x3','x4'] }], programmes: [], occurredAt: <now> }`
- **WHEN** the publish is awaited and Priya and Vikram each call `GET /api/alerts?type=SHIFT_HANDOVER`
- **THEN** Priya has exactly one notification `{ entityId: 'hnd_test', storeId: 'store_001', message: 'Shift handover by Meera Iyer: 2 closed, 0 blocked' }` and Vikram has exactly one `{ entityId: 'hnd_test', storeId: 'store_003', message: 'Shift handover by Meera Iyer: 1 closed, 1 blocked' }` — the reaction is driven by the event bus (FM4), not by a direct call from activities

### S2-AC4 — No handover notification when every id fails
- **GIVEN** Arun (stf_002, store_001) is signed in and A3 (DONE) exists in store_001
- **WHEN** Arun sends `PATCH /api/activities/bulk-status` with `{ ids: [A3, 'tsk_999'], status: 'DONE' }`
- **THEN** the response is 200 with `summary` = `{ updated: 0, failed: 2 }`, and Priya's `GET /api/alerts?type=SHIFT_HANDOVER` returns `data: []` (no `activity.handover_completed` was published)

### S2-AC5 — Existing status_changed consumers still react to bulk updates
- **GIVEN** Priya (stf_001, store_001) is signed in; A1 and A2 are identical TODO tasks in store_001 (`category: 'RESTOCKING'`, `priority: 'CRITICAL'`); the body of `GET /api/reports/metrics/store/store_001` is recorded as M0
- **WHEN** Priya moves A1 to BLOCKED with the existing `PATCH /api/activities/A1` `{ status: 'BLOCKED' }` and the report is recorded as M1; then she sends `PATCH /api/activities/bulk-status` `{ ids: [A2], status: 'BLOCKED' }` and the report is recorded as M2; then she reads `GET /api/alerts`
- **THEN** the bulk response is 200 with A2 `UPDATED`; Priya has a notification with `type: 'INVENTORY'`, `sourceEvent: 'activity.status_changed'`, `entityId: A2`, matching the one for `entityId: A1` (existing BLOCKED rule fired via `activity.status_changed`); and for each of `activitiesTotal`, `activitiesCompleted`, `activitiesBlocked`, M2 − M1 equals M1 − M0, with `activitiesBlocked` delta = 1 (activity metrics react to a bulk update exactly as to a single PATCH; handover counters added in sprint 3 are deliberately not compared)

## Error codes introduced
| Code | Class | Status | When |
|---|---|---|---|
| — (none) | — | — | Sprint 2 adds no HTTP paths or error codes |

## Events introduced or published
| Event | Payload | Published by | Consumed by |
|---|---|---|---|
| `activity.handover_completed` (from sprint 1) | see sprint 1 | activities | **alerts** `alerts.subscribers.ts` (new subscription) → `notifyStore({ type: 'SHIFT_HANDOVER', recipientRoles: ['STORE_MANAGER'], ... })` per `stores[]` entry |
| `activity.status_changed` (existing) | unchanged | activities | alerts, reports (existing; regression-tested only) |

## Definition of done
- `node .harness/scripts/run-checks.mjs` reports PASS for A1 A2 A3 B1 B2 C1 C5
- Every AC above has a test named with its id that asserts the THEN outcome
