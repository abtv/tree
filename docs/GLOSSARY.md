# Glossary

This document is the shared vocabulary of the project. It defines each term; it does not state behavior. The cited owner states the behavior (`PRODUCT.md §N`) or the design (`ARCHITECTURE.md §N`).

## Rules

* New and edited text in the specification, the architecture, ADRs and plans uses the canonical term. It does not use a synonym listed under **Avoid** for that concept.
* A change that introduces a new project term adds its entry here in the same change.
* **In code** and **UI** record identifiers and labels that differ from the term. This document does not rename them.

## Entry Format

**Term** (kind) — definition. Owner. *Avoid:* rejected synonyms. *UI:* the label the user sees. *In code:* the main identifiers.

The kind is `product` (user-visible), `domain` or `architecture`.

## Terms

**Agenda** (product) — The view that groups nodes by date and also lists marked nodes under Today. `PRODUCT.md §23`. *In code:* `AgendaState`, `AgendaView.tsx`.

**Agenda projection** (architecture) — The grouping of the document's nodes into days, derived from the immutable document and never persisted. `ARCHITECTURE.md §4.1`, ADR 0020. *In code:* `agenda-projection.ts`, `agenda-rows.ts`.

**Appearance** (product) — The color scheme that the user chooses for the window. `PRODUCT.md §20.5`. *Avoid:* theme. *In code:* `src/shared/appearance.ts`.

**Application command** (product) — A named command of the command registry. The command panel, the menus and the shortcuts run the same commands. `PRODUCT.md §20.2.30`, `ARCHITECTURE.md §7.2.1`. *Avoid:* "command" alone where a Vim command is possible. *In code:* `ApplicationCommand`, `commandRegistry`.

**Attachment** (domain) — The stored PNG data that a node references. The user sees it as the image of the node. `PRODUCT.md §17`, `ARCHITECTURE.md §14`. *In code:* `AttachmentReference`.

**Attachment search text** (domain) — The text recognized in the image of an attachment, kept hidden for global search. `PRODUCT.md §15.1`, `ARCHITECTURE.md §5.2`. *Avoid:* OCR, image-to-text, hidden text. *In code:* `searchText`, `image-to-text-queue.ts`.

**Automatic save** (product) — A save that a save trigger starts, without a user command. `PRODUCT.md §16.1`, `ARCHITECTURE.md §13.8`. *Avoid:* autosave. *In code:* `EditorSaveScheduler`, `save-policy.ts`.

**Browser version** (product) — Tree running in a web browser, with its notes in browser storage. `PRODUCT.md §1.4`, `PRODUCT.md §24`. *Avoid:* web app, web version. *In code:* `src/web/`.

**Bullet** (product) — The circular control to the left of the text of a node: a solid dot, with an outer ring when the node has children. `PRODUCT.md §2.1`. *Avoid:* circular indicator, circular marker, enter control.

**Caret** (product) — The text insertion position in a node, or the active character in Vim Normal mode. `PRODUCT.md §2`, `PRODUCT.md §20.2.4`. *Avoid:* cursor, text cursor. "Cursor" names only the shape of the pointer. *In code:* `FocusIntent.cursor` and other `cursor` offsets.

**Caret authority** (architecture) — The single renderer owner that decides where the caret is and projects it onto the input. `ARCHITECTURE.md §9.1`, `ARCHITECTURE.md §21.1.2`. *In code:* `caret-projection-state.ts`.

**Change site** (domain) — The place where an undo or a redo changed the document. The caret moves there. `PRODUCT.md §10`, `ARCHITECTURE.md §11.1`. *In code:* `ChangeSite`, `editor-undo-focus.ts`.

**Character Visual mode** (product) — The Vim Visual mode that selects characters inside one node. `PRODUCT.md §20.2.20`. *Avoid:* character-wise Visual. *UI:* `VISUAL`.

**Command panel** (product) — The input at the bottom of the window that lists and runs application commands. `PRODUCT.md §20.2.28`, `ARCHITECTURE.md §8.6.1`. *Avoid:* command palette, command line. *In code:* `CommandPanel.tsx`.

**Completion** (product) — A popup suggestion that replaces the text the user is typing: a date, an emoji or a marker. `PRODUCT.md §20.9`, `PRODUCT.md §20.12`, `PRODUCT.md §20.13`, `ARCHITECTURE.md §8.8.1`. *Avoid:* completion for the state of a struck-through node. *In code:* `completion-controller.ts`.

**Current parent** (domain) — The node that the user has entered. Tree displays its children. `PRODUCT.md §2`, `ARCHITECTURE.md §10`. *Avoid:* zoomed node, focused parent. *In code:* `currentParentId`.

**Current-parent heading** (product) — The editable presentation of the current parent above its children. `PRODUCT.md §2.1`. *Avoid:* parent heading.

**Day heading** (product) — The Agenda row that names one day and folds its occurrences. `PRODUCT.md §23.3`. *Avoid:* day container, day group, day row. *In code:* `AgendaRow` kind `day`.

**Desktop application** (product) — Tree as the macOS application. `PRODUCT.md §1`. *Avoid:* desktop app, Electron app. *In code:* `src/electron/`.

**Direct match** (domain) — A node that Agenda lists under a day because its own text contains that date, or under Today because it is marked. `PRODUCT.md §23.2`. *In code:* role `match`.

**Document** (domain) — The ordered collection of root nodes. It is an implicit container, not a node. `PRODUCT.md §2`, `ARCHITECTURE.md §5`. *Avoid:* tree, outline. Notes is a different term. *In code:* `Document`.

**Document generation** (domain) — An earlier saved document that the desktop application keeps as a recovery copy. `PRODUCT.md §16.1`, `ARCHITECTURE.md §13.11`. *Avoid:* backup, version. *In code:* `DocumentGeneration`.

**Editor snapshot** (architecture) — The state that the editor store publishes: loading, error, or ready with the document, the location, the focus intent and the expansion. `ARCHITECTURE.md §7`. *Avoid:* "snapshot" alone. *In code:* `EditorSnapshot`.

**Editor store** (architecture) — The application-layer owner of the editor state and its commands. `ARCHITECTURE.md §7`, `ARCHITECTURE.md §21`. *In code:* `EditorStore`.

**Enter** (product) — To make a node the current parent. `PRODUCT.md §6`. *Avoid:* zoom, open, navigate into. *In code:* `EditorStore.enter`.

**Expansion view** (domain) — The set of expanded folds that Tree remembers. Tree has one root view and one view for each starred node. `PRODUCT.md §2.4`, `ARCHITECTURE.md §8.10`, ADR 0028. *Avoid:* "view" alone. *In code:* `ExpansionState`.

**Exploratory section** (product) — A specification section that the Product Owner marked as still being worked out through use. `PRODUCT.md §1.2`.

**Focus** (product) — Keyboard focus: the element that receives key input. `PRODUCT.md §2.1`. *Avoid:* focused node and focused row for the selected node.

**Focus intent** (architecture) — The request of the editor store to place keyboard focus and the caret in a node at a text offset. `ARCHITECTURE.md §9.2`. *In code:* `FocusIntent`.

**Focused day** (product) — The Agenda presentation that shows the occurrences of one day, opened from its day heading. `PRODUCT.md §23.15`. *In code:* `focused-day`.

**Fold** (product) — A group that can be hidden: the children of a node in Tree, or the occurrences under a populated day heading or Overdue in Agenda. A fold is expanded or collapsed. `PRODUCT.md §20.2.15`, `PRODUCT.md §23.5`. *Avoid:* open and close, except for the Vim keys. *In code:* `NodeFoldCommand`, `AgendaState.collapsed`.

**Fold choice** (product) — The remembered expanded or collapsed state of a day in the Agenda timeline or the Overdue group for a particular week. `PRODUCT.md §23.5`, ADR 0030. *Avoid:* fold memory, fold preference. *In code:* `AgendaFoldMemory`, `agendaFolds`.

**Folder backup** (product) — The automatic copy of the notes that the browser version keeps in a folder the user chose. `PRODUCT.md §24.5`, `ARCHITECTURE.md §13.17`, ADR 0023. *Avoid:* "backup" alone. *In code:* `FolderBackup`.

**Global search** (product) — The search over every node of the document, shown as a list of results. `PRODUCT.md §20.14`, `ARCHITECTURE.md §13.3`. *Avoid:* Search with only a capital letter, node search. *UI:* `Search All Nodes…`. *In code:* `GlobalSearchSession`, `node-search.ts`.

**Head** (architecture) — The single record in browser storage that holds the saved editor state. It is the browser counterpart of the desktop `document.json`. `ARCHITECTURE.md §13.16.1`. *In code:* `HEAD_KEY`.

**History entry** (domain) — One unit of undo: one text-editing session or one structural command. `PRODUCT.md §10`. *Avoid:* undo entry, history transaction, snapshot. *In code:* `HistoryEntry`.

**Inline expansion** (product) — The display of the descendants of a node beneath it in the current location, without entering the node. `PRODUCT.md §2.4`.

**Insert session** (product) — One stay in Vim Insert mode, from entering the mode to leaving it, recorded as one change. `PRODUCT.md §20.2.5`, `PRODUCT.md §20.2.19`, `ARCHITECTURE.md §21.1.3`. *In code:* `vim-edit-session.ts`.

**Interaction state** (architecture) — Renderer-local state that spans commands or events, such as the caret target, the local Vim register and a pending Insert session. Each piece has one owner module. `ARCHITECTURE.md §9.1`, ADR 0014.

**Leave** (product) — To return from the current parent to the location of its parent. `PRODUCT.md §7`. *Avoid:* go back, navigate out. *In code:* `EditorStore.leave`.

**Level** (domain) — The depth of a node, counted from the root nodes. A root node is at level 1. `PRODUCT.md §2.3`, `ARCHITECTURE.md §5.3`. *Avoid:* level for a location. *In code:* `MAX_DOCUMENT_DEPTH`; `VisibleRow.depth` starts at zero and is relative to the location.

**Local search** (product) — The search inside the current view that moves between matches. `PRODUCT.md §20.2.26`, `ARCHITECTURE.md §4.2`. *Avoid:* Find, Vim search. *UI:* `Find…`. *In code:* `EditorSearch`, `SearchSession`.

**Local Vim register** (product) — The single in-memory register that holds the most recent yanked or deleted content: text, one subtree, or sibling subtrees. `PRODUCT.md §20.2.26`, `ARCHITECTURE.md §21.1.6`. *Avoid:* subtree register, node register.

**Location** (domain) — What Tree displays: the root level, or the children of one current parent. It does not include the selected node. `PRODUCT.md §1`, `PRODUCT.md §2`, `ARCHITECTURE.md §10`. *Avoid:* level, current level, displayed level. *In code:* `currentParentId`; the `Location` type also holds `selectedNodeId`.

**Location bar** (product) — The fixed strip at the top of the window that shows the location path. `PRODUCT.md §2.2`. *Avoid:* toolbar, location toolbar. *In code:* `LocationBar.tsx`.

**Location path** (product) — The root glyph, the ancestors and the current parent, in that order, shown in the location bar. `PRODUCT.md §2.2`. *Avoid:* breadcrumb. *In code:* `breadcrumbDropTargets`.

**Marked node** (domain) — A node that has a mark. Agenda lists it under Today. `PRODUCT.md §2.7`, ADR 0029. *In code:* `marked`.

**Marker** (domain) — A word in the text of a node that starts with `#`, `@` or `&`: a tag, a person or an event. `PRODUCT.md §20.13`, `ARCHITECTURE.md §8.8.4`. *Avoid:* tag for all three kinds. *In code:* `tags.ts`, `TagCatalog`.

**Mode** (product) — A Vim interaction mode: Insert, Normal, Visual or Replace. `PRODUCT.md §20.2.4`. *Avoid:* editing mode for the choice between standard editing and Vim editing.

**Node** (domain) — One element of a tree: a stable ID, text, child nodes and at most one attachment. `PRODUCT.md §1`, `PRODUCT.md §18`, `ARCHITECTURE.md §5`. *Avoid:* item, entry. Row is a different term. *In code:* `TreeNode`.

**Notes** (product) — The saved data of the user as a whole: the document and its attachments. `PRODUCT.md §24`, `PRODUCT.md §25`. *Avoid:* notes for the document alone. *In code:* the `Notes*` types.

**Notes archive** (product) — One ZIP file that holds the notes, for export and import. `PRODUCT.md §24.2`, ADR 0022, ADR 0024. *Avoid:* backup, export file. *In code:* `src/application/notes-archive/`.

**Occurrence** (domain) — One node shown under one day in Agenda. A node with several dates has several occurrences. `PRODUCT.md §23.4`, `PRODUCT.md §23.7`. *Avoid:* item, entry. *In code:* `AgendaOccurrence`.

**Operation error** (product) — The message that reports a rejected or failed command. It is separate from a save error. `PRODUCT.md §20.15`. *In code:* `operationError`.

**Overdue** (product) — The Agenda group of the nodes that are not struck through and have a date before the current week. `PRODUCT.md §23.3`.

**Path heading** (product) — The read-only row that shows the ancestors shared by the rows below it, in Agenda and in global search. `PRODUCT.md §20.14.2`, `PRODUCT.md §23.2`. *Avoid:* parent path, path row, group heading. *In code:* `AgendaRow` kind `path`.

**Pending change** (domain) — A change that is not saved yet and waits for a save trigger. `PRODUCT.md §16.1`.

**Put**, **yank** (product) — To insert the content of the local Vim register, and to copy content into it. Paste and copy use the system clipboard. `PRODUCT.md §20.2.13`, `PRODUCT.md §20.2.22`. *Avoid:* paste for a put, copy for a yank.

**Replaced Notes** (product) — The folder that keeps the desktop notes that an import replaced. `PRODUCT.md §25.4`, ADR 0024. *In code:* `notes-replacement.ts`.

**Return position** (product) — The remembered window position of the row from which the user entered a node. Leaving restores it. `PRODUCT.md §7.1`. *In code:* `ReturnPositions`.

**Reveal** (product) — To scroll the content so that the selected node or the caret line is visible. `PRODUCT.md §20.8`, `ARCHITECTURE.md §13.6`. *In code:* `revealInViewport`.

**Root level** (domain) — The location that displays the root nodes. It has no current parent. `PRODUCT.md §2`. *Avoid:* top level, document root. *UI:* `Top level`.

**Root node** (domain) — A node that is directly in the document. It has no parent node. `PRODUCT.md §1`, `ARCHITECTURE.md §5`. *Avoid:* top-level root node, top-level node. *In code:* `Document.roots`.

**Row** (product) — One displayed line of a list: a node, a day heading, a path heading or a separator. A visible row is a row that no collapsed fold hides. `PRODUCT.md §2.1`, `PRODUCT.md §4.1`. *Avoid:* row for the node itself. *In code:* `VisibleRow`, `AgendaRow`.

**Save-failure lock** (product) — The state after repeated failed saves, in which the application rejects document changes. `PRODUCT.md §16.2`, `ARCHITECTURE.md §13.8.2`, ADR 0010. *Avoid:* failure lock, persistence lock, read-only state. *In code:* `persistenceLocked`.

**Save trigger** (product) — An event that starts an automatic save of the pending changes. The named triggers are volume, idle and quit. `PRODUCT.md §16.1`. *In code:* `save-policy.ts`.

**Schema version** (domain) — The version number of the persisted document format. `ARCHITECTURE.md §13.5`. *Avoid:* document version. *In code:* `PersistedEditorState.version`.

**Selected node** (domain) — The node whose text contains the caret. `PRODUCT.md §2`. *Avoid:* current node, focused node, active node, active row. *In code:* `selectedNodeId`.

**Standard editing** (product) — Text editing while Vim editing is disabled. It has no modes. `PRODUCT.md §20.2.2`.

**Starred node** (domain) — A node that has a star. It has its own expansion view. `PRODUCT.md §2.6`, ADR 0027, ADR 0028. *In code:* `starred`.

**Structural command** (domain) — A change to the document that is not a text edit inside one node. It includes a star, mark or strike-through toggle, and it is one history entry. `PRODUCT.md §10`. *Avoid:* node command, structural action.

**Structural sharing** (architecture) — The invariant that a domain operation returns a new document that shares every unchanged subtree with its input by reference. `ARCHITECTURE.md §11`, ADR 0004.

**Struck-through node** (domain) — A node in the struck-through state, which the user sets for a finished task. Its text has a line through it. `PRODUCT.md §2.5`, `ARCHITECTURE.md §5.1`, ADR 0018. *Avoid:* complete, completed, done or finished node; completion state. *In code:* `struckThrough`, `node-struck-through.ts`.

**Subtree** (domain) — A node together with all its descendants. `PRODUCT.md §2.4`. *Avoid:* branch. *In code:* `moveSubtree`.

**Temporary pin** (product) — The state that keeps an occurrence on its day after its last date was removed, until the selection leaves it. `PRODUCT.md §23.7`. *In code:* `pinned-until-leave`.

**Text-editing session** (domain) — Consecutive text edits in one node that undo treats as one history entry. `PRODUCT.md §10`. *Avoid:* edit session, continuous editing session, text session. *In code:* `EditorTextSession`.

**Timeline** (product) — The Agenda presentation that shows one week of day headings. `PRODUCT.md §23.3`. *In code:* `timeline`.

**Today** (product) — The local calendar day that Agenda captured when it opened. `PRODUCT.md §23.1`. *In code:* `AgendaState.today`.

**Tree** (product) — The application. Tree is also the view that displays a location; write "Tree view" where a sentence can mean the application. `PRODUCT.md §1`, `PRODUCT.md §2`.

**Tree origin** (product) — The Tree location, selected node and caret that Agenda captures when it opens and restores when it closes. `PRODUCT.md §23.1`. *Avoid:* return location, originating Tree location. *In code:* `AgendaState.origin`.

**Undo history** (domain) — The bounded, runtime-only list of history entries that undo and redo use. `PRODUCT.md §10`, `ARCHITECTURE.md §11`. *Avoid:* "history" alone. Command history and emoji history are separate preferences. *In code:* `EditorHistory`.

**View** (product) — Tree or Agenda. `PRODUCT.md §9.3`, `PRODUCT.md §23.1`. *Avoid:* view for an expansion view or for view state. *In code:* `CommandContext.view`.

**View state** (domain) — State about how the document is displayed. It is not document content and creates no history entry; part of it is persisted. `PRODUCT.md §2.4`, `PRODUCT.md §16.1`, `ARCHITECTURE.md §13.5`, ADR 0017. *In code:* `PersistedView`.

**Vim divergence** (product) — A deliberate difference from the behavior of Vim for the same key, recorded with its reason. `PRODUCT.md §1.1`, [Vim conformance](VIM_CONFORMANCE.md).

**Vim editing** (product) — The optional editing preference that adds modes to text editing. `PRODUCT.md §20.2`. *Avoid:* Vim mode.

**Whole-node Visual mode** (product) — The Vim Visual mode that selects a range of sibling nodes with their subtrees. `PRODUCT.md §20.2.23`, `ARCHITECTURE.md §21.1.7`. *Avoid:* node Visual, linewise Visual. *UI:* `VISUAL NODE`.

**Windowing** (architecture) — The rendering of only the rows near the viewport of a long list. `PRODUCT.md §20.1`, `ARCHITECTURE.md §8.4.1`, ADR 0007. *Avoid:* virtualization. *In code:* `list-window.ts`.
