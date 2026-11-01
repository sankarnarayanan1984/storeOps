# Demonstration run prompt

Feature chosen from capstone brief §3.4: **shift handover bulk update**. Paste the block below into Claude Code in this repository to start the harness run.

```text
@planner Add shift handover bulk update to activities.

Outgoing shift staff need to close out their shift in one request instead of updating
activities one by one. Add PATCH /api/activities/bulk-status (signed in) that marks
several operational activities as DONE or BLOCKED in a single request.

- Body: { ids: string[] (1–50, no duplicates), status: "DONE" | "BLOCKED", note?: string }.
- Partial failure handling: process each id independently. One bad id must not fail the
  others. Respond 200 with a per-id result (updated, or failed with the AppError code and
  message — e.g. NOT_FOUND for an unknown id, INVALID_STATUS_TRANSITION for a DONE task,
  FORBIDDEN for another store's task) and a summary count of updated and failed.
- Staff can only bulk-update activities in their own store; REGIONAL_MANAGER can update any
  store in their region.
- Write an audit entry per updated task: task id, from-status, to-status, actor, the note,
  and a handover batch id shared by all entries of the request. Expose the trail at
  GET /api/activities/:id/audit.
- Keep the event-bus contract: publish activity.status_changed for every task that changed,
  so existing alerts (BLOCKED → INVENTORY/ESCALATION) and report metrics keep working, and
  publish one activity.handover_completed event per request. The alerts module turns it
  into a SHIFT_HANDOVER notification for the store's STORE_MANAGER listing how many tasks
  were closed and how many were blocked.
- Follow the StoreOps architecture rules and add tests that prove each rule, not just
  status codes.
```

The developer's remaining actions: review `.harness/output/spec.md`, then type `APPROVED`.
