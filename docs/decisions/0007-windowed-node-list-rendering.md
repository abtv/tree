# Windowed Rendering for Wide Node Lists

Status: Accepted
Date: 2026-09-14

## Context

Plan 0054 bounded wide-document rendering and memory by memoizing rows, but the entire displayed sibling list stays mounted. Measurements recorded in Plan 0056 showed that live form controls dominate typing cost: at 30,000 displayed siblings typing took about 100 ms per keystroke, and a Blink trace attributed over 100 ms per keystroke to layout even though JavaScript reconciliation was only a few milliseconds per run. Prototypes showed that mounting only the visible rows plus an overscan removes that cost.

Off-screen rows being absent from the DOM is user-visible: browser find-in-page and assistive technology expose only the mounted rows, and cross-row selection requires scrolling. The page currently scrolls as one document, and drag-and-drop reorders siblings on the displayed level. The Product Owner approved the product behavior on 2026-09-14; the quantity owner is `docs/PRODUCT.md` §20.1.

## Decision

Above the displayed-sibling threshold owned by `docs/PRODUCT.md` §20.1, `NodeList` renders only the rows intersecting the viewport plus a small overscan, and represents the skipped rows as leading and trailing spacers so the page scrollbar and scroll position still cover the full list.

* Off-screen rows are absent from the DOM.
* The focused row is kept mounted even when it is off-screen, so focus intents and keyboard navigation always have an input to mount and receive the caret. The mounted focused row keeps its node key so React moves the same DOM node instead of remounting it when the window catches up.
* Mounted rows report their height through a `ResizeObserver`; unmeasured rows use an estimate. Offsets are derived from one height per displayed node, so wrapped rows scroll correctly. Width changes invalidate cached heights.
* The page keeps its single document scroll; no nested scroll container is introduced.
* Dragging near the window edge auto-scrolls the page so a sibling can be moved to an off-screen position on the displayed level.
* The pure window and offset math lives in `src/renderer/list-window.ts`, outside React, so it is unit-testable without a browser.

At or below the threshold the list renders exactly as before, including find-in-page and accessibility. `EditorStore` exposes a `structuralVersion` in ready snapshots that changes only when the displayed node identities or order can change; the renderer uses it to keep layout recomputation out of the typing path.

## Consequences

Typing latency above the threshold no longer scales with the displayed sibling count. The renderer holds a height table with one number per displayed node and a bounded mounted DOM, both discarded with the list. Find-in-page, assistive technology, and cross-row selection see only the mounted window above the threshold; this is the accepted trade-off. The windowed path adds renderer state (scroll position, height table, auto-scroll) that is runtime UI state, not persisted. Removing the single-column grid from `.node-list` keeps list layout simple and avoids its measured layout cost at wide widths.
