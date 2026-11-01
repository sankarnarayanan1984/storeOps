STATUS: APPROVED
APPROVED_AT: 2026-10-31T04:26:28Z
RUN_ID: 2026-10-30-bulk-status
SPRINTS: 4

# Spec: Shift handover bulk status update for activities (with staff, alerts, reports and programmes participation)

## Feature prompt
> @planner Add shift handover bulk update to activities.
>
> Outgoing shift staff need to close out their shift in one request instead of updating
> activities one by one. Add PATCH /api/activities/bulk-status (signed in) that marks
> several operational activities as DONE or BLOCKED in a single request.
>
> - Body: { ids: string[] (1–50, no duplicates), status: "DONE" | "BLOCKED", note?: string }.
> - Partial failure handling: process each id independently. One bad id must not fail the
>   others. Respond 200 with a per-id result (updated, or failed with the AppError code and
>   message — e.g. NOT_FOUND for an unknown id, INVALID_STATUS_TRANSITION for a DONE task,
>   FORBIDDEN for another store's task) and a summary count of updated and failed.
> - Staff can only bulk-update activities in their own store; REGIONAL_MANAGER can update any
>   store in their region.
> - Write an audit entry per updated task: task id, from-status, to-status, actor, the note,
>   and a handover batch id shared by all entries of the request. Expose the trail at
>   GET /api/activities/:id/audit.
> - Keep the event-bus contract: publish activity.status_changed for every task that changed,
>   so existing alerts (BLOCKED → INVENTORY/ESCALATION) and report metrics keep working, and
>   publish one activity.handover_completed event per request. The alerts module turns it
>   into a SHIFT_HANDOVER notification for the store's STORE_MANAGER listing how many tasks
>   were closed and how many were blocked.
> - Follow the StoreOps architecture rules and add tests that prove each rule, not just
>   status codes.

### Developer feedback applied in this revision
> CHANGE: programmer, staff and report modules are missing add it

## Goal
Outgoing shift staff close out their shift in one request: several activities move to DONE or BLOCKED at once, each change is audited under a shared handover batch id and **named actor** (resolved from staff), the store manager receives one SHIFT_HANDOVER summary naming who handed over, **reports** count handovers per store and region, and **programmes** keep a handover history of their own tasks so programme leads see what the last shift closed or blocked for their rollout. Store teams save time; managers, regional managers and programme leads each get the handover view they need.

## Scope
- **In:**
  - `PATCH /api/activities/bulk-status` (also via the `/api/tasks` alias) with per-id partial-failure results and a summary.
  - Store/region permission per id (own store for STORE_MANAGER, DEPARTMENT_LEAD, ASSOCIATE; own region for REGIONAL_MANAGER).
  - Activity audit trail inside the activities module, `GET /api/activities/:id/audit`; each entry carries `actorId` **and `actorName`** resolved through the existing type-only `StaffReader`.
  - `activity.status_changed` per changed task (existing payload, unchanged) and one new `activity.handover_completed` per request with ≥1 update, carrying per-store and per-programme groupings and `completedByName`.
  - **staff** participation: read-only through `StaffReader` — activities resolves the actor's display name; alerts resolves the store's active STORE_MANAGER recipients (existing `notifyStore`). No staff module file changes; staff state is never written.
  - **alerts**: subscriber turns `activity.handover_completed` into SHIFT_HANDOVER notifications per affected store, message names the actor.
  - **reports**: subscriber on `activity.handover_completed` adds three counters to its own read model — `handoversCompleted`, `handoverTasksClosed`, `handoverTasksBlocked` — per store and per region, visible on the existing `GET /api/reports/metrics/:scope/:id`.
  - **programmes**: new `programmes.subscribers.ts` subscribes to `activity.handover_completed` and records a handover entry per programme it owns; new `GET /api/programmes/:id/handovers` (signed in, caller's store enrolled).
- **Out:**
  - Audit entries for the existing single `PATCH /api/activities/:id`.
  - Bulk moves to TODO or IN_PROGRESS; bulk edits of priority/category/assignee.
  - Any write to staff data or any new staff endpoint (see Decisions needed #1).
  - Programme status changes driven by handovers (e.g. auto-completing a programme), programme membership changes.
  - Any new cross-module reader, transactional all-or-nothing mode, EMAIL delivery, UI pages.

## API changes
| Method | Path | Auth | Request | Success | Errors (status · code) |
|---|---|---|---|---|---|
| PATCH | `/api/activities/bulk-status` | Bearer, any active `StaffRole` | `{ ids: string[] (1–50, unique, non-empty), status: 'DONE' \| 'BLOCKED', note?: string (trimmed, 1–500) }` | 200 `{ batchId, status, results: Array<{ id, outcome: 'UPDATED', from, to } \| { id, outcome: 'FAILED', error: { code, message } }>, summary: { updated, failed } }` — results in request order | 400 `VALIDATION_ERROR` (body) · 401. Per-id failures are not HTTP errors: `results[].error.code` ∈ `NOT_FOUND`, `FORBIDDEN`, `INVALID_STATUS_TRANSITION` |
| GET | `/api/activities/:id/audit` | Bearer | — | 200 `{ data: TaskAuditEntry[] }` oldest first; `[]` if never bulk-updated | 404 `NOT_FOUND` · 401 |
| GET | `/api/reports/metrics/:scope/:id` (existing, response extended) | none (unchanged) | — | 200 existing `Metrics` **plus** `handoversCompleted`, `handoverTasksClosed`, `handoverTasksBlocked` (numbers, default 0) | unchanged |
| GET | `/api/programmes/:id/handovers` | Bearer | — | 200 `{ data: ProgrammeHandover[] }` oldest first; `[]` if none | 404 `NOT_FOUND` (unknown id, or caller's store not enrolled — same hiding rule as `POST /:id/members`) · 401 |

Per-id check order (activities service): (1) exists → else `NOT_FOUND`; (2) caller may act on its store → else `FORBIDDEN`; (3) `ALLOWED_TRANSITIONS[current].includes(status)` → else `INVALID_STATUS_TRANSITION` (already-in-target also fails). Caught `AppError`s are recorded as `{ code, message }`; non-`AppError` exceptions re-throw (500).

Route notes: `PATCH /bulk-status` registered before `PATCH /:id`; `GET /:id/audit` and `GET /:id/handovers` coexist with `GET /:id`.

## Types and events
- **activities** (`activities.types.ts`): `BULK_STATUSES`, `BulkStatus`, `BulkStatusInput`, `BulkStatusItemResult`, `BulkStatusResult` (as before); `TaskAuditEntry { id; activityId; batchId; from; to; actorId; actorName; note?; createdAt }` (`actorName` = `"<firstName> <lastName>"` from `StaffReader.getById(caller.id)`, resolved once per request); `ActivityAuditRepository` + `InMemoryActivityAuditRepository`.
- **New event** (`src/shared/events/domainEvents.ts`): `activity.handover_completed` — `ActivityHandoverCompletedEvent {`
  `batchId; completedBy; completedByName; note?; closedCount; blockedCount;`
  `stores: Array<{ storeId; regionId; closedCount; blockedCount; activityIds }>;`
  `programmes: Array<{ programmeId; storeId; closedCount; blockedCount; activityIds }>;` (updated tasks that have a `programmeId`, grouped by programmeId+storeId; `[]` if none)
  `occurredAt }` — publisher `ActivitiesService.bulkUpdateStatus` (once per request with ≥1 update, after all writes and `activity.status_changed` events) → consumers: alerts (S2), reports (S3), programmes (S4).
- **reports** (`reports.types.ts`): `MetricCounters` gains `handoversCompleted`, `handoverTasksClosed`, `handoverTasksBlocked`.
- **programmes** (`programmes.types.ts`): `ProgrammeHandover { batchId; programmeId; storeId; closedCount; blockedCount; activityIds; completedBy; completedByName; note?; occurredAt }`; `ProgrammesRepository` gains `appendHandover(record)` / `listHandovers(programmeId)`.
- Reused: `activity.status_changed` (one per UPDATED task, payload as in `ActivitiesService.update`); batch id `newId('hnd')`.

## Architecture notes
| Rule | How this feature complies |
|---|---|
| R1 module boundary | Each module imports only itself, `src/shared/**` and type-only `StaffReader`. Staff names reach alerts/reports/programmes only as event fields. No new reader for any module. Reports imports no module at all. |
| R2 event bus | alerts, reports and programmes react only by subscribing to `activity.handover_completed` in their own `<module>.subscribers.ts` (programmes gets a new subscribers file registered from `programmes/index.ts`) and change only their own state. Activities imports none of them. Payload carries ids/counts plus `completedByName` (a value, not a staff object). |
| R3 error contract | Reused codes only: `VALIDATION_ERROR`, `NOT_FOUND`, `FORBIDDEN`, `INVALID_STATUS_TRANSITION`. The programmes subscriber skips unknown programme ids without throwing (subscriber, not request path). No raw `Error`. |
| R4 layers | Routes: `parse`, `requireAuth`, one service call. Services: rules, audit/handover writes, events. Repositories store/clone only. Subscribers call only their own service (`notifyStore`, `recordHandover`, `recordHandoverMetrics`). |
| R5 reports read-only | Reports only builds its own counters from the event; publishes nothing; imports nothing (dependency-cruiser `reports-read-only`). |
| R6 composition root | No new `…ModuleDeps` fields needed (programmes already has `eventBus`; reports already has `eventBus`). `src/app.ts` touched only if the audit repository is injected. |

## Sprints
| Sprint | Goal | Modules | ACs |
|---|---|---|---|
| 1 | Bulk status endpoint, per-id results, store/region permission, audit trail with staff-resolved actor name, `activity.status_changed` per update, `activity.handover_completed` (stores + programmes groupings) declared and published | activities (+ shared events; staff via `StaffReader` only) | 8 |
| 2 | Alerts: SHIFT_HANDOVER notification per affected store's STORE_MANAGER naming the actor; regression proof that BLOCKED alerts and activity metrics still react to bulk updates | alerts | 5 |
| 3 | Reports: handover counters per store and region from `activity.handover_completed` | reports | 3 |
| 4 | Programmes: handover history per programme from `activity.handover_completed`, `GET /api/programmes/:id/handovers` | programmes | 4 |

## Assumptions
- **Feedback interpretation:** "programmer, staff and report modules are missing" is read as "programmes, staff and reports should take part in shift handover". Each gets a small read/event-driven role (above) within R1–R6; no module writes another's state. If the developer wanted something larger (e.g. staff-side handover history, programme progress changes), see Decisions needed.
- **Staff participates without code changes in `src/modules/staff/`:** its role is the existing `StaffReader` (actor name in activities, recipient resolution in alerts). If the developer expects a staff-module change, Decision #1.
- `createActivity` defaults to `storeId: 'store_001'`, `regionId: 'region_south'` (`validActivity`), regardless of who calls it; tasks in store_003 are created with overrides `{ storeId: 'store_003', regionId: 'region_north' }` and in store_002 with `{ storeId: 'store_002', regionId: 'region_south' }`. Tasks with a programme pass `programmeId` (activities does not validate it).
- Tests create their own tasks rather than reuse seeded `tsk_00x` (seeds: tsk_001/002/006 store_001, tsk_003/004/007 store_002, tsk_005/008 store_003) so state from other tests cannot leak in; programme tests rely on seeded `prg_001` (store_001), `prg_002` (store_001+002), `prg_004` (store_002).
- `NotFoundError`/`ForbiddenError` carry codes `NOT_FOUND`/`FORBIDDEN`.
- Already-in-target (e.g. BLOCKED → BLOCKED) is `FAILED` with `INVALID_STATUS_TRANSITION`, no audit, no event.
- `activity.handover_completed` is not published when every id fails, so no alert, no report counter and no programme record for an all-failed request.
- `GET /api/activities/:id/audit` requires sign-in but is not store-scoped (matches public `GET /api/activities/:id`).
- REGIONAL_MANAGER scope = stores whose `regionId` equals the caller's; ASSOCIATE and DEPARTMENT_LEAD may bulk-update their own store.
- Alert text: title `"Shift handover"`, message `"Shift handover by <completedByName>: <closed> closed, <blocked> blocked"`, `entityId` = batch id.
- Reports region counting: `handoversCompleted` +1 per batch per distinct region (a batch spanning store_001 and store_002 counts once for region_south); store scope +1 per store entry. Task counts are summed per scope. Existing counters are not changed by the handover event (no double counting with `activity.status_changed`).
- Programmes keeps handover records for any programme id it owns, regardless of programme status (a COMPLETED programme still gets the record — it is history); unknown programme ids in the payload are ignored. `GET /:id/handovers` returns records from all enrolled stores of the programme (programme-wide view) to any signed-in caller whose store is enrolled.
- S2-AC5 compares only `activitiesTotal`, `activitiesCompleted`, `activitiesBlocked` so the reports change in sprint 3 does not break it.
- Ids are processed sequentially in request order.

## Decisions needed from the developer
1. **Depth of staff involvement.** Planned: read-only via `StaffReader` (actor name resolved in activities and carried to alerts/programmes by the event; recipients resolved in alerts), no change to the staff module. Alternative (adds a sprint): staff subscribes to `activity.handover_completed` and exposes `GET /api/staff/me/handovers` from its own read model. Reply "staff: reader-only" (default) or "staff: add handover history".
2. **Programmes handover visibility.** Planned: any signed-in caller whose store is enrolled sees the programme's full handover history (all enrolled stores). Alternative: filter records to the caller's own store (REGIONAL_MANAGER sees their region). Default if no reply: as planned.
