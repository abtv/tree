# Test Oracle Hardening

## Objective

Make the test suite find new defects, not only guard behavior that was already fixed. The suite is fast and broad, but its oracles — the assertions that decide whether a result is correct — are weaker than its reach: property tests over `EditorStore` check structure rather than meaning, the largest renderer tests assert which store method was called rather than what state resulted, coverage floors measure execution rather than assertion strength, fixed seeds stop property tests from exploring, and nothing checks that every `docs/PRODUCT.md` requirement has a test.

The initiative addresses six weaknesses from the testing audit of 2026-09-30:

| # | Weakness | Tasks |
| --- | --- | --- |
| W1 | Defects introduced with new features are found by review, not by tests (for example `fix(navigation): keep the location when deleting a visible descendant` and `fix(undo): keep the location when the change site is a visible row`, both 2026-09-29) | T4, T5, T6 |
| W2 | The `EditorStore` command-sequence property checks only structural invariants; no property checks that undo reverses a real command | T3 |
| W3 | The interaction layer is the least covered and is tested mostly through interaction assertions on store doubles | T7, T8 |
| W4 | No mutation testing, so assertion strength is unmeasured | T1, T6 |
| W5 | Fixed seeds and low run counts in property tests | T2 |
| W6 | The rule that every `docs/PRODUCT.md` behavior has a test is not checked mechanically | T9 |

## Scope and boundaries

* Test code, test helpers, validation tooling, CI workflows, and the testing sections of `docs/DEVELOPMENT.md`.
* Production code changes only as defect fixes that a new test exposes, under the defect-first workflow in `AGENTS.md` §9. Each such fix is its own commit.
* No product behavior change. When a new property needs a behavior that `docs/PRODUCT.md` does not determine, that is a requirement gap under `AGENTS.md` §5: classify it, and stop to ask when it is material. Do not encode an assumed answer in a test.
* No new prose rules in `AGENTS.md`. Every weakness is closed by a check that runs, not by instructions to remember. Rationale: open question TD-001 in [OPEN_QUESTIONS.md](../docs/OPEN_QUESTIONS.md) records that rules added after defects did not stop those defect classes, while a structural change did.
* Do not lower an existing coverage floor in `vitest.config.ts` to make a migration pass.

Sources of truth: [AGENTS.md](../AGENTS.md) §9 (tests), [DEVELOPMENT.md](../docs/DEVELOPMENT.md) §§9 and 12, [PRODUCT.md](../docs/PRODUCT.md) §10 (undo and redo) and §§4-8 (navigation, creation, entering, leaving, deletion).

## Authorization

The Product Owner authorized the objective and the creation of this plan on 2026-09-30, including adding mutation testing with documented usage. Each task is authorized when the Product Owner asks to continue the initiative, one ready task at a time under `AGENTS.md` §8.

Decisions reserved for the Product Owner:

* T1: if no released Stryker Vitest runner supports the pinned Vitest version, which alternative to take (wait for a release, change the Vitest version, or another mutation tool).
* Any material requirement gap that T3 or T4 exposes.

## Decisions

* Mutation testing is not part of `npm run check` or `npm run check:full`. It runs on demand for changed domain and application files and on a weekly schedule. Reason: a full run costs minutes to tens of minutes, far more than the whole unit suite.
* Property tests use a random seed by default, locally and in pull-request CI. A failure prints its seed and path; the reproduced counterexample becomes a named deterministic test in the same fix, as `src/renderer/vim-mixed-interaction.property.test.ts` already does. Reason: a fixed seed replays the same cases on every run and never explores new ones. The Product Owner may override this default.
* Requirement traceability is checked at the level of numbered `docs/PRODUCT.md` sections, not individual sentences.

## Baseline (2026-09-30, commit `9f38b57`)

* `npx vitest run --coverage`: 76 files, 1238 tests, 4.9 s. Statements 94.52%, branches 88.38%, functions 95.57%, lines 97.18%.
* `src/renderer/use-node-input-bindings.ts`: branches 73.49%. `src/renderer/use-scroll-restoration.ts`: branches 56.25%.
* `npm run test:e2e`: 295 tests passed in 1.2 min, 6 local workers.
* Interaction assertions (`toHaveBeenCalled*` or `mock.calls`): 259 in `src/renderer/editor-input-handlers.test.ts`, 70 in `src/renderer/use-node-input-bindings.test.tsx`, 40 in `src/renderer/NodeList.test.tsx`, 19 in `src/renderer/App.test.tsx`.
* Mutation score: not measured yet (T1).

## Tasks

| ID | Outcome | Depends on | Status |
| --- | --- | --- | --- |
| T1 | Mutation testing tooling, usage documentation, and a baseline score | — | Ready |
| T2 | Property seed and run-count policy with a soak run | — | Planned |
| T3 | Undo and redo semantics property over real `EditorStore` commands | T2 | Planned |
| T4 | Location and display invariants checked after every command | T3 | Planned |
| T5 | Command inventory guard for the property generators | T4 | Planned |
| T6 | Surviving-mutant triage in domain and application, then a break threshold | T1, T5 | Planned |
| T7 | Real-store test harness and outcome assertions in the input-bindings tests | T3 | Planned |
| T8 | Outcome assertions in the input-handler tests | T7 | Planned |
| T9 | Requirement traceability check | T8 | Planned |
| T10 | Initiative closure | T1-T9 | Planned |

Order rationale: T1 comes first so that later tasks can show a measured change in mutation score. T2 comes before the new properties so that they are written under the new seed policy. T6 comes after T3-T5 because those tasks kill many survivors on their own. T9 comes after T7-T8 because it adds requirement markers to test files that T7-T8 rewrite.

### T1 — Mutation testing tooling and baseline (W4)

Add Stryker with its Vitest runner and measure where the tests do not detect a changed program.

* First check that a released `@stryker-mutator/vitest-runner` supports the pinned `vitest` version. If none does, set this task to `Blocked`, record the versions checked, and ask the Product Owner (reserved decision).
* Pin exact versions, as the rest of `package.json` does.
* Mutate `src/domain/**/*.ts` and `src/application/**/*.ts`, excluding tests and test helpers. Use `coverageAnalysis: "perTest"` and incremental mode with its file under an ignored `reports/` directory.
* Add `npm run test:mutation`. Arguments after `--` pass through to Stryker, so a narrower run is `npm run test:mutation -- --mutate src/domain/document-operations.ts`.
* Add `.github/workflows/mutation.yml`: weekly schedule and manual dispatch, Ubuntu, runs the full scope and uploads the HTML report. No break threshold yet (T6 sets it).
* Document usage in `docs/DEVELOPMENT.md` §12: what the score means, that the command is not part of `check`, and when to run it. Run it on the changed files when a task changes logic in `src/domain` or `src/application`, and read surviving mutants before handoff. Read the weekly report when it drops. Treat a survivor as a question about a missing assertion, not a target to chase.

Files: `package.json`, `package-lock.json`, `stryker.config.mjs` (new), `.gitignore`, `.prettierignore` if the report directory needs it, `.github/workflows/mutation.yml` (new), `docs/DEVELOPMENT.md` §12, this plan.

Acceptance: `npm run test:mutation` completes locally. The plan records the run time and the mutation score per file in the Baseline section. `npm run check` passes. Manually dispatching the workflow is left to the Product Owner and recorded as not yet verified until it has run.

Validation tier: High Risk (dependency and toolchain change): `npm run check:full`.

### T2 — Property seed and run-count policy (W5)

* Remove hard-coded `seed` options from `fc.assert` calls that explore (currently `src/application/editor-store.property.test.ts` and `src/renderer/vim-mixed-interaction.property.test.ts`).
* Add a Vitest `setupFiles` entry that calls `fc.configureGlobal` with `seed` and `path` from the `FC_SEED` and `FC_PATH` environment variables when they are set, so a printed failure replays exactly.
* Add a small test helper that scales a base run count by a `TREE_PROPERTY_RUNS` factor (default 1), and use it in every `numRuns` option.
* Some properties assert that a branch was exercised (for example `exercisedDeepSelection` in `editor-store.property.test.ts`). With a random seed, such an assertion can fail without a defect. Make the generator guarantee the branch, or keep a fixed seed for that one property with a comment explaining why.
* Raise the domain properties that run 25 times in `src/domain/document.property.test.ts` to at least 100 runs, provided the whole `npm test` stays within 1.5 times its baseline duration on the same machine.
* Add `npm run test:property:soak`: the property files at `TREE_PROPERTY_RUNS=20`. Add a nightly Ubuntu workflow `.github/workflows/property-soak.yml` that runs it.
* Document seeds, replay, and the soak run in `docs/DEVELOPMENT.md` §12.

Files: `vitest.config.ts`, a new setup file and helper under `src/test/` (exclude it from coverage like `src/renderer/test/**`), the `*.property.test.ts` files, `package.json`, `.github/workflows/property-soak.yml` (new), `docs/DEVELOPMENT.md` §12.

Acceptance: 20 consecutive local `npm test` runs with random seeds pass. Any failure is a found defect: fix it under the defect-first workflow and keep the counterexample as a named test. `FC_SEED` and `FC_PATH` replay a failure deterministically, demonstrated once by forcing a failure locally and not committing it. The plan records the suite duration before and after.

Validation tier: Low Risk (tests and validation tooling): `npm run check`.

### T3 — Undo and redo semantics property (W2)

Read `docs/PRODUCT.md` §10 first and assert only what it specifies.

* Move the shared generators and service fakes out of `src/application/editor-store.property.test.ts` (`forest`, `deepForest`, `materialize`, `command`, `applyCommand`, `createServices`) into `src/application/test/editor-store-arbitraries.ts`, and exclude that directory from coverage.
* Add `src/application/editor-store-undo.property.test.ts` with these properties over generated documents and command sequences:
  * for any reached state and any command that changes the document, `undo()` returns a document deep-equal to the one before the command;
  * a command that does not change the document leaves the history unchanged, so the next `undo()` reverses the previous document change;
  * `k` undos followed by `k` redos restore the document deep-equal to the state before the undos;
  * after undo or redo, the location is valid and the selected node is displayed.
* Text-edit sessions group edits (§10). End the session between generated commands so each command is one history entry, and leave grouping to the existing tests.

Files: `src/application/test/editor-store-arbitraries.ts` (new), `src/application/editor-store.property.test.ts`, `src/application/editor-store-undo.property.test.ts` (new), `vitest.config.ts` (coverage exclusion), plus a separate fix commit for each defect found.

Acceptance: the properties pass, or each failure is fixed defect-first with a named regression test. Checking out `fix(undo): keep the location when the change site is a visible row` reverted in a scratch worktree makes at least one property fail; record the result. `git log --grep` finds the commit.

Validation tier: Low Risk for tests only (`npm run check`); Moderate Risk for any fix commit.

### T4 — Location and display invariants after every command (W1)

The structural invariants in `assertInvariants` did not catch the 2026-09-29 location defects. Add invariants checked after every generated command:

* the selected node is displayed: it is the current-parent heading or a visible row (`isDisplayed` is currently checked only after the restore round trip);
* a command whose effect lies within the displayed location keeps `currentParentId` unchanged, unless the current parent itself was removed;
* expansion state refers only to nodes the document contains.

Before writing the second invariant, derive from `docs/PRODUCT.md` §§4-8 and §10 which commands may change the current parent, and record the table in this plan. A command whose rule the product document does not determine is a requirement gap: classify it under `AGENTS.md` §5.

Files: `src/application/editor-store.property.test.ts`, `src/application/test/editor-store-arbitraries.ts`, this plan.

Acceptance: reverting each of `fix(navigation): keep the location when deleting a visible descendant` and `fix(undo): keep the location when the change site is a visible row` in a scratch worktree makes a new invariant fail. If one does not, strengthen the invariant or the generator until it does, and record the result.

Validation tier: Low Risk (`npm run check`); Moderate Risk for any fix commit.

### T5 — Command inventory guard (W1)

A new command enters cross-feature property sequences only if someone adds it to the generator by hand. Make that step mechanical.

* Add `src/application/editor-store-command-inventory.test.ts`. It lists the public methods of `EditorStore.prototype` and fails when a method is neither driven by the generator in `editor-store-arbitraries.ts` nor listed in an explicit exclusion map with a reason (for example read-only accessors and lifecycle methods).
* Check whether the Vim commands are declared in one table (see `src/renderer/vim-keyboard-types.ts` and `src/renderer/vim-keyboard-handler.ts`). If they are, add the same guard for the event generator in `src/renderer/vim-mixed-interaction.property.test.ts`. If they are not, record why in this plan and do not restructure production code for this task.

Files: `src/application/editor-store-command-inventory.test.ts` (new), `src/application/test/editor-store-arbitraries.ts`, possibly a Vim inventory test, this plan.

Acceptance: adding an unused public method to `EditorStore` in a scratch change fails the guard, and the failure message names the method. The scratch change is not committed.

Validation tier: Low Risk (`npm run check`).

### T6 — Surviving-mutant triage (W4, W1)

* Run `npm run test:mutation` and compare with the T1 baseline.
* Kill survivors in this order: `src/domain/document-operations.ts`, `src/application/editor-command-transitions.ts`, `src/application/editor-history.ts`, `src/application/editor-store.ts`, `src/application/persistence-coordinator.ts`, `src/application/editor-save-scheduler.ts`, then the rest.
* Kill each survivor with an assertion on behavior, not on implementation. Mark an equivalent mutant with a Stryker disable comment that states why it is equivalent.
* Set `thresholds.break` in `stryker.config.mjs` just below the achieved score, so the weekly workflow fails on a drop.
* If the meaningful survivors will not fit in one session, split the task into T6a (domain) and T6b (application) in this plan before continuing.

Files: tests in `src/domain/` and `src/application/`, `stryker.config.mjs`, `docs/DEVELOPMENT.md` §12 (the threshold's meaning), this plan.

Acceptance: the plan records the score per file before and after. The break threshold is set. `npm run check` passes.

Validation tier: Low Risk (`npm run check`); Moderate Risk for any fix commit.

### T7 — Real-store harness and outcome assertions for input bindings (W3)

* Add `src/renderer/test/real-store-harness.ts`: a real `EditorStore` over in-memory services (load, save, clipboard, attachments). Reuse the fakes from `src/application/test/editor-store-arbitraries.ts` rather than writing a second copy.
* In `src/renderer/use-node-input-bindings.test.tsx`, replace assertions on which store method was called with assertions on the resulting document, location, focus, and Vim mode. Keep `createEditorStoreDouble` only where the call is itself the contract (for example `reportError`) or to inject a failure. Record each remaining interaction assertion and its reason in this plan.
* Add tests for the uncovered branches of `src/renderer/use-node-input-bindings.ts` and `src/renderer/use-scroll-restoration.ts`.
* Raise their per-file floors in `vitest.config.ts` to just below the new measurement.
* Update the paragraph on doubles in `docs/DEVELOPMENT.md` §12: the real-store harness is the default for outcome assertions; doubles are for failure injection and calls that are themselves the contract.

Files: `src/renderer/test/real-store-harness.ts` (new), `src/renderer/use-node-input-bindings.test.tsx`, possibly `src/renderer/use-scroll-restoration.test.ts` (new), `vitest.config.ts`, `docs/DEVELOPMENT.md` §12, this plan.

Acceptance: the interaction-assertion count in `use-node-input-bindings.test.tsx` drops from the baseline, with every remaining one justified in this plan. The coverage floors are raised, not lowered. `npm run check` passes.

Validation tier: Low Risk (`npm run check`).

### T8 — Outcome assertions for input handlers (W3)

Apply the T7 approach to `src/renderer/editor-input-handlers.test.ts` (259 interaction assertions at baseline). Where a handler is a pure mapping from an event to a command, and the command is itself the contract, an interaction assertion may stay; record the category rather than each line. If the file will not fit in one session, split the work by handler group into T8a and T8b in this plan before continuing.

Files: `src/renderer/editor-input-handlers.test.ts`, possibly `src/renderer/test/real-store-harness.ts`, this plan.

Acceptance: the plan records the interaction-assertion count before and after, and the categories kept. `npm run check` passes.

Validation tier: Low Risk (`npm run check`).

### T9 — Requirement traceability check (W6)

* Add `scripts/check-requirement-coverage.mjs` and `npm run check:requirements`, and include it in `npm run check`. It:
  * reads the numbered headings of `docs/PRODUCT.md` (`## N.` and `### N.M`); unnumbered subheadings belong to the nearest numbered heading above them;
  * treats as a requirement every numbered section without numbered children, plus any parent with its own normative text;
  * finds markers `// @requirement PRODUCT.md §N.M` in `src/**/*.test.*`, `e2e/**/*.ts`, and `perf/**/*.ts`;
  * fails when a requirement has no marker, when a section listed as crossing a boundary has no marker under `e2e/`, or when a marker names a section that does not exist;
  * holds an exemption map with a reason for each entry (for example §1 overview and §1.2 exploratory-section rules), and a list of boundary sections derived from `AGENTS.md` §9 (the shell, preload and IPC, persistence, attachments, clipboard, drag-and-drop, and shortcuts).
* Add unit tests for the script next to the existing script tests.
* Add markers to existing tests. For a requirement with no test, write the test. If more than a handful are missing, record the list here and split the missing tests into T9b before continuing.
* Document the marker and the check in `docs/DEVELOPMENT.md` §§9 and 12, and list it among the `npm run check` steps.

Files: `scripts/check-requirement-coverage.mjs` (new), its test (new), `package.json`, test files across `src/`, `e2e/`, `perf/`, `docs/DEVELOPMENT.md` §§9 and 12, this plan.

Acceptance: `npm run check:requirements` passes. Removing one marker in a scratch change fails it and names the section. Renaming a section in a scratch change fails it. Neither scratch change is committed.

Validation tier: Low Risk (`npm run check`). If new E2E tests are added, also run the affected E2E specs.

### T10 — Closure

Record the final measurements (mutation score, test counts, suite durations, coverage) in the closure handoff. Confirm that `docs/DEVELOPMENT.md` §12 holds everything lasting from this plan. Remove this plan and its row in `plans/README.md`.

Validation tier: Minimal Risk (`npm run format:check:changed`, `npm run check:docs`).

## Next task

T1 — Mutation testing tooling and baseline.

## Resume prompt

```text
Continue the Test Oracle Hardening initiative (plans/test-oracle-hardening.md). Take its next Ready task.
```
