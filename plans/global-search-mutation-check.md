# Global Search Mutation Check

## Status and authorization

Status: Deferred by the Product Owner on 2026-11-08.

The owner requested recording the remaining Stryker check as a follow-up for a
possible overnight run. The current Search change may finish without these layer
results. This is an explicit task-specific postponement, not a passing check or a
change to the repository's mutation policy. Generic continuation must not start
this deferred work. Resume only when the owner explicitly requests it or provides
the results of their run.

Scope: finish mutation validation for the accepted Global Search presentation.
No new product behavior, dependency changes, threshold reductions or mutation
exclusions are authorized. The owner separately accepted existing development
npm vulnerabilities; `npm run audit -- --omit=dev` found zero vulnerabilities.

Sources: [testing strategy](../docs/DEVELOPMENT.md#12-testing-strategy),
[workflow](../docs/AGENT_WORKFLOW.md#10-validation),
[Search requirements](../docs/PRODUCT.md#2014-search-and-recent-nodes).

## Task

| ID | Outcome | Dependencies | Acceptance evidence | Status |
| --- | --- | --- | --- | --- |
| S1 | Complete domain/application mutation checks and assess Search survivors | Explicit resumption or owner-run results | Complete scoped reports, scores, survivor comparison and post-Stryker focused tests | Planned; deferred |

Expected files: this plan and its index entry for status/retirement. Production
changes are outside this follow-up. Observable assertion gaps in the changed
Search behavior must be reported before choosing a correction. Unrelated
survivors must remain separate from this task.

Validation tier: documentation-only for recording results. Runtime validation is
the named mutation layer checks below and affected ordinary tests after cleanup.
Reuse the Search change's valid full functional, Electron, visual and performance
evidence when the tested inputs remain unchanged.

## Known results

- Pre-change baseline: `4aafcb6`, whole-file selection of
  `src/application/node-search.ts`, `src/application/recent-nodes.ts` and
  `src/domain/tag-catalog.ts`: 93.07%, 462 mutants, 32 survivors. All survivors were
  inspected. The local report is `reports/search-baseline-incremental.json`.
- Final focused selection added `src/domain/tag-search.ts`: 87.43%, 533 mutants,
  67 survivors and 7 timeouts; exit status 1. Its local report is
  `reports/search-final-incremental.json`. Existing optimization survivors and
  changed timeout classifications account for many differences from baseline.
- New observable gaps in ancestor tag offsets/cutoffs/name filtering and global
  suggestion ranking were covered afterward. The focused result above predates
  those assertions. It must not be reported as the score of the strengthened tests.
- Full domain and application runs were interrupted at the owner's request,
  both with exit status 130. Stryker saved partial incremental reports. Neither
  layer has a verified final score. Partial report counts are not full denominators.
- Local caches: `reports/search-domain-cached-incremental.json` and
  `reports/search-application-cached-incremental.json`. These ignored artifacts
  are optional; commands work without them by running fresh checks. Reconstruct
  the baseline from `4aafcb6` in an isolated worktree if its local report is absent.

## Overnight commands

Run from the repository root, one command at a time. Wait for the first command
to finish before starting the second; both use Stryker's default sandbox and
HTML/JSON reporter destination. The separate incremental files retain the layer
results even when the default report is overwritten. Keep the configured 93%
threshold and all static mutants. Stryker validates reused cache entries itself.

```sh
npm run test:mutation -- --shard domain --concurrency=4 --incrementalFile=reports/search-domain-cached-incremental.json
```

```sh
npm run test:mutation -- --shard application --concurrency=4 --incrementalFile=reports/search-application-cached-incremental.json
```

Confirm each report's file set and denominator against its named layer. Read
survivors in the four changed files and compare them with baseline. Distinguish
assertion failures, existing gaps and timeouts; do not label unexplained survivors
equivalent. Record a failing layer score honestly and investigate within scope.
Only after both processes and their sandboxes are cleaned up, run:

```sh
npm test -- src/domain/tag-search.test.ts src/domain/tag-catalog.test.ts src/application/node-search.test.ts src/application/recent-nodes.test.ts
```

## Owner involvement and continuation

One substantive validation task remains. There is no separate initiative
acceptance round. The owner may run the commands overnight and then request
analysis, or explicitly resume an agent run. No runtime access or budget for a
future agent session is assumed. Any implementation expansion needs authorization.

Exact next task: none ready; S1 is deferred. After complete results are reviewed
and any findings are settled, remove this plan and its index row in the closure
commit. Do not retain it as a permanent validation archive.

Resume prompt: "Resume the deferred Global Search mutation check in
plans/global-search-mutation-check.md; inspect existing results first and finish
only the remaining validation and survivor analysis."
