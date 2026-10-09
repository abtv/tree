# Architecture

## 1. Purpose

This document describes the technical architecture of the application, the responsibilities of its major parts, and the boundaries between them.

The architecture should make the application easy to evolve over a long period of agent-driven development.

The architecture should remain as simple as possible while providing clear boundaries between:

* product/business logic;
* application orchestration;
* user interface;
* platform-specific functionality;
* persistence and filesystem access.

---

## 2. Technology Stack

The application uses:

* Electron for the desktop application shell and operating-system integration;
* React for the user interface;
* TypeScript as the programming language;
* Vite for the frontend development and build tooling.

Do not change the core technology stack without explicit Product Owner approval.

---

## 3. Architectural Layers

The application is organized conceptually into the following layers:

```text id="9j5t2a"
┌─────────────────────────────┐
│           UI                │
│          React              │
└──────────────┬──────────────┘
               │
               ▼
┌─────────────────────────────┐
│      Application Layer      │
│        Commands / Use Cases │
└──────────────┬──────────────┘
               │
               ▼
┌─────────────────────────────┐
│         Domain              │
│ Tree / Navigation / History │
└──────────────┬──────────────┘
               │
               ▼
┌─────────────────────────────┐
│       Infrastructure        │
│ Persistence / Clipboard /   │
│ Attachments / Electron APIs │
└─────────────────────────────┘
```

These are logical boundaries.

They do not require a separate npm package or process for every layer.

---

## 4. Domain Layer

The domain layer contains the application's core rules.

It must not depend on:

* React;
* the DOM;
* Electron;
* filesystem APIs;
* browser APIs;
* UI components.

The domain must be testable in a normal Node.js test environment.

The domain owns concepts such as:

* nodes;
* trees;
* node identity;
* tree manipulation;
* navigation state;
* sibling ordering;
* node splitting;
* deletion;
* undo/redo state and operations.

Product rules that determine how the tree behaves belong in the domain or application layer rather than in React components.

`agenda-projection.ts` derives day groups of node identifiers, scoped depths, and match/context roles from the immutable document. It is a domain foundation without a runtime entry point. Direct and subtree date sets are memoized in a weak map keyed by `TreeNode`; path copying invalidates only replaced nodes, so date recognition after an edit reuses unchanged branch summaries. Row generation still visits relevant branches for each day. The cache stores day sets rather than flattened row copies, permits collection with its node keys, and adds no persisted fields or disk operations.

---

## 5. Domain Model

The core document is an ordered collection of trees.

Conceptually:

```text id="9j1g2m"
Document
├── Root Node
│   ├── Node
│   │   ├── Child
│   │   └── Child
│   └── Node
└── Root Node
```

The document is the implicit container for top-level root nodes. It is not itself a node and is not persisted as a synthetic node. Top-level root nodes have no parent node.

A node contains:

```text id="d1d4ny"
Node
├── id
├── text
├── links?
├── attachment?
├── struckThrough?
└── children
```

The parent relationship is derived from the tree structure.

`struckThrough` is present, and `true`, only on a struck-through node (`docs/PRODUCT.md` §2.5); a normal node omits it rather than storing `false`. It belongs to the node alone and never changes its children. Every domain operation that rebuilds a node keeps it, and every operation that creates a node leaves it absent, which gives the split, join, copy, and move rules in §2.5. `toggleStrikethrough` changes one sibling range and path-copies only the route to it, like any other edit (§11).

`links` is a list of non-overlapping ranges into `text`. Each range stores its HTTP(S) URL, which must equal the text covered by the range. Version-one persisted documents without links are migrated in memory and are saved using the current format (§13).

The domain invariant `MAX_DOCUMENT_DEPTH` enforces the product depth limit defined in `docs/PRODUCT.md` §2.3, counting top-level roots as level 1. Domain creation, document assertions, and persisted-state parsing reject a document that exceeds the limit with the product operation error; the limit did not change the schema version.

`isValidLocation` (`document-operations.ts`) accepts `selectedNodeId` as the current parent itself or any of its descendants at any depth, not only a direct child, because inline expansion (`docs/PRODUCT.md` §2.4) can display and select a descendant several levels below the current parent while it stays the same. `document-serialization.ts` mirrors the same descendant-or-self rule for the pre-parse structural check. `normalizeVisibleLocation` walks a location back up to the outermost collapsed ancestor between the current parent and a deeper `selectedNodeId`, so the caret after a restart, a `zM`, or an undo that falls back to a recorded location always lands on a rendered row. A restored selection whose ancestors are all expanded is kept.

Do not store redundant `parentId` fields unless there is a demonstrated technical need and the data model is explicitly changed.

Lookups use a derived, in-memory parent index rather than a persisted field. `buildNodeIndex` maps every node id to its parent id (`null` for top-level roots); the same single traversal also records each node's index within its sibling list. `locateNode` walks the parent chain and then descends each level by direct sibling index, so a lookup costs O(depth) instead of a full traversal or a per-level scan. The index is memoized in a weak map keyed by the immutable document object, so a document keeps its index across text edits and renders. When the editor replaces a document snapshot, it releases the replaced document's cache entry, so history snapshots retain only the document rather than one full index each; restoring a snapshot rebuilds its index on the next lookup. The index is never part of the document object or the persisted JSON.

Node IDs are stable identifiers.

Changing a node's position must not change its ID.

The public `Document`, `TreeNode`, `LinkRange`, and `AttachmentReference` types are read-only: roots, children, links, and scalar fields cannot be reassigned, so application, renderer, and test callers cannot mutate a live snapshot or a history entry through the type system. Domain operations build new nodes internally and return them as read-only trees.

---

## 6. Domain Operations

Domain operations should represent meaningful changes to the document rather than UI events.

Examples include:

```text id="b2x3cl"
createNode
splitNode
deleteNode
deleteSubtree
moveNode
pasteText
pasteMultilineText
attachImage
removeAttachment
enterNode
leaveNode
undo
redo
```

Sibling creation, splitting, pasting, editing, and reordering do not increase node depth and remain available at the maximum depth defined in `docs/PRODUCT.md` §2.3. A rejected child creation is an explicit application transition result, so callers can present the operation error without changing the document, location, focus, history, generated IDs, or persistence queue.

`moveSubtree` moves a node with its subtree under any parent, or to the document root, at a given index counted after the node is removed from its old place. It reports `impossible` for an unknown ID or a destination inside the moved subtree, and `too-deep` when the subtree would exceed the maximum-depth limit. It copies only the two affected root-to-array paths and carries the attachment summary over, so a move shares every other subtree with the previous document.

The exact API and naming may evolve.

The important principle is that product behavior should be represented by explicit operations rather than being scattered across UI event handlers.

---

## 7. Application Layer

The application layer coordinates user intentions with domain operations and infrastructure.

It is responsible for use cases such as:

* executing commands;
* coordinating domain changes;
* triggering persistence after changes;
* coordinating clipboard input;
* coordinating attachment storage;
* maintaining application-level state that is not part of the document itself.

The application layer may depend on the domain.

The application layer may use infrastructure interfaces.

The editor command coordinator composes focused collaborators for runtime snapshot history and queued persistence. History owns document snapshots and undo/redo location reconciliation. Persistence owns serialized document-save and attachment-cleanup scheduling, while receiving current state and referenced attachment IDs through narrow application-layer callbacks. This keeps editor commands independent from queue mechanics without moving product rules into infrastructure.

External hyperlink opening is handled by the Electron shell. The renderer renders editable link anchors and updates their destination from valid edited text, while the main process validates HTTP(S) URLs and delegates approved URLs to the operating system's default hyperlink application.

The main process treats the preload API as an untrusted boundary: every IPC call must originate from the configured application renderer, and IPC arguments are validated at runtime before filesystem, clipboard, or application operations run. Renderer navigation is restricted to the packaged renderer document (or the configured development renderer URL), while external links open only through the validated shell path.

Attachment writes are limited to validated IDs, PNG data, a bounded payload size, and a bounded decoded image size.

Before application shutdown is allowed to complete, the main process asks the renderer to flush its queued persistence work. The renderer then acknowledges shutdown through the trusted IPC path. PNG attachment writes validate the PNG signature, chunk structure and CRCs, require image data, enforce a maximum of 32767 pixels per side and 64 megapixels in total before decoding, and decode the image through the platform image decoder before bytes are stored. The decoded-size bound prevents a small, highly compressible payload from forcing an unbounded synchronous native bitmap allocation. The decoder is injected into the IPC handler so the validation rule remains unit-testable while Electron's `nativeImage` decoding stays in the main process.

The shutdown handshake uses a request ID, suppresses duplicate requests, and times out after five seconds. A timeout or renderer-reported persistence failure cancels shutdown and surfaces an error instead of forcing a potentially lossy exit.

The application layer must not contain React components or JSX.

The Agenda store foundation uses `agenda-state.ts` for pure runtime transitions and `agenda-rows.ts` to compose the domain date projection with the compressed timeline and occurrence folds. `EditorStore` owns one row cache and publishes Agenda selection with real-node location and focus atomically. Rows carry node IDs rather than captured node content, so unchanged date membership can reuse their identities while the document supplies current text. No renderer entry point exists at this stage. The runtime reconciliation seam currently preserves Agenda state; document-edit reconciliation belongs to the later editable Agenda integration. See [ADR 0020](decisions/0020-agenda-derived-projection-and-runtime-view-state.md).

Performance assessment for Agenda state (`docs/PRODUCT.md` §22.1): opening, selection, folds, and gap reveal cause no document writes or syncs and add no undo snapshots. Saves already pending capture the Tree origin location and viewport while Agenda is active. Today is sampled once on open. With Agenda closed, runtime publication does no projection work. With it open, projection reuses immutable-node date summaries; a text edit rescans the changed path, but projection and semantic comparison still scale with dated occurrences and their ancestors. Rows are rebuilt only when that projection, Today, folds, or revealed days change. One store cache retains only its latest document and projection; closing releases them, while domain summary caches have weak keys. The application guard uses a wide dated document to assert a single rescan and stable row-array identity after a same-date keystroke.

---

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

`AgendaView.tsx` renders the store's derived Agenda rows instead of the Tree heading and list. Its rows use occurrence keys and `.agenda-row`, separate from `.node-row` DOM queries used by Tree caret and viewport handlers. Read-only row keyboard handling lives in `agenda-row-keyboard.ts` and shares the input hook's Vim command-state owner. The input hook stays mounted to retain editing state, but receives no Tree focus while Agenda is open. Tree scroll restoration and viewport-save listeners suspend during Agenda; closing issues a fresh Tree focus intent. Date labels use domain calendar arithmetic rather than timezone-sensitive formatting.

Agenda windowing reuses `list-window.ts` and the key-based layout helpers in `node-list-layout.ts`, leaving `NodeList` unchanged. `agenda-list-layout.ts` selects the viewport range and optional selected occurrence pin. Heights and DOM elements are keyed by occurrence, not real node id; row changes prune obsolete measurements and width changes invalidate them. Cached offsets rebuild on row or measurement changes, while selection and scrolling reuse them. The selected keyed row remains in the same React parent when switching between the viewport and absolute pin; layout notifications let the existing viewport-reveal owner settle its position after measurement.

They should not implement core tree manipulation rules.

For example, an `Enter` key handler should not directly manipulate the tree structure.

Instead, it should invoke the appropriate application/domain operation.

A top-level React error boundary wraps the application in `src/renderer/ErrorBoundary.tsx`. It catches render and lifecycle errors that would otherwise leave an empty window, logs diagnostics, and shows a fallback with a `Reload` action that restarts the renderer from persisted state. Errors from event handlers and asynchronous work continue to flow through the application error surface rather than the boundary.

The displayed list is rendered by `src/renderer/NodeList.tsx`, which composes memoized rows from `src/renderer/NodeRow.tsx`. Above the displayed-row threshold owned by `docs/PRODUCT.md` §20.1 it mounts rows near the viewport plus an overscan and represents skipped rows as leading and trailing spacers. The focused row stays mounted when it is off-screen so a focus intent always has an input; keyed rows move into the window rather than remounting. A `ResizeObserver` records mounted row heights, unmeasured rows use an estimate, and a width change invalidates those measurements. Dragging near the edge of the content area auto-scrolls it in every list, windowed or not; while a drag is active the hook recomputes the drop target on each viewport scroll, since an unwindowed list has no viewport state that would trigger it. While a hold is pending, a `pointerleave` with no pressed buttons is treated as a browser hover reset; a real leave with the primary button held cancels the hold. Pure window math lives in `src/renderer/list-window.ts`; list geometry and measurement helpers live in `src/renderer/node-list-layout.ts`.

`src/application/visible-rows.ts` flattens a sibling list and its expanded descendants into preorder rows. `EditorStore` gives displayed top-level rows their real parent ID. `src/application/drop-targets.ts` resolves gaps over the visible rows with the dragged block removed into real parent IDs and post-removal insertion indexes. It supplies the levels available at each gap and rejects gaps inside the dragged block. `EditorStore.moveNodeToParent` commits the target as one undoable command and marks it pending for persistence. It opens the receiving fold and folds between the displayed parent and the destination, selects the moved node, keeps a focused node's caret, and moves the displayed location only when the node leaves it through the same rule `<` uses. It reports maximum-depth errors without changing the document and treats a destination inside the node or at its current position as a no-op. `moveNodeTo` delegates sibling reordering to that command.

`src/application/expansion-state.ts` owns per-node expansion choices. `EditorStore` retains expansion across location changes, marks changes pending for persistence, and memoizes one visible-row list by document, current parent, and expansion identity. `NodeList.tsx` consumes that list for rendering, windowing, and measurement. A collapsed subtree costs one row regardless of its size. `NodeRow.tsx` renders the disclosure chevron separately from the circular enter control and focus marker; its `depth` prop drives row indentation. When a collapse hides the selected descendant, the store reselects the collapsing node. The renderer finishes pending edits before that collapse and clears whole-node Visual mode when either endpoint becomes hidden. Fold keys dispatch commands to the store; `zM` closes folds under the displayed rows and normalizes selection, and `zR` opens them. At the root level, `zM` clears every choice without walking the document.

One resolved drag state owns the interaction freeze: `resolveNodeDrag` in `src/renderer/node-drag.ts` folds the persistence lock and source-row availability into the gesture, and `use-node-list-drag.ts` projects that state into the body class, source-row marker, drop marker, pointer capture, invalid-target cursor, and caret suspension. The hook converts pointer geometry into a gap and level, uses `drop-targets.ts` to resolve its application target, and dispatches the completed move through `App.tsx`. The selected level controls the marker's inset using the shared row-indent value. A successful re-parent ends whole-node Visual mode in `App.tsx`; the Vim register and repeat state remain renderer-owned and untouched. The caret authority in `use-node-input-bindings.ts` suspends and restores the captured caret through `src/renderer/drag-caret-freeze.ts`; the drag layer never writes caret state directly. At or below the windowing threshold, the list renders every row as before.

The same resolved target state also handles row middles through `dropTargetOnRow`: it appends to the receiving node using a post-removal index and rejects the dragged block. `NodeRow.tsx` renders an accepting row's inset outline independently of gap markers. Both target kinds use the same release, no-op, cancellation, and store-command paths.

Breadcrumbs are a third variant of that resolved target. `breadcrumbDropTargets` supplies ancestor and document-root append destinations from the current location. `node-list-layout.ts` hit-tests segment widths across the toolbar height before row geometry, since pointer capture remains on the list. The hook projects its accepting breadcrumb ID through `App.tsx` to `LocationBar.tsx`, clears the projection on every gesture termination, and stops auto-scroll over the toolbar. No separate breadcrumb gesture state or command is introduced.

If native pointer capture is unavailable, global listeners route active-pointer events outside the list through its existing move, release, and cancellation paths. Events inside the list remain handled by React, so a release commits once. Losing established capture or window focus still cancels the gesture.

During an active windowed drag, `NodeList.tsx` also keeps the source row mounted at its measured offset when it leaves the viewport range, independently of the focused row. The extra source pin ends with the resolved gesture, so scrolling cannot discard the drag highlight or remount the source mid-gesture.

`EditorStore` exposes a `structuralVersion` on ready snapshots that advances when the displayed node identities or order can change — structural document replacement, navigation between levels, undo, and redo — but not for text edits or selection changes. The renderer uses it to keep layout recomputation out of the typing path.

The renderer stylesheet `src/renderer/styles.css` owns every color value as a CSS custom property declared once under `:root` and overridden for the dark appearance in the single `@media (prefers-color-scheme: dark)` `:root` block; rules reference the properties through `var()`, and no color literal appears outside a custom-property declaration. One `--highlight-background`/`--highlight-foreground` pair per appearance is shared by the whole-node Visual selection, character `::selection`, deliberate Normal-mode text selections, selected hyperlinks, and the Vim mode badge, so those surfaces cannot drift apart. A Normal-mode selection wider than the one-character block caret is a deliberate selection; `use-node-input-bindings.ts` marks the input with `node-input-text-selected` on `selectionchange` so it takes the highlight pair while the block caret keeps the ink pair. Values that do not adapt to the dark appearance are declared once without an override. The dark palette is adapted from the Zenburn Emacs port (`zenburn-emacs`, see `docs/PRODUCT.md` §20.5); `NodeRow.tsx` exposes the row depth as `data-depth`, and the dark block colors node text through zero-specificity `:where(.node-row[data-depth='N'])` rules so the selection highlight still overrides them. The light palette is original (see `docs/PRODUCT.md` §20.5). Its dot grid is a `radial-gradient` on `.scroll-viewport` painted with `--color-grid-dot`, which the dark block sets to `transparent`; `windowBackgroundColor` in `src/main/window.ts` must equal the light `--color-background`. The committed Playwright screenshot baselines remain the pixel oracle for these styles.

The appearance choice is owned by the main process alone and has no IPC channel: the View > Appearance menu (`application-menu.ts`) saves it with `createAppearancePreferenceStore` (`window-state.ts`, file `appearance.json` beside the document data; a missing or unknown value reads as `system`) and sets `nativeTheme.themeSource`, which drives both the renderer's `prefers-color-scheme` block and the `nativeTheme` `updated` event that `followWindowAppearance` listens to. At startup the saved value is applied before the window is created, and `system` leaves `themeSource` untouched.

The native window surface is the exception to renderer color ownership: `src/main/window.ts` mirrors the two document background colors for Electron's `backgroundColor` at construction, follows `nativeTheme` updates with `setBackgroundColor`, and removes the listener on `closed`. The real-Electron appearance tests compare the native surface with the renderer in both appearances to prevent these values drifting.

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
* the per-node inline-expansion choices.
* Agenda origin, scope, captured Today, occurrence selection, folds, and revealed days.

Only the state explicitly required by the product specification should be persisted. Of the runtime state above, the product specification requires the current parent, the selected node, and the expansion choices to survive a restart, so they are also written as view state beside the document (§13). They remain runtime state in every other respect and never enter undo history.

Exact cursor position, focus state, navigation stack, undo/redo history, and the windowed list's mounted range and height table are runtime state unless the product specification changes.

Agenda presentation is runtime-only. The save scheduler excludes it and uses its captured Tree origin location instead of a selected Agenda occurrence. It suppresses Agenda viewport measurements and preserves the stored Tree row position. Closing restores the origin cursor with a fresh focus token; Tree expansion is unchanged.

The hook's `applyCaretState` publishes a complete resolved Normal caret and projects it onto its registered input. Callers choose immediate projection, projection after the edited text renders, or preservation of a deliberate native selection. One bounded pending projection carries its node, focus token, and caret revision; native Insert/contenteditable scheduling also carries the originating element. A newer intent invalidates earlier work, and disconnected, replaced, or wrong-node work is consumed without projection. Mode changes invalidate deferred focus while retaining only a pending projection compatible with the destination mode. The deferred focus pass checks both the focus token and caret revision. Replace completion publishes the resolved cursor, including an explicit retreat when requested, so callers do not retreat the DOM separately. Composition start uses a preserving commit because it retains Replace mode and its native insertion position.

Renderer-local interaction state follows a single-owner pattern. State that spans commands or events — the Normal-mode caret target and pending hyperlink-draft check, the Vim register and pending Insert or Replace session, the pending command with the last repeatable change, character find, and character Visual endpoints, the structural Insert session, and the drag caret-freeze record — lives in one pure owner module that stays free of React, DOM, Electron, filesystem, and store dependencies. `use-node-input-bindings.ts` holds one instance of each owner and is the single place that creates them and publishes the caret and mode (extracted handler modules receive the owners and may write the DOM, but never keep a copy of an owner's fact), alongside the hook-local facts (its caret authority and the pending hyperlink draft) that each have one writer. Handlers and components act through owner transitions — including owner-backed access-time handles where a handler needs direct field access — and must not keep a parallel copy of a fact or resynchronize it at each call site. When defects cluster around one state, multiple owners or scattered resynchronization calls are the design cause to check first. The pattern, its defect evidence, and its boundaries are recorded in [ADR 0014](decisions/0014-single-owner-for-renderer-interaction-state.md).

Vim repeat descriptors live in `VimCommandState.lastChange`. Structural descriptors capture the operated sibling span, shift levels or join spacing, and a put's immutable incoming payload and copy count. Replay resolves that exact span against the current node's actual siblings before invoking the existing atomic store command. Each iteration reports success to the keyboard handler, which stops counted replay at the first failure; successful iterations use the ordinary history and autosave path. Replay never derives incoming content from the live register.

---

## 10. Navigation

Navigation is separate from the document's trees.

The root collection and its trees represent the document structure.

Navigation represents where the user currently is in the document structure.

The application maintains:

* current parent, which is absent at the top-level document container;
* selected node, which may be the current parent's direct child or, through inline expansion, any of its deeper descendants whose ancestors are expanded;
* runtime navigation history.

Entering a node changes the current parent.

Leaving a node restores the previous location and selection.

Navigation history must not be encoded into the persistent document tree.

---

## 11. Undo and Redo

Undo/redo operates on document changes rather than UI events.

Undo/redo must preserve stable node IDs.

The history is runtime-only.

The implementation should make it possible to undo and redo complex operations such as:

* subtree deletion;
* sibling reordering and cross-parent movement by drag-and-drop;
* multiline paste;
* image attachment;
* node splitting.

The history implementation uses whole-document snapshots. The domain never mutates an existing document; every operation returns a new document. Every editing and structural command path-copies only the nodes from the top-level root to the affected sibling array, and shares every unaffected subtree by reference with its input. Because of that invariant, the history retains the current document objects by reference instead of deep-cloning them on `begin`, `undo`, or `redo`, and consecutive states share unchanged subtrees whether the change was a text edit or a structural command.

The caret and selection that undo and redo publish are derived from the two snapshots rather than recorded with each change. `editor-undo-focus.ts` compares the outgoing document with the restored one and reports where the change starts, which `EditorStore` publishes as the focus and location. That reuses the structural-sharing invariant above: reference equality prunes every unchanged subtree, so the comparison visits only the changed path and costs no more than the mutation that produced it. The alternative, threading a caret through every mutating command, was rejected because commands such as `editText` and `replaceTextRanges` carry no caret and the history would have to record one at every call site. `EditorHistory` itself stays a pure document store.

For cross-parent movement, the comparison first matches stable IDs removed from and added to different changed sibling lists. The moved node is the change site in either direction; the existing visibility rule keeps its current location or displays its parent's level when hidden. Unchanged subtrees are pruned by reference, and only differing sibling lists need ID maps. Same-parent reorders and other edits retain the positional/text comparison. This adds no history metadata, disk writes, or retained navigation state; temporary matching memory is bounded by the affected sibling lists.

The history is bounded to the product limit defined in `docs/PRODUCT.md` §10. One entry is one text-editing session or one structural command. When the limit is exceeded, the oldest entry is discarded and can no longer be undone. The redo stack is bounded by the same limit.

The choice of snapshots keeps undo/redo correct and simple. A future history bound change or a move to command/inverse-operation history must preserve the same user-visible undo depth and attachment reachability.

Each derived document carries an in-memory attachment summary, held through a weak map keyed by document identity. The summary is an immutable map from attachment ID to the number of node references to that ID. Operations propagate it to the document they return, adding an inserted attachment, subtracting a deleted subtree's references, or sharing it unchanged. `collectAttachmentIds` keeps returning a defensive `Set` copy for callers; a separate internal read-only accessor exposes the summary itself. The summary is derived state: it is not part of the document object, is never serialized, and is discarded with the document.

The history retains a reference to each snapshot's summary instead of copying its IDs. It counts how many retained entries use each summary and updates the union's per-ID counts only when a summary first becomes retained or finally ceases to be retained. Retaining or releasing repeated entries whose attachment membership is unchanged therefore performs no per-entry ID enumeration; only a new or changed summary costs O(A) for A distinct attachments. The counts used for per-node attachment multiplicity and for history reachability serve different purposes: duplicate references within a document and overlapping IDs across distinct summaries are preserved, and removing one reference never releases an ID that another retained summary still references. Reading the retained attachment set returns the maintained union without re-traversing snapshots, so attachment cleanup does not scale with history depth.

---

## 12. Infrastructure Layer

Infrastructure contains access to external systems and platform-specific APIs.

Examples include:

```text id="g7xj9s"
Persistence
Clipboard
Attachments
Electron integration
Filesystem
```

Infrastructure code must not contain core product rules that belong in the domain.

Infrastructure should expose narrow interfaces to the application/domain where appropriate.

---

## 13. Persistence

Persistence is responsible for saving and loading the document.

The persistent representation should be independent from React components and UI implementation details.

The document uses a versioned JSON representation.

Conceptually:

```json id="x4p9mt"
{
  "version": 4,
  "document": {
    "roots": [
      {
        "id": "root-id",
        "text": "Root text",
        "struckThrough": true,
        "children": []
      }
    ]
  },
  "location": {
    "currentParentId": null,
    "selectedNodeId": "root-id"
  },
  "view": {
    "expandedIds": ["root-id"]
  }
}
```

The exact schema is defined by the implementation and product requirements.

Version 3 added `view`, the persisted view state ([ADR 0017](decisions/0017-persisted-view-state.md)). `serializeState` writes only expanded ids of nodes the saved document contains; the in-memory set keeps ids of deleted nodes so an undo that restores a node also restores its expansion. A choice belongs to the node, not to its current children: a node whose last child is deleted keeps its id, and shows expanded again if it later regains children.

`validatePersistedState` checks the view's shape and tolerates an id that names no node, and `parsePersistedState` drops such ids and migrates version 1 and 2 files to an empty view, so they open collapsed. Performance assessment (`docs/PRODUCT.md` §22.1): an expansion change adds no write of its own; it marks the same pending change a selection change does, so the idle, volume, and quit triggers batch it into the next document save. Serialization filters the expanded ids against the id set the existing validation walk already builds, which adds `O(E)` for `E` remembered ids to a save that is already `O(N)`. Keeping expansion across locations adds no per-command CPU; startup builds one set from the saved ids and one visible-row list, which the windowed list renders in bounded time (`perf/startup.spec.ts` guards startup with every one of 100 roots expanded, about 10,100 visible rows). Memory grows with the remembered ids, bounded by the number of nodes the user expanded in the session plus those loaded. An application build that predates version 3 rejects a version 3 file as unsupported, loads the newest older-version generation instead, and promotes it over the version 3 primary, discarding the newer work; running such a build on data written by a later one is unsupported.

Version 4 added the per-node `struckThrough` field ([ADR 0018](decisions/0018-struck-through-nodes-in-schema-version-4.md)) and keeps the version 3 `view` block unchanged. Both validators reject a `struckThrough` that is present but not `true`, in the same node walk that already checks every node. Versions 1 to 3 load with no struck-through node and are saved as version 4. The version change exists to protect older builds: a build that ignores the field would otherwise load a version 4 file, drop every strikethrough, and write the file back without them, while with version 4 it rejects the file as unsupported and falls back to an older generation, as for version 3. Performance assessment (`docs/PRODUCT.md` §22.1): a toggle adds no write of its own; it marks a pending change like a structural command, so the idle, volume, and quit triggers batch it into the next document save. It path-copies one sibling range and the route to it, `O(range + depth + siblings)`, independent of document size, and the save and load walks gain one field check per node. Memory grows by at most one boolean field per struck-through node, plus the one history snapshot every undoable change already keeps.

`view.selectedRowTop` records the scroll position as the selected row's distance from the top of the window, clamped so the whole row is on screen. A raw page offset was tried first and rejected: the windowed list in `NodeList.tsx` starts each launch with estimated heights for rows it has not measured, and images load after the first render, so the same pixel offset showed different content after a relaunch and a clamped offset was saved back over the real one. The selected row is always rendered, including in a windowed list, so it is a stable anchor. `src/renderer/use-scroll-restoration.ts` owns the renderer side. Called after the input bindings, its layout effect runs after their initial focus has scrolled the selected row into view and scrolls the page so the row sits at the saved distance. It keeps the restore pending and re-aligns on every `ResizeObserver` change of the document element while rows are measured and images load, until the first `wheel`, `keydown`, `pointerdown`, or `touchstart`. `EditorStore` keeps the value outside the snapshot, because no rendered state depends on it; the hook registers a reader that `EditorStore` calls whenever it captures state for a save, returning the pending target during a restore and the live measurement afterwards, so every save, including the quit flush, carries the current value. The saved distance is clamped again against the current window when it is applied and reported, because the window may be shorter than when the value was saved. A `scroll` event marks a pending change through `noteViewportChange` only after user input, so the restore's own scrolling at launch saves nothing. Unlike a selection change, it never resets an idle timer that is already armed, so continuous scrolling cannot hold back the idle save of an earlier text edit. Performance assessment: a scroll event costs at most one timer arm; a capture measures one row; the value adds no write of its own and is batched into the next document save, which is a full document save like the one a selection change causes.

Keeping the selection in view (`docs/PRODUCT.md` §20.8) uses the geometry in `revealInViewport` in `src/renderer/scroll-viewport.ts` and the navigation lifecycle in `src/renderer/viewport-reveal.ts`. The focus effect in `use-node-input-bindings.ts` focuses the input with `preventScroll`, captures the reveal policy for that focus token and reveals the whole `.node-row`. Pointer input requests visibility rather than keyboard context; the policy stays fixed for deferred geometry corrections. `vim-viewport-motion.ts` marks H/M/L destinations before selection so their focus and caret projection never triggers scrolling, including fallback to clipped rows. Its `contextViewport` derives the area those commands choose from and drops context at document edges. The context unit comes from the root CSS custom property used by the row minimum; its measured value is reused until a viewport resize. Oversized-row start priority and document-edge snapping use that same context independently of row height.

The reveal lifecycle observes only its destination, the scrolling content and the fixed viewport. `NodeList.tsx` notifies layout subscribers after measurement/spacer changes commit, since a row can move without changing its own height. Corrections verify the current focus token and connected element and never rewrite focus or caret state. Wheel, touch and page-scroll input cancel the intent; offset changes with unchanged content extent relinquish it to scrollbar dragging or drag auto-scroll. Native anchoring during content growth remains geometry settlement. An initial saved position leaves asynchronous alignment with `useScrollRestoration`, which retains its existing startup ownership. Cleanup disconnects observers and removes subscriptions. Performance assessment: no extra document mutation or direct disk operations; corrected scroll positions use the existing coalesced viewport-save scheduling, so a late correction can schedule another save if the earlier position was already saved. Geometry work is constant per focus, observer batch or layout notification, with three observed targets and one current intent regardless of document size. Existing large-list navigation scenarios guard latency and mounted-row bounds.

Persistence must support future schema evolution.

The application must flush queued saves before a normal quit completes. A persistence failure must not silently discard the in-memory document; it is surfaced to the user and a later successful save clears the error state. In the locked save-failure state, quitting offers an explicit confirmation that bypasses the flush; it is the only path that discards changes without saving.

Closing the main window is treated as a quit request: the main process intercepts the window close, runs the same renderer flush handshake as `Cmd+Q`, and only allows the application to quit after the renderer confirms. If the flush fails or times out, the window remains open and the failure is surfaced.

The renderer applies the automatic save policy defined in `docs/PRODUCT.md` §16.1 rather than saving on every keystroke. The store tracks whether changes are pending, counts inserted words against the volume threshold, and resets the idle timer on every persisted change. Image insertion and hyperlink insertion request an immediate save. Structural commands that insert no content mark changes pending and reset the idle timer without saving by themselves. Inserted-word accounting uses two bounded scalar watermarks: a cumulative inserted-word count and the cumulative count acknowledged by the latest successfully persisted snapshot. When the coordinator captures the document state for an actual service save, the store records the watermark in that snapshot; only a successful document save advances the acknowledged watermark. A failed save, and a cleanup-only success, leave it unchanged, so an earlier successful save cannot acknowledge edits made after its snapshot was captured and a later failed save cannot lose its accounting. The volume trigger compares the cumulative and acknowledged watermarks. `flushPersistence` forces a save of pending changes before awaiting the queue, so quit always persists them. Renderer-local pending edits that are not yet in the document — the Vim Replace buffer — are completed through a finisher the input bindings register with the store: the flush invokes registered finishers before it captures state for each save and again after that save completes, so a replacement typed into the DOM is part of the saved document and a session completed while a save is in flight is saved before the flush resolves. A finisher reports whether it committed a change, so the flush runs another pass and waits for the save that commit requested instead of resolving with that save still in flight. Finishers run only while the store is ready and not locked, because a locked store rejects document changes; otherwise the session is retained instead of being consumed by a rejected commit.

The store counts consecutive failed document saves. The coordinator reports whether a failed cycle was a document save or an attachment cleanup so the two are retried differently. After three consecutive document-save failures the store stops scheduling automatic save attempts, discards any save request already queued, and enters the locked save-failure state defined in `docs/PRODUCT.md` §16.2: mutating commands are rejected in the application layer, navigation, selection, and copy remain available, and the renderer presents the failure with restart guidance. A successful save resets the failure count and releases the lock. Quit and window close still attempt a final save through the flush handshake; if that save fails while locked, the renderer asks for explicit confirmation and a dedicated trusted IPC operation quits without flushing.

The editor tracks pending asynchronous cut and paste operations. Shutdown flushing waits for those operations, then their queued persistence, and checks for additional pending edits before completing. Operation failures reject the active flush and prevent its quit acknowledgment. The persistence coordinator retains document-save failures separately from cleanup results so cleanup alone cannot authorize quit with unsaved changes.

Document saves and attachment filesystem operations are serialized by the file-service operation queue. The application also queues attachment cleanup with persistence work, so cleanup cannot race a save or another cleanup, and cleanup failures follow the same visible error and shutdown-flush path as save failures. File-service operations emit structured operation names, phases, and filesystem paths for diagnosing boundary failures.

Document and attachment writes share the same durable-write sequence: the bytes go through a file handle, are flushed with `fsync`, and the handle is closed before the operation reports success. A document save flushes the data directory after the rotation and replacement renames, so the preserved generation and the new primary are durable together before the save reports success; pruning runs after that flush and stays best-effort. An attachment write flushes the attachments directory, because the attachment file is created for the first time and the document reference recorded by a later save must never outlive the attachment data or its directory entry. A failed flush rejects the write instead of reporting success, so the renderer cannot record a reference to an attachment that was not stored.

Persisted state is serialized without cloning the in-memory document, which the domain immutability invariant guarantees is never mutated after creation. The renderer validates the document and its location before sending the payload. The main process enforces the same persisted-state invariants on the untrusted IPC payload without rebuilding the document, and rejects malformed or over-depth input before any filesystem operation. Persisted attachments use the same filesystem-safe identifier rule as attachment IPC and file access; saved link destinations must be valid HTTP(S) URLs. Persisted-state validation performs a single traversal: while it checks every node, it records the selected node's parent and whether the current parent exists, so it resolves the location without constructing the derived node index or walking the document a second time. Parsing, schema migration, and link normalization remain on the load path, where older or non-canonical files are read.

Attachment cleanup is no longer part of every save cycle. The store marks cleanup dirty only where attachment reachability can change: structural deletes, undo, redo, history eviction, discarding the redo branch when a new edit begins, and initialization. The coordinator runs cleanup after a save, never before one. A cleanup requested while document changes are pending waits for the next save; startup cleanup with no pending changes may run without a save. While the store is in the locked save-failure state, document changes stay marked pending and automatic save attempts stop, so scheduled cleanup-only attempts remain deferred until a save succeeds or the application restarts. Because the main-process keep set includes every document file on disk, cleanup cannot delete an attachment that the persisted document still references even when newer edits have not been saved yet. Attachment cleanup retains files referenced by the live document, every retained history snapshot, and pending attachment writes. The referenced set is computed from the live document's derived attachment summary plus the history's incrementally maintained union over retained summaries, so cleanup rescans neither the live document nor retained snapshots. A failed cleanup is retried on its own rather than through a document save: the store schedules cleanup-only attempts at the idle interval for at most three consecutive failures, then leaves the cleanup pending so the coordinator attempts it again on the next save or quit. Cleanup failures never lock the editor and never mark document changes pending.

The main-process file service extends the renderer-supplied keep set with attachment ids collected from the primary document, the temporary file, and every retained document generation. It reads and parses those candidates inside the same serialized filesystem operation, before unlinking anything, so a save rotation cannot race the retention decision. Recovery candidates are parsed with the domain parser and their attachment ids collected without reading attachment contents or adding a filesystem check per reference. A missing recovery file contributes no ids; malformed or unsupported recovery JSON contributes no ids and is left byte-for-byte unchanged; an unexpected recovery-file read failure aborts cleanup instead of deleting with an incomplete keep set. Retention lasts only while a retained generation references the attachment: once pruning removes the last generation that references it and a subsequent scheduled cleanup runs, the file is deleted, so old ids are not retained as an accumulating archive.

Loading invalid or unsupported data must fail safely rather than silently corrupting the document.

Each save preserves the document it replaces as an immutable generation before the new primary is renamed into place, then flushes the data directory so both names are durable when the save resolves. Load considers the primary, the temporary file, and every retained generation, newest first by write time, and promotes the newest candidate that domain validation accepts. A candidate is not rejected for a missing attachment file; the affected image reports its own display error. Invalid candidates are left untouched while the next candidate is considered, and the loaded candidate replaces the primary when the promotion rename succeeds. Promotion is best-effort and is not followed by a directory flush: a filesystem error while promoting a valid candidate, such as a full disk, must not prevent the document from opening, and a promotion lost to a power failure is retried on the next launch from whatever candidates remain. Candidate validation is a single traversal that does not rebuild the document; the renderer parses and migrates the promoted value.

Generation retention keeps the newest generations up to a fixed cap and always retains the newest generation past the safety window defined by `docs/PRODUCT.md` §16. Pruning deletes only generations older than the safety generation and is best-effort, so a committed save is never reported as failed because an old generation could not be deleted. Legacy `document.json.bak` files remain readable candidates and are removed by pruning once they fall outside retention.

The file-service `null` load result is reserved for missing document files. A primary file containing JSON `null` is rejected as unsupported at the file boundary, preserving the stored document files instead of triggering first-launch initialization.

Absolute filesystem paths must not be stored in the document.

---

## 14. Attachments

Image attachments are stored separately from the document JSON.

Conceptually:

```text id="v8m7lq"
data/
├── document.json
└── attachments/
    └── <attachment-id>.<extension>
```

The document stores an attachment reference.

Attachment storage is responsible for:

* creating attachment files;
* reading attachment files;
* deleting unused attachment files;
* ensuring attachment references remain valid;
* flushing attachment bytes and the attachments directory entry before a write reports success.

Reads, writes, and cleanup operations are ordered through the same infrastructure queue. Cleanup is therefore idempotent with respect to overlapping application requests rather than relying on concurrent unlink calls to succeed.

Attachment files referenced by a retained generation are kept even when the live document and runtime history no longer reference them. The file service unions the renderer's keep set with the attachment ids parsed from the primary document, the current temporary file, and every retained generation before it deletes anything, so recovery candidates remain loadable until pruning removes the last generation that references them and cleanup runs again.

The renderer caches attachment bytes returned by the read path in a bounded least-recently-used cache keyed by attachment id. Remounting an image reuses the cached bytes instead of repeating the IPC call and the whole-file read. The cache is process-local renderer state, retains at most a fixed byte budget, and never changes stored bytes; filesystem reads remain in infrastructure.

Moving a node must not require copying its attachment file.

---

## 15. Clipboard

Clipboard access belongs to infrastructure.

A dedicated clipboard service should translate the operating system clipboard into application-level input.

The rest of the application should not directly depend on browser clipboard APIs.

The clipboard service should support:

* text;
* multiline text;
* images.

Clipboard-specific platform details must remain outside the domain.

Vim external yanks and Normal `dd` use a separate `writeClipboardContent` service and IPC channel carrying plain text or an attachment ID. Application projections choose the content under PRODUCT §20.2; the main process validates the payload, reads image bytes through the file-service queue, and validates the PNG before writing it. Native writes are serialized with rich clipboard copies so a pending image read cannot overwrite a later copy. The external copy adds no document mutation, persistence writes, or history entries beyond the command's existing behavior; text projections read only the selected text or sibling roots, and image copying uses the existing attachment byte and decoded-image limits. `dd` captures the caret before deletion changes focus and exports only after successful deletion; the existing undo history retains the removed attachment during image copying.

### Editing commands

The application installs only a minimal application menu, so macOS does not route the standard editing commands (Undo, Redo, Cut, Copy, Paste, Select All) to the renderer, and the native `copy`, `cut`, and `paste` DOM events do not fire. The editor key handler must own these commands: intercept the shortcut, prevent the native default, and perform the operation through the editor store and the clipboard service. The application must not rely on native menu roles or native clipboard DOM events. See `docs/decisions/0003-renderer-owns-standard-editing-commands.md`.

Editable node fields also expose a native macOS contextual menu. The renderer captures the node's selection and capabilities, the main process presents the platform menu, and the selected Cut, Copy, Paste, or Select All command returns to the renderer and uses the same editor-store path as the keyboard command. Look Up uses Electron's native definition service and Search with Google opens the selected text externally. The menu is attached only to editable node inputs, so other controls do not acquire editor commands.

Opening the menu performs one constant-size selection inspection and one IPC round trip. It does not write to disk until an editing command changes the document, does not traverse the tree, and does not retain state after the popup closes.

---

## 16. Electron Integration

Electron-specific behavior belongs outside the domain.

Electron is responsible for desktop functionality such as:

* creating and managing the application window;
* persisting and restoring the main window's size and position;
* persisting the main window's always-on-top preference and applying it through `BrowserWindow.setAlwaysOnTop`;
* persisting the Vim editing preference that the renderer reads at startup and writes when it is toggled;
* persisting the appearance choice (`system`, `light`, or `dark`) and applying it through `nativeTheme.themeSource`;
* application activation;
* global or main-process keyboard shortcuts where required;
* integration with macOS;
* communication between the main and renderer processes;
* access to desktop APIs.

The domain must not import Electron APIs.

The main process resolves the renderer URL once. Packaged builds always use the packaged renderer
document and ignore `ELECTRON_RENDERER_URL`; unpackaged builds may use that variable for the
development renderer. Window loading, navigation checks, and trusted IPC caller validation all use
the same resolved URL.

The renderer uses Electron's default session. The main process denies permission requests, permission
checks, and device permissions on that session, and blocks network requests except for `file:`,
`devtools:`, `blob:`, and `data:` URLs plus the resolved development origin when running unpackaged.
External HTTP(S) links are handed to the operating system through `shell.openExternal`; they do not
use the renderer session.

The main process installs navigation and window-open guards for every web contents as it is created.
Main-frame, subframe, and redirected navigation are restricted to the resolved renderer document,
and webview attachment is denied. The production content security policy denies child frames,
workers, and media. It also declares `frame-ancestors 'none'`, but Chromium ignores that directive
when delivered through a meta element, so it is not an enforced control in this delivery mode.

Window geometry is persisted with a short debounce, so moving or resizing the window does not perform a synchronous disk write for every event. The pending geometry is flushed when the window closes.

The always-on-top preference is stored as one validated boolean in the main-process window-state directory. Toggling it performs one small write and one native window update; it adds no work to document editing or navigation paths and retains no growing in-memory structure. Existing installations without the preference default to an unpinned window.

The Vim editing preference uses the same boolean preference store (`createBooleanPreferenceStore` in `window-state.ts`) in its own file, `vim-enabled.json`, beside the document data. It is user preference, not document state, so it is not part of `document.json`, the autosave policy, or the save-failure lock; a missing or malformed file reads as disabled. The renderer requests it through `tree:get-vim-enabled` before its first render, so the editor never draws a frame in the wrong editing mode, and writes it through `tree:set-vim-enabled`, whose main-process handler accepts only a boolean. Toggling performs one small write and no document save, adds one boolean check per editor keydown, and retains no growing structure.

---

## 17. Process Boundaries

The application consists conceptually of:

```text id="2jpnm1"
Electron Main Process
        │
        │ IPC
        ▼
Renderer Process
        │
        ▼
React UI
        │
        ▼
Application
        │
        ▼
Domain
```

Electron-specific capabilities must cross the process boundary through explicit APIs rather than being accessed directly from arbitrary React components.

The renderer should not gain unrestricted access to Node.js or filesystem APIs.

---

## 18. Dependency Direction

Dependencies should generally point toward the domain:

```text id="b7g5os"
UI
 ↓
Application
 ↓
Domain

Infrastructure → Application / Domain interfaces
```

The domain must remain at the center of the application.

The domain must not depend on infrastructure implementations.

For example:

```text id="4p0xqz"
Domain → Persistence
```

is not allowed.

Instead:

```text id="f6t0x4"
Application → Persistence interface
                         ↑
                         │
                Persistence implementation
```

---

## 19. React Rules

React components must not become the location for business rules.

Avoid:

* large components containing tree manipulation;
* duplicated domain logic in event handlers;
* direct filesystem access from components;
* direct Electron API usage throughout the component tree;
* global mutable state that bypasses the application/domain layer.

Components should primarily:

1. display state;
2. capture user input;
3. dispatch commands;
4. display resulting state.

---

## 20. Architectural Simplicity

The architecture should not be over-engineered.

Do not introduce:

* unnecessary design patterns;
* unnecessary abstractions;
* unnecessary dependency injection frameworks;
* unnecessary state-management libraries;
* unnecessary service layers;
* unnecessary microservices or processes.

An abstraction is justified when it provides a clear boundary, improves testability, isolates platform-specific behavior, or prevents meaningful architectural coupling.

---

## 21. Module Structure

The implementation may use a structure similar to:

```text id="0q0fvr"
src/
├── domain/
│   ├── model/
│   ├── operations/
│   ├── navigation/
│   └── history/
│
├── application/
│   └── commands/
│
├── infrastructure/
│   ├── persistence/
│   ├── clipboard/
│   └── attachments/
│
├── renderer/
│   ├── components/
│   ├── hooks/
│   └── styles/
│
├── main/
│
└── shared/
```

This is a guideline, not a requirement to create every directory immediately.

The actual structure should reflect the codebase as it evolves.

The renderer computes Normal-mode caret state through pure renderer-local transitions in `vim-caret-transition.ts`: horizontal and vertical motion, counted cross-node navigation, focus intents, pointer focus, and no-op boundaries, together with text-edit and Visual-leave results, Replace commits, and Insert Escape (`editCaretTransition`), plus node entry/exit and undo/redo focus changes (`focusCaretTransition`). `use-node-input-bindings.ts` retains one caret authority for the caret, the active image, and the saved return position and projects the image state to React; the DOM caret class renders that result. It also owns the drag caret freeze: a drag can only ask the authority to suspend or release the caret, and the pure capture record lives in `drag-caret-freeze.ts`. `vim-keyboard-handler.ts`, `editor-input-handlers.ts`, and the input bindings adapt pure results to DOM placement and store navigation.

`vim-edit-session.ts` owns the renderer-local Vim register and the one pending Insert or Replace session, together with the pure diff and Replace-commit helpers. `vim-command-state.ts` owns the pending command, the last repeatable change, the last character find, the character-wise Visual endpoints, the latest Visual selection remembered for `gv` (a character range as node and offsets, a whole-node range as its endpoint IDs and the ascending sibling IDs between them; it is renderer-session only, survives every clear, and is written together with the live endpoints by one transition), and the one structural Insert session; `vim-visual-memory.ts` holds the pure rule that decides whether that memory is still valid and displayed. `use-node-input-bindings.ts` holds one instance of each owner and projects their results into React, the DOM, and the store; it performs its command-state writes through that module's transitions, and the keyboard state carries the command-state owner so `vim-keyboard-handler.ts` and `editor-input-handlers.ts` read and write the same object and clear the pending command and Visual endpoints only through its transitions. It finishes a pending session through one shared policy (`vim-session-finish.ts`) for Escape, blur, application shortcuts, undo/redo, and the shutdown flush; a pointer mousedown finishes only a plain session, leaving a pending structural session for its own node's blur so it captures the text typed there. A plain Insert session records its diff for `.` only when Escape completes it on that node's own registered input; every other finish consumes it without recording, and `.` replays the recorded diff at the current caret in any node. A structural Insert session records its origin node so the incidental blur that begins its new node does not end it, and it always captures for repeat.

Standard (non-Vim) editing is the Vim layer switched off, not a second editor. `App.tsx` owns the enabled flag; while it is off the renderer Vim mode stays `insert` and `use-node-input-bindings.ts` passes no Vim keyboard state to `createEditorKeyDownHandler`, whose standard command branch then handles every key, so Normal-only paths (image caret, block caret, Normal pointer handling) stay inert and no Vim session can begin. The hook's `setVimEditing` performs the switch on the focused input through the same session-finishing policy as a focus change — Insert bookkeeping, a Replace commit that does not rewrite the DOM, cleared command assembly and whole-node Visual range — but keeps focus; switching on lands in Normal mode with the caret projected through `editCaretTransition`.

Each caret transition performs constant-time arithmetic and retains only a cursor and optional return position. Counted navigation invokes one transition per motion step as before. It adds no disk writes or syncs, no work that scales with document size or edit count, and no growing history. The bounded property tests exercise counted motion and return-position invariants across varied text lengths and node layouts, and a bounded mixed-sequence guard compares the production Vim keyboard handler and `EditorStore` with an independent expected-state model over generated interaction sequences.

Cross-node motion (`↑`, `↓`, `j`, `k`, `←`, `→`, `G`, and their counted forms) is resolved by `moveSelectionTransition`, `moveHorizontalTransition`, and `moveSelectionBoundaryTransition` in `editor-command-transitions.ts` against the visible-row list `EditorStore.getVisibleRows()` returns, locating the current row with one linear scan of that list. `vim-vertical-navigation.ts` issues one such call per step of a counted vertical motion, so an `N`-step motion costs `O(N)` scans of the current location's visible rows. Every step of one counted motion reuses the same memoized row array, because a motion step changes only the selected node, not the document, current parent, or expansion identity that the memoization key uses; the underlying `O(visible rows)` traversal that builds that array still runs once per render, as it did before cross-node motion depended on it. Performance assessment (§22.1): no new disk writes or syncs; CPU per motion step is bounded by the visible rows of the current location, not the whole document, so a counted motion costs `O(count × visible rows)` in the worst case; memory is unchanged, since navigation reads the existing memoized array rather than allocating one per step. `perf/expansion.spec.ts` guards this path at 1,100 visible rows for both single-step and counted vertical motion.

The renderer currently isolates DOM/caret behavior in `editor-dom.ts`, the Normal-mode caret target and pending hyperlink-draft currency in `link-caret.ts`, pure Vim motion and text-object calculations in `vim-editing.ts` and `vim-text-commands.ts`, surround delimiter and edit calculations in `vim-surround.ts`, the Vim register and Insert/Replace session owner plus session-completion helpers in `vim-edit-session.ts`, the Vim command-state owner in `vim-command-state.ts`, Vim command dispatch in `vim-keyboard-handler.ts`, keyboard state types in `vim-keyboard-types.ts`, and standard shortcuts and context-menu routing in `editor-input-handlers.ts`. Location rendering lives in `LocationBar.tsx`, attachment rendering/preview in `AttachmentPreview.tsx`, list geometry and measurement in `node-list-layout.ts`, row presentation in `NodeRow.tsx`, and drag interaction in `use-node-list-drag.ts` with the pure gate fold in `node-drag.ts` and the pure caret-freeze record in `drag-caret-freeze.ts`. The input bindings hook `use-node-input-bindings.ts` keeps every owner instance, ref, and effect and builds each handler group from an extracted module that receives them as explicit arguments and keeps no module-level state: `node-input-types.ts` (pending caret and Visual selection types), `caret-projection-rules.ts` (the pure currency rules for pending caret work), `vim-viewport-motion.ts` (H, M, L, and half-page targets), `vim-structural-repeat.ts` (dot replay of structural changes), `vim-node-visual-commands.ts` (whole-node Visual and sibling-range commands), `vim-session-finish.ts` (Insert, Replace, and structural session finishing and the Vim editing switch), `vim-keyboard-state.ts` (the `VimKeyboardState` adapter), `node-input-text-handlers.ts` (text edit, link draft, and composition handlers), and `node-input-pointer-handlers.ts` (blur, focus, pointer, select, paste, cut, link click, and context menu). The hook still holds one `vim-edit-session.ts` owner and one `vim-command-state.ts` owner and owns renderer-local Vim mode, image-caret return position, and the drag caret freeze. It reconciles the image-caret indicator with a new store focus token; a command that produces no new focus intent leaves the local caret and saved return position intact. An explicit image destination consumes the new token so a later render does not replace it with the store's text boundary. The whole-node Visual selection stores only two displayed sibling IDs in `App.tsx`, and `NodeList.tsx` renders highlighting by comparing their indices with mounted rows, including pinned focused rows in a windowed list. The selected subtree range is derived from the document when a command executes; selection is not persisted. These modules remain UI adapters and dispatch completed document changes through the application layer.

Vim text mutations use the same application-layer edit and history path as ordinary text edits. The local Vim register is renderer-local and holds either one node-sized string, one immutable subtree snapshot, or one ordered forest snapshot; structured puts go through an application transition that remaps every node ID and updates attachment reachability. The register is neither persisted nor sent across IPC. Motions and range edits scan only the active node text; subtree puts additionally scale with the copied subtree. Repeat state retains one command descriptor and, for Insert and Replace changes, only the most recent replacement text. The last character-find and active Replace baseline are each bounded by one current-node value. Counts stop at text boundaries; counted text puts allocate the requested output once, and counted dot changes scale with the requested repetitions. These commands add no direct disk operations beyond the existing autosave path and do not accumulate state across edits.

Whole-node Visual commands dispatch through `EditorStore` and replace a sibling interval in one immutable domain operation and one history entry. The local register can also hold an ordered forest snapshot and original source IDs. Subtree pastes allocate fresh IDs; the store rejects a paste into a descendant of a still-present source node before mutation. The source IDs are used only for this runtime ancestry check. Structural repeat retains one bounded descriptor with a source snapshot when needed and reissues application commands from the current node; a count performs independent commands. Case changes traverse the selected subtrees, and range replacement adjusts cached attachment multiplicities from the removed and inserted subtrees. No selection or repeat state is persisted or sent across IPC.

Performance assessment (§22.1): text-object calculations scan only the active node text. Node Visual endpoints and the repeat descriptor are constant-size state apart from one captured subtree forest, bounded by the most recent register or repeatable put. Computing a selected sibling interval scans the current displayed level; highlighting compares indices for mounted rows, so ordinary typing outside Node Visual mode does not gain a list scan. Bulk commands traverse only selected subtrees plus the copied sibling array and ancestor path; repeated puts scale with the requested count and copied forest size. A command adds one history snapshot and the existing autosave scheduling, with no new direct disk writes or syncs. The wide-list Node Visual performance guard checks interactive selection latency and mounted-row bounds.

The domain currently isolates shared document types, hyperlink normalization, the derived node index, attachment accounting, tree operations, and persisted-state parsing in `document-types.ts`, `document-links.ts`, `document-index.ts`, `document-attachments.ts`, `document-operations.ts`, and `document-serialization.ts`. `document.ts` remains the public domain entry point and re-exports the domain API from those modules.

`document-links.ts` offers two link-preserving text edits with different contracts. `replaceLinkedText` recovers the changed region by diffing the text before and after, for callers that observe only the resulting string, such as a native `contenteditable` mutation. `replaceLinkedTextRanges` takes an ordered list of disjoint edits and remaps link offsets by position, for callers that know their edit positions and change more than one place at once; `EditorStore.replaceTextRanges` applies it through the same single-history-entry path as `replaceTextRange`. See ADR [0013](decisions/0013-position-based-multi-edit-text-changes.md).

The application layer currently isolates the editor store's shared types, pure content-change helpers, whole-node Visual transitions, runtime snapshot and focus bookkeeping, text-session boundary state, the pure undo/redo change-site comparison, and save scheduling and watermark accounting in `editor-store-types.ts`, `editor-content-changes.ts`, `editor-node-visual-transitions.ts`, `editor-runtime-state.ts`, `editor-text-session.ts`, `editor-undo-focus.ts`, and `editor-save-scheduler.ts`. `editor-store.ts` remains the public application entry point: it assembles those collaborators, coordinates command side effects, and re-exports the public API.

Do not create empty architectural layers solely to match this diagram.

---

## 22. Architectural Invariants

The following rules should remain true unless the architecture is explicitly changed:

1. Product/business rules do not live in React components.
2. Domain logic does not depend on React, DOM, or Electron.
3. The persistent document does not depend on UI implementation details.
4. Electron-specific APIs do not leak into the domain.
5. Attachments are not embedded as base64 data in the document JSON.
6. Node IDs remain stable.
7. Parent relationships are derived from each tree; top-level root nodes have no parent node.
8. Navigation history is separate from the persistent document structure.
9. Undo/redo is separate from persistent document state.
10. Major architectural changes require explicit approval.

---

## 23. Architectural Changes

Architecture is allowed to evolve.

When a proposed change affects:

* technology stack;
* domain model;
* persistence model;
* process boundaries;
* dependency direction;
* major module boundaries;

the change must be proposed and approved before implementation.

Significant architectural decisions should be recorded as ADRs in:

```text id="v5v0qk"
docs/decisions/
```

Each ADR should explain:

* the problem;
* the considered alternatives;
* the chosen solution;
* the reasoning;
* the consequences.

Architecture documentation should be updated when the implementation changes materially.
