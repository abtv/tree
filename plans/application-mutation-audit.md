# Application mutation audit

Status: In progress

## Authorization

Audit every Stryker application source file sequentially, starting with persistence/history.
Allow at most 30 minutes per file. Add meaningful tests only for confirmed gaps.
Do not change production code, exclusions, the 93% threshold, or weaken tests.
Commit completed validated work per file. The owner explicitly raised this primary session's
allowance to ten commits on continuation; four had already landed, leaving six additional tasks.
The owner subsequently extended the allowance to 50 files in this same session, authorizing
completion of the entire 40-file inventory with its per-file commits. On the next continuation,
the owner renewed editor-store.ts for 30 minutes and reaffirmed up to 50 sequential files and commits.
Earlier session-limit
handoffs below are historical and no longer block continuation.

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
in this session, subsequently extended to 50 files. Thirty-four tasks are complete.
Next task is recent-node-persistence.ts with a fresh 30-minute file budget. Enumerate remaining source files
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
| 9 | agenda-visual-selection.ts | Done: 87.50% to 96.88%, 93 killed, 3 equivalent survivors |
| 10 | command-registry.ts | Done: 95.27%, 141 killed, 7 survivors |
| 11 | drop-targets.ts | Done: 97.58% to 98.79%, 163 killed, 2 equivalents |
| 12 | editor-agenda-transitions.ts | Done: 96.55% to 98.85%, 86 killed, 1 equivalent |
| 13 | editor-clipboard-transitions.ts | Done: 97.73%, 86 killed, 1 equivalent, 1 defensive no coverage |
| 14 | editor-command-transitions.ts | Done: 95.97% to 97.32%, 580 killed, 14 survivors, 2 no coverage |
| 15 | editor-content-changes.ts | Done: 98%, 49 killed, 1 equivalent |
| 16 | editor-node-visual-transitions.ts | Done: 90.56% to 95.51%, 425 killed, 17 survivors, 3 no coverage |
| 17 | editor-runtime-state.ts | Done: 90.57% to 93.40%, 99 killed, 7 survivors |
| 18 | editor-search.ts | Done: 69.02% to 85.19%, 251 killed, 44 survivors, 2 timeouts; threshold failed |
| 19 | editor-store-types.ts | Done: 100%, 3 killed |
| 20 | editor-store.ts | Done: 87.28% to 92.31%; 1342 killed, 111 survivors, 15 timeouts, 2 no coverage; threshold failed |
| 21 | editor-text-session.ts | Done: 100%, 28 killed |
| 22 | editor-undo-focus.ts | Done: 87.77% to 89.89%, 165 killed, 18 survivors, 4 timeouts, 1 no coverage; threshold failed |
| 23 | emoji-history.ts | Done: 67.86% to 82.14%, 22 killed, 5 equivalents, 1 timeout; threshold failed |
| 24 | expansion-state.ts | Done: 98.65%, 73 killed, 1 equivalent survivor |
| 25 | folder-backup.ts | Done: 95.40% to 96.55%, 84 killed, 3 survivors |
| 26 | menu-commands.ts | Done: 79.31% to 89.66%, 26 killed, 3 survivors; threshold failed |
| 27 | node-search.ts | Done: 86.30% to 91.78%, 62 killed, 6 survivors, 5 timeouts; threshold failed |
| 28 | notes-archive/archive-messages.ts | Done: 95.42% to 96.95%, 126 killed, 4 survivors, 1 timeout |
| 29 | notes-archive/archive-policy.ts | Done: 100%, 35 killed |
| 30 | notes-archive/crc32.ts | Done: 93.33%, 11 killed, 1 equivalent survivor, 3 timeouts |
| 31 | notes-archive/desktop-data-operations.ts | Done: 97.10%, 402 killed, 11 survivors, 1 defensive no coverage; timeout replaced by assertion kill |
| 32 | notes-archive/export-notes.ts | Done: 100%, 55 killed |
| 33 | notes-archive/import-notes.ts | Done: 100%, 128 killed, 1 timeout |
| 34 | notes-archive/zip-reader.ts | Done: 96.72% to 97.66%, 416 killed, 10 equivalents, 1 timeout |
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

## Agenda visual selection result

Source at b7542e0, tests changed only in agenda-visual-selection.property.test.ts;
19:40:45–19:42:25. Baseline 87.50%: Killed 84, Survived 12.
Final 96.88%: Killed 93, Survived 3. Both runs: Timeout, NoCoverage, errors, ignored all zero.
Confirmed gaps: distinguish an earlier contextual occurrence of the same node, reject a contextual
anchor with eligible same-depth siblings, drop a range with a missing focus at the final candidate,
and jump to first from the final candidate rather than moving up one row. Nine mutants now fail assertions.
Remaining equivalents: 7 and 34 remove kind checks already implied by nodeId/role;
56 removes the anchor-index guard, but an invalid anchor produces no candidates and focus=-1.
No defensive survivors, unresolved assertion gaps or timeouts remain.

```sh
npm run test:mutation -- --mutate src/application/agenda-visual-selection.ts --incrementalFile .scratch/application-mutation/agenda-visual-selection.incremental.json --concurrency 4 --timeoutMS 10000
```

Dry runs passed 1934/1937 tests. Final ordinary focused run passed 6 tests:
`npm test -- src/application/agenda-visual-selection.property.test.ts`.
Low Risk validation: renderer typecheck, lint, changed formatting, docs and diff whitespace.
Primary diff review confirms tests-only scope and preserved existing assertions.
Agenda state commit: b7542e0.

## Command registry result

Source unchanged at 918900b; 19:42:49–19:43:25. Baseline/final 95.27% / unchanged.
Killed 141, Survived 7; Timeout, NoCoverage, errors and ignored all zero.
Dry run passed 189 tests; mutation threshold passed. No confirmed gap justifies new tests.
Survivor 84 is equivalent because the allowed-name set contains only strings.
Survivor 77 removes the 100-entry cap, but the fixed set of allowed unique commands has fewer entries.
Survivors 94, 97, 99 affect equality cases absent from the unique registry names.
Survivors 98, 100 replace the positive comparator result with zero; on the current fixed registry
and tested runtime the exact alphabetical order remains unchanged. This is input/runtime-specific
equivalence, not a claim that the mutated comparator is valid for arbitrary arrays or engines.
No artificial comparator-internal tests or production edits were introduced.

```sh
npm run test:mutation -- --mutate src/application/command-registry.ts --incrementalFile .scratch/application-mutation/command-registry.incremental.json --concurrency 4 --timeoutMS 10000
```

Primary source/report review completed. Documentation checks, changed formatting and diff checks
are sufficient for this analysis-only change. Agenda visual selection commit: 918900b.

## Current handoff after ten files

Ten task commits exhaust the explicitly extended primary-session allowance. Thirty files remain,
all listed above; none was silently skipped. Continue with drop-targets.ts using its own incremental file.
All file cycles were below 30 minutes. Production code, exclusions and threshold remain unchanged.
Four test files gained meaningful coverage; ordinary focused tests, renderer types, lint and
documentation/format checks passed for their corresponding final inputs.
Per-file score threshold failed for save-policy, agenda-rows and agenda-state; classification and
limits are recorded above. No layer run was performed, following the owner's explicit instruction.

Partial aggregate read from the latest ten dedicated incremental files:
Killed 1272, Survived 89, Timeout 17, NoCoverage 3, mutant errors 0, existing Ignored 8.
Separate launch errors: 1 (the initial unsupported reporter CLI option).
This is not the requested final all-file aggregate and is not a full-layer run result.
The six continuation commits are d54eda7, 6364486, 9ecf2c4, b7542e0, 918900b and this task's commit.
Across these files, tests killed 44 additional mutants; five agenda-state, nine visual-selection,
28 agenda-rows and two reconciliation mutants. Timeouts are never counted as assertion kills here.
Retain scratch reports for continuation. No owner product decision is needed to resume the authorized audit.

## Drop targets result

Starting commit 1ce929d; 19:45:38–19:47:11. Baseline 97.58% (161 Killed, 4 Survived),
final 98.79% (163 Killed, 2 Survived). Timeout, NoCoverage, errors and ignored: zero.
The added drop-targets.test.ts case counts node reads across 100 pointer updates and kills
cache-removal mutants 15/18. Remaining 2 is equivalent because null lookup returns undefined;
121 is equivalent because the removed source and a remaining sibling cannot have equal sibling indices.
Both runs used:

```sh
npm run test:mutation -- --mutate src/application/drop-targets.ts --incrementalFile .scratch/application-mutation/drop-targets.incremental.json --concurrency 4 --timeoutMS 10000
```

Dry runs passed 208/209 tests. Final ordinary focused validation passed 24 tests:
`npm test -- src/application/drop-targets.test.ts src/application/drop-targets.property.test.ts`.
Renderer types, lint, changed formatting, docs and whitespace checks passed. Primary diff review
confirms tests-only change, no runtime/performance measurement changes or production edits.
Command registry commit: 1ce929d. The owner now authorizes all remaining files (up to 50 total).

## Editor Agenda transitions result

Starting commit 8686176; 19:47:56–19:49:30. Baseline 96.55%: Killed 84, Survived 2, NoCoverage 1.
Final 98.85%: Killed 86, Survived 1, NoCoverage 0. Timeout/errors zero; six existing Ignored unchanged.
The new focused-day creation test kills 32/35, including the previously uncovered branch.
Remaining 91 inserts a non-link placeholder into an empty links array; normalization ignores entries
without offsets, so the new node content is equivalent. No unresolved assertion gaps.

```sh
npm run test:mutation -- --mutate src/application/editor-agenda-transitions.ts --incrementalFile .scratch/application-mutation/editor-agenda-transitions.incremental.json --concurrency 4 --timeoutMS 10000
```

Dry runs passed 1951/1952 tests. `npm test -- src/application/editor-agenda-transitions.test.ts`
passed 21 tests after mutation completion. Renderer types, lint, changed formatting, docs and diff
checks passed. Primary review confirms test-only scope; no production or fixture changes.
Drop targets commit: 8686176.

## Editor clipboard transitions result

Starting commit 1790885; 19:49:54–19:50:33. Baseline/final 97.73% / unchanged.
Killed 86, Survived 1, NoCoverage 1, Timeout/errors/ignored zero. Dry run passed 1943 tests.
Survivor 11 is equivalent: the bogus link fallback has no numeric offsets and the range filter removes it.
NoCoverage 50 is defensive: split always returns at least one line, so the missing-last-line fallback is unreachable.
No confirmed test gap; no test or production change. Primary source/report review completed.

```sh
npm run test:mutation -- --mutate src/application/editor-clipboard-transitions.ts --incrementalFile .scratch/application-mutation/editor-clipboard-transitions.incremental.json --concurrency 4 --timeoutMS 10000
```

Threshold, documentation, changed-formatting and whitespace checks passed.

## Editor undo focus result

Starting commit d70aa6f; 21:27:51–21:34:39. Baseline 87.77%: 161 Killed, 22 Survived,
4 Timeout, 1 NoCoverage. Final 89.89%: 165 Killed, 18 Survived, 4 Timeout, 1 NoCoverage.
Errors/ignored/launch errors zero. Intermediate scores 88.30/88.83. The 93% threshold fails;
no threshold changes or layer run. Tests kill 16/18/20/106 by distinguishing reordered
identities with equal text, and reordered parents with different child counts from cross-parent moves.

Remaining 2/9/94/157 remove identity fast paths but retain value/reference comparisons;
6's sentinel has no nodeId and cannot match a removed ID. 12/17/19/21 choose the general
map-based comparison instead of the same-order fast path. 23's extra iteration compares
undefined with undefined and does not recurse. 33/35 overpopulate removed IDs, but added
IDs still come only from nodes absent in that parent; 53's same-parent check is consequently
redundant. 73 maps null to the same -1 ancestor index. 146/149/150 allow scanning beyond
the shorter text, but callers provide unequal text and undefined differs from its next character.
69 and NoCoverage 71 defend a change-site node guaranteed to exist in the restored document.
These classify 17 equivalent/redundant survivors and one defensive survivor.
Timeout 25/100/148/154 mutate loop advancement/termination and are not assertion kills.

```sh
npm run test:mutation -- --mutate src/application/editor-undo-focus.ts --incrementalFile .scratch/application-mutation/editor-undo-focus.incremental.json --concurrency 4 --timeoutMS 10000
npm test -- src/application/editor-undo-focus.test.ts
```

Final dry run: 2042 passing tests; focused run: 37 passing tests. Renderer types, lint,
changed formatting, docs and whitespace checks passed. Primary review confirmed additive tests
and unchanged production/assertions. Next: emoji-history.ts.
Editor Agenda transitions commit: 1790885.

## Editor command transitions result

Starting commit cc5df4d; 19:50:59–19:55:21. Baseline 95.97%: 572 Killed, 22 Survived,
2 NoCoverage. Intermediate 97.15%: 579 Killed. Final 97.32%: 580 Killed, 14 Survived,
2 NoCoverage. Timeout/errors/ignored zero throughout.
Tests now cover ineligible nonempty/parent inline outdents, sibling creation from an expanded heading,
collapsed default for Enter, preserving an empty current row, selecting a collapsed preceding parent,
and focus after counted deletion. Eight previously surviving mutants fail assertions (51,72,77,99,471,537,539,562).
Remaining: 12/434 plus NoCoverage 15/437 defend guaranteed collaborator results; 86 is redundant
with the move coordinator's heading rejection; 95 always receives a valid outward move;
54 selects the existing after-branch for any non-before value; 189 returns undefined for no-op
same-parent moves either way; 256/264 defend dense visible rows; 388/411 duplicate path bounds;
393 treats null lookup as the same -1 fast path; 521 defends an already validated two-leaf join;
527/561 substitute undefined for false in a boolean predicate. No unresolved assertion gaps.

All three runs used:

```sh
npm run test:mutation -- --mutate src/application/editor-command-transitions.ts --incrementalFile .scratch/application-mutation/editor-command-transitions.incremental.json --concurrency 4 --timeoutMS 10000
```

Dry runs passed 2024/2029/2030 tests. Final ordinary run passed 86 tests:
`npm test -- src/application/editor-command-transitions.test.ts src/application/editor-command-transitions.property.test.ts`.
Renderer types, lint, changed formatting, docs and diff checks passed; primary review confirmed
test-only changes with existing assertions retained. Clipboard transitions commit: cc5df4d.

## Editor content changes result

Starting commit cbcb27d; 19:56:03–19:56:38. Baseline/final 98% / unchanged.
Killed 49, Survived 1, Timeout/NoCoverage/errors/ignored zero. Dry run passed 1948 tests.
Survivor 27 removes a redundant undefined check: equal dense link-array lengths guarantee the other entry.
No confirmed gap or test edits. Threshold and documentation/format/diff checks passed; primary review completed.

```sh
npm run test:mutation -- --mutate src/application/editor-content-changes.ts --incrementalFile .scratch/application-mutation/editor-content-changes.incremental.json --concurrency 4 --timeoutMS 10000
```

Editor command transitions commit: cbcb27d.

## Editor node Visual transitions result

Starting commit cecb0de; 19:57:00–20:07:02. Baseline 90.56%: 403 Killed, 28 Survived,
14 NoCoverage. Final forced full-file run: 95.51%, 425 Killed, 17 Survived, 3 NoCoverage.
Timeout/errors/ignored zero. Intermediate incremental scores were 95.51/95.73%; forced
results varied between 95.06 and 95.51 with property-test inputs. The final numbers above
come from all 445 mutants retested, not cached results. Initial suspicion of stale results
was not confirmed: several mutants replace only one operand of a redundant condition.

Added coverage for paste before a heading, exact/mixed forest depth limits, default and
explicit outdent confinement, indent with confinement, missing endpoints, and the returned
join/shift transition contract. Ordinary focused run passed 40 tests; final dry run passed 2070.

Remaining 86 is equivalent (undefined parent ID does not equal null); 91/92/96 are equivalent
for sibling ranges; 94/95/98/99 defend missing or root endpoints outside the non-root scope.
104/105/107 and 209/210/212 are redundant heading guards for valid ranges: the heading is
the only visible node in its sibling array. 257 and NoCoverage 259/260 defend a guaranteed
nonempty range. 306 and NoCoverage 307 defend the already-validated paste source.
375's bogus link is discarded by normalization. No confirmed assertion gap remains.

```sh
npm run test:mutation -- --mutate src/application/editor-node-visual-transitions.ts --incrementalFile .scratch/application-mutation/editor-node-visual-transitions.incremental.json --concurrency 4 --timeoutMS 10000 --force
npm test -- src/application/editor-node-visual-transitions.test.ts
```

Renderer types, lint, changed formatting, docs and diff checks passed. Primary review confirms
tests-only changes and retained assertions. Content changes commit: cecb0de.

## Editor runtime state result

Starting commit 874b2b8; 20:07:30–20:11:25. Baseline 90.57%: 96 Killed, 10 Survived.
Final 93.40%: 99 Killed, 7 Survived; Timeout/NoCoverage/errors/ignored zero.
Added a deleted-Agenda-scope scenario that must return to the nearest surviving ancestor,
not an unrelated first root, with a fresh focus and exactly one close notification.
It kills 55/56/57 by requiring the previous document's ancestor path.

Remaining equivalents: 34 is redundant with document inequality from loading; 45 is guarded
by the earlier missing-agenda branch; 54 passes undefined from loading, invoking the callee's
default document; 72 only removes an absent/undefined error key; 79 releases undefined as a no-op;
91 still sees no agenda on loading. Defensive 58 cannot affect the closing-scope fallback:
its returned location is the surviving heading or first root, without inline ancestors to unfold.

```sh
npm run test:mutation -- --mutate src/application/editor-runtime-state.ts --incrementalFile .scratch/application-mutation/editor-runtime-state.incremental.json --concurrency 4 --timeoutMS 10000
npm test -- src/application/editor-runtime-state.test.ts src/application/editor-runtime-agenda.test.ts
```

Dry runs passed 1957/1958 tests; final ordinary run passed 10. Renderer types, lint,
formatting, docs and diff checks passed. Primary review confirms tests-only scope.
Visual transitions commit: 874b2b8.

## Editor search result

Starting commit d827f3f; 20:11:53–20:35:23, within the 30-minute file budget.
Baseline 69.02%: 203 Killed, 89 Survived, 3 NoCoverage, 2 Timeout.
Final 85.19%: 251 Killed, 44 Survived, 0 NoCoverage, 2 Timeout; errors/ignored zero.
Stryker exit 1 remains an unmet 93% threshold, not a launch failure. No threshold or exclusion changed.
Intermediate scores: 76.43, 78.45, 85.19, 84.51, 84.85, 85.19; the final repeat stayed at 85.19.
Timeout counts varied up to eight between runs; their contribution is not an assertion kill.

Tests cover recursive and single fold ownership (including subtree/day ends and unrelated descendants),
Tree and Agenda scope switches, focused-day switches, matches inside combining graphemes,
rapid jumps after confirmation, empty results with queued navigation, resuming after manual selection,
clearing old feedback, unchanged publication, in-scope edits, and stale fold IDs after deletion.
Killed increased by 48; all three previously uncovered mutants are now assertion-killed.

Remaining triage, using the final mutant IDs:

* 0/1/2/3/5: initial private values are overwritten before initialized navigation.
* 20/23/25: scope-key sentinel changes preserve distinctions for application-generated IDs;
  this does not claim equivalence for arbitrary adversarial IDs equal to the replacement sentinel.
* 32/58/60/72/73/74/87: redundant context/draft guards, short-circuit narrowing,
  identity-based invalidation, monotonic revision direction, or an explicit undefined property.
* 96/102/105/111/112/117/120/124/259/264: redundant cancellation and empty-query handling
  under the current SearchSession/caller contract. SearchSession independently invalidates callbacks;
  counter direction is not an externally observable result. No assertion gap was confirmed here.
* 128/130: disable queue coalescing while retaining the same ordered navigation operations.
* 192/193: scan an empty ownership set; 200/205/207: real timeline headers stop traversal after
  a missing/gap target; 219/220/223: redundant node-kind/day checks in ordered day groups;
  227: a day header has no depth, so its comparison with node depth stays false.
* Defensive: 100 guards cancellation without a draft; 149/151/153 guard an origin inconsistent
  with the published selection (normal manual selection clears the anchor); 202/203 guard a missing
  fold target; 245/297 guard calls before state initialization. These are not claimed universally equivalent.
* Timeout 282 removes queue advancement; 288 increases the repeat counter. Neither is counted as an assertion kill.

All runs used the dedicated path:

```sh
npm run test:mutation -- --mutate src/application/editor-search.ts --incrementalFile .scratch/application-mutation/editor-search.incremental.json --concurrency 4 --timeoutMS 10000
npm test -- src/application/editor-search.test.ts src/application/editor-search-agenda.test.ts
```

Final dry run passed 2146 tests. Ordinary focused tests, renderer types, lint, formatting, docs
and diff checks passed. Primary review retained existing assertions and verified tests-only changes.
Runtime state commit: d827f3f.

## Editor store types result

Starting commit 18ba7e5; 20:36:09–20:36:43. This file contains executable systemClock adapters,
so it was tested rather than skipped as type-only. Baseline/final 100% / unchanged:
3 Killed; Survived/Timeout/NoCoverage/errors/ignored zero. All three static mutants failed tests.
Dry run passed 1949 tests. No confirmed gap or test edits; primary source/report review completed.
Threshold, docs, formatting and diff checks passed.

```sh
npm run test:mutation -- --mutate src/application/editor-store-types.ts --incrementalFile .scratch/application-mutation/editor-store-types.incremental.json --concurrency 4 --timeoutMS 10000
```

Editor search commit: 18ba7e5.

## Editor store first-budget partial result (historical)

Starting commit 8286dea. File budget started at 20:37:00 on 2026-11-01; stop by 21:07:00.
Baseline ended 20:48:19: 87.28%, 1272 Killed, 180 Survived, 11 Timeout, 7 NoCoverage,
zero errors/ignored. First follow-up: 87.62%, 1277 Killed, 178 Survived, 11 Timeout, 4 NoCoverage.
Second follow-up ended 20:58:49: 88.98%, 1293 Killed, 158 Survived, 15 Timeout, 4 NoCoverage.
These exits are threshold failures at the unchanged 93%, not launch errors.

The last run started at 21:00:07 and ended at 21:02:58 with the latest test behavior:
89.73%, 1308 Killed, 149 Survived, 11 Timeout, 2 NoCoverage, zero errors/ignored.
Killed increased by 36 over baseline. Five previously uncovered mutants now have coverage;
coverage alone does not mean they are killed. Dry run passed 1976 tests.
The file is not complete: stop near the 30-minute budget with the remaining triage below preserved.
Do not advance or call the threshold passed. A further file-budget allowance is needed to finish this file.
No Stryker process remains running; no test or production changes for this file have been committed.
All runs use:

```sh
npm run test:mutation -- --mutate src/application/editor-store.ts --incrementalFile .scratch/application-mutation/editor-store.incremental.json --concurrency 4 --timeoutMS 10000
```

Uncommitted tests cover preference failure reporting, concurrent clipboard writes, finite viewport
measurements, Agenda closing/returning, deletion fallbacks, locked Backspace, retained-ID Undo
boundaries, persisted recent/search navigation, manual fold ownership, and search inside a nested scope.
Changed test files:

* src/application/editor-store-services.test.ts
* src/application/editor-store-agenda-delete.test.ts
* src/application/editor-store-edit-boundaries.test.ts
* src/application/editor-store-agenda.test.ts
* src/application/editor-store.test.ts

Renderer types, lint and formatting passed for the latest tests. After final Stryker completion,
the following ordinary run passed all 344 tests; docs/diff checks and primary diff review passed too.
Production code, thresholds, exclusions and existing assertions are unchanged.

```sh
npm test -- src/application/editor-store.test.ts src/application/editor-store-agenda.test.ts src/application/editor-store-agenda-delete.test.ts src/application/editor-store-edit-boundaries.test.ts src/application/editor-store-services.test.ts
npm run typecheck:renderer
npm run lint
npm run format:check:changed
npm run check:docs
git diff --check
```

Do not commit this file as a completed audit until remaining triage is finished.

Remaining work: inspect the latest full-file incremental report, classify every remaining Survived/NoCoverage,
and close further confirmed assertion gaps within an explicitly renewed file budget if this cycle expires.
Start with mutant 1358 (line 1589): assess Undo of a date edit when the restored Agenda day is folded;
the mutant removes preservePresentation from reconcileAgenda. This is a candidate gap, not yet confirmed.
Then inspect 1363/1364 (Agenda history change-site focus through Tree-collapsed ancestors).
In particular, finish applyAgenda's publication/session conditions, search publication guards,
copy finalization, creation/put/session boundaries, Agenda deletion guards and history focus recovery.
Do not skip to editor-text-session.ts; editor-store.ts is still the current file.
The many source comments identify candidate equivalents/defenses but are not a substitute for completed triage.

Already inspected mechanisms for later triage: currentState's ready guard is unreachable through the scheduler;
undefined viewport keys disappear during JSON persistence; parsePersistedState supplies a view;
toggleNodeExpansion always changes identity; expansionAfterOpen/Put re-expand already-open targets and
applyStructural supplies the original expansion when omitted; malformed empty link fallbacks normalize away;
redo already follows an ended typing session; persistence callbacks only arrive for ready state.
Do not count timed-out mutants as assertion kills. Baseline hit-limit timeouts affect flush loops;
1488/1489 edit-tracking cleanup timeouts have a different lifecycle cause. Some additional elapsed-time
timeouts appeared during follow-ups and must be reported from the latest result without calling them kills.

Latest NoCoverage: 518 (parser-guaranteed view fallback), 716 (deleteLink lookup result defense).
Latest Timeout: 433, 436, 437, 443, 444, 449, 452, 453, 455, 1266, 1267.
The first nine exhaust flush-loop hit limits; the last two affect pending-edit removal and time out.
They are not assertion kills. Other elapsed-time timeouts from intermediate runs reverted on rerun.

All 149 remaining Survived IDs are retained below so none is silently skipped. The mechanism notes above
cover only part of this list; do not label the entire list equivalent or defensive without finishing triage.

```text
15, 25, 29, 64, 74, 93, 103, 105, 111, 113, 114, 115, 126, 130, 143, 158, 165, 166
172, 181, 191, 237, 242, 278, 287, 293, 313, 322, 324, 330, 373, 383, 385, 397, 435, 469
486, 498, 499, 501, 502, 510, 514, 515, 517, 555, 566, 569, 571, 573, 580, 591, 592, 594
599, 609, 612, 614, 616, 617, 618, 620, 654, 667, 683, 684, 692, 696, 710, 714, 739, 746
748, 773, 775, 833, 862, 868, 876, 877, 891, 898, 901, 902, 904, 921, 924, 925, 927, 942
945, 952, 954, 959, 968, 969, 977, 997, 1035, 1066, 1121, 1125, 1137, 1145, 1157, 1158, 1160, 1162
1165, 1175, 1177, 1180, 1189, 1195, 1196, 1199, 1202, 1203, 1204, 1205, 1206, 1207, 1209, 1211, 1212, 1216
1312, 1324, 1326, 1343, 1358, 1363, 1364, 1366, 1376, 1378, 1382, 1386, 1389, 1391, 1392, 1399, 1434, 1446
1461, 1463, 1464, 1466, 1496
```

Last completed file commit: 8286dea (editor-store-types.ts). All later application files remain planned,
not skipped or tested. No aggregate of all application files is available yet.

## Editor store completed result

This section supersedes the historical handoff above. Renewed budget: 21:06:40–21:36:40 local,
2026-11-01. Final run ended 21:25:53. Initial baseline 87.28%: 1272 Killed, 180 Survived,
11 Timeout, 7 NoCoverage. Final 92.31%: 1342 Killed, 111 Survived, 15 Timeout, 2 NoCoverage,
zero mutant errors/ignored and zero new launch errors. The unchanged 93% threshold fails;
this is a completed file audit, not a threshold pass. No layer shard was run.

Renewed runs: 89.80, 90.07, 90.54, 91.43, 91.97, 92.31. The last increase includes four
additional timeouts, not four assertion kills. Killed increased by 70 over the initial baseline
and by 34 over the prior handoff. Mutant 1137 is now assertion-killed by the pinned-parent
deletion scenario with a second root; its first fixture independently blocked last-root deletion.

New coverage includes history preserving folded dates, typing boundaries around Agenda selection,
search and date moves, clipboard failure recovery, search cancellation and fold ownership,
context selection after deletion, expanded preceding descendants, insertion before an expanded
node, layout invalidation, no-op search saves, absent Vim registers, and history with no net text change.
Existing assertions, production code, exclusions and threshold are unchanged.

Survivor classification: 22 defensive, 88 equivalent/redundant within supported inputs,
and one qualified inactive-focus case (1211). Defensive IDs:
15, 103, 143, 191, 287, 324, 514, 515, 517, 555, 569, 599, 616, 617, 618, 620,
714, 773, 775, 1160, 1378, 1386.
For 1211, Agenda destination selection replaces the temporary Tree focus when selecting a real row;
on a day header that focus is inactive, search uses the day key and closing restores the recorded origin.
This is not universal snapshot equivalence. Sentinel equivalents assume application-generated IDs.
All remaining IDs were inspected; no unresolved supported assertion gap remains.
Detailed per-ID reasoning is retained for continuation in
`.scratch/application-mutation/editor-store-triage-renewed.md`.

NoCoverage 518/716 are parser/lookup defenses. Final Timeout IDs:
433, 436, 437, 443, 444, 449, 452, 453, 455, 1266, 1267, 1434, 1446, 1461, 1463.
The first nine exhausted flush-loop hit limits. 1266/1267 affect pending-edit removal.
The last four were Survived in the preceding run and are elapsed-time results without assertion
evidence. They remain Timeout in the final status counts, despite source-level guard analysis.

Every renewed run used the dedicated full-file command recorded above. Final dry run: 2000 tests.
Ordinary validation: all 368 focused tests passed; after the last fixture change its eight-test
file passed again. Renderer types, lint, changed formatting and whitespace checks passed for
the final tests. Primary diff review confirmed additive tests-only implementation scope.
No runtime or performance behavior changed, so no Electron/visual/performance check was needed.
Next file: src/application/editor-text-session.ts, with its own incremental report.

## ZIP reader completed result

2026-11-01, 21:58:21–22:01:24 local. Baseline 96.72%, final 97.66%:
Killed 412 → 416, Survived 14 → 10, Timeout 1 unchanged; NoCoverage/errors/ignored 0.
Four added cases kill 125 (minimal ZIP64 locator), 337/340 (invalid local name/extra lengths
without a displaced payload) and 426 (missing trailing zero output masked by initialized memory/CRC).
Remaining equivalent survivors: 96/111/114/249/342 change endian reads used only to compare with zero;
196 changes an initializer overwritten by decoding; 374/377/378 remove an overflow guard but
Uint8Array.set throws and the enclosing catch reports the same damaged-entry error;
394 adds a zero-length read after an exact full slice without feeding any extra inflater data.
Timeout 24 changes the inflate step from 16384 to 0.015625, causing excessive loop work;
it remains an elapsed-time outcome, not assertion evidence.

```sh
npm run test:mutation -- --mutate src/application/notes-archive/zip-reader.ts --incrementalFile .scratch/application-mutation/zip-reader.incremental.json --concurrency 4 --timeoutMS 10000
npm test -- src/application/notes-archive/zip-reader.test.ts
```

Final dry run: 82 tests; focused run: 24 tests passed. Renderer types, lint, formatting,
documentation and diff checks passed. Primary review: only new tests; existing assertions,
production code and policy remain unchanged. Next: recent-node-persistence.ts.

## Import notes completed result

2026-11-01, 21:57:27–21:58:00 local. Baseline/final unchanged 100%; Killed 128,
Timeout 1, Survived/NoCoverage/CompileError/RuntimeError/Ignored 0. Timeout 11 removes
the node-count loop body, so the stack never shrinks; hit-limit exhaustion is not an assertion kill.
Existing import tests cover validation, byte conflicts, exact limits, cleanup failures and progress.

```sh
npm run test:mutation -- --mutate src/application/notes-archive/import-notes.ts --incrementalFile .scratch/application-mutation/import-notes.incremental.json --concurrency 4 --timeoutMS 10000
```

Dry run: 58 tests passed. Threshold, docs, changed formatting and diff checks passed.
Primary review: analysis-only; no production or test changes. Next: notes-archive/zip-reader.ts.

## Export notes completed result

2026-11-01, 21:56:42–21:57:12 local. Baseline/final unchanged 100%; Killed 55,
Survived/Timeout/NoCoverage/CompileError/RuntimeError/Ignored 0. Existing archive tests
cover payloads, order, progress, invalid heads and exact size/entry bounds; no additions needed.

```sh
npm run test:mutation -- --mutate src/application/notes-archive/export-notes.ts --incrementalFile .scratch/application-mutation/export-notes.incremental.json --concurrency 4 --timeoutMS 10000
```

Dry run: 81 tests passed. Threshold, docs, changed formatting and diff checks passed.
Primary review: analysis-only; no production or test changes. Next: notes-archive/import-notes.ts.

## Desktop data operations completed result

2026-11-01, 21:54:58–21:56:13 local mutation window. Baseline/final 97.10%:
Killed 401 → 402, Survived 11 unchanged, Timeout 1 → 0, NoCoverage 1 unchanged;
mutant errors and ignored 0. The new pending-notice test verifies exactly one request across
store notifications (PRODUCT.md §25.3), killing former Timeout 98 with an assertion.
Remaining equivalent/redundant survivors: 6 (import mode overwritten before use),
34 (the extra import call is refused after export synchronously enters choosing),
49/50 (confirmation already makes replacement/restart busy), 112 (clearing an absent timer),
278 (unobserved error cause), 335/367 (suspended branch cannot run before committing),
435 (disposal invalidates current through disposed regardless of epoch direction).
Defensive survivors 214 (stale timer already cleared), 319 (confirming requires confirmation);
NoCoverage 368 is the unreachable suspended-but-not-committing recovery call.

```sh
npm run test:mutation -- --mutate src/application/notes-archive/desktop-data-operations.ts --incrementalFile .scratch/application-mutation/desktop-data-operations.incremental.json --concurrency 4 --timeoutMS 10000
npm test -- src/application/notes-archive/desktop-data-operations.test.ts
```

Final dry run and focused run: 73 tests passed. Renderer types, lint, changed formatting,
documentation and diff checks passed. Primary review: one added test, no production changes
or changed existing assertions. No runtime change requires E2E/performance validation.
Next: notes-archive/export-notes.ts.

## CRC32 result

Starting commit 34e7e39; 21:52:18–21:52:52. Baseline/final 93.33% / unchanged.
11 Killed, 1 Survived, 3 Timeout; NoCoverage/errors/ignored zero. Dry run: 78 tests.
Survivor 2 writes one extra table entry at index 256, ignored by the fixed-size Uint32Array.
Timeout 4/9/14 reverse loop advancement; they are not assertion kills. Existing archive tests
cover the CRC computation; primary review found no supported assertion gap and no test edit was made.

```sh
npm run test:mutation -- --mutate src/application/notes-archive/crc32.ts --incrementalFile .scratch/application-mutation/crc32.incremental.json --concurrency 4 --timeoutMS 10000
```

Threshold, docs, changed formatting and whitespace checks passed. Next: desktop-data-operations.ts.

## Archive policy result

Starting commit b7597b0; 21:51:16–21:51:37. Baseline/final 100% / unchanged.
35 Killed; all other statuses zero. Dry run: 331 tests. Existing export/import/ZIP tests
cover this module; there is no separate archive-policy.test.ts. Primary source and coverage
review found no gap; no tests changed.

```sh
npm run test:mutation -- --mutate src/application/notes-archive/archive-policy.ts --incrementalFile .scratch/application-mutation/archive-policy.incremental.json --concurrency 4 --timeoutMS 10000
```

Threshold, docs, changed formatting and whitespace checks passed. Next: notes-archive/crc32.ts.

## Archive messages result

Starting commit 6a8eea4; 21:49:07–21:50:35. Baseline 95.42%: 124 Killed, 5 Survived,
1 Timeout, 1 NoCoverage. Final 96.95%: 126 Killed, 4 Survived, 1 Timeout, 0 NoCoverage;
errors/ignored zero. Tests kill the exact megabyte rounding boundary (66) and previously
uncovered singular missing-image folder message (112).

68/69/71 defend the maximum GB unit for sizes near a terabyte, beyond PRODUCT §24.2's
2,147,483,647-byte archive limit and the same restore validation limits. 80 changes decimal
precision only at the integer 100, which formats identically. Timeout 72 removes loop progress;
it is not an assertion kill. No supported assertion gap remains.

```sh
npm run test:mutation -- --mutate src/application/notes-archive/archive-messages.ts --incrementalFile .scratch/application-mutation/archive-messages.incremental.json --concurrency 4 --timeoutMS 10000
npm test -- src/application/notes-archive/archive-messages.test.ts
```

Final dry run: 249 tests; focused run: 11 tests. Renderer types, lint, formatting, docs and
whitespace checks passed. Primary review confirms additive tests and unchanged runtime.
Next: notes-archive/archive-policy.ts.

## Node search result

Starting commit 5698949; 21:46:07–21:48:14. Baseline 86.30%: 58 Killed, 10 Survived,
5 Timeout. Final 91.78%: 62 Killed, 6 Survived, 5 Timeout; NoCoverage/errors/ignored zero.
Threshold fails; no layer run. New tests kill 22/46/70/73 by checking ancestor restoration,
multi-level breadcrumbs, cancellation of the scheduled callback and no rescheduling from a stale wakeup.

Remaining 4 prepares an unused text pattern for tag queries; 47/49 visit empty child arrays
and immediately pop them, preserving results and yielded work. 32 defends an undefined pattern:
EditorStore filters short/empty ordinary queries before calling this search. 74 defends the
cancel callback that the scheduler always supplies. 60 permits one extra generator step per
bounded batch; exact 8192-step boundaries are not a product requirement. It is a bounded-batch
variant rather than identical scheduling. Timeout 14/21/65/67/68 prevent traversal/progress
or completion and are not assertion kills.

```sh
npm run test:mutation -- --mutate src/application/node-search.ts --incrementalFile .scratch/application-mutation/node-search.incremental.json --concurrency 4 --timeoutMS 10000
npm test -- src/application/node-search.test.ts
```

Final dry run: 2005 tests; focused run: 5 tests. Renderer types, lint, formatting, docs and
whitespace checks passed. Only formatting changed after the final mutation input was captured;
runtime test behavior is identical. Primary review confirmed additive tests and unchanged source.
Next: notes-archive/archive-messages.ts.

## Menu commands result

Starting commit b5c9b2d; 21:43:16–21:45:30. Baseline 79.31%: 23 Killed, 5 Survived,
1 NoCoverage. Final 89.66%: 26 Killed, 3 Survived, 0 NoCoverage; Timeout/errors/ignored zero.
Threshold fails at the unchanged 93%. Tests now cover an availability update while another
entry is unchanged, no implicit aliases, and no active toggle mark on a data action.
11/24 and previously uncovered 26 are assertion-killed. Remaining 18/21 defend dense arrays
with equal lengths. 25 returns undefined instead of false, equivalent for the UI's active predicate;
the test intentionally checks truthiness rather than inventing stricter runtime semantics.

```sh
npm run test:mutation -- --mutate src/application/menu-commands.ts --incrementalFile .scratch/application-mutation/menu-commands.incremental.json --concurrency 4 --timeoutMS 10000
npm test -- src/application/menu-commands.test.ts
```

Final dry run: 265 tests; focused run: 4 tests. A new test initially supplied an extra argument
to active; typecheck detected it, it was corrected, and affected checks and mutation evidence
were rerun. Final renderer types, lint, formatting, docs and whitespace checks passed.
Primary review confirmed additive tests and unchanged production. Next: node-search.ts.

## Folder backup result

Starting commit c6b8274; 21:40:31–21:42:55. Baseline 95.40%: 83 Killed, 4 Survived.
Final 96.55%: 84 Killed, 3 Survived; Timeout/NoCoverage/errors/ignored zero.
New coverage kills 39: stopping during one image write must prevent reading the next image.
An intermediate assertion also constrained which filename came first (97.70%); the final new
test checks only the required absence of further I/O, so it does not invent an image-order requirement.
No pre-existing assertion was changed.

Remaining 22 defends an already-cancelled timer callback; run starts synchronously when its
callback fires. 89 only adds clearTimeout(undefined), a no-op for supported host clocks.
35 removes sorting: successful backup content and images-before-document ordering stay the same;
the order of different images is unspecified. Collision failures can leave a different first image,
so this is an unspecified-order variant, not universal destination-byte equivalence.

```sh
npm run test:mutation -- --mutate src/application/folder-backup.ts --incrementalFile .scratch/application-mutation/folder-backup.incremental.json --concurrency 4 --timeoutMS 10000
npm test -- src/application/folder-backup.test.ts
```

Final dry run: 18 tests; ordinary focused run: 17 tests. Renderer types, lint, formatting,
docs and whitespace checks passed. Primary review confirms a tests-only change and no boundary
implementation changes. Next: menu-commands.ts.

## Expansion state result

Starting commit f53dde4; 21:38:38–21:39:24. Baseline/final 98.65% / unchanged.
73 Killed, one Survived; Timeout/NoCoverage/errors/ignored zero. Dry run: 2274 tests.
Survivor 57 removes the empty-set early return from collapseForest; the final unchanged-size
check still returns the original state. No confirmed gap or test change. Primary review completed.

```sh
npm run test:mutation -- --mutate src/application/expansion-state.ts --incrementalFile .scratch/application-mutation/expansion-state.incremental.json --concurrency 4 --timeoutMS 10000
```

Threshold, documentation, changed-formatting and whitespace checks passed. Next: folder-backup.ts.

## Emoji history result

Starting commit d12d17d; 21:35:27–21:37:56. Baseline 67.86%: 17 Killed, 9 Survived,
2 Timeout. Final 82.14%: 22 Killed, 5 Survived, 1 Timeout; NoCoverage/errors/ignored zero.
The 93% threshold fails; no layer run or configuration changes. New tests cover a promotion
whose tail entry stays at the same index, automatic retry without an explicit flush, and an
absent preference writer. Mutants 8/17/18/23 are now Killed; prior Timeout 26 is now Killed too.

Remaining equivalents: 0/1 normalize an unknown emoji away; 13 removes a redundant length
comparison because a normalized prepend cannot shrink history and a new first item fails the
retained every predicate; 16 queues an idle flush whose saved/revision loop writes nothing;
19 reverses the private revision counter while preserving equality and captured revisions.
Timeout 27 removes the write/progress body and is not an assertion kill.

```sh
npm run test:mutation -- --mutate src/application/emoji-history.ts --incrementalFile .scratch/application-mutation/emoji-history.incremental.json --concurrency 4 --timeoutMS 10000
npm test -- src/application/emoji-history.test.ts
```

Final dry run: 2203 tests; ordinary focused run: 6 tests. Renderer types, lint, changed formatting,
docs and whitespace checks passed. Primary review confirmed additive tests and unchanged runtime.
Next: expansion-state.ts.

## Editor text session result

Starting commit c008f56; 21:26:39–21:27:35. Baseline/final 100% / unchanged.
28 Killed; Survived, Timeout, NoCoverage, errors and ignored all zero. Dry run: 2007 passing tests.
No confirmed gap or test change. Primary source/test/report review completed.

```sh
npm run test:mutation -- --mutate src/application/editor-text-session.ts --incrementalFile .scratch/application-mutation/editor-text-session.incremental.json --concurrency 4 --timeoutMS 10000
```

Threshold, documentation, changed-formatting and whitespace checks passed.
