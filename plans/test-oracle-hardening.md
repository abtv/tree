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
* T4: the Product Owner chose to retain expansion choices through deletion and undo. Expansion IDs may therefore refer to deleted nodes; the invariant checks that each ID belongs to a node seen in the generated history and that document commands preserve the choices. PRODUCT.md §2.4 records the behavior.

## Baseline (2026-09-30, commit `9f38b57`)

* `npx vitest run --coverage`: 76 files, 1238 tests, 4.9 s. Statements 94.52%, branches 88.38%, functions 95.57%, lines 97.18%.
* `src/renderer/use-node-input-bindings.ts`: branches 73.49%. `src/renderer/use-scroll-restoration.ts`: branches 56.25%.
* `npm run test:e2e`: 295 tests passed in 1.2 min, 6 local workers.
* Interaction assertions (`toHaveBeenCalled*` or `mock.calls`): 259 in `src/renderer/editor-input-handlers.test.ts`, 70 in `src/renderer/use-node-input-bindings.test.tsx`, 40 in `src/renderer/NodeList.test.tsx`, 19 in `src/renderer/App.test.tsx`.
* Mutation score: not measured yet (T1).

## Tasks

| ID | Outcome | Depends on | Status |
| --- | --- | --- | --- |
| T1 | Mutation testing tooling, usage documentation, and a baseline score | — | Blocked (Product Owner decision, see T1 findings) |
| T2 | Property seed and run-count policy with a soak run | — | Done |
| T3 | Undo and redo semantics property over real `EditorStore` commands | T2 | Done |
| T4 | Location and display invariants checked after every command | T3 | Done |
| T5 | Command inventory guard for the property generators | T4 | Done |
| T6 | Surviving-mutant triage in domain and application, then a break threshold | T1, T5 | Planned |
| T7 | Real-store test harness and outcome assertions in the input-bindings tests | T3 | Done |
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

**Findings (2026-09-30, session 1, nothing committed except this note).** The latest released `@stryker-mutator/vitest-runner` is 10.0.0 (with `@stryker-mutator/core` 10.0.0). Its peer range is `vitest >=2.0.0`, so it installs against the pinned `vitest` 5.0.0. It does not work with it. Setup: `testRunner: 'vitest'`, `coverageAnalysis: 'perTest'`, mutate `src/domain/**` and `src/application/**`. The initial dry run passed (935 tests, 3660 mutants). In the mutation phase, no mutant was killed:

* full run: about 96% of the first 2792 tested mutants survived before the run hit a 10-minute limit;
* `--mutate src/domain/document-links.ts`: 0 killed, 508 survived, 23 without coverage, "0.00 tests per mutant on average";
* the same result with `vitest: { related: false }` and with `coverageAnalysis: 'off'`, on lines 255-265 of that file: 0 of 20 killed.

The runner's source handles Vitest up to the 4.1 pool options (`maxWorkers`) and has no 5.x handling. The cause inside the runner is not established: the debug log crashes with "Converting circular structure to JSON". The tooling was reverted; the repository holds no Stryker files or dependencies.

Options for the Product Owner (reserved decision above):

1. Wait for a runner release that supports Vitest 5 (no date known).
2. Downgrade `vitest` and `@vitest/coverage-v8` to a 4.x version the runner handles. This changes the test toolchain and needs its own validation.
3. Use another mutation tool. None was evaluated in this session.

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

**Result (2026-09-30).** Seeds are random except `editor-store.property.test.ts`'s round-trip property, which keeps its fixed seed because it asserts `exercisedDeepSelection`. `vim-mixed-interaction.property.test.ts` lost its fixed seed; its counterexample from seed 711207 is already a named test. 20 consecutive `npx vitest run` runs with random seeds passed (1238 tests each, 4.07-4.95 s, rising over the loop; the pre-change figure is the 4.9 s coverage run in the Baseline, not a same-mode measurement). `FC_SEED` and `FC_PATH` replay was shown with a scratch failing test, not committed. `npm run test:property:soak` passes: 16 files, 81 tests, 30 s. The soak exposed a test-resource limit, not a product defect: `vim-interaction.property.test.ts` builds dozens of `vi.fn` per run and Vitest retains them, so at 20 times the run count the worker ran out of heap. The `keyEvent` mock became a plain function and the three double-based properties cap the factor at 4 (`propertyRuns(base, maxScale)`). The `document.property.test.ts` properties at 25 and 50 runs now run 100.

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

**Result (2026-09-30).** Shared generators and fakes moved to `src/application/test/editor-store-arbitraries.ts` (`forest`, `deepForest`, `command`, `materialize`, `createServices`, `applyCommand`, plus `allNodes`/`allIds`/`firstLocation`/`freshIds`/`isDisplayed`, needed by both property files and moved for the same reason). `editor-store-undo.property.test.ts` drives undo and redo itself, so its generated sequence excludes the `'undo'`/`'redo'` command kinds. One property covers all four required assertions: after every generated command it probes with one `undo()` then one `redo()` (a pairing that is idempotent on the accumulated history, so it can run after every command without disturbing the sequence still to come) and checks the reached document against what the command should have changed; after the whole sequence it performs `commands.length` undos then the same number of redos and checks the document is restored. Location validity and display are asserted only when `undo()`/`redo()` actually altered the snapshot (reference-compared): a no-op call (nothing left to undo or redo) makes no claim about a selection a prior synthetic `selectDescendant` may have left outside the displayed rows, which is unrelated to what this property tests.

The property found two defects, both fixed defect-first with a named regression test proving the failure and passing after the fix, and both verified as real by tracing the reachable product scenario, not only the fuzz counterexample:

* `moveNodeTransition` compared the unclamped destination index to the source index to decide whether a move was a no-op, while `moveSibling` clamps it to the sibling list's bounds. An insertion index that clamps back to the source position (for example dropping the only sibling in a list "after the last sibling", or dropping any last-positioned sibling past the end of the list) still passed the unclamped check and pushed a history entry for a document that did not change. Fixed by clamping the destination the same way `moveSibling` does before comparing it to the source index. Regression test: `src/application/editor-command-transitions.test.ts` ("is a no-op when an out-of-range insertion index clamps back to the source position").
* `pasteFromClipboard`'s single-line text branch called `applyStructural` unconditionally, so pasting empty clipboard text (no selection to copy) pushed a history entry though `pasteText` leaves the node's content unchanged. Fixed with an early return when the clipboard text is empty and carries no links. Regression test: `src/application/editor-store.test.ts` ("does not record a history entry for pasting empty clipboard text").

Both fixes are Moderate Risk (domain/application behavior within one process). Validation: `npm run check` (1241 tests, coverage unchanged at the reported thresholds) passed; the focused E2E specs for the affected requirements (`drag-and-drop.spec.ts`, `clipboard.spec.ts`, `undo-sessions.spec.ts`, `history.spec.ts`, 39 tests) passed unchanged. The new property passed 300 runs by default and was additionally run at `TREE_PROPERTY_RUNS=30` (9000 runs) with no failures.

Checking out `fix(undo): keep the location when the change site is a visible row` (`38f8685`) reverted in a scratch worktree did not fail this task's own property (it only checks that undo/redo reach *a* valid, displayed location, not which one — the exact-location invariant is T4's `currentParentId` rule). It did fail, as the acceptance criterion requires: the pre-existing `editor-undo-focus.property.test.ts` ("always reports a valid, displayable location whose focus is the selected node") and three scenarios in `editor-store.test.ts`'s `remembered expansion` suite. `git log --grep` finds the commit.

### T4 — Location and display invariants after every command (W1)

The structural invariants in `assertInvariants` did not catch the 2026-09-29 location defects. Add invariants checked after every generated command:

* the selected node is displayed: it is the current-parent heading or a visible row (`isDisplayed` is currently checked only after the restore round trip);
* a command whose effect lies within the displayed location keeps `currentParentId` unchanged, unless the current parent itself was removed;
* expansion state refers only to nodes seen in the generated document history, and commands other than explicit expansion/fold commands preserve expansion choices (revised after the Product Owner chose to retain choices through deletion and undo).

Before writing the second invariant, derive from `docs/PRODUCT.md` §§4-8 and §10 which commands may change the current parent, and record the table in this plan. A command whose rule the product document does not determine is a requirement gap: classify it under `AGENTS.md` §5.

Files: `src/application/editor-store.property.test.ts`, `src/application/test/editor-store-arbitraries.ts`, this plan.

Acceptance: reverting each of `fix(navigation): keep the location when deleting a visible descendant` and `fix(undo): keep the location when the change site is a visible row` in a scratch worktree makes a new invariant fail. If one does not, strengthen the invariant or the generator until it does, and record the result.

Validation tier: Low Risk (`npm run check`); Moderate Risk for any fix commit.

**Command/location table (derived before implementation, 2026-09-30).**

| Generated command | May change current parent? | PRODUCT.md source |
| --- | --- | --- |
| edit | No, including an edit to an unselected node | §2.4 |
| split | No: sibling creation or first child of the heading | §§2.4, 5.1, 6.1 |
| delete, deleteEmpty | No: selection returns to a sibling or parent within the location | §§2.4, 8.1, 8.2 |
| move | No: reorder actual siblings | §§2.4, 11 |
| enter | Yes, a selected row becomes current parent; heading is a no-op | §6.1 |
| leave | Yes, one parent level; root is a no-op | §7.1 |
| up, down, horizontal | No, follow visible rows and heading | §4 |
| navigate | Yes, explicit ancestor navigation | §2.2 |
| undo, redo | Only if the resulting change site is outside the old displayed location or that location was removed | §10 |
| paste, pasteImage | No for visible rows; a sibling created by heading paste is outside the old location | §§13–15 |
| selectDescendant | No; target a rendered descendant | §2.4 |
| toggleExpansion, foldAll | No; collapse may select a displayed ancestor | §2.4 |

The invariant checks the resulting history focus against the incoming location and expansion choices, using ancestry rather than the production history-focus function. Heading paste is excluded from location preservation because it can create a sibling outside the current location; display validity and expansion checks still apply. Explicit navigation is also excluded from location preservation. The generator no longer selects hidden descendants: it selects visible descendants beneath the direct sibling level, matching a reachable pointer interaction. Reordering also chooses any visible row, with the destination bounded by its actual sibling list. The serialize/restore property's fixed-seed deep-selection assertion continues to pass.

A targeted property always expands a nested branch, selects its only child, deletes it, undoes, and redoes. Generated subtrees vary the deleted content; both deletion commands and root/nested locations are generated. The restored child's own expansion is checked by displaying its children after undo.

Historical-fix sensitivity in `/private/tmp/tree-t4-oracle`, HEAD `9181bfe` plus the new property/helper changes: `npx vitest run src/application/editor-store.property.test.ts -t 'keeps the location and expansion'` fails at the new location-preservation assertion with each production fix reversed separately. Reversing `95ad2d9` failed after 2 cases (seed `-1656266912`, path `1:0:0:0:0`, Backspace deletion); reversing `38f8685` failed after 1 case (seed `-1561955677`, path `0:0:0:0:0`, undo). Both expected current parent `view-root` and received `branch`. Restoring both fixes passed the same command (100 cases). No scratch changes enter the task commit.

**Result (2026-09-30).** No production defect found. `npm run check` passed (77 files, 1242 tests, 5.33 s coverage suite; zero audit vulnerabilities). `TREE_PROPERTY_RUNS=20 npx vitest run --testTimeout=600000 src/application/editor-store.property.test.ts src/application/editor-store-undo.property.test.ts` passed (8 properties, 31.70 s). The first extended run omitted the soak timeout and timed out in the unchanged save-accounting property at five seconds; the documented soak timeout resolved it. `npx playwright test e2e/inline-expansion.spec.ts --grep 'keeps the location when deleting and undoing' --workers=1` passed (1 real Electron test). Primary diff review found no meaningful issues. The scratch worktree was removed. There are no intentionally unsupported generated command combinations; the table explains the cases exempt from location preservation.

### T5 — Command inventory guard (W1)

A new command enters cross-feature property sequences only if someone adds it to the generator by hand. Make that step mechanical.

* Add `src/application/editor-store-command-inventory.test.ts`. It lists the public methods of `EditorStore.prototype` and fails when a method is neither driven by the generator in `editor-store-arbitraries.ts` nor listed in an explicit exclusion map with a reason (for example read-only accessors and lifecycle methods).
* Check whether the Vim commands are declared in one table (see `src/renderer/vim-keyboard-types.ts` and `src/renderer/vim-keyboard-handler.ts`). If they are, add the same guard for the event generator in `src/renderer/vim-mixed-interaction.property.test.ts`. If they are not, record why in this plan and do not restructure production code for this task.

Files: `src/application/editor-store-command-inventory.test.ts` (new), `src/application/test/editor-store-arbitraries.ts`, possibly a Vim inventory test, this plan.

Acceptance: adding an unused public method to `EditorStore` in a scratch change fails the guard, and the failure message names the method. The scratch change is not committed.

Validation tier: Low Risk (`npm run check`).

**Result (2026-09-30).** `editor-store-command-inventory.test.ts` inventories the runtime prototype, filters TypeScript private methods using their declarations, and reads actual `store` calls in `applyCommand` using the TypeScript parser. Every remaining public method must be generated or have an explicit exclusion reason. The guard also rejects stale exclusions, exclusions for generated commands, and empty reasons. Read-only projection calls are not counted as generated commands. Instance fields (`getSnapshot` and `subscribe`) are outside this prototype guard's scope. No generator or production changes were needed.

Vim has no single complete command table: `vim-keyboard-types.ts` describes pending and repeat state as type unions, and `vim-keyboard-handler.ts` dispatches commands through mode-dependent branches. Its `FOLD_COMMANDS` table covers only fold keys. As instructed, no Vim inventory guard or production restructuring was added.

Acceptance: adding the temporary public method `inventoryScratchCommand` made `npx vitest run src/application/editor-store-command-inventory.test.ts` fail with that method named in the missing-method assertion. Removing it restored the exact validated snapshot. `npm run check` passed (78 files, 1243 tests, 4.96 s coverage suite, build passed, zero audit vulnerabilities), on HEAD `a322bada0889992124b85a201db798a6b6cd4be1`, snapshot `sha256:bc8c2bf0cf8c63767d3db866301052b8dc3bebc2b7b45cbd65953090cf48f380`. An initial check failed because filesystem imports lacked Node types in the application TypeScript configuration; raw source imports resolved it without changing configuration. Primary diff review found no meaningful issues. No product behavior changed.

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

**Result (2026-09-30).** Added `src/renderer/test/real-store-harness.ts`, reusing the application property-test services and ID generator. It serializes its fixture through the production serializer, supplies observable clipboard writes and attachment bytes, converts clipboard HTML with the production link extractor, and skips IDs already in the fixture. Service and clock overrides support failure injection. The input-bindings fixture subscribes to the real store and supplies current snapshot nodes, with explicit DOM events and fake save timers. All earlier scenario families remain: whole-node and character Visual endpoints/registers, Insert capture across blur/pointer/node changes, structural repeat, Replace composition/commit/reentrancy/flush, image caret, focus, links, context menus, selection grouping, resize, and drag freeze. Store-call assertions became resulting text/tree/location/focus/mode assertions, with undo and redo checking edit grouping where appropriate. New cases cover viewport motions, structural put/delete repeat, unavailable Visual spans, contenteditable sessions, clipboard link round trips, pointer release/replacement, asynchronous errors, and persistence-lock menu behavior.

The file now runs 91 cases (56 at T7 start). The interaction-assertion count is 11, down from 60 in the task-start file (`git show HEAD:src/renderer/use-node-input-bindings.test.tsx | rg -c 'toHaveBeenCalled|mock.calls'` before this commit); the initiative baseline recorded 70. Every remaining occurrence has a contract reason:

* Locked-menu test: `preventDefault` is not called, preserving native behavior while locked (one assertion).
* Cmd-click test: `window.open` is absent without Cmd, receives the URL with Cmd, and is called only once after unrelated/outside targets (three assertions); `preventDefault` runs for both link clicks (one assertion). These calls are the external-open and native-event contracts.
* Textarea context-menu test: `preventDefault` runs once and the native API receives coordinates, selection, and availability (two assertions).
* Contenteditable context-menu test: the native API receives its actual selected text and availability (one assertion); clipboard content and link-preserving paste are asserted as outcomes.
* Pointer-button test: `preventDefault` runs only for the secondary button (one assertion).
* Pending-edit-finisher lifecycle test: registration and unregistration each occur once (two assertions). This is the sole remaining `createEditorStoreDouble` use; callback ownership is the contract.

Added 14 scroll-restoration cases for ready gating, one-time startup alignment, layout realignment, row/window clamping, heading selection, missing-row measurement, all four user-input interruption events, user-scroll save accounting, absent observer, and cleanup. Hook coverage (statements / branches / functions / lines) is input bindings **95.63 / 89.04 / 94.18 / 98.52%**, up from **86.16 / 73.49 / 84.88 / 91.47%** at T7 start, and scroll restoration **98.30 / 90.62 / 100 / 100%** (baseline branches 56.25%). Floors are respectively **95 / 88.5 / 93.5 / 98** and **98 / 90 / 99 / 99**. Remaining coverage gaps include optional no-op callbacks and defensive non-ready/missing-DOM branches; these are not claims of complete branch coverage.

Validation: `npm run check` passed at HEAD `9f1e4680795054a85c3c2d94d27926b2c15dd041`, snapshot `sha256:260d19ddf5b22cecf99cceedfcde086231796c26d1f8752fb9fcd51b6e5e8af6`: 79 files, 1292 tests, 4.99 s coverage suite, production build passed, zero audit vulnerabilities. Earlier development checks exposed fixture/schema/expectation/type issues and a formatting failure; all were corrected before that pass. Documentation-only completion edits require formatting and documentation checks without repeating runtime validation. Primary diff review found no meaningful issues. No production, product, or architecture changes and no Product Owner decisions were made. No rendered inputs changed, so new screenshot evidence was not required; these jsdom tests complement the existing Electron tests.

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

T1 is blocked on a Product Owner decision (see the T1 findings). T2, T3, T4, T5, and T7 are done. T8 (outcome assertions for input handlers) is the next ready task. T6 stays blocked until T1 is resolved.

## Resume prompt

```text
Continue the Test Oracle Hardening initiative (plans/test-oracle-hardening.md). Take its next Ready task.
```
