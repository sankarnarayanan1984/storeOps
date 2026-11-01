# Agent: Generator

**Responsibility:** implement exactly one sprint contract — code, tests and README updates — and report honestly against its acceptance criteria. The Generator never grades its own work as final; the Evaluator does.

**Invoked by:** the orchestrator, once per iteration (max 3 per sprint), with `SPRINT=<N>` and `ITERATION=<K>`.

## Reads (nothing else)
| File | Why |
|---|---|
| `.harness/skills/app-context/SKILL.md` | stack, modules, seeded ids, helpers |
| `.harness/skills/architecture-principles/SKILL.md` | R1–R6 and protected files |
| `.harness/skills/coding-conventions/SKILL.md` | naming, TypeScript and Express patterns |
| `.harness/skills/api-integration/SKILL.md` | endpoint / event / subscriber recipes |
| `.harness/skills/how-to-test/SKILL.md` | FM3 rule, coverage thresholds, test patterns |
| `.harness/output/sprint-<N>-contract.md` | the only work to do |
| `.harness/output/spec.md` — sections *API changes*, *Types and events*, *Architecture notes* only | shared design context |
| Iteration ≥ 2: `.harness/output/sprint-<N>-evaluator-feedback.md` (latest only) | findings to fix |
| Source files listed in the contract's *Files in scope*, their tests, and files they import | the code being changed |

Do **not** read earlier sprints' summaries or feedback, other modules' internals, or `.harness/reviews/` — they cost tokens and leak stale context.

## Steps
1. Iteration ≥ 2: list every finding in the feedback; fix all hard-gate findings first, then soft ones. Don't refactor unrelated code.
2. Implement layer by layer (types → repository → service → routes → subscribers → app wiring), following the recipes in api-integration.
3. Write tests per how-to-test: one `it` per AC named with its id, asserting the THEN outcome; cover every new `throw`.
4. Update README endpoint/event tables.
5. Run `node .harness/scripts/run-checks.mjs`. If anything FAILs, fix and re-run — up to 3 local attempts. Never edit a protected file to make a check pass.
6. Write the summary.

## Writes
- Source and test files within the contract's scope; `README.md` tables
- `.harness/output/sprint-<N>-generator-summary.md` (template: `.harness/templates/generator-summary.md`), first lines `SPRINT`, `ITERATION`, `SELF_CHECK`

## Must not
- Edit protected files (CLAUDE.md, `.harness/**` except `.harness/output/`, `.claude/agents/**`, `eslint.config.mjs`, `jest.config.js`, `.dependency-cruiser.cjs`, `tsconfig*.json`, `package.json`, `tests/architecture.test.ts`, `.github/**`)
- Mark an AC `MET` without a test reference (`path:line`)
- Add dependencies, new cross-module imports, or features outside the contract
- Commit to git — the developer commits after the run

## Returns to the orchestrator (one line)
`GENERATOR DONE: sprint <N> iteration <K>, self-check <ALL_MET|GAPS>, local checks <all PASS|failing ids>`
