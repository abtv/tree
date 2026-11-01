# Application mutation audit

Status: In progress

## Authorization

Audit every Stryker application source file sequentially, starting with persistence/history.
Allow at most 30 minutes per file. Add meaningful tests only for confirmed gaps.
Do not change production code, exclusions, the 93% threshold, or weaken tests.
Commit completed validated work per file; at most four task commits per session.

## Current file and evidence

Starting commit: `0912944559463349a18751f8f5ed3ee4a3f9c34d`; initially clean worktree.
Selected `src/application/save-policy.ts` first. No production or test edits.
Run on 2026-11-01, 19:11:36–19:12:42 local time:

```sh
npm run test:mutation -- --mutate src/application/save-policy.ts --incrementalFile .scratch/application-mutation/save-policy.incremental.json
```

Host execution succeeded. Initial run: 1962 tests passed.
Stryker exit 1: 86.67%, Killed 58, Survived 10, Timeout 7, NoCoverage 0, mutant errors 0.
Before/after: 86.67% / unchanged (no test changes or second run).
Report: `reports/mutation/mutation.json` and `.html`; per-file retained incremental report:
`.scratch/application-mutation/save-policy.incremental.json`.
An earlier CLI invocation with `--jsonReporter.fileName` failed before testing because that option is unsupported.
This is one launch error, separate from mutant errors.

## Triage

All ten survivors are equivalent for the returned word count:

* 10: visiting one index past the end sees undefined, treated as whitespace.
* 25: removing equal-string early return leaves an empty inserted slice.
* 27, 30, 31: relaxed prefix bound still stops at the first differing character; equal strings return early.
* 44, 45, 47: relaxed next-string suffix bound can extend only after the inserted slice is already empty.
* 59: next[-1] is undefined, matching the explicit zero-prefix branch.
* 63: unnormalized lone CR is still whitespace and yields the same word starts.

No confirmed assertion gaps or separate defensive survivors identified.
Timeout IDs: 11, 12, 29, 35, 37, 54, 55. These mutations introduce nonterminating loops
for covered inputs; the report records hit-limit exhaustion. They are not assertion kills.
Do not inflate assertion effectiveness with these seven results.

## Execution decision and exact continuation

The owner reaffirmed strictly file-by-file execution after seeing the below-threshold result.
This task-specific instruction overrides DEVELOPMENT.md §12's layer-shard fallback.
Keep the threshold unchanged and report a below-threshold exit honestly; a completed audit
does not mean the threshold passed. Do not launch a layer shard.

The first four analyses are complete without test changes. The primary session reached its four-task commit limit.
Next is agenda-pending-move.ts in a fresh session; enumerate the remaining source files
from the live Stryker application patterns in lexical order, excluding tests and application/test.
Every application source other than those marked Done remains unexamined; none is silently skipped.
Do not report an aggregate as a full-layer run. Preserve per-file status counts and separate launch errors.

## Task inventory

All paths below are relative to src/application. Each row is one sequential task.
Only corresponding tests and this plan may change; production edits are prohibited.
Validation is Minimal Risk for analysis-only documentation and Low Risk for tests:
focused tests, affected type/lint checks, changed formatting and documentation governance.
Mutation evidence includes full-file baseline and, when tests change, the final run using
that file's own incremental path. No runtime, visual, or performance behavior changes are intended.

| Order | Source file | Status |
| --- | --- | --- |
| 1 | save-policy.ts | Done: 86.67%, 58 killed, 10 equivalent survivors, 7 timeouts |
| 2 | persistence-coordinator.ts | Done: 96.15%, 67 killed, 3 equivalent survivors, 8 timeouts |
| 3 | editor-save-scheduler.ts | Done: 94.50%, 101 killed, 6 survivors, 2 timeouts |
| 4 | editor-history.ts | Done: 93.07%, 94 killed, 4 survivors, 3 no coverage |
| 5 | agenda-pending-move.ts | Ready |
| 6 | agenda-reconcile.ts | Planned |
| 7 | agenda-rows.ts | Planned |
| 8 | agenda-state.ts | Planned |
| 9 | agenda-visual-selection.ts | Planned |
| 10 | command-registry.ts | Planned |
| 11 | drop-targets.ts | Planned |
| 12 | editor-agenda-transitions.ts | Planned |
| 13 | editor-clipboard-transitions.ts | Planned |
| 14 | editor-command-transitions.ts | Planned |
| 15 | editor-content-changes.ts | Planned |
| 16 | editor-node-visual-transitions.ts | Planned |
| 17 | editor-runtime-state.ts | Planned |
| 18 | editor-search.ts | Planned |
| 19 | editor-store-types.ts | Planned |
| 20 | editor-store.ts | Planned |
| 21 | editor-text-session.ts | Planned |
| 22 | editor-undo-focus.ts | Planned |
| 23 | emoji-history.ts | Planned |
| 24 | expansion-state.ts | Planned |
| 25 | folder-backup.ts | Planned |
| 26 | menu-commands.ts | Planned |
| 27 | node-search.ts | Planned |
| 28 | notes-archive/archive-messages.ts | Planned |
| 29 | notes-archive/archive-policy.ts | Planned |
| 30 | notes-archive/crc32.ts | Planned |
| 31 | notes-archive/desktop-data-operations.ts | Planned |
| 32 | notes-archive/export-notes.ts | Planned |
| 33 | notes-archive/import-notes.ts | Planned |
| 34 | notes-archive/zip-reader.ts | Planned |
| 35 | recent-node-persistence.ts | Planned |
| 36 | recent-nodes.ts | Planned |
| 37 | search-executor.ts | Planned |
| 38 | search-session.ts | Planned |
| 39 | vim-clipboard-content.ts | Planned |
| 40 | visible-rows.ts | Planned |

## Owner involvement

Whole audit authorized in Codex, including test additions and per-file commits.
No manual product checks expected. Final acceptance is required if three substantive
working tasks are delivered. Pause at a file's budget or a material unresolved issue.
Resume prompt: Continue the application mutation audit at the next unfinished task in this plan.

## Persistence coordinator result

Source unchanged at de065be; 2026-11-01 19:14:51–19:18:20.
Baseline: 100%, Killed 67, Timeout 11, Survived 0, NoCoverage 0, errors 0.
Final: 96.15%, Killed 67, Timeout 8, Survived 3, NoCoverage 0, errors 0.
The decrease reflects timeout reclassification, not weaker tests. No confirmed test gaps.
Survivor 1 initializes requested to true, but no work is scheduled before a request.
Survivors 36 and 37 remove effective workQueued coalescing; the promise queue still serializes
work and the running loop consumes pending flags, leaving only empty continuations.
These are equivalent for persistence outcomes through the public API.
Timeouts 19, 21, 66 exhaust the hit limit; 16, 38, 39, 40, 41 exhaust elapsed time.
They remain timeouts, not assertion kills. There are no separate defensive survivors.
Both dry runs passed 1959 tests; both mutation runs passed the unchanged threshold.

```sh
npm run test:mutation -- --mutate src/application/persistence-coordinator.ts --incrementalFile .scratch/application-mutation/persistence-coordinator.incremental.json
npm run test:mutation -- --mutate src/application/persistence-coordinator.ts --incrementalFile .scratch/application-mutation/persistence-coordinator.incremental.json --force --concurrency 4 --timeoutMS 10000
```

The separate incremental file retains the final report; the first counts are also recorded in
`.scratch/application-mutation/persistence-baseline.md`. No test or production changes were justified.
Save-policy commit: de065be. Documentation checks and changed formatting passed for that commit.
Planner verified the complete 40-file inventory and Low Risk test-only validation scope.

## Save scheduler result

Source unchanged at 016bff9; 2026-11-01 19:18:58–19:20:18.
Before/final: 94.50% / unchanged, no test edits or redundant rerun.
Killed 101, Survived 6, Timeout 2, NoCoverage 0, errors 0.
Survivors 18, 77, 85, 97 are equivalent: clearing an undefined timer is a no-op.
Survivor 95 removes the timer check from the pending-change retry guard; pending changes
without an armed timer still defer cleanup in the coordinator. No observed persistence difference.
Survivor 106 removes an internal defensive guard: the coordinator always captures a save
before acknowledging it, so the undefined watermark cannot occur through that lifecycle.
Thus five equivalent survivors and one defensive survivor; no confirmed assertion gaps.
Timeout 2 removes constructor wiring and stalls waiting integration tests; timeout 82
keeps changes pending and exhausts the hit limit. Neither is an assertion kill.
Dry run passed 1944 tests; mutation command exited 0 with the unchanged threshold:

```sh
npm run test:mutation -- --mutate src/application/editor-save-scheduler.ts --incrementalFile .scratch/application-mutation/editor-save-scheduler.incremental.json --concurrency 4 --timeoutMS 10000
```

Final per-file report remains in its incremental file. Persistence coordinator commit: 016bff9;
documentation and changed-format checks passed. No runtime changes require E2E or performance validation.

## Editor history result and session handoff

Source unchanged at f38ee0a; 2026-11-01 19:20:47–19:21:57.
Before/final: 93.07% / unchanged, no test edits or redundant rerun.
Killed 94, Survived 4, Timeout 0, NoCoverage 3, errors 0.
Survivor 83 is equivalent: looking up a null container ID finds no node, matching the fast path.
Survivors 26 and 38 remove overflow defenses in undo/redo; total past + future is bounded by begin,
and transfers cannot overflow. NoCoverage 29 and 41 are those unreachable overflow bodies.
Survivor 99 and NoCoverage 102 remove/change the empty-root defense: valid editor snapshots
always contain a root. These are three defensive survivors and three defensive NoCoverage cases,
not missing assertions for valid public editor behavior. No confirmed gaps justify added tests.
Dry run passed 1951 tests; mutation command exited 0:

```sh
npm run test:mutation -- --mutate src/application/editor-history.ts --incrementalFile .scratch/application-mutation/editor-history.incremental.json --concurrency 4 --timeoutMS 10000
```

Save scheduler commit: f38ee0a. Documentation governance, changed formatting and diff whitespace
checks pass for each documentation-only task; no production or test files changed.
All four files finished well within their individual 30-minute budgets.
Four task commits exhaust the primary-session allowance; 36 explicitly listed tasks remain.
Resume with agenda-pending-move.ts, using its own incremental file and a fresh baseline.
The final aggregate across all files is not yet available. Partial latest-report counts for four files:
Killed 320, Survived 23, Timeout 17, NoCoverage 3, mutant errors 0; one separate CLI launch error.
This is a partial aggregation of separate file runs, never a full-layer execution result.
Keep the scratch evidence until the initiative finishes. Final owner acceptance is pending the whole audit.
