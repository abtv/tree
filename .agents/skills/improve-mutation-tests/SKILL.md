---
name: improve-mutation-tests
description: Run a resumable mutation-testing improvement sweep in a specified source area, with a six-hour total budget and thirty minutes per file. Preserve thresholds, save partial progress, and leave changes uncommitted for owner review.
---

# Improve mutation tests

Improve meaningful defect detection across a bounded source area. Invocation authorizes investigation, test changes, and required validation within that area. Do not stage changes or commit. Production defects require separate owner review before fixes. Follow the repository's existing workflows and execution permissions.

## Select or resume the area

Accept an `Area:` directory, module, or file list in the invocation or clear conversation context. Resolve it inside the current repository; never silently select the whole repository.

If no area is supplied, inspect the repository's task index and mutation-sweep checkpoints:

- Resume the sole unfinished sweep whose recorded scope and authorization remain applicable.
- If several unfinished sweeps exist, ask one question identifying the choices.
- If none exists, ask which directory, module, or files to examine. Wait for that answer before mutation runs.

Completed, superseded, and owner-deferred work is not a resumable sweep. A checkpoint from another repository does not authorize work here. With an explicit area, reuse a matching unfinished sweep or start a new one; preserve unrelated checkpoints.

Use the project's prescribed checkpoint location and indexing rules. Otherwise keep one checkpoint per sweep under `.scratch/mutation-sweep/<area-key>/checkpoint.md`. Keep run-specific progress out of this skill. Before substantial work, persist the approved area, baseline Git state, eligible file queue, and exact first action. Enumerate production files using existing mutation configuration and exclusions. Record excluded or unsupported files rather than overriding configuration to instrument them.

## Budget and deadlines

Unless the owner explicitly sets different limits, use six hours total for the authorized sweep and thirty minutes per production file. Reserve the final thirty minutes of the total budget for validation, diff review, checkpointing, and the report. This reserve is part of the six hours, not an extension or a guarantee that all checks will finish.

Count active elapsed time, including reading, editing, command execution, waiting for tests, validation, and reporting. Exclude pauses between work sessions. Record timestamps with an available clock and accumulate total and per-file usage in the checkpoint. Retrying a command, switching files or sessions, and context compaction do not reset the counters. Count shared validation once toward elapsed total time; validation of the active file also consumes that file's budget. Inspect interrupted processes on resumption and include their actual task runtime when reconstructing usage; record uncertainty instead of silently resetting it.

Check remaining time between meaningful operations and before starting commands. Use observed durations when available; avoid launching work unlikely to fit the remaining file or total budget. These are agent-managed limits, not a hard process timeout or token-cost guarantee.

At a file's thirty-minute limit, stop further investigation and edits for that file, safely interrupt its task-owned running commands through the project's supported process controls, save available results and unfinished work, and mark it `budget exhausted`. Move to the next eligible file without asking the owner. Do not revisit that file during the same authorized sweep. An incomplete command is unverified, not a pass. Aggregate closeout validation may cover its existing edits but does not reopen its investigation or grant more editing time.

At five hours thirty minutes of total usage, stop starting or advancing file work and enter closeout, even if the active file has time left. Review accumulated changes, run remaining required checks that fit, and prepare the report. Validate incrementally throughout the sweep so closeout does not inherit all verification. Distinguish validated subsets from unfinished or failing ones; the reserve does not waive required checks.

At six hours, stop task work and safely interrupt any task-owned commands still running. Preserve results and report incomplete checks and any cleanup that could not finish. Do not extend the budget merely to finish a suite or improve a score. If supported cleanup or reporting overruns the limit, report the overrun; do not use it to resume investigation. Continue after exhaustion only when the owner explicitly grants a new budget. An ordinary continuation before exhaustion uses the remaining budget; after exhaustion, request a new budget before running more work. Revisiting an exhausted file also requires an explicitly renewed file budget.

## Improve each file

Keep one production file active at a time. Shared test fixtures may change when necessary; record dependent files and results.

For each file:

1. Read its requirements, implementation, and existing tests. Identify observable behavior that missing coverage could protect.
2. Run focused mutation testing through the supported project workflow. Preserve thresholds, exclusions, dependencies, and runner settings. Record scope and cache/report paths.
3. Investigate surviving, uncovered, and error mutants. Distinguish missing coverage, equivalent behavior, unsupported inputs, production defects, and runner failures. Leave uncertain cases unresolved.
4. Add focused tests for real gaps: boundaries, failures, cancellation, retries, recovery, resource ownership, and state transitions. Prefer behavior and boundary contracts over incidental implementation syntax.
5. Run affected tests and required static checks, then repeat mutation testing after relevant changes. Reuse still-valid results; force fresh execution only when evidence justifies invalidating the cache.
6. Update the checkpoint, preserve the validated subset, and proceed to the next file.

Continue improving a file while new evidence identifies meaningful cases and its file and total work budgets remain. Do not add artificial assertions, invent unsupported object shapes, or simplify production code merely to distinguish equivalent mutants. Give equivalence claims specific control-flow or data arguments; generated examples establish only bounded evidence.

Runner errors are unresolved results, not detected mutants. Record their diagnostics and effect on the score. A score below threshold remains a failed gate. Once its residual cases are investigated or blocked and recorded, that failure alone does not require ending this sweep: continue with independent files.

## Defer owner-dependent work

Reproduce production defects before proposing corrections. Record trigger, expected and actual behavior, impact, affected paths, and recommended fix. Preserve reproductions separately through the project's permitted temporary-test mechanism. Repair test defects within the remaining budgets; if the budget ends with failing or unfinished changes, identify them separately and never present the ordinary test suite as passing or those changes as ready to commit. Do not fix production defects during the sweep without separate authorization.

When a decision, permission, authentication step, or manual check is needed, record the blocker and recommended next action. Skip dependent work and continue elsewhere in scope. Respect denied actions; never retry through another mechanism. If a missing capability blocks the entire remaining queue, report it and stop.

The sweep does not authorize dependency upgrades, new infrastructure, production behavior changes, threshold reductions, or broader mutation exclusions.

## Checkpoint and partial delivery

Persist progress after each validated test batch and before switching files. A new session must be able to resume without the owner reconstructing context. Record:

- Approved area, constraints, and queue statuses: `pending`, `in progress`, `validated`, `blocked`, or `budget exhausted`.
- Total and per-file time used and remaining, current session timestamps, and whether closeout has started. Preserve these counters across sessions and distinguish new owner-granted budgets from continuations.
- Per-file mutation outcome, residual cases, and the exact next action.
- Changed files owned by the sweep, distinguished from pre-existing owner changes.
- Validation commands, results, tested inputs, and invalidation conditions. Track ordinary tests, mutation gates, and review separately; passing unit tests never makes a failed mutation gate green.
- Validated subsets, unfinished edits, shared-fixture dependencies, and checks invalidated by later changes.
- Deferred findings and owner questions, with reproduction and evidence locations.
- Task-owned running processes and supported cleanup instructions. Verify current ownership before acting on recorded process IDs.

Keep completed subsets stable while investigating the next file. A subset is ready for later saving only with its fixture dependencies, appropriate passing validation, and required review. Explicitly retain any mutation-gate failure. Do not assume one production file corresponds to one independently committable test file.

## Stop and resume

An explicit stop or pause overrides autonomous continuation immediately. Stop starting new work. Stop task-owned commands safely through permitted process controls; do not wait for a long suite merely to reach a convenient boundary. Preserve edits. When execution remains available, save the checkpoint and report validated and unfinished subsets, active or blocked cleanup, and the next action. Stopping does not authorize staging or committing.

Abrupt interruption can precede the next checkpoint. Never promise that the latest edit or command is complete. On resumption, compare the checkpoint with actual Git diff and process state. Interrupted commands are unverified unless completion evidence exists. Recover and validate unfinished work without discarding owner changes.

If asked to save partial results, review the actual subset and its dependencies, obtain missing validation, and commit only the explicitly authorized subset. Leave unfinished and unrelated changes intact. Invocation, continuation, and stopping retain the no-commit condition.

## Continue and finish

Finishing one file, mutation run, or intermediate review is a checkpoint, not a reason to end the task. Move to the next ready file while the work budget remains and closeout has not started, without renewed authorization. After context compaction, recover the checkpoint and its consumed budgets and continue the same sweep. Share concise updates on meaningful findings and limitations.

End when all eligible files have been processed or deferred, no further meaningful test improvements are identified after residual analysis, the total budget is exhausted, the owner stops work, or a genuine execution limit blocks all remaining independent work. Do not invent additional one-file or one-run stopping points. Do not generate low-value tests merely to fill time or reach a percentage.

Before delivery, review the complete accumulated diff, including new files, and perform required validation within the remaining budget. Use independent review when required or explicitly requested. Report any required review or validation that could not finish; do not call that subset complete. Resolve test defects within scope and budget and record production defects for the owner. Leave changes uncommitted.

Report improvements, ordinary and mutation-test results, residual failures and uncertainty, runner limitations, owner-dependent findings, and whether independent work remains. Include total time used, files that exhausted their budgets, why the sweep stopped, and the exact continuation needed. Identify validated versus unfinished subsets. Required permissions and platform execution limits remain in force throughout.
