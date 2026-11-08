# Domain and Application Mutation Sweep

Status: Paused by the Product Owner on 2026-11-08; partial results approved for saving.

## Scope and authorization

The owner invoked mutation-sweep for Global Search first, then src/domain, then
src/application. The owner stopped the sweep and authorized saving the finished
subset: three catalog tests and the validation/continuation record. This saving
authorization does not resume the sweep. The owner intends to invoke the skill
in another session.

Future sweep changes remain uncommitted until separately authorized for saving.
Production fixes require separate owner review. Do not change dependencies,
mutation thresholds, exclusions or runner settings. Resume only on an explicit
owner request; generic continuation must not start paused work.

## Delivered subset

Three tests in src/domain/tag-catalog.test.ts detect meaningful mutations:

- A document without tags must have no global tag suggestions, including after
  removal of the final occurrence.
- Warmed inline suggestions must reflect additions, removals and restored
  snapshots.
- Ordered-subsequence matching must reject candidates with incorrect character
  order or insufficient repetitions.

No production behavior, configuration or shared fixtures changed. No production
defect was reproduced. The former Global Search follow-up is finished with the
runner limitations below; do not repeat its runs solely for handoff.

## Validation and limitations

Tested snapshot: d3b15c6 plus the three catalog tests; production source unchanged.
Both complete layer runs used concurrency 4 and the unchanged 93% threshold.

| Layer | Score | Killed | Timeout | Survived | Uncovered | Runtime errors | Ignored | Duration |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Domain | 94.48% | 3565 | 131 | 200 | 16 | 8 | 2 | 15m33s |
| Application | 94.86% | 6709 | 89 | 355 | 13 | 2 | 26 | 37m32s |

Both numerical gates passed with exit 0. All 24 domain and 41 application targets
were instrumented. Every JSON source entry matched the working tree; document.ts
is a re-export facade without mutants. The post-Stryker four-file Search command
passed 53 tests. Types, lint, formatting and documentation governance passed.

Ten runtime errors remain unresolved mutation results, excluded from Stryker's
score and not counted as killed. Mutated static Intl.Segmenter options, emoji
table mappings and natural-date table/boundary constructors throw during module
loading before tests run. These are runner limitations, not observed production
failures. Any test-loading/tooling correction needs separate scope assessment;
do not suppress errors or force rerun without new evidence.

Search survivors were compared with the earlier baseline. Current focused
results: tag catalog 84.42% with 36 survivors, node search 94.39% with six, recent
nodes 93.98% with ten, and tag search 100% with none. All nine earlier node-search
presentation gaps are detected by existing assertions. Remaining Search survivors
have supported-input control-flow or optimization arguments; performance
equivalence is not asserted. The catalog's focused threshold remains failed;
the complete domain numerical gate is the recorded layer acceptance result.

## Remaining work and continuation

| Work | Status | Next action |
| --- | --- | --- |
| Global Search follow-up and three catalog tests | Saved partial subset with runner limitations | Reuse valid evidence |
| Remaining domain file sweep | Paused; 10 of 24 files reviewed | Finish document-links.ts analysis |
| Remaining application file sweep | Paused; 2 of 41 files reviewed | Start remaining application queue after domain |

The active checkpoint is
`.scratch/mutation-sweep/domain-application/checkpoint.md`. It records the full
queue, residual arguments, commands, cache/report paths and validation boundaries.
No task-owned processes remain. No unfinished test edits exist.

The sole interrupted file is document-links.ts: 23 survivors and six uncovered
mutants are not fully classified. Finish reading its tests in smaller sections;
the earlier combined output was truncated. Investigate the retained-range filter
mutant against supported edits spanning multiple links before claiming equivalence.
No defect reproduction or correction has been established for it.

On explicit resumption, compare Git state and live processes with the checkpoint.
Reuse valid layer evidence and caches; rerun only checks invalidated by changed
inputs. Continue one production file at a time. Keep new changes uncommitted.
Validation remains Low Risk for test-only changes: affected ordinary tests,
types, lint, formatting/governance and mutation analysis. Reassess if scope changes.
Finish with accumulated diff review; use independent roles only when required.
Retire this unfinished plan/index entry after the broader sweep is settled and
saving/closure is authorized; do not retain it as a permanent validation archive.
