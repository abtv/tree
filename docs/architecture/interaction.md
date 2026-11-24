# UI Layer and Interaction State

## 8. UI Layer

React is responsible for presentation and user interaction.

The UI layer includes:

* React components;
* input handling;
* focus management;
* cursor management;
* rendering nodes;
* rendering the current-parent context;
* drag-and-drop interaction;
* visual feedback.

React components should translate user interactions into application commands.

They should not implement core tree manipulation rules.

For example, an `Enter` key handler should not directly manipulate the tree structure.

Instead, it should invoke the appropriate application/domain operation.

A top-level React error boundary wraps the application in `src/renderer/ErrorBoundary.tsx`. It catches render and lifecycle errors that would otherwise leave an empty window, logs diagnostics, and shows a fallback with a `Reload` action that restarts the renderer from persisted state. Errors from event handlers and asynchronous work flow through the application error surface rather than the boundary.

### 8.7 Shortcut Profile

`shortcut-profile.ts` is the renderer's single answer to "is this key event a primary-modifier shortcut". Two constant profiles, `apple` (Cmd) and `other` (Ctrl), also supply the bare-modifier key name, the left-modifier key code, the macOS-only context-menu click test, the word-motion modifier and shortcut labels. It has no React, DOM or Electron imports. `App` takes an optional `shortcutPlatform` prop (default `apple`, like `vimAvailable`), resolves the constant profile and passes it as an optional dependency, defaulting to `apple`, to the input bindings, the Agenda key handlers, the completion and command-panel hooks and the pointer handlers. The Electron entry point passes nothing. No module-level mutable state exists, and no key event allocates.

Performance assessment (PRODUCT.md §22.1): each primary-modifier test is one constant-time predicate call on a constant profile. The profile causes no state, writes, syncs or retained memory.

### 8.9 Drag and Drop

`src/application/visible-rows.ts` flattens a sibling list and its expanded descendants into preorder rows. `EditorStore` gives displayed top-level rows their real parent ID. `src/application/drop-targets.ts` resolves gaps over the visible rows with the dragged block removed into real parent IDs and post-removal insertion indexes. It supplies the levels available at each gap and rejects gaps inside the dragged block. `EditorStore.moveNodeToParent` commits the target as one undoable command and marks it pending for persistence. It opens the receiving fold and folds between the displayed parent and the destination, selects the moved node, keeps a focused node's caret, and moves the displayed location only when the node leaves it through the same rule `<` uses. It reports maximum-depth errors without changing the document and treats a destination inside the node or at its current position as a no-op. `moveNodeTo` delegates sibling reordering to that command.

One resolved drag state owns the interaction freeze: `resolveNodeDrag` in `src/renderer/node-drag.ts` folds the persistence lock and source-row availability into the gesture, and `use-node-list-drag.ts` projects that state into the body class, source-row marker, drop marker, pointer capture, invalid-target cursor, and caret suspension. The hook converts pointer geometry into a gap and level, uses `drop-targets.ts` to resolve its application target, and dispatches the completed move through `App.tsx`. The selected level controls the marker's inset using the shared row-indent value. A successful re-parent ends whole-node Visual mode in `App.tsx`; the Vim register and repeat state are renderer-owned, and a re-parent does not change them. The caret authority in `use-node-input-bindings.ts` suspends and restores the captured caret through `src/renderer/drag-caret-freeze.ts`; the drag layer never writes caret state directly. At or below the windowing threshold, the list renders every row.

The same resolved target state also handles row middles through `dropTargetOnRow`: it appends to the receiving node using a post-removal index and rejects the dragged block. `NodeRow.tsx` renders an accepting row's inset outline independently of gap markers. Both target kinds use the same release, no-op, cancellation, and store-command paths.

Breadcrumbs are a third variant of that resolved target. `breadcrumbDropTargets` supplies ancestor and document-root append destinations from the current location. `node-list-layout.ts` hit-tests segment widths across the toolbar height before row geometry, since pointer capture remains on the list. The hook projects its accepting breadcrumb ID through `App.tsx` to `LocationBar.tsx`, clears the projection on every gesture termination, and stops auto-scroll over the toolbar. Breadcrumb drops have no separate gesture state or command.

Dragging near the content edge auto-scrolls every overflowing list. The resolved dragging phase owns the animation loop and drop feedback, so a persistence lock or missing source stops both. A new press clears the previous target and scroll direction. Caret-freeze release belongs to the pointer-release owner. While dragging, the hook recomputes the target on each viewport scroll, including unwindowed lists. During a pending hold, a `pointerleave` with no pressed buttons is a browser hover reset; a real leave with the primary button held cancels the hold. Pure window math lives in `src/renderer/list-window.ts`; geometry and measurement helpers live in `src/renderer/node-list-layout.ts`.

If native pointer capture is unavailable, global listeners route active-pointer events outside the list through its move, release, and cancellation paths. Events inside the list are handled by React, so a release commits once. Losing established capture or window focus cancels the gesture. Escape cancels it from a window-capture listener. During an active drag the listener consumes the key, so document-level keyboard owners such as visible Find never act on it; a pending hold passes Escape on to the focused editor.

During an active windowed drag, `NodeList.tsx` also keeps the source row mounted at its measured offset when it leaves the viewport range, independently of the focused row. The extra source pin ends with the resolved gesture, so scrolling cannot discard the drag highlight or remount the source mid-gesture.

### 8.10 Expansion State

`src/application/expansion-state.ts` owns expansion choices per view ([ADR 0028](../decisions/0028-expansion-views-of-starred-nodes.md)): `expandedIds` is the active view, `viewOwnerId` names its starred owner (`null` for the root view), and `otherViews` keeps every inactive view: views of unstarred nodes for the session, and views of deleted nodes while undo or redo history holds the node.

A node leaves the document only through a recorded change, undo or redo. When `begin`, `undo` or `redo` records the published document, `departedViewOwners` (`src/application/expansion-view-retention.ts`) stores with that snapshot the view owners whose nodes the recorded document holds and its replacement lacks. That snapshot is the last history state that can restore them: older states that hold the node leave history first, because eviction removes the oldest entry and a change discards the whole redo branch, and removed ids never return through a change. When `EditorHistory` releases the snapshot, `releaseViews` drops those views unless the document holds the nodes again, as after the undo that restores the snapshot.

While Agenda is open, Tree keeps its view active even after the view's owner leaves the document; when that owner is released, the root view becomes active and Agenda's close activates the view of the Tree location. Find under Agenda keeps its opened Agenda folds through that switch.

History itself is never walked. Documents that share a node index hold the same nodes, so recording a text edit looks up no owner. Recording another change, an undo or a redo looks up each view owner at most twice, in the indexes of both documents; when the replacement's index is not built yet, building it walks that document once, as publishing the replacement usually does anyway. `EditorHistory` stores and releases only departed owners. A release that drops at least one view copies the map of inactive views once, at a cost proportional to the number of views.

`governingViewOwner` selects the nearest starred node among the current parent and its ancestors. `activateExpansionView` swaps the governing view in and creates a missing starred view from the nearest stored inherited view, keeping only the remembered ids whose parent chain in the node index reaches the owner. `EditorRuntimeState.replaceReady` activates the governing view for every published Tree state, skipping the lookup when the document, current parent and owner are unchanged. After loading, after Agenda closes, or after a view switch, it moves a selection the activated view hides to its nearest displayed ancestor; loading and closing Agenda pass the unnormalized location so that this check uses the right view. While Agenda is open the Tree view stays as it was, except that the root view replaces a released view. A drop or shift that changes the location opens no fold, because its receiving parent becomes the location, so its fold changes always apply to an unchanged active view. Fold helpers change only the active view.

`EditorStore` retains expansion across location changes, marks changes pending for persistence, and memoizes one visible-row list by document, current parent, and expansion identity. `NodeList.tsx` consumes that list for rendering, windowing, and measurement. A collapsed subtree costs one row regardless of its size. `NodeRow.tsx` renders the disclosure chevron separately from the circular enter control and focus marker; its `depth` prop drives row indentation. When a collapse hides the selected descendant, the store reselects the collapsing node. The renderer finishes pending edits before that collapse and clears whole-node Visual mode when either endpoint becomes hidden. Fold keys dispatch commands to the store; `zM` closes folds under the displayed rows and normalizes selection, and `zR` opens them. At the root level, `zM` clears every choice of the root view without walking the document.

---

## 9. UI State vs Document State

The application distinguishes between document state and transient UI/runtime state.

### Document state

Includes:

* tree structure;
* node text;
* node IDs;
* attachment references.

Document state is persisted.

### Runtime/UI state

May include:

* current parent;
* selected node;
* navigation stack;
* text cursor position;
* focus;
* drag state;
* undo/redo history;
* the mounted window of the displayed sibling list, its measured row heights, and drag auto-scroll state;
* the inline-expansion choices of the root view and of each starred node's view.
* Agenda origin, scope, captured Today, displayed week, occurrence selection, day folds.

Only the state explicitly required by the product specification should be persisted. The state that PRODUCT.md §16.1 lists as persisted, including the selected row's viewport position as `selectedRowTop`, is also written beside the document (§13). It remains runtime state in every other respect and never enters undo history.

Exact cursor position, focus state, navigation stack, undo/redo history, and the windowed list's mounted range and height table are runtime state unless the product specification changes.

Agenda presentation is runtime-only; explicit timeline fold choices are stored separately as described in §13. The save scheduler excludes the presentation and uses its captured Tree origin location instead of a selected Agenda occurrence. It suppresses Agenda viewport measurements and preserves the stored Tree row position. Closing restores the origin cursor with a fresh focus token; Tree expansion is unchanged.

### 9.1 Single-Owner Interaction State

Renderer-local interaction state follows a single-owner pattern. State that spans commands or events — the Normal-mode caret target and pending hyperlink-draft check, the Vim register and pending Insert or Replace session, the pending command with the last repeatable change, character find, and character Visual endpoints, the structural Insert session, and the drag caret-freeze record — lives in one pure owner module that stays free of React, DOM, Electron, filesystem, and store dependencies. `use-node-input-bindings.ts` holds one instance of each owner and is the single place that creates them and publishes the caret and mode (extracted handler modules receive the owners and may write the DOM, but never keep a copy of an owner's fact). Caret authority and deferred placement live in `caret-projection-state.ts`; the pending hyperlink draft is a hook-held ref updated by the extracted text handler. Handlers and components act through owner transitions — including owner-backed access-time handles where a handler needs direct field access — and must not keep a parallel copy of a fact or resynchronize it at each call site. When defects cluster around one state, multiple owners or scattered resynchronization calls are the design cause to check first. The pattern, its defect evidence, and its boundaries are recorded in [ADR 0014](../decisions/0014-single-owner-for-renderer-interaction-state.md).

### 9.2 Caret Projection

The hook's `applyCaretState` publishes a complete resolved Normal caret and projects it onto its registered input. Callers choose immediate projection, projection after the edited text renders, or preservation of a deliberate native selection. One bounded pending projection carries its node, focus token, and caret revision; native Insert/contenteditable scheduling also carries the originating element. A newer intent invalidates earlier work, and disconnected, replaced, or wrong-node work is consumed without projection. Mode changes invalidate deferred focus while retaining only a pending projection compatible with the destination mode. The deferred focus pass checks both the focus token and caret revision. Replace completion publishes the resolved cursor, including an explicit retreat when requested, so callers do not retreat the DOM separately. Composition start uses a preserving commit because it retains Replace mode and its native insertion position.

### 9.3 Character Boundaries

`text-characters.ts` resolves visible-character boundaries with the platform's Unicode grapheme segmenter. Document, link, store and DOM offsets are UTF-16. Normal horizontal movement, block-caret projection and Agenda stand-in carets share these boundaries; the caret authority normalizes published character positions without changing native Insert editing or tree navigation. Segmentation retains only the latest text and boundary array, so repeated motions on unchanged text reuse work and memory cannot accumulate with edit count. A new text costs O(node text); ordinary motion reads the cached boundaries. Boundary resolution causes no document writes, syncs or history entries of its own on the movement and caret-projection paths that share it. A serial long-node motion guard covers the shared path under PRODUCT.md §22.1.

### 9.4 Vim Repeat State

Vim repeat descriptors live in `VimCommandState.lastChange`. Structural descriptors capture the operated sibling span, shift levels or join spacing, and a put's immutable incoming payload and copy count. Replay resolves that exact span against the current node's actual siblings before invoking the atomic store command. Each iteration reports success to the keyboard handler, which stops counted replay at the first failure; successful iterations use the ordinary history and autosave path. Replay never derives incoming content from the live register.

Insert interruption consumes renderer-local plain and structural repeat bookkeeping through `vim-session-finish.ts`. Text commands share that rule across keyboard, context-menu, and native-paste adapters. Escape alone captures the completed session. Consuming the bookkeeping causes no document edit, disk write, sync, or history entry; it clears bounded session references in constant time and retains the previous repeat payload. The typing, clipboard, and structural-repeat performance guards cover the command work at scale (PRODUCT.md §22.1).
