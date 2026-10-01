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

* Any material requirement gap that T3 or T4 exposes.

## Decisions

* Mutation testing is not part of `npm run check` or `npm run check:full`. It runs on demand for changed domain and application files and on a weekly schedule. Reason: a full run costs minutes to tens of minutes, far more than the whole unit suite.
* Property tests use a random seed by default, locally and in pull-request CI. A failure prints its seed and path; the reproduced counterexample becomes a named deterministic test in the same fix, as `src/renderer/vim-mixed-interaction.property.test.ts` already does. Reason: a fixed seed replays the same cases on every run and never explores new ones. The Product Owner may override this default.
* Requirement traceability is checked at the level of numbered `docs/PRODUCT.md` sections, not individual sentences.
* T1: on 2026-10-01 the Product Owner chose to pin `vitest` and `@vitest/coverage-v8` to 4.x so the released Stryker Vitest runner works, and to return to Vitest 5 once a runner release supports it. `docs/DEVELOPMENT.md` §12 records the upgrade condition.
* T4: the Product Owner chose to retain expansion choices through deletion and undo. Expansion IDs may therefore refer to deleted nodes; the invariant checks that each ID belongs to a node seen in the generated history and that document commands preserve the choices. PRODUCT.md §2.4 records the behavior.

## Baseline (2026-09-30, commit `9f38b57`)

* `npx vitest run --coverage`: 76 files, 1238 tests, 4.9 s. Statements 94.52%, branches 88.38%, functions 95.57%, lines 97.18%.
* `src/renderer/use-node-input-bindings.ts`: branches 73.49%. `src/renderer/use-scroll-restoration.ts`: branches 56.25%.
* `npm run test:e2e`: 295 tests passed in 1.2 min, 6 local workers.
* Interaction assertions (`toHaveBeenCalled*` or `mock.calls`): 259 in `src/renderer/editor-input-handlers.test.ts`, 70 in `src/renderer/use-node-input-bindings.test.tsx`, 40 in `src/renderer/NodeList.test.tsx`, 19 in `src/renderer/App.test.tsx`.
* Mutation score (T1, 2026-10-01, Vitest 4.1.11, `npm run test:mutation -- --force`, 22 min 55 s on the local 9-runner machine): **80.30%** total, 82.81% of covered mutants; 3676 mutants: 2692 killed, 260 timed out, 613 survived, 111 without coverage. Per file (total % / survived):

| File | Score | Survived |
| --- | --- | --- |
| `application/editor-clipboard-transitions.ts` | 93.18 | 5 |
| `application/editor-command-transitions.ts` | 92.66 | 25 |
| `application/editor-content-changes.ts` | 34.00 | 16 |
| `application/editor-history.ts` | 88.12 | 9 |
| `application/editor-node-visual-transitions.ts` | 72.05 | 57 |
| `application/editor-runtime-state.ts` | 72.50 | 11 |
| `application/editor-save-scheduler.ts` | 78.85 | 21 |
| `application/editor-store-types.ts` | 100.00 | 0 |
| `application/editor-store.ts` | 72.54 | 186 |
| `application/editor-text-session.ts` | 53.57 | 13 |
| `application/editor-undo-focus.ts` | 77.61 | 18 |
| `application/expansion-state.ts` | 97.30 | 2 |
| `application/persistence-coordinator.ts` | 82.05 | 13 |
| `application/save-policy.ts` | 83.78 | 12 |
| `application/visible-rows.ts` | 100.00 | 0 |
| `domain/document-attachments.ts` | 86.57 | 9 |
| `domain/document-index.ts` | 97.56 | 0 |
| `domain/document-links.ts` | 74.39 | 104 |
| `domain/document-operations.ts` | 76.79 | 101 |
| `domain/document-serialization.ts` | 96.42 | 11 |
| `domain/document-types.ts` | 100.00 | 0 |
| `domain/product-messages.ts` | 100.00 | 0 |

## Tasks

| ID | Outcome | Depends on | Status |
| --- | --- | --- | --- |
| T1 | Mutation testing tooling, usage documentation, and a baseline score | — | Done |
| T2 | Property seed and run-count policy with a soak run | — | Done |
| T3 | Undo and redo semantics property over real `EditorStore` commands | T2 | Done |
| T4 | Location and display invariants checked after every command | T3 | Done |
| T5 | Command inventory guard for the property generators | T4 | Done |
| T6a1 | Domain content, hyperlink, retention, and traversal assertions | T1, T5 | Done |
| T6a2 | Remaining domain survivor classification and assertions | T6a1 | Done |
| T6b1 | Command transition and history survivor triage | T6a2 | Done |
| T6b2a | EditorStore view-state survivor triage | T6b1 | Done |
| T6b2b1 | EditorStore direct editing and text replacement survivor triage | T6b2a | Done |
| T6b2b2 | EditorStore navigation and structural command survivor triage | T6b2b1 | Done |
| T6b2b3 | EditorStore asynchronous clipboard and history survivor triage | T6b2b2 | Done |
| T6b2c | EditorStore lifecycle and persistence wiring triage | T6b2b3 | Done |
| T6b3 | Persistence and save-policy survivor triage | T6b2c | Done |
| T6b4 | Remaining application helpers and break threshold | T6b3 | Planned |
| T7 | Real-store test harness and outcome assertions in the input-bindings tests | T3 | Done |
| T8a | Text-operation outcome assertions in the input-handler tests | T7 | Done |
| T8b | Remaining input-handler outcome assertions | T8a | Done |
| T9 | Requirement traceability check | T8b | Done |
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

Options put to the Product Owner (decided on 2026-10-01, see Decisions):

1. Wait for a runner release that supports Vitest 5 (no date known).
2. Downgrade `vitest` and `@vitest/coverage-v8` to a 4.x version the runner handles. This changes the test toolchain and needs its own validation.
3. Use another mutation tool. None was evaluated in this session.

**Result (2026-10-01).** The Product Owner chose option 2. `@stryker-mutator/vitest-runner` was still at 10.0.0. `vitest` and `@vitest/coverage-v8` are pinned to 4.1.11 (peer range `vite ^6 || ^7 || ^8`, so `vite` 7.3.6 stays). Under 4.1.11 the unit suite and every coverage floor passed unchanged except `vitest.config.test.ts`: `resolveConfig` from `vitest/node` returns `{ vitestConfig, viteConfig }` in 4.x, so the test reads `vitestConfig.include`/`exclude`; its assertions are unchanged. Stryker core and runner 10.0.0 are pinned. Stryker core pins `typed-rest-client` `~2.3.0`, which pins `qs` 6.15.1 with moderate advisories, so `npm audit` failed; an exact `overrides` entry pins `qs` 6.16.0 (same major; the client is used only by the dashboard reporter, which is not configured). `stryker.config.mjs` mutates domain and application sources except tests and `src/application/test/**`, uses `perTest` coverage and incremental mode under ignored `reports/`, and prints only the score table. `.github/workflows/mutation.yml` runs weekly and on dispatch with a 90-minute limit and uploads `reports/mutation/`; it has not been dispatched yet, which is left to the Product Owner. Usage is in `docs/DEVELOPMENT.md` §12, the workflow in §9, and the override in §15; `opencode.json` allows `npm run test:mutation`.

Smoke check: `npm run test:mutation -- --mutate src/domain/document-links.ts --force` killed 339 of 531 mutants (67.61%), against 0 killed under Vitest 5. The file scored 74.39% in the full run because other tests count there. The full-run baseline is in the Baseline section.

Validation (High Risk, `npm run check:full` on HEAD `f5c0d36` plus this change): every `npm run check` stage passed (82 files, 1374 unit tests, coverage floors unchanged, build, zero audit vulnerabilities); the performance suite passed (32 tests, run separately with `npx playwright test -c perf.config.ts` after the E2E stage stopped the chain). The E2E suite had 274 passed and 22 failed, all `toHaveScreenshot` comparisons off by 1-2% of pixels (glyph edges and image color). They are environmental and unrelated: this change touches no `src/`, `e2e/`, Playwright, Electron, or Vite input, and with the change stashed, a pristine HEAD build failed `attachment-validation.spec.ts:170` and `node-gutter-alignment.spec.ts:65` with the same pixel counts. The baselines date from 2026-09-28 and passed in earlier sessions, so the local display environment changed; the screenshot suite needs a rerun in the usual environment before relying on it.

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

Split on 2026-10-01 because the baseline has 225 domain survivors and 388
application survivors, exceeding one session of behavioral triage:

* **T6a:** inspect domain survivors, starting with `document-operations.ts`, add
  behavioral assertions in domain tests, and document proven equivalents. Files:
  `src/domain/*.test.ts`, equivalent comments in domain sources if justified,
  this plan, and the index. Acceptance: record before/after per-file domain
  scores and survivor dispositions; `npm run check` passes. Validation: Low
  Risk for tests and comments; exposed defects need separate fix validation.
  Product Owner decisions: material requirement gaps.
* **T6b:** inspect application survivors in the priority order below, add
  behavioral assertions, measure the full score, and set the break threshold.
  Files: application tests, equivalent comments if justified,
  `stryker.config.mjs`, Development §12, this plan, and the index. Acceptance:
  record before/after scores, explain remaining survivors, set the threshold,
  and pass `npm run check`. Validation: Low Risk for tests/configuration;
  exposed defects need separate fix validation. Product Owner decisions:
  material requirement gaps. T10 follows T6b.

T6a is further divided after the first measured domain pass on 2026-10-01:

* **T6a1:** add outcome assertions for clone content, deletion link offsets,
  multiline rich paste, surrogate boundaries, visible-location normalization,
  link creation and draft recovery, malformed saved fields, and propagated
  attachment summaries. Add a traversal-count guard for summary queries and a
  property for links between disjoint edits. Files: domain tests, narrowly
  justified equivalent comments in `document-operations.ts`, Development §12,
  this plan and the index. Acceptance: all new cases pass, full mutation report
  records per-file measurements, and `npm run check` passes. Low Risk; no product
  decision reserved unless a test exposes a material gap.
* **T6a2:** finish the remaining domain inventory before application triage.
  Read the current report against its recorded source, regenerate it if absent,
  and classify every surviving and uncovered domain mutant. Prioritize
  `document-operations.ts` (link filters, no-op ranges, attachment/index cache
  propagation), then `document-links.ts` (prefix/suffix bounds, draft projection,
  token recognition and disjoint-range remapping), `document-serialization.ts`
  (redundant validation guards versus allocation-only build flags), and
  `document-attachments.ts` (summary caching). Files: the corresponding domain
  tests and property tests, equivalent comments in their source owners,
  Development §12 if needed, this plan and the index. Acceptance: meaningful
  survivors have behavioral or traversal-cost assertions; proven equivalents
  have source rationale without suppressing meaningful replacements of the
  same mutator; remaining unsupported/internal defensive branches are named
  explicitly; per-file scores and `npm run check` are recorded. Low Risk for
  tests/comments; exposed production defects require separate fixes and their
  applicable validation. Product Owner decision: any material requirement gap.
  T6b follows T6a2; the final break threshold still belongs to T6b.

T6b is further divided on 2026-10-01: its retained report has 391 application
survivors and 59 uncovered mutants, too many for one session of individual triage.
Each task reads the report against its recorded source, regenerates it when
missing, records dispositions and before/after scores, and runs `npm run check`
at Low Risk for tests/comments/configuration. Any exposed production defect needs
a separate fix and applicable validation; material requirement gaps remain
reserved for the Product Owner.

* **T6b1:** command transitions and history. Files:
  `src/application/editor-command-transitions.test.ts`, `editor-history.test.ts`,
  source comments in their owners, this plan and index. Acceptance: classify all
  27 transition and 12 history surviving/uncovered mutants in the current report;
  add outcomes for meaningful survivors and explain equivalents/defenses.
* **T6b2:** EditorStore. Files: `src/application/editor-store.test.ts`, relevant
  store property tests and comments in `editor-store.ts`, this plan and index.
  Acceptance: classify all store surviving/uncovered mutants, add outcome and
  bounded-cost assertions where required. Task-start report has 186 survivors
  and 15 uncovered mutants; split further before implementation if needed.
  Split on 2026-10-01 after confirming the retained report matches HEAD
  `1921c0f`: **T6b2a** covers constructor view capture, visible-row caching,
  row-position readers, viewport changes and folding (source lines 98-220).
  **T6b2b** covers editing, navigation, clipboard, visual commands and undo/redo
  (lines 343-849). **T6b2c** covers pending-edit registration, initialization,
  flushing and persistence-result wiring (lines 222-342 and 851-end).
  Each task owns tests and explanatory comments in the files above, this plan
  and index; it classifies every surviving/uncovered mutant in its source range,
  adds independent outcome or bounded-cost assertions, measures before/after
  mutation results and runs `npm run check` at Low Risk. Source ranges refer to
  the retained report and method names remain authoritative after line shifts.
  Any material requirement gap is reserved for the Product Owner; production
  defects require separate defect-first fixes. No requirement gap was found in
  T6b2a's PRODUCT.md §§2.4 and 16.1 requirements.
  Split T6b2b on 2026-10-01 at HEAD `a0fac5a`: the matching retained report
  contains 133 surviving/uncovered mutants across several independent owners.
  **T6b2b1** owns `editContent`, `replaceTextRange`, `replaceTextRanges` and
  `deleteLink` (20 mutants, original lines 343-397). **T6b2b2** owns navigation,
  creation, subtree/forest paste, visual commands, deletion and reordering
  (original lines 442-743). **T6b2b3** owns asynchronous copy/cut/paste,
  `trackEdit`, undo/redo and history restoration (original lines 398-441 and
  744-850). Each inherits the files, acceptance and Low Risk validation above;
  split the remaining inventories further if their meaningful assertions will
  not fit one session. All material requirements remain reserved for the Product
  Owner. T6b2b1 depends on PRODUCT.md §§10, 13.1 and 16.2; no gap identified.
* **T6b3:** persistence and save helpers. Files: tests and source comments for
  `persistence-coordinator.ts`, `editor-save-scheduler.ts`, `save-policy.ts`,
  this plan and index. Acceptance: classify their remaining mutants and assert
  observable scheduling, retention, retry and save-accounting behavior.
* **T6b4:** remaining application collaborators. Files: application tests and
  source comments for clipboard/content/visual/runtime/text-session/undo-focus/
  expansion/visible-row helpers and store types, `stryker.config.mjs`,
  Development §12, this plan and index. Acceptance: complete remaining individual
  dispositions, reconcile any domain survivors newly exposed by timeout changes,
  measure full scores, and set `thresholds.break` just below the
  achieved full score. Split further if inventory cannot fit in one session.
  T10 follows this task.

* Run `npm run test:mutation` and compare with the T1 baseline.
* Kill survivors in this order: `src/domain/document-operations.ts`, `src/application/editor-command-transitions.ts`, `src/application/editor-history.ts`, `src/application/editor-store.ts`, `src/application/persistence-coordinator.ts`, `src/application/editor-save-scheduler.ts`, then the rest.
* Kill each survivor with an assertion on behavior, not on implementation. Mark an equivalent mutant with a Stryker disable comment that states why it is equivalent.
* Set `thresholds.break` in `stryker.config.mjs` just below the achieved score, so the weekly workflow fails on a drop.
* If the meaningful survivors will not fit in one session, split the task into T6a (domain) and T6b (application) in this plan before continuing.

Files: tests in `src/domain/` and `src/application/`, `stryker.config.mjs`, `docs/DEVELOPMENT.md` §12 (the threshold's meaning), this plan.

Acceptance: the plan records the score per file before and after. The break threshold is set. `npm run check` passes.

Validation tier: Low Risk (`npm run check`); Moderate Risk for any fix commit.

**T6a1 result (2026-10-01).** Added independent content and
range outcomes for deep clone content, fresh IDs, deletion of adjacent hyperlinks,
repeated-URL deletion, rich multiline paste, complete links through splits,
surrogate extremes, and visible selection below a current parent at depth two.
Link tests cover creation flags, edits at both endpoints, unrelated draft shifts,
scheme insertion, disjoint edit ordering, newline ranges, and independently
invalid bounds. A new property preserves both links between disjoint surrounding
edits. Saved-state tests independently reject malformed node fields, expansion
IDs, non-PNG references, and empty documents, while preserving accepted views
and locations. Summary tests check occurrence counts, sharing, and zero added
traversal of untouched nodes after membership-changing operations. All fixtures
are synthetic; no production behavior or product decisions changed.

Final `npm run test:mutation` completed in **2m54s** at HEAD
`1b3527972080f5f3cbd55268840566f7e2d71adc` with the final source/test inputs
identified by `sha256:98c2527d879a2d76a64c693cb12f2bab1153d0e89ce69ea4e19d533da072a2ba`
(subsequent edits before the run were documentation only). Its incremental report
reused 3386 results and retested 288 mutants. Full score is **84.46%**, compared
with T1 **80.30%**; 3003 killed, 100 timed out, 493 survived, 78 uncovered, and two
equivalent mutants ignored. This session's initial run scored 80.28%, with 623
survivors. The domain score rose from **82.16% to 92.03%**, with **235 to 105**
survivors. Application results are retained unchanged for T6b.

| Domain file | T1 score / survived | T6a1 score / survived |
| --- | --- | --- |
| `document-attachments.ts` | 86.57 / 9 | 94.03 / 4 |
| `document-index.ts` | 97.56 / 0 | 97.56 / 0 |
| `document-links.ts` | 74.39 / 104 | 88.70 / 54 |
| `document-operations.ts` | 76.79 / 101 | 91.24 / 33 |
| `document-serialization.ts` | 96.42 / 11 | 96.14 / 14 |
| `document-types.ts` | 100 / 0 | 100 / 0 |
| `product-messages.ts` | 100 / 0 | 100 / 0 |

Serialization's detected kills increased from 307 to 341 while timed-out mutants
fell from 43 to 8; the small score drop is recorded, not hidden by exclusions.
Timeouts and random property exploration can change dispositions across runs.
The two ignored mutants are the oversized sibling-count bound (both array
operations already clamp) and the surrogate endpoint guard's `&&` to `||`
replacement (a missing neighbor returns NaN). Equality and conditional mutators
stay enabled because their other replacements are meaningful.

**Outstanding domain inventory for T6a2:** 33 operation survivors and 11 uncovered
mutants; 54 link survivors and six uncovered; 14 serialization survivors; four
attachment survivors; and two uncovered index mutants. These are not all declared
equivalent. T6a2 must finish their individual dispositions and source rationale.
Known categories include redundant normalization/validation guards, allocation
and index-cache propagation, and invalid/internal defensive paths. The retained
report is ignored local evidence under `reports/mutation/`; regenerate it when
unavailable. The break threshold remains unset until T6b's final full measurement.

Development §12 now records sequential normal validation after sandbox cleanup,
checking a mutant's exact recorded expression, and avoiding a mutator exclusion
that also hides meaningful replacements. One standard-check attempt during a
mutation run failed by collecting sandbox copies, including Playwright files;
that attempt is invalid validation. A manual `selectedFound = true` scratch edit
failed the existing missing-node test and was restored; it did not demonstrate a
runner defect, since the reported survivor changed the separate redundant
`currentParentFound` flag. No scratch changes remain.

Validation: `npm run check` passed on HEAD
`1b3527972080f5f3cbd55268840566f7e2d71adc`, snapshot
`sha256:fa8c4beb7b338041be5c231cee1cc6909eb153887c0cf3936ba942d3040c60a8`:
84 files, 1421 tests (47 more than task-start HEAD), 11.61 s coverage suite,
production build, and zero audit vulnerabilities. Aggregate coverage is
95.65% statements / 90.26% branches / 96.67% functions / 97.96% lines.
The final standard check ran after sandbox cleanup. No unresolved suite failures.
Primary diff review found no meaningful issues after narrowing equivalent-mutator
exclusions. Runtime inputs and rendered states did not change; no E2E or screenshot
rerun was required at Low Risk. Final plan completion edits are documentation only
and are checked separately; they do not invalidate runtime validation.

**T6a2 result (2026-10-01).** Added 27 domain cases, including a generated
draft/URL offset property. Assertions cover URL sibling metadata, removal of
links inside a larger deleted interval, optional field absence, overlapping and
adjacent draft edits, repeated-prefix/suffix edits, token growth after separator
removal, disjoint link replacements, schema migration with extraneous old view
fields, a sole-node parent heading, seeded empty summaries, warm index reuse and
validation without constructing unused node copies. No runtime behavior changes,
new mutation exclusions, lowered coverage floors or product decisions.

The retained T6a1 report matched all domain sources at task-start HEAD
`2bc84db1d635362eb7e5dc386259f1f9ecfb6405` (authored by `abtv`,
2026-10-01, `test(domain): strengthen content and attachment outcome assertions`).
Every initial survivor/uncovered mutant and nine newly exposed survivors was
classified. IDs below refer to that report and were retained by the incremental
runs; the expression/function and rationale identify them independently of IDs.

| Owner and expression | Mutant IDs | Disposition and evidence |
| --- | --- | --- |
| Attachments: empty summary seed | 2168, 2169 | Killed by zero-traversal queries of a seeded fixture. |
| Attachments: nonempty ID guard | 2163, 2164 | Equivalent: the regex also rejects the empty string. Other replacements stay enabled. |
| Index: `requireNode` missing-node error | 2306, 2308 | Previously uncovered; killed by the exact error assertion. |
| Index: missing-ID fast rejection, undefined cursor, inclusive loop end, undefined slot conditional | 2263, 2269, 2278, 2286 | Newly surviving instead of timing out. Equivalent on immutable valid documents: the later guard returns undefined for a missing ID; cursors use `?? null`; the last iteration returns; derived path slots exist. |
| Index: absent/mismatched node guard | 2289, 2290, 2291, 2293 | Newly surviving instead of timing out. Internal defense against corrupted/shared-inconsistently indexes, outside the immutable-tree invariant. Retained and explained in source. |
| Operations: initial seed, shared indexes, range filter, sibling URL/plain metadata and absent attachments | 2852, 2991, 3026, 3039, 3043, 3066, 3075, 3076, 3079, 3080, 3081, 3082, 3084, 3250, 3307, 3318 | Killed by content, absent-property and zero-extra-traversal assertions. 3080–3082 were uncovered; 2991 newly survived an intermediate run. |
| Operations: heading fast path and null parent branch | 2960, 2963 | Equivalent: the next guard returns the same heading; searching for null in string ancestor IDs also returns -1. |
| Operations: empty link arrays in text edit, range removal and splits | 2989, 3041, 3217, 3268 | Equivalent: the injected string has no numeric range and is discarded by normalization/split filtering. |
| Operations: deleted-link filter and inclusive end comparisons | 3005, 3009, 3022, 3062 | Equivalent for normalized disjoint links: a deleted link becomes empty; another link cannot share its end; a retained range ending at a zero-width edit shifts by zero. |
| Operations: zero-width deletion branch and sibling nonempty text guard | 3032, 3077, 3078 | Equivalent normalized content; allocation differs for the no-op. `isHttpUrl` independently rejects empty strings. |
| Operations: surrogate endpoint guards | 3333, 3336, 3337, 3339, 3340 | Equivalent: a missing neighbor produces NaN and cannot pass surrogate comparisons. Meaningful guard replacements remain enabled. |
| Operations: missing ancestor slot, invalid parent location and missing moved node | 2900, 2971, 3237 | Internal defenses: `requireNode` derives slots from the same immutable tree; normal callers validate locations. No malformed state is invented to raise the score. |
| Operations: missing-slot errors, deleted-link fallback, moved-node errors and missing paste lines | 2904, 2912, 3007, 3239, 3241, 3271, 3273, 3284 | Uncovered defensive paths: located slots exist; a found link rules out absent links; dense lines and validated line/ID counts rule out missing lines. Sparse arrays and invalid internal paths remain unsupported. |
| Links: unchanged edit, optional draft absence, suffix bounds/comparison, containment, token overlap, draft remapping, overlap rejection, split filtering and candidate deduplication | 2383, 2388, 2406, 2407, 2408, 2409, 2411, 2412, 2414, 2445, 2532, 2534, 2552, 2555, 2558, 2562, 2570, 2665, 2693, 2694, 2696, 2698, 2707, 2715, 2718, 2719, 2757, 2758, 2760, 2764, 2768 | Killed by the independent outcomes and generated repeated-text draft property. |
| Links: host length and negative start guards | 2326, 2327, 2352 | Equivalent: URL construction already rejects hostless HTTP(S) URLs; the overlap pass also rejects negative starts. |
| Links: prefix bounds, including nested logical OR | 2393, 2394, 2395, 2396, 2398, 2399 | Equivalent for unequal strings: character comparison stops when one string ends. AST grouping preserves comparison under the nested OR mutation. |
| Links: pure append flag, final containment guard and empty arrays | 2422, 2448, 2431, 2580, 2591 | Equivalent: containment and the end/start equality imply pure append; `start <= oldEnd <= link.end`; malformed array junk fails range bounds. |
| Links: candidate strict endpoints and URL guard inside insertion | 2538, 2541, 2608, 2772, 2775 | Equivalent normalized output: recognized token boundaries are whitespace/string endpoints, preventing adjacent complete URL ranges; normalization revalidates inserted URLs. |
| Links: endpoint remapping equalities and insertion/replacement predicate | 2685, 2687, 2695 | Equivalent for retained links: `edit.end <= offset` makes a start equality imply the end equality; a nonempty edit ending at a retained link's end would split it first. For zero-width edits the replacement predicate equals the insertion predicate. |
| Links: native retained-range overlap guard | 2468 | Retained, **not declared equivalent** for arbitrary multi-site before/after changes. Native reconciliation models one contiguous edit. Disjoint edits use `replaceLinkedTextRanges`, whose independent tests preserve intervening URLs. Removing this guard can retain an unchanged embedded URL in a broad diff spanning edits on both sides; this unsupported input is named separately from equivalents. |
| Links: missing-character and missing-line fallbacks | 2516, 2526, 2735, 2745, 2795, 2798 | Uncovered: character loop bounds prevent missing lookups; production line callers supply dense split arrays and valid indices. Sparse/out-of-range line input remains unsupported. |
| Serialization: unused output construction, parent recognition, old-schema view and optional properties | 3463, 3472, 3578, 3579, 3584, 3603, 3676 | Killed by bounded field-read, sole-heading, migration and absent-property assertions. |
| Serialization: row-position type guard, roots array guard, parent-found fast rejection and undefined cursor | 3428, 3456, 3457, 3461, 3470, 3513, 3519 | Equivalent: `Number.isFinite` rejects non-numbers; `walkNodes` repeats the same array error; the selected ancestry cannot reach a missing parent even with the flag/check bypassed; cursors use `?? null`. |

All **58** mutants targeted by new assertions above are reported `Killed`,
including the five initially uncovered cases and the later index-sharing survivor.
The remaining inventory is **53** equivalents under the stated invariants,
**seven** internal defenses, **one** unsupported native multi-site overlap case,
and **14** uncovered defensive fallbacks. Source comments state the rationale;
no new mutator is suppressed, so meaningful replacements at the same expressions
stay active. The two T6a1 exclusions remain unchanged.

Final `npm run test:mutation` passed in **1m09s**, reusing 3505 results and
retesting 169 mutants. Source/test inputs: HEAD
`2bc84db1d635362eb7e5dc386259f1f9ecfb6405`, snapshot
`sha256:a1f030f7bac014f712c21625f09813d121b993bff446da5d0a767a649cc8e668`.
Subsequent edits are documentation and a wording-only correction to a test name;
assertions and runtime sources are unchanged. All recorded domain sources match
the final files. Full score **85.71%** (3069 killed, 80 timeout, 452 survived,
73 uncovered, two ignored); domain **95.18%**, versus T6a1 **92.03%**.

| Domain file | T6a1 score / survived / uncovered | T6a2 score / survived / uncovered |
| --- | --- | --- |
| `document-attachments.ts` | 94.03 / 4 / 0 | 97.01 / 2 / 0 |
| `document-index.ts` | 97.56 / 0 / 2 | 90.24 / 8 / 0 |
| `document-links.ts` | 88.70 / 54 / 6 | 94.54 / 23 / 6 |
| `document-operations.ts` | 91.24 / 33 / 11 | 94.22 / 21 / 8 |
| `document-serialization.ts` | 96.14 / 14 / 0 | 98.07 / 7 / 0 |
| `document-types.ts` | 100 / 0 / 0 | 100 / 0 / 0 |
| `product-messages.ts` | 100 / 0 / 0 | 100 / 0 / 0 |

The index score decrease records eight former timeouts now surviving, not lost
assertions. Application triage remains T6b: its final count is 391 survivors
(three undo-focus timeouts now survive), with no application edits. Timeout
dispositions vary with load. An initial raw-text synthetic replay overstated the
prefix OR mutant because it lost AST grouping; inspection of Stryker's logical
mutator corrected the rationale before final measurement. Development §12 now
records that replay rule. The sole development failure was an incorrect new
draft endpoint expectation (18 rather than 19), corrected before passing runs.
Focused `npx vitest run src/domain` passed at **209** cases. Final `npm run check`
passed at HEAD `2bc84db1d635362eb7e5dc386259f1f9ecfb6405`, snapshot
`sha256:836c1ef548b05eb499f5d3a701c9df0957dc81ed878a270c0d7723b01f736270`:
84 files, **1448** tests (27 added), **5.26s** coverage suite, successful
production build and zero audit vulnerabilities. Aggregate coverage is
**95.67 / 90.31 / 96.67 / 97.99%** (statements / branches / functions / lines).
This pass follows the test-name correction; an earlier standard pass also
succeeded. Normal validation ran after mutation sandbox cleanup. Primary diff
review found no meaningful issues after correcting the prefix-mutant rationale
and test-title wording. No exposed production defects or unresolved failures.
No runtime or rendered inputs changed, so E2E, performance runs and new
screenshots were not required for this Low Risk task. Final completion edits
are documentation only and checked separately; runtime results remain valid.

**T6b1 result (2026-10-01).** Added 16 application cases and strengthened subtree
paste location/focus assertions. New outcomes cover missing drag sources,
unchanged insertion slots, heading and final-row caret boundaries, horizontal
text movement, missing visible-row selections, empty boundary targets, ancestor
rejection, valid undo locations, nearest surviving ancestors, root fallback,
opaque IDs and full history-stack transfers with attachment reachability. No
production behavior, architecture or product decisions changed. No requirement
gap or exposed production defect; no additional mutation exclusions.

The retained T6a2 report matched both source owners at task-start HEAD
`78c0dc3b3602f9a638a39f948382867259c51a42` (author `abtv`, 2026-10-01,
`test(domain): complete mutation survivor triage`). Every one of their 39 initial
surviving/uncovered mutants is classified below. IDs refer to the incremental
report; expressions and owner names identify dispositions independently of IDs.

| Owner and expression | Mutant IDs | Disposition and evidence |
| --- | --- | --- |
| Command transitions: paste location, missing drag source, insertion direction/equality, heading/end caret, missing row, empty first/last targets, horizontal boundary, heading enter and invalid ancestor | 109, 158, 160, 162, 192, 202, 267, 280, 292, 293, 294, 297, 306, 320, 350, 383, 384, 385 | All 18 killed by independent transition outcomes. |
| Command transitions: missing inserted ID and missing deletion destination | 103, 415 | Defensive guards: cloning always requests a root ID; the enclosing sibling branch guarantees a destination. Retained and explained in source. |
| Command transitions: adjacent row optional access and missing-target guard | 237, 245 | Equivalent for dense visible rows: first/last branches prevent out-of-bounds lookup. Sparse visible rows are unsupported. |
| Command transitions: same-parent ancestor guard, container path index and missing path successor | 369, 374, 392 | Equivalent: same-parent requests also fail the later missing-successor guard; searching string IDs for null returns -1; a real ancestor/container has a successor. |
| Command transitions: defensive error messages | 106, 418 | Uncovered: valid cloning and sibling selection cannot reach their errors. |
| History: full-stack equality, fabricated ancestor candidate, reversed ancestor order and root location object | 538, 550, 599, 600, 614 | All five killed. Full-stack transfers retain every snapshot and attachment; root fallback uses the first root even when another valid opaque ID matches the mutation placeholder. |
| History: stack overflow guards | 537, 549 | Equivalent through the public API: begin bounds total retained entries and clears redo; undo/redo transfer one entry within that total. Changing > to >= is meaningful and killed. |
| History: null-parent lookup fast path | 594 | Equivalent: null cannot match a valid string node ID, so the lookup still returns undefined. |
| History: missing restored root | 610 | Internal defense: retained editor documents always have a root. Empty internal snapshots remain unsupported. |
| History: overflow release bodies and missing-root error message | 540, 552, 613 | Uncovered under the bounded-history and nonempty-document invariants above. |

Final `npm run test:mutation` passed in **1m05s**, reusing 3584 results and
retesting 90 mutants. Snapshot: HEAD
`78c0dc3b3602f9a638a39f948382867259c51a42`,
`sha256:e7297a869750f803fcab49a299e42f81be2124d01f9efc0254c0ca3bbb23f53e`.
Both recorded source owners match the final files. All **23** targeted mutants
are `Killed`. Remaining in these owners: eight equivalents, three internal
defenses and five uncovered defensive paths. No meaningful survivor remains
unclassified in this task's scope.

| Application file | T6a2 score / survived / uncovered | T6b1 score / survived / uncovered |
| --- | --- | --- |
| `editor-command-transitions.ts` | 92.66 / 25 / 2 | 97.55 / 7 / 2 |
| `editor-history.ts` | 88.12 / 9 / 3 | 93.07 / 4 / 3 |

Full score increased from **85.71% to 86.20%**: 3092 killed, 75 timeouts,
434 survivors, 73 uncovered and two ignored. Application score is **79.75%**,
with 370 survivors and 59 uncovered. Three domain-operation and two visible-row
mutants previously timed out and now survive; this load-sensitive variation is
retained in the report, not hidden. T6b4 must inspect the visible-row survivors
and reconcile the final full inventory before setting the break threshold. The
new domain dispositions to inspect are `document-operations.ts` IDs 2908
(missing root slot guard), 2955 (`isValidLocation` missing-parent guard set true,
a meaningful assertion candidate) and 3099 (sibling-insertion summary inheritance).
Their source owners are unchanged in this task. Visible-row IDs 2150 and 2151
remove the nonempty-child check; assess expansion-query cost as well as output.

Low Risk validation: `npm run check` passed on the same snapshot after mutation
sandbox cleanup: 84 files, **1464 tests** (16 added), **6.25s** coverage suite,
successful build and zero audit vulnerabilities. Coverage: **95.73 / 90.39 /
96.67 / 97.99%** (statements / branches / functions / lines). The earlier
focused `npx vitest run src/application/editor-command-transitions.test.ts
src/application/editor-history.test.ts` passed 47 cases before the final five
cases were added; the standard pass subsumes it. No failed or blocked validation.
Primary diff review found no meaningful issues. Runtime behavior and rendered
inputs did not change, so no new E2E, performance or screenshot run was required.
Final completion edits affect only plan documentation and are checked separately.
The exact next task is T6b2; its larger inventory warrants a fresh session.

**T6b2a result (2026-10-01).** Split T6b2 before implementation because its
201 surviving/uncovered mutants span distinct view, editing and lifecycle owners.
Added eight synthetic cases for current-parent cache invalidation, stale reader
disposal, caret preservation in unrelated branches, heading guards, distant
ancestor collapse, open-all, idempotent folds and idle saves. A deterministic
child-read counter guards root-level close-all against whole-tree traversal.
Runtime behavior, disk writes, interactive CPU and memory are unchanged; only
tests and explanatory source comments changed. No product decision, requirement
gap, production defect or new mutation exclusion.

All 18 initial view-state survivors are classified below. IDs refer to the
retained incremental report; method and expression identify each disposition.
Task-start HEAD was `1921c0f03af454597bf3d0ce0f6ae21a2b7e151f` (author `abtv`,
2026-10-01, `test(application): strengthen command and history mutation assertions`).
The initial and final recorded source both match their corresponding store files.

| Expression | Mutant IDs | Disposition and evidence |
| --- | --- | --- |
| Reader disposal, heading guard, collapse predicate and ancestor search, fold no-op guards, unchanged selection focus, persisted fold changes | 1034, 1045, 1049, 1050, 1052, 1073, 1078, 1082, 1089, 1093, 1097, 1102 | All 12 killed by independent state and save outcomes. |
| Root close-all fast path | 1070 | Killed by zero descendant reads after initialization; output-only assertions previously missed the extra tree walk. |
| State capture ready guard | 997 | Internal defense: normal store paths cannot request a document save before ready. Keep the guard; the private scheduler callback is not a supported public API. |
| Measurement undefined guard | 1004 | Equivalent: Number.isFinite(undefined) is false; the explicit guard also narrows the TypeScript type. |
| Omitted position versus an undefined position property | 1008 | Equivalent persisted data: JSON omits the undefined key. No requirement distinguishes these transient service-object shapes. |
| Toggle expansion no-op guard | 1056 | Equivalent: toggleNodeExpansion always adds or removes its ID and returns a new identity. |
| Close-all expansion callback | 1075 | Equivalent: every fold within the current location has been closed, so a false/undefined query yields the same nearest displayed selection; retained choices outside this location cannot hide its rows. |

Final `npm run test:mutation` passed in **7m46s**, reusing 2620 results and
retesting 1054 mutants. Snapshot: HEAD `1921c0f`,
`sha256:15c006a910a261aad74237d36d465ea973dfcb83f50d68a4c944cca81db7062c`.
All 13 targeted mutants are `Killed`; four equivalents and one internal defense
remain in this scope, with no uncovered mutants. EditorStore score rose from
**72.54% to 74.32%**, survivors **186 to 173**, uncovered unchanged at **15**.
Full score rose from **86.20% to 86.80%**: 3113 killed, 76 timeouts, 412 survivors,
73 uncovered and two ignored. Application score is **80.41%**, with 356 survivors
and 59 uncovered. Retesting outside this task also changes timeout dispositions;
T6b4 must reconcile its final full inventory rather than reuse old counts.
The earlier 7m10s mutation pass lacked the final traversal guard and comments;
only the final measurement above is acceptance evidence.

Low Risk validation: `npm run check` passed on HEAD `1921c0f`, snapshot
`sha256:ab05216d67ecfa45b481b3f152c020d8da2ab1eeb65e6f5311a90df285539301`:
84 files, **1472 tests** (eight added), **5.90s** coverage suite, successful build,
zero audit vulnerabilities and all governance checks. Coverage: **95.79 / 90.51 /
96.67 / 97.99%** (statements / branches / functions / lines). The first standard
check failed type checking because new assertions accessed ready snapshot fields
without narrowing the union; explicit ready-state type assertions and a type-only
import fixed it. These annotations erase during transpilation, so they do not
invalidate the mutation-tested runtime assertions. No unresolved or blocked
validation. Primary diff review found no meaningful issues. No executable source
or rendering change; no E2E, visual inspection, performance suite or independent
review role was required at Low Risk. Completion edits affect documentation only
and receive separate documentation checks.

**T6b2b1 result (2026-10-01).** Added 11 synthetic cases for the five-second
typing boundary, standalone replacements followed by typing, unchanged disjoint
edits preserving a session, missing-link returns, deletion of the second of two
links with the correct caret, deletion separated from preceding/following typing,
and locked replacements with recovery and locked complete-link deletion. Only
tests and explanatory source comments changed. No product decision, requirement
gap, production defect, mutation exclusion or performance change (disk writes,
interactive CPU and memory are unchanged).

Task-start HEAD `a0fac5a2496e72821b42d0987d203ebf79a4bff4` was authored by
`abtv` on 2026-10-01, `test(application): strengthen EditorStore view-state
mutation assertions`. The initial report matched the source. All 20 initial
mutants have dispositions; IDs remain stable in the final matching report:

| Expression | Mutant IDs | Disposition and evidence |
| --- | --- | --- |
| Idle session timer; locked single/disjoint replacement; unchanged disjoint edit guard; standalone multi-edit boundary | 1232, 1236, 1244, 1248, 1251 | All five killed by undo outcomes, including after successful persistence recovery. |
| Locked link deletion return/guard; missing-link optional access/return; matching the second link; ending typing before deletion | 1255, 1256, 1257, 1258, 1260, 1266, 1271 | All seven killed by return, document, caret and undo outcomes. |
| End before beginning another node's direct session | 1224 | Equivalent: begin replaces the active node and scheduleBoundary clears its prior timer. Survived the first run; timed out in the final run, which does not establish an assertion kill. |
| Default empty links changed to a string entry | 1238, 1246 | Equivalent: reconciliation/normalization drops the malformed entry; the absent stored link list still retains no ranges. Actual valid stored-link paths remain tested. |
| Explicit end before markNextEditStandalone | 1239, 1250 | Equivalent: marking standalone ends the session itself. |
| Missing-link early guard removed | 1264 | Equivalent output: the same lookup inside domain deleteLink returns undefined and the following guard returns false. It adds one bounded lookup, with no tree traversal or published change. |
| Domain deleteLink result guard | 1268, 1270 | Internal defense: the preceding synchronous lookup already found the same link on the immutable document. Removing the guard survives; its false return is uncovered because the branch is unreachable through supported store operations. |

Final `npm run test:mutation` passed in **7m32s**, reusing 2720 results and
retesting 954 mutants. Tested HEAD `a0fac5a` plus snapshot
`sha256:2c38918eae0259779d008e7ea9504c2f0e8e27c16ab4ebf6be9b764a558f08f5`
from `npm run validation:snapshot`. All 12 meaningful targeted mutants are
`Killed`. Store score rose from **74.32% to 77.19%** (532 to 543 killed,
12 to 22 timeouts, 173 to 154 survivors, 15 to 13 uncovered). Text-session score
rose from **53.57% to 75.00%**, with 13 to seven survivors. Full score rose
from **86.80% to 87.72%**: 3132 killed, 91 timeouts, 380 survivors, 71 uncovered
and two ignored. Application score is **81.82%**, with 328 survivors and 57
uncovered. Timeout changes contribute to these scores; the 12 targeted kills
are independently confirmed assertion failures. T6b4 must reconcile the final
full inventory, including domain and helper timeout changes.

The first 6m37s mutation run killed 11 targeted mutants; reviewing its survivors
identified the two-link caret assertion needed for 1260. The initial standard
check passed 1482 tests but preceded that assertion and is not final acceptance
evidence. Final Low Risk `npm run check` passed on the same runtime snapshot:
84 files, **1483 tests** (11 added), **9.79s** coverage suite, successful build,
zero audit vulnerabilities and all governance stages. Coverage: **95.86 /
90.59 / 96.67 / 97.99%** (statements / branches / functions / lines).
The final focused `npx vitest run src/application/editor-store.test.ts` passed
160 cases and is subsumed by the standard check. An initial new assertion
expected an empty links field that the domain omits; corrected before the first
mutation run. No unresolved failures or blocked validation. Primary diff review
found no meaningful issues. No executable source or rendering change; no E2E,
visual inspection, performance suite or independent review role was required.
Completion documentation edits receive separate formatting and documentation
checks. The next task is T6b2b2; its larger inventory warrants a fresh session.

**T6b2b2 result (2026-10-01).** Added 36 cases for navigation idle saves and
displayed-list versions, same-node navigation typing boundaries, unavailable
last-row motion, locked command results and recovery, inserted-word accounting
for text-bearing creation, independent depth and source-descendant rejection
errors, opaque text and node IDs, reorder caret placement and typing boundaries,
and attachment cleanup scheduling and undo retention. Depth and paste rejection
tests now assert each command independently so an earlier error cannot mask a
later missing error. `editor-store-reorder-cost.test.ts` guards zero transition
builds while locked and one after recovery, alongside real store state outcomes.
Only tests and explanatory source comments changed. No product decision,
requirement gap, production defect, mutation exclusion or performance change:
disk writes, interactive CPU and memory behavior are unchanged.

Task-start HEAD `18823db536965984011279ab6769f49ff6cbb4f2` was authored by
`abtv` on 2026-10-01, `test(application): strengthen direct editing mutation
assertions`. The retained report matched its source. All 69 initial mutants
have dispositions and retain their IDs in the final matching report:

| Expression | Mutant IDs | Disposition and evidence |
| --- | --- | --- |
| Unavailable last-row target; navigation typing boundaries, structural versions and idle saves | 1337, 1352, 1356, 1361, 1364, 1365, 1370, 1373, 1374 | All nine killed by focus/snapshot, undo and saved-location outcomes. |
| Creation locking and individual depth-rejection errors | 1377, 1383, 1395, 1396, 1402, 1409, 1426, 1428, 1430, 1431, 1432 | All eleven killed by return/state/ID consumption after recovery and independent error assertions. |
| Text-bearing creation content and word-volume accounting | 1413, 1418, 1419, 1420, 1422, 1423, 1436, 1441, 1442, 1443, 1445, 1446 | All twelve killed. Arbitrary text is inserted and counted, including literal diagnostic text; nine inserted words plus one trigger exactly one save. |
| Delete/put locking, default provenance, source-descendant rejection and independent paste errors | 1449, 1450, 1459, 1462, 1463, 1469, 1470, 1472, 1473, 1480, 1500, 1507, 1524 | All thirteen killed by state, return, opaque-ID, recovery and error outcomes. |
| Retained-ID typing boundaries, required cleanup, locked allocation avoidance and reorder caret | 1529, 1531, 1532, 1533, 1536, 1542, 1547, 1548, 1554 | All nine killed. Cleanup follows a save, preserves undo references, and does not run for case conversion or a locked deletion; locked reorder does not build a transition. |
| Typing boundaries where creation/put focuses a fresh ID or deletion removes the edited ID | 1384, 1390, 1404, 1415, 1438, 1455, 1482, 1509, 1540 | Equivalent for supported product input: the next edit targets a different ID, or intervening selection/undo ends typing. Direct edits of a nonselected node are outside that input flow. Source rationale is at `endTextSession`; retained-ID case conversion and reordering have explicit undo assertions. |
| Empty creation edit; malformed default link entries | 1411, 1434; 1414, 1437 | Equivalent: editing the fresh empty node to empty text is an identity operation; domain normalization drops malformed links. The literal empty-text comparisons remain enabled because other replacements are meaningful and killed. |
| Empty-text word accounting guard always true | 1417, 1440 | Equivalent: `noteChange(0, false)` repeats the pending/idle marking already performed synchronously by `applyStructural`. Nonzero counting and immediate-save replacements are killed. |

Final `npm run test:mutation -- --concurrency 4` produced the complete report in
approximately **4m28s**, reusing 3545 results and retesting 129 mutants. The server
restarted after the last progress output; recovery checked the completed JSON
and incremental reports, matching source, unchanged validation snapshot and
removed sandbox instead of rerunning the work. Tested HEAD `18823db` plus
`sha256:c4111d028123f44a49a368d17b8090fc727b06d420c873f011bd9208c4170c76`
from `npm run validation:snapshot`. All **54 meaningful targeted mutants are
Killed**, with **15 equivalent survivors**, no targeted timeouts or uncovered
mutants, and no missing IDs. Store score rose from **77.19% to 83.33%**:
543 to 603 killed, 22 to seven timeouts, 154 to 116 survivors and 13 to six
uncovered. Node-visual transition score rose from **72.05% to 80.35%**, with
57 to 38 survivors. Full score rose from **87.72% to 89.06%**: 3212 killed,
60 timeouts, 338 survivors, 64 uncovered and two ignored. Application score is
**84.70%**, with 274 survivors and 50 uncovered. Aggregate changes include
retested timeout outcomes; the 54 targeted kills are independently confirmed
assertion failures. T6b4 must reconcile remaining domain/helper timeout changes.

Earlier full passes identified missing same-node, cleanup and literal-input
assertions. Type checking caught two test declaration issues, corrected before
the accepted run. Primary review also identified the cost of the locked reorder
transition despite its redundant publication guard; the separate allocation
test kills that survivor. Final Low Risk `npm run check` passed on the same
runtime snapshot: **85 files, 1519 tests**, **6.07s** coverage suite, successful
build, zero audit vulnerabilities and all governance stages. Coverage:
**96.06 / 90.85 / 96.67 / 98.08%** (statements / branches / functions / lines).
The focused `npx vitest run src/application/editor-store.test.ts
src/application/editor-store-reorder-cost.test.ts` passed 196 cases and is
subsumed by the standard check. No unresolved failures or blocked validation.
Primary diff review found no remaining meaningful issues. The affected
navigation/focus inventory is covered; no new unsupported product combination
was introduced. No executable behavior or rendering change, so no E2E, visual
inspection, performance suite or independent review role was required.
Completion documentation receives separate formatting and documentation checks.
The next task is T6b2b3; continue it in a fresh session.

**T6b2b3 result (2026-10-01).** Added 24 cases in a `clipboard and history outcomes` block of `editor-store.test.ts`. They cover empty and writer-less copy/cut, locked cut result, a failed copy/cut not blocking a later paste, a paste waiting for a later clipboard write after an earlier one finishes, cut/paste/image paste finishing after a failed reload, paste before ready, paste ending typing, attachment retention during an attachment write, immediate save after image paste, empty text with an empty link list, pasted-word accounting at the cursor boundaries, undo ending typing, saves and cleanup after undo/redo, locked redo, and undo without a locatable change site. Only tests and explanatory source comments changed. No product decision, requirement gap, production defect, mutation exclusion or performance change.

Task-start HEAD `c6956e2470adb772132b3ccb30a95029ce5e2878` (authored by `abtv`, 2026-10-01, `test(application): strengthen navigation and structural mutation assertions`); the retained report matched its source apart from comment lines. The task covers `copy`/`cut`, `paste`/`pasteFromClipboard`, `undo`/`redo` and `applyHistoryState`; `applyStructural` onward belongs to T6b2c. All **44** initial mutants have dispositions (IDs from the retained report):

| Expression | Mutant IDs | Disposition and evidence |
| --- | --- | --- |
| Copy/cut guards, locked-cut result, pending-operation clearing | 1278, 1285-1288, 1292, 1295, 1296, 1298, 1323-1326 | All killed by writer-present empty selection, writer-less cut, locked cut result, failed-operation recovery and overlapping-write ordering. |
| Cut/paste finishing after a failed reload | 1306, 1570, 1588 | Killed: the non-ready check is the only guard before reading `location`. |
| Paste not-ready error, typing boundary, attachment retention, immediate save, empty-links guard | 1565, 1566, 1583, 1595, 1609, 1610 | All killed. |
| Pasted-word position clamp and previous character, word accounting call | 1615, 1616, 1618, 1620, 1621, 1623 | All killed by joined-word pastes at the end, past the end and inside a word, and a ten-word immediate save. |
| Undo/redo typing boundary, saves, cleanup, locked redo | 1625, 1632, 1633, 1637, 1642, 1643 | All killed. |
| `applyHistoryState` fallback location and focus | 1647, 1648, 1650, 1651 | Killed by typing and deleting a character in one session, which leaves no locatable change site. |
| Selected node missing after the cut write | 1311, 1313 | Internal defense: location normalization keeps the selected node in the document. Source comment added. |
| Empty text with a nonempty link list | 1605 | Equivalent for supported clipboard values: link ranges must be non-empty and inside the text. Source comment added. |
| Previous-character position guard at 0 | 1617, 1619 | Equivalent: index -1 reads as undefined. Source comment added. |
| `redo` session end | 1635 | Equivalent: a redo entry exists only after an undo ended the session, and any edit that restarts one discards the redo branch. Source comment added. |

Final `npm run test:mutation -- --concurrency 4` took **7m41s**, retesting 879 mutants, at HEAD `c6956e2` plus `sha256:5d41ad4ba7a39f14049db5d9b5161a1db5ad3000f2e3d1452880561a2ce3fbfc` (`npm run validation:snapshot`). The report left exactly the six equivalents/defenses above in the range; 38 of 44 are killed. Store score rose from **83.33% to 88.93%** (603 to 643 killed, 116 to 79 survivors, six to two uncovered). Full score rose from **89.06% to 90.20%**: 3254 killed, 60 timeouts, 300 survived, 60 uncovered. Application is **86.69%**; domain **94.99%**. Timeout dispositions elsewhere vary with load and are left for T6b4.

Validation: `npm run check` passed on the same snapshot: 85 files, **1543** tests (24 added), 8.96 s coverage suite, build, zero audit vulnerabilities, all governance stages. Coverage **96.12 / 91.05 / 96.78 / 98.08%**. The new block passed on its first run. Primary diff review found no meaningful issues. No executable behavior or rendering change, so no E2E, visual inspection, performance suite or independent review role was required.

**T6b2c result (2026-10-01).** Added 15 cases in a `lifecycle and persistence wiring outcomes` block of `editor-store.test.ts`. They cover a pending-edit finisher committing before the save an earlier change requests, a flush waiting for a clipboard edit started during its save, finishers skipped and the flush completing before ready, `reportError` before and after ready, quit-prompt publication and repeats, exactly one emission per initialization outcome (fresh, saved, failed load), typing ended and an idle save scheduled by `selectNode`, a cut and a text paste finishing after persistence locked, cleanup after a redo branch is discarded by a structural command, recovery published only when a success clears a failure, and the three-failure cleanup retry cap with each failure published. Only tests and explanatory source comments changed. No product decision, requirement gap, production defect, mutation exclusion or performance change.

Task-start HEAD `0f0a08ce1727f547232baffed73c5777433a7d38` (author `abtv`, 2026-10-01, `test(application): strengthen clipboard and history mutation assertions`); the retained report matched its source. Of the 47 mutants in the range, IDs from that report:

| Expression | Mutant IDs | Disposition and evidence |
| --- | --- | --- |
| Flush: first finisher pass, pending-edit loop condition, not-ready guard | 1112, 1120, 1127 | Killed by save-count, early-completion and uncalled-finisher assertions. |
| Flush: not-ready/locked return value | 1130 | Detected only by non-termination: the mutant makes the flush loop forever, so Stryker reports a timeout. The test that a pre-ready flush completes is the regression guard. |
| `reportError` guard and emission; prompt repeat guards; dismissal of an absent prompt | 1138, 1142, 1154, 1156, 1162, 1163, 1167 | All killed by snapshot-identity and emission-count assertions. |
| Initialization emissions (fresh, saved, failed) | 1181, 1192, 1197 | All killed. |
| `selectNode` typing boundary and idle save | 1204, 1208 | Both killed. |
| Cut/paste finishing after a lock; discarded redo branch via a structural command | 1657, 1660 | Both killed. |
| Success clearing a failure; emission when nothing changed; cleanup retry cap and failure emission | 1694-1700, 1708, 1709, 1710, 1717, 1720 | All killed. |
| Redundant `hasPendingChanges` guard | 1113 | Equivalent: `requestImmediateSave` returns early without pending changes. |
| Ready checks in the quit-prompt methods and `isPersistenceLocked` | 1147, 1164, 1736 | Equivalent: only a ready snapshot carries the flags. |
| `parsed.view` optional access and empty-list fallback | 1184, 1185, 1187, 1188 | Equivalent or unreachable: `parsePersistedState` always supplies a view. |
| `editText` default links as a string entry | 1211 | Equivalent: normalization drops the malformed entry (as 1238/1246 in T6b2b1). |
| Locked and prompt operands of the recovery check | 1701-1706 | Equivalent: locking and the prompt follow a failure that set `saveError`, and only the success path clears them. |
| Ready checks in `referencedAttachmentIds` and `handlePersistenceResult` | 1674, 1686 | Internal defenses: the coordinator reaches both only after capturing a ready state, and a store never leaves ready. |

Final `npm run test:mutation -- --concurrency 4 --mutate src/application/editor-store.ts` took **1m23s** at HEAD `0f0a08c` plus `sha256:8de71ff43e92d6f948f0e4a01d090fbfc141d47d283838d4c5793f77b910eb9e` (`npm run validation:snapshot`). Store score rose from **88.93% to 93.31%**: 643 to 671 killed, 79 to 47 survivors, uncovered two. Full score is **91.07%** (3282 killed, 64 timeouts, 268 survived, 60 uncovered); application **88.20%** with 204 survivors and 46 uncovered; domain **94.99%**. The ten timeouts in the flush and result-handling range are mutants that loop or hang; they count as detected, not as assertion kills. Remaining store survivors in this range are the equivalents and defenses above.

Validation: `npm run check` passed on the same snapshot: 85 files, **1558** tests (15 added), build, zero audit vulnerabilities, all governance stages. Coverage **96.19 / 91.13 / 96.78 / 98.08%**. The new block passed on its first run. Primary diff review found no meaningful issues. No executable behavior or rendering change, so no E2E, visual inspection, performance suite or independent review role was required.

**T6b3 result (2026-10-01).** Added 12 scheduler cases in the new `editor-save-scheduler.test.ts` (a manual clock drives idle saves, immediate saves, the volume trigger, failure accounting and cleanup retries), four new and one strengthened coordinator cases, three policy cases and one store case. Task-start HEAD `d940cf357d278c31910dee3a4c746e99ea18e870` (author `abtv`, 2026-10-01, `test(application): strengthen lifecycle and persistence wiring mutation assertions`); none of the three source files changed after the retained report was written. The report's JSON could not be parsed by `jq` (invalid surrogate escape), so the survivors were listed by running Stryker with a scratchpad config that sets `clearTextReporter.reportMutants`; that config is not committed and the project config is unchanged. Of 44 surviving/uncovered mutants at task start, 25 are killed and 19 remain:

| Owner and expression | Disposition and evidence |
| --- | --- |
| Scheduler: `registerSaveFailure` counting a non-save failure | Killed: three non-save failures never reach the limit, three save failures do. |
| Scheduler: word-volume guard `insertedWords > 0` (two mutants) | Killed: after a failed ten-word save, a change without inserted words does not save immediately and is saved at the idle interval (PRODUCT.md §16.1: only inserted words count toward the volume threshold). |
| Scheduler: `requestPolicySave` pending guard, timer clear and reset (seven mutants) | Killed: no save without a pending change; an immediate save cancels the armed idle save and clears the handle, so a later change arms a fresh one. |
| Scheduler: idle and cleanup-retry timer replacement (seven mutants) | Killed: a later change postpones the idle save; a later retry replaces the earlier one. |
| Scheduler: `clearTimeout(undefined)` guards in `cancelSaveTimer`, `requestPolicySave`, `scheduleIdleSave` and `scheduleCleanupRetry`, and the `&& saveTimer !== undefined` operand of the new retry guard | Equivalent: clearing an unarmed timer is a no-op, and a pending change with no armed timer (a locked editor) defers the retried cleanup anyway. Source comment added. |
| Scheduler: `handleDocumentSaved` missing-watermark guard | Internal defense: the coordinator captures a save before acknowledging it. Source comment added. |
| Coordinator: `discardPendingSaves` request reset, `flush` cleanup retry (six mutants), missing state guard, `requestAttachmentCleanup` retry flag after a failed cleanup | Killed: no extra result after a discarded save, an idle flush does nothing, a plain flush retries a failed or deferred cleanup without a save, and a missing state reports nothing. |
| Coordinator: initial `requested`, `workQueued` guard and its assignment | Equivalent through the public API: the saveQueue keeps runs serialized, so a missing guard only chains empty continuations. Source comment added. |
| Policy: CRLF normalization, longer replacement, repeated word (three mutants) | Killed. |
| Policy: loop bound `<=`, equality guard, `min` bound, prefix-loop guards, suffix bound on `next` (four mutants), `prefix === 0` operand, lone-CR normalization | Equivalent: the prefix loop stops at the first missing or differing character, an undefined neighbour counts as whitespace, and the suffix bound on `next` matters only when the inserted text is already empty. Source comment added. |

**Defect found and fixed (separate commit).** `scheduleCleanupRetry` replaced the armed idle-save timer. A change typed while an attachment cleanup was failing therefore lost its idle save: the retried cleanup deferred itself because changes were pending, and nothing re-armed the save until the next edit or quit. This broke the idle trigger of PRODUCT.md §16.1. Reproduced first through the real store (`editor-store.test.ts`, "saves a change typed during a failing cleanup at the idle interval, not only at the next edit") and through the scheduler (`editor-save-scheduler.test.ts`, "still saves pending changes at the idle interval when a cleanup retry is scheduled meanwhile"). Both failed before the fix and pass after; both failed again with only the production edit stashed. The fix returns early when a change is pending and a timer is armed: the idle save runs, and the coordinator keeps the failed cleanup requested, so that save retries it. No product behavior was decided: §16.1 already requires the idle save.

Final `npm run test:mutation -- --concurrency 4 --mutate <the three files>` took 55 s at HEAD `d940cf3` plus `sha256:36c8d7098125553c28301ce164a39fba5e549b683a36d9d79044be3851bff9f1` (`npm run validation:snapshot`, one untracked file):

| Application file | T6b2c score / survived / uncovered | T6b3 score / survived / uncovered |
| --- | --- | --- |
| `editor-save-scheduler.ts` | 81.73 / 18 / 1 | 94.50 / 6 / 0 |
| `persistence-coordinator.ts` | 83.33 / 12 / 1 | 96.15 / 3 / 0 |
| `save-policy.ts` | 82.43 / 13 / 0 | 86.49 / 10 / 0 |

Full score rose from **91.07% to 91.87%** (3317 killed, 63 timeouts, 241 survived, 58 uncovered); application is **89.59%** with 177 survivors and 44 uncovered. The measured sources predate the explanatory comments added afterwards, which changed no executable line.

Validation: `npm run check` passed on the same snapshot: 86 files, **1578** tests (20 added, 1558 at task start), build, zero audit vulnerabilities, all governance stages. Coverage **96.23 / 91.24 / 96.78 / 98.08%**. The first standard check failed only on Prettier formatting of the new test file, corrected before the passing run. No unresolved failures or blocked validation. The change touches persistence timing, so it is Moderate Risk; the affected persistence and idle-save behavior has real-store coverage, and the store-level test above exercises the real boundary wiring between coordinator and scheduler. No E2E, visual or performance run was required and none was made; those remain at their previous results.

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

Split on 2026-09-30 because this file has nearly 3,000 lines:

* **T8a:** migrate text-object deletion, Normal character deletion, WORD operator deletion, whole-text changes, counted backward deletion/case/puts, and character Visual case/change/puts. Use a local fixture over the T7 real store, rebuild the handler from the current node between keys, and synchronize its textarea after document edits. Assert document, register, mode, caret requests, and undo outcomes. Preserve callback mapping tests where the command itself is the contract. Files: `src/renderer/editor-input-handlers.test.ts`, this plan, and the index. Acceptance: migrated scenarios retain their prior coverage and add actual state assertions; count interaction assertions before/after; `npm run check` passes. Validation: Low Risk. No Product Owner decision reserved.
* **T8b:** review and migrate the remaining navigation, structural, image, session, clipboard, shortcut, surround/repeat, and text tests, including plain-text put ordering, empty-register puts, and Visual case caret destinations. Keep doubles for failure injection and pure callback command contracts, recording retained categories. Files: `src/renderer/editor-input-handlers.test.ts`, possibly `src/renderer/test/real-store-harness.ts`, this plan, and the index. Acceptance: record final assertion count and retained categories; `npm run check` passes. Validation: Low Risk for tests only; any exposed production defect follows the initiative's separate fix and validation rules. Product Owner decisions: any material requirement gap. T9 follows T8b.

Files: `src/renderer/editor-input-handlers.test.ts`, possibly `src/renderer/test/real-store-harness.ts`, this plan.

Acceptance: the plan records the interaction-assertion count before and after, and the categories kept. `npm run check` passes.

Validation tier: Low Risk (`npm run check`).

**T8a result (2026-09-30).** Migrated the named text-operation groups to real-store outcomes, with current-node handler reconstruction and explicit textarea synchronization. Whole-text `cc` and `S` now independently prove subtree and attachment preservation; counted edits and Visual mutations prove actual text, registers, mode, and undo, with counted edits also checking redo. Input-handler cases increased from 176 to 184. Interaction assertion occurrences dropped from 242 to 238 (`rg -c 'toHaveBeenCalled|mock.calls' src/renderer/editor-input-handlers.test.ts`); several removed assertions previously shared one line. T8a keeps native `preventDefault` contracts and whole-node Visual callback mapping contracts. The other double-based groups remain for T8b rather than being declared justified or migrated.

Validation: `npm run check` passed (79 files, 1300 tests, production build, zero audit vulnerabilities). Its source/test snapshot was HEAD `af197b32a321b32053f84c5ffe11a2cac0cc8fd4`, digest `sha256:bf193ab0f0258c90929cef4fc0fe07e56f1ba494a2177be7c7d7edbcc7d08747`. A final test-helper edit retained native-event assertions; affected stages were rerun at digest `sha256:6fafa3e93c0353ab5bb093f5b5d514ab5e3bfae520777e989e61d93e81dc6084`: `npm run typecheck:renderer`, `npx eslint src/renderer/editor-input-handlers.test.ts`, `npx prettier --check src/renderer/editor-input-handlers.test.ts`, and `npx vitest run --coverage` all passed (1300 tests, 4.97 s). Other aggregate stages remain valid. An earlier focused run failed on a new uppercase expectation that incorrectly included an unselected character; corrected before validation. No unresolved failures or exposed production defects. Primary diff review found no meaningful issues. No product decisions or production changes; no rendered inputs changed, so screenshots and E2E reruns were not required. Final documentation edits were checked separately.

**T8b result (2026-09-30).** Migrated the remaining mutating text examples, image deletion/put and cross-node transitions, counted navigation, child and sibling creation, subtree deletion and auto-repeat, counted forest puts, subtree puts, Normal undo/redo, plain clipboard shortcuts, and Replace Cut/Paste interruptions through keyboard and context menu to the T7 real-store harness. Sequences rebuild handlers from the selected snapshot node and refresh textarea text. Assertions cover actual text, tree ordering, fresh IDs, location, focus, registers, mode, explicit caret requests, and undo. Plain-text puts now act on the preceding put's resulting text. Replace Cut/Paste uses a known buffered edit supplied by the session callback; clipboard and separate undo steps prove commit-before-command ordering without reimplementing the renderer session owner. Fake timers own pending save timers. All 184 input-handler cases remain.

Interaction assertion occurrences decreased from **238 to 183**, measured with `rg -c 'toHaveBeenCalled|mock.calls' src/renderer/editor-input-handlers.test.ts` (initiative baseline: 259; T8a start: 242). This is an occurrence count for that expression, not a count of every possible spy assertion spelling. Reviewed and retained categories:

* Native event handling (`preventDefault`), preview callbacks, external link opening, and select-all notifications are themselves contracts.
* Whole-node Visual, viewport/boundary, fold, structural-repeat, and Insert/Replace callbacks belong to other renderer owners. Their argument forwarding, suppression, and mode effects are the handler contract; these tests do not claim real session or viewport integration. Same-node caret-only tests assert DOM and caret-authority outcomes over an inert store.
* Session interruption flags and callback-before-command ordering, focus synchronization requests, and text-session boundary notifications remain dispatch contracts. Replace Cut/Paste additionally proves real store and history outcomes.
* Command assembly clearing and non-dispatch assertions cover composition, bare modifiers, unfinished commands, unsupported commands, empty native selections, and caret-only/image operations. They verify that another owner receives no command.
* Plain application shortcut/event-to-command mappings retain forwarding assertions. Horizontal movement injects the store's success result to verify native-default handling independently of navigation rules; actual node navigation is covered by the migrated sequences and existing owner tests.

There are no positive mocked text-mutation or subtree-put assertions left. Surround stages in this file occur in command-suppression fixtures; actual surround outcomes remain covered by the existing Vim suites. No production or shared-harness changes, lowered coverage floors, product decisions, or requirement gaps.

Validation: `npm run check` passed on HEAD `a1b3d61fb94d32e1533842d44e2713e5ee11b804` plus test-file SHA-256 `2355e8fa7f2d1d18dfb856be4699651e541424115bb07eb148404c7cd2734ce8`: 79 files, 1300 tests, 4.97 s coverage suite, production build passed, zero audit vulnerabilities. Aggregate coverage: 95.48% statements, 89.78% branches, 96.56% functions, 97.89% lines. Development failures were fixture/expectation mistakes (initial textarea cursor, an absent snapshot field, a callback cursor after real navigation, and an image setup lacking its active-caret class); corrected before the final pass. No exposed production defects or unresolved failures. Primary diff review found no meaningful issues. No rendered inputs changed, so no new screenshot evidence or E2E run was required. Final documentation edits are checked separately and do not invalidate runtime validation.

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

**T9 result (2026-09-30).** Added `scripts/check-requirement-coverage.mjs`, its tests, and `npm run check:requirements` to the standard check. It parses numbered leaves and parents with their own text, conservatively treating nonempty own text as normative. Unnumbered subheadings remain part of their nearest numbered owner; fenced headings and comment metadata are ignored. It rejects unknown/malformed markers, duplicate or absent section inventories, and stale exemptions/boundary entries. TypeScript parses actual comment ranges so marker examples in strings, templates, or block comments do not count. Explicit exemptions cover §1 overview, §1.1 product priorities/governance, and §1.2 exploratory governance. The boundary list follows AGENTS.md §9, with 23 sections requiring E2E markers.

Mapped all **40** required numbered sections to existing tests, including unit rule evidence and real-boundary evidence. The only section without explicit dedicated evidence was §20.4: added `src/renderer/styles.test.ts` to guard against stylesheet keyframes, animations, and transitions that delay interaction feedback. Existing interaction tests cover immediate command outcomes. This establishes section-level traceability, not sentence-level assertion completeness. No T9b split was needed. Added scoped OpenCode allowances for the newly documented command and documented markers and limitations in Development §§9 and 12.

Acceptance: removing the sole §20.4 marker made `npm run check:requirements` fail naming §20.4. Renaming the heading to §20.5 made it fail with unknown §20.4 and missing §20.5. Both scratch edits were restored. Focused script/stylesheet tests passed (12 tests), including proof that unit/performance markers cannot replace E2E markers for boundary sections.

Validation: `npm run check` passed on HEAD `6f619fd25c5de3f9bccae1ee6246f4f45038833a`, snapshot `sha256:b9aa7d8db231dac77412ff1c603aad9ae2b6b53ed471ac7b5122e0f0a225eac3`: 81 files, 1312 tests, 5.38 s coverage suite, production build passed, zero audit vulnerabilities. Aggregate coverage: 95.52% statements, 89.81% branches, 96.56% functions, 97.89% lines. The initial aggregate attempt failed because the new documented command lacked an OpenCode allowance; corrected before the final pass. No unresolved failures, production/architecture changes, or product decisions. Primary diff review found no meaningful issues. E2E/performance edits are marker comments only; rendered inputs did not change, so no new E2E run or screenshots were required. Final documentation-only edits passed `npm run format:check:changed`, `npm run check:docs`, and `npm run check:opencode`; runtime validation remains valid.

### T10 — Closure

Record the final measurements (mutation score, test counts, suite durations, coverage) in the closure handoff. Confirm that `docs/DEVELOPMENT.md` §12 holds everything lasting from this plan. Remove this plan and its row in `plans/README.md`.

Validation tier: Minimal Risk (`npm run format:check:changed`, `npm run check:docs`).

## Next task

T1, T2, T3, T4, T5, T6a1, T6a2, T7, T8a, T8b, and T9 are done.
T6b1 (command transition and history survivor triage) is done.
T6b2a (EditorStore view-state survivor triage) is done.
T6b2b1 (EditorStore direct editing and text replacement survivor triage) is done.
T6b2b2 (EditorStore navigation and structural command survivor triage) is done.
T6b2b3 (EditorStore asynchronous clipboard and history survivor triage) is done.
T6b2c (EditorStore lifecycle and persistence wiring triage) is done.
T6b3 (persistence and save-policy survivor triage) is done, and fixed one defect in
`scheduleCleanupRetry`. T6b4 (remaining application collaborators and the break threshold) is the
exact next Ready task. The current report has 177 application survivors and 44 uncovered mutants;
regenerate it if missing and inspect its recorded source. T6b4 must also inspect the domain
survivors listed after T6b1 (`document-operations.ts` IDs 2908, 2955, 3099 and the visible-row
IDs 2150 and 2151). T10 closure follows T6b4.

## Resume prompt

```text
Continue the Test Oracle Hardening initiative (plans/test-oracle-hardening.md). Take its next Ready task.
```
