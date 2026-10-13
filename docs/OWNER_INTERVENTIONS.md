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

## OI-001 — Emoji completion interaction and search scope

- Requested: 2026-10-13 23:29 UTC; Codex primary; optional emoji completion implementation.
- Action and purpose: Resolve interaction and search scope before implementing PD-005.
- Context/evidence: The owner requested implementation of emoji completion. PD-005 records explicit acceptance and literal-text preservation, but labels the detailed interaction as proposed and leaves search names and matching unresolved.
- Trigger: Material main-flow gaps under AGENTS.md §5 and Agent Workflow Procedures §§5 and 14.
- Earlier occurrence: None found.
- Outcome: Approved in the conversation; implement the recommended interaction and English shortcode prefix matching with a bundled Unicode emoji catalog.
- Persistence: Not applicable; product decision.
- Follow-up: Unanalyzed. Recommend the recorded keyboard interaction with English shortcode prefix matching and a bundled Unicode emoji catalog; retain literal text until explicit acceptance.

## OI-002 — Real Electron emoji completion validation

- Requested: 2026-10-13 approximately 23:34 UTC; Codex primary; optional emoji completion.
- Action and purpose: Run `npm run test:e2e -- e2e/emoji-completion.spec.ts e2e/agenda-completion.spec.ts --workers=1` outside the sandbox to verify real editor behavior and capture screenshots.
- Context/evidence: Unit and input-binding checks passed. Native renderer behavior and visual evidence remain required.
- Trigger: AGENTS.md §4 and Agent Workflow Procedures §4 require Codex Electron E2E to use `sandbox_permissions: require_escalated` from the first invocation.
- Earlier occurrence: None recorded in this log; historical configuration is not proof of current access.
- Outcome: Execution succeeded; all 20 selected tests passed, including native emoji insertion and deletion. Approval UI clicks are unknown.
- Persistence: The supported escalated workflow executed in this session; new-session persistence is unverified.
- Follow-up: Unanalyzed; use the supported named workflow without changing permission configuration.

## OI-003 — Verify added plain-textarea completion case

- Requested: 2026-10-13 approximately 23:35 UTC; Codex primary; optional emoji completion.
- Action and purpose: Run `npm run test:e2e -- e2e/emoji-completion.spec.ts --workers=1` outside the sandbox after adding plain textarea and preserved-suffix coverage.
- Context/evidence: OI-002 passed all existing scenarios; the additional case exercises a different input element. Production sources are unchanged since that pass.
- Trigger: Codex Electron escalation requirement in AGENTS.md §4; necessary new test inputs invalidate their own validation.
- Earlier occurrence: OI-002 established this session's supported workflow execution.
- Outcome: Execution succeeded; all six emoji tests passed, including the additional plain-textarea case in both modes.
- Persistence: Supported workflow executed again in this session; new-session access and UI clicks remain unknown.
- Follow-up: Unanalyzed; reuse the named workflow and keep existing date results.

## OI-004 — Reproduce overflowing emoji keyboard selection

- Requested: 2026-10-13 23:39 UTC; Codex primary; optional emoji completion.
- Action and purpose: Run `npm run test:e2e -- e2e/emoji-completion.spec.ts --grep "all keyboard-selected" --workers=1` outside the sandbox to reproduce the product verifier's eight-option overflow finding.
- Context/evidence: Product verifier identified that keyboard selection never scrolls and eight options exceed the existing popup height. Add a failing real-renderer regression before correction.
- Trigger: Electron escalation under AGENTS.md §4 and defect-first testing under §9.
- Earlier occurrence: OI-002 and OI-003 verified named workflow access in this session.
- Outcome: Both editing-mode regressions failed because the selected suggestion extended below the popup's visible box, confirming the finding.
- Persistence: New-session access and UI clicks unknown.
- Follow-up: Unanalyzed; focused reproduction, then repair and rerun invalidated checks.

## OI-005 — Validate visible selection and constrained popup height

- Requested: 2026-10-13 approximately 23:40 UTC; Codex primary; optional emoji completion.
- Action and purpose: Run `npm run test:e2e -- e2e/emoji-completion.spec.ts e2e/agenda-completion.spec.ts --workers=1` outside the sandbox after correcting scroll-to-selection and popup height.
- Context/evidence: OI-004 confirmed the overflowing selection defect. Shared popup presentation changed; both completion families and inspected screenshots require fresh evidence.
- Trigger: Codex Electron escalation under AGENTS.md §4 and validation reuse/invalidation policy under §10.
- Earlier occurrence: OI-002 through OI-004 executed the supported workflow in this session.
- Outcome: Execution succeeded; all 24 tests passed, including visible selection in both modes and unchanged date screenshot baselines.
- Persistence: New-session access and UI clicks unknown.
- Follow-up: Unanalyzed; rerun affected presentation checks and independent finding verification.
