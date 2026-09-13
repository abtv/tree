# Strengthen Performance and Coverage Assurance

Status: Active
Created: 2026-09-13

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

## Performance assessment to complete during implementation

Required by Product §22. Record final observations and tradeoffs in this plan:

* **Disk:** production save triggers, writes, syncs, attachment files, and cleanup scheduling should remain unchanged. Identify any unexpected difference and resolve it before completion.
* **Interactive CPU:** quantify first-summary creation, unchanged-summary retention/release, changed-summary work, undo/redo, and cleanup union materialization. Distinguish node count N, attachment count A, and retained history H.
* **Memory:** report the number and size of retained summaries for unchanged and changing attachment membership. Sharing should remove repeated equal-membership set copies on the common edit path; changed memberships may still have O(H × A) worst-case storage. Do not promise a stronger bound without implementing and proving it.
* **Guards:** record repeated baseline ranges, final budgets and rationale, deterministic reference-work guards, and the controlled regression experiments.

## Documentation and product coverage

Update Architecture §11 and related attachment sections to describe actual sharing, ownership, and complexity. Update Development §12 for corrected typing targets, metric names, budgets, attachment-heavy guards, and effective coverage floors. Historical completed plans may retain their original measurements; correct the current source-of-truth documents rather than rewriting history.

No product behavior change is intended, so Product requirements should remain unchanged. Record a requirement-to-test mapping for §10 history bounds and undo/redo, §§16–17 live/history/recovery attachment retention, and §22 performance assurance. Existing tests can satisfy unchanged requirements; add tests for newly introduced implementation risks.

## Execution checklist

* [ ] Verify baseline and reproduce the typing-target and repeated-summary-work findings with failing regression candidates.
* [ ] Correct benchmark targeting and misleading metric labels.
* [ ] Implement attachment-summary sharing and history ownership with unit/property and Electron scale coverage.
* [ ] Measure repeated performance baselines, tighten budgets, and demonstrate guard sensitivity.
* [ ] Enforce and verify both documented per-file branch floors.
* [ ] Update documentation, performance assessment, regression evidence, and requirement-to-test mapping.
* [ ] Remove temporary fault injections and inspect the diff for unrelated changes.
* [ ] Run `npm run check:full`; fix failures or explicitly report environmental blockers without claiming success.
* [ ] Mark this same plan Completed, add the completion date, and move it to `docs/plans/completed/` without creating a copy.
* [ ] Commit the implementation and provide the repository's required validation handoff.

Out of scope: new product features, release packaging, CI setup, new dependencies, broad refactoring, persistence/schema changes, backup archives, new autosave policy, or changing history depth. Implement this plan as one logical task in a new session; do not amend the earlier product-fix commit merely because this review followed it.
