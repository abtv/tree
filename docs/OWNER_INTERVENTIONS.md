# Owner Intervention Log

This committed log records platform permission requests and task interruptions requiring a Product Owner response. Its recording policy is owned by [AGENTS.md §4](../AGENTS.md#4-general-working-rules). It supplies evidence for an owner-requested analysis after a task; it is not an authorization source or a validation archive.

The Product Owner authorized this log on 2026-10-13 to reduce repeated interruptions without extending readiness preparation. Recording begins with this change. Earlier readiness interventions remain in their existing evidence; they have not been reconstructed here.

## Entry Format

Use one entry per new intervention kind, with a stable identifier such as `OI-001`. Match by coding tool, underlying restriction or decision cause, and required owner action; differing test arguments or repetitions are not new kinds. Existing per-request entries are historical and need not be rewritten. Do not add an entry merely because a tool call requests escalation. Update an existing entry only when evidence materially changes its cause, correction, or verification status. Use a UTC timestamp and name the coding tool and task. Keep entries factual and short; omit secrets and personal data. Include client/version, mode and primary/child context when relevant and known, without unrelated diagnostics. Do not infer owner click counts from escalated tool calls.

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

1. Select unanalysed entries and applied corrections whose effectiveness is unresolved or contradicted by a recurrence. Also inspect `.scratch/permission-requests/events.jsonl` when present: it supplies minimal Codex permission-request metadata independently of agent-written entries. A hook event does not prove a visible owner prompt, response, or execution outcome. Unknown operations remain unknown; do not reconstruct commands or secrets from other session files. Include matching earlier entries and existing evidence when needed; do not reconstruct old readiness history as a new project. If no actionable records exist, say so and stop.
2. Inspect the relevant evidence, current repository rules, and effective settings that can be read through authorized tools. Check current official documentation before proposing a tool-specific mechanism. Separate an observed restriction from an agent inference, command misuse, instruction-discovery failure, test/fixture defect, owner decision, or genuinely missing capability. Unknown causes stay unknown.
3. Group matching causes within each tool and scope. Count observed requests, recurrences, and stops requiring owner response from those records. Identify required owner actions and whether subsequent relevant operations exercised a correction. Do not equate command escalations with UI clicks, silence with success, or one tool's access with another's.
4. Recommend the smallest correction. First use existing authorized workflows and correct agent mistakes. Where access really is missing, present the exact proposed settings diff, scope, allowed and excluded examples, expected effect, verification, and rollback. Explain gates that should remain. Do not propose broad interpreter/shell permissions, bypass a denial, or weaken role restrictions.
5. Report the recommendation first, with evidence and only decisions that need the owner. The default output is in the conversation: no file or settings edits, persistent analysis-status updates, tests, permission probes, or runtime launches are authorized by the alias. Required intervention logging under §4 remains the sole recording exception. The owner may separately authorize saving the analysis.
6. After explicit authorization to apply the presented changes, perform the edits, applicable validation/review, and commit workflow. Record the correction and its status in the relevant entries with that change. A platform approval, authentication step, or protected-settings edit may still need owner action; explain the precise requirement. Do not broaden the approved diff or switch tools to bypass a restriction.

For later product work, the agent records the outcome when an already necessary operation exercises a prior correction. Until then its effectiveness is “not yet exercised.” Use the next requested analysis to assess benefit; do not append a metrics report to every product handoff or require reminders. Fresh-session verification is needed before claiming persistence across sessions, and must identify the observed tool and scope. If only configuration matching was checked, report that narrower fact. This procedure grants no authority to resume deferred infrastructure, run unrelated validation, or build an execution system.

## Entries

## OI-015 — Trust the minimal Codex permission logger

- Requested: Prepared 2026-10-14 22:30 UTC; Codex primary; automatic minimal permission-request recording. Activation instruction will be delivered after implementation checks.
- Action and purpose: Restart Codex in this repository, open `/hooks`, review and trust the project `PermissionRequest` logging handler so future supported approval requests leave local metadata independently of agent-written entries.
- Context/evidence: The owner authorized implementation after accepting a privacy boundary of timestamp, tool category and known operation only. Installed `codex-cli 0.162.1` reports the hooks feature enabled. Unit and actual stdin/subprocess tests verify the handler, but do not establish activation in the owner's client.
- Trigger: Official Codex hook trust requires review of the exact definition before a non-managed hook runs; `.codex/` project trust and enabling hooks do not replace that review. Source: https://learn.chatgpt.com/docs/hooks#review-and-trust-hooks.
- Earlier occurrence: None found for hook trust. OI-014 established a missed owner prompt, not a hook activation request.
- Outcome: Pending owner activation; no trust action or live request capture observed.
- Persistence: Not yet exercised in a fresh trusted session. Hook events do not establish visible prompts, owner clicks or execution outcomes.
- Follow-up: Implemented `.codex/hooks.json` and `scripts/codex-permission-log.mjs` with privacy and real-process tests in this change; automatic approval policy is unchanged. Activation and effectiveness remain unverified. Verify at the next already necessary permission request after activation by inspecting `.scratch/permission-requests/events.jsonl`. Do not use an unrelated probe or infer success from missing requests. Keep this distinction in later permission analysis.

## OI-014 — Timed E2E command requires separate approval

- Requested: Previous session; exact request date and UTC time unknown. Recorded 2026-10-14 22:20 UTC; Codex primary; fold expansion test pilot baseline.
- Action and purpose: Run `/usr/bin/time -p npm run test:e2e:diagnose -- --json-output=.scratch/fold-expand-test-pilot/before.json e2e/inline-expansion.spec.ts --workers=6 --reporter=dot,json` to measure the complete baseline command.
- Context/evidence: The owner supplied a screenshot in this conversation showing the command and an explicit approval prompt. The preceding agent message states that the first baseline omitted the complete command timer and overlapped fast tests with E2E execution. No response selection or command result is visible. This request was missing from the log when the owner invoked permission analysis.
- Trigger: The tracked Codex rules allow the named npm workflow, but do not contain the `/usr/bin/time -p` prefix. The wrapper changes the command prefix; this explains the prompt, although the previous session's complete effective configuration is unknown.
- Earlier occurrence: OI-002 through OI-010 cover direct npm E2E executions, not the timer wrapper; no matching wrapper entry found.
- Outcome: Owner approval prompt observed; response and execution outcome unknown.
- Persistence: Unknown; no repository rule for this wrapper exists, and the screenshot does not establish that a persistent client rule was selected.
- Follow-up: Proposed a narrowly scoped prefix for `/usr/bin/time -p npm run test:e2e:diagnose`; not authorized or applied. This change records the missed case and requires complete-prefix checks and session request reconciliation in Agent Workflow Procedures §4. Effectiveness of that workflow correction is not yet exercised by a subsequent permission request.

## OI-012 — Writable workspace excludes authorized source files

- Requested: 2026-10-14; Codex primary; workflow simplification.
- Action and purpose: Reopen the repository root as writable to apply the five authorized workflow changes.
- Context/evidence: The preceding session could write only scratch files; its handoff retained a prepared patch without applying it to source or settings. Logging in this file was also blocked.
- Trigger: Runtime workspace restriction; repository workflow requires supported access rather than bypassing that restriction.
- Earlier occurrence: None recorded for this cause.
- Outcome: The owner resumed with the repository root writable; native edits to source documentation and Claude settings succeeded in this session.
- Persistence: Verified for this session only; no inference about the owner's UI actions or future sessions.
- Follow-up: Use the repository root as the writable workspace for repository tasks. No permission-rule expansion was needed.

## OI-013 — Retire deferred evidence and relocate live documentation

- Requested: 2026-10-14; Codex primary; workflow simplification.
- Action and purpose: Delete four retained infrastructure scratch directories and move deferred runner/preflight procedures with their dependent links.
- Context/evidence: The preceding handoff recorded both confirmations as pending. Durable scratch conclusions were already recorded in the deferred plan and Git history.
- Trigger: Explicit confirmation for destructive cleanup and the requested change to documentation with live dependents.
- Earlier occurrence: None recorded for this cause.
- Outcome: Explicitly authorized in the continuation request on 2026-10-14, with general planning and acceptance preserved and no push to origin.
- Persistence: Task-specific authorization; it does not resume deferred work, renew budgets, or authorize retrying canceled actions.
- Follow-up: Apply the scoped cleanup and relocation in this task; no further confirmation is needed.

### Codex E2E evidence shared by OI-002 through OI-010

On 2026-10-14, the preceding workflow-simplification session checked the combined existing tests.rules and e2e.rules: the named E2E command matched allow. Its necessary navigation sibling-arrow test execution built successfully and passed both cases without an observed owner interruption. This establishes that session and command scope only. Escalation itself is not an owner prompt; no Codex permission expansion was needed. Future-session persistence remains unknown.

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

## OI-006 — Reproduce emoji caret movement

- Requested: 2026-10-13 23:46 UTC; Codex primary; single-step emoji caret defect.
- Action and purpose: Run `npm run test:e2e -- e2e/emoji-caret.spec.ts --workers=1` outside the sandbox to compare native arrows and Vim h/l across whole Unicode emoji.
- Context/evidence: Owner reports needing two steps. Clean starting commit 5cc1d50. No production changes; regression covers plain/rich Tree and Agenda in both editing modes.
- Trigger: Codex Electron escalation under AGENTS.md §4; defect-first workflow under §9.
- Earlier occurrence: OI-002 through OI-005 verified supported workflow execution in this session.
- Outcome: All standard/Insert arrow assertions passed. Vim Normal's plain-input block selected one UTF-16 unit instead of the complete rocket; rich/Agenda Normal cases initially stopped on an invalid multi-digit test key, corrected to a typed count before revalidation.
- Persistence: Same-session workflow established; new-session access and UI clicks unknown.
- Follow-up: Unanalyzed; reproduce before selecting the focused correction.

## OI-007 — Validate grapheme-aware Normal movement

- Requested: 2026-10-13 approximately 23:51 UTC; Codex primary; single-step emoji caret defect.
- Action and purpose: Run `npm run test:e2e -- e2e/emoji-caret.spec.ts --workers=1` outside the sandbox after correcting character stepping and full-emoji block projection.
- Context/evidence: OI-006 established the Normal-mode defect; standard/Insert native arrows already passed. New pure character boundaries preserve existing UTF-16 storage offsets.
- Trigger: Codex Electron escalation under AGENTS.md §4 and defect validation under §9.
- Earlier occurrence: OI-006 verified this session's supported workflow.
- Outcome: All six Electron cases passed with full-emoji Normal blocks, one-step movement and unchanged native arrows.
- Persistence: New-session access and UI clicks unknown.
- Follow-up: Unanalyzed; validate the reproduced route and nearby state transitions.

## OI-008 — Broaden emoji caret regression validation

- Requested: 2026-10-13 approximately 23:55 UTC; Codex primary; single-step emoji caret defect.
- Action and purpose: Run `npm run test:e2e -- e2e/emoji-caret.spec.ts e2e/emoji-completion.spec.ts e2e/vim-navigation-and-visual.spec.ts e2e/vim-image-caret.spec.ts e2e/agenda-caret.spec.ts --workers=6` outside the sandbox after shared character-boundary changes.
- Context/evidence: Initial focused caret cases passed; Visual ranges, stand-in row carets and image returns now share grapheme boundaries. Existing native fixtures and isolated synthetic data are used.
- Trigger: Codex Electron escalation under AGENTS.md §4; broadened shared-interaction validation under §§9–10.
- Earlier occurrence: OI-006 and OI-007 verified supported execution in this session.
- Outcome: All 145 affected Electron cases passed, including the new image/emoji and Visual checks. No permission interruption was observed.
- Persistence: New-session access and UI clicks unknown.
- Follow-up: Unanalyzed; validate affected existing paths without reopening infrastructure work.

## OI-009 — Inspect full-emoji blocks in dark appearance

- Requested: 2026-10-13 23:59 UTC; Codex primary; single-step emoji caret defect.
- Action and purpose: Run `npm run test:e2e -- e2e/emoji-caret.spec.ts --workers=1` outside the sandbox after adding dark joined-emoji caret captures for plain/rich Tree and Agenda.
- Context/evidence: All 145 affected tests already passed on unchanged production sources. Light screenshots inspected; dark compound-emoji captures require new evidence.
- Trigger: Electron escalation under AGENTS.md §4; inspected appearance-specific visual evidence under §9.
- Earlier occurrence: OI-008 established broadened passing execution in this session.
- Outcome: All seven focused cases passed, with dark joined-emoji captures produced for all three input contexts.
- Persistence: New-session access and UI clicks unknown.
- Follow-up: Unanalyzed; retain existing broad validation and check only the additional visual inputs.

## OI-010 — Verify Visual restoration and Insert entry boundaries

- Requested: 2026-10-14 approximately 00:02 UTC; Codex primary; single-step emoji caret defect.
- Action and purpose: Run `npm run test:e2e -- e2e/emoji-caret.spec.ts e2e/vim-navigation-and-visual.spec.ts --workers=6` outside the sandbox after correcting `gv` and `a` caret boundaries.
- Context/evidence: Independent reviewer found gv still used a one-code-unit endpoint. New failing unit regressions confirmed gv and a stop inside a compound emoji; shared boundary helper now resolves both.
- Trigger: Electron escalation under AGENTS.md §4 and required finding resolution under §13.
- Earlier occurrence: OI-008 and OI-009 established passing native checks in this session.
- Outcome: All 90 selected Electron cases passed, including restored compound-emoji deletion/Undo and native arrows after a.
- Persistence: New-session access and UI clicks unknown.
- Follow-up: Unanalyzed; validate corrected paths and reuse unchanged image/Agenda/completion evidence.

## OI-011 — Run unit coverage with nested Git fixtures outside the sandbox

- Requested: 2026-10-14; Claude Code primary in auto mode; scratch cleanup workflow.
- Action and purpose: Rerun `npm run check` with the sandbox disabled so unit fixtures can initialize nested Git repositories under `.scratch/`.
- Context/evidence: The sandboxed run failed in initiative-runner and readiness tests with `fatal: cannot copy .../templates/hooks/commit-msg.sample to .../.scratch/<namespace>/.../.git/hooks/commit-msg.sample: Operation not permitted`; the sandbox denies writes to nested `.git/hooks` paths. Static checks had already passed.
- Trigger: Sandbox-caused failure of required Low Risk validation under AGENTS.md §10.
- Earlier occurrence: None recorded for Claude Code.
- Outcome: Approved without an observed owner prompt; 171 test files and 3624 tests passed, and the full check passed.
- Persistence: Per-command for the original run; the exact `sandbox.excludedCommands` entry worked in a fresh session.
- Follow-up: Applied the owner-approved exact `npm run check` entry in Claude `sandbox.excludedCommands` on 2026-10-14; existing command permissions still apply. No wildcard or broader shell exclusion was added. Fresh-session Claude verification, 2026-10-14: `npm run check` was called through the normal Bash path without `dangerouslyDisableSandbox`. The sandbox exclusion applied, no owner prompt appeared, and the command completed with exit success (171 test files, 3627 tests, performance tests, and build passed). The nested-Git-fixture tests that failed under the sandbox in the earlier run passed, and the `preflight-hook-observed` fixture output appeared, so the fixtures could write `.git/hooks`. Verified: exact entry works for a fresh session. Not verified: other commands, and persistence across later sessions.
