Extend the existing `programmes` module in this StoreOps project (TypeScript, Express 5, zod, Jest + supertest, in-memory storage) into a programme list with staff membership.

## Domain
Programmes are store programmes: seasonal rollouts, compliance drives and store refits. Each programme has staff members, and each member has a role in that programme.

Use these type names in `src/modules/programmes/programmes.types.ts`. Keep the module folder and URL paths as `programmes`.
- `ProjectType`: `SEASONAL_ROLLOUT | COMPLIANCE_DRIVE | STORE_REFIT`
- `ProjectStatus`: `PLANNED | ACTIVE | COMPLETED`
- `ProjectRole`: `STORE_MANAGER | DEPARTMENT_LEAD | ASSOCIATE`
- `Project`: `id` (`prg_…`), `name`, `description`, `type`, `status`, `startsOn`, `endsOn`, `enrolledStoreIds`, `members: ProjectMember[]`, `createdAt`, `updatedAt`
- `ProjectMember`: `staffId`, `role: ProjectRole`, `addedAt`

Update `programmes.seed.ts` so there is at least one programme of each type. Seed members using real staff ids from `src/modules/staff/staff.seed.ts` (for example `stf_001` and `stf_002`).

## Staff come from the staff list
- The staff module is the only source of staff. Do not copy staff names or emails into programme data. Store only `staffId`.
- On the backend, use the read-only `StaffReader` from `src/modules/staff/staff.reader.ts`, imported type-only and injected through `createProgrammesModule({ eventBus, staff })` in `src/app.ts`. Never import any other file from the staff module.
- When returning members, join each one with its staff record from `StaffReader.getById`. Return `{ staffId, role, addedAt, staff: { id, email, role, storeId, active, profile } }`. If the staff record is missing, return `staff: null`; do not fail the request.
- In the UI, the "Add member" picker loads its options from `GET /api/staff?active=true`.

## Authentication: the signed-in store
Three endpoints need a signed-in user: listing programmes, creating a programme, and adding a member. The user signs in with the existing `POST /api/staff/auth/login` and sends `Authorization: Bearer <token>`. Their **store** is their staff record's `storeId`.
- Add `authenticate(token: string): Promise<Readonly<Staff>>` to the `StaffReader` interface. `StaffService.authenticate` already does this, so wire it through without changing staff behaviour.
- Move the bearer-token parsing in `src/modules/staff/staff.routes.ts` (`bearerToken`) into `src/shared/http/auth.ts`. Add a middleware factory there: `requireAuth(authenticate: (token: string) => Promise<AuthUser>)`. It puts the user on `res.locals.user`.
  - `AuthUser` is a small type in shared: `{ id, role, storeId, regionId }`. Shared must not import from modules.
  - Use the same helper in the staff routes.
- Missing, invalid or expired token → `UnauthorizedError` (401). A signed-in user without permission for the action → `ForbiddenError` (403). Both classes already exist in `src/shared/errors.ts`.

## Membership rules
These live in the service and throw `AppError` subclasses only:
- Unknown programme → `NotFoundError`
- Unknown staff member → `ValidationError`
- Inactive staff member → `ValidationError`
- Staff member whose `storeId` is not in the programme's `enrolledStoreIds` → `ValidationError` with code `STORE_NOT_ENROLLED`
- Staff member who is already a member → `ConflictError` with code `MEMBER_EXISTS`
- Adding or removing members on a `COMPLETED` programme → `ConflictError` with code `PROGRAMME_COMPLETED`
- If no `role` is given, use the staff member's own role when it is a valid `ProjectRole`. Otherwise (for example a `REGIONAL_MANAGER`) require an explicit `role`.

## REST endpoints
Mount these under `/api/programmes`. Validate input with zod through `src/shared/http/validate.ts`.

### Endpoints that require sign-in
| Method | Path | Purpose |
|---|---|---|
| GET | `/api/programmes` | List programmes for the signed-in user's store |
| POST | `/api/programmes` | Create a new programme |
| POST | `/api/programmes/:id/members` | Add a staff member to a programme |

**`GET /api/programmes`: list programmes for the signed-in store**
- Return only programmes whose `enrolledStoreIds` includes the user's `storeId`. A `storeId` query parameter must not widen this.
- Optional filters: `type`, `status`, `staffId`. Unknown filter values → 400.
- Response: `{ data: [...] }`. Each item has `memberCount` and `storeMemberCount` (members from the caller's store), not the full member list.
- No token → 401.

**`POST /api/programmes`: create a new programme**
- Body: `{ name, description, type, startsOn, endsOn }`. `status` defaults to `PLANNED`, `members` starts empty, and `endsOn` must be on or after `startsOn`.
- The caller's store is enrolled automatically, so `enrolledStoreIds` starts as `[storeId]`.
- Only `STORE_MANAGER` and `REGIONAL_MANAGER` may create programmes. Anyone else → 403 `FORBIDDEN`.
- Returns 201 with the created programme. Publishes `programme.created` (`{ programmeId, programmeName, type, storeId, occurredAt }`).

**`POST /api/programmes/:id/members`: add a staff member to a programme**
- Body: `{ staffId, role? }`. Returns 201 with the new member joined to its staff record.
- If the programme does not include the caller's store → 404 `NOT_FOUND`. Don't reveal programmes from other stores.
- Only `STORE_MANAGER`, `DEPARTMENT_LEAD` and `REGIONAL_MANAGER` may add members. `ASSOCIATE` → 403.
- A `STORE_MANAGER` or `DEPARTMENT_LEAD` may only add staff from their own store. Otherwise → 403 `FORBIDDEN`.
- All the membership rules above still apply.

### Other endpoints (no sign-in required)
| Method | Path | Purpose |
|---|---|---|
| GET | `/:id` | One programme with its members joined to staff |
| GET | `/:id/members` | Members joined to staff. Optional `role` filter. |
| PATCH | `/:id/members/:staffId` | Change a member's role: `{ role }` |
| DELETE | `/:id/members/:staffId` | Remove a member → 204 |
| POST | `/:id/enrolments` | Keep the existing endpoint working |

## Events
Add `programme.created`, `programme.member_added` and `programme.member_removed` to `src/shared/events/domainEvents.ts`. The member events have payload `{ programmeId, programmeName, staffId, role, storeId, occurredAt }`; `programme.created` is described under its endpoint. Publish them from the service. Subscribe in `alerts.subscribers.ts` to raise an `info` alert for the member's store. Modules must not import each other directly.

## UI
Follow the pattern of `public/staff.html` and `public/activities.html`: plain HTML, `/styles.css`, inline `fetch`, and `flash`/`error` notices.
- Sign-in: the UI has no login yet. When there is no token, both programme pages show a small email/password form that calls `POST /api/staff/auth/login`.
  - Keep the token in `sessionStorage` and send it as `Authorization: Bearer …` on the three signed-in endpoints.
  - Show "Signed in as <name> · <storeId>" with a sign-out link that calls `POST /api/staff/auth/logout`.
  - On a 401, clear the token and show the form again.
- `public/programmes.html` at `/programmes`: lists the signed-in store's programmes, with filters for type and status.
  - Table columns: name, type, status, dates, member count. Each row links to the detail page.
  - A "+ New programme" form calling `POST /api/programmes`, shown only to `STORE_MANAGER` and `REGIONAL_MANAGER`.
- `public/programme.html` at `/programmes/:id`: programme details and a members table showing name, email, staff role, programme role and a remove button.
  - An "Add member" form with a staff `<select>` loaded from `GET /api/staff?active=true`. Show only staff whose `storeId` is in the programme's `enrolledStoreIds`, and leave out existing members.
  - A role `<select>` with the three `ProjectRole` values. Pre-select it from the chosen staff member's role.
  - Show API error messages in the error notice.
- Add a "Programmes" tab to the top nav on every page in `public/`, and register both page routes in `src/app.ts` next to the existing UI routes.

## Tests
- Rewrite `tests/api/programmes.test.ts` to cover every endpoint and every rule above, including:
  - members are joined to staff data
  - default role taken from the staff member's role
  - the alert raised through the event bus
- For the three signed-in endpoints, sign in through `POST /api/staff/auth/login` with seeded staff (password `StoreOps@123`) and cover:
  - 401 with no token or a bad token
  - the list only shows the caller's store, and `?storeId=` cannot widen it
  - 403 when an associate creates a programme or adds a member
  - 403 when a store manager adds staff from another store
  - 404 when adding a member to another store's programme
  - the creator's store is enrolled automatically
- Update `tests/api/staff.test.ts` only as needed after moving `bearerToken` into shared. Existing staff behaviour must not change.
- Add UI page tests for `/programmes` and `/programmes/prg_001`, in the style of the existing "UI pages" tests.
- `tests/architecture.test.ts` must still pass with no changes.

## Done when
`npm run check` passes: typecheck, lint and all tests. Add the new endpoints to the endpoint table in `README.md`.
