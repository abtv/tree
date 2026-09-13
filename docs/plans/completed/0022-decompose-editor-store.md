# Decompose EditorStore

Status: Completed
Created: 2026-09-13
Completed: 2026-09-13

## Goal

Reduce the responsibilities and size of `EditorStore` without changing editor behavior, persistence semantics, or its public interface.

## Current State

`EditorStore` currently owns editor commands and UI state as well as snapshot history and serialized persistence/attachment-cleanup scheduling. This makes a central application-layer class harder to navigate and change safely.

## Approach

1. Extract document snapshot history and location reconciliation into a focused application-layer collaborator.
2. Extract serialized save and attachment-cleanup scheduling into a focused application-layer collaborator with a narrow callback boundary for current state, referenced attachments, and user-visible errors.
3. Keep `EditorStore` as the command and editor-state coordinator; retain its public API and existing product behavior.
4. Add focused tests for the extracted collaborators, preserve the existing store, property, Electron E2E, and performance coverage, and run full validation.

## Progress

* Extracted `EditorHistory` for snapshot storage, undo/redo transitions, and location reconciliation.
* Extracted `PersistenceCoordinator` for coalesced save and attachment-cleanup work.
* Added focused collaborator tests while retaining the `EditorStore` public interface and existing behavior tests.

## Affected Modules

* `src/application/editor-store.ts`
* `src/application/editor-history.ts`
* `src/application/persistence-coordinator.ts`
* associated unit tests
* `docs/ARCHITECTURE.md`

## Risks

The persistence queue and undo/redo reconciliation are behaviorally sensitive. The extraction must preserve serialization, error visibility, attachment retention, queue coalescing, and focus/location reconciliation exactly.
