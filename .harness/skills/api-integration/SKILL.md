# Skill: api-integration

**Purpose:** step-by-step recipes for the three kinds of change StoreOps features need — a new endpoint, a new domain event, and a new cross-module reaction — wired the StoreOps way. Read by the Generator. Each recipe lists every file you must touch; missing one is the usual cause of FM4.

## Recipe 1 — Add an endpoint to an existing module
1. **Types** (`<module>.types.ts`): input type (e.g. `BulkStatusInput`), result type. Reuse existing enums.
2. **Repository** (`<module>.repository.ts`): add a method to the interface *and* the `InMemory…` class only if existing `list/findById/save` cannot express it. No business rules.
3. **Service** (`<module>.service.ts`): one public method holding every rule from the contract's ACs; throw the contract's `AppError` codes; publish events after writes.
4. **Route** (`<module>.routes.ts`): zod schema, `parse`, optional `auth`, call the service once, status code. Static paths before `/:id`.
5. **Composition**: usually nothing — the router is already mounted in `src/app.ts`. If the service needs a new dependency, add it to `<Module>ModuleDeps` and pass it in `app.ts`.
6. **Tests**: `tests/api/<module>.test.ts` — one `describe` per endpoint (see how-to-test).
7. **README**: add the row to the endpoint table.

### Partial-failure pattern (bulk endpoints)
Bulk operations validate the request shape as a whole (400 on bad shape), then process **each item independently** and return 200 with per-item outcomes — they don't fail the whole request because one item failed:
```ts
type BulkItemResult =
  | { id: string; status: 'UPDATED'; task: Task }
  | { id: string; status: 'FAILED'; error: { code: string; message: string } };
```
Map an item's `AppError` to `{ code, message }` (use `err instanceof AppError`); anything else is re-thrown (it's a bug, not an item failure). Duplicate ids in one request are a 400 at the schema level. Publish per-item events only for items that changed.

### Audit entries
When the contract asks for an audit trail, it belongs to the module that owns the entity: an `AuditEntry` type and an `…AuditRepository` (interface + in-memory class) in that module, written by the service in the same method as the change, with `{ id, entityId, action, from, to, actorId, occurredAt, ... }`. Expose it read-only (e.g. `GET /api/activities/:id/audit`) only if an AC requires it.

## Recipe 2 — Add a domain event
1. In `src/shared/events/domainEvents.ts`: add `export interface <Name>Event { …; occurredAt: string }` and the entry `'<module>.<past_tense>': <Name>Event` in `DomainEvents`.
2. Payload: ids + the fields subscribers filter on (`storeId`, `regionId`, `category`, `priority`, actor id). Types used in payloads live in this file (shared must not import modules).
3. Publish in the service: `await this.events.publish('<module>.<event>', { … , occurredAt: timestamp })` after the write.
4. Add a row to README's event table (publisher → consumers).

## Recipe 3 — React to another module's event (the only legal cross-module write path)
1. Consumer module's `<module>.subscribers.ts`: `bus.subscribe('<event>', async (event) => { … await service.<method>(…) })`. Filter early (`if (event.to !== 'BLOCKED') return;`).
2. Put the reaction's logic in the consumer's **service** (e.g. `AlertsService.notifyStore`), not in the subscriber.
3. If the subscriber file is new, call `register<Module>Subscribers(deps.eventBus, service)` in the module's `index.ts`.
4. Alerts specifics: notifications are per-recipient. Use `notifyStore({ type, storeId, recipientRoles, title, message, sourceEvent, entityId })` to fan out to active staff of a store by role; `AlertType` must be one of INVENTORY · SLA_BREACH · SHIFT_HANDOVER · ESCALATION.
5. Reports specifics: update counters through `ReportsRepository.increment` only; never import or call another module.

## Things that look right but fail review
| Temptation | Why it fails | Do instead |
|---|---|---|
| `import { AlertsService } from '../alerts/alerts.service'` in activities to "just notify" | R1/R2 hard gate (A1 + A4) | publish an event; subscribe in alerts |
| Writing notifications from `activities.subscribers.ts` | activities would write alerts' state | subscriber lives in **alerts** |
| Checking `caller.role` in the route | R4: business rule in routes | pass `currentUser(res)` to the service |
| `throw new Error('not found')` | R3 hard gate | `throw new NotFoundError('Activity', id)` |
| Lowering a threshold in `jest.config.js` to pass | C1 hard gate | write the missing tests |
