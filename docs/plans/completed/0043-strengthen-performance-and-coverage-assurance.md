# Strengthen Performance and Coverage Assurance

Status: Completed
Created: 2026-09-13
Completed: 2026-09-13

## Goal and scope

Address the four findings from the repository quality assessment: loose performance budgets, a typing benchmark that overrides its seeded selection, understated attachment-history costs, and missing documented per-file coverage gates.

The Product Owner requested this active plan for implementation by another model. This commit contains the plan only; the implementation checklist remains outstanding. These are implementation, validation, and documentation corrections within the existing architecture. Preserve all product behavior, including the 200-entry history limit, attachment retention, autosave triggers, and persisted schema. A numerical review score is not an acceptance criterion.

## Read before implementation

Read `AGENTS.md`, `docs/PRODUCT.md` §§10, 16–17, and 22, `docs/ARCHITECTURE.md` §§5, 11, and 13–14, and `docs/DEVELOPMENT.md` §§9 and 12.

Primary files:

* `perf/typing.spec.ts`, `perf/state.spec.ts`, `perf/fixtures.ts`, and `perf/startup.spec.ts`.
* `src/domain/document.ts`, `document.test.ts`, and `document.property.test.ts`.
* `src/application/editor-history.ts`, `editor-history.test.ts`, and `editor-history.property.test.ts`.
* `src/application/editor-store.ts` and its unit/property tests; `persistence-coordinator.ts` and its tests.
* `vitest.config.ts` and the relevant architecture/development documentation.
* Completed plans 0035, 0040, and 0042 for prior attachment-reference work and recovery retention.

Do not assume the O(1) claims in prior plans are accurate. Check the actual allocation and iteration paths.

## Review baseline

On 2026-09-13, `npm run check:full` passed with 365 unit/component/property tests, 92 Electron E2E tests, seven performance tests, and no audit vulnerabilities. Coverage was 96.72% statements, 90.59% branches, 96.56% functions, and 98.49% lines.

Measured performance on the review machine:

| Scenario | Observation | Current ceiling |
| --- | --- | --- |
| 10,000-node structural burst, 200 commands | 497.50 ms | 15,000 ms |
| State scenario typed burst | 182.23 ms | 10,000 ms |
| State scenario cleanup | 5.15 ms | 1,000 ms |
| Approximately 100,000-node typing | 168.20 ms wall clock; 32.10 ms paint p95 | 1,500 ms wall clock; 100 ms paint p95 |

These are observations, not new product requirements. The last typing observation measures the current-parent heading because the helper focuses the first textbox, overriding the selected child. Rebaseline after correcting the target.

## 1. Measure the intended typing target

### Evidence

`large-100000` seeds `currentParentId: 'r315'` and `selectedNodeId: 'r315c315'`, but `measureTyping` calls `getByRole('textbox').first().focus()`. Inside a parent, that textbox is the parent heading. The existing test still exercises a large document and a late root; do not describe it as proving nothing or as a reproduced product performance failure.

### Work and acceptance criteria

* Give each scenario an explicit expected input target. For the large scenario, type into the last child of the last root, as seeded. Keep target selection readable; avoid production test-only APIs.
* Before measurement, assert the expected field is focused. After typing, assert that field contains the inserted text and that the parent heading was not edited. Install timing instrumentation on that same field.
* First demonstrate the target assertion failing against the existing helper. Then correct the helper and demonstrate it passing. Preserve the count of 104 sampled keystrokes and existing paint assertions.
* Retain wide-1,000 and large-10,000 scenarios, making their intended target explicit as well.
* Do not label the input-event microtask sample as React commit latency. Rename the metric to describe what it measures, or remove it if unused. Keep end-to-end typing wall clock and two-frame paint latency as distinct observations and document their limitations.

## 2. Make performance budgets useful regression guards

### Work and acceptance criteria

* After fixing the typing target, run at least three independent performance-suite repetitions on supported macOS with a display. Record observed ranges, runtime versions, and enough machine context to interpret results, without personal machine identifiers.
* Tighten the state scenario's structural and typing ceilings using those measurements and an explicit allowance for ordinary run variance. As starting candidates, evaluate 2,000 ms for the 200-command structural burst and 1,000 ms for its typed burst. These are proposals to validate, not numbers to force through by changing workloads or weakening assertions.
* Review the cleanup and large-typing ceilings using their measured ranges. Record a reason for each retained or changed ceiling. Do not simply replace every ceiling with an arbitrary multiple of a single sample.
* Confirm the structural timing still includes all 200 commands, the typing timing includes the complete burst, and cleanup measures an actual scheduled cleanup after reference-changing work. Preserve save-count and visible-error assertions.
* Demonstrate guard sensitivity with a temporary controlled slowdown or a bypass of the relevant optimization. The affected guard must fail, and pass after restoring the implementation. Record the experiment and remove all injected delays/bypasses before final validation. Do not commit a test that merely asserts a budget constant equals another constant.
* Keep the Electron process ownership, serial execution, error observation, and bounded teardown guarantees. Never run separate Electron suites concurrently.

## 3. Bound repeated attachment-history work and document its real costs

### Evidence

`collectAttachmentIds` constructs a fresh `Set` from cached count keys. `EditorHistory.retain` stores that set and iterates every ID; `release` also iterates it. With A unique attachments and H retained entries, repeated unchanged attachment membership can retain O(H × A) set entries and perform O(A) work per history retention. H is bounded to 200, so this is not an unbounded history leak. Architecture §11 nevertheless claims retaining a snapshot and reading the live referenced set are O(1).

### Reproduce and implement

* Add a focused failing allocation/iteration guard for many distinct document snapshots whose attachment membership is unchanged. Exercise real domain text edits and history begin/undo/redo/eviction, not just repeated calls on one document object. Use deterministic counters or observable reference sharing instead of a fragile unit wall-clock limit.
* Reuse a stable immutable attachment summary across documents that share attachment membership. Keep `collectAttachmentIds`'s existing defensive-copy behavior for callers; do not expose a mutable cached `Set` through that API. An additional narrow internal read-only summary API is acceptable within the current domain/application boundary.
* Let history share summaries rather than copy the same IDs for every entry. Track how many retained entries use a summary, and update the union's per-ID counts when that summary first becomes retained or finally ceases to be retained. This allows repeated retention/release of an unchanged summary to avoid a full ID iteration. Keep the solution small; no persistent-collection dependency, command-history rewrite, or persisted metadata.
* Counts used for node attachment multiplicity and counts used for history reachability have different purposes. Preserve duplicate attachment references within a document, and overlapping IDs across different history summaries. Removing one reference must never release an ID that is still reachable.
* Preserve empty summaries, the first lazy collection, attachment insertion/replacement/deletion, subtree deletion, history eviction, clearing redo after a new edit, and undo/redo. Ensure new summary bookkeeping is released with its owners and cannot accumulate globally across discarded documents.
* Retaining a new or changed attachment summary may still cost O(A); document that honestly. Do not claim all commands become O(depth) or that copying a set is O(1). If measured evidence suggests the proposed sharing approach cannot safely fit the existing architecture, report the concrete obstacle before changing architecture or history behavior.

### Coverage and scale evidence

* Extend domain properties to compare reported attachment IDs with a full traversal after operations, including duplicate IDs. Preserve input immutability and defensive-copy tests.
* Extend history properties to compare its retained union with the union over actual retained snapshots through mixed undo/redo, eviction, and branching sequences. Add focused tests for shared and distinct summaries with overlapping IDs.
* Add a deterministic guard showing that many histories with unchanged attachment membership share their reference representation and avoid per-entry ID enumeration after first retention. Include release/eviction so an optimization of retention alone cannot conceal the same cost during release.
* Exercise an attachment-heavy workload at several sizes, including 10,000 unique attachment references and 200 retained entries. Record CPU and retained-reference/allocation scaling. A structural count guard is preferable to a machine-dependent heap threshold; any supplementary heap measurement must distinguish retained heap from temporary allocations.
* Add or extend a real Electron performance scenario that exercises attachment-bearing history through edits and undo/redo, with valid PNG fixture files if those attachments cross the filesystem boundary. Keep the deterministic large-count guard in the unit suite if writing thousands of fixture files would obscure the measured renderer work.
* Run the existing persistence, cleanup, recovery-backup retention, pending-paste, and shutdown E2E tests. No IPC changes are planned. If implementation does change a boundary, add focused runtime contract and real-boundary E2E coverage as required by `AGENTS.md`.

## 4. Enforce the documented critical-file coverage floors

* Configure explicit branch thresholds of 80% for `src/domain/document.ts` and `src/application/editor-store.ts`, matching Development §12. Preserve the existing global floors.
* Use the installed Vitest version's supported per-file/glob threshold syntax. Verify the paths actually match the intended source files.
* Demonstrate enforcement by temporarily setting one targeted floor above its measured coverage and confirming the coverage command fails for that file. Restore the approved 80% value and repeat for the other file. Record the evidence; do not leave impossible thresholds committed.
* Do not add tests only to raise percentages, exclude more source files, or weaken any existing floor. Update the development guide to describe exactly the enforced configuration.

## Final performance assessment

Required by Product §22.

* **Disk:** no change. Save triggers, write/sync behavior, attachment writes, and cleanup scheduling are untouched. The attachment summary and its refcounts are in-memory and renderer-process-local.
* **Interactive CPU (N = node count, A = distinct attachments, H = retained history entries):**
  * First summary creation for a document not yet in the weak cache is one O(N) traversal, unchanged from before.
  * Retaining or releasing an entry whose attachment membership is unchanged is O(1) once the summary is first seen; only the first retention and the final release each enumerate the summary's A IDs. This replaces O(A) work per retained entry.
  * A new or changed summary costs O(A) to build the copied count map (the honest bound; attachment addition/replacement, and subtree deletion still traverse the deleted subtree, as before).
  * Undo/redo use the same retain/release path plus the existing O(depth) location reconciliation.
  * Cleanup union materialization builds a `Set` from the live document's summary keys (O(A_live)), the history union keys (O(A_history)), and pending writes. It does not rescan the live document or retained snapshots.
* **Memory:** the history keeps one reference and one refcount entry per distinct summary. For unchanged membership across H entries this is one shared A-entry map plus H small entry objects instead of H copies of the A-ID set. The common editing path (text edits sharing a summary) no longer allocates an equal-membership set per retained entry. When membership changes on every entry, worst-case retained storage remains O(H × A); this plan does not claim a stronger bound.
* **Guards:** repeated baseline ranges, final budgets, deterministic reference-work guards, and the controlled regression experiment are recorded below.

## Measured baselines and final budgets

Three independent full performance-suite repetitions on macOS 26.6.2 (build 25G83), Apple M4 (Mac16,12), 10 logical CPUs, 16 GiB RAM, with a display, using Node 24.13.1, npm 11.8.0, Electron 44.3.0, Playwright 1.63.0, and Vitest 5.0.0. Ranges are min–max across the three runs.

| Scenario | Observed range | Final ceiling | Rationale |
| --- | --- | --- | --- |
| State structural burst (200 commands, 10,000 nodes) | 488.49–501.13 ms | 2,000 ms | Candidate accepted; ~4× headroom for run variance. |
| State typed burst | 185.10–187.08 ms | 1,000 ms | Candidate accepted; ~5× headroom, still catches a full-document regression. |
| State cleanup scan | 4.96–5.34 ms | 1,000 ms (retained) | The handler runs in the main process and includes filesystem work; the ceiling guards catastrophic O(history × document) rescans without being flaky. |
| Attachment-history edits/undo/redo (100/100/100) | 691.37–705.35 ms | 5,000 ms | New guard; generous margin for the Electron boundary while catching order-of-magnitude regressions. |
| Attachment-history cleanup scan | 4.75–5.67 ms | 1,000 ms (retained) | Same rationale as the state cleanup ceiling. |
| Typing `wide-1000` wall clock | 436.83–442.86 ms | not asserted | Observation; the 1,000-row display dominates and no product budget is set. |
| Typing `large-10000` wall clock | 102.39–127.85 ms | not asserted | Observation. |
| Typing `large-100000` wall clock (last child of last root) | 185.44–188.78 ms | 1,500 ms (retained) | Coarse end-to-end guard for the node index; the metric includes Playwright key dispatch. The corrected target is ~10% slower than the previous heading target (168.20 ms baseline); rebaselined. |
| Typing paint p95 / max | 32.0–33.2 ms / 33.3–34.7 ms | 100 ms / 250 ms (retained) | Existing per-keystroke paint assertions are unchanged and remain well inside budget. |
| `inputTurnaround` p95 | 0.1 ms | not asserted | Renamed from the misleading `commit*` sample; it measures the input event's microtask only. |
| Startup launch/renderer max | 352.68–589.64 ms / 95.1–128.1 ms | 2,000 ms / 1,000 ms (retained) | Existing startup budgets are unchanged. |

## Regression, enforcement, and sensitivity evidence

* **Typing target.** Before correcting the helper, `measureTyping` focused `getByRole('textbox').first()`. With the explicit target assertion, `wide-1000` failed with `expect(locator).toBeFocused()`: the selected child `Node 1` was `inactive` because the first textbox is the current-parent heading. After selecting the field by accessible name, all three typing scenarios pass and assert the field received the typed text and that the parent heading was not edited.
* **Attachment summary sharing.** `editor-history.test.ts` uses a counting `ReadonlyMap` to show that 200 retained entries sharing one summary enumerate it exactly once on retention and once on final release after all are evicted, while distinct summaries delay an ID's removal until the last reference is released. Another test shows path-copied documents from real text edits share one summary across 225 retained entries, and that a 10,000-ID summary is not enumerated per entry.
* **Guard sensitivity.** A temporary controlled 10 ms slowdown in `EditorHistory.retain` raised the structural burst to 2,646.82 ms, and the new 2,000 ms guard failed with `Expected: < 2000, Received: 2646.815625`. Removing the slowdown restored 497.54 ms and a pass. No injected delay remains.
* **Coverage enforcement.** Temporarily raising the `src/domain/document.ts` floor to 95% failed with `Coverage for branches (85.93%) does not meet "src/domain/document.ts" threshold (95%)`; raising the `src/application/editor-store.ts` floor to 95% failed with `Coverage for branches (83.84%) does not meet "src/application/editor-store.ts" threshold (95%)`. Both floors were restored to the approved 80%.
* **Pre-existing E2E race.** `e2e/persistence.spec.ts` recovery tests read the persisted attachment immediately after the paste, before the immediate document save necessarily completed. The failure reproduces on unmodified `HEAD` on this machine. Both tests now poll for the persisted reference, matching the existing pattern at `e2e/persistence.spec.ts:131`, and the persistence spec passes.

## Requirement-to-test mapping

* Product §10 (history bound, undo/redo): `editor-history.test.ts`, `editor-history.property.test.ts`, `e2e/history.spec.ts`, `e2e/editing.spec.ts`.
* Product §16 (live attachment retention, autosave policy): `editor-store.test.ts` (cleanup only after a reference-changing save; failed-save retention and retry), `e2e/persistence.spec.ts`, `e2e/shutdown-failures.spec.ts`.
* Product §17 (history attachment retention): `editor-store.test.ts` ("retains attachments reachable only through undo history during cleanup"), `editor-history.property.test.ts`, `editor-history.test.ts` summary-sharing guards.
* Product §17 (recovery attachment retention): `persistence-reliability.spec.ts`, `persistence.spec.ts` recovery tests, `file-services.test.ts`.
* Product §22 (performance assurance): `perf/typing.spec.ts`, `perf/state.spec.ts`, `perf/startup.spec.ts`, plus the deterministic unit guards and the enforced coverage floors.
* Attachment multiplicity, defensive copies, and summary sharing: `document.test.ts`, `document.property.test.ts`.

## Documentation and product coverage

Update Architecture §11 and related attachment sections to describe actual sharing, ownership, and complexity. Update Development §12 for corrected typing targets, metric names, budgets, attachment-heavy guards, and effective coverage floors. Historical completed plans may retain their original measurements; correct the current source-of-truth documents rather than rewriting history.

No product behavior change is intended, so Product requirements should remain unchanged. Record a requirement-to-test mapping for §10 history bounds and undo/redo, §§16–17 live/history/recovery attachment retention, and §22 performance assurance. Existing tests can satisfy unchanged requirements; add tests for newly introduced implementation risks.

## Execution checklist

* [x] Verify baseline and reproduce the typing-target and repeated-summary-work findings with failing regression candidates.
* [x] Correct benchmark targeting and misleading metric labels.
* [x] Implement attachment-summary sharing and history ownership with unit/property and Electron scale coverage.
* [x] Measure repeated performance baselines, tighten budgets, and demonstrate guard sensitivity.
* [x] Enforce and verify both documented per-file branch floors.
* [x] Update documentation, performance assessment, regression evidence, and requirement-to-test mapping.
* [x] Remove temporary fault injections and inspect the diff for unrelated changes.
* [x] Run `npm run check:full`; fix failures or explicitly report environmental blockers without claiming success.
* [x] Mark this same plan Completed, add the completion date, and move it to `docs/plans/completed/` without creating a copy.
* [ ] Commit the implementation and provide the repository's required validation handoff.

Out of scope: new product features, release packaging, CI setup, new dependencies, broad refactoring, persistence/schema changes, backup archives, new autosave policy, or changing history depth. Implement this plan as one logical task in a new session; do not amend the earlier product-fix commit merely because this review followed it.
