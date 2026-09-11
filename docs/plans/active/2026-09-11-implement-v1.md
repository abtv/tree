# Implement the Document Editor

```text
Status: Active
Created: 2026-09-11
```

## Goal

Replace the bootstrap screen with the complete local macOS document editor defined by `docs/PRODUCT.md`, while preserving the boundaries and technology choices in `docs/ARCHITECTURE.md`.

This plan does not change product requirements, the domain model, the persistence model, or the approved Electron/React/TypeScript/Vite architecture.

## Current State

The completed bootstrap provides:

- isolated Electron main, preload, and renderer entry points;
- a secure renderer configuration with context isolation and no Node.js integration;
- React, TypeScript, Electron Vite, ESLint, and Vitest;
- Node-default tests with opt-in jsdom renderer tests;
- development, type-check, lint, test, build, and full-check scripts;
- a minimal Electron window containing only a `Tree` heading.

The repository does not yet implement the domain, application, or infrastructure behavior described by the product specification. In particular, there is no document model, navigation, editing, history, persistence, clipboard integration, attachment storage, drag-and-drop behavior, or global `Cmd+0` shortcut.

## Scope and Constraints

The implementation will cover all requirements in `docs/PRODUCT.md`, including multiple top-level roots, one-level-at-a-time navigation, editable current-parent context, keyboard editing, deletion, undo/redo grouping, sibling reordering, clipboard transformations, image attachments, autosave, and application surfacing.

The following constraints apply throughout:

- Product rules remain in the domain or application layer, never in React components.
- The domain remains independent of React, the DOM, Electron, browser APIs, and filesystem APIs.
- Electron and filesystem capabilities cross the process boundary only through a typed preload API.
- Parent relationships are derived by traversing the trees; no redundant `parentId` is stored.
- Node and attachment IDs remain stable.
- No new state-management, drag-and-drop, schema, or utility dependency will be added unless implementation proves that platform APIs are insufficient.
- Packaging, signing, distribution, cloud sync, and requirements not present in `docs/PRODUCT.md` remain out of scope.

## Proposed Module Structure

Create modules only as they acquire implemented behavior:

```text
src/
├── domain/
│   ├── document/       # document types, traversal, validation, tree mutations
│   ├── navigation/     # current level, selection, enter/leave rules
│   └── history/        # document-only undo/redo transactions
├── application/
│   ├── editor-store.ts # observable application state and command coordination
│   ├── commands/       # editor use cases
│   └── ports.ts        # persistence, clipboard, attachment, clock, and ID ports
├── infrastructure/
│   ├── main/           # filesystem, clipboard, attachment, and Electron adapters
│   └── renderer/       # typed preload-backed application port adapters
├── main/               # window lifecycle, IPC registration, global shortcut
├── preload/            # narrow context-bridge API
├── renderer/
│   ├── components/     # editor, current parent, node row, attachment view
│   ├── hooks/          # store subscription and focus/caret coordination
│   └── test/           # renderer test setup and UI test helpers
└── shared/             # platform-neutral IPC request/response contracts
```

The exact file split may stay smaller where combining closely related behavior improves clarity. Empty placeholder directories will not be created.

## Data and Runtime State

### Domain document

Use plain TypeScript values representing:

- a `Document` with an ordered `roots` array;
- a `Node` with `id`, `text`, optional attachment reference, and ordered `children`;
- opaque string node and attachment IDs generated outside the domain.

Domain operations will return new document values or explicit results and will never generate IDs or perform I/O themselves. Traversal helpers will locate a node, its derived parent, its siblings, and its path without persisting parent links.

### Persistent representation

Implement a version-1 JSON envelope containing:

- `version: 1`;
- the document roots and attachment references;
- `currentParentId`, using `null` for the implicit document container;
- `selectedNodeId`.

The JSON will contain attachment IDs, not absolute paths or image bytes. Loading will validate the complete envelope, unique IDs, attachment references, and the relationship between current parent and selection before accepting it. A missing document creates the required initial empty root. Invalid or unsupported data enters a non-destructive load-error state and is not overwritten.

Autosave will serialize every accepted document or persisted-location change through a single ordered writer. The writer will use a temporary file and atomic replacement so overlapping saves cannot produce partial JSON and the latest state wins.

### Runtime-only state

Keep the following out of persistence:

- navigation history reconstructed for the current process;
- cursor and selection ranges inside text inputs;
- focused element and drag state;
- undo/redo history and the active text-edit session;
- pending focus/caret intents.

After loading, reconstruct the outward navigation path from tree ancestry. Undo and redo restore document snapshots only; application reconciliation keeps the current parent and selected node when they still exist and selects a deterministic valid node at the nearest surviving level otherwise.

## History Strategy

Use in-memory document snapshots at application-command boundaries. This is the simplest strategy that correctly restores subtree deletion, multiline paste, image attachment, splitting, and reordering while preserving stable IDs.

The first direct text mutation in a session records the pre-session document. Further direct text changes on the same node update that transaction. End the session on the product-defined boundaries:

- five seconds without a text change;
- focus moving to another node or field;
- an explicit cursor or text-selection move;
- cut or paste;
- a structural command;
- undo or redo.

Cursor movement caused by the text edit itself will not end the session. The history coordinator will accept explicit boundary signals from the UI and use an injected clock in tests. New document mutations clear redo history; navigation-only changes do not enter document history.

Attachment cleanup will consider the current document plus snapshots still reachable through undo/redo. A file is deleted only when none of those states references it. On startup, when runtime history does not exist, unreferenced attachment files will be removed after a valid document has loaded.

## Process and Infrastructure Design

The renderer will own the domain and application store. The Electron main process will own platform operations:

- load and atomically save the versioned document;
- store, read, and remove PNG attachment files under the application data directory;
- inspect the latest operating-system clipboard item and return one normalized image-or-text value, with image precedence when both are available;
- register and handle global `Cmd+0`;
- create, restore, show, and focus the application window.

The preload will expose only those typed operations through `contextBridge`; React will not import Electron or call IPC directly. Image clipboard data will be normalized to PNG before storage. The renderer will receive attachment bytes through the narrow API and use temporary object URLs for display, revoking them when no longer needed.

`Cmd+0` will be a main-process global shortcut. It will do nothing when the application window is already focused; otherwise it will restore and focus the existing window without sending any editor-state or caret-changing command to the renderer.

## Application and UI Design

Implement a small framework-free application store with `getSnapshot`, `subscribe`, and explicit editor commands. React will subscribe with `useSyncExternalStore`. Infrastructure ports and an ID generator will be provided when constructing the store, allowing application tests to use deterministic fakes.

Application commands will own all product transitions, including:

- editing and splitting text;
- creating roots, siblings, and the first child from a focused current parent;
- entering and leaving nodes;
- deleting a subtree and choosing a valid destination;
- moving siblings within the displayed level;
- applying text, multiline, and image clipboard values;
- undoing and redoing document changes;
- updating and persisting the current location.

The React editor will render:

- an editable, visually highlighted current parent only when inside a node;
- the ordered roots or current parent's children as single-line text inputs;
- an optional image below the node text;
- same-level drag affordances and insertion feedback;
- a non-destructive load-error view when persisted data cannot be opened safely.

UI handlers will translate keyboard, input, focus, selection, composition, clipboard, and drag events into commands. Command results will include a focus/caret intent where required, so the UI can place the caret without reimplementing navigation rules. Browser-native undo/redo and paste handling will be intercepted in the editor so the application history and clipboard rules remain authoritative.

## Implementation Phases

### Progress

- Phase 1 completed on 2026-09-11.
- Phase 2 completed on 2026-09-11.
- Phase 3 completed on 2026-09-11.

### Phase 1: Domain foundation and persistence contract

- Add document, node, attachment-reference, persistent-location, and IPC types.
- Add pure traversal, lookup, relationship, cloning, and invariant-validation helpers.
- Add initial-document creation using an injected ID source.
- Define and test version-1 serialization/deserialization and safe validation.
- Update TypeScript and ESLint coverage for the new architectural folders.
- Record the snapshot-history and attachment-retention choice as an ADR because it affects several later modules while remaining within the approved architecture.

Gate: domain and persistence-contract tests pass, followed by `npm run check` and a focused commit.

### Phase 2: Document operations, navigation, and history

- Implement node editing, sibling creation and splitting, subtree deletion, same-level movement, text paste, multiline paste, and image attachment operations.
- Implement top-level and nested selection, editable-current-parent behavior, enter/leave navigation, and deterministic state reconciliation.
- Implement snapshot undo/redo and the continuous-text-session boundary coordinator with an injectable clock.
- Cover every edge case in Product sections 2 through 11 independently of React and Electron.

Gate: pure domain/application unit tests pass, followed by `npm run check` and a focused commit.

### Phase 3: Application store and platform services

- Build the editor store, command surface, subscriptions, and asynchronous command sequencing.
- Implement main-process persistence, attachment storage, clipboard normalization, and cleanup.
- Add typed IPC handlers and the context-isolated preload API.
- Implement the global `Cmd+0` lifecycle, including registration cleanup and active-window no-op behavior.
- Test services with temporary directories and mocked Electron-facing boundaries.

Gate: application and infrastructure tests pass, followed by `npm run check` and a focused commit.

### Phase 4: Minimal complete editor UI

- Replace the bootstrap heading with the current-parent context and displayed-level node list.
- Wire inline editing, selection, focus, caret placement, arrow navigation, Enter, `Cmd+.`, `Cmd+,`, `Cmd+Backspace`, undo, and redo to application commands.
- Handle input composition and distinguish explicit cursor movement from cursor advancement caused by typing.
- Initialize from persistence before exposing the editable view and autosave accepted state changes.
- Add jsdom tests for command dispatch plus visible focus/caret outcomes.

Gate: a keyboard-only text-tree workflow works in Electron, automated UI tests pass, followed by `npm run check` and a focused commit.

### Phase 5: Clipboard, images, and drag-and-drop

- Wire cut and paste boundaries to history.
- Implement plain text, multiline text, mixed clipboard precedence, and image paste flows.
- Render stored images and enforce one image per node with the specified sibling fallback.
- Implement native same-level sibling drag-and-drop while preventing cross-level moves.
- Add UI/application tests for transformations, selection results, attachment lifetime, and reorder behavior.

Gate: all Product sections 12 through 19 are covered, followed by `npm run check` and a focused commit.

### Phase 6: Integrated validation and completion

- Run the full automated product test matrix and `npm run check`.
- Manually smoke-test the Electron application on macOS for global `Cmd+0`, app switching with caret preservation, drag-and-drop, clipboard image input, persistence across restart, and invalid-data protection.
- Review architectural imports and confirm no product logic moved into React or Electron adapters.
- Update `README.md` only to replace obsolete bootstrap wording and document the implemented application workflow.
- Update architecture or development documentation only if implementation details materially require it; do not alter approved product behavior.
- Update this plan to `Status: Completed`, add the completion date and outcome, and move this same file to `docs/plans/completed/` without copying it.
- Run `npm run check`, review the final diff and repository status, and commit the completion changes.

## Test Matrix

Automated tests will cover, at minimum:

- multiple roots, empty nodes, stable IDs, and derived parent relationships;
- sibling navigation with horizontal caret preservation;
- all Enter split positions and image retention;
- entering, leaving, and editing a current parent with and without children;
- all subtree deletion destinations, including deletion of the focused current parent and the last root;
- document-only undo/redo for every mutation and every text-session boundary using fake time;
- same-level drag reorder constraints and subtree preservation;
- plain, multiline, empty-line, and mixed-representation clipboard inputs;
- image replacement fallback, selection, cursor placement, and attachment reference cleanup;
- versioned persistence round trips, invalid data, unsupported versions, stable IDs, location restoration, atomic save ordering, and missing attachments;
- `Cmd+0` active-window no-op and inactive/minimized surfacing without renderer state mutation;
- React focus, input, composition, caret, keyboard, paste, and drag event integration.

Manual macOS validation remains necessary for operating-system global shortcut delivery, application activation, native clipboard image formats, and real drag behavior; pure decision logic around those integrations will still be automated.

## Documentation and Commit Strategy

- `docs/PRODUCT.md` requires no change because the implementation follows the approved requirements.
- `docs/ARCHITECTURE.md` requires no planned change because the proposed boundaries implement the existing architecture.
- Add an ADR for the cross-cutting history/attachment-lifetime choice before implementing it.
- Update `README.md` when the application is genuinely runnable as the documented editor.
- Keep this active plan current after each phase.
- Commit the approved plan first, then keep implementation commits focused by phase rather than placing the entire product in one oversized commit.

## Risks and Mitigations

- **Focus and caret regressions:** centralize focus intents, keep caret mechanics in the UI, and test every command result in jsdom plus a native smoke pass.
- **Undo grouping errors:** isolate the history coordinator, inject time, and exhaustively test every session boundary.
- **Data loss:** validate before accepting a load, never overwrite invalid input, serialize writes, use atomic replacement, and test save races.
- **Attachment loss or leaks:** calculate references across current and reachable history states and test deletion, undo, redo invalidation, and restart cleanup.
- **Electron boundary leakage:** use one typed preload surface and lint architectural imports.
- **Platform-only failures:** keep Electron-facing decisions small and mockable, then explicitly validate the remaining macOS behavior manually.

## Product Owner Decisions

No unresolved product or architecture decision remains in this plan. Implementation should stop and return to the Product Owner if a newly discovered ambiguity would change user-visible behavior, persisted data, or an architectural boundary.
