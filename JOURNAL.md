# Architecture journal

Decisions, trade-offs and lessons captured while building StoreOps and its harness. Newest last.

## 2026-10-24 → 10-29 — Generating and correcting the codebase
The corrections below were made while generating StoreOps with Claude Code before the harness existed. Each one became a skill rule or a check, because it is exactly the drift the harness has to stop.

| What Claude Code produced | Why it was wrong | Became |
|---|---|---|
| A separate `tasks` module next to `activities`, wired by an adapter in a `composition/` folder | §3.3 says activities owns `Task`; a sixth module and an adapter layer blurred ownership | app-context module table; sprint-decomposition "≤2 modules per sprint" |
| `TaskCategory` with only RESTOCKING and PLANOGRAM (my prompt was truncated) | spec drift from an incomplete prompt — the model filled the gap silently | Planner self-check: every enum in an AC must exist in app-context |
| `PATCH /api/activities/:id/status` while §3.6 asks for `PATCH /api/activities/:id` | invented endpoint shape | ACs must quote method + path exactly |
| Status vocabulary `planned/completed` in events while tasks used `TODO/DONE` | two vocabularies for one concept, mapped in an adapter | event payload types live in `domainEvents.ts` and are reused by modules |
| Route params typed `string \| string[]` after adding auth middleware (Express 5 typings) | tsc errors only appear once middleware precedes the handler | coding-conventions: `router.patch<{ id: string }>(…)` |
| `hidden` forms still visible because a CSS class set `display:flex` | UI-only, but a reminder that green tests don't prove the page works | (UI out of harness scope; noted) |
| Harness scripts failed the project's own ESLint (`process` undefined in `.mjs`) | the gate caught the harness author — good sign the gate is real | ESLint block for `.harness/**/*.mjs` |

## Decision — make depcruiser the module-boundary gate, keep ESLint and the architecture test
ESLint `no-restricted-imports` and `tests/architecture.test.ts` already enforced boundaries. The brief asks for a dependency analyser, and dependency-cruiser expresses rules ESLint can't easily state (e.g. "reports imports no other module", "no other module's `*.service.ts`"). Kept all three: they're cheap, and defence in depth matters more for FM1 than elegance. Verified by planting a file with a cross-module repository import and a service import — 4 violations reported.

## Decision — verdict by script (see DESIGN_BRIEF D1)
First draft had the Evaluator write `VERDICT:` itself. Rejected because two runs over identical findings could produce different verdicts. Now the Evaluator only records binary check results; `compute-verdict.mjs` decides. Verified on the baseline: one soft fail → 93.3 PASS, two → 88.3 CONDITIONAL PASS, any hard gate → FAIL.

## Decision — CONDITIONAL PASS retries until the last iteration
Considered "CONDITIONAL PASS advances immediately". Rejected: the loop is autonomous and cheap compared with a human review of accepted debt. At iteration 3 it is accepted and flagged (`accepted_conditional: true`) so the archive shows it.

## Decision — no automatic commits
The harness could commit per sprint for a cleaner diff base. Chose not to: the brief's baseline commit plus the protected-file hash snapshot give the Evaluator what it needs, and keeping commits with the developer keeps a human signature on everything that reaches main.

## Open questions
- Token cost: Monitor estimates tokens from characters ÷ 4; cost stays `null` until a rate is configured. Is a rough number better than none for trend detection? (Probably yes for relative comparison between runs.)
- Programme member events have no subscriber because no `AlertType` fits; revisit if the brief's alert types are extended.

## 2026-10-30 — Demonstration run `2026-10-30-bulk-status`
- **Approval gate earned its place.** The first spec involved only activities and alerts. I sent `CHANGE: programmer, staff and report modules are missing`; the Planner re-planned to 4 sprints with two explicit decisions (staff reader-only; programme history visible to all enrolled stores — I took both defaults) and, unprompted, corrected its own wrong assumption about the `createActivity` helper's default store. Cheapest possible place to fix scope.
- **Result:** 4/4 sprints PASS 100 on iteration 1; 145 tests, 99.14 % lines; ≈ 546 k measured tokens (Gen + Eval). Live check: one bulk request produced audit entries (activities), a SHIFT_HANDOVER alert naming the actor (alerts, via `StaffReader`), handover counters (reports) and per-programme history (programmes) — all through one event.
- **Trade-off I hadn't seen:** a cumulative changed-files list is simple and git-free, but it forced me to explain earlier sprints' files to every later Evaluator in its prompt — context outside the governed files. Recorded as the main improvement in `REFLECTION.md` (per-sprint baseline snapshot).
- **Surprise:** the Evaluator spotted README lines nobody had claimed (my own pre-run Docker/Azure edits). Good for trust in the Evaluator; bad for my bookkeeping — pre-run state should be clean or snapshotted, not described from memory.
- **Measurement lesson:** chars ÷ 4 under-estimated real usage by ~2× on every sprint. Measured platform usage should be the logged number; estimates only when measurement is unavailable.
- **Post-run fixes (2026-10-31), recorded because they touch the archive:** (1) the archived `spec.md` only showed `STATUS: APPROVED`, so the reviewed version wasn't visible — added `spec-proposed.md` (identical except line 1, verified by diff) and an `APPROVED_AT` line, and changed CLAUDE.md §4 / monitor.agent.md so future runs keep both automatically. (2) Run logs had `est_cost_usd: null`; set the published claude-opus-5-5 rates in monitor.agent.md and backfilled `measured_tokens` + a low/high cost range into each run log's front matter (each log notes the backfill). Run total Gen + Eval: 545,800 tokens → $2.18–$10.92. Decision: report a range, not a point estimate, because measured usage has no input/output split.
- **Skill changes after the run (2026-10-31):** (1) every agent now reads both shared-foundation skills — the Evaluator gained app-context (seeded ids/roles to check ACs against), the Monitor gained architecture-principles (to trace repeated failures to R1–R6). I had trimmed these for token cost; the brief says "required for all agents", and ~400 extra words per invocation is a fair price for literal compliance plus better grading context. (2) coding-conventions grew from ~1 to ~2.7 pages with worked examples lifted from the codebase (service method order, partial-failure catch, repository cloning, zod refine/transform) and a table of the tsc/ESLint errors this config actually raises — each verified against `eslint --print-config`. These apply from the next run; the demo run used the earlier versions.
- **Open:** a run where everything passes first time can't distinguish "good skills" from "lenient LLM checks". Next run should include a canary sprint with a planted violation per hard gate.
