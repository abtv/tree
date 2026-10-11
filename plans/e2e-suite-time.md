# E2E Suite Time

## Objective

Reduce the local wall time of the end-to-end suite and stop it from growing in proportion to the number of tests, without losing real-boundary coverage required by `AGENTS.md` §9.

## Scope

In scope: E2E fixtures and launch infrastructure in `e2e/`, timing tooling, the editing-mode composition of E2E specs, and the validation policy that decides when the full suite runs locally.

Out of scope: product behavior, the performance suite in `perf/` (it stays serial and visible per ADR 0012), unit-test speed, and CI runner changes beyond reporting.

Sources of truth: `AGENTS.md` §§9-10, [Development Guide](../docs/DEVELOPMENT.md) §8 (Editing-mode end-to-end coverage) and §9 (Risk-Based Validation), [ADR 0002](../docs/decisions/0002-e2e-testing-with-playwright.md), [ADR 0011](../docs/decisions/0011-hidden-e2e-windows.md), [ADR 0012](../docs/decisions/0012-parallel-e2e-execution.md).

## Authorization

The Product Owner authorized creating this initiative on 2026-10-11 and will start it in a new session. A continuation request authorizes the next `Ready` task within this scope.

Product Owner decisions (2026-10-11):

* **D1 — approved.** Adopt a shared application per worker through bounded same-window reuse for eligible specs. Record the isolation model in an ADR and split rollout into ordered tasks before adoption. Fresh-process boundary exclusions remain.
* **D2 — declined.** Keep existing editing-mode coverage. Do not implement the three proposed reductions.
* **D3 — approved.** Use affected E2E specs for contained local changes and retain the complete suite in CI. E2E-6 keeps the planned complete-local exceptions for High Risk changes.
* **D4 — deferred.** Ignore duration reporting and budgets for now; E2E-7 does not proceed.

E2E-8c follow-up authorization (2026-10-11): after repeated unchanged Agenda scale performance failures, the Product Owner requested "Let's raise the limit to 75 ms and commit". This separately authorizes raising the Agenda scale typing/date-edit p95 guard to 75 ms for all six document-scale scenarios; other guard limits remain unchanged. It is a narrow exception to the performance-suite scope exclusion, not authorization for additional performance changes or duration budgets.

The Product Owner's message was: "D1 - yes, D2 - no, D3 - yes, D4 - for now let's ignore it". D1 and D3 authorize their recorded initiative tasks; D2 and D4 do not authorize changes. This session already completed E2E-3 and E2E-4; E2E-6 and D1 rollout preparation are the remaining two tasks before the four-task session limit in `AGENTS.md` §12.

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
| E2E-3 | Prototype and measure a shared application per worker | E2E-1 | Done |
| E2E-4 | Editing-mode audit and proposal | — | Done |
| E2E-5 | No reclassification: D2 declined | E2E-4, D2 | Done |
| E2E-6 | Local affected-spec validation policy | D3 | Done |
| E2E-7 | Suite-duration report or budget (D4 deferred) | E2E-1, D4 | Blocked |
| E2E-8 | Roll out the shared application | E2E-3, D1 | In progress |
| E2E-8a | ADR and ordered rollout preparation | E2E-3, D1 | Done |
| E2E-8b | Harden reset, recovery and memory evidence | E2E-8a | Done |
| E2E-8c | Adopt navigation and Tab structure | E2E-8b | Done |
| E2E-8d | Adopt eligible Vim text-editing cases | E2E-8c | Done |
| E2E-8e | Adopt eligible Vim navigation/selection cases | E2E-8d | Ready |
| E2E-8f | Measure and close the bounded rollout | E2E-8e | Planned |

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

D3 approved. Add `test:e2e:changed` using Playwright `--only-changed=HEAD`, define in `docs/DEVELOPMENT.md` §9 which changes still require the complete suite locally (shared fixtures, startup, shutdown, persistence, toolchain), and update `AGENTS.md` §10 accordingly. Record the trade-off: a regression in an unrun spec appears in CI after the commit lands on `main` or in a pull request. The selector does not infer requirements or dependencies through the Electron build; explicit owning-spec selection remains required.

Files: `package.json`, `docs/DEVELOPMENT.md` §9, `AGENTS.md` §10, `opencode.json`, `scripts/check-opencode-permissions.mjs`, this plan and its index.
Tier: Low Risk (agent policy and tooling). `npm run check`, `npm run check:opencode`.

### E2E-7 — Duration report

Publish the E2E-1 summary in the CI E2E job summary, and apply D4 (report only, or a failing budget).

Files: `.github/workflows/e2e.yml`, `scripts/e2e-timing.mjs`, this plan.
Tier: Low Risk. `npm run check`.

### E2E-8 — Shared application rollout

D1 approved. Write the ADR and split adoption into per-area tasks before changing default execution. The parent task remains incomplete until the bounded rollout lands; preparing its ADR and plan is not runtime adoption.

### E2E-8a — ADR and rollout preparation

Record same-window reuse through explicit eligible-spec opt-in, fresh-process exclusions and surviving caches/instrumentation. Refine rather than supersede ADR 0012. Split fixture hardening, first-area adoption, subsequent text/navigation areas and final measurements into executable tasks with file ownership, state-contract acceptance and validation. Do not change runtime execution in preparation.

Files: new ADR under `docs/decisions/`, its index, this plan and its index; Development §8 only if needed. Tier: Minimal Risk, `npm run format:check:changed`, `npm run check:docs` and `npm run check:opencode` if workflow documentation changes.

### E2E-8b — Reset hardening and evidence

Make the existing test-owned same-window reset suitable for adopted opt-ins before broadening eligibility. Introduce an adopted selector with explicit fresh-control and visible-run fallbacks, keeping the global default fresh. Review worker transitions between shared and fresh cases, failures before/after loading, disposal before data deletion, renderer/IPC errors and bounded worker shutdown. Reset all worker metadata after process loss so a clean relaunch cannot reuse stale URL/bounds state. Preserve every existing launch and seed oracle, IPC drain and clipboard/error observation. Do not adopt another source spec in this task.

Files: `e2e/fixtures.ts`, `e2e/electron-entry.cjs`, `e2e/ipc-test-control.d.ts` if needed, new `e2e/shared-application.spec.ts`, `e2e/AGENTS.md`, Development §8, this plan. Real Electron regressions must verify successful reset, rejected/failed reset, owned-process exit before deletion, clean subsequent launch, mixed fresh/shared ownership and final worker teardown. Add test-owned controls or extracted fixture helpers only where needed; no production channel or handler replacement in adopted tests.

After warm-up, measure repeated edit/reset bursts in the same worker with renderer heap and Electron process memory samples; compare successive bursts and fresh controls, record actual growth and investigate sustained retention before expansion. Confirm live renderer/window counts and pending-operation tracking are bounded. This is measurement evidence, not a new duration or memory budget. Reuse the two existing specs for one/six-worker five-repeat reset stress without changing their default opt-in. Acceptance: no leaks or state mismatches in these runs, proven failure cleanup, unchanged default behavior and retained-state limits documented. Tier: High Risk, `npm run check:full`, required screenshot infrastructure guards, primary visual inspection and independent review. No Product Owner decision remains unless inspection reveals a material expansion beyond ADR 0021.

### E2E-8c — Navigation and Tab structure adoption

Use the hardened adopted same-window selector for hidden navigation and Tab structure runs. Preserve all cases, both editing modes and the poison/reset regression; keep visible/fresh-control runs on isolated applications. Inventory every seed, launch option, clipboard use and state mutation before changing opt-in. Verify each body starts after the expected document/focus/history/native-state oracle. Do not add eligibility to other files.

Files: `e2e/navigation.spec.ts`, `e2e/tab-structure.spec.ts`, fixture selector only if necessary, Development §8, this plan. Acceptance: both specs pass five repeats at one and six workers, sequentially; matched fresh controls use identical tests/build/worker counts. Record actual launches versus resets, common-case summed/wall times and failure counts; inspect the existing indented-selection screenshot. Tier: High Risk, complete validation and independent review; repeat screenshot infrastructure guards if launch/rendering inputs changed. Update current supported commands in Development §8.

### E2E-8d — Vim text-editing area

Inventory every body/launch in `e2e/vim-text-editing.spec.ts` against ADR 0021 before opting in. Adopt only hidden top-level/collapsed seeds with supported options and no clocks, initialization scripts, relaunches or retained instrumentation. Keep incompatible cases explicitly fresh; the current file includes nested locations, so whole-file opt-in is prohibited. Group eligibility without losing assertions or changing editing-mode coverage. If group/title changes affect conformance references, update them in the same task.

Files: `e2e/vim-text-editing.spec.ts`, `e2e/fixtures.ts` only for a required group selector, `docs/VIM_CONFORMANCE.md` if references change, Development §8, this plan. Acceptance: committed body-level eligibility inventory in the task findings; five-repeat one/six-worker runs and matched fresh controls; Visual/Replace/register and clipboard state poisoning across successive eligible cases; mixed fresh/shared transitions; existing relevant screenshots inspected. Tier: High Risk, `npm run check:full`, applicable screenshot guards and independent review. Extending the top-level/collapsed oracle is outside this task; exclusions are acceptable and must be explicit.

### E2E-8e — Vim navigation and selection area

Inventory `e2e/vim-navigation-and-visual.spec.ts` by body/launch and adopt only cases meeting the same established contract. Keep nested/expanded seeds, unsupported launch options and retained instrumentation fresh. Cover Visual selection, registers, focus/caret restoration and transitions between fresh and shared cases; preserve conformance references when restructuring groups.

Files: `e2e/vim-navigation-and-visual.spec.ts`, `docs/VIM_CONFORMANCE.md` if references change, fixture group selector only if necessary, Development §8, this plan. Acceptance and High Risk validation match E2E-8d, including one/six-worker five repeats, fresh controls, inspected existing screenshots and independent review against the complete eligibility inventory. Do not silently widen the reset contract or select neighboring files.

### E2E-8f — Bounded rollout closure

Run two sequential matched full-suite timing runs for adopted and fresh-control configurations on the same host/worker count, with no overlapping suites or source changes. Preserve every case and editing category. Report whole-suite launches/resets, summed/wall time, observed spread, reset failures and final memory evidence; keep excluded boundary areas explicit. Do not require the prototype's two-file percentage as a suite-wide target.

Files: Development §8 and this plan/index; `scripts/e2e-timing.mjs` only if reset reporting needs a focused extension. Acceptance: complete passing timing pairs, no state-leak or lifecycle failures, all areas and exclusions documented. Tier: High Risk if reporting code changes, otherwise documentation checks plus the full real-E2E measurements. Resolve all authorized rollout tasks before marking the parent done. D2 remains declined and D4 deferred; do not implement them during closure. Move durable current commands/isolation/evidence limits to Development and ADR 0021, then remove the completed initiative/index when no authorized task remains.

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

### E2E-3 prototype measurements (2026-10-11)

The Product Owner authorized E2E-3 followed by E2E-4 in this session. The retained experiment is off by default and only `navigation.spec.ts` and `tab-structure.spec.ts` opt in through `TREE_E2E_SHARED_RESET=reload` or `window`. Both files actually use both editing modes; their existing coverage is preserved. No production bundle, IPC channel, product requirement or default isolation model changes.

Both mechanisms first navigate the owned window to a blank document through the main process, await Playwright's navigation acknowledgment, drain test-entry-tracked production IPC operations, and remove the worker profile's data directory. This discards renderer state, timers, undo/redo, registers, location, view and preference files before the next test seeds its state. The next launch restores native appearance, pinning and bounds, then loads the production renderer into the same window or destroys/recreates the window through production activation. Existing readiness, visibility, shortcut, scale, scrollbar and save-error guards remain. Each prototype launch checks the expected document, collapsed top-level view, selected editor focus, startup editing mode, empty undo/redo, unpinned state, default bounds and automatic appearance. A deliberately poisoned-state test leaves edits, zoom, Visual mode, pinning, different bounds and dark appearance for the next case to reset. Clipboard locking and release remain per test; the global clipboard is not cleared outside its ownership lock.

The first six-worker reload trial failed 67/225 cases: the main-process navigation promise could resolve before Playwright received the page's navigation events. Waiting for the expected URL in Playwright on both reset directions fixed the reproduced race. Blank-renderer worker shutdown also needed destruction before the normal quit handshake, since a blank renderer cannot acknowledge it. Final measurements below exclude preliminary runs.

All runs used HEAD `6d79ee8`, local macOS GUI session, hidden windows, sequential invocations, and five repeats of both selected specs. Final hardened prototype inputs are identified by snapshot `sha256:a98eed461ea338be6d8acc6ad8b7c5fbb26d0ed020679bb7d7907616033e2540`; the reload/six run preceded only an equivalent formatting change. Fresh controls used the earlier opt-in implementation with its sharing option off; the later hardening changes only the opt-in branch and its conditional probe. Each command rebuilt `out/`. Fresh controls passed 220/220; final prototype runs passed 225/225 including five poison cases, with no flaky or skipped cases. The common-case totals exclude poison cases; wall time includes them, so wall comparisons conservatively include the extra reset stress.

| Workers / mechanism | Wall time | Common summed time (220 cases) | Common mean | Median launch or reset |
| --- | --- | --- | --- | --- |
| 1 / fresh process | 84.59 s | 82.531 s | 375 ms | 274 ms launch |
| 1 / same window | 28.83 s | 22.508 s | 102 ms | 61 ms reset |
| 1 / new window | 52.23 s | 45.835 s | 208 ms | 162 ms reset |
| 6 / fresh process | 40.53 s | 203.573 s | 925 ms | 719 ms launch |
| 6 / same window | 12.56 s | 50.784 s | 231 ms | 119 ms reset |
| 6 / new window | 20.71 s | 92.822 s | 422 ms | 308 ms reset |

Same-window reuse saved 273 ms per common case at one worker and 694 ms at six (72.7% and 75.1% of summed time). Window recreation saved 167 ms and 503 ms (44.5% and 54.4%). At six workers, wall time fell 69.0% with same-window reuse and 48.9% with recreation. These are matched observations for two editing files, not a causal whole-suite prediction or stable variance estimate. Prototype runs launched five actual applications at one worker and ten at six; the remaining `launchTree` calls are separately annotated resets, not launches. Median reset timing includes native restoration, renderer loading and initial-state assertions; per-test teardown is also included in test totals.

Commands: `TREE_E2E_SHARED_RESET=<reload|window> PLAYWRIGHT_JSON_OUTPUT_NAME=/private/tmp/tree-e2e3-<mechanism>-<one|six>.json npm run test:e2e -- e2e/navigation.spec.ts e2e/tab-structure.spec.ts --repeat-each=5 --workers=<1|6> --reporter=dot,json`. Fresh controls omit `TREE_E2E_SHARED_RESET` and use `/private/tmp/tree-e2e3-fresh-<one|six>.json`. Reports are temporary measurement artifacts, summarized here for resumption. The existing `scripts/e2e-timing.mjs` reconciles actual-launch phases; a temporary read-only report extractor computes common-case and reset statistics.

**D1 recommendation:** prefer same-window reuse for a bounded rollout of suitable editing specs after an ADR, while keeping real-boundary/lifecycle tests on fresh processes. The stronger saving does not make this equivalent to process isolation: Chromium session caches, main-process listeners and the file-service generation counter survive resets; resets deliberately discard pending renderer edits rather than verify saving them. The two selected files cover seeded/unseeded documents, mode switching, attachments and clipboard operations, but do not establish long-run memory bounds or coverage of every possible retained native state. Memory growth and suite-wide savings remain unmeasured. Tests with custom launch options, relaunches or persisted recovery must stay excluded; a new opt-in owner must explicitly prove its state-reset contract. Adoption and the scope of rollout remain the Product Owner's decision. No product disk-write, interactive CPU or memory path changed.

Primary review hardened the initial-state oracle to capture the test seed before renderer loading and assert that prior document, attachments and editing-preference files are absent before each test body. The poison case explicitly saves a different synthetic document through production IPC. Probe-only failures showed that first-launch initialization saves the empty document immediately and can add a measured `selectedRowTop`; the corrected oracle compares the expected document, location and expansion rather than treating format migration or runtime viewport measurements as leaks. Preliminary failed or interrupted probe runs are excluded from timing evidence.

Playwright page-clock and custom initialization scripts are browser-context state, which survives both reset mechanisms. The retained probe installs neither. Specs using those scripts, handler replacement, or other retained instrumentation must also keep fresh processes until they prove a supported reset; this is an additional D1 isolation limit.

High Risk validation is complete: `npm run check:full` passed before the opt-in oracle hardening (3,296 unit tests, 746 E2E cases, 60 performance cases, static/governance checks, build and zero audit vulnerabilities). Unchanged unit, production, performance and audit inputs retain that evidence. After hardening, `npm run typecheck:e2e`, `npm run lint`, `npm run format:check:changed`, `npm run check:docs` and the complete `npm run test:e2e -- --reporter=dot` passed. The final E2E console session was lost during context compaction; its completed runner and Playwright `.last-run.json` report `passed` with no failed tests. These affected reruns and unchanged full-command stages compose validation rather than imply a second full-command pass. Screenshot guards passed 20 serial and 48 parallel cases; the prototype's indented selection screenshot was inspected. Independent review found no meaningful issues in reset isolation, IPC draining, failure cleanup, seed oracles or retained-state limits. E2E-3 is complete.

### E2E-4 editing-mode audit (2026-10-11)

Source: all 35 `both` files at commit `4bb0897` (authored by abtv on 2026-10-11), inspected in this session against Development §8. Two configured planners inspected bounded groups of 12 files each; the primary inspected the remaining 11 and integrated the body-level findings. This is a proposal for D2, not a change to execution categories or coverage. Common fixture startup alone is not treated as a reason to duplicate every test.

**Recommendation:** retain 32 files as they are; split the two pure control-style checks below into existing independent coverage, and propose running screenshot-stability once. Preserve every mode-dependent interaction and generated mode-specific matrix. Only three executions can be removed under the recorded conservative policy. Prefer D1 as the larger measured opportunity; broad mode removal would discard protected caret, pointer or editing-command coverage.

The original `701e9e6` baseline retains only aggregate timings, so its 904.9 s cannot support exact per-test savings. Estimates instead use the latest recorded E2E-2 timing pair: HEAD `1449695` plus fixture blob `dd83555afef19abde5735fbf66ffe644af3c0bb8`, hidden macOS, six workers, 746 passing cases per run, 926.01/1171.71 s summed. The available raw reports were checked in this session at `/private/tmp/tree-e2e2-run1.json` and `/private/tmp/tree-e2e2-run2.json`. Savings equal the standard-mode durations of the three proposed removals, retaining Vim as Development §8 prescribes for independent coverage. This preserves timing provenance instead of allocating aggregate seconds to titles. No new timing run or product execution is needed for this documentation audit.

| Proposed change | Body evidence for independence | Run 1 saving | Run 2 saving | Orphan committed baselines |
| --- | --- | --- | --- | --- |
| Split inline-expansion contrast test | Reads only disclosure-control colors and document-surface contrast; no editor interaction, caret, selection or status assertion. | 0.640 s | 1.149 s | None; no screenshot capture. |
| Split node-gutter selected-bullet color/geometry test | Reads marker/control colors and coincident centers on the initially selected row; no caret/selection rendering assertion, editor interaction or screenshot. Keep the separate pointer/focus alignment test in both modes. | 0.739 s | 1.006 s | None; its sibling owns the unchanged alignment baselines. |
| Move screenshot-stability to independent | Seeded `.node-list` images hide the caret, omit the status bar and compare repeated captures within each run; no typing, editor pointer or pre-resolved command. Retain both appearances, all three startup-scale variants, nine captures per appearance and one-pixel sensitivity. | 3.949 s | 5.527 s | None; comparisons use in-memory buffers and temporary attachments, not committed baselines. |
| **Total: three fewer executions (746 → 743)** | Conditional prototype poison remains separate. | **5.328 s** | **7.682 s** | **None** |

The pair mean is 6.505 s summed, approximately 0.62% of the pair mean suite total. The observed range is 0.58–0.66% of the respective suite totals. It is not a wall-time estimate: worker scheduling and the recorded host spread prevent a reliable conversion. No saving is claimed for already-single-mode cases, mode-specific matrices or retained pairs. All other proposal-table rows below have zero saving and no newly orphaned baselines.

| File | Proposal | Difference points supporting retained coverage | Paired titles | Mode-specific titles in helper | Existing single titles |
| --- | --- | --- | ---: | ---: | ---: |
| `agenda-caret.spec.ts` | Keep existing coverage | Caret transfer, stand-in caret/selection pixels, Escape and Cmd+C. | 4 | 0 | 0 |
| `agenda-completion.spec.ts` | Keep existing coverage | Typing and caret placement, Escape, editor pointer, Cmd+A/V/Z and undo grouping. | 8 | 0 | 0 |
| `agenda-editing.spec.ts` | Keep existing coverage | Explicit mode-specific command matrix, editor pointer/caret, typing, Cmd+A/X/V/Z/Enter and session grouping. | 12 | 0 | 0 |
| `agenda-focused-day.spec.ts` | Keep existing coverage | Cmd+./,/E, explicit Vim versus arrow motions, editor focus/caret and full-window status/caret screenshots. | 4 | 0 | 0 |
| `agenda-live.spec.ts` | Keep existing coverage | Editor pointer and caret, Escape/Insert, typing, Cmd+Z and full-window status/caret screenshots. | 2 | 0 | 0 |
| `agenda-moves.spec.ts` | Keep existing coverage | Editor pointer activation and caret restoration, Escape and Cmd+Z; full-window status pixels. | 7 | 0 | 0 |
| `agenda-view.spec.ts` | Keep existing coverage | Mode-specific motions, restored caret, Escape, undo grouping, Cmd+./E/Z and full-window status pixels. | 6 | 0 | 0 |
| `always-on-top.spec.ts` | Keep existing coverage | Explicit mode indicator/status-bar differences and preservation of focused editor/Normal mode. | 3 | 0 | 0 |
| `attachment-validation.spec.ts` | Keep existing coverage | Duplicated image-only presentation tests caret-sensitive layout and subsequent caption typing. | 1 | 0 | 9 |
| `clipboard.spec.ts` | Keep existing coverage | Caret-dependent paste/editing, editor pointer selection, typing and Cmd+A/C/X. | 7 | 0 | 9 |
| `context-menu.spec.ts` | Keep existing coverage | Editor right-click/selection and context-menu Paste; Cmd+A and pointer selection clearing. | 3 | 0 | 4 |
| `date-like-indicator.spec.ts` | Keep existing coverage | Caret-dependent underline rendering, editor pointer, typing, Cmd+A and full-window screenshots. | 3 | 1 | 0 |
| `deletion.spec.ts` | Keep existing coverage | Typing and caret/focus projection through Cmd+Backspace and Cmd+.. | 3 | 0 | 0 |
| `drag-and-drop-hierarchy.spec.ts` | Keep existing coverage | Editor-origin pointer handling, caret/mode resolution, Escape, Cmd+Z and restored focus. Even geometry/invalid-target cases begin on the editor. | 23 | 8 | 1 |
| `drag-and-drop.spec.ts` | Keep existing coverage | Editor pointer/caret and text selection; Escape, startup Normal and focus/caret restoration. | 7 | 0 | 6 |
| `editing.spec.ts` | Keep existing coverage | Typing/caret/splits and pre-resolved Cmd+A/C/X/V or Cmd+./,. | 14 | 0 | 0 |
| `empty-node.spec.ts` | Keep existing coverage | Caret/focus projection on Backspace boundaries; typing, Cmd+. and Cmd+Z. | 5 | 0 | 0 |
| `history.spec.ts` | Keep existing coverage | Typing, caret/split transitions and Cmd+Z/history grouping. | 3 | 0 | 5 |
| `hyperlink.spec.ts` | Keep existing coverage | Rich-editor typing/caret and plain-click handling; focused-editor screenshots. | 7 | 0 | 3 |
| `initial-state.spec.ts` | Keep existing coverage | Explicit first-run preference, mode indicator and focused startup root. | 1 | 0 | 0 |
| `inline-expansion.spec.ts` | Split one I title; retain other modes | Caret restoration on folding/relaunch, editor pointer, Cmd+./,/E/Backspace/Z and caret-bearing screenshots. | 12 | 0 | 12 |
| `navigation.spec.ts` | Keep existing coverage | Editor caret/focus boundary matrix, typing and Cmd+./,. | 12 | 0 | 1 |
| `node-gutter-alignment.spec.ts` | Split one I title; retain other modes | Retained alignment case moves selection through row clicks and captures the focused editor/caret. | 2 | 0 | 1 |
| `persistence.spec.ts` | Keep existing coverage | Duplicated restart case types, uses Cmd+. and verifies selected-editor startup focus. | 1 | 0 | 15 |
| `pointer-cursor.spec.ts` | Keep existing coverage | Explicit mode-indicator presence/absence and pointer presentation over its different status content. | 1 | 0 | 0 |
| `preview.spec.ts` | Keep existing coverage | Opening/closing preview, Escape, editor focus return and Cmd+Enter; retained mode-specific return cases. | 5 | 0 | 8 |
| `screenshot-stability.spec.ts` | Propose independent | No difference point: seeded list only, hidden caret, no status bar or editing interaction. | 1 | 0 | 0 |
| `sticky-location-bar.spec.ts` | Keep existing coverage | Duplicated case explicitly checks status-bar geometry and Vim indicator placement/presence. | 1 | 0 | 1 |
| `strikethrough.spec.ts` | Keep existing coverage | Cmd+Enter/Z, caret/typing retention and focused Normal/standard screenshots. | 4 | 0 | 5 |
| `tab-structure.spec.ts` | Keep existing coverage | Mode-specific Tab/Shift+Tab caret/selection/history matrix; Cmd+. and explicit Vim image-caret/status traversal cases. | 2 | 15 | 0 |
| `tree-date-visualization.spec.ts` | Keep existing coverage | Block versus insertion caret, selected date colors, editor pointer/typing and Cmd+A/Z. | 2 | 0 | 0 |
| `typed-input.spec.ts` | Keep existing coverage | Typing and exact caret assertions, rich-editor conversion and focused-editor screenshot. | 6 | 0 | 0 |
| `typography.spec.ts` | Keep existing coverage | Typed and linked focused-editor glyph screenshots include caret-sensitive rendering. | 2 | 0 | 0 |
| `undo-sessions.spec.ts` | Keep existing coverage | Typing, cursor/focus transitions and Cmd+Z undo grouping; standard-only Escape case. | 3 | 0 | 1 |
| `windowed-list.spec.ts` | Keep existing coverage | Editor focus/typing, Cmd+Z and caret restoration; drag/Escape and full-window status pixels. | 3 | 0 | 7 |

#### Complete test inventory

Every default-run execution in these files is accounted for: 180 paired titles (360 executions), 24 mode-specific titles inside helpers, and 88 existing single titles, totaling 472 executions. The table expands generated title families explicitly and adds the one conditional infrastructure poison test from E2E-3. Product quantities in two titles use `$depthLimit` and `$inlineImageBound` placeholders so their numerical requirements remain owned by Product §2.3 and §17.1; the corresponding source titles are unambiguous in their named spec files. Body inspection covers every entry; timing reports supply title enumeration and durations, not independence judgments. Source changes since the timing snapshot preserve all existing titles; E2E-3 adds only the opt-in poison and option declarations.

* **B:** retain the Vim and standard pair; its body passes through the difference points named in its file row.
* **I:** paired title proposed to run once; exact body rationale and saving are above.
* **M:** retain the existing named mode-specific matrix/conditional case; it has no identical-title pair to remove. Its mode is stated explicitly.
* **S:** already executes once outside the helper; preserve its current execution and claim no removal saving. This label does not certify that its body is independent.
* **P:** opt-in-only prototype poison, already once; preserve it and claim no default-suite saving.

##### agenda-caret.spec.ts

| Exact expanded title | Classification | Body audit |
| --- | --- | --- |
| carries the caret through a day and contextual ancestor into another editor | B | Caret transfer, stand-in caret/selection pixels, Escape and Cmd+C. |
| shows the caret on days, gaps and contextual ancestors but not on unselected rows | B | Caret transfer, stand-in caret/selection pixels, Escape and Cmd+C. |
| leaves no second caret in the editor that selection moved away from | B | Caret transfer, stand-in caret/selection pixels, Escape and Cmd+C. |
| moves, selects and copies over the text of a day without editing | B | Caret transfer, stand-in caret/selection pixels, Escape and Cmd+C. |

##### agenda-completion.spec.ts

| Exact expanded title | Classification | Body audit |
| --- | --- | --- |
| accepts relative dates and named months in Tree | B | Typing and caret placement, Escape, editor pointer, Cmd+A/V/Z and undo grouping. |
| preserves suffixes and ignores uncertain text and paste in Tree | B | Typing and caret placement, Escape, editor pointer, Cmd+A/V/Z and undo grouping. |
| keeps the popup inside the window at the bottom and right edges | B | Typing and caret placement, Escape, editor pointer, Cmd+A/V/Z and undo grouping. |
| accepts, cycles, cancels and undoes completion in Tree | B | Typing and caret placement, Escape, editor pointer, Cmd+A/V/Z and undo grouping. |
| accepts relative dates and named months in Agenda | B | Typing and caret placement, Escape, editor pointer, Cmd+A/V/Z and undo grouping. |
| preserves suffixes and ignores uncertain text and paste in Agenda | B | Typing and caret placement, Escape, editor pointer, Cmd+A/V/Z and undo grouping. |
| does not offer completion inside hyperlink text | B | Typing and caret placement, Escape, editor pointer, Cmd+A/V/Z and undo grouping. |
| accepts, cycles, cancels and undoes completion in Agenda | B | Typing and caret placement, Escape, editor pointer, Cmd+A/V/Z and undo grouping. |

##### agenda-editing.spec.ts

| Exact expanded title | Classification | Body audit |
| --- | --- | --- |
| Command Matrix no-ops preserve each selected non-editable row and direct-match caret | B | Explicit mode-specific command matrix, editor pointer/caret, typing, Cmd+A/X/V/Z/Enter and session grouping. |
| retains hyperlinks on inactive direct matches and opens them with Cmd-click | B | Explicit mode-specific command matrix, editor pointer/caret, typing, Cmd+A/X/V/Z/Enter and session grouping. |
| pastes multiline text and a real image through the shared clipboard boundary | B | Explicit mode-specific command matrix, editor pointer/caret, typing, Cmd+A/X/V/Z/Enter and session grouping. |
| keeps Chromium composition and repeated key input continuous in decorated text | B | Explicit mode-specific command matrix, editor pointer/caret, typing, Cmd+A/X/V/Z/Enter and session grouping. |
| edits emphasized text and preserves the editor and caret when its active day changes | B | Explicit mode-specific command matrix, editor pointer/caret, typing, Cmd+A/X/V/Z/Enter and session grouping. |
| blocks structural commands and contextual editing while retaining direct text editing | B | Explicit mode-specific command matrix, editor pointer/caret, typing, Cmd+A/X/V/Z/Enter and session grouping. |
| uses ordinary Cut and Paste and history, and persists edits across restart | B | Explicit mode-specific command matrix, editor pointer/caret, typing, Cmd+A/X/V/Z/Enter and session grouping. |
| creates a dated last root from a day container in Insert and persists it | B | Explicit mode-specific command matrix, editor pointer/caret, typing, Cmd+A/X/V/Z/Enter and session grouping. |
| creates for the preceding day from a gap, one Undo removes it, and gaps ignore creation keys | B | Explicit mode-specific command matrix, editor pointer/caret, typing, Cmd+A/X/V/Z/Enter and session grouping. |
| splits a dated node at the caret with the displayed date and one Undo restores it | B | Explicit mode-specific command matrix, editor pointer/caret, typing, Cmd+A/X/V/Z/Enter and session grouping. |
| places the caret after the inherited date and ignores Enter on a contextual ancestor | B | Explicit mode-specific command matrix, editor pointer/caret, typing, Cmd+A/X/V/Z/Enter and session grouping. |
| deletes an empty childless match but preserves an empty match with children | B | Explicit mode-specific command matrix, editor pointer/caret, typing, Cmd+A/X/V/Z/Enter and session grouping. |

##### agenda-focused-day.spec.ts

| Exact expanded title | Classification | Body audit |
| --- | --- | --- |
| keeps a selected heading outside the virtualized window at its original position | B | Cmd+./,/E, explicit Vim versus arrow motions, editor focus/caret and full-window status/caret screenshots. |
| bounds navigation and restores timeline selection, scroll and folds | B | Cmd+./,/E, explicit Vim versus arrow motions, editor focus/caret and full-window status/caret screenshots. |
| follows a live date edit and creates from the focused heading | B | Cmd+./,/E, explicit Vim versus arrow motions, editor focus/caret and full-window status/caret screenshots. |
| places its heading at the current-parent position in both appearances | B | Cmd+./,/E, explicit Vim versus arrow motions, editor focus/caret and full-window status/caret screenshots. |

##### agenda-live.spec.ts

| Exact expanded title | Classification | Body audit |
| --- | --- | --- |
| mirrors edits without taking focus or scrolling, and the active occurrence follows a removed date | B | Editor pointer and caret, Escape/Insert, typing, Cmd+Z and full-window status/caret screenshots. |
| keeps an item whose last date was removed until selection leaves it, and Undo restores it | B | Editor pointer and caret, Escape/Insert, typing, Cmd+Z and full-window status/caret screenshots. |

##### agenda-moves.spec.ts

| Exact expanded title | Classification | Body audit |
| --- | --- | --- |
| drags an inactive occurrence onto another day, changing only that date, and Undo restores it | B | Editor pointer activation and caret restoration, Escape and Cmd+Z; full-window status pixels. |
| drops on a node row of the target day and removes a duplicate date, activating that occurrence | B | Editor pointer activation and caret restoration, Escape and Cmd+Z; full-window status pixels. |
| drags the focused editor and restores its focus and caret after the drop | B | Editor pointer activation and caret restoration, Escape and Cmd+Z; full-window status pixels. |
| restores the same caret after a drop as after a cancelled drag from the same point | B | Editor pointer activation and caret restoration, Escape and Cmd+Z; full-window status pixels. |
| does not drag contextual ancestors, and drops on a gap or the same day change nothing | B | Editor pointer activation and caret restoration, Escape and Cmd+Z; full-window status pixels. |
| cancels a drag with Escape | B | Editor pointer activation and caret restoration, Escape and Cmd+Z; full-window status pixels. |
| shows the drop outline on the target day header in light and dark appearances | B | Editor pointer activation and caret restoration, Escape and Cmd+Z; full-window status pixels. |

##### agenda-view.spec.ts

| Exact expanded title | Classification | Body audit |
| --- | --- | --- |
| windows occurrences while keeping distant selection focused through scrolling, resizing and folding | B | Mode-specific motions, restored caret, Escape, undo grouping, Cmd+./E/Z and full-window status pixels. |
| folds occurrences and reveals gaps through pointer and keyboard without changing Tree folds | B | Mode-specific motions, restored caret, Escape, undo grouping, Cmd+./E/Z and full-window status pixels. |
| finishes an editing session before opening and preserves its single Undo step | B | Mode-specific motions, restored caret, Escape, undo grouping, Cmd+./E/Z and full-window status pixels. |
| opens at Today and restores the origin cursor without persisting Agenda | B | Mode-specific motions, restored caret, Escape, undo grouping, Cmd+./E/Z and full-window status pixels. |
| projects full hierarchy, emphasizes dates, compresses empty days, and navigates to scoped Tree | B | Mode-specific motions, restored caret, Escape, undo grouping, Cmd+./E/Z and full-window status pixels. |
| arrows and Vim counts navigate rows while edit commands leave the document intact | B | Mode-specific motions, restored caret, Escape, undo grouping, Cmd+./E/Z and full-window status pixels. |

##### always-on-top.spec.ts

| Exact expanded title | Classification | Body audit |
| --- | --- | --- |
| toggles the native window flag and restores it after restart | B | Explicit mode indicator/status-bar differences and preservation of focused editor/Normal mode. |
| keeps the editor focused when the pin is clicked | B | Explicit mode indicator/status-bar differences and preservation of focused editor/Normal mode. |
| switches Always on Top from the Window menu and keeps the menu and status bar in step | B | Explicit mode indicator/status-bar differences and preservation of focused editor/Normal mode. |

##### attachment-validation.spec.ts

| Exact expanded title | Classification | Body audit |
| --- | --- | --- |
| rejects invalid attachment bytes at the preload boundary without writing a file | S | None: direct preload attachment validation and file-absence assertions. |
| rejects an oversized PNG at the preload boundary before writing a file | S | None: direct preload attachment validation and file-absence assertions. |
| pastes a real image, decodes it in the browser, and restores it after restart | S | Caret-dependent paste, editor typing or image-caret/preview return. |
| opens a document whose stored attachment file is missing | S | Caret-dependent paste, editor typing or image-caret/preview return. |
| reports a read failure without disabling the editor | S | Caret-dependent paste, editor typing or image-caret/preview return. |
| reports corrupt stored bytes after restart and preserves preview keyboard behavior | S | Caret-dependent paste, editor typing or image-caret/preview return. |
| shows an image-only node without a blank text row and keeps it editable | B | Duplicated image-only presentation tests caret-sensitive layout and subsequent caption typing. |
| keeps an image-only text cursor reachable from a blank row click in Normal mode | S | Caret-dependent paste, editor typing or image-caret/preview return. |
| moves the Normal-mode caret onto an image with l and opens it with Enter | S | Caret-dependent paste, editor typing or image-caret/preview return. |
| focuses the editor, shows the insertion line, and accepts typing | S | Caret-dependent paste, editor typing or image-caret/preview return. |

##### clipboard.spec.ts

| Exact expanded title | Classification | Body audit |
| --- | --- | --- |
| pastes plain text at the cursor | B | Caret-dependent paste/editing, editor pointer selection, typing and Cmd+A/C/X. |
| pastes plain text when the HTML clipboard representation is oversized | S | Caret-dependent clipboard insertion or editor input; no duplicate currently exists. |
| pastes an HTTP URL as a clickable hyperlink | S | Caret-dependent clipboard insertion or editor input; no duplicate currently exists. |
| keeps adjacent pasted URLs as separate links | S | Caret-dependent clipboard insertion or editor input; no duplicate currently exists. |
| creates links for valid URLs in multiline paste | S | Caret-dependent clipboard insertion or editor input; no duplicate currently exists. |
| cuts a hyperlink and pastes it into another node with its link preserved | B | Caret-dependent paste/editing, editor pointer selection, typing and Cmd+A/C/X. |
| copies a hyperlink and pastes it into another node with its link preserved | B | Caret-dependent paste/editing, editor pointer selection, typing and Cmd+A/C/X. |
| keeps the editor writable after a hyperlink is pasted | B | Caret-dependent paste/editing, editor pointer selection, typing and Cmd+A/C/X. |
| selects linked characters with the mouse | B | Caret-dependent paste/editing, editor pointer selection, typing and Cmd+A/C/X. |
| removes one linked character with Backspace at its end | B | Caret-dependent paste/editing, editor pointer selection, typing and Cmd+A/C/X. |
| keeps the caret within a hyperlink while editing before following text | B | Caret-dependent paste/editing, editor pointer selection, typing and Cmd+A/C/X. |
| pastes multiline text as separate nodes | S | Caret-dependent clipboard insertion or editor input; no duplicate currently exists. |
| pastes an image as an attachment | S | Caret-dependent clipboard insertion or editor input; no duplicate currently exists. |
| prefers the image representation over text | S | Caret-dependent clipboard insertion or editor input; no duplicate currently exists. |
| pasting an image onto a node that already has one creates a sibling | S | Caret-dependent clipboard insertion or editor input; no duplicate currently exists. |
| cancels a cut when the node changes during the clipboard write | S | Pre-resolved Cmd+X, selection and concurrent typing. |

##### context-menu.spec.ts

| Exact expanded title | Classification | Body audit |
| --- | --- | --- |
| routes Copy and Paste through the editor store path | B | Editor right-click/selection and context-menu Paste; Cmd+A and pointer selection clearing. |
| does not extend a text selection when the next node is right-clicked | B | Editor right-click/selection and context-menu Paste; Cmd+A and pointer selection clearing. |
| clears document selection when the disclosure circle is right-clicked | B | Editor right-click/selection and context-menu Paste; Cmd+A and pointer selection clearing. |
| keeps the prior dot change after menu Select All interrupts Insert | S | Vim Insert/dot-repeat interruption by native menu commands. |
| keeps the prior dot change after menu Cut interrupts Insert | S | Vim Insert/dot-repeat interruption by native menu commands. |
| keeps the prior dot change after menu Paste interrupts Insert | S | Vim Insert/dot-repeat interruption by native menu commands. |
| bounds long selections in the native Look Up menu label | S | Typing, Cmd+A and editor right-click selection. |

##### date-like-indicator.spec.ts

| Exact expanded title | Classification | Body audit |
| --- | --- | --- |
| flags the current parent heading like a child row | B | Caret-dependent underline rendering, editor pointer, typing, Cmd+A and full-window screenshots. |
| treats the Normal block caret as the caret before its character | M (Vim) | Explicit mode-specific caret/selection or command matrix; preserve the named mode. |
| flags impossible dates only away from the caret in Tree | B | Caret-dependent underline rendering, editor pointer, typing, Cmd+A and full-window screenshots. |
| flags impossible dates only away from the caret in Agenda | B | Caret-dependent underline rendering, editor pointer, typing, Cmd+A and full-window screenshots. |

##### deletion.spec.ts

| Exact expanded title | Classification | Body audit |
| --- | --- | --- |
| deleting a middle sibling selects the next sibling | B | Typing and caret/focus projection through Cmd+Backspace and Cmd+.. |
| deleting the only root creates a new empty root | B | Typing and caret/focus projection through Cmd+Backspace and Cmd+.. |
| does not delete the current parent when its heading is focused | B | Typing and caret/focus projection through Cmd+Backspace and Cmd+.. |

##### drag-and-drop-hierarchy.spec.ts

| Exact expanded title | Classification | Body audit |
| --- | --- | --- |
| moves an image-only subtree from a unfocused row onto a breadcrumb | B | Editor-origin pointer handling, caret/mode resolution, Escape, Cmd+Z and restored focus. Even geometry/invalid-target cases begin on the editor. |
| moves an image-only subtree from a focused row onto a breadcrumb | B | Editor-origin pointer handling, caret/mode resolution, Escape, Cmd+Z and restored focus. Even geometry/invalid-target cases begin on the editor. |
| finds the moved node after unrelated navigation, including Vim undo keys | B | Editor-origin pointer handling, caret/mode resolution, Escape, Cmd+Z and restored focus. Even geometry/invalid-target cases begin on the editor. |
| appends to ancestor and undo navigates to the hidden node | B | Editor-origin pointer handling, caret/mode resolution, Escape, Cmd+Z and restored focus. Even geometry/invalid-target cases begin on the editor. |
| appends to ancestor and undo keeps the visible level | B | Editor-origin pointer handling, caret/mode resolution, Escape, Cmd+Z and restored focus. Even geometry/invalid-target cases begin on the editor. |
| appends to root and undo navigates to the hidden node | B | Editor-origin pointer handling, caret/mode resolution, Escape, Cmd+Z and restored focus. Even geometry/invalid-target cases begin on the editor. |
| appends to root and undo keeps the visible level | B | Editor-origin pointer handling, caret/mode resolution, Escape, Cmd+Z and restored focus. Even geometry/invalid-target cases begin on the editor. |
| rejects the current parent and toolbar whitespace, and clears cancelled breadcrumb highlights | B | Editor-origin pointer handling, caret/mode resolution, Escape, Cmd+Z and restored focus. Even geometry/invalid-target cases begin on the editor. |
| highlights the full ancestor hit region in both appearances without shifting layout | B | Editor-origin pointer handling, caret/mode resolution, Escape, Cmd+Z and restored focus. Even geometry/invalid-target cases begin on the editor. |
| resolves normal mode and its caret after a breadcrumb drop | M (Vim) | Explicit mode-specific caret/selection or command matrix; preserve the named mode. |
| resolves insert mode and its caret after a breadcrumb drop | B | Editor-origin pointer handling, caret/mode resolution, Escape, Cmd+Z and restored focus. Even geometry/invalid-target cases begin on the editor. |
| resolves replace mode and its caret after a breadcrumb drop | M (Vim) | Explicit mode-specific caret/selection or command matrix; preserve the named mode. |
| resolves visual mode and its caret after a breadcrumb drop | M (Vim) | Explicit mode-specific caret/selection or command matrix; preserve the named mode. |
| resolves visual-node mode and its caret after a breadcrumb drop | M (Vim) | Explicit mode-specific caret/selection or command matrix; preserve the named mode. |
| keeps the caret and resolves normal editing when dropping onto a row | M (Vim) | Explicit mode-specific caret/selection or command matrix; preserve the named mode. |
| keeps the caret and resolves insert editing when dropping onto a row | B | Editor-origin pointer handling, caret/mode resolution, Escape, Cmd+Z and restored focus. Even geometry/invalid-target cases begin on the editor. |
| keeps the caret and resolves replace editing when dropping onto a row | M (Vim) | Explicit mode-specific caret/selection or command matrix; preserve the named mode. |
| keeps the caret and resolves visual editing when dropping onto a row | M (Vim) | Explicit mode-specific caret/selection or command matrix; preserve the named mode. |
| keeps the caret and resolves visual-node editing when dropping onto a row | M (Vim) | Explicit mode-specific caret/selection or command matrix; preserve the named mode. |
| selects a source dragged from its unfocused gutter and starts its caret | B | Editor-origin pointer handling, caret/mode resolution, Escape, Cmd+Z and restored focus. Even geometry/invalid-target cases begin on the editor. |
| appends onto a collapsed node, opens its fold, and supports undo and redo | B | Editor-origin pointer handling, caret/mode resolution, Escape, Cmd+Z and restored focus. Even geometry/invalid-target cases begin on the editor. |
| appends onto an expanded node, opens its fold, and supports undo and redo | B | Editor-origin pointer handling, caret/mode resolution, Escape, Cmd+Z and restored focus. Even geometry/invalid-target cases begin on the editor. |
| outlines only the receiving row in both appearances and keeps the edge band as a gap | B | Editor-origin pointer handling, caret/mode resolution, Escape, Cmd+Z and restored focus. Even geometry/invalid-target cases begin on the editor. |
| prohibits the source and its descendant row middles and cancels an accepting row with Escape | B | Editor-origin pointer handling, caret/mode resolution, Escape, Cmd+Z and restored focus. Even geometry/invalid-target cases begin on the editor. |
| offers an over-depth row target and reports the operation error without moving | B | Editor-origin pointer handling, caret/mode resolution, Escape, Cmd+Z and restored focus. Even geometry/invalid-target cases begin on the editor. |
| nests at the selected gap level, supports undo and redo, and survives restart | B | Editor-origin pointer handling, caret/mode resolution, Escape, Cmd+Z and restored focus. Even geometry/invalid-target cases begin on the editor. |
| outdents a visible child to the root at the selected gap level | B | Editor-origin pointer handling, caret/mode resolution, Escape, Cmd+Z and restored focus. Even geometry/invalid-target cases begin on the editor. |
| moves a distant root node into the expanded branch after its hidden sibling block | B | Editor-origin pointer handling, caret/mode resolution, Escape, Cmd+Z and restored focus. Even geometry/invalid-target cases begin on the editor. |
| shows a prohibiting cursor over a gap inside the dragged subtree and changes nothing | B | Editor-origin pointer handling, caret/mode resolution, Escape, Cmd+Z and restored focus. Even geometry/invalid-target cases begin on the editor. |
| Escape cancels a gap move without changing hierarchy | B | Editor-origin pointer handling, caret/mode resolution, Escape, Cmd+Z and restored focus. Even geometry/invalid-target cases begin on the editor. |
| preserves whole-node Visual mode for a same-parent reorder | B | Editor-origin pointer handling, caret/mode resolution, Escape, Cmd+Z and restored focus. Even geometry/invalid-target cases begin on the editor. |
| reports an over-depth gap drop and preserves the document | S | Editor-origin pointer drag; depth-limit rejection. |

##### drag-and-drop.spec.ts

| Exact expanded title | Classification | Body audit |
| --- | --- | --- |
| places the caret on a quick click without reordering | B | Editor pointer/caret and text selection; Escape, startup Normal and focus/caret restoration. |
| reorders a focused sibling after holding the pointer and moving across a target | B | Editor pointer/caret and text selection; Escape, startup Normal and focus/caret restoration. |
| keeps the caret and mode when a drag is cancelled | B | Editor pointer/caret and text selection; Escape, startup Normal and focus/caret restoration. |
| keeps the mode and restores the caret when a drag starts on an unfocused row | B | Editor pointer/caret and text selection; Escape, startup Normal and focus/caret restoration. |
| cancels an active drag with Escape without moving | B | Editor pointer/caret and text selection; Escape, startup Normal and focus/caret restoration. |
| keeps a pressed drag as a text selection instead of starting a node drag | B | Editor pointer/caret and text selection; Escape, startup Normal and focus/caret restoration. |
| keeps the selection collapsed while dragging a node across the text | B | Editor pointer/caret and text selection; Escape, startup Normal and focus/caret restoration. |
| does not start a drag when the pointer moves before the hold threshold | S | Editor pointer/selection, Escape or explicit Normal-mode preservation. |
| keeps dragging when the pointer moves within the hold tolerance | S | Editor pointer/selection, Escape or explicit Normal-mode preservation. |
| releases in place without reordering | S | Editor pointer/selection, Escape or explicit Normal-mode preservation. |
| keeps a pending hold through a browser hover reset | S | Editor pointer/selection, Escape or explicit Normal-mode preservation. |
| keeps Normal mode after clicking or moving a node with the mouse | S | Editor pointer/selection, Escape or explicit Normal-mode preservation. |
| renders a multi-character text selection with the shared highlight pair in both appearances | S | Standard-only selected-text pixels. |

##### editing.spec.ts

| Exact expanded title | Classification | Body audit |
| --- | --- | --- |
| Cmd+A selects all text in a link-free node | B | Typing/caret/splits and pre-resolved Cmd+A/C/X/V or Cmd+./,. |
| Cmd+A and Cmd+C copy all text from a link-free node | B | Typing/caret/splits and pre-resolved Cmd+A/C/X/V or Cmd+./,. |
| Cmd+A and Cmd+C copy all text without the browser copy command | B | Typing/caret/splits and pre-resolved Cmd+A/C/X/V or Cmd+./,. |
| Cmd+A and Cmd+X cut all text without the browser cut command | B | Typing/caret/splits and pre-resolved Cmd+A/C/X/V or Cmd+./,. |
| keeps plain text selected after Cmd+C | B | Typing/caret/splits and pre-resolved Cmd+A/C/X/V or Cmd+./,. |
| Cmd+V pastes clipboard text without the browser paste command | B | Typing/caret/splits and pre-resolved Cmd+A/C/X/V or Cmd+./,. |
| pastes copied plain text with Cmd+V after typing in the target node | B | Typing/caret/splits and pre-resolved Cmd+A/C/X/V or Cmd+./,. |
| pastes copied plain text after typing a space in the copied node | B | Typing/caret/splits and pre-resolved Cmd+A/C/X/V or Cmd+./,. |
| Enter at the end creates an empty sibling after the node | B | Typing/caret/splits and pre-resolved Cmd+A/C/X/V or Cmd+./,. |
| pressing Enter twice creates successive siblings after the current node | B | Typing/caret/splits and pre-resolved Cmd+A/C/X/V or Cmd+./,. |
| Enter at the end of a linked node focuses the new sibling | B | Typing/caret/splits and pre-resolved Cmd+A/C/X/V or Cmd+./,. |
| Enter at the beginning creates an empty sibling before the node | B | Typing/caret/splits and pre-resolved Cmd+A/C/X/V or Cmd+./,. |
| Enter at the beginning preserves the selected node subtree | B | Typing/caret/splits and pre-resolved Cmd+A/C/X/V or Cmd+./,. |
| Enter in the middle splits the text at the cursor | B | Typing/caret/splits and pre-resolved Cmd+A/C/X/V or Cmd+./,. |

##### empty-node.spec.ts

| Exact expanded title | Classification | Body audit |
| --- | --- | --- |
| deletes an empty node and focuses the previous sibling at the end | B | Caret/focus projection on Backspace boundaries; typing, Cmd+. and Cmd+Z. |
| focuses the current parent when the empty first child is deleted | B | Caret/focus projection on Backspace boundaries; typing, Cmd+. and Cmd+Z. |
| keeps the only root when Backspace is pressed | B | Caret/focus projection on Backspace boundaries; typing, Cmd+. and Cmd+Z. |
| selects the next root when the empty first root is deleted | B | Caret/focus projection on Backspace boundaries; typing, Cmd+. and Cmd+Z. |
| undoes a Backspace deletion | B | Caret/focus projection on Backspace boundaries; typing, Cmd+. and Cmd+Z. |

##### history.spec.ts

| Exact expanded title | Classification | Body audit |
| --- | --- | --- |
| undoes and redoes a text edit | B | Typing, caret/split transitions and Cmd+Z/history grouping. |
| undoes a structural node creation | B | Typing, caret/split transitions and Cmd+Z/history grouping. |
| undoes and redoes a split | B | Typing, caret/split transitions and Cmd+Z/history grouping. |
| keeps node IDs stable across undo and redo | S | Typing/caret, editor drag/paste or pre-resolved Cmd+Z/Backspace. |
| undoes and redoes node and subtree deletion with stable IDs | S | Typing/caret, editor drag/paste or pre-resolved Cmd+Z/Backspace. |
| undoes and redoes sibling reordering | S | Typing/caret, editor drag/paste or pre-resolved Cmd+Z/Backspace. |
| undoes and redoes text and multiline paste | S | Typing/caret, editor drag/paste or pre-resolved Cmd+Z/Backspace. |
| undoes and redoes image paste and image-bearing deletion | S | Typing/caret, editor drag/paste or pre-resolved Cmd+Z/Backspace. |

##### hyperlink.spec.ts

| Exact expanded title | Classification | Body audit |
| --- | --- | --- |
| edits linked characters with immediate styling and destination updates | B | Rich-editor typing/caret and plain-click handling; focused-editor screenshots. |
| restores a corrected link beside plain text without linking its neighbors | B | Rich-editor typing/caret and plain-click handling; focused-editor screenshots. |
| turns a typed URL into a link while typing and follows later edits | B | Rich-editor typing/caret and plain-click handling; focused-editor screenshots. |
| keeps the link of a URL typed in front of an existing word once a space follows | B | Rich-editor typing/caret and plain-click handling; focused-editor screenshots. |
| keeps typing in the next node after a URL is typed and Enter creates a sibling | B | Rich-editor typing/caret and plain-click handling; focused-editor screenshots. |
| keeps every character when a URL typed at speed becomes a link | B | Rich-editor typing/caret and plain-click handling; focused-editor screenshots. |
| edits on plain click and opens on Cmd+click through the main process | B | Rich-editor typing/caret and plain-click handling; focused-editor screenshots. |
| drops a link when pasted text makes its covered text invalid | S | Caret-dependent paste through linked text. |
| recomputes the destination when pasted text keeps the covered text a valid URL | S | Caret-dependent paste through linked text. |
| opens the hyperlink under the Normal-mode caret with Enter | S | Vim Normal text-caret command Enter. |

##### initial-state.spec.ts

| Exact expanded title | Classification | Body audit |
| --- | --- | --- |
| first launch creates one empty focused root that is persisted | B | Explicit first-run preference, mode indicator and focused startup root. |

##### inline-expansion.spec.ts

| Exact expanded title | Classification | Body audit |
| --- | --- | --- |
| expands and collapses a node’s children inline without entering it or moving the caret | B | Caret restoration on folding/relaunch, editor pointer, Cmd+./,/E/Backspace/Z and caret-bearing screenshots. |
| moves through expanded rows on ArrowDown, including entering a branch | B | Caret restoration on folding/relaunch, editor pointer, Cmd+./,/E/Backspace/Z and caret-bearing screenshots. |
| selects the collapsing node with the caret at the start when collapse hides the caret | B | Caret restoration on folding/relaunch, editor pointer, Cmd+./,/E/Backspace/Z and caret-bearing screenshots. |
| toggles the selected node fold with Cmd+E without moving the caret and keeps typing | B | Caret restoration on folding/relaunch, editor pointer, Cmd+./,/E/Backspace/Z and caret-bearing screenshots. |
| leaves the caret unchanged when collapsing a branch that does not contain it | B | Caret restoration on folding/relaunch, editor pointer, Cmd+./,/E/Backspace/Z and caret-bearing screenshots. |
| keeps each node’s expansion when entering and leaving a node | B | Caret restoration on folding/relaunch, editor pointer, Cmd+./,/E/Backspace/Z and caret-bearing screenshots. |
| keeps the location when deleting and undoing a visible descendant | B | Caret restoration on folding/relaunch, editor pointer, Cmd+./,/E/Backspace/Z and caret-bearing screenshots. |
| restores expansion and the selected descendant after relaunch with no other change | B | Caret restoration on folding/relaunch, editor pointer, Cmd+./,/E/Backspace/Z and caret-bearing screenshots. |
| opens an older document collapsed, moving a hidden selection to its displayed ancestor | B | Caret restoration on folding/relaunch, editor pointer, Cmd+./,/E/Backspace/Z and caret-bearing screenshots. |
| crosses an expanded branch boundary with ArrowLeft and ArrowRight | B | Caret restoration on folding/relaunch, editor pointer, Cmd+./,/E/Backspace/Z and caret-bearing screenshots. |
| matches the collapsed, expanded, nested, and focused disclosure appearance | B | Caret restoration on folding/relaunch, editor pointer, Cmd+./,/E/Backspace/Z and caret-bearing screenshots. |
| keeps the outer ring and disclosure triangle distinguishable from the light document surface | I | No mode difference; exact independence rationale in the proposal above. |
| restores nested expansion choices when re-expanding | S | None: disclosure controls and visible-node texts only. |
| keeps expansion when navigating via the location breadcrumb | S | Editor pointer and Cmd+. before breadcrumb return. |
| restores the remembered expansion of a location entered before relaunch | S | Editor pointer, Cmd+. and startup selected-editor focus restoration. |
| windows on the flattened visible row count once inline descendants push past the threshold | S | None: programmatic disclosure clicks and virtualization counts. |
| moves through expanded rows on j and k, including entering and leaving branches | S | Vim-only tree/fold/Visual/clipboard command and caret semantics. |
| folds inline expansion with the Vim fold keys, moving the caret to the displayed ancestor it hides | S | Vim-only tree/fold/Visual/clipboard command and caret semantics. |
| opens an empty first child with o on a collapsed node that has children, keeping the location | S | Vim-only tree/fold/Visual/clipboard command and caret semantics. |
| keeps the location when deleting with dd and undoing with u a visible descendant | S | Vim-only tree/fold/Visual/clipboard command and caret semantics. |
| keeps gg on the first displayed root while G reaches the last visible row | S | Vim-only tree/fold/Visual/clipboard command and caret semantics. |
| ends whole-node Visual mode when an ancestor collapses and hides its anchor and focus | S | Vim-only tree/fold/Visual/clipboard command and caret semantics. |
| keeps whole-node Visual, dd, and yy scoped to actual siblings across an expanded branch | S | Vim-only tree/fold/Visual/clipboard command and caret semantics. |
| colors node text by depth in the dark appearance only | S | None: disclosure controls and computed depth text colors. |

##### navigation.spec.ts

| Exact expanded title | Classification | Body audit |
| --- | --- | --- |
| arrow keys move selection between siblings | B | Editor caret/focus boundary matrix, typing and Cmd+./,. |
| moves the first root caret to the beginning on ArrowUp | B | Editor caret/focus boundary matrix, typing and Cmd+./,. |
| moves the last root caret to the end on ArrowDown | B | Editor caret/focus boundary matrix, typing and Cmd+./,. |
| moves the last linked root caret to the end on ArrowDown | B | Editor caret/focus boundary matrix, typing and Cmd+./,. |
| moves a childless linked parent caret to the end on ArrowDown | B | Editor caret/focus boundary matrix, typing and Cmd+./,. |
| moves from the first child up to the current parent | B | Editor caret/focus boundary matrix, typing and Cmd+./,. |
| focuses a linked first child with a visible caret after moving down from the parent | B | Editor caret/focus boundary matrix, typing and Cmd+./,. |
| moves left and right across sibling and parent boundaries | B | Editor caret/focus boundary matrix, typing and Cmd+./,. |
| entering a childless node keeps the cursor in the current parent and Enter creates a first child | B | Editor caret/focus boundary matrix, typing and Cmd+./,. |
| leaving a node restores the parent level and selects the node that was entered | B | Editor caret/focus boundary matrix, typing and Cmd+./,. |
| the location path navigates to ancestors and the root | B | Editor caret/focus boundary matrix, typing and Cmd+./,. |
| clicks the circular indicator to enter a node with children and a childless node | B | Editor caret/focus boundary matrix, typing and Cmd+./,. |
| gd enters the selected node like Cmd+. | S | Vim-only gd navigation command. |
| shared prototype poisons state before the following navigation case | P (Vim/native reset stress) | Vim Visual and native-state poisoning for opt-in reset validation. |

##### node-gutter-alignment.spec.ts

| Exact expanded title | Classification | Body audit |
| --- | --- | --- |
| centers the bullet and disclosure triangle on the first line of node text | B | Retained alignment case moves selection through row clicks and captures the focused editor/caret. |
| draws the selected-node bullet in the text color on top of the muted bullet | I | No mode difference; exact independence rationale in the proposal above. |
| keeps the gutter of an image-only row at the single-line text position | S | Vim-only Normal image caret and its different collapsed empty-editor geometry. |

##### persistence.spec.ts

| Exact expanded title | Classification | Body audit |
| --- | --- | --- |
| rejects a child below level $depthLimit without changing the editor or persisted bytes | S | Editor typing, pointer, caret/startup restoration or clipboard/edit-command path. |
| shows the document error and leaves an over-depth file byte-for-byte unchanged | S | None: document load-error reporting and byte preservation. |
| rejects unsafe persisted attachment ids and link destinations before writing | S | None: direct save IPC validation and file-absence assertions. |
| does not surface a save error during rapid edits | S | Editor typing, pointer, caret/startup restoration or clipboard/edit-command path. |
| restores where the selected row sat in the window after two relaunches in a short list | S | Editor typing, pointer, caret/startup restoration or clipboard/edit-command path. |
| restores where the selected row sat in the window after two relaunches in a windowed list | S | Editor typing, pointer, caret/startup restoration or clipboard/edit-command path. |
| restores where the selected row sat in the window after two relaunches in a windowed list of wrapped rows | S | Editor typing, pointer, caret/startup restoration or clipboard/edit-command path. |
| shows the selected row at the window edge when scrolling had moved it off-screen | S | Editor typing, pointer, caret/startup restoration or clipboard/edit-command path. |
| restores the main window size and position after restart | S | None: native bounds resize and restoration. |
| restores an image attachment after restart | S | Editor typing, pointer, caret/startup restoration or clipboard/edit-command path. |
| restores a pasted hyperlink after restart | S | Editor typing, pointer, caret/startup restoration or clipboard/edit-command path. |
| retains an attachment referenced only by a generation across restart | S | Editor typing, pointer, caret/startup restoration or clipboard/edit-command path. |
| recovers a generation document including its image after the primary is damaged | S | Editor typing, pointer, caret/startup restoration or clipboard/edit-command path. |
| enters a level-20 leaf through its indicator and still rejects creating a child | S | Editor typing, pointer, caret/startup restoration or clipboard/edit-command path. |
| rejects an over-depth paste without changing the persisted bytes or showing a save error | S | Vim-only yy/paste at a depth boundary. |
| restores the document, current parent, and selected node after restart | B | Duplicated restart case types, uses Cmd+. and verifies selected-editor startup focus. |

##### pointer-cursor.spec.ts

| Exact expanded title | Classification | Body audit |
| --- | --- | --- |
| shows the default arrow rather than the text-editing cursor over text the user cannot edit | B | Explicit mode-indicator presence/absence and pointer presentation over its different status content. |

##### preview.spec.ts

| Exact expanded title | Classification | Body audit |
| --- | --- | --- |
| scales a large inline image down to fit $inlineImageBound while preserving aspect ratio | S | Caret-dependent clipboard paste into the inline editor; inline image sizing assertion. |
| does not enlarge a small inline image | S | Caret-dependent clipboard paste into the inline editor; inline image sizing assertion. |
| opens the preview by clicking the image and closes it with the button | B | Opening/closing preview, Escape, editor focus return and Cmd+Enter; retained mode-specific return cases. |
| closes the preview on Escape | B | Opening/closing preview, Escape, editor focus return and Cmd+Enter; retained mode-specific return cases. |
| closes the preview on a mouse click in the window | B | Opening/closing preview, Escape, editor focus return and Cmd+Enter; retained mode-specific return cases. |
| opens the preview with Cmd+Y, while Cmd+Enter strikes the node through instead | B | Opening/closing preview, Escape, editor focus return and Cmd+Enter; retained mode-specific return cases. |
| shows the same focus ring on the close button however the preview was opened | B | Opening/closing preview, Escape, editor focus return and Cmd+Enter; retained mode-specific return cases. |
| keeps keyboard focus inside the preview | S | Image preview opening/focus handling (including geometry-only preview assertions). |
| does not upscale a small image in the preview | S | Image preview opening/focus handling (including geometry-only preview assertions). |
| returns Normal-mode keys to the editor after a mouse click closes the preview | S | Vim Normal keyboard focus return after preview closure. |
| returns focus and the caret to the editor after closing with button | S | Standard-only caret/focus return and continued typing after preview closure. |
| returns focus and the caret to the editor after closing with Escape | S | Standard-only caret/focus return and continued typing after preview closure. |
| returns focus and the caret to the editor after closing with click | S | Standard-only caret/focus return and continued typing after preview closure. |

##### screenshot-stability.spec.ts

| Exact expanded title | Classification | Body audit |
| --- | --- | --- |
| keeps repeated screenshots identical across startup display scales | I | No mode difference; exact independence rationale in the proposal above. |

##### sticky-location-bar.spec.ts

| Exact expanded title | Classification | Body audit |
| --- | --- | --- |
| stays at the top while only the content below it scrolls and owns the scrollbar | S | None: toolbar/viewport/scrollbar geometry outside the editor. |
| keeps the status bar below the scrolling content | B | Duplicated case explicitly checks status-bar geometry and Vim indicator placement/presence. |

##### strikethrough.spec.ts

| Exact expanded title | Classification | Body audit |
| --- | --- | --- |
| toggles the selected node with Cmd+Enter, keeps the caret and typing, and keeps it after relaunch | B | Cmd+Enter/Z, caret/typing retention and focused Normal/standard screenshots. |
| undoes and redoes a Cmd+Enter toggle as one change | B | Cmd+Enter/Z, caret/typing retention and focused Normal/standard screenshots. |
| strikes the editable current-parent heading and leaves its children normal | B | Cmd+Enter/Z, caret/typing retention and focused Normal/standard screenshots. |
| draws the line through muted text in the light and dark appearance | B | Cmd+Enter/Z, caret/typing retention and focused Normal/standard screenshots. |
| toggles in Normal mode and keeps Normal mode | S | Vim-only Normal/Replace/Visual caret, selection and history resolution. |
| draws a struck row inside the whole-node Visual highlight with the highlight colors | S | Vim-only Normal/Replace/Visual caret, selection and history resolution. |
| keeps a Normal-mode select-all highlighted across a toggle | S | Vim-only Normal/Replace/Visual caret, selection and history resolution. |
| commits a pending Replace edit before toggling and returns to Normal mode | S | Vim-only Normal/Replace/Visual caret, selection and history resolution. |
| toggles the whole-node Visual range and the current node in character Visual mode | S | Vim-only Normal/Replace/Visual caret, selection and history resolution. |

##### tab-structure.spec.ts

| Exact expanded title | Classification | Body audit |
| --- | --- | --- |
| indents and outdents the focused normal node while preserving its mode | M (Vim) | Explicit mode-specific caret/selection or command matrix; preserve the named mode. |
| indents and outdents the focused insert node while preserving its mode | M (Vim) | Explicit mode-specific caret/selection or command matrix; preserve the named mode. |
| indents and outdents the focused replace node while preserving its mode | M (Vim) | Explicit mode-specific caret/selection or command matrix; preserve the named mode. |
| indents and outdents the focused visual node while preserving its mode | M (Vim) | Explicit mode-specific caret/selection or command matrix; preserve the named mode. |
| indents and outdents the focused visual-node node while preserving its mode | M (Vim) | Explicit mode-specific caret/selection or command matrix; preserve the named mode. |
| consumes impossible root Tab and Shift+Tab moves while retaining the focused editor | B | Mode-specific Tab/Shift+Tab caret/selection/history matrix; Cmd+. and explicit Vim image-caret/status traversal cases. |
| keeps a direct child inside the zoomed current parent with Shift+Tab in normal | M (Vim) | Explicit mode-specific caret/selection or command matrix; preserve the named mode. |
| keeps a direct child inside the zoomed current parent with Shift+Tab in insert | M (Vim) | Explicit mode-specific caret/selection or command matrix; preserve the named mode. |
| keeps a direct child inside the zoomed current parent with Shift+Tab in replace | M (Vim) | Explicit mode-specific caret/selection or command matrix; preserve the named mode. |
| keeps a direct child inside the zoomed current parent with Shift+Tab in visual | M (Vim) | Explicit mode-specific caret/selection or command matrix; preserve the named mode. |
| keeps a direct child inside the zoomed current parent with Shift+Tab in visual-node | M (Vim) | Explicit mode-specific caret/selection or command matrix; preserve the named mode. |
| outdents a deeper descendant while keeping the zoomed current parent | B | Mode-specific Tab/Shift+Tab caret/selection/history matrix; Cmd+. and explicit Vim image-caret/status traversal cases. |
| keeps an image caret on a direct child when Shift+Tab is blocked by the zoom boundary | M (Vim) | Explicit mode-specific caret/selection or command matrix; preserve the named mode. |
| keeps native Tab traversal from status-bar focus outside the editor | M (Vim) | Explicit mode-specific caret/selection or command matrix; preserve the named mode. |
| moves an active image caret with Tab and restores its saved text position | M (Vim) | Explicit mode-specific caret/selection or command matrix; preserve the named mode. |
| indents and outdents the focused standard node while preserving its mode | M (standard) | Explicit mode-specific caret/selection or command matrix; preserve the named mode. |
| keeps a direct child inside the zoomed current parent with Shift+Tab in standard | M (standard) | Explicit mode-specific caret/selection or command matrix; preserve the named mode. |

##### tree-date-visualization.spec.ts

| Exact expanded title | Classification | Body audit |
| --- | --- | --- |
| styles heading and row dates like Agenda and preserves selection colors | B | Block versus insertion caret, selected date colors, editor pointer/typing and Cmd+A/Z. |
| updates date styling while typing and keeps focus through undo and date removal | B | Block versus insertion caret, selected date colors, editor pointer/typing and Cmd+A/Z. |

##### typed-input.spec.ts

| Exact expanded title | Classification | Body audit |
| --- | --- | --- |
| types a URL with a path, query, and fragment between words exactly as typed | B | Typing and exact caret assertions, rich-editor conversion and focused-editor screenshot. |
| types operator-like punctuation exactly as typed | B | Typing and exact caret assertions, rich-editor conversion and focused-editor screenshot. |
| types brackets, quotes, and symbols exactly as typed | B | Typing and exact caret assertions, rich-editor conversion and focused-editor screenshot. |
| types repeated slashes and dots exactly as typed | B | Typing and exact caret assertions, rich-editor conversion and focused-editor screenshot. |
| types a URL typed in front of an existing word and then a space exactly as typed | B | Typing and exact caret assertions, rich-editor conversion and focused-editor screenshot. |
| types two URLs and trailing text exactly as typed | B | Typing and exact caret assertions, rich-editor conversion and focused-editor screenshot. |

##### typography.spec.ts

| Exact expanded title | Classification | Body audit |
| --- | --- | --- |
| typed URL characters render as typed, without font ligatures | B | Typed and linked focused-editor glyph screenshots include caret-sensitive rendering. |
| linked text renders without font ligatures | B | Typed and linked focused-editor glyph screenshots include caret-sensitive rendering. |

##### undo-sessions.spec.ts

| Exact expanded title | Classification | Body audit |
| --- | --- | --- |
| starts a new undo entry after five seconds without a text change | B | Typing, cursor/focus transitions and Cmd+Z undo grouping; standard-only Escape case. |
| ends the edit session on cursor movement, paste, and structural commands | B | Typing, cursor/focus transitions and Cmd+Z undo grouping; standard-only Escape case. |
| ends the edit session when focus switches to another node | B | Typing, cursor/focus transitions and Cmd+Z undo grouping; standard-only Escape case. |
| leaves the text, caret, selection, and undo grouping unchanged | S | Standard-only Escape and preservation of caret, selection and undo grouping. |

##### windowed-list.spec.ts

| Exact expanded title | Classification | Body audit |
| --- | --- | --- |
| keeps an unfocused drag source mounted while the viewport scrolls away | B | Editor focus/typing, Cmd+Z and caret restoration; drag/Escape and full-window status pixels. |
| keyboard navigation reaches and types into an off-screen row | B | Editor focus/typing, Cmd+Z and caret restoration; drag/Escape and full-window status pixels. |
| undo and redo while scrolled restore the edited row | B | Editor focus/typing, Cmd+Z and caret restoration; drag/Escape and full-window status pixels. |
| dragging near the window edge auto-scrolls to an off-screen position | S | Editor-origin drag/pointer, Escape or editor typing/caret/focus after resize/loading. |
| dragging near the window edge auto-scrolls a list below the windowing threshold | S | Editor-origin drag/pointer, Escape or editor typing/caret/focus after resize/loading. |
| dragging over the location toolbar does not auto-scroll the list | S | Editor-origin drag/pointer, Escape or editor typing/caret/focus after resize/loading. |
| dragging at the window edge does not scroll a list that fits the window | S | Editor-origin drag/pointer, Escape or editor typing/caret/focus after resize/loading. |
| resizing the window re-wraps rows and keeps navigation and focus correct | S | Editor-origin drag/pointer, Escape or editor typing/caret/focus after resize/loading. |
| editing a row to wrapped text grows the row and the list height | S | Editor-origin drag/pointer, Escape or editor typing/caret/focus after resize/loading. |
| loading an attachment image grows its row and shifts later rows | S | Editor-origin drag/pointer, Escape or editor typing/caret/focus after resize/loading. |

#### Coverage observations and next decision

Several existing single-mode blocks called “mode-independent” contain points protected by the current conservative policy: persistence startup/caret recovery, history Cmd+Z, context-menu editor right-click/Cmd+A, clipboard typing/caret/edit commands, drag editor pointer/Escape, windowed-list editor input/focus, attachment preview/input, hyperlink caret/paste and inline-expansion Cmd+./caret restoration. Their exact titles remain S above; several other S entries are intentionally Vim-only or standard-only. These are coverage observations, not removal candidates or authorization to expand tests. The three proposed reductions do not fix or worsen those pre-existing gaps. A subsequent coverage decision should distinguish genuinely single-rule boundary tests from missing mode counterparts rather than trust block names.

D2 must approve any subset of the three I entries before E2E-5 changes specs or categories. If screenshot-stability is approved, preserve its serial/parallel infrastructure guards and update any mode-count wording in Development §9 to describe the retained guard accurately. No change to product requirements, renderer code, persistence, launch isolation or performance budgets is proposed. E2E-4 is complete; its Minimal Risk documentation checks passed. No specs or screenshot baselines changed in this task.

### E2E-6 implementation and validation (2026-10-11)

Added `npm run test:e2e:changed` (build then Playwright `--only-changed=HEAD`), scoped OpenCode allowances and checker expectations, and local-selection guidance in AGENTS §10 and Development §9. The complete CI workflow and High Risk complete-local requirement remain unchanged. Installed Playwright inspection confirmed the selector includes staged/unstaged tracked and nonignored untracked files, follows imported test dependencies, and may succeed with zero cases. Production code through Electron and non-imported snapshots/resources still require explicit affected-spec coverage. These limits and the post-commit starting-reference option are documented.

Low Risk validation passed on HEAD `dc4c01f` plus these changes: `npm run check` (all static/governance checks, 3,296 unit cases, serial unit-performance guard and build), `npm run check:opencode` (292 expectations), final documentation and changed-format checks. Snapshot before the command smoke was `sha256:7b60704e2f712bbc4dc3cc5f660a1a2b9cf632c61fcaa198dcf16b3e1626f057`; subsequent edits only update initiative documentation. `npm run test:e2e:changed -- --list` selected zero cases, correctly recorded as no E2E coverage. `npm run test:e2e:changed -- e2e/navigation.spec.ts --only-changed=6d79ee8 --workers=1 --reporter=dot` passed all 25 selected cases in real Electron (10.0 s, macOS GUI, one worker, no concurrent Playwright invocation), proving the earlier-reference override and focused execution. Primary diff review found no issue. No runtime, test categories, baseline images or product behavior changed. The former D2 proposal remains historical evidence and was declined; no estimated duplicate-removal saving is implemented.

### E2E-8b reset/recovery and memory evidence (2026-10-11)

The fixture exposes a reviewed-owner selector for hidden reload, explicit fresh controls and visible fresh execution without changing the global fresh default or adopting another editing spec. Process loss, disposal and transitions to fresh execution invalidate the application, renderer URL and bounds together. Reset/loading and error collection have deadlines; retained child-process ownership proves exit before file removal even after Playwright disconnects. Move/resize observation drains the native debounce after bounds move away and back. Setup failures, original production IPC rejection, drain rejection/stall, renderer load/readiness errors, clean recovery, mixed ownership and worker disposal have real-Electron regressions. Production handlers, seed/focus/mode/history/native-state oracles, error observation, clipboard release, scale and scrollbar guards remain.

Repeated-cycle evidence used the same host/build and sequential runs. The final matched-state comparison sampled both modes after identical two-row edits, with twelve bursts of eight cycles and the first as warm-up. Retained renderer heap stayed near the fresh control, every sample had one window/renderer/Tab process and zero pending/error IPC, and listener counts stayed fixed. An extended 384-cycle exploratory run investigated native growth: main heap and Browser working set demonstrated reclamation, while renderer/GPU working sets remained above fresh controls. No per-load document/queue/listener retention owner was found in read-only production inspection. These are finite-run measurements and retained native-cache limits, not proof of an indefinite memory bound or a new budget. Detailed local evidence is in `/private/tmp/tree-e2e8b-evidence.txt` and JSON reports under `/private/tmp/tree-e2e8b*.json`; durable execution and isolation limits are in Development §8 and ADR 0021.

Final one/six-worker prototype stress passed 225 cases each (28.1 s / 12.2 s). Serial/parallel screenshot guards plus typed punctuation passed 20 / 48 cases; actual synthetic Tab indentation/selection and zoom-boundary PNGs were inspected, with no text/selection defect and no baseline changes. High Risk static/unit/build stages and all 764 E2E cases passed. The initial performance stage had three existing Agenda timing failures; its focused six-case repeat and complete 60-case repeat passed unchanged inputs/budgets. Audit found zero vulnerabilities. The original complete-command failure remains recorded; passing stages were reused under Development §9 rather than rerunning unrelated suites. No production file, product behavior, editing category or source-spec default changed.

Final hidden infrastructure coverage passed 18 cases; visible and explicit fresh-control coverage passed three each. The last hidden probes left a blank shared process for actual worker teardown; its recorded process and profile were absent after runner exit. Shared fault/memory probes are deliberately declared only for hidden execution, so the complete visible suite retains fresh launches. The independent completed-diff review traced the lifecycle/state/error/clipboard paths and found no meaningful issues. E2E-8b is complete. E2E-8c remains unimplemented; D2 is declined and D4 deferred.

### E2E-8c eligibility inventory (2026-10-11)

All bodies launch once. Navigation has no pre-seeded document; its twelve ordinary cases remain in both editing modes. Options are defaults except the Vim-only `gd` case's supported `vimPreference: true`. Clipboard operations use fixture-owned locked helpers. Hidden cases adopt reload; visible and explicit fresh controls stay fresh. The poison is transient native/renderer mutation, not retained instrumentation, and remains immediately before its navigation successor in file order. Fresh controls now include it too, so comparison case sets are identical.

| Exact navigation title | State mutations / clipboard | Hidden eligibility |
| --- | --- | --- |
| shared prototype poisons state before the following navigation case | Creates parent/child, changes location, pins/resizes window, sets native theme dark, enters Visual mode, production save of different state | Adopted; existing reset regression |
| arrow keys move selection between siblings | Types A/B, creates sibling, moves focus | Adopted |
| moves the first root caret to the beginning on ArrowUp | Types Root; changes caret | Adopted |
| moves the last root caret to the end on ArrowDown | Types First/Last, creates sibling, changes caret | Adopted |
| moves the last linked root caret to the end on ArrowDown | Locked clipboard writes/pastes URL; rich-text caret | Adopted |
| moves a childless linked parent caret to the end on ArrowDown | Locked clipboard writes/pastes URL; parent entry/caret | Adopted |
| moves from the first child up to the current parent | Types Projects/Work, creates child, changes location/focus/caret | Adopted |
| focuses a linked first child with a visible caret after moving down from the parent | Parent/child creation, locked clipboard long URL paste, rich-text focus/caret | Adopted |
| moves left and right across sibling and parent boundaries | Creates Projects/Work/Personal; focus/caret across boundaries | Adopted |
| entering a childless node keeps the cursor in the current parent and Enter creates a first child | Enters Projects, creates/types Work child, focus/location | Adopted |
| leaving a node restores the parent level and selects the node that was entered | Creates Projects/Work; entry/exit and selection | Adopted |
| the location path navigates to ancestors and the root | Projects/Work/Task hierarchy; ancestor/root breadcrumb clicks | Adopted |
| clicks the circular indicator to enter a node with children and a childless node | Parent/Child creation; entry indicators, location/focus/style reads | Adopted |
| gd enters the selected node like Cmd+. | Types Parent, Normal mode, `gd`, location/focus | Adopted; explicit Vim preference |

Tab bodies use supported `initialMode: 'normal'`, except native status-bar traversal (default options). None uses the clipboard. Attachments are seeded under reset-owned data; selection changes retain no instrumentation. No body installs clocks/init scripts/handlers, relaunches or retains instrumentation.

| Exact Tab title/family | Seed and state mutations | Hidden eligibility |
| --- | --- | --- |
| indents and outdents the focused `${state}` node while preserving its mode | Collapsed Alpha/Bravo/Charlie roots, Bravo selected; selection, five Vim states/standard, indent/outdent, typing/undo | Adopted; six cases |
| consumes impossible root Tab and Shift+Tab moves while retaining the focused editor | Collapsed Alpha/Bravo roots, Alpha selected; blocked commands/focus/mode | Adopted; both modes |
| keeps a direct child inside the zoomed current parent with Shift+Tab in `${state}` | Alpha with Bravo/Charlie children; zoom, selection/mode, blocked outdent, typing/undo | Fresh; six nested-seed cases |
| outdents a deeper descendant while keeping the zoomed current parent | Alpha with Bravo/Bravo child and Charlie; zoom/expansion/focus/outdent | Fresh; both modes |
| keeps an image caret on a direct child when Shift+Tab is blocked by the zoom boundary | Alpha with attached Bravo and Charlie; zoom/image caret/blocked outdent | Fresh; nested seed, Vim |
| keeps native Tab traversal from status-bar focus outside the editor | Blank; status focus/Tab/Shift+Tab | Adopted; Vim |
| moves an active image caret with Tab and restores its saved text position | Collapsed Alpha/attached Bravo roots; text/image caret, indent/outdent/restoration | Adopted; Vim |

The explicit fresh group contains exactly nine nested cases. Ten Tab and 26 navigation cases use the adopted selector. No product behavior, fixture implementation, editing category or baseline changed.

### E2E-8c implementation and validation (2026-10-11)

Implemented adoption and fresh exclusions without production/fixture changes. Four sequential matched runs on the same macOS host/build/source, five repeats each and 225 identical cases, all passed without failures/flakes/skips/errors:

| Execution | Workers | Launches | Resets | Summed test time | Wall time |
| --- | --- | --- | --- | --- | --- |
| Adopted reload | 1 | 55 | 170 | 40.978 s | 43.118 s |
| Fresh control | 1 | 225 | 0 | 85.862 s | 87.943 s |
| Adopted reload | 6 | 60 | 165 | 95.236 s | 20.196 s |
| Fresh control | 6 | 225 | 0 | 214.053 s | 42.513 s |

Observed two-spec wall reduction is 51.0%/52.5% at one/six workers; these single pairs do not establish whole-suite savings or variance. Temporary commands/reports/snapshot evidence is retained under `.scratch/e2e-8c/`. Visible fallback passed 45 cases. Actual synthetic indented-selection image embedded in the adopted-one JSON was inspected against Alpha/Bravo/Charlie with selected indented Bravo; no baseline changes. Independent review found no meaningful implementation/evidence issues.

The initial `npm run check:full` passed static/governance checks, 3,308 unit cases, unit-performance guard, build and all 765 E2E cases, then failed one of 60 performance cases. Deep-sparse Agenda typing p95 was 50.5 ms against strict <50 ms. Two unchanged complete `npm run test:perf` repeats each passed 59 cases and failed one: wide-dense date-edit p95 54.9 ms, then deep-sparse typing p95 50.9 ms. These attempts remain recorded as failures; no cause is claimed. The performance suite uses its own fresh visible launches and no changed-spec/selector causal path was found in read-only inspection.

The Product Owner then explicitly authorized the 75 ms Agenda edit-p95 limit and commit. Only that guard changed; motion p95, maximum latency and all other assertions remain. The subsequent complete `npm run test:perf` passed all 60 cases. Affected E2E/performance type checking, focused lint and final formatting/documentation checks passed; audit found zero vulnerabilities. Under Development §9, the required High Risk tier is satisfied by the initial successful unchanged stages plus the complete passing supplemental performance/audit stages; the aggregate attempt itself is not relabeled as passing. Independent review of the budget change found no meaningful issues. E2E-8c is complete; no production behavior, editing category or screenshot baseline changed.

### E2E-8d body-level eligibility inventory (2026-10-11)

All original bodies launch once with supported `initialMode: 'normal'`; no clocks,
initialization scripts, relaunches or replaced handlers occur. Collapsed root
seeds may contain descendants, links and attachments. Renderer paste/cut
prevention listeners are discarded on reload. The two nested initial locations
and two Playwright media-emulation bodies remain fresh. The other 50 of 54
existing cases adopt hidden reload through unnamed groups, preserving all titles,
assertions, registration order, conformance references and Vim-only coverage.
Visible and explicit fresh controls remain fresh for every body.

| Exact existing title / parameter family | State mutations and clipboard | Hidden execution |
| --- | --- | --- |
| uses word, quote, and bracket text objects in Normal mode | Text objects, deletion/change, Insert | Shared |
| switches modes and applies Normal-mode motions and edits | Insert/Normal, motion, deletion | Shared |
| undoes with u and redoes with Ctrl+r in Normal mode | Text history, undo/redo | Shared |
| keeps the caret on the change that u and Ctrl+r apply | Text history, caret, undo/redo | Shared |
| returns to the level of the change when u applies it elsewhere | Initial location alpha, ancestor navigation, undo | Fresh: nested seed |
| blocks an unhandled Ctrl-modified key from reaching native text editing in Normal mode | Insert/Normal, native command suppression | Shared |
| drops an unfinished command before u and Ctrl+r instead of undoing or redoing | Counts, pending operator, undo/redo | Shared |
| undoes two separate Vim character replacements without an empty history step | Replacement, history | Shared |
| A enters Insert mode at the end of the node | Append, Insert, caret | Shared |
| I enters Insert mode at the first non-whitespace character | Insert, caret | Shared |
| puts the local register after the current character with p | Visual yank/put, locked clipboard | Shared |
| uses counted text operators while preserving the node and its subtree | Collapsed subtree, counted deletion, enter child | Shared |
| changes words, finds characters, and repeats the completed change | Find/change/Insert, repeat register | Shared |
| replaces, substitutes, and changes through the end of node text | Character replace, substitute/change, deletion | Shared |
| repeats inserted text and honors a count before dot | Insert, delete/repeat registers | Shared |
| repeats a deletion-only Insert edit at the same relative caret | Insert deletion, repeat, caret | Shared |
| repeats a completed Insert session in another node | Root peers, Insert, focus, repeat | Shared |
| repeats a completed change and substitute in another node | Root peers, change/substitute, repeat | Shared |
| does not repeat an Insert session interrupted by pointer focus | Root peers, pending Insert, pointer focus | Shared |
| changes whole-node text, deletes backward, and repeats counted text puts | Collapsed subtree, enter/leave, Visual yank, locked clipboard | Shared |
| uses WORD, ge, and repeated character-find motions | WORD/find motions, find register | Shared |
| replaces text in Replace mode and repeats the completed session | Replace, repeat, caret | Shared |
| continues Replace after double-click word selection (plain/rich, pending false/true) | Four cases; Replace, pointer selection, undo, rich screenshot | Shared |
| continues Replace after double-clicking another node's word (plain/rich) | Two cases; root peers, Replace, pointer focus/selection, undo | Shared |
| leaves an image caret on replacement text after Escape | Attachment, image/text caret, Replace | Shared |
| continues Replace at the clicked caret of the same node and undoes each click-separated edit | Replace, pointer caret, undo | Shared |
| continues Replace in another node after committing the pending replacement | Root peers, Replace, pointer focus | Shared |
| continues Replace in another node when nothing was typed yet | Root peers, empty Replace, pointer focus | Shared |
| ends Replace when a press in another node drags a text selection | Root peers, Replace, pointer drag | Shared |
| clears the image caret when a pending Replace session commits on blur | Attachment, peers, image caret, blur; leaves Replace active | Shared |
| activates the image caret when a same-node pointer click commits a Replace session | Attachment, Replace, image caret, light/dark screenshots | Fresh: retained media emulation |
| undoes a pending Replace-mode edit and focuses the restored text | Attachment, peers, Replace, undo, light/dark screenshots | Fresh: retained media emulation |
| ends a pending Replace session on Cmd+Shift+Z with a valid Normal caret | Attachment, Replace, redo, image/text caret | Shared |
| commits a pending Replace session before entering the node with its enter control | Collapsed subtree, Replace, navigation | Shared |
| commits a pending Replace session before Cmd+Backspace deletes the node | Root peers, Replace, structural deletion, undo | Shared |
| commits a pending Replace session before Cmd+V pastes at the typed end | Replace, locked clipboard, discarded paste listener | Shared |
| commits a pending Replace session before the native paste fallback | Replace, locked clipboard, native paste | Shared |
| commits a pending Replace session before Cmd+A selects all | Replace, text selection | Shared |
| commits a pending Replace session before Cmd+A and Cmd+X cut the visible selection | Replace, selection, discarded cut listener, locked clipboard | Shared |
| repeats a deletion made inside an Insert session | Insert deletion, repeat | Shared |
| does not record an Insert session interrupted by Enter as repeatable | Insert, structural split, repeat | Shared |
| does not record a plain Insert session as repeatable after entering the node with its enter control | Collapsed subtree, Insert, navigation, repeat | Shared |
| does not record a plain Insert session as repeatable after a breadcrumb navigates to an ancestor | Initial location root, Insert, ancestor navigation | Fresh: nested seed |
| adds, changes, and deletes surrounding pairs in Normal mode | Surround commands, locked clipboard | Shared |
| surrounds the whole node with yss and repeats a surround with dot | Surround, repeat, undo, locked clipboard | Shared |
| surrounds a Visual selection with S | Visual selection, surround | Shared |
| changes case with gu, gU, g~, and Visual ~ around a hyperlink | Collapsed subtree, rich link, case, Visual, undo | Shared |
| puts with gp and gP and leaves the caret on the character after the inserted text | Local register, put/delete, undo, caret | Shared |
| selects the node after a gp subtree put, or the last copy when none follows | Collapsed subtree, root peers, structural put/undo, locked clipboard | Shared |
| yanks to the end of the node with Y without disturbing the repeatable change | Local yank/put, repeat, undo | Shared |

Four new ordered poison/successor cases cover Visual and pending Replace state,
register/repeat disposal and locked clipboard rewriting; successors check clean
Normal focus/caret/history and no mutation after each put/repeat command. Existing
order also crosses shared/fresh/shared at each fresh exclusion. No fixture or
production reset contract is extended.

The initial five-repeat one-worker adopted run passed 285 cases and failed the
same undo-light screenshot in all five repeats. Inspected actual pixels were
dark because the preceding Playwright media override survived reload. Both
media-emulation cases were then excluded; screenshot expectations are unchanged.
The failed attempt remains in `.scratch/e2e-8d/adopted-one.json`.

### E2E-8d matched controls (2026-10-11)

Four sequential runs on HEAD `8835c1a` plus the adopted text spec, identical
production/fixture/build inputs, same macOS GUI host and no overlapping suites.
Each used `npm run test:e2e:diagnose`, the text-editing spec, five repeats and
`--reporter=dot,json`, with fresh/reload selection and one/six-worker limits.
All four passed 290 identical cases with zero failures, flakes, skips or errors.
Reports are retained under `.scratch/e2e-8d/`.

| Execution | Worker limit | Launches | Resets | Summed time | Wall time |
| --- | --- | --- | --- | --- | --- |
| Adopted reload | 1 | 40 | 250 | 40.130 s | 42.650 s |
| Fresh control | 1 | 290 | 0 | 106.632 s | 108.944 s |
| Adopted reload | 6 | 40 | 250 | 93.623 s | 20.025 s |
| Fresh control | 6 | 290 | 0 | 287.230 s | 59.969 s |

Playwright scheduled five workers under the six-worker limit because this file
has five repeat groups; each group preserves poison/successor order. Observed
wall reductions are 60.9% and 66.6%; these single matched pairs do not establish
whole-suite savings or run-to-run variance.

### E2E-8d validation and review (2026-10-11)

Visible fresh fallback passed all 58 cases. Existing actual Replace word-selection,
click image-caret light/dark and undo image-caret light/dark screenshots were
inspected after six focused cases passed; no baseline or conformance-reference
changes. Capture-only attachments were removed before final validation. Serial
and parallel screenshot infrastructure guards passed ten and 24 cases.

The complete `npm run check:full` passed static/governance checks, 3,308 unit cases,
the unit-performance guard, build and all 769 E2E cases (4.2 min). Performance
passed 59 of 60 cases, failing unchanged Vim date-completion maximum popup paint
at 147.2 ms against strict <100 ms; p95 was 32.0 ms and insertion max 4.3 ms.
Five unchanged repeats of both date-completion modes passed ten cases with maxima
31.5–32.4 ms. The complete supplemental `npm run test:perf` then passed all 60
cases (2.0 min), and audit found zero vulnerabilities. No cause is claimed and
no performance guard changed. Under Development §9, valid initial stages plus
passing complete performance/audit supplements satisfy High Risk validation;
the original failed aggregate attempt is not relabeled. Detailed temporary
commands, runtime blobs and artifacts are retained in `.scratch/e2e-8d/evidence.md`.

Independent review traced eligibility, assertion/title preservation, clipboard,
poison/successor and mixed ownership paths and found no meaningful issues.
E2E-8d is complete, with no unresolved validation failure or product decision.
No production or fixture code, editing category or screenshot baseline changed.

## Next Task

E2E-8e: inventory every body/launch of `e2e/vim-navigation-and-visual.spec.ts` under ADR 0021, adopt only supported hidden top-level/collapsed cases and keep nested/expanded seeds and retained instrumentation explicitly fresh. Preserve conformance references, all assertions and editing-mode coverage. Complete matched one/six-worker five-repeat controls, state-poisoning/mixed transitions, screenshot inspection, High Risk validation and independent review as specified in the task above. No other source spec is eligible by proximity.

Start a new session for E2E-8e after E2E-8d's media-emulation discovery and performance validation follow-up. Playwright media emulation survives renderer reload and remains excluded; do not infer renderer ownership from a page API alone. D2 remains declined and D4 deferred; do not change editing-mode composition or introduce budgets.

## Resume Prompt

```text
Continue the E2E suite time initiative (plans/e2e-suite-time.md): take E2E-8e, inventory and adopt eligible Vim navigation/selection cases under ADR 0021. E2E-8d is complete. D1 approved, D2 declined, D3 implemented, D4 deferred. Preserve assertions, editing modes and fresh-process exclusions, including retained Playwright media emulation; do not broaden the reset contract.
```
