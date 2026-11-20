# Expansion Views of Starred Nodes

Status: Accepted
Date: 2026-11-19

## Context

ADR 0017 kept one expansion set for the whole document, so a node showed the same fold wherever it was displayed. The Product Owner asked for different views for different parent locations and one root view: for example, a compact overview at the top level and an expanded project after entering it. Remembering a view for every visited location needed an eviction policy, such as least recently used, that would silently discard a view the user had arranged. The Product Owner chose to give views only to starred nodes, which keeps their number under the user's control.

## Decision

Tree has one root view and one view for each starred node. A location uses the view of the nearest starred node among its current parent and that parent's ancestors, or the root view when there is none. A fold change applies to that governing view only.

`ExpansionState` holds the active view's expanded ids, the active view's owner and every inactive view. `EditorRuntimeState.replaceReady` activates the governing view for every published Tree state, so location changes, star changes and undo all switch views in one place. A starred node without a view receives, on first activation, a copy of the view it would otherwise show, limited to its descendants; the copy walks up from each remembered id through the node index, so its cost depends on the remembered ids and the depth, not on the size of the subtree. A view of an unstarred node stays in memory for the session, so starring the node again or undo restores it. A view of a deleted node stays while undo or redo history holds the node; once neither the document nor history contains the node, `ExpansionViewRetention` drops the view, because nothing can restore it and keeping it for the session grows memory with edit count. This retention rule amends the original decision of 2026-11-19, which kept views of deleted nodes for the whole session.

The file keeps `view.expandedIds` as the root view and adds an optional `view.starredExpandedIds` object from starred node id to expanded ids. An empty list is kept because it records an own view with every fold closed, unlike a missing view, which is inherited. Serialization writes only views of starred nodes the document contains, and only existing ids. Validation checks the object's shape; parsing drops views of missing or unstarred nodes. The schema version stays 5, following the optional `agendaFolds` view preference: no document content changes.

## Consequences

- This replaces ADR 0017's single per-node expansion set. Its decision to keep view state in the document file, saved by the ordinary pending-change policy, stands.
- An older build accepts the file but drops `starredExpandedIds` on its next save, so starred views are lost; document content is not. Downgrading remains unsupported.
- Views travel with the `view` block through desktop files, browser storage and notes archives; no new storage or IPC channel is added.
- Performance (`docs/PRODUCT.md` §22.1): no write of its own; the save serializes every view, so its size grows with the starred views' expanded ids. A published state whose document and current parent are unchanged skips view resolution; otherwise resolution costs one ancestor walk of at most the maximum depth. Creating a starred view on first use adds at most one such walk per remembered id of the inherited view. When history releases a snapshot, retention checks each inactive view's owner against the document's node index; it walks history only after the number of views of absent nodes reaches a threshold that doubles with the views a walk keeps, and the walk skips subtrees the document shares, so memory stays bounded by history and the walk cost is amortized over released views.
