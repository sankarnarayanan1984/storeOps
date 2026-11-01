# Harness review archive (governance audit trail)

Committed, permanent record of every harness sprint decision. Written only by the Monitor agent; never edited by hand after a run.

```
.harness/reviews/
  index.md                          one row per sprint across all runs (trend view)
  <run-id>/                         e.g. 2026-10-30-bulk-status
    spec-proposed.md                as reviewed by the developer (STATUS: AWAITING APPROVAL)
    spec.md                         as approved (STATUS: APPROVED, APPROVED_AT)
    sprint-<N>-contract.md          the contract the Generator implemented
    sprint-<N>-generator-summary.md final iteration's AC self-check, files changed, gaps
    sprint-<N>-evaluator-feedback.md final verdict, per-check results, file:line findings
    sprint-<N>-iter-<K>-evaluator-feedback.md   every earlier iteration (shows the loop)
    sprint-<N>-run-log.md           YAML front matter: verdict, iterations, escalated, est_tokens, scores_by_iteration
    escalation.md                   only if the sprint escalated
```

**Chain of evidence:** `spec.md` quotes the prompt → each contract references the spec → the generator summary maps every contract AC to code and tests → the evaluator feedback verifies each claim with `path:line` → the run log records the outcome.

**Who reads it:** the developer (at the end of a run), PR reviewers (the folder is part of the PR), the standards team (audits; any accepted CONDITIONAL PASS or escalation is visible here), and whoever maintains the skills.

**Detecting recurring problems:** `index.md` lists the hard gates that failed on iteration 1 for every sprint. A check id that keeps appearing (e.g. B3 in three runs) points to the skill file that should prevent it — the mapping is in `.harness/agents/monitor.agent.md` step 3 — and to a skill-file change reviewed like code.
