# Owner Intervention Log

This committed log records platform permission requests and task interruptions requiring a Product Owner response. Its recording policy is owned by [AGENTS.md §4](../AGENTS.md#4-general-working-rules). It supplies evidence for an owner-requested analysis after a task; it is not an authorization source or a validation archive.

The Product Owner authorized this log on 2026-10-13 to reduce repeated interruptions without extending readiness preparation. Recording begins with this change. Earlier readiness interventions remain in their existing evidence; they have not been reconstructed here.

## Entry Format

Use one entry per request, with a stable identifier such as `OI-001`. Update the same entry after the response and any later confirmed correction. Use a UTC timestamp and name the coding tool and task. Keep entries factual and short; omit secrets and personal data from command arguments and paths. Include the client/version, mode, and primary/child context when relevant and known; do not run unrelated diagnostics to populate fields. Link retained evidence in `.scratch/<task>/` when a sanitized error or exact command is needed to explain the cause. Do not infer owner click counts from escalated tool calls.

```md
## OI-NNN — Short description

- Requested: YYYY-MM-DD HH:MM UTC; tool; task.
- Action and purpose: Concrete operation and why the task needs it.
- Context/evidence: Relevant launch context and sanitized command/error or scratch reference; unknown details stay unknown.
- Trigger: Platform restriction, exact repository rule, or unresolved owner decision; cite the source when available. Mark an agent inference explicitly.
- Earlier occurrence: Entry ID, none found, or not checked with the reason.
- Outcome: Pending, approved, denied, canceled, or answered; record the observable result after the response.
- Persistence: Confirmed for the observed command/scope in this session or a named subsequent session, unknown, or not applicable. Approval in another tool is not evidence here.
- Follow-up: Unanalyzed; proposed correction or justified remaining gate after authorized recording; applied commit if any; verification evidence or not yet exercised. Keep proposal, implementation, and effectiveness separate.
```

## improve-permissions procedure

The alias and authorization boundary are defined in [AGENTS.md §4](../AGENTS.md#improve-permissions). The agent performs the following procedure without asking the owner to select records or repeat instructions.

1. Select unanalysed entries and applied corrections whose effectiveness is unresolved or contradicted by a recurrence. Include matching earlier entries and existing evidence when needed; do not reconstruct old readiness history as a new project. If no actionable records exist, say so and stop.
2. Inspect the relevant evidence, current repository rules, and effective settings that can be read through authorized tools. Check current official documentation before proposing a tool-specific mechanism. Separate an observed restriction from an agent inference, command misuse, instruction-discovery failure, test/fixture defect, owner decision, or genuinely missing capability. Unknown causes stay unknown.
3. Group matching causes within each tool and scope. Count observed requests, recurrences, and stops requiring owner response from those records. Identify required owner actions and whether subsequent relevant operations exercised a correction. Do not equate command escalations with UI clicks, silence with success, or one tool's access with another's.
4. Recommend the smallest correction. First use existing authorized workflows and correct agent mistakes. Where access really is missing, present the exact proposed settings diff, scope, allowed and excluded examples, expected effect, verification, and rollback. Explain gates that should remain. Do not propose broad interpreter/shell permissions, bypass a denial, or weaken role restrictions.
5. Report the recommendation first, with evidence and only decisions that need the owner. The default output is in the conversation: no file or settings edits, persistent analysis-status updates, tests, permission probes, or runtime launches are authorized by the alias. Required intervention logging under §4 remains the sole recording exception. The owner may separately authorize saving the analysis.
6. After explicit authorization to apply the presented changes, perform the edits, applicable validation/review, and commit workflow. Record the correction and its status in the relevant entries with that change. A platform approval, authentication step, or protected-settings edit may still need owner action; explain the precise requirement. Do not broaden the approved diff or switch tools to bypass a restriction.

For later product work, the agent records the outcome when an already necessary operation exercises a prior correction. Until then its effectiveness is “not yet exercised.” Use the next requested analysis to assess benefit; do not append a metrics report to every product handoff or require reminders. Fresh-session verification is needed before claiming persistence across sessions, and must identify the observed tool and scope. If only configuration matching was checked, report that narrower fact. This procedure grants no authority to resume deferred infrastructure, run unrelated validation, or build an execution system.

## Entries

No requests have been recorded yet.
