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

Save-policy analysis is complete without test changes. Next is persistence-coordinator.ts,
then editor-save-scheduler.ts and editor-history.ts; enumerate the remaining source files
from the live Stryker application patterns in lexical order, excluding tests and application/test.
Every application source other than save-policy.ts remains unexamined; none is marked skipped or done.
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
| 2 | persistence-coordinator.ts | Ready |
| 3 | editor-save-scheduler.ts | Planned |
| 4 | editor-history.ts | Planned |
| 5 | agenda-pending-move.ts | Planned |
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
