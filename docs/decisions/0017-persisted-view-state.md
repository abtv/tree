# Persisted View State in the Document File

Status: Accepted
Date: 2026-09-29

## Context

Inline expansion became a settled feature. The Product Owner asked that each node remember its expansion across navigation and restarts, saved by the same policy as other pending changes, and that the page scroll position be restored at launch. ADR 0016 made expansion transient: it reset whenever the current parent changed and was never persisted.

Two storage options were considered: a `view` block inside `document.json`, or a separate view-state file like the window-geometry file.

## Decision

Persisted view state lives in `document.json` as a `view` block of schema version 3, beside the `location` block that already holds the current parent and selected node. The block holds `expandedIds` and an optional `selectedRowTop`: the scroll position, stored as the selected row's distance from the top of the window and restored at launch by scrolling that row back to it. A raw page offset was rejected because the windowed list starts each launch with estimated row heights and images load after the first render, so the same offset shows different content. `EditorStore` keeps one per-node expansion set for the whole document and no longer resets it on location changes. An expansion change marks a pending persisted change, exactly as a selection change does; it is never an undo entry.

Serialization writes only ids of nodes the saved document contains. Loading migrates version 1 and 2 files to an empty view, tolerates and drops ids that name no node, and moves a selection hidden by a collapsed ancestor to the nearest displayed ancestor.

## Consequences

- View state rides the existing save, flush, generation, recovery, and failure-lock path; no second persistence channel or quit handshake step is needed.
- A view change costs a full document save, like a selection change already did. The idle trigger batches it with other pending changes.
- The main process validates the view shape on the untrusted save payload and on every load candidate.
- This replaces the first consequence of ADR 0016; its decision that the store owns expansion stands.
- An application build that predates version 3 cannot read the new file and would fall back to an older generation, so downgrading is unsupported.
