# Extract Clipboard and Paste Transitions

Status: Completed
Created: 2026-09-13
Completed: 2026-09-13

## Goal

Reduce `EditorStore` command complexity by extracting pure clipboard-payload and paste-transition decisions while preserving all editor behavior and the `EditorStore` public API.

## Current State

`EditorStore` currently combines clipboard I/O and attachment lifecycle management with deterministic selection normalization, rich-copy payload generation, plain-text and multiline paste document transitions, and image-paste placement decisions.

## Proposed Changes

1. Add a focused application-layer transition module for pure clipboard selection/payload generation and text/image paste outcomes.
2. Route `EditorStore` copy, cut, and paste commands through the transition module while retaining asynchronous clipboard and attachment services, history, persistence, snapshot, and listener ownership in `EditorStore`.
3. Add focused unit tests for copied link ranges, escaped rich clipboard HTML, plain and multiline paste focus/location outcomes, and image attachment placement; retain store, property, Electron E2E, and performance coverage.

## Boundaries

- The transition module may depend only on domain document types and operations plus shared clipboard value types; it must not depend on React, Electron, filesystem APIs, or services.
- `EditorStore` retains public methods and all I/O sequencing, including awaiting pending clipboard writes, attachment writes, cleanup scheduling, and stale-selection checks.
- No product, data-model, persistence, IPC, or process-boundary behavior changes are intended.

## Validation

- Run focused application tests while implementing.
- Run `npm run check:full` before committing.

## Risks

Clipboard behavior is sensitive to hyperlink range offsets, CRLF normalization, current-parent location reconciliation, attachment ownership, and asynchronous stale-selection guards. The extracted pure transitions must preserve each existing outcome exactly.

## Outcome

- Added pure clipboard selection, rich-copy payload, text/multiline paste, and image-paste transition functions.
- Retained `EditorStore` as the public command facade and owner of clipboard and attachment I/O, stale-selection guards, history, persistence, and listener orchestration.
- Added focused transition tests for selection normalization and link serialization, plain and multiline paste, attachment transfer, image placement, focus, and current-parent location reconciliation.

## Validation Outcome

- `npm run check:full` passed: type checking, linting, formatting, 196 unit/component tests, production build, dependency audit, 64 Electron end-to-end tests, and 5 performance tests.
