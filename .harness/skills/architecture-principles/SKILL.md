# Skill: architecture-principles

**Purpose:** the non-negotiable StoreOps architecture rules, each traced to one of the four failure modes the client's standards team saw in a prior AI experiment. Read by Planner, Generator and Evaluator. A violation of any rule marked **HARD** fails the sprint regardless of score.

The four failure modes (brief §2):
- **FM1** direct imports from another module's repository, bypassing the service boundary and event bus
- **FM2** raw `Error` throws instead of the typed `AppError` hierarchy
- **FM3** tests that assert HTTP status codes but not business-rule compliance
- **FM4** missing event bus integration — state changes written directly to sibling modules

---

## R1 — Module boundary (HARD · FM1 · automated: dependency-cruiser + ESLint)
A file in `src/modules/<a>/` may import only:
- files in `src/modules/<a>/`
- `src/shared/**`
- `src/modules/staff/staff.reader.ts`, **type-only** (`import type { StaffReader } ...`)

Nothing else crosses a module boundary. There are no "readers" for other modules yet; if a feature truly needs a read-only lookup from another module, the **Planner** must call it out in the spec as an architecture change for the developer to approve — the Generator never adds one on its own.

```ts
// ✅ activities.service.ts
import type { StaffReader } from '../staff/staff.reader';
// ❌ HARD FAIL (no-cross-module-repository)
import { InMemoryProgrammesRepository } from '../programmes/programmes.repository';
```
Implementations are injected by `src/app.ts` (e.g. `createActivitiesModule({ eventBus, staff: staff.reader })`). Modules never import `src/app.ts`.

## R2 — Event bus only for cross-module side effects (HARD · FM4 · LLM-assessed, plus dependency-cruiser `no-direct-service-imports`)
When something in module A must cause something in module B (a notification, a metric, a report), A **publishes a domain event** and B **subscribes**. A never imports B's service.

1. Declare the payload interface and add it to `DomainEvents` in `src/shared/events/domainEvents.ts` (naming: `<module>.<past_tense>`, e.g. `activity.status_changed`, `activity.bulk_updated`).
2. Publish from the **service**, after the repository write succeeds: `await this.events.publish('activity.deleted', { ... occurredAt })`.
3. Subscribe in the consuming module's `<module>.subscribers.ts`, registered from its `index.ts`.

```ts
// ✅ alerts/alerts.subscribers.ts
bus.subscribe('activity.status_changed', async (event) => { if (event.to !== 'BLOCKED') return; await service.notifyStore({...}); });
// ❌ HARD FAIL — activities importing alerts
import { AlertsService } from '../alerts/alerts.service';
```
Every new or changed **state transition that another module reacts to** must publish. Payloads carry ids and the fields subscribers need (`storeId`, `regionId`, `category`, `priority`) — never whole objects from another module.

## R3 — Error contract (HARD · FM2 · automated: ESLint `no-restricted-syntax` + architecture test)
Services and routes throw only `AppError` subclasses from `src/shared/errors.ts`:

| Class | HTTP | Use for |
|---|---|---|
| `ValidationError(message, details?, code = 'VALIDATION_ERROR')` | 400 | bad input, unknown/inactive referenced staff, domain validation (custom code e.g. `STORE_NOT_ENROLLED`) |
| `UnauthorizedError` | 401 | missing/invalid/expired token |
| `ForbiddenError` | 403 | signed in but role/ownership not allowed |
| `NotFoundError(resource, id)` | 404 | unknown id; also to hide another store's data |
| `ConflictError(message, code)` | 409 | state conflicts: `INVALID_STATUS_TRANSITION`, `MEMBER_EXISTS`, `PROGRAMME_COMPLETED` |

`throw new Error(...)` anywhere in `src/` is a hard fail. Error `code`s are part of the API contract: reuse an existing code when the meaning matches; new codes are SCREAMING_SNAKE_CASE and must be named in the sprint contract.

## R4 — Layer separation (HARD · LLM-assessed)
`Routes → Service → Repository`, no skipping:
- **routes.ts**: zod schema + `parse()`, `requireAuth`/`currentUser`, call **one** service method, choose status code, `res.json`. No `if` on business state, no repository access, no `events.publish`.
- **service.ts**: all business rules (permissions, transitions, invariants), throws `AppError`s, publishes events, uses repositories and injected readers.
- **repository.ts**: interface + `InMemory…` class; stores/filters/clones data only. No events, no errors other than returning `undefined`, no HTTP, no other modules.
- **subscribers.ts**: translate events into calls on the module's own service.

## R5 — Reports is read-only (HARD · automated: dependency-cruiser `reports-read-only`)
`src/modules/reports/` imports no other module (not even the staff reader). It builds its own read model from events in `reports.subscribers.ts`. It never publishes events that cause writes in other modules.

## R6 — Composition root
Only `src/app.ts` constructs modules and wires dependencies. New module dependencies are added as fields on the module's `…ModuleDeps` interface in its `index.ts`.

## Protected files — never edit during a harness run
`CLAUDE.md`, `.harness/**` (except `.harness/output/`), `.claude/agents/**`, `eslint.config.mjs`, `jest.config.js`, `.dependency-cruiser.cjs`, `tsconfig*.json`, `package.json`, `tests/architecture.test.ts`, `.github/**`. Weakening a gate to get a PASS is checked automatically (rubric check C1).
