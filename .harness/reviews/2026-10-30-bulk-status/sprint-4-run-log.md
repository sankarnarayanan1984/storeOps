---
run_id: 2026-10-30-bulk-status
sprint: 4
title: Handover history per programme (programmes)
verdict: PASS
score: 100
iterations_used: 1
max_iterations: 3
escalated: false
accepted_conditional: false
hard_gates_failed_by_iteration: ["none"]
scores_by_iteration: [100]
est_tokens: 63522
measured_tokens: 138500
est_cost_usd_low: 0.55
est_cost_usd_high: 2.77
cost_basis: claude-opus-5-5 @ $4.00 in / $20.00 out per MTok (2026-10-06)
started_at: 2026-10-31T04:36:22Z
finished_at: 2026-10-31T04:39:55Z
---

# Run log — 2026-10-30-bulk-status sprint 4

Feature: Shift handover bulk update (`PATCH /api/activities/bulk-status`). Sprint 4 is the last sprint of the run. The programmes module now subscribes to `activity.handover_completed` in a new `programmes.subscribers.ts`. For each `programmes[]` group in the event whose programme exists in its own repository, it appends one `ProgrammeHandover` entry. Unknown programme ids are skipped without throwing. The new signed-in endpoint `GET /api/programmes/:id/handovers` returns that history oldest first. Unknown programmes, and programmes the caller's store is not enrolled in, both return 404 `NOT_FOUND`. Programme status, members and enrolments are never written, and programmes imports nothing from activities. `started_at` is approximated by sprint 3's verdict time, because sprint 4 began right after it. `finished_at` is the sprint 4 verdict `computedAt`. Both are UTC; the developer's local date was 2026-10-30.

## Iterations
| Iteration | Verdict | Score | Hard gates failed | Main findings |
|---|---|---|---|---|
| 1 | PASS | 100 | none | All 16 checks passed: A 6/6, B 5/5, C 5/5. 145/145 tests passed (up from 141), with 99.14% line coverage overall. dependency-cruiser found 0 violations across 47 modules, and all 36 protected files were unchanged. A4: programmes reacts only through its own subscriber (`programmes.subscribers.ts:6`) and appends only to its own repository (`programmes.service.ts:223`). Its only link to the event is a type import from shared `domainEvents.ts`. S4-AC1 to AC4 were each verified with a test that asserts the history entries, both through HTTP and through a direct bus publish. No findings to fix. |

Changed files (8): src/modules/programmes/{programmes.types, programmes.repository, programmes.service, programmes.routes, programmes.subscribers (new), index}.ts, tests/api/programmes.handovers.test.ts (new), and README.md (the endpoint row and the `activity.handover_completed` consumers row). All are within the contract's scope (C3). No existing test was modified.

Unscored Evaluator note worth keeping: the 401 test at `tests/api/programmes.handovers.test.ts:147` only checks that `error.code` is defined, not its exact value. B4 still passed, because the contract adds no new code for that path. This is the closest any LLM check in the run came to a borderline call.

The earlier copy `sprint-4-iter-1-evaluator-feedback.md` is identical to the final feedback, because there was only one iteration, so only the final feedback is archived. There is no `escalation.md`. `spec.md` was already archived for this run.

## Token and cost estimate
| Agent | Invocations | Input chars | Output chars | Est. tokens (chars/4) | Measured tokens (platform) |
|---|---|---|---|---|---|
| Generator | 1 | 78,836 | 36,878 | 28,929 | 72,500 |
| Evaluator | 1 | 82,775 | 15,252 | 24,507 | 66,000 |
| Monitor | 1 | 31,069 | 9,273 | 10,086 | not reported |
| **Total** | 3 | 192,680 | 61,403 | **63,522** | **138,500** (Generator and Evaluator only) |

Method: tokens ≈ characters ÷ 4 over the files each agent read and wrote (skills, handoff files and changed code), multiplied by invocations. Cost uses the rate in monitor.agent.md. The result is order-of-magnitude only.
- Generator input: 5 skills (21,515), generator.agent.md (2,879), CLAUDE.md (9,270), contract (6,155), half of spec.md as an approximation for its relevant sections (6,981), and the in-scope source (32,036): the programmes module including seed (20,610), domainEvents.ts (3,147) and README.md (8,279). Post-change sizes stand in for pre-change sizes. Generator output: the 6 changed programmes files (19,020), the new test (6,130), README.md (8,279) and the generator summary (3,449).
- Evaluator input: 4 skills plus rubric.json (22,614, the same set as sprints 1 to 3), evaluator.agent.md (2,402), CLAUDE.md (9,270), contract (6,155), generator summary (3,449), automated-checks.json (2,309), and the changed and cited files (36,576). Evaluator output: feedback (5,005), llm-checks (2,968) and verdict (7,279).
- Monitor input is the files it actually read (monitor.agent.md, template, index, run-state, verdict, feedback, generator summary, the sprint 3 run log, and the Notes sections of the sprint 1 to 3 feedback, which come to about 2,000 chars). Monitor output counts only the run log and the index row, not the archive copies, to match sprints 1 to 3.
- The measured platform figures are about 2.6× the chars/4 estimate for the agents that were measured (138,500 against 53,436). Across the run the ratio was about 2.3× in sprint 1, 2.5× in sprint 2, 2.7× in sprint 3 and 2.6× in sprint 4. The gap reflects tool-call overhead, system prompts, repeated reads, and command output (for example jest and coverage runs), none of which the file-size method counts. Treat the measured figures as authoritative.
- `RATE_USD_PER_MTOK` is unset, so `est_cost_usd: null`. No price was guessed.

## Quality trend notes
- Iteration 1: no checks failed, hard or soft. The sprint passed on its first attempt with a score of 100.
- Compared with sprints 1 to 3 (the only earlier data points in `.harness/reviews/index.md`), no check id has failed in any sprint of this run, so there is no repeated failure to map to a skill file.
- Measured Generator and Evaluator usage was 138,500 tokens, with 8 changed files. That is above sprints 2 (116,900, 3 files) and 3 (125,300, 7 files) and below sprint 1 (165,100, 9 files). Measured usage for the whole run was 545,800 tokens across the 4 sprints.
- A4, B5 and C3 were flagged as the checks to watch for this sprint, and all three passed. B5 was satisfied by asserting the downstream history entries, since programmes publishes no event.

### Run-level observation (final sprint)
- What the data shows: every sprint in `index.md` (1 to 4) passed on iteration 1 with a score of 100. Every sprint ran the same 16 checks, 7 automated and 9 LLM-judged (A4, A5, A6, B3, B4, B5, C2, C3, C4). That makes 64 check results, including 36 LLM judgements, and none was FAIL. `run-state.json` records `evaluatorRetries: 0`, no escalation and no conditional pass.
- What this does not exercise: the retry loop (iteration 2 or later, the "Feedback addressed" table), escalation (`escalation.md`), the CONDITIONAL PASS acceptance path and Evaluator retries. None of these ran, so this run is no evidence that they work.
- What it tells us about strictness: almost nothing either way. With no FAIL at all, this run cannot tell apart two explanations: the generated code really met every check, or the LLM checks are too lenient to fail anything. The Evaluator's verdicts did cite file:line evidence for every check, and its unscored notes show it noticed weaker points. Examples are the sprint 4 401 test that only checks `error.code` is defined, and the store scoping on the sprint 1 audit endpoint. But in each case it judged that the contract did not require more, and no case was scored as a FAIL. The automated gates (A1, A2, A3, B1, B2, C1, C5) are deterministic, but they also had nothing to catch.
- Evidence a future run would need: (1) at least one LLM check returning FAIL on real or deliberately seeded defects, for example a cross-module repository import for A4, a status-only test for B3, or an untested error code for B4. That would show the checks can fail. (2) At least one iteration-2 sprint, to exercise feedback hand-off and the retry path. (3) Ideally an escalation or a CONDITIONAL PASS, to exercise those branches. (4) More runs in `index.md`, so check-level failure rates can be compared across runs rather than inside one run.

## Skill-file signals
| Signal | Skill file | Suggested change |
|---|---|---|
| None from failures. No check failed on iteration 1, and no check has failed in any sprint of this run. | — | No change suggested. |
| The 401 test only checks that `error.code` is defined, and B4 still passed. | how-to-test / evaluation-criteria (B4) | Optionally require an exact `error.code` assertion on every error path, including existing auth codes. This needs a developer-approved change. |
| No LLM check produced a FAIL across 36 judgements, so its strictness is untested. | evaluation-criteria / how-to-review | Optionally add a seeded-defect calibration case per LLM check, to confirm each one can fail. This needs a developer-approved change. |
| The chars/4 estimate is still about 2.6× below measured usage. | (harness) monitor.agent.md step 2 | Same as sprints 1 to 3: optionally make platform-measured tokens a template field. That needs a developer-approved change, since the Monitor does not edit it. |

## Cost backfill (orchestrator, 2026-10-31)
The run originally logged `est_cost_usd: null` because no rate was configured. After the run the developer set the published claude-opus-5-5 rates in monitor.agent.md, and the orchestrator backfilled the front matter from the measured usage above (138,500 tokens, Generator + Evaluator): **$0.55–$2.77**. The low end prices every token as input and the high end prices every token as output; agent runs are input-heavy, so the true figure is nearer the low end. Nothing else in this log was changed.
