# Windowed Rendering for Wide Node Lists

Status: Completed
Created: 2026-09-14
Completed: 2026-09-14

## Goal

Make typing latency independent of the number of displayed siblings, closing the follow-up deferred by Plan 0054. Plan 0054 bounded rendering and memory for wide documents but left typing at roughly 100 ms per keystroke at 30,000 displayed siblings because the entire list stays mounted. This plan is based on prototypes and measurements; the Product Owner approved the product-behavior decisions on 2026-09-14 before implementation started.

No domain, persistence, or data-model change is proposed. The change is confined to the renderer and, if approved, keeps the existing editing, navigation, drag-and-drop, undo/redo, and autosave behavior.

## Confirmed Measurements

All measurements use the existing typing harness (`perf/typing.spec.ts`): focus `Node 1`, type 104 characters, record wall-clock typing time, input-event turnaround, and paint latency over two animation frames. The wide seed places 30,000 siblings under one parent. Measured through the production build with the test-owned Electron harness on macOS arm64, Node v24.13.1.

| Variant | Typing (104 chars) | Per keystroke | Paint p95 |
| --- | --- | --- | --- |
| Current code (grid, 30,000 live textareas) | 22,118 ms | ~213 ms | 143 ms |
| Per-row subscriptions and structural list version | 21,471 ms | ~206 ms | 133 ms |
| Per-row subscriptions plus `display: block` instead of grid | 9,822 ms | ~94 ms | 74 ms |
| Windowed rendering (virtualization) | 133–138 ms | ~1.3 ms | 32 ms |

Interpretation:

* Per-row subscriptions alone do not help. A CDP CPU profile shows only single-digit JavaScript milliseconds per run; the cost is Blink layout, not React reconciliation. The existing memoized rows already keep React work small.
* A Blink trace attributes about 109 ms per keystroke to `Layout` at 30,000 rows with the current `display: grid` list. Removing the grid lowers layout to about 33 ms per keystroke but remains linear in the displayed count.
* A minimal Electron control page (30,000 rows, 20 typed characters) isolates the trigger: 30,000 live textareas cost 1,046 ms with a block list and 2,051 ms with a grid list, while 30,000 static text rows plus one focused textarea cost 96 ms. The cost is tied to tens of thousands of live form controls, not to row count or wrapping.
* Row heights vary with wrapped text, so the windowing prototype used a fixed 27 px estimate. It still measured ~1.3 ms per keystroke at 30,000 siblings and paint p95 of about 32 ms.

Supporting experiments that did not make typing independent: `content-visibility: auto` on rows reduced layout to about 15 ms per keystroke but added about 40 ms per frame of intersection computation across 30,000 rows and broke Playwright role locators for the focused textbox; `contain: layout` on rows did not reduce layout.

The prototype is not committed. Its renderer shape was: `EditorStore` gained `subscribeNode`/`getNodeSnapshot` and a structural version (incremented on structural document replacement, not on text edits); `NodeList` was memoized on the structural version; each `NodeRow` subscribed to its node by id; and the windowed variant rendered only the visible range plus an overscan of 12 rows with spacer elements for skipped rows.

## Proposed Architecture

Windowed rendering of the displayed sibling list, on top of the existing page layout:

1. Apply windowing only when the displayed sibling count exceeds a threshold. Proposal: 500 rows. Below the threshold the list renders exactly as today, so ordinary documents keep the current DOM, tests, and behavior.
2. Compute the window from the list's position in the window scroll (the page already scrolls; no nested scroll container is proposed) with a small overscan.
3. Track row heights by node id. Mounted rows are measured (for example with `ResizeObserver`); unmeasured rows use an estimate. Row text wraps, so heights depend on width; a window resize invalidates cached heights. Offsets are derived from the height table and used to size the leading and trailing spacers, so the scrollbar reflects the full list.
4. Pin the focused row into the mounted window even when it is outside the viewport, so a keyboard selection or a restored focus intent always has an input to mount and receive the caret.
5. Keep the per-row input mechanics unchanged for mounted rows. `NodeRow` stays memoized; whichever of the two measured mechanisms keeps the focused row current (re-rendering the mounted window, or per-node subscriptions) is chosen during implementation and must pass the performance guard.
6. Keep drag-and-drop semantics for the displayed level, adding edge auto-scroll so a drag can reach a position outside the mounted window.
7. Remove the single-column `display: grid` from `.node-list`. It provides no layout value once the list is windowed, and it was measured as a 2.2x layout cost at 30,000 rows in the unwindowed case.

The store change from the prototype (per-node subscriptions and a structural version) is optional and should only be carried if the implementation needs it to keep the mounted window out of the typing path. It is an application-layer addition; no snapshot shape, persistence, or domain change is required.

If the Product Owner does not accept off-screen rows being absent from the DOM, the recorded fallback is input-only mounting: keep every row in the DOM as static text and mount a textarea only for the focused row. The control measurement (96 ms for 20 characters with 30,000 static rows) suggests this could also be sufficiently fast, but it requires new click-to-caret placement and text-selection mechanics and was not prototyped in the application.

## Product Owner Decisions

Approved by the Product Owner on 2026-09-14, as proposed:

1. Off-screen rows are absent from the DOM above the threshold. Browser find-in-page and assistive technology expose only the mounted window, and selecting or copying text across off-screen rows requires scrolling.
2. Threshold: 500 displayed siblings. At or below it, behavior is unchanged, including find-in-page and accessibility.
3. Scroll behavior: keep the existing page scroll; no nested scroll container that fixes the location bar and current-parent heading.
4. Drag beyond the viewport: edge auto-scroll during a drag, so a sibling can be moved to an off-screen position on the displayed level.

## Implementation Outline

1. `src/renderer/NodeList.tsx`: window computation, spacer sizing, height tracking, focused-row pinning, drag auto-scroll, and threshold routing to the existing full-list path.
2. Extract the pure window and offset math into a small renderer module so it can be unit tested without a browser.
3. `src/renderer/App.tsx`: pass the focused node id and structural version; no product logic moves into the component.
4. Optional: `src/application/editor-store.ts` per-node subscriptions and structural version, if the mounted-window re-render path does not meet the guard by itself.
5. Keep `docs/ARCHITECTURE.md` §8, §9, and §19 accurate for whichever mechanism is chosen.

## Performance Assessment

Required by `docs/PRODUCT.md` §22.1 for state and persistence changes:

* Disk: no change. Save triggers, writes, syncs, and attachment work are untouched.
* CPU: above the threshold, typing work no longer scales with the displayed sibling count (measured ~213 ms to ~1.3 ms per keystroke at 30,000 siblings). Window computation runs on scroll, resize, and structural changes; it is bounded by the mounted window and the height table. Below the threshold, cost is unchanged.
* Memory: mounted DOM and subscriptions are bounded by the window and overscan. The height table holds one number per displayed node, bounded by document size, and is discarded with the list. History and persistence memory are unchanged.

## Tests and Guards

* `perf/typing.spec.ts`: add `wide-30000` with a typing ceiling derived from the windowed measurements and the existing paint budgets. It must fail on the current code and pass after the change.
* `perf/startup.spec.ts`: extend wide-shape startup coverage to 30,000 siblings.
* Unit tests for the window/offset math, including variable heights, the focused-row pin, width changes, and structural changes.
* Renderer component tests: the window updates on scroll; the focused row is mounted when out of view; the full-list path is used below the threshold.
* End-to-end tests above the threshold: keyboard navigation into an off-screen row, undo/redo while scrolled, drag-and-drop with edge auto-scroll, and typing near the window edge.
* End-to-end tests for dynamic row heights above the threshold: narrowing the window re-wraps rows, editing a row to wrapped text grows it, and an attachment image loading in a mounted row grows it; each scenario also checks that later rows shift, the list height reflects the measured heights, and keyboard navigation and row tiling stay correct.
* Existing renderer, domain, Electron E2E, and performance tests must stay green, including the current `wide-10000` and `large-100000` typing guards.

## Documentation

* `docs/ARCHITECTURE.md` §8/§9: describe the windowed list, the threshold, the focused-row pin, and the height model.
* `docs/DEVELOPMENT.md` §12: note the 30,000-sibling typing scenario.
* Record the final measurements, guard sensitivity, and validation in this plan. If approved, record the off-screen-DOM decision as an ADR.

## Validation and Completion

* Demonstrate the new guard failing before the change and passing after.
* Run focused renderer, performance, and Electron tests, then `npm run check:full` before committing.
* Update this plan with results, set `Status: Completed`, add the completion date, and move it to `docs/plans/completed/`.

## Results

### Implementation

* `src/renderer/list-window.ts` holds the pure threshold, offset, window, and edge-auto-scroll math. `src/renderer/NodeList.tsx` routes on the threshold: at or below it the full list renders as before; above it only the viewport window plus an overscan mounts, with leading and trailing spacers sized from the offset table. Mounted rows report their height through a `ResizeObserver` (unmeasured rows use the estimate, and a width change invalidates the table), the focused row is mounted outside the window with the same React key so React moves the same input instead of remounting it when the window catches up, and a drag near the viewport edge auto-scrolls the page.
* `src/renderer/App.tsx` passes the focused node id and the store's structural version. `EditorStore` advances `structuralVersion` on structural document replacement, navigation between levels, undo, and redo, but not on text edits or selection, so layout recomputation stays out of the typing path.
* `.node-list` no longer uses `display: grid`; windowed rows are laid out with spacers and the pinned row is absolutely positioned at its offset.
* The Product Owner approved the four decisions on 2026-09-14. `docs/PRODUCT.md` §20.1 records the behavior and ADR 0007 records the off-screen-DOM decision. `docs/ARCHITECTURE.md` §8/§9 and `docs/DEVELOPMENT.md` §12 are updated.

### Measurements

* Typing `wide-30000` (104 characters): 125–162 ms, about 1.2–1.6 ms per keystroke, paint p95 31.7–32.4 ms, paint maximum 33.2–34.9 ms. The plan's unwindowed baseline for the same shape was 10.3–22.1 s.
* `wide-10000` typing fell from 2.7–4.9 s to 124–138 ms. `large-100000` measured 161–168 ms.
* Startup `wide-30000` rendered in 242–307 ms across launches against its 2,500 ms ceiling; launch stayed within the shared 2,000 ms ceiling at 648–891 ms.

### Guard sensitivity

* With windowing disabled (threshold raised so every row mounts), `wide-30000` typed in 11,888 ms with paint p95 113 ms, failing the existing 100 ms paint budget before reaching the scenario ceiling. With windowing enabled it passes at 125 ms and paint p95 31.7 ms.

### Dynamic row-height coverage

* Three end-to-end scenarios cover height changes in a wide list: narrowing the window re-wraps measured rows while focus, values, and keyboard navigation stay correct; editing a row to wrapped text grows the row and the list height and moves later rows; and an attachment image loading when its row mounts grows the row, shifts later rows, and updates the list height.
* The image scenario exposed a measurement defect. The attachment button's bottom margin collapsed through the row box, so the `ResizeObserver` border-box height (183 px) was 6 px less than the row's layout advance (189 px), and every mounted image row left the offset table 6 px short of the flow. `display: flow-root` on `.node-row` contains the margin, so the measured height equals the layout advance. On the pre-fix build the regression test fails with a 6 px list-height mismatch and 6 px gaps between rendered rows; on the fixed build it passes.

### Validation

`npm run check:full` passed: type checking, linting, formatting, documentation governance, 469 unit/component/property tests with coverage (95.39% statements, 89.03% branches, 95.71% functions, 97.49% lines), production build, dependency audit with zero vulnerabilities, 104 Electron E2E tests including the six windowed-list tests, and 14 performance tests. No required tests were skipped and no validation failures remain.
