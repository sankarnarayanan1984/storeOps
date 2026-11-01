# Skill: how-to-test

**Purpose:** how StoreOps tests prove business rules, not just status codes (FM3), and how they meet the coverage thresholds. Read by the Generator (to write tests) and the Evaluator (to judge B3–B5).

## Coverage thresholds (enforced in `jest.config.js`, rubric B2 — hard gate)
| Scope | Lines | Applies to |
|---|---|---|
| Service layer | 80% | **each** `src/modules/**/*.service.ts` file |
| Route layer | 70% | **each** `src/modules/**/*.routes.ts` file |
| Shared | 60% | each `src/shared/**/*.ts` file |
| Overall | 70% | all of `src/` except `server.ts` |

Per-file thresholds mean a new service method with untested branches can fail the gate even if the project total is high. Cover every `throw` in new service code.

## Where tests go
- HTTP behaviour: `tests/api/<module>.test.ts`, supertest against `createApp()`. One `describe` per endpoint, one `it` per AC (name the AC: `it('S1-AC3 rejects reopening a DONE task', …)`).
- Pure helpers: `tests/unit/<name>.test.ts`.
- Don't edit `tests/architecture.test.ts` (protected).

## Setup patterns
```ts
import { createActivity, login, setStatus, STAFF } from '../helpers';

let app: ReturnType<typeof createApp>;
let priya: string; // STORE_MANAGER, store_001
beforeEach(async () => {
  app = createApp({ activitySeed: [] });     // empty seed when counts matter
  priya = await login(app, STAFF.priya.email);
});
```
- Fresh `createApp()` per test (in-memory state). `createApp({ activitySeed: [], programmeSeed: [...] })` to control data.
- Capture events with a real bus: `const bus = new InMemoryEventBus(); app = createApp({ eventBus: bus }); bus.subscribe('activity.status_changed', (e) => { seen.push(e); });` (see `tests/api/programmes.test.ts` `capture()`).

## The FM3 rule: every AC test asserts the outcome
A test that checks only `.expect(200)` does not count for B3. Each AC test must assert at least one of:
1. **Response body** fields that the AC's THEN names (`expect(res.body).toMatchObject({ status: 'DONE', ... })`);
2. **State read-back** via a follow-up GET (`expect((await request(app).get(`/api/activities/${id}`)).body.status).toBe('DONE')`);
3. **Event / downstream effect** (captured event payload, a notification in `GET /api/alerts`, a metric in `/api/reports/metrics/...`).

Error-path ACs assert `res.body.error.code` (B4), and — for rejected writes — that state did **not** change:
```ts
const res = await request(app).patch(`/api/activities/${id}`).set('Authorization', priya).send({ status: 'TODO' }).expect(409);
expect(res.body.error.code).toBe('INVALID_STATUS_TRANSITION');
expect((await request(app).get(`/api/activities/${id}`)).body.status).toBe('DONE');
```

## Permission tests
For each signed-in endpoint: 401 without token, 403 for a role the AC forbids (use the seeded role that fits — Arun ASSOCIATE, Kavya DEPARTMENT_LEAD, Vikram STORE_MANAGER of another store), success for each allowed role.

## Event tests (B5)
Every event published in the sprint has a test that asserts its payload or its downstream effect. Cross-module reactions are tested end-to-end through HTTP: e.g. block a task as Arun → `GET /api/alerts` as Priya contains `{ type: 'ESCALATION', entityId }`.

## Anti-patterns the Evaluator fails
- `expect(res.status).toBe(200)` as the only assertion in an AC test
- asserting on seed data the test didn't set up when counts matter (use an empty seed)
- `it.only` / `it.skip` (C5), mocking the service or repository in API tests (test through HTTP)
- tests that pass when the feature is removed (assert the new field/behaviour specifically)
