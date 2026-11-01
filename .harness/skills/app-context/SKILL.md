# Skill: app-context

**Purpose:** the minimum every harness agent must know about StoreOps before acting. Read by all four agents. Kept short on purpose (≈1 page) because every agent pays for it on every invocation.

## What StoreOps is
A REST API for retail store operations: store teams run **programmes** (seasonal rollouts, compliance drives, refits), assign and track **activities** (restocking runs, planogram resets, audits, compliance checks), coordinate **staff**, receive **alerts**, and read **reports** by store and region. In-memory storage with mock data; no database.

Stack: TypeScript 5 (strict, `noUncheckedIndexedAccess`), Express 5, zod 3, Jest 29 + supertest, ESLint 9 + typescript-eslint, dependency-cruiser. Node 20+.

## Modules (src/modules/<name>/)
| Module | Owns | Key types | Base endpoints |
|---|---|---|---|
| activities | operational tasks | `Task`, `TaskStatus` TODO·IN_PROGRESS·DONE·BLOCKED, `TaskPriority` LOW·MEDIUM·HIGH·CRITICAL, `TaskCategory` RESTOCKING·PLANOGRAM·AUDIT·COMPLIANCE·GENERAL | GET/POST `/api/activities`, GET/PATCH/DELETE `/api/activities/:id` (alias `/api/tasks`) |
| programmes | programmes + membership | `Project`, `ProjectMember`, `ProjectRole` STORE_MANAGER·DEPARTMENT_LEAD·ASSOCIATE, `ProjectType`, `ProjectStatus` | GET/POST `/api/programmes` 🔒, POST `/api/programmes/:id/members` 🔒 |
| staff | users, auth, profiles | `User`, `UserProfile`, `StaffRole` REGIONAL_MANAGER·STORE_MANAGER·DEPARTMENT_LEAD·ASSOCIATE, `AuthToken` | `/api/staff/auth/login`, `/api/staff/me` |
| alerts | in-app notifications | `Notification`, `NotificationChannel` IN_APP·EMAIL, `NotificationStatus` UNREAD·READ, `AlertType` INVENTORY·SLA_BREACH·SHIFT_HANDOVER·ESCALATION | GET `/api/alerts` 🔒 |
| reports | read-only metrics | `Report`, `ReportType` STORE_SUMMARY·REGIONAL_ROLLUP·DEPARTMENT_PERFORMANCE, `ReportStatus` PENDING·READY·FAILED | GET `/api/reports/metrics/:scope/:id` |

🔒 = `Authorization: Bearer <token>`; the caller is available as `currentUser(res)` (`{ id, role, storeId, regionId }`).

## Mock data you can rely on (tests use these ids)
- Staff (`staff.seed.ts`, password `StoreOps@123` for all): `stf_001` Priya, STORE_MANAGER store_001 · `stf_002` Arun, ASSOCIATE store_001 · `stf_003` Meera, REGIONAL_MANAGER store_002 · `stf_004` Ravi, ASSOCIATE store_003 **inactive** · `stf_005` Kavya, DEPARTMENT_LEAD store_001 · `stf_006` Vikram, STORE_MANAGER store_003. Regions: store_001/002 → region_south, store_003 → region_north.
- Activities (`activities.seed.ts`): `tsk_001`–`tsk_008`, every category and status; `tsk_003` is BLOCKED/CRITICAL; `tsk_005` is DONE.
- Programmes (`programmes.seed.ts`): `prg_001` (store_001, ACTIVE), `prg_002` (store_001+002), `prg_003` (store_003, COMPLETED), `prg_004` (store_002, PLANNED).
- Test helpers in `tests/helpers.ts`: `login(app, email)`, `createActivity(app, auth, overrides)`, `setStatus(app, auth, id, status)`, `STAFF.<name>`.

## Commands
| Purpose | Command |
|---|---|
| Full gate (same as CI) | `npm run check` = `tsc --noEmit` → `eslint .` → `depcruise` → `jest --coverage` |
| Harness automated checks | `node .harness/scripts/run-checks.mjs` |
| Dev server | `npm run dev` (port 3000) |

## Where things are
- Composition root (only file that wires modules): `src/app.ts`
- Event contracts: `src/shared/events/domainEvents.ts` · bus: `src/shared/events/eventBus.ts`
- Errors: `src/shared/errors.ts` · validation: `src/shared/http/validate.ts` · auth: `src/shared/http/auth.ts`
- Spec of record: `docs/capstone-brief.md` (§3.3–3.6)
