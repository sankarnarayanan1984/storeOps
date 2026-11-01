# StoreOps — Claude Code instructions and harness orchestrator

This repository is the StoreOps API (TypeScript, Express 5, in-memory) plus a **governed development harness**. This file is read automatically by Claude Code. The main session acts as the **orchestrator**: it routes work between four agents through files in `.harness/output/` and never writes feature code itself.

Spec of record: `docs/capstone-brief.md`. Project overview: `README.md`.

---

## 1. Outside a harness run
For ordinary questions and small fixes, work normally but respect `.harness/skills/architecture-principles/SKILL.md` (module boundaries, event bus, AppError, layers, read-only reports) and keep `npm run check` green.

---

## 2. Starting a harness run (entry prompt format)

```
@planner <feature request in one or more sentences>
```
Example: `@planner Add shift handover bulk update: PATCH /api/activities/bulk-status …` (full text in `PROMPT.md`).

The developer's only actions are: (1) send the `@planner` prompt, (2) type `APPROVED` after reviewing `spec.md`, and (3) answer an escalation if one occurs. Everything else is driven by this file.

Other commands the orchestrator recognises:
| Command | Effect |
|---|---|
| `APPROVED` | start the Generator/Evaluator loop (only when `spec.md` says `STATUS: AWAITING APPROVAL`) |
| `CHANGES: <notes>` | re-invoke the Planner with the notes; spec returns to AWAITING APPROVAL |
| `RETRY SPRINT <N>: <guidance>` | after an escalation: append guidance to the contract, reset that sprint's iteration count, resume |
| `REPLAN` | after an escalation: Planner revises spec/contracts from `escalation.md`; needs a new `APPROVED` |
| `ABORT` | stop; Monitor archives what exists |
| `HARNESS STATUS` | print `run-state.json` as a short table |

---

## 3. Agents

| Agent | Definition | Subagent (`.claude/agents/`) | Produces |
|---|---|---|---|
| Planner | `.harness/agents/planner.agent.md` | `planner` | `spec.md`, `sprint-<N>-contract.md` |
| Generator | `.harness/agents/generator.agent.md` | `generator` | code + tests in `src/`, `tests/`; `sprint-<N>-generator-summary.md` |
| Evaluator | `.harness/agents/evaluator.agent.md` | `evaluator` | `sprint-<N>-llm-checks.json`, `sprint-<N>-evaluator-feedback.md` (verdict via script) |
| Monitor | `.harness/agents/monitor.agent.md` | `monitor` | `.harness/reviews/<run-id>/…`, `sprint-<N>-run-log.md`, `reviews/index.md` row |

**How to invoke an agent:** use the Agent tool with `subagent_type` set to the subagent name, and a prompt containing only the parameters (`RUN_ID`, `SPRINT`, `ITERATION`, outcome) and the instruction "Follow `.harness/agents/<name>.agent.md`." If the named subagent isn't available in this session (e.g. the session started before `.claude/agents/` existed), use `general-purpose` with the same prompt prefixed by "You are the StoreOps harness <Name>. Read and follow `.harness/agents/<name>.agent.md` exactly." Run agents **in the foreground, one at a time** — each step depends on the previous file.

Each agent returns a single status line (defined at the end of its agent file). The orchestrator does not read the code; it reads markers.

---

## 4. Sequence and routing

```
@planner prompt
  └─► Planner ──► spec.md (STATUS: AWAITING APPROVAL) + sprint-N-contract.md
        └─► orchestrator shows summary, STOPS, waits for the developer
              ├─ CHANGES: … ─► Planner again
              └─ APPROVED
                   1. copy spec.md → spec-proposed.md (as reviewed, marker intact); then spec.md line 1 → STATUS: APPROVED + line 2 APPROVED_AT: <ISO>
                   2. node .harness/scripts/run-checks.mjs --snapshot   (protected-file hashes for C1)
                   3. write run-state.json (baseRef = `git rev-parse HEAD`)
                   └─► for each sprint N:
                         for ITERATION K = 1..3:
                           Generator(N, K) ──► code + generator-summary
                           Evaluator(N, K) ──► evaluator-feedback (VERDICT line)
                           copy feedback + verdict.json to sprint-N-iter-K-* ; update run-state
                           route on VERDICT (table below)
                         Monitor(N) ──► reviews/<run-id>/sprint-N-run-log.md
  └─► all sprints done ─► run-state COMPLETE, final summary to developer
```

### Reading the verdict (machine-readable markers)
After the Evaluator returns, read **only the first five lines** of `.harness/output/sprint-<N>-evaluator-feedback.md`:
```
VERDICT: PASS | CONDITIONAL PASS | FAIL
SCORE: <n>
HARD_GATES_FAILED: none | <ids>
SPRINT: <N>
ITERATION: <K>
```
Cross-check `VERDICT` against `.harness/output/sprint-<N>-verdict.json` → `verdict`. They must match.

### Routing table (MAX_ITERATIONS = 3)
| Verdict | K < 3 | K = 3 |
|---|---|---|
| **PASS** | Monitor(N) → next sprint | Monitor(N) → next sprint |
| **CONDITIONAL PASS** | Generator(N, K+1) with the feedback | accept: sprint status `ACCEPTED_CONDITIONAL`, Monitor(N) logs follow-ups → next sprint |
| **FAIL** | Generator(N, K+1) with the feedback | **escalate** (§5), Monitor(N), stop |
| **Malformed** (no `VERDICT:` line, or it disagrees with verdict.json) | re-run Evaluator(N, K) once — does not count as an iteration; still malformed → escalate `HARNESS_FAULT` | same |

Why CONDITIONAL PASS retries while iterations remain: a PASS is cheap to reach from 75–89 and every accepted soft miss becomes debt in main; at K = 3 the cost of another loop outweighs the soft finding, so it is accepted and made visible in the run log instead.

---

## 5. Escalation
Triggered by FAIL at iteration 3, a second malformed evaluation (`HARNESS_FAULT`), or a Planner "Decisions needed" item that blocks implementation (`SPEC_CONFLICT`).

The orchestrator writes `.harness/output/escalation.md` from `.harness/templates/escalation.md` naming: **sprint, iteration count, last verdict and score, the blocking finding(s) with path:line, findings that repeated across iterations, the likely cause, and the reply options**. Then it invokes the Monitor (escalated: true), sets run-state `ESCALATED`, prints the escalation summary and the file path, and **stops**.

**Receiver:** the developer who started the run (in-session). For the squad, the escalation file is committed with the review archive so the tech lead / standards team can see it at PR review. Expected response: `RETRY SPRINT <N>: <guidance>`, `REPLAN` or `ABORT`.

---

## 6. Context scoping (keeping long runs healthy)
- **One fresh subagent per agent invocation.** No agent sees another agent's conversation; all context passes through the handoff files listed in its agent definition. This is the context reset between Generator and Evaluator and between sprints.
- **Fixed, minimal reading lists.** Each agent file lists exactly which skills and outputs it reads. The Generator reads only the latest feedback (not earlier iterations); the Evaluator reads only changed files from `automated-checks.json`; nobody reads `.harness/reviews/` except the Monitor.
- **The orchestrator stays thin.** It reads only status lines, the five marker lines, `verdict.json` and `run-state.json` — never source code or full feedback. Its context grows by a few lines per iteration, so a 3-sprint × 3-iteration run stays small.
- **Resumable state.** `.harness/output/run-state.json` holds run id, base commit, current sprint, iterations and verdicts. If the session is compacted or restarted, re-read it (and the latest markers) and continue from the recorded step instead of relying on memory.
- **Skill depth vs. tokens.** Skills are read on every invocation, so each is scoped to one concern and to the agents that need it (e.g. the Evaluator does not load generation recipes; `app-context` is ~1 page). Detail lives in the skill that a check depends on, not everywhere.

---

## 7. Orchestrator bookkeeping (do these every time)
- After each Evaluator run: copy `sprint-<N>-evaluator-feedback.md` → `sprint-<N>-iter-<K>-evaluator-feedback.md` and `sprint-<N>-verdict.json` → `sprint-<N>-iter-<K>-verdict.json`; update `run-state.json` (`iterations`, push verdict).
- Never edit a verdict, a contract after approval (except `RETRY SPRINT` guidance appended under a `## Developer guidance` heading), or a protected file.
- Do not commit. At the end, tell the developer which files to review and commit: source/tests changed by the Generator and `.harness/reviews/<run-id>/`. `.harness/output/` is gitignored working state.

---

## 8. Relationship to CI/CD
The harness **precedes and feeds** CI; it does not replace it.
- The Evaluator's automated hard gates run the same commands as the pipeline (`tsc --noEmit`, `eslint .`, `depcruise`, `jest --coverage`), so a harness PASS predicts a green CI run.
- CI (`.github/workflows/ci.yml` → `npm run check`) remains the authoritative merge gate on every PR, including PRs written without the harness.
- Deployment is gated the same way: `.github/workflows/deploy-azure.yml` runs `npm run check` before `infra/azure/deploy.sh`, so nothing reaches Azure Container Apps that would fail the harness's automated hard gates or CI.
- The harness adds what CI can't: contract/AC verification and LLM-assessed rules (A4 event bus, A5 layers, B3 outcome tests). Their evidence travels with the PR as `.harness/reviews/<run-id>/` so human reviewers see why each sprint was accepted.
- Harness files live in `.harness/` (and subagent shims in `.claude/agents/`), separate from pipeline config in `.github/`.
