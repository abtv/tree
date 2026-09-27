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
└── children
```

The parent relationship is derived from the tree structure.

`links` is a list of non-overlapping ranges into `text`. Each range stores its HTTP(S) URL, which must equal the text covered by the range. Version-one persisted documents without links are migrated in memory and are saved using the version-two format.

The domain invariant `MAX_DOCUMENT_DEPTH` enforces the product depth limit defined in `docs/PRODUCT.md` §2.3, counting top-level roots as level 1. Domain creation, document assertions, and persisted-state parsing reject a document that exceeds the limit with the product operation error; the schema version remains 2.

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

They should not implement core tree manipulation rules.

For example, an `Enter` key handler should not directly manipulate the tree structure.

Instead, it should invoke the appropriate application/domain operation.

A top-level React error boundary wraps the application in `src/renderer/ErrorBoundary.tsx`. It catches render and lifecycle errors that would otherwise leave an empty window, logs diagnostics, and shows a fallback with a `Reload` action that restarts the renderer from persisted state. Errors from event handlers and asynchronous work continue to flow through the application error surface rather than the boundary.

The displayed sibling list is rendered by `src/renderer/NodeList.tsx`, which composes the memoized row component in `src/renderer/NodeRow.tsx`. Above the displayed-sibling threshold owned by `docs/PRODUCT.md` §20.1 it mounts only the rows near the viewport plus an overscan and represents the skipped rows as leading and trailing spacers, so the page scrollbar and scroll position still cover the whole list. The focused row stays mounted even when it is off-screen, so a focus intent always has an input to receive the caret; because the mounted rows are keyed by node id in one list, React moves the same input into the window instead of remounting it. Mounted rows report their height through a `ResizeObserver` and unmeasured rows use an estimate, so wrapped rows keep offsets correct; a width change invalidates the measured heights. Dragging near the window edge auto-scrolls the page so a drag can reach an off-screen position. While a hold is pending, a row `pointerleave` that reports no pressed buttons is a browser hover reset rather than the held pointer leaving the row, so it does not cancel the pending hold; a real leave with the primary button still down does. The pure window and offset math lives in `src/renderer/list-window.ts` and the list geometry and measurement helpers live in `src/renderer/node-list-layout.ts`, both unit-testable without a browser. One resolved drag state owns the freeze: `resolveNodeDrag` in `src/renderer/node-drag.ts` folds the persistence lock and source-row availability into the gesture state, and `use-node-list-drag.ts` projects that single state into the body-level drag class, the source-row marker, the drop marker, pointer capture, and the caret suspension. The caret authority in `use-node-input-bindings.ts` suspends the captured caret through the pure record helpers in `src/renderer/drag-caret-freeze.ts` and restores it when the frozen pointer is released, so the drag layer never writes caret state itself. At or below the threshold the list renders every row exactly as before.

`EditorStore` exposes a `structuralVersion` on ready snapshots that advances when the displayed node identities or order can change — structural document replacement, navigation between levels, undo, and redo — but not for text edits or selection changes. The renderer uses it to keep layout recomputation out of the typing path.

The renderer stylesheet `src/renderer/styles.css` owns every color value as a CSS custom property declared once under `:root` and overridden for the dark appearance in the single `@media (prefers-color-scheme: dark)` `:root` block; rules reference the properties through `var()`, and no color literal appears outside a custom-property declaration. One `--highlight-background`/`--highlight-foreground` pair per appearance is shared by the whole-node Visual selection, character `::selection`, selected hyperlinks, and the Vim mode badge, so those surfaces cannot drift apart. Values that do not adapt to the dark appearance are declared once without an override. The committed Playwright screenshot baselines remain the pixel oracle for these styles.

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
* the mounted window of the displayed sibling list, its measured row heights, and drag auto-scroll state.

Only the state explicitly required by the product specification should be persisted.

Exact cursor position, focus state, navigation stack, undo/redo history, and the windowed list's mounted range and height table are runtime state unless the product specification changes.

Renderer-local interaction state follows a single-owner pattern. State that spans commands or events — the Normal-mode caret target and pending hyperlink-draft check, the Vim register and pending Insert or Replace session, the pending command with the last repeatable change, character find, and character Visual endpoints, the structural Insert session, and the drag caret-freeze record — lives in one pure owner module that stays free of React, DOM, Electron, filesystem, and store dependencies. `use-node-input-bindings.ts` holds one instance of each owner and is the single place that projects that state into React, the DOM, and the store, alongside the hook-local facts (its caret authority and the pending hyperlink draft) that each have one writer. Handlers and components act through owner transitions — including owner-backed access-time handles where a handler needs direct field access — and must not keep a parallel copy of a fact or resynchronize it at each call site. When defects cluster around one state, multiple owners or scattered resynchronization calls are the design cause to check first. The pattern, its defect evidence, and its boundaries are recorded in [ADR 0014](decisions/0014-single-owner-for-renderer-interaction-state.md).

---

## 10. Navigation

Navigation is separate from the document's trees.

The root collection and its trees represent the document structure.

Navigation represents where the user currently is in the document structure.

The application maintains:

* current parent, which is absent at the top-level document container;
* selected node;
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
* sibling reordering;
* multiline paste;
* image attachment;
* node splitting.

The history implementation uses whole-document snapshots. The domain never mutates an existing document; every operation returns a new document. Every editing and structural command path-copies only the nodes from the top-level root to the affected sibling array, and shares every unaffected subtree by reference with its input. Because of that invariant, the history retains the current document objects by reference instead of deep-cloning them on `begin`, `undo`, or `redo`, and consecutive states share unchanged subtrees whether the change was a text edit or a structural command.

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
  "version": 2,
  "document": {
    "roots": [
      {
        "id": "root-id",
        "text": "Root text",
        "children": []
      }
    ]
  },
  "location": {
    "currentParentId": null,
    "selectedNodeId": "root-id"
  }
}
```

The exact schema is defined by the implementation and product requirements.

Persistence must support future schema evolution.

The application must flush queued saves before a normal quit completes. A persistence failure must not silently discard the in-memory document; it is surfaced to the user and a later successful save clears the error state. In the locked save-failure state, quitting offers an explicit confirmation that bypasses the flush; it is the only path that discards changes without saving.

Closing the main window is treated as a quit request: the main process intercepts the window close, runs the same renderer flush handshake as `Cmd+Q`, and only allows the application to quit after the renderer confirms. If the flush fails or times out, the window remains open and the failure is surfaced.

The renderer applies the automatic save policy defined in `docs/PRODUCT.md` §16.1 rather than saving on every keystroke. The store tracks whether changes are pending, counts inserted words against the volume threshold, and resets the idle timer on every persisted change. Image insertion and hyperlink insertion request an immediate save. Structural commands that insert no content mark changes pending and reset the idle timer without saving by themselves. Inserted-word accounting uses two bounded scalar watermarks: a cumulative inserted-word count and the cumulative count acknowledged by the latest successfully persisted snapshot. When the coordinator captures the document state for an actual service save, the store records the watermark in that snapshot; only a successful document save advances the acknowledged watermark. A failed save, and a cleanup-only success, leave it unchanged, so an earlier successful save cannot acknowledge edits made after its snapshot was captured and a later failed save cannot lose its accounting. The volume trigger compares the cumulative and acknowledged watermarks. `flushPersistence` forces a save of pending changes before awaiting the queue, so quit always persists them.

The store counts consecutive failed document saves. The coordinator reports whether a failed cycle was a document save or an attachment cleanup so the two are retried differently. After three consecutive document-save failures the store stops scheduling automatic save attempts, discards any save request already queued, and enters the locked save-failure state defined in `docs/PRODUCT.md` §16.2: mutating commands are rejected in the application layer, navigation, selection, and copy remain available, and the renderer presents the failure with restart guidance. A successful save resets the failure count and releases the lock. Quit and window close still attempt a final save through the flush handshake; if that save fails while locked, the renderer asks for explicit confirmation and a dedicated trusted IPC operation quits without flushing.

The editor tracks pending asynchronous cut and paste operations. Shutdown flushing waits for those operations, then their queued persistence, and checks for additional pending edits before completing. Operation failures reject the active flush and prevent its quit acknowledgment. The persistence coordinator retains document-save failures separately from cleanup results so cleanup alone cannot authorize quit with unsaved changes.

Document saves and attachment filesystem operations are serialized by the file-service operation queue. The application also queues attachment cleanup with persistence work, so cleanup cannot race a save or another cleanup, and cleanup failures follow the same visible error and shutdown-flush path as save failures. File-service operations emit structured operation names, phases, and filesystem paths for diagnosing boundary failures.

Document and attachment writes share the same durable-write sequence: the bytes go through a file handle, are flushed with `fsync`, and the handle is closed before the operation reports success. A document save flushes the data directory after the rotation and replacement renames, so the preserved generation and the new primary are durable together before the save reports success; pruning runs after that flush and stays best-effort. An attachment write flushes the attachments directory, because the attachment file is created for the first time and the document reference recorded by a later save must never outlive the attachment data or its directory entry. A failed flush rejects the write instead of reporting success, so the renderer cannot record a reference to an attachment that was not stored.

Persisted state is serialized without cloning the in-memory document, which the domain immutability invariant guarantees is never mutated after creation. The renderer validates the document and its location before sending the payload. The main process enforces the same persisted-state invariants on the untrusted IPC payload without rebuilding the document, and rejects malformed or over-depth input before any filesystem operation. Persisted-state validation performs a single traversal: while it checks every node, it records the selected node's parent and whether the current parent exists, so it resolves the location without constructing the derived node index or walking the document a second time. Parsing, schema migration, and link normalization remain on the load path, where older or non-canonical files are read.

Attachment cleanup is no longer part of every save cycle. The store marks cleanup dirty only where attachment reachability can change: structural deletes, undo, redo, history eviction, discarding the redo branch when a new edit begins, and initialization. The coordinator runs cleanup after a save, never before one. A cleanup requested while document changes are pending waits for the next save; startup cleanup with no pending changes may run without a save. Because the main-process keep set includes every document file on disk, cleanup cannot delete an attachment that the persisted document still references even when newer edits have not been saved yet. Attachment cleanup retains files referenced by the live document, every retained history snapshot, and pending attachment writes. The referenced set is computed from the live document's derived attachment summary plus the history's incrementally maintained union over retained summaries, so cleanup rescans neither the live document nor retained snapshots. A failed cleanup is retried on its own rather than through a document save: the store schedules cleanup-only attempts at the idle interval for at most three consecutive failures, then leaves the cleanup pending so the coordinator attempts it again on the next save or quit. Cleanup failures never lock the editor and never mark document changes pending.

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
* application activation;
* global or main-process keyboard shortcuts where required;
* integration with macOS;
* communication between the main and renderer processes;
* access to desktop APIs.

The domain must not import Electron APIs.

Window geometry is persisted with a short debounce, so moving or resizing the window does not perform a synchronous disk write for every event. The pending geometry is flushed when the window closes.

The always-on-top preference is stored as one validated boolean in the main-process window-state directory. Toggling it performs one small write and one native window update; it adds no work to document editing or navigation paths and retains no growing in-memory structure. Existing installations without the preference default to an unpinned window.

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

`vim-edit-session.ts` owns the renderer-local Vim register and the one pending Insert or Replace session, together with the pure diff and Replace-commit helpers. `vim-command-state.ts` owns the pending command, the last repeatable change, the last character find, the character-wise Visual endpoints, and the one structural Insert session. `use-node-input-bindings.ts` holds one instance of each owner and projects their results into React, the DOM, and the store; it performs its command-state writes through that module's transitions, and owner-backed access-time handles keep `vim-keyboard-handler.ts`'s direct reads and writes in the same object. It finishes a pending session through one shared policy for Escape, blur, a same-node pointer click, application shortcuts, and undo/redo. A plain Insert session stamps its captured diff with its origin node so dot-repeat replay cannot apply it after a node change, and a structural Insert session records its origin node so the incidental blur that begins its new node does not end it.

Each caret transition performs constant-time arithmetic and retains only a cursor and optional return position. Counted navigation invokes one transition per motion step as before. It adds no disk writes or syncs, no work that scales with document size or edit count, and no growing history. The bounded property tests exercise counted motion and return-position invariants across varied text lengths and node layouts, and a bounded mixed-sequence guard compares the production Vim keyboard handler and `EditorStore` with an independent expected-state model over generated interaction sequences.

The renderer currently isolates DOM/caret behavior in `editor-dom.ts`, the Normal-mode caret target and pending hyperlink-draft currency in `link-caret.ts`, pure Vim motion and text-object calculations in `vim-editing.ts` and `vim-text-commands.ts`, surround delimiter and edit calculations in `vim-surround.ts`, the Vim register and Insert/Replace session owner plus session-completion helpers in `vim-edit-session.ts`, the Vim command-state owner in `vim-command-state.ts`, Vim command dispatch in `vim-keyboard-handler.ts`, keyboard state types in `vim-keyboard-types.ts`, and standard shortcuts and context-menu routing in `editor-input-handlers.ts`. Location rendering lives in `LocationBar.tsx`, attachment rendering/preview in `AttachmentPreview.tsx`, list geometry and measurement in `node-list-layout.ts`, row presentation in `NodeRow.tsx`, and drag interaction in `use-node-list-drag.ts` with the pure gate fold in `node-drag.ts` and the pure caret-freeze record in `drag-caret-freeze.ts`; `use-node-input-bindings.ts` holds one `vim-edit-session.ts` owner and one `vim-command-state.ts` owner and owns renderer-local Vim mode, image-caret return position, and the drag caret freeze. It reconciles the image-caret indicator with a new store focus token; a command that produces no new focus intent leaves the local caret and saved return position intact. An explicit image destination consumes the new token so a later render does not replace it with the store's text boundary. The whole-node Visual selection stores only two displayed sibling IDs in `App.tsx`, and `NodeList.tsx` renders highlighting by comparing their indices with mounted rows, including pinned focused rows in a windowed list. The selected subtree range is derived from the document when a command executes; selection is not persisted. These modules remain UI adapters and dispatch completed document changes through the application layer.

Vim text mutations use the same application-layer edit and history path as ordinary text edits. The local Vim register is renderer-local and holds either one node-sized string, one immutable subtree snapshot, or one ordered forest snapshot; structured puts go through an application transition that remaps every node ID and updates attachment reachability. The register is neither persisted nor sent across IPC. Motions and range edits scan only the active node text; subtree puts additionally scale with the copied subtree. Repeat state retains one command descriptor and, for Insert and Replace changes, only the most recent replacement text. The last character-find and active Replace baseline are each bounded by one current-node value. Counts stop at text boundaries; counted text puts allocate the requested output once, and counted dot changes scale with the requested repetitions. These commands add no direct disk operations beyond the existing autosave path and do not accumulate state across edits.

Whole-node Visual commands dispatch through `EditorStore` and replace a sibling interval in one immutable domain operation and one history entry. The local register can also hold an ordered forest snapshot and original source IDs. Subtree pastes allocate fresh IDs; the store rejects a paste into a descendant of a still-present source node before mutation. The source IDs are used only for this runtime ancestry check. Structural repeat retains one bounded descriptor with a source snapshot when needed and reissues application commands from the current node; a count performs independent commands. Case changes traverse the selected subtrees, and range replacement adjusts cached attachment multiplicities from the removed and inserted subtrees. No selection or repeat state is persisted or sent across IPC.

Performance assessment (§22.1): text-object calculations scan only the active node text. Node Visual endpoints and the repeat descriptor are constant-size state apart from one captured subtree forest, bounded by the most recent register or repeatable put. Computing a selected sibling interval scans the current displayed level; highlighting compares indices for mounted rows, so ordinary typing outside Node Visual mode does not gain a list scan. Bulk commands traverse only selected subtrees plus the copied sibling array and ancestor path; repeated puts scale with the requested count and copied forest size. A command adds one history snapshot and the existing autosave scheduling, with no new direct disk writes or syncs. The wide-list Node Visual performance guard checks interactive selection latency and mounted-row bounds.

The domain currently isolates shared document types, hyperlink normalization, the derived node index, attachment accounting, tree operations, and persisted-state parsing in `document-types.ts`, `document-links.ts`, `document-index.ts`, `document-attachments.ts`, `document-operations.ts`, and `document-serialization.ts`. `document.ts` remains the public domain entry point and re-exports the domain API from those modules.

`document-links.ts` offers two link-preserving text edits with different contracts. `replaceLinkedText` recovers the changed region by diffing the text before and after, for callers that observe only the resulting string, such as a native `contenteditable` mutation. `replaceLinkedTextRanges` takes an ordered list of disjoint edits and remaps link offsets by position, for callers that know their edit positions and change more than one place at once; `EditorStore.replaceTextRanges` applies it through the same single-history-entry path as `replaceTextRange`. See ADR [0013](decisions/0013-position-based-multi-edit-text-changes.md).

The application layer currently isolates the editor store's shared types, pure content-change helpers, whole-node Visual transitions, runtime snapshot and focus bookkeeping, text-session boundary state, and save scheduling and watermark accounting in `editor-store-types.ts`, `editor-content-changes.ts`, `editor-node-visual-transitions.ts`, `editor-runtime-state.ts`, `editor-text-session.ts`, and `editor-save-scheduler.ts`. `editor-store.ts` remains the public application entry point: it assembles those collaborators, coordinates command side effects, and re-exports the public API.

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
