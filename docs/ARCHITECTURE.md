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

The domain invariant `MAX_DOCUMENT_DEPTH = 20` counts top-level roots as level 1. Nodes at level 20 may be edited and entered but cannot receive children. Domain creation, document assertions, and persisted-state parsing reject any node below level 20 with `Nodes cannot be nested deeper than 20 levels.`; the schema version remains 2.

Do not store redundant `parentId` fields unless there is a demonstrated technical need and the data model is explicitly changed.

Node IDs are stable identifiers.

Changing a node's position must not change its ID.

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

Sibling creation, splitting, pasting, editing, and reordering do not increase node depth and remain available at level 20. A rejected child creation is an explicit application transition result, so callers can present the operation error without changing the document, location, focus, history, generated IDs, or persistence queue.

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

External hyperlink opening is handled by the Electron shell. The renderer renders link anchors, while the main process validates HTTP(S) URLs and delegates approved URLs to the operating system's default hyperlink application.

The main process treats the preload API as an untrusted boundary: every IPC call must originate from the configured application renderer, and IPC arguments are validated at runtime before filesystem, clipboard, or application operations run. Renderer navigation is restricted to the packaged renderer document (or the configured development renderer URL), while external links open only through the validated shell path.

Attachment writes are limited to validated IDs, PNG data, and a bounded payload size.

Before application shutdown is allowed to complete, the main process asks the renderer to flush its queued persistence work. The renderer then acknowledges shutdown through the trusted IPC path. PNG attachment writes validate the PNG signature and required image header before bytes are stored.

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
* undo/redo history.

Only the state explicitly required by the product specification should be persisted.

Exact cursor position, focus state, navigation stack, and undo/redo history are runtime state unless the product specification changes.

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

The history implementation uses whole-document snapshots. The domain never mutates an existing document; every operation returns a new document, and structural commands deep-copy before mutating. Because of that invariant, the history retains the current document objects by reference instead of deep-cloning them on `begin`, `undo`, or `redo`. Text-edit states share unchanged subtrees with the live document, while structural states already hold an independent copy.

The history is bounded to 200 entries. One entry is one text-editing session or one structural command. When the limit is exceeded, the oldest entry is discarded and can no longer be undone. The redo stack is bounded by the same limit.

The choice of snapshots keeps undo/redo correct and simple. A future history bound change or a move to command/inverse-operation history must preserve the same user-visible undo depth and attachment reachability.

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
  "version": 1,
  "tree": {},
  "uiState": {}
}
```

The exact schema is defined by the implementation and product requirements.

Persistence must support future schema evolution.

The application must flush queued saves before a normal quit completes. A persistence failure must not silently discard the in-memory document; it is surfaced to the user and a later successful save clears the error state.

Closing the main window is treated as a quit request: the main process intercepts the window close, runs the same renderer flush handshake as `Cmd+Q`, and only allows the application to quit after the renderer confirms. If the flush fails or times out, the window remains open and the failure is surfaced.

The renderer applies an automatic save policy rather than saving on every keystroke. The store tracks whether changes are pending, counts inserted words against a ten-word volume threshold, and resets a ten-second idle timer on every persisted change. Image insertion and hyperlink insertion request an immediate save. Structural commands that insert no content mark changes pending and reset the idle timer without saving by themselves. Counters are captured and reset when a save is requested; a failed save keeps the changes pending and schedules a retry on the next idle interval, volume trigger, or flush. `flushPersistence` forces a save of pending changes before awaiting the queue, so quit always persists them.

The editor tracks pending asynchronous cut and paste operations. Shutdown flushing waits for those operations, then their queued persistence, and checks for additional pending edits before completing. Operation failures reject the active flush and prevent its quit acknowledgment. The persistence coordinator retains document-save failures separately from cleanup results so cleanup alone cannot authorize quit with unsaved changes.

Document saves and attachment filesystem operations are serialized by the file-service operation queue. The application also queues attachment cleanup with persistence work, so cleanup cannot race a save or another cleanup, and cleanup failures follow the same visible error and shutdown-flush path as save failures. File-service operations emit structured operation names, phases, and filesystem paths for diagnosing boundary failures.

Attachment cleanup is no longer part of every save cycle. The store marks cleanup dirty only where attachment reachability can change: structural deletes, undo, redo, history eviction, and initialization. The coordinator runs cleanup after the save that persists the new referenced set, never before it, so a crash cannot leave the persisted document referencing a file that was already deleted. When document changes are pending, a requested cleanup waits for the next save; startup cleanup with no pending changes may run without a save. Attachment cleanup retains files referenced by the live document, every retained history snapshot, and pending attachment writes.

Loading invalid or unsupported data must fail safely rather than silently corrupting the document.

File recovery checks temporary and backup candidates with the domain parser and verifies their referenced attachment files before promoting a candidate to the primary path. Invalid candidates are left untouched while the next fallback is considered. A syntactically readable primary document continues through ordinary application validation; recovery does not silently replace an unsupported primary document.

The file-service `null` load result is reserved for missing document files. A primary file containing JSON `null` is rejected as unsupported at the file boundary, preserving the primary and recovery files instead of triggering first-launch initialization.

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
* ensuring attachment references remain valid.

Reads, writes, and cleanup operations are ordered through the same infrastructure queue. Cleanup is therefore idempotent with respect to overlapping application requests rather than relying on concurrent unlink calls to succeed.

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

The application installs only a minimal application menu, so macOS does not route the standard editing commands (Undo, Redo, Cut, Copy, Paste, Select All) to the renderer, and the native `copy`, `cut`, and `paste` DOM events do not fire. The editor key handler must own these commands: intercept the shortcut, prevent the native default, and perform the operation through the editor store and the clipboard service. The application must not rely on native menu routing or native clipboard DOM events. See `docs/decisions/0003-renderer-owns-standard-editing-commands.md`.

---

## 16. Electron Integration

Electron-specific behavior belongs outside the domain.

Electron is responsible for desktop functionality such as:

* creating and managing the application window;
* persisting and restoring the main window's size and position;
* application activation;
* global or main-process keyboard shortcuts where required;
* integration with macOS;
* communication between the main and renderer processes;
* access to desktop APIs.

The domain must not import Electron APIs.

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

The renderer currently isolates DOM/caret behavior in `editor-dom.ts`, location rendering in `LocationBar.tsx`, and attachment rendering/preview in `AttachmentPreview.tsx`. These modules remain UI adapters and dispatch document changes through the application layer.

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
