# Wide Document Shapes and Sustained Memory Assurance

Status: Completed
Created: 2026-09-14
Completed: 2026-09-14

## Goal

Close the second quality-review finding: very wide displayed sibling lists were never measured beyond a few hundred rows, and sustained memory growth was not guarded. Measurement demonstrated two real costs, so the task fixes them and adds guards:

* Each structural history snapshot retained its own full node index, so memory grew with history depth times document size until the history bound was reached.
* `NodeList` re-rendered every displayed row on every keystroke.

The Product Owner reviewed the measurements and approved guarding the supported 10,000-sibling width now, with a follow-up for typing cost independent of displayed siblings. That follow-up is not part of this plan.

No product behavior change is intended. Typing, navigation, drag-and-drop, undo/redo, persistence, and the document schema are unchanged.

## Confirmed Measurements

Measured through the production build with the test-owned Electron harness:

* Memory before the fix: a 10,000-node document retained about 0.46 MB of node index per structural history entry and plateaued near 99 MB once history saturated. A 100,000-node document grew about 7.3 MB per structural cycle and gained about 291 MB across 40 cycles from an 18.8 MB baseline.
* Memory after the fix: the 100,000-node case stayed near its 18.8 MB baseline across 40 cycles; 40 undo and 40 redo steps each took about 320 ms while rebuilding restored indexes (about 8 ms per step). The 10,000-node plateau fell to about 6.8 MB with roughly 60 KB growth across 500 further structural cycles.
* Typing before the fix: `wide-1000` measured about 0.45 s, and wider probes showed paint p95 around 70–90 ms at 15,000 siblings.
* Typing after the fix: with the full list mounted, typing 104 characters measured about 0.21 s at 1,000 displayed siblings, 2.7 s at 10,000, and 10.3 s at 30,000. Per-keystroke cost is about 2 ms, 26 ms, and 100 ms respectively.

The remaining typing cost is React reconciling every displayed row on each snapshot update, even though the memoized rows skip re-rendering. Row memoization removes the per-row render work and improves paint, but per-keystroke reconciliation still scales linearly with the displayed sibling count. The approved guard therefore uses 10,000 siblings with a regression ceiling; making typing independent of the displayed sibling count is a separate architecture decision.

## Implementation

1. `src/renderer/NodeList.tsx`: extract a memoized `NodeRow` so unchanged rows do not re-render; keep drag state in a ref so drag start/end and list re-renders do not invalidate rows.
2. `src/renderer/App.tsx`: stabilize row callbacks with `useCallback` and pass a stable `renderInput`.
3. `src/renderer/use-node-input-bindings.ts`: return a stable bindings factory keyed by selection and composition state instead of a new function per render.
4. `src/domain/document.ts`: add `releaseNodeIndex(document)` to drop a document's derived index cache entry.
5. `src/application/editor-store.ts`: when a ready snapshot is replaced by a different document, release the previous document's index. History snapshots then keep only the document, and a restored snapshot rebuilds its index on the next lookup.

## Performance Assessment

Required by `docs/PRODUCT.md` §22.1 for state and persistence changes:

* Disk: no change. Save triggers, writes, syncs, and attachment work are untouched.
* CPU: per-keystroke row rendering no longer scales with the displayed sibling count; only the changed row re-renders. React still reconciles the full displayed list on each snapshot update, which is measured and guarded at 10,000 siblings. Releasing indexes adds one O(N) index rebuild when a restored undo or redo snapshot is looked up again (about 8 ms per step at 100,000 nodes measured); current-document command paths keep their existing cost and text edits still share the index through `shareIndex`.
* Memory: history snapshots no longer retain one full node index each. Retained index memory is bounded to the current and transitional documents instead of history depth times document size.

## Tests and Guards

* `perf/typing.spec.ts`: add `wide-10000` using the existing typing measurement and paint assertions, with a regression ceiling for the approved width. It fails before the fixes at the large measured cost and passes after them.
* `perf/startup.spec.ts`: add `wide-10000` to extend startup document-shape coverage.
* `perf/state.spec.ts`: add a sustained structural edit scenario that warms up below history saturation, forces and measures the renderer heap, runs further cycles, forces and measures again, records the plateau and growth metrics, and asserts bounded growth. The memory launch flags are opt-in through the performance harness.
* `src/domain/document.test.ts`: add a released-index test proving the next lookup rebuilds and still resolves the node.
* Existing renderer component tests, domain and application tests, Electron E2E tests, and the rest of the performance suite must stay green.

## Documentation

* `docs/ARCHITECTURE.md` §5: describe the index release on snapshot replacement and the rebuild cost when a history snapshot is restored.
* `docs/DEVELOPMENT.md` §12: note that the performance suite also measures the sustained-memory plateau.
* Record the measurements, guard sensitivity, and validation in this plan. The follow-up for typing cost independent of displayed siblings is proposed to the Product Owner separately and is not implemented here.

## Validation and Completion

* Demonstrate the new guards failing before their fixes where practical and passing after.
* Run focused renderer, domain, performance, and Electron tests, then `npm run check:full` before committing.
* Record the results here, set `Status: Completed`, add the completion date, and move this same file to `docs/plans/completed/` without changing its filename.
* Commit as `perf: bound wide-row rendering and history index memory` with the `Plan: 0054` footer.

## Results

### Implementation

* `NodeList` now renders a memoized `NodeRow` and keeps drag state in a ref, so list re-renders and drag start/end do not re-render unchanged rows. `App` stabilizes the row callbacks and `renderInput`, and the input-bindings hook returns a stable factory keyed by selection and composition state.
* `releaseNodeIndex` was added to the domain, and the store releases the replaced snapshot's index whenever a ready snapshot advances to a different document. History snapshots no longer retain one full index each; a restored snapshot rebuilds its index on the next lookup.
* `docs/ARCHITECTURE.md` §5 documents the release and rebuild; `docs/DEVELOPMENT.md` §12 records that the performance suite now measures the sustained-memory plateau.

### Measurements

* Memory: the 10,000-node sustained scenario now warms near 6.9 MB and moved by −0.16 MB across 250 further cycles. The 100,000-node probe stayed near its 18.8 MB baseline across 40 structural cycles, and 40 undo plus 40 redo steps each took about 320 ms, roughly 8 ms per restored snapshot.
* Typing after the renderer change: about 0.21–0.35 s at 1,000 displayed siblings, 2.7–4.9 s at 10,000, and about 10.3 s at 30,000. The approved guard covers 10,000 siblings; typing cost independent of displayed siblings remains a follow-up architecture decision.
* Startup `wide-10000` rendered in 415–878 ms across runs against its 2,000 ms scenario ceiling.

### Guard sensitivity

* The sustained-memory guard failed with index release disabled: warm 52.3 MB, final 98.5 MB, growth 46.2 MB against the 5 MB ceiling. It passes with the release enabled.
* The typing guard failed against the previous renderer: `wide-10000` typed in 10.16 s with paint p95 exactly 100 ms, failing the existing paint budget. It passes after the row memoization (2.7–4.9 s, paint p95 29–34 ms).

### Validation

`npm run check:full` passed: type checking, linting, formatting, documentation governance, 446 unit/component/property tests with coverage (96.60% statements, 89.92% branches, 96.70% functions, 98.55% lines), production build, dependency audit with zero vulnerabilities, 98 Electron E2E tests, and 12 performance tests. No required tests were skipped and no validation failures remain.

### Follow-up

Making typing cost independent of the displayed sibling count (through virtualization or per-row store subscriptions) was proposed to the Product Owner and deferred. It requires an architecture decision and its own plan; the 10,000-sibling guard and the measured bound recorded here are the supported assurance until then.
