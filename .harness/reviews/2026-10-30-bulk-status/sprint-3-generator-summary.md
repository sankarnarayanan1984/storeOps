SPRINT: 3
ITERATION: 1
SELF_CHECK: ALL_MET

# Generator summary — sprint 3, iteration 1

## What changed
Reports now subscribes to `activity.handover_completed` and maintains three new counters (`handoversCompleted`, `handoverTasksClosed`, `handoverTasksBlocked`, default 0) in its own read model, exposed through the existing metrics endpoint. Each store group bumps its store scope; region scopes are aggregated per distinct `regionId` so a batch counts once per region with summed task counts. Activity counters are untouched by the handover event (still driven by `activity.status_changed`). Reports still imports no other module and publishes nothing.

## Files changed
| File | Layer | Change |
|---|---|---|
| src/modules/reports/reports.types.ts | types | `MetricCounters` gains the three handover counters |
| src/modules/reports/reports.repository.ts | repository | zero defaults for the new counters in `emptyCounters()` |
| src/modules/reports/reports.service.ts | service | `recordHandover(event)` + private `addHandover` (per store, per distinct region) |
| src/modules/reports/reports.subscribers.ts | subscribers | subscribes `activity.handover_completed` → `service.recordHandover` |
| tests/api/reports.handover.test.ts | test | new: S3-AC1..AC3 |
| tests/api/reports.test.ts | test | zeroed-metrics `toEqual` updated with the three new zero fields |
| README.md | docs | metrics endpoint row and `activity.handover_completed` consumers row updated |

## Acceptance criteria self-check
| AC | Status (MET / PARTIAL / NOT MET) | Implementation (path:line) | Test (path:line — assertion) |
|---|---|---|---|
| S3-AC1 | MET | src/modules/reports/reports.service.ts:48; src/modules/reports/reports.subscribers.ts:8 | tests/api/reports.handover.test.ts:67-68 — store_001 and region_south deltas equal `{handoversCompleted:2, handoverTasksClosed:2, handoverTasksBlocked:1, activitiesCompleted:2, activitiesBlocked:1, activitiesTotal:0}` |
| S3-AC2 | MET | src/modules/reports/reports.service.ts:48-60 (distinct-region map) | tests/api/reports.handover.test.ts:107 — five scope deltas incl. region_south `{1,3,1}` and all `activities*`/`programmesEnrolled` deltas 0 |
| S3-AC3 | MET | src/modules/reports/reports.repository.ts:13-15 (defaults); no event when 0 updates (activities, sprint 1) | tests/api/reports.handover.test.ts:129 — all store_001 deltas 0; :131 — store_999 returns zeroed handover counters |

## Events and error codes
- Published: none by reports (R5).
- Consumed: `activity.handover_completed` at src/modules/reports/reports.subscribers.ts:8 → `ReportsService.recordHandover` at src/modules/reports/reports.service.ts:48
- Error codes thrown: none introduced.

## Automated checks (local run of run-checks.mjs)
| Check | Result |
|---|---|
| A1 | PASS (0 violations, 46 modules) |
| A2 | PASS (0 lint errors) |
| A3 | PASS (0 type errors) |
| B1 | PASS (141/141 tests) |
| B2 | PASS (99.11% lines overall) |
| C1 | PASS (36 protected files unchanged) |
| C5 | PASS |

## Feedback addressed (iteration ≥ 2)
| Finding | Fix (path:line) |
|---|---|
| n/a (iteration 1) | — |

## Known gaps
- none. Note: existing `tests/api/reports.test.ts` zeroed-metrics test was extended (not weakened) because the response shape grew per the spec.
