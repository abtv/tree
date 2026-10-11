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
| E2E-1 | Repeatable timing report and launch-time breakdown | — | Ready |
| E2E-2 | Remove avoidable per-launch fixture overhead | E2E-1 | Planned |
| E2E-3 | Prototype and measure a shared application per worker | E2E-1 | Planned |
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

Files: `package.json`, `scripts/e2e-timing.mjs`, `e2e/fixtures.ts`, `docs/DEVELOPMENT.md` §8 (one paragraph on the timing command), `opencode.json` if needed, this plan.
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

None yet beyond the baseline.

## Next Task

E2E-1. E2E-4 is independent and may be taken instead if the Product Owner asks for it.

## Resume Prompt

```text
Continue the E2E suite time initiative (plans/e2e-suite-time.md): take the next Ready task.
```
