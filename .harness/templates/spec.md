STATUS: AWAITING APPROVAL
RUN_ID: <run-id e.g. 2026-10-30-bulk-status>
SPRINTS: <N>

# Spec: <feature title>

## Feature prompt
> <verbatim text of PROMPT.md / the @planner prompt>

## Goal
<1–3 sentences: the store-operations outcome, who benefits>

## Scope
- **In:** <bullets>
- **Out:** <bullets — things a reader might expect but this run will not do>

## API changes
| Method | Path | Auth | Request | Success | Errors (status · code) |
|---|---|---|---|---|---|

## Types and events
- New/changed types: <module.types.ts additions>
- New events (src/shared/events/domainEvents.ts): `<module>.<event>` — payload `{ … }` — publisher → consumers

## Architecture notes
| Rule | How this feature complies |
|---|---|
| R1 module boundary | |
| R2 event bus | |
| R3 error contract | |
| R4 layers | |
| R5 reports read-only | |

## Sprints
| Sprint | Goal | Modules | ACs |
|---|---|---|---|

## Assumptions
- <assumption> — <why it is safe / what changes if wrong>

## Decisions needed from the developer
- <none> | <architecture exception or ambiguity the developer must decide before APPROVED>
