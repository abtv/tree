# E2E Suite Time

## Objective

Reduce the local wall time of the end-to-end suite and stop it from growing in proportion to the number of tests, without losing real-boundary coverage required by `AGENTS.md` §9.

## Scope

In scope: E2E fixtures and launch infrastructure in `e2e/`, timing tooling, the editing-mode composition of E2E specs, and the validation policy that decides when the full suite runs locally.

Out of scope: product behavior, the performance suite in `perf/` (it stays serial and visible per ADR 0012), unit-test speed, and CI runner changes beyond reporting.

Sources of truth: `AGENTS.md` §§9-10, [Development Guide](../docs/DEVELOPMENT.md) §8 (Editing-mode end-to-end coverage) and §9 (Risk-Based Validation), [ADR 0002](../docs/decisions/0002-e2e-testing-with-playwright.md), [ADR 0011](../docs/decisions/0011-hidden-e2e-windows.md), [ADR 0012](../docs/decisions/0012-parallel-e2e-execution.md).

## Authorization

The Product Owner authorized creating this initiative on 2026-10-11 and will start it in a new session. A continuation request authorizes the next `Ready` task within this scope.

Decisions reserved for the Product Owner:

* **D1.** Whether to adopt a shared application per worker (E2E-3 result). Adoption changes the E2E isolation model and needs an ADR.
* **D2.** Which `both` spec files or tests move to a single editing mode (E2E-4 proposal).
* **D3.** Whether local validation runs only affected E2E specs and leaves the complete suite to CI (E2E-6). This changes `AGENTS.md` §10 and the validation matrix.
* **D4.** Whether a suite-duration budget is a report or a failing gate, and its value (E2E-7).

## Baseline (2026-10-11, commit 701e9e6)

Local macOS development machine, hidden run, six workers, `npm run test:e2e -- --reporter=list`, one run:

* 746 tests in 58 files, all passed; 2.9 min wall; 904.9 s summed test time; mean 1.21 s per test. Wall time is close to summed time divided by 5.2, so each added test costs about 0.23 s of wall time.
* Duration buckets: 445 tests under 1 s, 232 at 1-2 s, 57 at 2-5 s, 9 at 5-10 s, 3 at 10 s or more.
* Editing-mode duplication: `[vim editing]` blocks 262.4 s, `[standard editing]` blocks 228.0 s, single-mode tests 414.5 s. Duplicated blocks are 54% of summed time.
* Launch cost: a temporary spec whose only body was `launchTree(userDataDir)`, run with `--repeat-each=30 --workers=6`, measured 0.70-0.89 s inside `launchTree` and 0.83-1.0 s per test including fixture teardown. Launch and teardown therefore account for at least 74% of summed time (746 × ~0.9 s); the share is a lower bound because some tests relaunch.
* Slowest tests wait on product timers: `persistence-lock.spec.ts` (23.4 s), `shutdown-failures.spec.ts` (17.8 s), `persistence.spec.ts` (12.6 s). They do not determine wall time at six workers.
* Largest files by summed time: `drag-and-drop-hierarchy.spec.ts` 104.1 s (55 tests), `vim-navigation-and-visual.spec.ts` 48.9 s (79), `shutdown-failures.spec.ts` 48.4 s (11), `drag-and-drop.spec.ts` 36.9 s (20), `vim-text-editing.spec.ts` 36.9 s (54).
* For comparison, ADR 0012 recorded 54.7-54.9 s for the complete suite on 2026-09-20.

Unmeasured: launches per test, the split of launch time between Electron startup, first-window load, and fixture assertions, and run-to-run variance.

## Tasks

| ID | Outcome | Depends on | Status |
| --- | --- | --- | --- |
| E2E-1 | Repeatable timing report and launch-time breakdown | — | Done |
| E2E-2 | Remove avoidable per-launch fixture overhead | E2E-1 | Done |
| E2E-3 | Prototype and measure a shared application per worker | E2E-1 | Ready |
| E2E-4 | Editing-mode audit and proposal | — | Ready |
| E2E-5 | Apply the approved editing-mode reclassification | E2E-4, D2 | Planned |
| E2E-6 | Local affected-spec validation policy | D3 | Blocked |
| E2E-7 | Suite-duration report or budget | E2E-1, D4 | Planned |
| E2E-8 | Roll out the shared application | E2E-3, D1 | Planned |

### E2E-1 — Timing report and launch breakdown

Add a repeatable timing workflow so later tasks measure with one approved command and no ad-hoc environment prefix (`docs/DEVELOPMENT.md` §8 explains why prefixes cost approvals).

* Add `test:e2e:timing` to `package.json`: build, run Playwright with the JSON reporter writing to `test-results/e2e-timing.json` (any environment assignment lives inside the npm script), then run `scripts/e2e-timing.mjs`.
* `scripts/e2e-timing.mjs` reads the report and prints wall time, summed time, mean, duration buckets, per-file totals, per-editing-mode totals, the 20 slowest tests, and launches per test.
* In `e2e/fixtures.ts`, record each `launchTree` call as a test annotation with its phase durations: `closeTrackedApps` plus `cleanupStaleElectronProcesses`, `electron.launch`, `firstWindow`, and the post-launch assertions. Keep teardown timing from the `userDataDir` fixture too.
* Add `test:e2e:timing` to the approval configuration only if `npm run check:opencode` requires it; `.claude/settings.json` already allows `npm run test:e2e*`.
* Record in this plan: the summary of two runs at the same commit, the launch phase breakdown, launches per test, and run-to-run variance.

Files: `package.json`, `scripts/e2e-timing.mjs`, `e2e/fixtures.ts`, `docs/DEVELOPMENT.md` §8 (one paragraph on the timing command), `opencode.json` and its permission checker if needed, this plan. Validation also exposed unsafe persistence polling in `e2e/agenda-vim.spec.ts`; its contained correction is a separate test-only change preserving all expected results.
Acceptance: the command prints the summary from a fresh run; phase durations add up to the measured launch time within 10%; annotations do not change test results.
Tier: High Risk (shared fixture). `npm run check:full`.

### E2E-2 — Per-launch overhead

Using the E2E-1 breakdown, remove fixture work that is not required for isolation or for the launch assertions in ADRs 0011, 0012, and 0019 (for example repeated process scans). Do not remove an assertion that guards hidden windows, the shortcut stub, the rendering scale, or overlay scrollbars; make it cheaper instead. If the breakdown shows no removable phase above 10% of launch time, record that finding and mark the task `Done` without code changes.

Files: `e2e/fixtures.ts`, `e2e/electron-process.ts`, this plan.
Acceptance: median launch time from `npm run test:e2e:timing` drops against E2E-1; full suite passes twice; ADR 0012 isolation guarantees unchanged.
Tier: High Risk. `npm run check:full`.

### E2E-3 — Shared application prototype

Prototype one Electron application per worker for two mode-independent spec files with many short tests (start with `e2e/tab-structure.spec.ts` and `e2e/navigation.spec.ts`). Between tests, restore a fresh document, view state, undo history, editing mode, appearance, window bounds, and clipboard lock. Evaluate at least two reset mechanisms (for example a reset hook installed by the test-owned `e2e/electron-entry.cjs`, or a new window over a fresh document) and measure reset cost against the E2E-1 launch cost.

Constraints: no test-only IPC channel or reset code in the production bundle (`docs/SECURITY.md`); test hooks stay in test-owned files as `e2e/electron-entry.cjs` does today. Startup, persistence, quit, shutdown, shortcut, window-lifecycle, and appearance-flash specs always keep a fresh launch. The prototype is an opt-in fixture and changes no other spec.

Files: `e2e/fixtures.ts`, `e2e/electron-entry.cjs`, the two specs, this plan.
Acceptance: the two specs pass under `--repeat-each=5` at one and six workers with a state-leak check (each test asserts the fresh initial state first); measured per-test saving recorded here; a recommendation for D1 with the isolation risks it introduces.
Tier: High Risk. `npm run check:full`. Commit the prototype only if it is opt-in and the suite stays green; otherwise record the findings and leave code uncommitted.

### E2E-4 — Editing-mode audit

For each of the 35 files tagged `// @editing-modes: both`, classify every test: does any step pass through a point where the modes differ, as listed in `docs/DEVELOPMENT.md` §8 (Editing-mode end-to-end coverage)? Propose one of: keep both modes; move the file to `independent`; or split mode-dependent tests from mode-independent ones. For each proposal, name the difference point that justifies keeping both modes, the screenshot baselines that would become orphans, and the saving in summed seconds from the baseline above. Do not change specs.

Files: this plan only (append the proposal table).
Acceptance: every test of every `both` file is classified; the proposal states the total expected saving.
Tier: Minimal Risk. `npm run format:check:changed`, `npm run check:docs`.

### E2E-5 — Apply editing-mode reclassification

Apply the subset approved in D2. Update file categories, remove orphaned baselines with `npm run retire:file`, and update `docs/VIM_CONFORMANCE.md` if a cited test name changes.

Files: approved `e2e/*.spec.ts` files and their snapshot directories, `docs/VIM_CONFORMANCE.md` if needed, this plan.
Acceptance: `npm run check:e2e-modes` and `npm run check:docs` pass; no requirement loses its `@requirement` marker (`npm run check:requirements`); summed time drops as predicted within 20%.
Tier: Low Risk with full E2E run. `npm run check` and `npm run test:e2e`.

### E2E-6 — Local affected-spec validation

Blocked on D3. If approved: add `test:e2e:changed` using Playwright `--only-changed=HEAD`, define in `docs/DEVELOPMENT.md` §9 which changes still require the complete suite locally (shared fixtures, startup, shutdown, persistence, toolchain), and update `AGENTS.md` §10 accordingly. Record the trade-off: a regression in an unrun spec appears in CI after the commit lands on `main`.

Files: `package.json`, `docs/DEVELOPMENT.md` §9, `AGENTS.md` §10, `opencode.json` if needed, this plan.
Tier: Low Risk (agent policy and tooling). `npm run check`, `npm run check:opencode`.

### E2E-7 — Duration report

Publish the E2E-1 summary in the CI E2E job summary, and apply D4 (report only, or a failing budget).

Files: `.github/workflows/e2e.yml`, `scripts/e2e-timing.mjs`, this plan.
Tier: Low Risk. `npm run check`.

### E2E-8 — Shared application rollout

Planned only if D1 approves adoption. Write the ADR, then split the rollout into per-area tasks in this plan before starting.

## Findings

### E2E-1 measurements (2026-10-11)

Two sequential `npm run test:e2e:timing` runs on the local macOS GUI session, hidden windows, six workers. Both used the same uncommitted implementation snapshot based on commit `805922e`. Measured Git blob IDs: `e2e/fixtures.ts` `16bbf6784c4268bbd41c782dcbb34f644b8d0016`, `scripts/e2e-timing.mjs` `53ebaefe48ac9e3d6699d5e7bd98a6c362651af5`, `package.json` `c54e7a5c199a88d67261e7dc78c938cb830c0e01`, `e2e/agenda-vim.spec.ts` `eccaee62f5e6e56efe9016b16431803ce39f06f6`. No source edits or other test suites ran between or during these measurements. An initial sandbox invocation failed to launch Electron (`SIGABRT`, cleanup `kill EPERM`) and was interrupted; it is excluded. Measurements ran with approved access outside the sandbox. The first full-validation run reproduced an unsafe persistence poll in the existing dated-node creation test: an atomic save briefly removes `document.json`, and a throwing poll callback aborts instead of retrying. Its three callbacks were corrected before the recorded measurements; preliminary runs are excluded. A later full-validation run exposed the same race in a cancellation test. The subsequent test-only correction protects all 11 persistence polls in this spec; the table remains measurement evidence for the explicitly identified earlier snapshot, with final validation required after that correction.

| Measure | Run 1 | Run 2 |
| --- | --- | --- |
| Tests | 746 passed, no flaky or skipped tests | 746 passed, no flaky or skipped tests |
| Playwright wall time (build excluded) | 205.86 s | 255.28 s |
| Summed test time | 1047.59 s | 1253.23 s |
| Mean test time | 1.40 s | 1.68 s |
| Duration buckets: <1 / 1–2 / 2–5 / 5–10 / ≥10 s | 305 / 347 / 79 / 11 / 4 | 159 / 412 / 156 / 14 / 5 |
| Vim / standard duplicated blocks | 290.77 / 257.43 s | 333.04 / 303.94 s |
| Single-mode tests | 499.38 s | 616.25 s |
| Launch calls | 795 (1.066 per test) | 795 (1.066 per test) |
| Cleanup: summed / mean / median | 46.18 / 0.06 / 0.05 s | 51.60 / 0.06 / 0.06 s |
| Electron launch: summed / mean / median | 219.22 / 0.28 / 0.27 s | 266.71 / 0.34 / 0.33 s |
| First window: summed / mean / median | 226.98 / 0.29 / 0.27 s | 284.73 / 0.36 / 0.33 s |
| Post-launch assertions: summed / mean / median | 95.64 / 0.12 / 0.11 s | 119.16 / 0.15 / 0.13 s |
| Total launch: summed / mean / median | 588.54 / 0.74 / 0.72 s | 722.71 / 0.91 / 0.87 s |
| Fixture teardown: summed / median | 69.83 / 0.09 s | 83.46 / 0.10 s |
| Maximum phase discrepancy | 1.13% | 0.96% |

Each run had 704 tests with one launch, 35 with two, and seven with three; 746 teardown samples. All launch phase sums were within 10% of measured total launch duration. The wall-time spread was 49.42 s, or 24.0% of run 1 (mean 230.57 s). Summed time rose 19.6%, and the rounded median launch time rose 20.8%. Two samples establish an observed spread, not a stable variance estimate or its cause; later comparisons should repeat the workflow on the same machine and worker count.

Measured launch plus fixture teardown accounted for 62.8% and 64.3% of summed test time. This replaces the earlier rough launch-cost estimate for this snapshot. Electron launch and first-window loading together took approximately 76% of launch time, cleanup 7–8%, and post-launch assertions 16–17%. E2E-2 must inspect whether assertion overhead can be reduced while retaining every assertion; the cleanup phase alone is below its 10% criterion. This is measurement evidence, not an authorization to weaken isolation or assertions.

The workflow prints all file totals and the 20 slowest tests. Run 1's three leading files were `drag-and-drop-hierarchy.spec.ts` (118.95 s), `vim-navigation-and-visual.spec.ts` (59.10 s), and `shutdown-failures.spec.ts` (53.47 s). Run 2's were `drag-and-drop-hierarchy.spec.ts` (131.97 s), `vim-navigation-and-visual.spec.ts` (89.16 s), and `vim-text-editing.spec.ts` (70.58 s). Raw reports are temporary local artifacts at `/private/tmp/tree-e2e1-final-run1.json` and `/private/tmp/tree-e2e1-final-run2.json`; the committed summary supports resumption without those artifacts.

### Validation support: Agenda persistence polling

Two existing tests reproduced ENOENT while polling during the documented atomic-save rename window. The correction uses existing `tryReadPersisted` for all 11 persistence polls across five tests in `e2e/agenda-vim.spec.ts`. The multi-root and first-root projections, expected arrays, and direct post-save assertions are preserved. The complete spec passed three repeats (69 cases); affected TypeScript, lint, format, requirement coverage, and editing-mode checks passed. This contained correction needs no new product decision or structural initiative: the safe reader already exists and the observed test failures share one documented cause in one owner. At that point, E2E-1 still required successful High Risk validation before its timing implementation could be marked complete.

### E2E-1 final validation and Agenda investigation (2026-10-11)

The Product Owner authorized investigating the recurring Agenda performance failures and completing E2E-1 while preserving the timing changes and all performance thresholds. Investigation and validation used HEAD `12f7f97` plus the existing timing implementation, on the same local macOS GUI machine. No application or performance-suite source changed.

The earlier full run breached three unchanged 100,000-node budgets: wide dense date-edit P95 54.4 ms (below 50 required), deep dense undo 100.8 ms (below 100), and mixed dense open 170.1 ms (below 150). `npm run test:perf -- perf/agenda-scale.spec.ts --grep 'agenda-wide-100000-dense|agenda-deep-100000|agenda-mixed-100000-dense' --repeat-each=3 --workers=1` passed 12/12 in 39.7 s outside the sandbox. Across those repeats, open was 107.1–128.9 ms, undo 44.3–68.9 ms, and date-edit P95 36–44 ms.

Source inspection established that the performance suite uses its own fixture and never executes the new E2E timing instrumentation. `perf/agenda-scale.spec.ts` records key-event latency through two animation frames; open and undo each use one sample, while date-edit P95 uses 15 samples. These measurements include renderer and display scheduling. A process probe during the focused run observed high UI-service CPU use (WindowServer 86.3%, WindowManager 47.9%, CursorUIViewService 32.6%); a later full-run probe observed lower values and no remaining `tree-e2e-*` Electron processes. `pmset -g therm` reported no thermal or performance warning. These observations support transient host or display scheduling variability as the leading explanation, but do not prove the process-specific cause of the earlier failures. No persistent runtime regression or E2E process leak was reproduced. The mixed dense open check retains little margin, so intermittent failures remain a risk; thresholds and measurement semantics remain unchanged.

`npm run check:full` passed outside the sandbox on this snapshot: type checks, lint, formatting, documentation and requirement coverage, editing-mode and permission checks, all 3,296 unit tests, unit performance, build, all 746 E2E cases (3.1 minutes), all 60 serial visible Electron performance cases (2.0 minutes), and audit with zero vulnerabilities. In that full sequence the previously failing metrics were wide dense date-edit P95 47.5 ms, deep dense undo 50.2 ms, and mixed dense open 145 ms. Independent review of the full timing diff and untracked report script found no meaningful issues. The existing timing pair above remains evidence for its explicitly identified snapshot; the subsequent polling correction preserved command flow and expected data, and the current full suite passed. `npm run fix:history` listed one earlier OpenCode workflow fix and no package or permission-checker fixes in its 14-day window; no shared structural defect was identified. Temporary investigation evidence is `/private/tmp/tree-e2e1-agenda-investigation.txt`.

The current validation blocker is cleared by the successful full run. E2E-1 introduces no product decisions or architecture changes. This investigation does not authorize performance-suite or product changes outside the initiative.

### E2E-2 measurements and validation (2026-10-11)

The Product Owner selected E2E-2. Inspection of the E2E-1 phases found cleanup below the 10% criterion and post-launch checks at 16–17%. The optimization runs the independent visibility and shortcut evaluations together and combines device-scale and overlay-scrollbar measurements in one renderer evaluation. Every assertion, save-error observer, readiness check, initial editing-mode transition, per-worker process scan, tracked-app teardown, and failure cleanup remains. No product, persistence, architecture, or performance-suite change was made.

Two sequential `npm run test:e2e:timing` runs used HEAD `1449695` plus fixture blob `dd83555afef19abde5735fbf66ffe644af3c0bb8`, on the local macOS GUI, hidden windows, six workers, no overlapping suites or source edits. Both passed 746/746 with zero flaky or skipped cases and 795 launches (1.066 per test).

| Measure | Run 1 | Run 2 |
| --- | --- | --- |
| Wall time, build excluded | 183.37 s | 226.10 s |
| Summed test time | 926.01 s | 1171.71 s |
| Cleanup median | 0.05 s | 0.06 s |
| Electron launch median | 0.24 s | 0.32 s |
| First-window median | 0.22 s | 0.32 s |
| Assertion median | 0.09 s | 0.12 s |
| Total launch median | 0.62 s | 0.87 s |
| Maximum phase discrepancy | 2.69% | 2.26% |

All phase sums were within 10%. Compared with E2E-1's rounded launch medians of 0.72/0.87 s and assertion medians of 0.11/0.13 s, the mean of the two run medians decreased by approximately 6% and 13%, respectively. The 42.73 s wall-time spread is 23.3% of run 1. Other launch phases also improved, so these two samples do not establish the causal saving of this small optimization. Raw reports are temporary artifacts at `/private/tmp/tree-e2e2-run1.json` and `/private/tmp/tree-e2e2-run2.json`.

Full validation reproduced the documented atomic-save polling race in `e2e/agenda-moves.spec.ts`: its throwing reader aborted `expect.poll` on ENOENT. A separate contained test correction reuses `tryReadPersisted` for its text projection, preserving all expected arrays and propagating malformed-file errors. The corrected spec (blob `0b3d224dfbc6fc576d1545ed166fd00c87cb505d`) passed `npm run test:e2e -- e2e/agenda-moves.spec.ts --repeat-each=3` (42/42). `npm run fix:history -- e2e/agenda-moves.spec.ts` found no fix commits in its 14-day window. The safe reader already owns this solution; no structural initiative is needed for this focused reuse.

`npm run check:full` passed static checks, governance, all 3,296 unit tests, unit performance, and build before the polling failure (745 E2E cases passed). After the correction, affected `npm run typecheck:e2e`, `npm run lint`, and `npm run format:check:changed` passed, and `npm run test:e2e` passed 746/746 (2.8 min). `npm run audit` reported zero vulnerabilities. `npm run test:perf` passed 59/60 cases; deep dense Agenda typing P95 failed at 55.4 ms against the unchanged 50 ms ceiling. `npm run test:perf -- perf/agenda-scale.spec.ts --grep agenda-deep-100000-dense --repeat-each=3 --workers=1` then passed 3/3, with typing P95 43.2/32.2/33.0 ms. Performance uses its own unchanged fixture. These repeats support intermittent timing variation, without proving its cause; the intermittent extreme-scale performance risk already noted in E2E-1 remains. Valid unaffected stages and the affected/remainder reruns together satisfy the full validation tier; neither earlier failure is represented as a passing full command.

Independent review found no meaningful issues, including preservation of launch assertions and isolation and the ENOENT-only polling retry. Final `npm run format:check:changed` and `npm run check:docs` passed. The polling correction landed separately in `227b352`. The Product Owner explicitly requested continuing in the same session after the initial failed validation, overriding the default session-stop rule. E2E-2 is complete with no new product decisions; the causal speedup remains unquantified.

## Next Task

E2E-3 (opt-in shared-application prototype) and E2E-4 (editing-mode audit) are ready and independent. The Product Owner selects the next task. Adoption of a shared application remains reserved under D1; E2E-3 authorizes only the bounded prototype and measurement.

## Resume Prompt

```text
Continue the E2E suite time initiative (plans/e2e-suite-time.md): take E2E-3, the opt-in shared-application prototype.
```
