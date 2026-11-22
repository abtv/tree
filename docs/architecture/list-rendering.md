# List Rendering, Measurement and Reveal

### 8.2 Active-Line Highlight and Rich Input Synchronization

`active-line-highlight.ts` projects the existing native caret or rendered synthetic selection marks into the selected row's full-width background tint. Text and textless day separators use one visual-line band. An image caret uses the image button's bounds plus its computed outline width and offset, or the loading placeholder's bounds without a frame. This projection never changes focus, native selection, application state or the document. `use-active-line-highlight.ts` owns one instance in App after the native caret commit pipeline, and AgendaView refreshes it after local synthetic caret commits. The owner reads only the current row, observes its input or image (the row while an image is absent), and retains one last geometry and one coalesced animation request. Single-line text uses its input bounds without measuring the caret. Multiline rich text uses live range rectangles; a multiline textarea uses one disposable mirror of its current text. The mirror copies individual computed font properties because Chromium can return an empty `font` shorthand when ligatures are disabled; inheriting body metrics would change wrapping and the measured caret line. Writes occur only when band geometry changes, with no persistence or document-scale traversal. Cleanup removes decoration, listeners, observer and pending work; the existing CSS still suppresses the tint for drag and whole-node Visual feedback.

`NodeInput` synchronizes rich editor markup during ref attachment, before registration and row measurement. `editor-dom.ts` compares the live HTML with the desired projection and replaces it only when they differ. Native edits that already match preserve their text nodes, selection and scroll anchoring. Composition suspends synchronization until it ends; real projection changes still use the existing selection restoration pipeline. The comparison scans only the mounted row's markup, retains no additional history or cache, and adds no persistence writes or syncs.

---

### 8.4 List Layout, Windowing and Measurement

`node-list-layout.ts` caches uniform estimated offsets with weak keys for immutable Tree and Agenda row arrays. Nonuniform measured heights request row-key indices; unmeasured layouts and heights matching the estimate need no identity lookup. The index grows through the row array only until all requested keys are found or the array ends. Later layouts and reopened views reuse that indexed prefix, so each row identity is read at most once per projection. First measurement of a distant row can still index the intervening rows.

Each layout applies current measured heights to a fresh numeric offset array; measured geometry is never cached across mounts, document edits, width changes or line-number changes. Cached storage scales with live projections and their indexed prefixes and is collectible with the row arrays. Numeric offsets remain linear in row count, while repeated measured-key lookup avoids document-scale string-map work. This adds no disk writes, syncs or persisted fields.

For measurements within the same row projection, `measuredScrollDelta` finds the first visible row in the old offsets and compares its new offset. Tree and Agenda publish that correction with the projected viewport, then apply the native scroll correction after React commits and before reveal or restoration. Pending correction lives in React state; a commit-only identity guard prevents replay. Tree rejects corrections across structural versions and Agenda across row projections. This adds a binary search per layout change and constant transient state, without mounting extra rows, traversing the document or adding a save channel. Existing coalesced viewport persistence still owns scroll-position saves.

Each correction captures the live native scroll position immediately before its synchronous layout transition. Tree flushes external measurement publication; Agenda rebuilds measured offsets in a layout effect. `scrollViewportAfterMeasurement` subtracts any native clamp caused by a smaller scroll extent before applying the remaining correction. It uses the captured position and new maximum, rather than treating intervening user movement as a layout delta. Tree consumes the previous correction before sampling another batch of mounted rows, so consecutive commits capture the corrected position.

Tree row refs register pending measurements; `NodeList` reads their geometry together in its layout effect after sibling editor refs have projected their content. This avoids alternating rich-content DOM writes and forced layout during view switching. The pending set is bounded by attached rows and cleared each commit. ResizeObserver retains ownership of later geometry changes. This changes no document state, writes, syncs or caret authority; measurement CPU remains proportional to attached rows.

Agenda also batches newly attached rows, measuring each complete `.agenda-entry` after sibling editor refs finish and before its existing offset, opening, restoration and edit-anchor effects. React batches the resulting measurement revision updates. Detached rows leave the pending set; later resize and image measurements retain their existing observer path. Agenda keeps its own viewport and caret owners. Same-machine comparisons confirmed fewer forced layouts and a smaller renderer working set; overall process CPU and input latency did not improve consistently across scenarios. The extra set is bounded by mounted rows, is emptied each commit and adds no writes or syncs.

The numeric offset array remains a full immutable layout snapshot. Profiles of wrapped text and image loading at large Tree and Agenda sizes showed a small absolute cost for rebuilding it compared with total renderer work. Incremental mutable offsets would add invalidation and snapshot-lifetime rules without a demonstrated interaction benefit; reconsider them only with new measurements identifying this work as a bottleneck.

The displayed list is rendered by `src/renderer/NodeList.tsx`, which composes memoized rows from `src/renderer/NodeRow.tsx`. Above the displayed-row threshold in PRODUCT §20.1, a fixed-height list mounts a viewport range plus overscan in the same sticky-anchor arrangement as Agenda. The scroll listener synchronously commits the new range and its offset together. Focused and dragged rows stay mounted as pins positioned relative to that range; keyed rows retain their parent and input when entering the range. A `ResizeObserver` records row heights, unmeasured rows use an estimate, and width changes invalidate measurements.

Tree resolves structural layout changes before committing the corresponding row window and tracks
the viewport even below the windowing threshold. Crossing that threshold therefore preserves rows
inside the resulting window instead of removing and recreating them through an intermediate range
computed from stale offsets. Row observation remains attached across ordinary renders; confirming
an estimated height records the measurement without invalidating unchanged offsets. These measures
bound transient DOM/layout allocation during repeated structural edits, add no writes or syncs,
and retain the row-height cache, its current published measurement snapshot, and one viewport record.
DOM measurements publish after commit; render reads that snapshot rather than mutable observer state.
Each Tree row contains its layout work without size or paint containment, so gutter markers,
focus feedback and wrapped content retain their existing bounds and overflow.

Tree and Agenda use two CSS grid columns: a hidden number-font sizer and the outline content. Both preference states retain the sizer, whose digit count comes from the full displayed list rather than the mounted window. Number glyphs and the selected-row background use that same font cell width. CSS caps editable/read-only text at 120 cells without capping row feedback. This adds no DOM polling or font-measurement loop. Tree derives a digit count from its cached row count; Agenda memoizes an occurrence count when its projected rows change. It adds constant retained state, no document copies, disk writes or syncs.

Windowed lists expose their last committed viewport origin as `data-window-start`. Navigation reveal projects row and caret rectangles back to document coordinates when native scrolling has advanced beyond that origin. This prevents repeated focus or image-growth corrections from treating deliberately retained paint as an unscrolled destination. The projection reads one ancestor rectangle and adds no subscriptions, retained rows or writes.

Tree height-observer updates commit synchronously so image growth expands the scroll range before later reveal observers run. Layout notification precedes viewport sampling, allowing the same commit to anchor to a reveal's resulting scroll position. Unmounted Vim destinations are measured inside the outline-content column, with the same available width as mounted rows.

`EditorStore` exposes a `structuralVersion` on ready snapshots that advances when the displayed node identities or order can change — structural document replacement, navigation between levels, undo, and redo — but not for text edits or selection changes. The renderer uses it to keep layout recomputation out of the typing path.

---

### 8.5 Line Numbers

`use-line-numbers.ts` owns the shared Tree/Agenda line-number preference and its
literal Control shortcut. The command panel uses the same setter. Both platform
entries read it before mounting the editor; Electron uses the existing boolean
preference store through validated IPC, and the browser uses its preferences
object store. It does not enter document state or history. Tree uses visible-row
indices; `line-numbers.ts` numbers projected Agenda node occurrences, independently
of the mounted window. Only rendered rows receive number elements.

Performance assessment (PRODUCT §22.1): each toggle writes one boolean preference,
with no document write or sync. Tree numbering is constant work per mounted row;
Agenda builds a bounded map only when its projection changes while numbers are
enabled. No per-edit history or unbounded cache is retained. Large-list rendering
coverage guards mounting bounds and numbering across window boundaries.

---

### 13.6 Selection Reveal

Keeping the selection in view (`docs/PRODUCT.md` §20.8) uses the geometry in `revealInViewport` in `src/renderer/scroll-viewport.ts` and the navigation lifecycle in `src/renderer/viewport-reveal.ts`. The focus effect in `use-node-input-bindings.ts` focuses the input with `preventScroll`, captures the reveal policy for that focus token and reveals the whole `.node-row`. Pointer input requests visibility rather than keyboard context; the policy stays fixed for deferred geometry corrections. `vim-viewport-motion.ts` marks H/M/L destinations before selection so their focus and caret projection never triggers scrolling, including fallback to clipped rows. Its `contextViewport` derives the area those commands choose from and drops context at document edges. The context unit comes from the root CSS custom property used by the row minimum; its measured value is reused until a viewport resize. Oversized-row start priority and document-edge snapping use that same context independently of row height.

The reveal lifecycle observes only its destination, the scrolling content and the fixed viewport. `NodeList.tsx` notifies layout subscribers after measurement/spacer changes commit, since a row can move without changing its own height. Corrections verify the current focus token and connected element and never rewrite focus or caret state. Wheel, touch and page-scroll input cancel the intent. Every correction also checks the current scroll offset before moving content, including layout and resize callbacks that precede native scroll delivery. An offset change outside the content-extent delta relinquishes the intent to explicit scrolling; native anchoring within that delta remains geometry settlement, with one pixel of rounding tolerance. New navigation captures its own initial offset and extent. An initial saved position leaves asynchronous alignment with `useScrollRestoration`, which retains its existing startup ownership. Cleanup disconnects observers and removes subscriptions. Performance assessment: no extra document mutation or direct disk operations; corrected scroll positions use the existing coalesced viewport-save scheduling, so a late correction can schedule another save if the earlier position was already saved. Geometry work is constant per focus, observer batch or layout notification, with three observed targets and one current intent regardless of document size. Existing large-list navigation scenarios guard latency and mounted-row bounds.
