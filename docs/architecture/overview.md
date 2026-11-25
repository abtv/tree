# Architecture Overview

## 1. Purpose

The architecture description, which `docs/ARCHITECTURE.md` indexes, states the technical architecture of the application, the responsibilities of its major parts, and the boundaries between them.

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
* a Swift helper using Apple Vision for macOS image recognition (ADR 0025);
* Vite for the frontend development and build tooling.

Do not change the core technology stack without explicit Product Owner approval.

### 2.1 Platform Entry Points and Browser Build

Platform entry points live in `src/electron/main/`, `src/electron/preload/` and `src/web/`. Shared domain, application, renderer, contracts and infrastructure are directly under `src/`. Browser build and server tools live in `scripts/web/`.

The browser entry detects Apple device identity through `src/web/device.ts` and injects the Apple or non-Apple shortcut profile (§8.7) into `App`. `src/web/services.ts` uses the same device module to decide whether Vim editing is available (PRODUCT.md §1.4). These are separate decisions: the shortcut profile does not determine the editing policy.

The browser implementation under `src/web/` reuses the React renderer, application store and domain through a browser `TreeApi` adapter, using IndexedDB and Web Locks. A separate Vite build writes a standalone static package to `out/web/` with the same browser adapter and storage identity; the host serves files without a Node.js runtime. The package is published at <https://tree-editor.github.io> through the verified release pipeline (§2.3); its browser compatibility and storage constraints are in [Browser version](../../src/web/README.md).

### 2.2 Browser Deferred Rich Editing

The browser composition opts into `App.deferRichEditing`. App derives native editing availability from the Vim preference and mode and passes it to Tree, current-parent and Agenda inputs. `NodeInput` changes `contenteditable` on the rich field and keeps a non-editable field focusable with `tabindex`. Electron keeps the default native-editing path, and the option does not apply to plain textareas.

Performance assessment (PRODUCT.md §22.1): deferred rich editing causes no document writes, syncs, retained snapshots or document traversal. Mode changes update attributes on the bounded set of mounted inputs.

### 2.3 Validation and Release Pipeline

The validation workflow's jobs and release gate are listed under
[GitHub Actions](../DEVELOPMENT_REFERENCE.md#github-actions). Its successful
main run dispatches demo publication and, only for a new version, the combined
Web/macOS release. Dispatch consumers authenticate the exact successful validation
run and attempt through GitHub; signed provenance retains that validation identity
across release retries. The shared release gate reserves an immutable version tag
before either platform starts, and Web preflight and transfer recheck the reservation.
Tag eligibility and recovery after main advances follow
[macOS releases](../releasing.md#create-a-release).
A gated, short-lived GitHub
App token writes package/provenance paths to the separate hosting
repository. After the gate, a separate OIDC signing job attests the complete
manifest, including independently authenticated retained assets. The publisher
replaces the whole `site/` tree, removing unlisted bytes. The target workflow
obtains verifier code from source main at an independently resolved immutable SHA;
it never executes target scripts. It verifies the detached attestation and hashes,
source run/SHA/attempt and current heads. A separate Pages/OIDC write job deploys
the read-only verifier's artifact. The App has no Workflows write permission.
This protects against a stolen target publisher token; the parties that remain
trusted are listed in [`docs/SECURITY.md`, Browser publication](../SECURITY.md#browser-publication). Browser-local
documents never enter this pipeline. Setup and trust boundaries are described in
[Browser publication](../../deployment/github-pages/README.md).

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
└────────────────────────────┘

┌─────────────────────────────┐
│       Infrastructure        │
│ Persistence / Clipboard /   │
│ Attachments / Electron APIs │
└─────────────────────────────┘
```

These are logical boundaries.

Arrows show dependency direction. Infrastructure implements application/domain
interfaces; the domain does not depend on infrastructure implementations (§18).

They do not require a separate npm package or process for every layer.

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

The source tree has one directory per layer or process. Most modules sit directly in their layer directory; subdirectories exist only where listed:

```text id="0q0fvr"
src/
├── domain/
├── application/
│   ├── notes-archive/
│   └── test/
├── infrastructure/
│   ├── archive/
│   ├── main/
│   │   └── notes-archive/
│   └── renderer/
├── renderer/
│   ├── assets/
│   │   └── fonts/
│   └── test/
├── electron/
│   ├── main/
│   ├── native/
│   └── preload/
├── web/
│   ├── archive/
│   ├── backup/
│   ├── public/
│   └── workers/
├── shared/
└── test/
```

`test/` directories under `src/`, `src/application/` and `src/renderer/` hold shared test support. Add a subdirectory when a group of modules needs its own boundary, not in advance.

The domain isolates shared document types, hyperlink normalization, the derived node index, attachment accounting, tree operations, and persisted-state parsing in `document-types.ts`, `document-links.ts`, `document-index.ts`, `document-attachments.ts`, `document-operations.ts`, and `document-serialization.ts`. `document.ts` is the public domain entry point and re-exports the domain API from those modules.

`document-links.ts` offers two link-preserving text edits with different contracts. `replaceLinkedText` recovers the changed region by diffing the text before and after, for callers that observe only the resulting string, such as a native `contenteditable` mutation. `replaceLinkedTextRanges` takes an ordered list of disjoint edits and remaps link offsets by position, for callers that know their edit positions and change more than one place at once; `EditorStore.replaceTextRanges` applies it through the same single-history-entry path as `replaceTextRange`. See ADR [0013](../decisions/0013-position-based-multi-edit-text-changes.md).

The application layer isolates the editor store's shared types, pure content-change helpers, whole-node Visual transitions, runtime snapshot and focus bookkeeping, text-session boundary state, the pure undo/redo change-site comparison, and save scheduling and watermark accounting in `editor-store-types.ts`, `editor-content-changes.ts`, `editor-node-visual-transitions.ts`, `editor-runtime-state.ts`, `editor-text-session.ts`, `editor-undo-focus.ts`, and `editor-save-scheduler.ts`. `editor-store.ts` is the public application entry point: it assembles those collaborators, coordinates command side effects, and re-exports the public API.

§21.1 lists the renderer modules that isolate DOM, caret and Vim behavior.

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
