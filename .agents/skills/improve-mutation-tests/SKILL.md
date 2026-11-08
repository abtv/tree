---
name: improve-mutation-tests
description: Run a resumable, file-by-file mutation-testing improvement sweep in a specified source area, preserving thresholds and leaving changes uncommitted for owner review.
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

## Improve each file

Keep one production file active at a time. Shared test fixtures may change when necessary; record dependent files and results.

For each file:

1. Read its requirements, implementation, and existing tests. Identify observable behavior that missing coverage could protect.
2. Run focused mutation testing through the supported project workflow. Preserve thresholds, exclusions, dependencies, and runner settings. Record scope and cache/report paths.
3. Investigate surviving, uncovered, and error mutants. Distinguish missing coverage, equivalent behavior, unsupported inputs, production defects, and runner failures. Leave uncertain cases unresolved.
4. Add focused tests for real gaps: boundaries, failures, cancellation, retries, recovery, resource ownership, and state transitions. Prefer behavior and boundary contracts over incidental implementation syntax.
5. Run affected tests and required static checks, then repeat mutation testing after relevant changes. Reuse still-valid results; force fresh execution only when evidence justifies invalidating the cache.
6. Update the checkpoint, preserve the validated subset, and proceed to the next file.

Continue improving a file while new evidence identifies meaningful cases. Do not add artificial assertions, invent unsupported object shapes, or simplify production code merely to distinguish equivalent mutants. Give equivalence claims specific control-flow or data arguments; generated examples establish only bounded evidence.

Runner errors are unresolved results, not detected mutants. Record their diagnostics and effect on the score. A score below threshold remains a failed gate. Once its residual cases are investigated or blocked and recorded, that failure alone does not require ending this sweep: continue with independent files.

## Defer owner-dependent work

Reproduce production defects before proposing corrections. Record trigger, expected and actual behavior, impact, affected paths, and recommended fix. Preserve reproductions separately through the project's permitted temporary-test mechanism. Do not leave the ordinary test suite knowingly failing. Do not fix production defects during the sweep without separate authorization.

When a decision, permission, authentication step, or manual check is needed, record the blocker and recommended next action. Skip dependent work and continue elsewhere in scope. Respect denied actions; never retry through another mechanism. If a missing capability blocks the entire remaining queue, report it and stop.

The sweep does not authorize dependency upgrades, new infrastructure, production behavior changes, threshold reductions, or broader mutation exclusions.

## Checkpoint and partial delivery

Persist progress after each validated test batch and before switching files. A new session must be able to resume without the owner reconstructing context. Record:

- Approved area, constraints, and queue statuses: `pending`, `in progress`, `validated`, or `blocked`.
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

Finishing one file, mutation run, or intermediate review is a checkpoint, not a reason to end the task. Move to the next ready file without renewed authorization. After context compaction, recover the checkpoint and continue the same sweep. Share concise updates on meaningful findings and limitations.

End when the approved queue is exhausted, no further meaningful test improvements are identified after residual analysis, the owner stops work, or a genuine execution limit blocks all remaining independent work. Do not invent a one-file or one-run stopping point. Do not generate low-value tests merely to fill time or reach a percentage.

Before delivery, review the complete accumulated diff, including new files, and perform required validation. Use independent review when required or explicitly requested. Resolve test defects within scope and record production defects for the owner. Leave changes uncommitted.

Report improvements, ordinary and mutation-test results, residual failures and uncertainty, runner limitations, owner-dependent findings, and whether independent work remains. Identify validated versus unfinished subsets. Required permissions and platform execution limits remain in force throughout.
