# Skill: coding-conventions

**Purpose:** how StoreOps TypeScript is written, so generated code is indistinguishable from the existing modules and passes `tsc --noEmit` + `eslint .` first time. Read by the Generator. Copy the patterns below — they are taken from the codebase — rather than inventing new ones. Architecture rules (what may import what, which errors exist) live in architecture-principles; this file is about *how* code inside a module is written.

## 1. Files and naming
| Thing | Convention | Example |
|---|---|---|
| Module files | `src/modules/<module>/<module>.<layer>.ts` | `activities.service.ts` |
| Layers | `types`, `repository`, `service`, `routes`, `seed`, `subscribers` (only if it consumes events), `index.ts` | — |
| Ids | `newId('<prefix>')` from `src/shared/id.ts` → `<prefix>_<uuid>` | `tsk`, `prg`, `stf`, `ntf`, `aud`, `hnd`; a new prefix is named in the contract |
| Timestamps | ISO strings via `nowIso()`; date-only fields `YYYY-MM-DD` | `createdAt`, `dueAt`, `startsOn` |
| Enums | `as const` array + derived union; values SCREAMING_SNAKE_CASE | `TASK_STATUSES`, `TaskStatus` |
| Classes | `<Module>Service`, interface `<Module>Repository`, `InMemory<Module>Repository` | `ActivitiesService` |
| Module factory | `create<Module>Module(deps: <Module>ModuleDeps): { router: Router }` | `createActivitiesModule` |
| Tests | `tests/api/<module>[.<feature>].test.ts`, `tests/unit/<name>.test.ts` | `activities.bulk-status.test.ts` |

## 2. Types and enums
Vocabularies that travel in **event payloads** are declared once in `src/shared/events/domainEvents.ts` (shared must never import a module) and re-exported by the owning module, which adds the runtime array:
```ts
// activities.types.ts
import type { TaskCategory, TaskPriority, TaskStatus } from '../../shared/events/domainEvents';
export type { TaskCategory, TaskPriority, TaskStatus };
export const TASK_STATUSES = ['TODO', 'IN_PROGRESS', 'DONE', 'BLOCKED'] as const satisfies readonly TaskStatus[];
```
Module-only vocabularies are declared in the types file directly: `export const PROJECT_STATUSES = ['PLANNED', 'ACTIVE', 'COMPLETED'] as const; export type ProjectStatus = (typeof PROJECT_STATUSES)[number];`

Entity interfaces list required fields first, optional (`?`) fields for genuinely absent data (e.g. `assigneeId?`), and never `| null` in stored entities. Input types (`CreateTaskInput`, `UpdateTaskInput`) are separate from entities; `null` appears only in an update input to mean "clear this field" (`assigneeId?: string | null`).

## 3. TypeScript rules that bite (tsconfig strict + `noUncheckedIndexedAccess`)
- Index and `Record` lookups are `T | undefined`. Handle it; don't `!` it in `src/` (tests may use `!` right after an assertion).
  ```ts
  const first = programme.enrolledStoreIds[0];          // string | undefined
  storeId: staff?.storeId ?? programme.enrolledStoreIds[0] ?? '',
  ```
- `import type` for type-only imports — `@typescript-eslint/consistent-type-imports` is an error. Mixed imports use inline `type`: `import { PROJECT_ROLES, type ProjectRole } from './programmes.types';`
- No `any`. Unknown input is parsed with zod at the route; caught errors are `unknown` and narrowed with `instanceof`.
- Unused variables only with a `_` prefix — the idiom for dropping a field: `const toPublic = ({ passwordHash: _hash, ...user }: StoredUser): User => user;`
- Optional fields in object literals use a conditional spread so the key is absent, not `undefined`:
  ```ts
  ...(task.assigneeId ? { assigneeId: task.assigneeId } : {}),
  ```

## 4. Repositories
Interface first, then the in-memory class. Methods are **not** `async` — they return `Promise.resolve(...)` (an `async` function with no `await` fails `@typescript-eslint/require-await`). Clone on the way in **and** out so callers can't mutate stored state; copy nested arrays:
```ts
const clone = (p: Project): Project => ({
  ...p,
  enrolledStoreIds: [...p.enrolledStoreIds],
  members: p.members.map((m) => ({ ...m })),
});

findById(id: string): Promise<Project | undefined> {
  const programme = this.items.get(id);
  return Promise.resolve(programme ? clone(programme) : undefined);
}
```
"Not found" is `undefined`, never a thrown error — the service decides what that means. Filters are chained `.filter((t) => !filter.x || t.x === filter.x)`, one per optional field.

## 5. Services
Signature: ids, input, then `caller: AuthUser` last. Inside a mutating method, always this order — reviewers check it:

1. **load** → `NotFoundError`
2. **authorise** → `ForbiddenError`
3. **validate referenced data** (staff exists/active…) → `ValidationError`
4. **state rules** (transitions, duplicates, completed) → `ConflictError`
5. **write** via the repository
6. **publish** the event(s), after the write
7. **return**

```ts
// activities.service.ts — delete: load, authorise, write, publish
async delete(id: string, caller: AuthUser): Promise<void> {
  const task = await this.getById(id);                                  // 1 (throws NotFoundError)
  const isOwner = task.createdBy === caller.id;
  const isStoreManager = caller.role === 'STORE_MANAGER' && caller.storeId === task.storeId;
  if (!isOwner && !isStoreManager) {
    throw new ForbiddenError('Only the activity owner or a store manager of its store can delete it'); // 2
  }
  await this.repository.delete(id);                                     // 5
  await this.events.publish('activity.deleted', {                       // 6
    activityId: task.id, storeId: task.storeId, regionId: task.regionId,
    status: task.status, deletedBy: caller.id, occurredAt: nowIso(),
  });
}
```
- Role lists are module-local string arrays: `const CAN_CREATE: readonly string[] = ['STORE_MANAGER', 'REGIONAL_MANAGER'];` then `CAN_CREATE.includes(caller.role)`.
- Staff lookups go through the injected `StaffReader`. Treat its `NotFoundError` as "missing", re-throw anything else:
  ```ts
  const member = await this.staff.getById(staffId).catch((err: unknown) => {
    if (err instanceof NotFoundError) return undefined;
    throw err;
  });
  ```
- **Per-item failure** (bulk endpoints): catch only `AppError` and turn it into a result; anything else is a bug and must propagate as a 500:
  ```ts
  try {
    const { from, task } = await this.applyBulkStatus(id, input, caller, batchId, actorName);
    results.push({ id, outcome: 'UPDATED', from, to: input.status });
  } catch (err: unknown) {
    if (!(err instanceof AppError)) throw err;
    results.push({ id, outcome: 'FAILED', error: { code: err.code, message: err.message } });
  }
  ```
- Clearing a field with `null` input: build the next object, then `delete next.assigneeId` — don't store `null`.

## 6. Routes (Express 5 + zod)
- Schemas are module-local constants at the top of `<module>.routes.ts`; parse with `parse(schema, req.body | req.query)` from `src/shared/http/validate.ts` (it throws `ValidationError` with `details[].path` — tests assert on those paths).
- Enums: `z.enum(TASK_STATUSES)`. Unknown values must 400, never be ignored. Defaults belong in the schema: `priority: z.enum(TASK_PRIORITIES).default('MEDIUM')`.
- Partial updates reject an empty body:
  ```ts
  const updateBody = z.object({ status: z.enum(TASK_STATUSES).optional(), /* … */ })
    .refine((body) => Object.values(body).some((v) => v !== undefined), {
      message: 'Provide at least one of status, priority, category or assigneeId',
    });
  ```
- Optional free text where blank means "clear": `z.string().trim().max(n).optional().transform((v) => v || undefined)`.
- Async handlers may throw — Express 5 forwards rejections to `errorHandler`. No try/catch in routes.
- When middleware precedes the handler, type the params explicitly or `req.params.id` is `string | string[] | undefined`:
  ```ts
  router.patch<{ id: string }>('/:id', auth, async (req, res) => {
    res.json(await service.update(req.params.id, parse(updateBody, req.body), currentUser(res)));
  });
  ```
- **Static paths before parameter paths:** `router.patch('/bulk-status', …)` must be registered before `router.patch('/:id', …)`, otherwise `bulk-status` is captured as an id.
- Signed-in endpoints: `const auth = requireAuth(authenticate)` once per router, `currentUser(res)` in the handler, pass the `AuthUser` to the service. Routes never inspect roles.
- Responses: list → `{ data: [...] }`; create → `res.status(201).json(entity)`; delete → `res.status(204).end()`; errors only by throwing `AppError`.

## 7. Module wiring
New dependencies are added as fields on `<Module>ModuleDeps` in `index.ts` and passed from `src/app.ts` (the only composition root). Internal collaborators (e.g. a second repository such as the activities audit repository) are constructed inside `index.ts`, not in `app.ts`. Seeds are optional deps (`seed?: readonly Task[]`) so tests can pass `[]`.

## 8. Errors you will hit, and the fix
| Message | Cause | Fix |
|---|---|---|
| `TS2345 … 'string \| string[] \| undefined'` on `req.params.id` | middleware before handler | `router.get<{ id: string }>(…)` |
| `TS2532 Object is possibly 'undefined'` | indexed access | `?.` / `??` or an explicit guard |
| `consistent-type-imports` | value import used only as a type | `import type` / inline `type` |
| `require-await` | `async` repository method with no `await` | return `Promise.resolve(...)`, drop `async` |
| `no-unsafe-member-access` / `no-unsafe-assignment` in `src/` | untyped JSON / `any` | parse with zod, or type the value (allowed only in `tests/`) |
| `no-restricted-syntax: Throw an AppError subclass` | `throw new Error()` | the matching `AppError` subclass (architecture-principles R3) |
| `no-restricted-imports: Cross-module imports are forbidden` | importing another module | event bus, or the type-only staff reader |

## 9. Comments and housekeeping
- Comment *why*, not *what*; one-line JSDoc on exported members whose rule isn't obvious. Match the sparse density of existing files.
- No `console.log` in `src/` (only `server.ts` and the event-bus error reporter log) — rubric C5.
- Update the README endpoint and event tables for every new endpoint or event — rubric C4.
