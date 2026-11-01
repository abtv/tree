# Application mutation audit

Status: In progress

## Authorization

Audit every Stryker application source file sequentially, starting with persistence/history.
Allow at most 30 minutes per file. Add meaningful tests only for confirmed gaps.
Do not change production code, exclusions, the 93% threshold, or weaken tests.
Commit completed validated work per file. The owner explicitly raised this primary session's
allowance to ten commits on continuation; four had already landed, leaving six additional tasks.

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

The first four analyses are complete without test changes. The owner authorized continued work
in this session up to ten commits. Next task is agenda-visual-selection.ts; enumerate the remaining source files
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
| 5 | agenda-pending-move.ts | Done: 100%, 59 killed, 5 existing ignored |
| 6 | agenda-reconcile.ts | Done: 94.34% to 95.60%, two confirmed gaps closed |
| 7 | agenda-rows.ts | Done: 82.14% to 92.14%, 258 killed, 22 survivors |
| 8 | agenda-state.ts | Done: 88.41% to 90.22%, 249 killed, 27 survivors |
| 9 | agenda-visual-selection.ts | Ready |
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

## Agenda pending move result

Source unchanged at 08ac5cc; run 2026-11-01 19:24:36–19:25:12.
Baseline/final 100% / unchanged; Killed 59, Survived 0, Timeout 0, NoCoverage 0, errors 0.
Five existing Ignored mutants (57, 58, 60, 62, 64) retain the pre-existing type-narrowing
suppression on pendingMoveTargetDay; no exclusion was added or changed.
No surviving mutation or confirmed gap requires tests. Dry run: 1939 tests passed.

```sh
npm run test:mutation -- --mutate src/application/agenda-pending-move.ts --incrementalFile .scratch/application-mutation/agenda-pending-move.incremental.json --concurrency 4 --timeoutMS 10000
```

Primary source/report review completed. Documentation governance, changed formatting and diff
checks are the applicable validation for this analysis-only task. Editor history commit: 08ac5cc.

## Agenda reconciliation result

Source at d54eda7, tests changed only in agenda-reconcile.test.ts; 19:25:33–19:28:01.
Baseline 94.34%: Killed 150, Survived 9. Final 95.60%: Killed 152, Survived 7.
Both runs: Timeout 0, NoCoverage 0, errors 0, one existing Ignored mutation (91).
Confirmed gaps closed: migration of an active date must not enter focused-day mode (69),
and an active node moved outside scope must not migrate selection to its new date (37).
The changed tests pass normally and killed both previously surviving mutations.
Remaining equivalents: 38 duplicates the missing-node check in isInAgendaScope; 65 unfolds
an already-visible active path; 93 includes duplicate node days and undefined gap days without
changing nearest-day selection; 114 falls through identically when looking up null;
135 duplicates projection scope filtering; 143 duplicates nodeId discrimination;
157 repeats selection reconciliation when no pin changed. No defensive or unresolved survivors.

Both runs used this command (the second reused 141 unchanged results):

```sh
npm run test:mutation -- --mutate src/application/agenda-reconcile.ts --incrementalFile .scratch/application-mutation/agenda-reconcile.incremental.json --concurrency 4 --timeoutMS 10000
```

Dry runs passed 1972/1973 tests. Final focused validation:
`npm test -- src/application/agenda-reconcile.test.ts` passed 17 tests.
Low Risk static validation: `npm run typecheck:renderer`, `npm run lint`,
`npm run format:check:changed`, `npm run check:docs`, and `git diff --check`.
Primary diff review found no production change, weakened assertion or requirement change.
No E2E, visual or performance checks required for these test-only changes.
Agenda pending move commit: d54eda7.

## Agenda rows result

Source unchanged at 6364486, only agenda-rows.test.ts changed; 19:28:42–19:34:49.
Baseline 82.14%: Killed 230, Survived 49, NoCoverage 1.
Intermediate 87.14%: Killed 244, Survived 36, NoCoverage 0.
Final 92.14%: Killed 258, Survived 22, NoCoverage 0.
All runs: Timeout 0, errors 0, existing Ignored 68/71 unchanged. Threshold exits remain 1.
Six focused tests cover ancestor paths/missing occurrences, stable rows after an undated root
addition, direct projection reads and focused-day transitions, Today heading metadata,
release of vanished day caches, and absence of unchanged-subtree traversal across 1000 nodes.
These tests detect 28 additional mutations without touching production code.

Remaining classification:

* 12, 16: redundant missing-row/fallback guards.
* 24, 25, 28, 29: valid preorder always reaches depth zero before passing the start;
  relaxing the bounds cannot add an ancestor with negative depth. Some variants scan extra preceding rows.
* 48: null is not a valid node ID; findIndex returns -1, preserving start=0.
* 155: comparison with undefined is false, so the separate guard is redundant.
* 196: sameDay is called only after lookup by the same day key.
* 230, 241, 249: earlier document/scope conditions guarantee initialized state before access.
* 245: current pin overlay is reapplied after the unpinned prior projection; its guard is redundant.
* 213, 214, 287, 288: placeholder initial/reset arrays are replaced before their next public result.
* 116, 118, 188, 190: functional equivalents that remove fast paths (empty fold-set lookup and
  identical projection comparison). They may add CPU work; no timing claim is made for them.
* 289: defensive immediate release of the private day cache on clear. Subsequent reads rebuild
  projection identity and cannot reuse stale rows; immediate memory release is not asserted by this audit.

The last two groups are explicitly retained limitations, not claimed assertion kills or proven
performance/memory equivalence. No production edits or threshold-driven tests were introduced.

All three runs used the same command with the dedicated incremental report:

```sh
npm run test:mutation -- --mutate src/application/agenda-rows.ts --incrementalFile .scratch/application-mutation/agenda-rows.incremental.json --concurrency 4 --timeoutMS 10000
```

Dry runs passed 2197, 2201, 2203 tests. Final ordinary Vitest passed 17 tests:
`npm test -- src/application/agenda-rows.test.ts`.
Low Risk checks: renderer typecheck, lint, changed formatting, docs governance and diff whitespace.
Primary review checked the six tests against observable outputs, stable references and bounded work;
no implementation or shared fixture changed. Agenda reconciliation commit: 6364486.

## Agenda state result

Source at 9ecf2c4, tests changed only in agenda-state.test.ts; 19:35:33–19:40:09.
Baseline 88.41%: Killed 244, Survived 32. Final 90.22%: Killed 249, Survived 27.
Timeout, NoCoverage, errors and ignored: all zero. Below-threshold exits remain reported failures.
New coverage rejects focus-day on non-day rows (32), opens hidden descendant folds in open-all (96),
and keeps two independent gap regions' header selection separate (63, 71, 74).
An extra toggle assertion that did not close a gap was removed; the final run confirms the same five kills.

Remaining equivalents/defenses for valid timeline rows:

* 64–68: containment and row ordering already identify the containing expanded header;
  unexpanded rows can match themselves only when the existing fallback would select that same row.
* 72: a remainder starts strictly after its expanded header, so strict comparison is equivalent.
* 88: the changed recursive command kind falls through to the same toggle-fold implementation.
* 112–115, 118, 120, 121, 125: recursive scans stop at day/gap boundaries via the remaining
  day/depth predicates; a gap has no node descendants and a day has no numeric depth.
* 176–179, 182, 184, 185: only foldable day/node keys enter collapsed; intervening day/gap
  boundaries fail the remaining day/depth checks, so omitted kind guards add no hidden selection.
* 232: folding the selected row reselects the identical key.
* 244, 245, 248: remaining day or depth checks still reject crossing a day boundary.
* 268: only a node row has match role, making the kind check redundant.

Three runs used:

```sh
npm run test:mutation -- --mutate src/application/agenda-state.ts --incrementalFile .scratch/application-mutation/agenda-state.incremental.json --concurrency 4 --timeoutMS 10000
```

Dry runs passed 2203/2206/2206 tests. Final focused checks passed 15 tests with
`npm test -- src/application/agenda-state.test.ts src/application/agenda-focused-day.test.ts`.
Low Risk validation: renderer typecheck, lint, changed formatting, docs and diff whitespace.
Primary review confirms no production, fixture or requirement changes; no E2E/performance trigger.
Agenda rows commit: 9ecf2c4.
