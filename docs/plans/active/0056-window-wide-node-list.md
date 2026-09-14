# Windowed Rendering for Wide Node Lists

Status: Active
Created: 2026-09-14

## Goal

Make typing latency independent of the number of displayed siblings, closing the follow-up deferred by Plan 0054. Plan 0054 bounded rendering and memory for wide documents but left typing at roughly 100 ms per keystroke at 30,000 displayed siblings because the entire list stays mounted. This plan is a proposal based on prototypes and measurements; the product-behavior decisions in "Product Owner Decisions Required" need approval before implementation starts.

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

## Product Owner Decisions Required

1. Off-screen rows are absent from the DOM above the threshold. Consequences: browser find-in-page and assistive technology expose only the mounted window, and selecting or copying text across off-screen rows requires scrolling. Approve, reject, or choose the input-only alternative.
2. Threshold value (proposal: 500 displayed siblings). Below it, behavior is unchanged, including find-in-page and accessibility.
3. Scroll behavior: keep the existing page scroll (recommended) rather than introducing a scroll container that fixes the location bar and current-parent heading.
4. Drag beyond the viewport: approve edge auto-scroll during a drag so a sibling can be moved to an off-screen position on the displayed level.

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
* Existing renderer, domain, Electron E2E, and performance tests must stay green, including the current `wide-10000` and `large-100000` typing guards.

## Documentation

* `docs/ARCHITECTURE.md` §8/§9: describe the windowed list, the threshold, the focused-row pin, and the height model.
* `docs/DEVELOPMENT.md` §12: note the 30,000-sibling typing scenario.
* Record the final measurements, guard sensitivity, and validation in this plan. If approved, record the off-screen-DOM decision as an ADR.

## Validation and Completion

* Demonstrate the new guard failing before the change and passing after.
* Run focused renderer, performance, and Electron tests, then `npm run check:full` before committing.
* Update this plan with results, set `Status: Completed`, add the completion date, and move it to `docs/plans/completed/`.
