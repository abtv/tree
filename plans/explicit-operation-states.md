# Explicit Operation States

## Objective and authorization

Make seven implicit operation state machines explicit, in the order below, with
one validated commit per task. The owner authorized the complete list on
2026-11-12: “Yes, do them one by one, you can create one commit for each.”
This is internal refactoring: preserve behavior, public contracts, persistence
formats, ownership boundaries, and existing dependencies. Use separate local
state models; do not introduce a common FSM framework.

Status: In progress. Coding tool: Codex. Source: the seven-item recommendation
in the conversation, independently assessed by the configured Planner.

Authoritative context: [workflow](../AGENTS.md), [architecture](../docs/ARCHITECTURE.md),
[product](../docs/PRODUCT.md), [validation](../docs/DEVELOPMENT.md#risk-based-validation).
No material requirement gaps or architecture decisions are currently unresolved.
Product changes, new recovery behavior, persistence changes and broader ownership
changes remain reserved for the owner.

## Tasks

Tasks execute sequentially. Each depends on completion of its predecessor.
Update architecture descriptions with each relevant task; preserve product requirements.

| ID | Outcome and expected files | Acceptance evidence | Tier | Status |
| --- | --- | --- | --- | --- |
| S1 | Desktop update installation, check, manual notification and package state; `src/electron/main/app-updates.ts` and tests | Shared check Promise; one result dialog; readiness retained after failed recheck; replacement revokes readiness; matching save confirmation; 15s/60s deadlines; rollback once. Existing unit, main/IPC contracts and `e2e/electron/app-updates.spec.ts` | High | Done |
| S2 | Persistence execution phase, pending work and retained outcomes; `src/application/persistence-coordinator.ts` and tests; save scheduler only as necessary | Serialization/coalescing, requests during finalization, cleanup deferral/retry, failed-save retention, flush draining and discard-save without dropping cleanup. Coordinator/scheduler tests, persistence, attachment cleanup and shutdown E2E | High | Done |
| S3 | Browser backup lifecycle and separate picker/confirmation state; `src/web/backup/backup-controller.ts`, tests and neighboring pure state module if needed | Click-synchronous picker/permission, no startup prompts, pagehide/stale-worker guards, cancellation, retry, preference/worker failures. Controller tests and `e2e/web/backup.spec.mts` | High | Done |
| S4 | Complete desktop import/export operation state; `src/application/notes-archive/desktop-data-operations.ts` and tests | Retain prepared import across export from confirmation; cancellation/stale progress/menu/dispose; distinguish pre-commit failure from ambiguous commit requiring restart with writes suspended. Archive contracts and export/import/recovery E2E | High | Done |
| S5 | Search hidden/editing/confirmed modes, separate count/navigation jobs; `src/application/search-session.ts` and tests | Recall, empty-draft fallback, cancel restoration, no navigation during drafting, context invalidation and stale response rejection. Session tests and local-search, vim-search, agenda-search E2E | Moderate if confined to session metadata | Ready |
| S6 | Explicit quit handshake; `src/electron/main/quit-handshake.ts` and tests | Matching confirmation, duplicate suppression, timeout/retry, force, microtask scheduling and terminal idempotence. Unit and real menu/window/shutdown failure coverage | High | Planned |
| S7 | Explicit Vim pending-command variants; `src/renderer/vim-keyboard-types.ts`, `vim-command-state.ts`, affected handlers and tests | Inventory producers/consumers first; retain editor/Agenda zero/count rules, operator motions, awaited characters, prefixes, surround, Escape/reset and mode/surface transitions. Existing unit/property and representative Vim E2E | High for expected shared-handler scope | Planned |

High Risk requires `npm run check`, full `npm run test:e2e`, `npm run audit`
and independent review before each commit. The full unit coverage stage subsumes
the main/preload/infrastructure test command required by nested instructions.
Moderate Risk requires `npm run check`, affected tests and explicit affected E2E;
escalate S5 if its scope reaches shared focus, scheduling or traversal.
S3 additionally requires real browser backup validation through
`npm run test:web:chromium` without arguments. Do not prepare dependency images;
missing preparation requires the owner's `make setup`.

Existing behavioral tests may provide acceptance coverage. Add tests for meaningful
uncovered transitions, not discriminant inspection. Preserve observer ordering and
exceptions, including invalid update acknowledgments. Independent review applies
to every task. Separate product verification is required if observable behavior changes.

## Performance and recovery

Retain bounded metadata and the existing number of writes/syncs. Add no document
traversals, history retention or persistence fields. S2 must preserve operation
counts. S5/S7 must retain bounded session memory and input work. Select targeted
timing checks only if the actual diff changes a relevant cost; no full performance
suite is justified solely by the risk tier.

There are seven substantive working tasks. At most four task commits may be made
per primary session. No numerical implementation budget was agreed; use the
workflow's bounded recovery rule (two unsuccessful attempts at the same blocker
without new evidence), retaining recovery history across sessions. Closure is a
separate documentation step after final owner acceptance.

## Owner involvement and capabilities

One final acceptance round is required after all seven tasks. Keep this plan and
index `Awaiting owner acceptance` until the owner accepts the delivered result.
No pre-commit manual owner checks are currently identified for internal refactors.

| Task/check | Capability or owner action | Status |
| --- | --- | --- |
| S1 inspection, focused unit and Electron update E2E | Native file editing, read-only shell fallback, named test workflows | Verified this session; baseline 28 unit and 8 Electron tests passed |
| Independent planning | Configured Planner | Completed |
| Independent review | Configured Reviewer | Verified on S1-S4; no meaningful issues |
| High Risk full checks and audit | Named host workflows | Full checks/E2E verified on S1-S4; unchanged dependency audit has development-only moderate findings under the standing exception |
| S3 browser backup | Chromium container and filesystem support | Verified through the full maintained built-browser workflow, including real folder/Worker backup cases |
| Initiative closure | Owner accepts final delivered commit | Pending final delivery |

## Exact next task

Implement S5: explicit local-search session modes with independent count/navigation
jobs. S1 (`4c19bdc`), S2 (`9452437`), S3 (`78538ef`) and S4 are implemented,
independently reviewed and fully validated.
The scheduler, persistence services, serialization and Promise scheduling remain
unchanged by S2. Its new cases cover a concurrent save inheriting cleanup after
either a save or cleanup failure. No unresolved findings or validation blockers.

S4 keeps preparation independent of the operation because export from confirmation
and awaited cleanup have different lifetimes. Its UI snapshot remains a stable
cached projection, and its shared replacement attempt records whether commit began.
The existing cancellation/disposal order is preserved, including preparation reset
after awaited cleanup. No product changes or unresolved review findings.

The owner requested continued execution after an unnecessary two-task handoff.
This primary session has now completed four substantive task commits and reached
the binding limit in AGENT_WORKFLOW §12. An asynchronous question asks whether
the owner permits exceeding that limit for the remaining three tasks; no answer
has been received. Do not infer an exception from silence. S5 can proceed directly
in a fresh primary session, or here after an explicit exception. The seven-task
scope and continuation authorization remain unchanged; no renewed approval of the
implementation itself is needed.

## Resume prompt

Continue the authorized Explicit Operation States initiative. Read this plan,
Git status/history and any WORKING_PLAN.md, then resume the exact next task.
The owner authorized all seven sequential refactors and one commit per task.
Preserve behavior and keep independent machines. Retain final owner acceptance
and the four-task-commits-per-primary-session limit.
