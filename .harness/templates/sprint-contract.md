SPRINT: <N>
RUN_ID: <run-id>
SPEC: .harness/output/spec.md

# Sprint <N> contract: <title>

## Goal
<one paragraph>

## Files in scope
The Generator may create or edit only these paths (plus tests for them and README tables):
- `src/...`

## Acceptance criteria
### S<N>-AC1 — <short name>
- **GIVEN** <seeded ids / setup>
- **WHEN** <method path body>
- **THEN** <status + body/state/event; error class + code for failures>

## Error codes introduced
| Code | Class | Status | When |
|---|---|---|---|

## Events introduced or published
| Event | Payload | Published by | Consumed by |
|---|---|---|---|

## Definition of done
- `node .harness/scripts/run-checks.mjs` reports PASS for A1 A2 A3 B1 B2 C1 C5
- Every AC above has a test named with its id that asserts the THEN outcome
