# Skill: evaluation-criteria

**Purpose:** the StoreOps grading framework — dimensions, weights, hard gates, verdict rules and the ambiguity fallback. Read by the Evaluator (to grade) and the Monitor (to interpret trends). The machine-readable source of truth is `rubric.json` in this folder; `compute-verdict.mjs` applies it. If this file and `rubric.json` ever disagree, `rubric.json` wins and the disagreement is a harness defect to report.

## Dimensions
| Dim | Weight | Why it carries this weight for StoreOps |
|---|---|---|
| **A — Architecture compliance** | 40% | Three of the four client failure modes (FM1, FM2, FM4) are architectural; the standards team's veto rests here. |
| **B — Behaviour & test evidence** | 35% | FM3 (status-only tests) plus the coverage thresholds the client mandated (§3.6). |
| **C — Contract fidelity & hygiene** | 25% | Keeps the Generator inside its contract and stops it weakening the gates it is judged by. |

Each check is binary. A dimension's score = weight × (checks passed ÷ checks in dimension). Total = sum, rounded to 0.1.

## Checks
| Id | Check | Type | Gate | Failure mode |
|---|---|---|---|---|
| A1 | dependency-cruiser: 0 violations (cross-module repository/service imports, reports read-only, cycles) | automated | **HARD** | FM1 |
| A2 | `eslint .`: 0 errors (raw `Error` throws, import restrictions, type-aware rules) | automated | **HARD** | FM2 |
| A3 | `tsc --noEmit`: 0 errors | automated | **HARD** | — |
| A4 | cross-module side effects only via `events.publish` of a declared event | LLM | **HARD** | FM4 |
| A5 | layer separation routes → service → repository | LLM | **HARD** | — |
| A6 | contract's error classes and codes used | LLM | soft | FM2 |
| B1 | `jest`: all tests pass | automated | **HARD** | — |
| B2 | coverage thresholds (services 80 / routes 70 / shared 60 / overall 70) | automated | **HARD** | FM3 |
| B3 | every AC has a test asserting body/state/event | LLM | **HARD** | FM3 |
| B4 | every error AC asserts `error.code` | LLM | soft | FM3 |
| B5 | every published event asserted by a test | LLM | soft | FM4 |
| C1 | protected files unchanged since approval (hash snapshot) | automated | **HARD** | — |
| C2 | generator-summary complete and truthful | LLM | soft | — |
| C3 | changes within contract scope | LLM | soft | — |
| C4 | README tables updated | LLM | soft | — |
| C5 | no `console.log` in src, no `.only/.skip` | automated | soft | — |

Every dimension has at least one **automated** hard gate (A1–A3, B1–B2, C1), so the gate most likely to catch a regression cannot be argued with by an LLM.

## Verdict rules (applied in order by `compute-verdict.mjs`)
1. Any HARD check FAIL → **FAIL**
2. Any dimension below 50% of its weight → **FAIL**
3. Score ≥ 90 → **PASS**
4. Score ≥ 75 → **CONDITIONAL PASS**
5. Otherwise → **FAIL**

What this means in practice: with all hard gates green, one soft miss still PASSes (e.g. 93.3), two soft misses in different dimensions give CONDITIONAL PASS (e.g. 88.3), and soft misses alone can only reach FAIL via rule 2 or 5.

## Handling non-determinism
| Source of variability | Control |
|---|---|
| Generated code differs run to run | Judged only through binary checks with explicit pass conditions; style is never scored |
| Evaluator leniency/strictness drift | Hard gates that matter most are automated; LLM checks require `path:line` evidence; "unsure → FAIL" |
| Evaluator arithmetic / verdict wording | Verdict computed by script from per-check results; the Evaluator cannot write the verdict |
| Missing or malformed check result | Counted as FAIL by the script (`missingResult: FAIL`) |
| Malformed `evaluator-feedback.md` (no `VERDICT:` line or no verdict.json) | Orchestrator re-runs the Evaluator once (not counted as an iteration); second failure escalates as `HARNESS_FAULT` |
| Generator gaming the gate | C1 hashes protected files at approval; any change is a hard fail |

## How the orchestrator routes a verdict
| Verdict | Iteration < 3 | Iteration = 3 |
|---|---|---|
| PASS | Monitor → next sprint | Monitor → next sprint |
| CONDITIONAL PASS | Generator retries with the feedback | Accepted: Monitor logs `accepted_conditional: true` + follow-ups; next sprint |
| FAIL | Generator retries with the feedback | Escalate (`escalation.md`), Monitor logs `escalated: true`, stop |
