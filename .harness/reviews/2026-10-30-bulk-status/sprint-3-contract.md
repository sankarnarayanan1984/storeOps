SPRINT: 3
RUN_ID: 2026-10-30-bulk-status
SPEC: .harness/output/spec.md

# Sprint 3 contract: Reports — handover counters from activity.handover_completed

## Goal
The reports module subscribes to `activity.handover_completed` in `reports.subscribers.ts` and updates only its own read model: `MetricCounters` gains `handoversCompleted`, `handoverTasksClosed`, `handoverTasksBlocked` (default 0), exposed by the existing `GET /api/reports/metrics/:scope/:id`. For each `stores[]` entry: store scope `handoversCompleted` +1, `handoverTasksClosed` +closedCount, `handoverTasksBlocked` +blockedCount. For each **distinct** `regionId` in `stores[]`: region scope `handoversCompleted` +1 and task counts summed over that region's entries. The handover event never changes `activitiesTotal`/`activitiesCompleted`/`activitiesBlocked` (those stay driven by `activity.status_changed`). Reports imports no other module and publishes nothing (R5). No other module changes.

## Files in scope
The Generator may create or edit only these paths (plus tests for them and README tables):
- `src/modules/reports/reports.types.ts`
- `src/modules/reports/reports.repository.ts`
- `src/modules/reports/reports.service.ts`
- `src/modules/reports/reports.subscribers.ts`
- `tests/` — new test file(s) for this sprint, e.g. `tests/api/reports.handover.test.ts`

## Acceptance criteria
Setup convention as in sprint 1. Metrics are read before and after the action; assertions are on deltas (D = after − before) because the app's read model accumulates across a test file.

### S3-AC1 — A bulk handover bumps store and region handover counters without double counting
- **GIVEN** Arun (stf_002, store_001) is signed in, A1 (TODO), A2 (IN_PROGRESS) and A3 (TODO) exist in store_001; `GET /api/reports/metrics/store/store_001` and `/region/region_south` are recorded
- **WHEN** Arun sends `PATCH /api/activities/bulk-status` `{ ids: [A1, A2], status: 'DONE' }` then `{ ids: [A3], status: 'BLOCKED' }`, and both metrics are read again
- **THEN** both bulk responses are 200; for store_001 and for region_south: D`handoversCompleted` = 2, D`handoverTasksClosed` = 2, D`handoverTasksBlocked` = 1, D`activitiesCompleted` = 2 and D`activitiesBlocked` = 1 (from `activity.status_changed` only — not 4 and 2), D`activitiesTotal` = 0

### S3-AC2 — Multi-store event counts once per region (event-bus driven)
- **GIVEN** metrics for `store/store_001`, `store/store_002`, `store/store_003`, `region/region_south`, `region/region_north` are recorded
- **WHEN** a test publishes `activity.handover_completed` on the app's event bus with `{ batchId: 'hnd_rpt', completedBy: 'stf_003', completedByName: 'Meera Iyer', closedCount: 4, blockedCount: 2, stores: [{ storeId: 'store_001', regionId: 'region_south', closedCount: 2, blockedCount: 0, activityIds: ['x1','x2'] }, { storeId: 'store_002', regionId: 'region_south', closedCount: 1, blockedCount: 1, activityIds: ['x3','x4'] }, { storeId: 'store_003', regionId: 'region_north', closedCount: 1, blockedCount: 1, activityIds: ['x5','x6'] }], programmes: [], occurredAt: <now> }`, awaits it, and reads the metrics again
- **THEN** deltas are: store_001 `{ handoversCompleted: 1, handoverTasksClosed: 2, handoverTasksBlocked: 0 }`; store_002 `{ 1, 1, 1 }`; store_003 `{ 1, 1, 1 }`; region_south `{ handoversCompleted: 1, handoverTasksClosed: 3, handoverTasksBlocked: 1 }`; region_north `{ 1, 1, 1 }`; and every `activities*` field delta is 0 for all five scopes

### S3-AC3 — No change for an all-failed request; zero defaults for unseen scopes
- **GIVEN** Arun (stf_002, store_001) is signed in, A3 (DONE) exists in store_001, and `GET /api/reports/metrics/store/store_001` is recorded
- **WHEN** Arun sends `PATCH /api/activities/bulk-status` `{ ids: [A3, 'tsk_999'], status: 'DONE' }`, store_001 metrics are read again, and `GET /api/reports/metrics/store/store_999` is read
- **THEN** the bulk response is 200 with `summary.updated: 0`; every store_001 field delta is 0; the store_999 response is 200 with `handoversCompleted: 0`, `handoverTasksClosed: 0`, `handoverTasksBlocked: 0` alongside the existing zero counters

## Error codes introduced
| Code | Class | Status | When |
|---|---|---|---|
| — (none) | — | — | Existing metrics route unchanged (400 `VALIDATION_ERROR` for an unknown scope stays as is) |

## Events introduced or published
| Event | Payload | Published by | Consumed by |
|---|---|---|---|
| `activity.handover_completed` (from sprint 1) | see sprint 1 | activities | **reports** `reports.subscribers.ts` (new subscription) → `ReportsService.recordHandover(event)` |
| — | reports publishes nothing | — | — |

## Definition of done
- `node .harness/scripts/run-checks.mjs` reports PASS for A1 A2 A3 B1 B2 C1 C5 (dependency-cruiser `reports-read-only` included)
- Every AC above has a test named with its id that asserts the THEN outcome
- Sprint 2's S2-AC5 test still passes unchanged
