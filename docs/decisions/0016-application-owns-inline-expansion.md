# Application Owns Inline Expansion

Status: Accepted
Date: 2026-09-29

## Context

Inline expansion was owned by `App.tsx`, while `NodeList.tsx` separately built the flattened rows. Visible-row keyboard navigation makes row order a product rule used by both rendering and application commands. Keeping expansion in React would require the application layer to depend on renderer state or a renderer-supplied provider.

## Decision

`EditorStore` owns transient expansion state and the memoized visible-row list for the current location. The renderer reads expansion from the ready snapshot and dispatches toggle and fold commands to the store. DOM blur and renderer-local Visual selection handling remain in the renderer.

## Consequences

- Expansion resets to collapsed whenever the current parent changes and is never persisted or added to undo history. ADR 0017 replaces this consequence: expansion is remembered per node and persisted, and still never enters undo history.
- Rendering and navigation share one visible-row traversal, cached by document identity, current parent, and expansion identity.
- ADR 0014 governs renderer-local interaction state; this decision places application-owned product state outside that ADR's scope.
- The cache retains only the current visible rows and is replaced when its inputs change.
