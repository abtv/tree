# Domain Model, Navigation and History

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
├── struckThrough?
├── starred?
├── marked?
└── children
```

The parent relationship is derived from the tree structure.

`struckThrough` is present, and `true`, only on a complete node (`docs/PRODUCT.md` §2.5); an incomplete node omits it rather than storing `false`. Leaves own their state; parents materialize the conjunction of their children's states. `node-completion.ts` derives a rebuilt parent's state and applies a uniform state to a subtree. Structural operations recalculate rebuilt nodes and affected ancestor paths; a parent losing its last child keeps its previous state. Content-only edits keep completion without scanning children. `toggleStrikethrough` changes the selected sibling subtrees and their ancestor paths in one history edit (§11), preserving text, links, attachments, and identities.

`links` is a list of non-overlapping ranges into `text`. Each range stores its HTTP(S) URL, which must equal the text covered by the range. Version-one persisted documents without links are migrated in memory and are saved using the current format (§13).

Attachment references may contain optional derived `searchText`. Parsing validates its
type and size; older documents need no migration. Global ordinary-term search reads it
without exposing it to text editors, local search, tag/date parsers or result highlights.
Automatic OCR after image paste uses the OCR queue and its native service.
It publishes metadata without a history entry and enriches retained undo/redo documents
using one temporary node/document memo, preserving attachment summaries and subtree
sharing. Removing an attachment removes its search text; canceled jobs cannot restore it.
Automatic queued entries contain identities only and canceled pending entries are pruned.
`reindex-all-images` scans the document once to enqueue unique image identities through
the hidden OCR path. A reindex job can transfer to another node referencing the same
image when its original node disappears; removal of the last owner cancels it permanently.
Recognition adds one ordinary autosave change, no search-time writes or syncs. Enrichment
work reuses image positions only after checking their identity and multiplicity in
each snapshot, otherwise locating them again. It copies only affected ancestor arrays
and shares replacements across snapshots;
its memo is released after completion. Hidden text adds storage proportional to recognized
text and search work proportional to that text, under the existing yielding search executor.

Attachment references may also contain the optional image size `width` and `height`; §13 owns their
validation, sources and persistence.

The domain invariant `MAX_DOCUMENT_DEPTH` enforces the product depth limit defined in `docs/PRODUCT.md` §2.3, counting top-level roots as level 1. Domain creation, document assertions, and persisted-state parsing reject a document that exceeds the limit with the product operation error; the limit did not change the schema version.

`isValidLocation` (`document-operations.ts`) accepts `selectedNodeId` as the current parent itself or any of its descendants at any depth, not only a direct child, because inline expansion (`docs/PRODUCT.md` §2.4) can display and select a descendant several levels below the current parent while it stays the same. `document-serialization.ts` mirrors the same descendant-or-self rule for the pre-parse structural check. `normalizeVisibleLocation` walks a location back up to the outermost collapsed ancestor between the current parent and a deeper `selectedNodeId`, so the caret after a restart, a `zM`, or an undo that falls back to a recorded location always lands on a rendered row. A restored selection whose ancestors are all expanded is kept.

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

`moveSubtree` moves a node with its subtree under any parent, or to the document root, at a given index counted after the node is removed from its old place. It reports `impossible` for an unknown ID or a destination inside the moved subtree, and `too-deep` when the subtree would exceed the maximum-depth limit. It copies only the two affected root-to-array paths and carries the attachment summary over, so a move shares every other subtree with the previous document.

The exact API and naming may evolve.

The important principle is that product behavior should be represented by explicit operations rather than being scattered across UI event handlers.

---

## 10. Navigation

Navigation is separate from the document's trees.

The root collection and its trees represent the document structure.

Navigation represents where the user currently is in the document structure.

The application maintains:

* current parent, which is absent at the top-level document container;
* selected node, which may be the current parent's direct child or, through inline expansion, any of its deeper descendants whose ancestors are expanded;
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
* sibling reordering and cross-parent movement by drag-and-drop;
* multiline paste;
* image attachment;
* node splitting.

The history implementation uses whole-document snapshots. The domain never mutates an existing document; every operation returns a new document. Every editing and structural command path-copies only the nodes from the top-level root to the affected sibling array, and shares every unaffected subtree by reference with its input. Because of that invariant, the history retains the current document objects by reference instead of deep-cloning them on `begin`, `undo`, or `redo`, and consecutive states share unchanged subtrees whether the change was a text edit or a structural command.

The caret and selection that undo and redo publish are derived from the two snapshots rather than recorded with each change. `editor-undo-focus.ts` compares the outgoing document with the restored one and reports where the change starts, which `EditorStore` publishes as the focus and location. That reuses the structural-sharing invariant above: reference equality prunes every unchanged subtree, so the comparison visits only the changed path and costs no more than the mutation that produced it. The alternative, threading a caret through every mutating command, was rejected because commands such as `editText` and `replaceTextRanges` carry no caret and the history would have to record one at every call site. `EditorHistory` itself stays a pure document store.

For cross-parent movement, the comparison first matches stable IDs removed from and added to different changed sibling lists. The moved node is the change site in either direction; the existing visibility rule keeps its current location or displays its parent's level when hidden. Unchanged subtrees are pruned by reference, and only differing sibling lists need ID maps. Same-parent reorders and other edits retain the positional/text comparison. This adds no history metadata, disk writes, or retained navigation state; temporary matching memory is bounded by the affected sibling lists.

While Agenda is open, `EditorStore` consumes the same change-site comparison with all Tree ancestors considered expanded, but discards its navigation proposal. Every opening uses a null scope parent to project the entire document independently of the captured Tree origin. The Agenda history policy selects the nearest visible occurrence and preserves presentation. Changes without a visible occurrence keep focus. `EditorRuntimeState.replaceReady` applies pure document reconciliation centrally. A last-date pin stores only node identity and day, and `agenda-rows.ts` includes its current contextual path in the projection without copying nodes or changing history. The originating Tree location is reconciled if its parent or selected node disappears, keeping Agenda open and the existing save capture valid.

Performance assessment (`docs/PRODUCT.md` §22.1): these transitions add no writes, syncs, history snapshots, or persisted fields. Tree publication skips Agenda reconciliation; same-document Agenda navigation also skips it, preserving the row array. An active text change scans only that node's text in addition to the existing memoized domain projection. Reconciliation and semantic row comparison scale with projected occurrences; a temporary pin's merge visits included branches and their immediate children. State retains at most one pin and one active pair; the bounded row cache retains its latest projection and document across close and releases them if the document changes in Tree. The wide-document counter guard checks zero projection scans during repeated selection and bounded recognition scans with stable rows for a same-date edit; real Tree typing performance remains guarded by the existing suite.

The history is bounded as defined in `docs/PRODUCT.md` §10, which also defines a history entry and the discard rule. The redo stack is bounded by the same limit.

The choice of snapshots keeps undo/redo correct and simple. A future history bound change or a move to command/inverse-operation history must preserve the same user-visible undo depth and attachment reachability.

Each derived document carries an in-memory attachment summary, held through a weak map keyed by document identity. The summary is an immutable map from attachment ID to the number of node references to that ID. Operations propagate it to the document they return, adding an inserted attachment, subtracting a deleted subtree's references, or sharing it unchanged. `collectAttachmentIds` keeps returning a defensive `Set` copy for callers; a separate internal read-only accessor exposes the summary itself. The summary is derived state: it is not part of the document object, is never serialized, and is discarded with the document.

The history retains a reference to each snapshot's summary instead of copying its IDs. It counts how many retained entries use each summary and updates the union's per-ID counts only when a summary first becomes retained or finally ceases to be retained. Retaining or releasing repeated entries whose attachment membership is unchanged therefore performs no per-entry ID enumeration; only a new or changed summary costs O(A) for A distinct attachments. The counts used for per-node attachment multiplicity and for history reachability serve different purposes: duplicate references within a document and overlapping IDs across distinct summaries are preserved, and removing one reference never releases an ID that another retained summary still references. Reading the retained attachment set returns the maintained union without re-traversing snapshots, so attachment cleanup does not scale with history depth.
