# StoreOps API

REST API for retail store operations management — the reference codebase for the capstone in
[docs/capstone-brief.md](docs/capstone-brief.md). TypeScript (strict), Express 5, zod, in-memory storage with mock data.

> **Capstone reference codebase — do not use in production.** Data and sessions live in memory and reset on restart; demo accounts share a published password.

```bash
npm install
npm run dev          # http://localhost:3000 (PORT to override), reloads on change
npm run check        # tsc --noEmit + eslint + dependency-cruiser + jest --coverage (all must pass)
docker compose up --build   # build and run the container on :3000 (see DEPLOYMENT.md)
npm run deploy:azure        # deploy to Azure Container Apps (needs az login; see DEPLOYMENT.md)
```

UI pages: `/activities`, `/programmes`, `/staff`. Every seeded account's password is `StoreOps@123`
(e.g. `priya.nair@storeops.example`, store manager of `store_001`).

## Modules (brief §3.3)

| Module | Key types |
|---|---|
| activities | `Task`, `TaskStatus` (TODO \| IN_PROGRESS \| DONE \| BLOCKED), `TaskPriority` (LOW \| MEDIUM \| HIGH \| CRITICAL), `TaskCategory` (RESTOCKING \| PLANOGRAM \| AUDIT \| COMPLIANCE \| GENERAL) |
| programmes | `Project`, `ProjectMember`, `ProjectRole` (STORE_MANAGER \| DEPARTMENT_LEAD \| ASSOCIATE), `ProjectType`, `ProjectStatus` |
| staff | `User`, `UserProfile`, `StaffRole` (REGIONAL_MANAGER \| STORE_MANAGER \| DEPARTMENT_LEAD \| ASSOCIATE), `AuthToken` |
| alerts | `Notification`, `NotificationChannel` (IN_APP \| EMAIL), `NotificationStatus` (UNREAD \| READ), `AlertType` (INVENTORY \| SLA_BREACH \| SHIFT_HANDOVER \| ESCALATION) |
| reports | `Report`, `ReportType` (STORE_SUMMARY \| REGIONAL_ROLLUP \| DEPARTMENT_PERFORMANCE), `ReportStatus` (PENDING \| READY \| FAILED), store/region metrics |

## Endpoints

🔒 = needs `Authorization: Bearer <token>` from `POST /api/staff/auth/login`.

### Base API surface (brief §3.6)

| # | Method | Path | Module | Notes |
|---|---|---|---|---|
| 1 | GET | `/api/activities` | activities | Filters: `programmeId`, `status`, `storeId`, `priority`, `category`, `assigneeId` |
| 2 | POST | `/api/activities` 🔒 | activities | Creates a TODO task owned by the caller; emits `activity.created` |
| 3 | GET | `/api/activities/:id` | activities | |
| 4 | PATCH | `/api/activities/:id` 🔒 | activities | `status`, `priority`, `category`, `assigneeId` (null unassigns); status transitions enforced; emits `activity.status_changed` |
| 5 | DELETE | `/api/activities/:id` 🔒 | activities | Owner, or a STORE_MANAGER of the task's store; emits `activity.deleted` |
| 6 | GET | `/api/programmes` 🔒 | programmes | Programmes of the caller's store; filters `type`, `status`, `staffId` |
| 7 | POST | `/api/programmes` 🔒 | programmes | STORE_MANAGER / REGIONAL_MANAGER; enrols the caller's store; emits `programme.created` |
| 8 | POST | `/api/programmes/:id/members` 🔒 | programmes | Membership rules in `programmes.service.ts`; emits `programme.member_added` |
| 9 | GET | `/api/alerts` 🔒 | alerts | The caller's notifications; filters `status`, `type` |

### Additional endpoints

| Method | Path | Notes |
|---|---|---|
| GET | `/api/tasks` | Alias of `/api/activities` (deployment smoke check) |
| PATCH | `/api/activities/bulk-status` 🔒 | Shift handover: `{ ids (1–50, unique), status: DONE \| BLOCKED, note? }`; per-id results (`UPDATED` / `FAILED` with `NOT_FOUND`, `FORBIDDEN`, `INVALID_STATUS_TRANSITION`) + summary; own store (REGIONAL_MANAGER: own region); audits each update; emits `activity.status_changed` per update and one `activity.handover_completed` |
| GET | `/api/activities/:id/audit` 🔒 | Bulk-status audit trail (batch id, from/to, actor id and name, note), oldest first |
| GET | `/api/programmes/:id`, `/api/programmes/:id/members` | Members joined to staff records |
| GET | `/api/programmes/:id/handovers` 🔒 | Shift handover history of the programme (batch id, store, closed/blocked counts, activity ids, completed by, note), oldest first; 404 `NOT_FOUND` if unknown or the caller's store is not enrolled |
| PATCH / DELETE | `/api/programmes/:id/members/:staffId` | Change role / remove (emits `programme.member_removed`) |
| POST | `/api/programmes/:id/enrolments` | Enrol a store; emits `programme.store_enrolled` |
| POST | `/api/alerts/:id/read` 🔒 | Mark own notification read |
| GET | `/api/staff`, `/api/staff/:id` | Staff list (filters `role`, `storeId`, `regionId`, `active`) / one staff member |
| POST / PATCH | `/api/staff`, `/api/staff/:id` | Register / edit staff |
| POST | `/api/staff/auth/login`, `/api/staff/auth/logout` 🔒 | Bearer tokens, 8-hour expiry |
| GET / PATCH | `/api/staff/me` 🔒 | Own profile; `POST /api/staff/me/password` changes password |
| GET | `/api/reports/metrics/:scope/:id` | `scope` is `store` or `region`; built from events; includes `handoversCompleted`, `handoverTasksClosed`, `handoverTasksBlocked` (from `activity.handover_completed`; a region counts a batch once) |

Errors always have the shape `{ "error": { "code", "message", "details?" } }`.

## Events

| Event | Published by | Consumed by |
|---|---|---|
| `activity.created` | activities | reports |
| `activity.status_changed` | activities | reports; alerts (BLOCKED → INVENTORY for restocking, else ESCALATION, to the store's managers) |
| `activity.deleted` | activities | reports |
| `activity.handover_completed` | activities (`PATCH /api/activities/bulk-status`, once per request with ≥1 update) | alerts (one SHIFT_HANDOVER summary per store in the batch, to that store's managers, with the store's closed/blocked counts); reports (handover counters per store and per distinct region); programmes (appends a handover record to each known programme in `programmes[]`; unknown ids skipped) |
| `programme.created`, `programme.store_enrolled` | programmes | reports |
| `programme.member_added`, `programme.member_removed` | programmes | — (available for future subscribers) |

## Structure

```
src/
  app.ts                  composition root — the only file that wires modules together
  server.ts
  shared/
    errors.ts             AppError → ValidationError | UnauthorizedError | ForbiddenError | NotFoundError | ConflictError | InternalError
    events/               domain event contracts + InMemoryEventBus
    http/                 zod validation, bearer auth (requireAuth/currentUser), 404 + error middleware
  modules/<name>/
    <name>.routes.ts      HTTP layer: parse/validate input, call service
    <name>.service.ts     business rules, throws AppError subclasses, publishes events
    <name>.repository.ts  interface + in-memory implementation
    <name>.seed.ts        mock data
    <name>.subscribers.ts (alerts, reports) event handlers
    index.ts              module factory
public/                   static UI pages (+ auth.js sign-in helper)
```

## Architecture rules (brief §3.5) and where they are enforced

| Rule | Enforced by |
|---|---|
| No cross-module repository imports; only the type-only `staff.reader.ts` may cross modules | dependency-cruiser (`.dependency-cruiser.cjs`), ESLint `no-restricted-imports`, `tests/architecture.test.ts` |
| Cross-module side effects only through the event bus (no direct `AlertsService`/`ReportsService` imports) | dependency-cruiser `no-direct-service-imports` |
| No raw `Error` throws — use the `AppError` hierarchy | ESLint `no-restricted-syntax`, `tests/architecture.test.ts` |
| Routes → Service → Repository per module | `tests/architecture.test.ts` (layer files exist); review |
| Reports is read-only | dependency-cruiser `reports-read-only` (reports imports no other module) |
| No circular imports | dependency-cruiser, `tests/architecture.test.ts` |

Coverage thresholds (`jest.config.js`): services 80%, routes 70%, shared 60%, overall 70% lines.

## Development harness

Feature work is governed by a Planner → Generator ⇄ Evaluator → Monitor harness driven by `CLAUDE.md`. Start a run with `@planner <feature>` (see `PROMPT.md`), review `.harness/output/spec.md`, type `APPROVED`. Agents, skills, rubric and scripts live in `.harness/`; every sprint decision is archived in `.harness/reviews/`. Design rationale: `DESIGN_BRIEF.md`.
