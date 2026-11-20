# Expansion Views of Starred Nodes

Status: Accepted
Date: 2026-11-19

## Context

ADR 0017 kept one expansion set for the whole document, so a node showed the same fold wherever it was displayed. The Product Owner asked for different views for different parent locations and one root view: for example, a compact overview at the top level and an expanded project after entering it. Remembering a view for every visited location needed an eviction policy, such as least recently used, that would silently discard a view the user had arranged. The Product Owner chose to give views only to starred nodes, which keeps their number under the user's control.

## Decision

Tree has one root view and one view for each starred node. A location uses the view of the nearest starred node among its current parent and that parent's ancestors, or the root view when there is none. A fold change applies to that governing view only.

`ExpansionState` holds the active view's expanded ids, the active view's owner and every inactive view. `EditorRuntimeState.replaceReady` activates the governing view for every published Tree state, so location changes, star changes and undo all switch views in one place. A starred node without a view receives, on first activation, a copy of the view it would otherwise show, limited to its descendants; the copy walks up from each remembered id through the node index, so its cost depends on the remembered ids and the depth, not on the size of the subtree. A view of an unstarred node stays in memory for the session, so starring the node again or undo restores it. A view of a deleted node stays while undo or redo history holds the node; once neither the document nor history contains the node, the view is dropped, because nothing can restore it and keeping it for the session grows memory with edit count. This retention rule amends the original decision of 2026-11-19, which kept views of deleted nodes for the whole session.

Each history snapshot stores the view owners whose nodes left the document when it was replaced by a change, undo or redo. That snapshot is the last history state that can restore those nodes: older states holding them leave history first, because eviction removes the oldest entry and a new change discards the whole redo branch, and removed node ids never return through a change. When history releases the snapshot, the views of its departed owners are dropped unless the document holds the nodes again. While Agenda is open, Tree keeps its view active even after the view's owner leaves the document, so releasing that owner makes the root view active.

This replaced two rejected designs. Scanning the retained snapshots on release had to be throttled to stay off the typing path, and the throttle could skip the release it was meant to perform. Recording every snapshot's complete set of view owners avoided the scan, but with thousands of views it stored and released a large set per snapshot whenever the sets differed. Recording only departures keeps the memory and release work of history proportional to the nodes that left.

The file keeps `view.expandedIds` as the root view and adds an optional `view.starredExpandedIds` object from starred node id to expanded ids. An empty list is kept because it records an own view with every fold closed, unlike a missing view, which is inherited. Serialization writes only views of starred nodes the document contains, and only existing ids. Validation checks the object's shape; parsing drops views of missing or unstarred nodes. The schema version stays 5, following the optional `agendaFolds` view preference: no document content changes.

## Consequences

- This replaces ADR 0017's single per-node expansion set. Its decision to keep view state in the document file, saved by the ordinary pending-change policy, stands.
- An older build accepts the file but drops `starredExpandedIds` on its next save, so starred views are lost; document content is not. Downgrading remains unsupported.
- Views travel with the `view` block through desktop files, browser storage and notes archives; no new storage or IPC channel is added.
- Performance (`docs/PRODUCT.md` §22.1): no write of its own; the save serializes every view, so its size grows with the starred views' expanded ids. A published state whose document and current parent are unchanged skips view resolution; otherwise resolution costs one ancestor walk of at most the maximum depth. Creating a starred view on first use adds at most one such walk per remembered id of the inherited view. Recording a text edit, whose document shares the node index, looks up no view owner. Recording another change, an undo or a redo looks up each view owner at most twice, in the node indexes of the recorded document and its replacement; when the replacement's index is not built yet, building it walks that document once, a walk that publishing the replacement usually needs anyway. History stores and releases only each snapshot's departed owners. A release that drops at least one view copies the map of inactive views once, at a cost proportional to the number of views. History itself is never walked, so views of deleted nodes stay bounded by history.
