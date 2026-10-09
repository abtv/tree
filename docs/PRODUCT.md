# Product Requirements

## 1. Product Overview

Desktop application for macOS that combines the hierarchical text editing model of Workflowy with the navigation model of Windows Explorer.

The application stores an ordered collection of top-level root nodes. Each root node is the root of a tree of text nodes.

Each node:

* has a stable unique ID;
* has text;
* may have child nodes;
* may contain at most one image attachment;
* can be edited inline.

The user's location is one level: either the top-level root nodes or the immediate children of the current parent. Nodes at that level may be expanded to show descendants inline (see §2.4).

The application is keyboard-first. Mouse interaction is primarily used for moving nodes by drag-and-drop.

Text remains editable inline. The user chooses between standard text editing and Vim-inspired editing, which adds Insert, Normal, and Visual interaction modes, as defined in §20.2.

The application automatically saves changes.

### 1.1 Product Principles

The product holds four standing commitments. Their details are owned elsewhere; this section records what they are and which one yields when two of them cannot both be satisfied.

* **Durability.** The user's work is never silently lost. Owned by §16 and its save, recovery, and failure behavior.
* **Privacy.** The user's content stays on their machine, and the application is safe to run without expecting anything to leave it. Owned by [SECURITY.md](SECURITY.md).
* **Vim fidelity.** While Vim editing is enabled, editing text inside a node behaves as Vim does, and every deliberate divergence is recorded with its reason. Owned by §20.2 and [VIM_CONFORMANCE.md](VIM_CONFORMANCE.md).
* **Responsiveness.** The application feels immediate, and ordinary editing never develops noticeable pauses. Owned by §20.4 and §22.

When two of them conflict, they yield in this order: durability first, then privacy, then Vim fidelity, then responsiveness. A change must not trade a higher commitment for a lower one. Flushing every save to disk before it reports success is an existing example — it spends responsiveness to keep durability, and that is the intended direction.

This order resolves conflicts between the four commitments. It does not rank them against any other requirement in this document, and it does not authorize weakening any of them.

### 1.2 Exploratory Sections

A section of this document may carry a bold **Exploratory.** line directly under its heading, with a short note. It records that the Product Owner is still working that behavior out through use.

Only the Product Owner sets or removes the marker. No section is exploratory unless it carries one, and an agent must never add a marker, remove a marker, or treat a section as exploratory because the behavior looks new or incomplete.

The requirements in a marked section stay normative: they are implemented, tested, and validated exactly like every other section. What the marker changes is how an agent may resolve what the section does not yet say, which `AGENTS.md` §5 defines.

### 1.3 Platform Conventions

The application is a native-feeling macOS application and follows Apple's Human Interface Guidelines (<https://developer.apple.com/design/human-interface-guidelines/>) wherever this document does not specify a different behavior. This covers the menu bar and its standard menus, standard keyboard shortcuts, window behavior, text editing, system appearance, and the wording and placement of controls. For example, a command that acts on the window belongs in the Window menu and a command that changes text editing belongs in the Edit menu, not in a menu invented for the application.

A requirement in this document that deliberately differs from the guidelines takes precedence, and the difference is recorded next to that requirement with its reason. The keyboard-first model (§1) and Vim-inspired editing (§20.2) are such deliberate differences.

Every change to user-visible behavior is checked against the guidelines before it is considered complete. A conflict that is not already recorded as a deliberate difference is reported to the Product Owner instead of being settled silently, under `AGENTS.md` §14.

---

## 2. Tree Model

Example:

```text
Projects
├── Work
│   ├── Task 1
│   └── Task 2
├── Personal
└── Ideas
```

A node may contain child nodes.

The document is an implicit container for the top-level root nodes.

The implicit document container:

* is not a tree node;
* is not displayed or edited;
* may contain multiple top-level root nodes.

At the root level, the user views and edits the top-level root nodes. Below the root level, the user views the immediate children of a real current-parent node.

The user enters a node to view and edit its children.

The node representing the current parent is displayed as contextual information, is visually highlighted, and can be edited inline.

The node whose text field contains the caret is the selected node. When the current parent contains the caret, the current parent is selected and no child is selected.

Below the root level, the current parent is a real tree node, not a fake UI-only title.

If the current parent's text changes, the displayed context must update immediately.

The current parent is not part of `↑` / `↓` sibling navigation, except that `↑` on the first child moves selection to the current parent (see 4.1).

### 2.1 Node Presentation

Nodes are presented as plain outline rows with a solid 7px circular bullet to the left of their text. The bullet and text are aligned to consistent outline columns.

The visible center of each row's bullet, disclosure chevron, and selected-node focus indication aligns vertically with the center of the first text line. This alignment holds for wrapped text and remains correct as focus moves between rows. This is a product requirement, not a stylistic preference.

Nodes with one or more direct children display a muted outer circle surrounding their solid bullet, producing two concentric circles. Nodes without children display only the solid bullet. Clicking the circular indicator enters that node and displays its children; it does not place the text cursor or edit the node.

Nodes with children display a disclosure chevron to the left of their circular indicator: it points right when the node is collapsed and down when it is expanded. Clicking it expands or collapses that node inline without entering it, moving the text caret, or editing the node. Leaf rows retain the same text alignment without an active disclosure control. The selected node has a separate visible focus indication, whether or not it has children: its bullet is drawn in the ordinary text color instead of the muted gutter color, with the same size and center as the bullet of an unselected node. The editable current-parent heading has no disclosure chevron.

Node text is always edited inline. A node must not have a persistent input border or card-like container.

Node movement begins when the primary mouse button is pressed and held on a node row for 200 ms. When hovering an unfocused node, the pointer uses the standard pointer cursor; a focused node uses the text cursor while it is being edited. A quick press and release still places the text cursor at the clicked position, and pressing and dragging selects text. Holding the left Command key while hovering a hyperlink changes only that hyperlink to the hand cursor and enables Cmd+click opening. Moving the pointer by more than 4 pixels before the threshold cancels the pending drag so the gesture remains an ordinary text selection, and leaving the row while the button is still held also cancels it.

Node text wraps and the whole text is always shown; a node grows in height to fit its text. Wrapping is visual only: a node's text contains no line breaks, so the text flows across visual lines according to the available width. `Enter` does not insert a line break; it creates a sibling (see 5.1). Long unbroken strings are broken so that text never overflows horizontally. Node rows end 28px short of the right edge of the content area, so wrapped text does not touch the window edge. The bullet remains aligned with the first line of the node's text, and the attached image remains beneath the full text. The editable current-parent heading wraps in the same way.

Node rows retain the document-surface background when focused or hovered (warm paper in the light appearance); focus and hover must not tint the editing row. Apart from the dark bullet of the selected node, a focused node must not display an additional more-options or selection-dot ornament.

The current parent is presented above its children as a larger, bold, editable heading without a bullet.

The first child is separated from the current-parent heading by the same compact vertical spacing used between node rows. A drag-and-drop target must not introduce an additional blank gap there.

At the root level, the first root node is positioned at the same height as the first child below a single-line current parent, so both levels share the same vertical rhythm.

An attached image is displayed beneath its node's text and aligned with that node's text column.
When a node has an image but no text, its empty text editor remains keyboard-editable but occupies no visible row in Normal mode; the image begins at the node's text column. Clicking the blank portion of the node row focuses its text editor. While the image-only row shows no text line, its bullet and selected-node focus indication keep the vertical position they have on a single-line text row, which places them beside the top edge of the image. In Insert mode, and always while Vim editing is disabled, the focused empty editor displays a normal-height insertion line and caret until text is entered or Insert mode ends. The same presentation applies when the node is shown as the current parent.
In Normal mode, the image can be the active character after the node's text; the image is visibly marked while active. For an image-only node, the image is its sole character.

### 2.2 Location Path

A thin toolbar at the top of the application displays the current location.

At the root level, the toolbar displays only an outline-root glyph representing the implicit document container. The document container itself has no visible text label.

Below the root level, the toolbar displays a breadcrumb beginning with the outline-root glyph and continuing through every ancestor to the current parent. The current parent is the final breadcrumb segment.

The location path represents the current parent/location, not the selected child. The outline-root glyph and each ancestor segment are clickable navigation controls. Clicking the outline-root glyph returns to the top-level root nodes. Clicking an ancestor segment displays that ancestor's immediate children.

When navigation moves to an ancestor through the location path, the direct child on the path from the destination to the previous location becomes selected and its text cursor is placed at the beginning. Clicking the current-parent segment does nothing.

During a node drag, the root glyph below root level and every ancestor segment accept the dragged subtree as their last child (the last root for the glyph). The current-parent segment and the glyph at root level do not accept drops. Each segment's hit region spans its width and the toolbar's full height; an accepting segment shows the existing hover-surface color without animation or layout shift. Toolbar targets take precedence over row targets; toolbar whitespace is invalid, and hovering the toolbar does not auto-scroll the list. A successful drop displays the destination's children and selects the moved node.

The location toolbar is confined to a single line. When space is limited, shorter segments are preserved and longer segments are truncated first. A truncated segment ends with an ellipsis; its full text remains available as a tooltip. The toolbar never causes the window to scroll horizontally, regardless of path depth or segment length.

The toolbar is sticky: it stays fixed at the top of the window while the content scrolls beneath it, and the content never shows through it. The scrollbar belongs to the content area below the toolbar and never overlaps the toolbar.

The pin toggle sits in the status bar fixed at the bottom of the window (§20.2), immediately to the right of the Vim editing toggle and at the right end of the status bar, opposite the Vim mode indicator at the left end. The toolbar does not contain it. When enabled, the application window stays above other application windows, including after another application receives focus. The setting persists across application restarts. The toggle has a visually distinct active state and a tooltip naming its current action (`Pin window on top` or `Unpin window from top`), shown above the toggle while the pointer is over it or it has keyboard focus. The tooltip is drawn by the application, because native `title` tooltips do not appear in the application window. Clicking the toggle with the pointer leaves keyboard focus, the caret, and the current Vim mode in the editor, exactly as the `VIM` toggle does (§20.2); it does not focus an editor when none had focus. Focusing the toggle with `Tab` still gives it keyboard focus. macOS may still impose limitations for some fullscreen Spaces.

### 2.3 Maximum Depth

Node depth is counted from the top-level root nodes. A top-level root node is at level 1, its children are at level 2, and so on.

The maximum node depth is 20 levels. A node at level 20 may be entered, selected, and edited normally, but it cannot have children.

If an action would create a node below level 20:

* do not change the document, selection, focus, undo/redo history, or persisted state;
* display `Nodes cannot be nested deeper than 20 levels.` as an operation error.

Sibling creation, multiline paste, image paste, editing, and reordering remain available at level 20 because they do not increase node depth. A drag that would exceed the maximum depth shows the operation error and leaves the document unchanged.

Pasting a subtree or a multi-node Vim register is rejected in full when any copied node would fall below level 20; it is never partially applied or truncated.

A persisted document containing a node below level 20 is invalid. Loading such a document must fail safely, display the document-error state, and leave the persisted data unchanged.

### 2.4 Inline Expansion

Every node remembers whether it is expanded. A node that has never been expanded is collapsed. Clicking a node's disclosure chevron shows its direct children immediately beneath it, indented to reflect their depth. An expanded child can be expanded in the same way, and collapsing an ancestor hides every visible descendant beneath it. Expanding that ancestor again restores the nested expansion choices beneath it.

Visible descendants are ordinary editable nodes: the user can click their text, place the caret, edit them, use their circular indicator to enter them, and expand or collapse their children. The location path and current-parent heading continue to represent the current location, even when a visible descendant has the caret. Motion between nodes (`↑`, `↓`, `j`, `k`, `←`, `→`, `G`, and counted forms) follows the location's visible rows, including descendants shown by inline expansion. Commands that act on the tree — sibling creation, deletion, yank and put, and whole-node Visual ranges — use the focused node's actual sibling level and operate on a sibling subtree as one unit. Dragging moves a node's whole subtree between visible rows at the level selected by the pointer; it may change the node's parent. The Vim fold commands in §20.2 operate on the selected node's own fold and on the folds within the current location. `Cmd+E` toggles the selected node's own fold, exactly as `za` does, in every Vim mode and in the same way whether or not Vim mode is enabled: it does nothing on a node without children and on the editable current-parent heading, never moves the caret, and does not end Insert mode. Like the other `Cmd` commands it discards an unfinished Normal-mode command. Expansion adds no other keyboard command.

Expansion is view state, not a document edit. It creates no undo entry and never saves by itself. An expansion change is a pending change like a selection change: the idle, volume, and quit triggers in §16.1 save it together with the document. Expansion choices are kept when the location changes: entering a node shows its children with their own remembered expansion, and leaving it or using the location path shows the destination with the choices made there before. Reopening the application restores every remembered choice. If a collapse hides the node containing the caret, the collapsing node becomes selected with its caret at the beginning of its text. Collapsing a branch that does not contain the caret leaves selection and caret unchanged. When the application opens with a selected node that a collapsed ancestor hides, for example a document saved before expansion was remembered, the nearest displayed ancestor is selected instead, with its caret at the beginning of its text.

Deleting a node retains its remembered expansion choice, including choices for its descendants. Undoing the deletion restores those choices, so restored nodes keep their previous expansion. These retained choices remain view state and do not become part of document history.

Dragging visible descendants moves a sibling subtree as one unit. Gaps are resolved against the visible rows with that subtree removed; a drop level is no shallower than the row below and no deeper than one level below the row above. A gap can therefore indent beneath an ancestor or outdent to an ancestor or the document root. Gaps inside the dragged subtree are invalid and release there changes nothing.

### 2.5 Struck-Through Nodes

A node can be struck through, for example to mark a task as done. A struck-through node draws a line through its text and shows the text in a muted color in both the light and dark appearance; hyperlinks in it keep their own color under the same line. Inside a selection highlight (§20.2) its text takes the highlight colors and keeps the line. Its circular indicator, disclosure chevron, and attached image are drawn as usual, and its text stays editable.

`Cmd+Enter` toggles the selected node between struck through and normal. It works on every node, including the editable current-parent heading, in every Vim mode and in the same way whether or not Vim mode is enabled. It changes only that node: its children keep their own state. In whole-node Visual mode it acts on the whole selected range instead: when every node in the range is already struck through, they all return to normal; otherwise they all become struck through. It then returns to Normal mode, as the other whole-node Visual commands do. In character Visual mode it acts on the current node, keeps character Visual mode, and clears the selection endpoints like the other `Cmd` commands. It never moves the caret, does not end Insert mode, and, like the other `Cmd` commands, discards an unfinished Normal-mode command. A pending Replace edit is completed as one edit first and Replace mode ends in Normal mode, as for the other application commands in §20.2. `Cmd+Enter` is not repeated by `.` and leaves the Vim register unchanged; `Cmd+Shift+Enter` and `Cmd+Option+Enter` do nothing. It is not part of Apple's standard keyboard shortcuts, so it conflicts with none of them (§1.3).

Each toggle is one undoable change, and undo or redo places the caret at the beginning of the first node it changes (§10). It is a pending change saved by the idle, volume, and quit triggers in §16.1; it does not save immediately. In the locked save-failure state (§16.2) it is rejected like any other document change.

The state belongs to the node and travels with it:

* Splitting a node with `Enter` or a multiline paste keeps the state on the part that keeps the node's identity; the new part starts normal. Every newly created node starts normal, including the nodes `Enter`, `o`, and `O` create.
* Joining nodes with `J` or `gJ` keeps the state of the first node, as it keeps its identity.
* Moving a node, by dragging or by `>` and `<`, keeps its state, and a node or subtree put with `p` or `P` copies the state of every copied node.
* The system clipboard carries text only, so copying text and pasting it creates no struck-through node.
* Saving and reopening the application keeps every node's state. A document saved before struck-through nodes existed opens with every node normal.

---

## 3. Initial State

On first launch, when no document exists:

* create one empty top-level root node;
* display it;
* place the text cursor into it.

Empty nodes are valid and must never be automatically deleted.

---

## 4. Keyboard Navigation

### 4.1 Up

`↑`

Move selection to the previous visible row of the current location, including a visible descendant shown by inline expansion (see §2.4).

If the current node is the first visible row, and the current parent exists:

* move selection to the editable current parent;
* preserve the horizontal cursor position as much as possible, clamping it to the current parent's text length.

If the current node is the first top-level root node:

* keep the first root node selected;
* place the caret at the beginning of its text.

When the editable current parent is selected, pressing `↑` places the caret at the beginning of the current parent.

When moving between nodes, preserve the horizontal cursor position as much as possible.

If the target node's text is shorter than the previous cursor position, place the cursor at the end of the target text.

### 4.2 Down

`↓`

Move selection to the next visible row of the current location. When the selected node is expanded, the next visible row is its first visible child; when it is the last visible row of an expanded branch, the next visible row is the one that follows the whole branch.

If the current node is the last visible row:

* keep the last node selected;
* place the caret at the end of its text.

For visible-row movements, cursor-position behavior is the same as for `↑`.

### 4.3 Left and right

`←` and `→` move between adjacent nodes when the caret is at the corresponding text boundary.

In Normal mode, `h` and `l` move across the node's text characters and its optional image character, which follows the text. An image-only node has the image as its sole character.

When the caret is at the beginning of a node and the user presses `←`:

* if a previous visible row exists, select it and place the caret at the end of its text;
* otherwise, if the node is a child, select its parent and place the caret at the end of the parent's text;
* otherwise, do nothing.

When the caret is at the end of a node and the user presses `→`:

* if a next visible row exists, select it and place the caret at the beginning of its text;
* otherwise, do nothing.

When the editable current parent is selected and the caret is at the end of its text, pressing `→` selects its first child and places the caret at the beginning of that child's text. If the current parent has no children, do nothing.

At any other caret position, `←` and `→` retain their ordinary text-editing behavior.

---

## 5. Creating Nodes

### 5.1 Enter

When focus is on a node in the currently displayed level, `Enter` creates a new sibling on the same level, except when the Normal-mode caret is on an attached image, where it opens that image's preview (see §20.2).

In that context, it never creates a child.

The new node is inserted immediately before the current non-empty node when the caret is at the beginning; otherwise it is inserted immediately after the current node. An empty node is treated as being at the end for this rule, so pressing `Enter` on an empty node creates the next sibling after it.

### Cursor at the end

Given:

```text
Current|
```

Press `Enter`:

```text
Current
|
```

The new node has empty text, is selected, and receives the text cursor at the beginning of its text. The UI does not display a `New node` placeholder.

### Cursor at the beginning

Given:

```text
|Current
```

Press `Enter`.

Result:

```text
|
Current
```

The new sibling is empty, and the original node keeps its text, image, and children.

### Cursor in the middle

Given:

```text
Cur|rent
```

Press `Enter`.

Result:

```text
Cur
|rent
```

The current node keeps the text before the cursor.

The new node receives the text after the cursor.

The cursor moves to the beginning of the new node.

### Image behavior during split

If Enter splits the current node and it has an image:

* the image remains attached to the original node;
* the newly created sibling has no image.

---

## 6. Entering a Node

### 6.1 Cmd+.

`Cmd+.` enters the selected node.

It changes the current parent.

It does not create or modify nodes.

If the selected node has children:

* display its children;
* select the first child;
* place the text cursor at the beginning of the first child's text.

If the selected node has no children:

* display an empty list for that level;
* do not create a child automatically;
* keep the text cursor in the editable current-parent field.

When the editable current parent is selected:

* no child remains selected;
* `Enter` creates a new empty first child immediately below the parent, before any existing children;
* after `Enter`, the new child is selected and the text cursor moves to the beginning of its empty text;
* `↓` selects the first child and preserves the horizontal cursor position as much as possible, clamping it to the child's text length;
* if the parent has no children, `↓` keeps the parent selected and places the caret at the end of the parent's text;
* `↑` moves the caret to the beginning of the parent's text;
* `Cmd+.` does nothing.

Example:

```text
Projects
├── Work
├── Personal
└── Ideas
```

Select `Personal` and press `Cmd+.`.

The application displays the children of `Personal`:

```text
Personal

Finance
Travel
```

The application remembers the node from which the user entered so that it can restore that selection when navigating back.

---

## 7. Leaving a Node

### 7.1 Cmd+,

`Cmd+,` goes back one parent level.

This shortcut must remain exactly `Cmd+,`.

In Vim Normal mode, `Ctrl+o` performs the same one-level navigation.

When going back:

* restore the previous current parent;
* restore selection/focus to the node from which the user entered that parent.

Example:

```text
Projects
├── Work
├── Personal
│   ├── Finance
│   └── Travel
└── Ideas
```

After entering `Personal`, then entering `Finance`, pressing `Cmd+,` returns to:

```text
Personal

Finance
Travel
```

with `Finance` selected.

Pressing `Cmd+,` again returns to:

```text
Projects

Work
Personal
Ideas
```

with `Personal` selected.

At the root level:

* `Cmd+,` does nothing.

---

## 8. Deleting Nodes

### 8.1 Cmd+Backspace

`Cmd+Backspace` deletes the selected displayed node and its entire subtree.

This is different from normal `Backspace`, which remains ordinary text editing except when the node is empty (see 8.2).

After deleting a node from the currently displayed level:

1. If a next sibling exists, select it.
2. Otherwise select the previous sibling.
3. If the deleted node was the only node on the current level, return to the parent.
4. If the deleted node was the only root node, create a new empty root node.

When the deleted node is a visible descendant shown by inline expansion (§2.4) and has no sibling, its parent is selected and the location does not change; deleting a node never enters or leaves a location. The same holds for `dd`.

When inside a parent, `Cmd+Backspace` deletes the currently selected child.

When the editable current parent is focused, `Cmd+Backspace` does nothing. The current parent and its subtree can only be removed by explicitly deleting that node from its displayed parent level.

### 8.2 Backspace on an Empty Node

Pressing `Backspace` on a node whose text is empty deletes that node and its entire subtree.

This applies to nodes on the displayed level. It does not apply to the editable current-parent heading, where `Backspace` remains ordinary text editing.

An empty node that has an attachment or children is still deleted this way, including its subtree and its attachment.

After the deletion:

1. If a previous sibling exists, select it and place the text cursor at the end of its text.
2. Otherwise, if the current parent exists, select the editable current parent and place the text cursor at the end of its text.
3. Otherwise, at the root level, select the next root node and place the text cursor at the beginning of its text.
4. If the deleted node was the only root node, do nothing; the empty root is kept.

When the deleted node is a visible descendant shown by inline expansion (§2.4), rule 2 selects its own parent with the text cursor at the end of its text and leaves the location unchanged. Only an explicit command — `Cmd+.`, `gd`, or the node's enter control — changes the location.

This is an explicit user action. Empty nodes are never deleted automatically.

---

## 9. Cmd+0

`Cmd+0` surfaces and activates the application.

It must work even when the application is not currently focused.

Behavior:

* if the application is minimized, restore the main window;
* if the application is inactive, bring it to the front and activate it;
* if the application is already active, do nothing.

`Cmd+0` changes only application/window focus. It preserves the selected node, the text field that contains the caret, and the caret position.

`Cmd+0` must not change:

* current node;
* current parent;
* selected node;
* cursor position;
* undo history;
* redo history;
* navigation state.

### 9.1 Cmd+Q

`Cmd+Q` quits the application, including when focus is in an editable node.

### 9.2 Window Close

Closing the main window quits the application on macOS, including when the application is inactive. It follows the same save-before-quit behavior as `Cmd+Q`: pending changes are flushed, and if saving cannot finish within the bounded time or reports an error, the application remains open and displays the failure so the user can retry. In the locked save-failure state, the user can instead explicitly confirm quitting without saving, as defined in §16.2.

### 9.3 Application Menu

The menu bar has four menus, laid out as macOS applications do (§1.3):

* **Tree** holds **Quit Tree** (`Cmd+Q`, §9.1).
* **Edit** holds a **Vim Editing** check item, checked while Vim editing is enabled (§20.2).
* **View** holds an **Appearance** submenu with three mutually exclusive items: **Automatic**, **Light**, and **Dark**. The item for the current choice is checked (§20.5).
* **Window** holds an **Always on Top** check item, checked while the window floats above other windows.

The Appearance items have no status-bar counterpart. Each check item is another control for the status-bar toggle of the same name and always agrees with it. Choosing the item has exactly the effect of clicking the toggle: Vim editing switches in Normal mode or back to standard editing with the caret kept, the window is pinned or unpinned, the editor keeps its focus, and the choice is saved and restored at the next start. Using the status-bar toggle updates the check mark. The menu bar and the status bar never disagree, including at startup.

---

## 10. Undo and Redo

Undo and redo are mandatory in v1.

### Undo

`Cmd+Z`, or `u` in Normal mode.

### Redo

`Cmd+Shift+Z`, or `Ctrl+r` in Normal mode.

Undo/redo must support:

* text edits;
* node creation;
* Enter/split;
* node deletion;
* subtree deletion;
* node movement by drag-and-drop;
* Vim subtree paste;
* text paste;
* multiline text paste;
* image paste;
* image-containing node deletion.

Stable node IDs must survive undo and redo.

Consecutive direct text edits are grouped into a continuous editing session for undo purposes. Direct text edits include typing, `Backspace`, and `Delete` within the same node.

A continuous text-editing session ends when any of the following occurs:

* five seconds pass without a text change;
* focus switches to another node or leaves the text field;
* the user explicitly moves the text cursor or changes the text selection within the node;
* the user cuts or pastes content;
* the user performs a structural command, including node creation, splitting, deletion, or reordering;
* the user invokes undo or redo.

Normal cursor advancement caused by typing or deletion does not end the session. Cut, paste, structural commands, undo, and redo are recorded separately from the preceding text-editing session.

Undo and redo place the caret at the start of the change they apply, in the resulting document, as Vim does. The caret therefore stays on an undone or redone text edit rather than returning to the beginning of the node, and it reaches the change even when the user moved the caret away first. A change that restored, removed, or reordered whole nodes, or that struck a node through or returned it to normal (§2.5), places the caret at the start of the affected node; when a removal leaves no node in that place, the caret moves to the next remaining sibling, then the previous one, then the parent. This may select a different node. When the affected node is already a visible row of the current location (§2.4), including a descendant shown by inline expansion, undo and redo leave the location unchanged; only when it is not visible do they change the current parent so that the change is displayed. The rule is the same whether undo or redo was invoked with `u` and `Ctrl+r` in Normal mode or with the `Cmd+Z` and `Cmd+Shift+Z` application shortcuts.

Undo and redo restore no other previous selection or navigation state. The application must still keep those runtime states valid after the document changes.

For a move between parents, undo and redo select the moved node and place the caret at its start. They retain the current location when that node is visible there; otherwise they display its own parent's level. They do not restore the location that preceded the move.

Undo/redo history does not need to survive application restart.

The undo/redo history retains at most the 200 most recent entries. A history entry is one text-editing session or one structural command. When the limit is exceeded, the oldest entries are discarded and can no longer be undone.

---

## 11. Drag and Drop

Mouse drag-and-drop moves one node together with its subtree. Between-row gaps can reorder siblings or move the node to another parent. Dropping onto the middle of a node row makes the dragged node its last child. Dropping onto an ancestor breadcrumb segment or the root glyph appends to that destination and follows it, as specified in §2.2.

Node movement begins when the primary mouse button is pressed and held on a node row for 200 ms. A quick press and release edits text and places the text cursor at the clicked position. Pointer movement within 4 pixels does not cancel the pending hold, but moving farther before the threshold cancels the pending drag so the gesture selects text instead; the pending hold also cancels if the pointer leaves the row.

Once drag mode activates, the cursor changes to `grabbing`, text selection and caret movement stop, and the source row stays in place with its gray drag highlight. Keeping the source visible preserves its outline context while the user chooses a destination. The node's text surface loses focus while the drag is active: any transient selection is cleared, no text can be selected, and pointer movement cannot move the text cursor. The outer quarter of a row's height, capped at 8 pixels, acts as the gaps before and after it; its middle accepts the dragged node as a child. A gap shows a marker at the level chosen by horizontal movement from the press point: each full row-indent step right moves one level deeper, each step left moves one level shallower, and vertical movement alone keeps the source level. The level is clamped to the levels that gap permits. The dragged node and its visible descendants cannot be drop targets; hovering their row middles or internal gaps shows the not-allowed cursor, and release changes nothing. Releasing on an allowed gap or row completes the move. Releasing without changing the position leaves the document unchanged. When the drag ends, focus and the text cursor return to the node. `Escape` cancels an active drag without moving the node, and cancellation keeps text selection disabled until the primary mouse button is released.

Gap targets are resolved against the visible rows with the dragged block removed. The chosen level cannot be shallower than the row below or deeper than one level below the row above. A gap inside the dragged block is invalid. Drops may reorder siblings, indent beneath a visible node, or outdent to a displayed ancestor or the document root.

The circular indicator remains a dedicated pointer target for entering the node; it never places a text cursor or starts a row drag.

While a node is being dragged, its row displays a subtle gray background. The highlight clears when the drag ends.

The entire subtree moves together with its node.

Use the outer row bands for gaps and the middle for dropping onto a node.

The drop zones before the first sibling and after the last sibling have expanded hit areas while preserving the list's normal spacing. The bottom edge target is larger than the top edge target to make use of the available space after the final sibling.

An accepting row middle shows an inset outline in the drop-marker palette color, without animation or layout shift. Dropping onto a leaf, collapsed node, or expanded node appends as its last child and opens the receiving fold. Dropping its existing last child onto the parent is a no-op. A drop that would exceed the maximum-depth limit (§2.3) is offered; releasing reports the operation error and changes nothing. No row outline is shown for the source or its descendants.

After a move:

* the moved node remains selected;
* the change is marked pending and saved by the idle, volume, or quit triggers in §16.1.

Example:

Before:

```text
A
B
C
D
```

Drag `C` between `A` and `B`.

After:

```text
A
C
B
D
```

---

## 12. Clipboard

`Cmd+V` is the normal system paste operation.

Paste uses the current clipboard item created by the most recent copy operation. It does not use older clipboard history.

If the current clipboard item exposes both image and text representations, the image takes precedence. Paste the image and do not also paste the text representation.

The application must support:

* plain text;
* multiline text;
* images.

When a valid HTTP or HTTPS URL is pasted, the URL is stored as a clickable hyperlink. The displayed link text is the URL itself. Plain-clicking a link places the editing caret, while `Cmd+click` opens it in the system's default hyperlink application. Links are underlined and use a distinct color that adapts to the light or dark appearance.

Only `http` and `https` URLs are hyperlinks. Invalid URLs and other schemes are pasted as ordinary text.

---

## 13. Plain Text Paste

Plain text is inserted at the current cursor position.

It does not replace the entire node.

Pasted valid HTTP(S) URLs receive hyperlink behavior at the inserted range. A URL typed by hand becomes a hyperlink in any node while it is being typed: as soon as the whitespace-delimited word under the edit is a valid HTTP(S) URL, that word is underlined, colored as a link, and clickable, and the caret and focus stay where they were so typing continues without interruption. Typing more characters at its end extends the link. A word that is not (or no longer) a valid URL is ordinary text, so a prefix such as `http:/` is plain until the typed word becomes a valid URL. Typing whitespace inside a link splits it into words, and each resulting word that is a valid URL stays a link. During a native text composition (an input method's marked text) the hyperlink check waits until the first edit after the composition. A hyperlink is editable character by character in Insert mode, including at its first and last characters. The caret and Normal-mode character motions can stop at each character inside a link. `Backspace` and `Delete` remove one character at a time within or next to a link, as they do for ordinary text.

When an edit changes linked text into a valid HTTP(S) URL, its clickable destination follows the displayed text, and the link color and underline update immediately. If the edited text is no longer a valid HTTP(S) URL, the link color and underline disappear immediately and the text remains editable. When further editing makes that text a valid HTTP(S) URL again, link behavior and styling return immediately. Editing a link does not turn unrelated text or neighboring links into part of that link. Pasting text inside an existing hyperlink follows the same rule: the clickable destination follows the new covered text, and the link disappears when that text is no longer a valid HTTP(S) URL.

### 13.1 Selecting, copying, cutting, and pasting linked text

`Cmd+A` visibly selects all text in the currently focused node, including its hyperlinks.

`Cmd+C` copies the selected text. When the selection contains hyperlinks, the clipboard content preserves both the text and the clickable hyperlink ranges.

Copying does not clear or otherwise change the visible text selection.

`Cmd+X` cuts the selected text. When the selection contains hyperlinks, the cut clipboard content preserves both the text and the clickable hyperlink ranges.

Cutting writes the selection to the clipboard before removing it from the node. If the node's content changes while the clipboard write is still pending, the cut does not remove any text: the changed document is preserved and the application reports an operation error explaining that the text changed. The clipboard may already contain the original selection, and the intervening changes are not reverted.

Pasting that content into another node inserts the text and preserves its clickable hyperlinks. If only part of a hyperlink is selected, only the selected portion is pasted as a hyperlink when the selected text remains the complete URL; otherwise it is pasted as ordinary text.

### 13.2 Editable-node context menu

Secondary-clicking an editable node text field opens the native macOS context menu with Look Up, Search with Google, Cut, Copy, Paste, and Select All. The menu is available for both plain-text nodes and nodes containing hyperlinks, and is not available on read-only fields or other application controls. A selected text value is bounded to 256 Unicode code points for the native menu request; longer selections are truncated with an ellipsis, and the same bounded text is used by Look Up and Search with Google.

The editing commands use the same selection, clipboard, hyperlink, image-paste, multiline-paste, undo, and persistence behavior as their keyboard commands. Within one node, secondary-clicking inside an existing selection preserves it; secondary-clicking elsewhere places the insertion point there. Selection and caret state are never shared between nodes.

Example:

```text
abc|def
```

Paste:

```text
XYZ
```

Result:

```text
abcXYZdef
```

---

## 14. Multiline Text Paste

Each pasted line becomes a separate node.

The first line is inserted at the current cursor position.

The remaining original text is moved to the final resulting node.

Example:

Current node:

```text
abc|def
```

Paste:

```text
one
two
three
```

Result:

```text
abcone
two
threedef
```

The final node contains the remainder of the original text.

If the original node had an image:

* the image remains attached to the final node containing the remainder of the original text;
* newly created intermediate nodes have no image.

---

## 15. Image Paste

Each node can contain at most one image.

Images are displayed after the node's text.

If the node has no image:

* attach the pasted image to the current node.

If the node already has an image:

* create a new sibling immediately after the current node;
* the new node has empty text;
* attach the pasted image to the new node;
* select the new node.

After image paste:

* place the cursor at the end of the text portion of the affected node;
* for an image-only node, the text portion is empty.

An image-only node does not display an empty text row before its image in Normal mode. In Insert mode, its focused empty text editor expands to a normal-height line so the insertion caret is visible; if Insert mode ends before text is added, the line collapses again. When text is added, it appears above the image.

Images are attachments, not independently draggable objects.

Dragging a node moves its image together with the node.

---

## 16. Persistence

The application automatically saves changes.

There is no Save button.

### 16.1 Automatic Save Policy

The application does not save on every keystroke.

A save is performed when:

* an image is inserted;
* a hyperlink is inserted;
* ten words have been inserted since the last successful save;
* no document change has occurred for ten seconds while changes are pending.

Editing the characters of an existing hyperlink is a text edit, not a new hyperlink insertion; it follows the word-volume, idle, and quit triggers rather than saving immediately for each changed URL.

Changes that do not insert content — creating, splitting, deleting, reordering, or undoing/redoing nodes, and changing the selected node or a node's expansion — do not by themselves trigger a save. They remain pending and are saved by the next volume, idle, or quit trigger.

Only inserted words count toward the volume threshold. Deletions and other changes still reset the idle timer and keep changes pending.

Every pending change is flushed before a normal quit completes. A pending Replace-mode replacement counts as a pending change: it is completed as one edit before that flush, so quitting or closing the window saves it.

If a save fails, the pending changes are retained and the failure is surfaced. The application retries at the next idle interval. After three consecutive failed save attempts, the application enters the locked save-failure state defined in §16.2. A later successful save clears the error.

The document must persist between application restarts.

The main window's size and position must persist between application restarts. On the next launch, the application restores the last saved size and position. If no valid window geometry has been saved, the application uses its default window size and position.

When the user quits, the application waits for queued automatic saves to finish. If saving cannot finish within a bounded time or reports an error, the application remains open and displays the failure so the user can retry without silently losing changes. In the locked save-failure state, the user can also explicitly confirm quitting without saving, as defined in §16.2.

Pending cut and paste operations, including image attachment writes, must finish and their resulting document changes must be saved before quit completes. Successful attachment cleanup does not resolve a failed document save; that failure remains visible and blocks quit until a document save succeeds.

The application keeps recent document generations. Each save preserves the document it replaces as a retained generation. At least one generation written more than 30 seconds ago is always retained, together with generations written after it, so an abrupt termination can lose only work newer than the newest surviving generation. Spreading generations over time reduces the chance that a power loss removes every copy, but it does not guarantee it: a power loss can still lose recently flushed data because the storage device's own cache is not forced to stable media.

On load, the newest stored document that can be parsed and validated becomes the document, whether it is the primary file, a retained generation, or an interrupted save. The application must open that document rather than start empty or refuse to start. Unreadable or invalid candidates are skipped while older candidates are considered, and the loaded candidate becomes the primary file. Retained generations count as references during attachment cleanup, so recovery remains possible after the newest document is damaged.

A document opens even when an attachment file it references is missing; the affected image shows the image error instead of preventing the document from opening.

If stored document files exist but none can be loaded, loading fails without changing those files. If no document files exist, the normal first-launch behavior applies.

A primary file containing JSON `null` is invalid stored data, not a first launch. Loading shows an error and preserves the stored document files.

The following state must be persisted:

* the ordered top-level root nodes and their trees;
* stable node IDs;
* the current parent, or the root-level location when there is no current parent;
* the selected node, including a descendant displayed by inline expansion;
* each node's remembered inline expansion (§2.4);
* the scroll position, as where the selected node's row sits in the window.

On launch, the application scrolls so the selected node's row sits at the same distance from the top of the window as when the document was saved, or as close to it as a shorter window allows while showing the whole row, and keeps it there while rows and images finish laying out, until the user scrolls, types, or clicks. When scrolling had moved the selected row off-screen, it is shown at the nearest edge of the visible content area instead (below the toolbar at the top), so the selected node is always visible at launch. Scrolling by the user is a pending change like a selection change, and every save, including the quit flush, records the position shown at that moment. The scroll position is restored only at launch; navigating within a running session scrolls as before.

The exact text cursor position does not need to be persisted.

The runtime navigation history does not need to be persisted.

Undo/redo history does not need to be persisted.

### 16.2 Locked Save-Failure State

A save attempt fails when the application cannot persist the current document.

After three consecutive failed save attempts, the application stops saving automatically and enters the locked save-failure state:

* every document-mutating command is disabled: text editing, creating and splitting nodes, deleting nodes, reordering, cut, paste including image paste, and undo/redo;
* navigation, selection, and copy remain available so the document can still be viewed;
* no further automatic save attempts are made;
* the save failure remains visible together with `Saving failed repeatedly. The last saved version is safe. Fix the problem and restart the application. Changes made since the last successful save are not saved.`

Quitting and closing the window from the locked state still attempt a final save:

* if the save succeeds, the application exits with every pending change persisted;
* if the save fails, the application asks `Quit without saving? Changes made since the last successful save will be lost.` Confirming quits without saving, and the next launch opens the newest stored version that can be parsed and validated. Cancelling keeps the application open.

A failed save, including when the storage is full, must never destroy or damage the previously saved document. The next launch opens the newest stored version that can be parsed and validated, whether it is the primary file, a retained generation, or an interrupted save.

---

## 17. Images and Attachments

Each node may contain at most one image attachment.

Images are stored as local attachments rather than embedded directly into the document data.

Attachments belong to their nodes.

Moving a node moves the attachment with the node logically; the attachment does not need to be copied to another location.

Deleting a node must also delete its attachment when that attachment is no longer referenced.

Deleting a subtree must clean up attachments belonging to deleted nodes when they are no longer referenced.

An attachment is no longer referenced only after every live document reference, every retained runtime (undo/redo) reference, and every valid retained recovery document reference is gone. A temporary or backup document that still references an attachment keeps that file available for recovery until a later save rotation removes the reference and a subsequent cleanup runs. Cleanup must not remove an attachment that a valid recovery document still references.

A failed attachment cleanup does not lock the editor and does not trigger document saves. It is surfaced to the user, retried at the idle interval for at most three consecutive failed attempts, and attempted again on the next document save or quit.

Image attachments must survive application restart.

A completed image insertion is flushed to local storage before the document that references it is saved, so an attachment that a saved document references is not lost to an abrupt application termination or power loss.

### 17.1 Inline Presentation and Preview

An attached image is displayed inline beneath its node's text.

Inline images are constrained to a 200×200 CSS-pixel bounding box while preserving their aspect ratio. An image whose natural size exceeds the box is scaled down to fit. An image whose natural size is smaller than the box is displayed at its natural size; it is not enlarged.

Clicking an attached image opens an image preview.

`Cmd+Y` opens the image preview for the selected node or the editable current parent when that node has an attached image, in every Vim mode and whether or not Vim mode is enabled. When neither the selected node nor the current parent has an image, `Cmd+Y` does nothing. `Cmd+Y` is not part of Apple's standard keyboard shortcuts, so it conflicts with none of them (§1.3).

The image preview is a modal overlay within the application window. It displays the image fitted within the available window area while preserving its aspect ratio, and it does not enlarge the image beyond its natural size.

Only one preview is open at a time. The preview has a visible close button and also closes on `Esc` and on a mouse click anywhere in the window, including on the image itself. When the preview opens, focus moves to the close button (§20.7 applies to how it was opened). Closing the preview returns focus to the element that was focused before the preview opened.

If an attached image cannot be displayed — because its stored bytes are missing, because reading them fails, or because the image data cannot be decoded by the browser — the application shows `Image could not be loaded.` in place of that image. This applies both to the inline image and to the preview. The message does not delete the attachment, does not report a document-save failure, and does not prevent the rest of the document from being edited or the preview from being closed.

---

## 18. Node Identity

Every node has a stable unique ID.

Node IDs must remain stable when a node is:

* edited;
* moved;
* navigated into;
* navigated out of;
* undone;
* redone;
* saved;
* loaded.

A node's ID must not change merely because its position in the tree changes.

---

## 19. Empty Nodes

Empty nodes are valid.

The application must never automatically delete an empty node.

An empty node can:

* remain empty;
* receive text;
* receive an image;
* receive children;
* be deleted explicitly by the user;
* be deleted by pressing `Backspace` when its text is empty (see 8.2).

---

## 20. User Interaction Principles

The application is keyboard-first.

Text is always edited inline.

Text remains inline in every interaction mode; Vim-inspired modes change keyboard interpretation rather than opening a separate editing surface.

The user normally interacts with the application through:

* keyboard navigation;
* keyboard commands;
* text editing;
* clipboard;
* mouse drag-and-drop for moving nodes in the hierarchy.

The tree hierarchy can be navigated by entering and leaving nodes or inspected and edited through inline expansion. Expansion does not change the current location.

The pointer shows the text-editing cursor only over a node editor that has focus. Text the user cannot edit — the location path, the Vim mode indicator, tooltips, status and error messages, and dialog text — shows the default arrow cursor.

### 20.1 Very Wide Node Lists

When the current location contains more than 500 visible rows, including inline descendants, the application renders only the rows near the viewport plus a small overscan. The off-screen rows are absent from the DOM: browser find-in-page and assistive technology expose only the mounted rows, and selecting or copying text that spans off-screen rows requires scrolling to them.

The focused row stays mounted even when it is off-screen, so keyboard navigation, focus restoration, typing, and the caret never lose their input.

A node drag that reaches the top or bottom edge of the content area scrolls the list automatically, so the node can be moved to a position outside the visible rows. This holds in every list that overflows the window, whether or not its rows are windowed; a list that fits the window does not scroll. Hovering the location toolbar does not scroll the list (§2.2).

The page continues to scroll as a single document. The location bar and the current-parent heading scroll with the content.

At or below 500 visible rows, the list renders every row, including inline descendants, without windowing.

### 20.2 Vim-Inspired Editing

Vim-inspired editing is optional. A `VIM` toggle in the status bar, immediately to the left of the always-on-top pin (§2.2), switches it on and off. The toggle has a visually distinct active state while Vim editing is enabled, and an application-drawn tooltip naming its current action (`Enable Vim editing` or `Disable Vim editing`), shown above the toggle while the pointer is over it or it has keyboard focus. No keyboard shortcut switches it. Clicking the toggle leaves keyboard focus and the caret in the editor.

The choice persists across application restarts as a user preference stored apart from the document; it is not a document edit, creates no undo entry, and does not trigger a document save. On first launch, and whenever no saved choice exists — including installations from before the toggle existed — Vim editing is disabled.

While Vim editing is disabled, the editor is a standard text editor: it has no modes and no mode indicator, every key that inserts text inserts it, `Escape` does nothing, the caret is the normal thin text caret, and the application commands and editing behavior defined outside this section apply unchanged. The commands that exist only as Vim keys in this section — among them the local Vim register with `yy` and `p`, whole-node Visual mode, the Normal-mode image caret, `.` repeat, `Ctrl+d` and `Ctrl+u`, and the `z` fold keys — are unavailable; `Cmd+E` (§2.4), `Cmd+Enter` (§2.5), and `Cmd+Y` (§17.1) remain.

Disabling Vim editing completes a pending Replace-mode replacement as one undoable edit, discards an unfinished Normal-mode command, and clears a character-wise or whole-node Visual selection; a Visual selection or Normal-mode block caret collapses to its start while a text selection made in Insert mode is kept, and a Normal-mode caret on an attached image moves to the end of the node's text. Enabling Vim editing enters Normal mode with the block caret on the character at the caret, clamped to the final text character or the attached image; a deliberate multi-character selection is kept instead. The local Vim register, the last repeatable change, and the last character find belong to the running session and survive switching Vim editing off and on. The rest of this section describes the editor while Vim editing is enabled.

The editor starts in Normal mode, with a block caret on the current character. When the current node is empty, Normal mode displays a non-blinking block caret at its only insertion position. Pressing `i` or `a` enters Insert mode, where text entry and all existing application commands behave normally; Insert mode uses the normal thin text caret. Pressing `R` enters Replace mode, where printable input overwrites existing characters and appends after the end of the node. Pressing `Escape` enters Normal mode from Insert, Replace, or either Visual mode. If the user invokes an application undo or redo shortcut, selects all text, cuts or pastes, toggles a strikethrough (§2.5), enters or leaves a node (including with the mouse), or deletes the selected node while Replace mode has a pending replacement, finish that replacement as one edit before running the command, then return to Normal mode; a select-all, cut, paste, or strikethrough toggle commits it without disturbing the visible text or selection, so the command still acts on what the user selected. Quitting the application or closing the window while Replace mode has a pending replacement completes that replacement as one edit before the quit save, so the saved document includes it; a failed save leaves the replacement committed and the application open for a retry. The same interruptions during Insert mode leave Insert mode active, since Insert already behaves like other application commands run normally within it. Mouse clicks and pointer presses place focus or a text selection without changing the Vim mode, except that navigation through the location breadcrumb or a node's enter control, and an application command that changes focus or replaces the selection, end whole-node Visual mode for Normal mode and clear its selected range. A select-all, cut, or paste drops an unfinished Normal-mode command and both character-wise Visual endpoints before it runs; character Visual mode stays active, while a cut or paste leaves whole-node Visual mode and its selected range unchanged. A persistent indicator displays `INSERT`, `REPLACE`, `NORMAL`, `VISUAL`, or `VISUAL NODE`. The indicator sits at the left end of a status bar fixed at the bottom of the window, while the `VIM` toggle and the always-on-top pin toggle (§2.2) stay at the right end. The indicator is not editable text, so the pointer over it shows the default arrow cursor (§20). The content scrolls above the status bar, which never covers it, and the scrollbar ends where the status bar begins.

Whole-node Visual mode ends and returns to Normal mode when a drop changes the selected node's parent, whether it lands between rows, onto a row, or onto a breadcrumb entry. Same-parent reordering does not end the mode. The Vim register and `.` repeat are unchanged by drag-and-drop.

Normal mode supports:

* `gg` to focus the current parent when one exists, or the first displayed root node at the root level, and `G` to select the last visible row of the location (or the counted visible row) and its image when it has one;
* `h` and `l` to move by character within the current node; when the node has an image, it acts as a final character after the text, and an image-only node's sole character is its image;
* `j` and `k` to move between the location's visible rows, walking through an expanded node's visible children rather than skipping them; for a node with text and an image, the text and image are separate rows, so `j` moves from text to image and `k` returns to the previous text position; when `k` moves from the first child to a current parent with an image, the image is the destination; `j` on the image moves to the next visible row, while `k` on an image-only node moves to the previous visible row. When no previous visible row exists and there is no current parent, `k` on an image-only node leaves it selected with its image caret active. Only one caret is visible at a time: the text caret is hidden while the image caret is active;
* `H`, `M`, and `L` to select the top, middle, or bottom node currently visible in the viewport, without scrolling: a node clipped by the viewport edge, or lying within the edge context of §20.8, is skipped while any node lies wholly outside it, and the remaining nodes are used only when none does. As line motions they place the caret on the destination's first non-blank character, or on its image when it has one. `{count}H` selects the count-th visible node from the top and `{count}L` the count-th from the bottom, stopping at the last or first visible node when the count exceeds them; `M` ignores a count, as in Vim;
* `Ctrl+d` and `Ctrl+u` to move down or up by half the currently visible node rows;
* `u` to undo and `Ctrl+r` to redo the most recent undoable change;
* `w` and `b` to move between word starts, and `e` to move to a word end; letters, numbers, and underscores form words, while adjacent punctuation forms separate words;
* `W` and `B` to move between whitespace-delimited WORD starts, `E` to move to a WORD end, and `ge` to move backward to a word end;
* `f{character}` and `F{character}` to find the next or previous occurrence of a character within the current node, and `t{character}` and `T{character}` to stop immediately before or after that occurrence; a failed search leaves the caret in place;
* `;` to repeat the most recently issued `f`, `F`, `t`, or `T` motion and `,` to repeat it in the opposite direction; repeated finds support counts and never wrap or cross a node;
* `0`, `^`, and `$` to move to the beginning, first non-whitespace character, and final text character; `$` stops at the end of the text row even when an image occupies a second row;
* `i` to enter Insert mode at the current character, `a` to enter Insert mode after it, `I` to enter Insert mode at the first non-whitespace character, and `A` to enter Insert mode at the end of the current node;
* `o` to create an empty first child of the current parent when its heading is selected, an empty first child of the selected node when that node has at least one child, or otherwise an empty sibling below the selected node, and enter Insert mode. A first child created from a selected node keeps the displayed location unchanged and opens that node's fold so the new child is visible; `O` creates an empty sibling above the selected node, but does nothing when the editable current-parent heading is selected;
* `x` to delete the current character, `X` to delete the character before it, `r{character}` to replace it without entering Insert mode, and `s` to delete it and enter Insert mode; when deleting the final text character before an attached image, the Normal caret lands on the image, including when that was the node's only text character;
* `d`, `y`, and `c` followed by an in-node motion (`h`, `l`, `w`, `W`, `b`, `B`, `e`, `E`, `ge`, `0`, `^`, `$`, `f`, `F`, `t`, `T`, `;`, or `,`) to delete, copy, or change the covered text; `dw`, `d$`, `cw`, `c$`, and `yw` are supported examples; `c` enters Insert mode after changing text;
* `d`, `y`, and `c` followed by `j` or `k` to operate on whole subtrees: `dj` covers the current node and the next sibling, `d2j` the current node and the following two, and `dk` the previous sibling and the current node, each including every descendant. The operator and motion counts multiply and clamp at the first and last sibling, so at a boundary the range is the current node alone; expanded descendant rows never count as separate members, and the range never includes the editable current-parent heading, on which these commands do nothing. `y` copies the ordered forest into the local Vim register, `d` copies and removes it as one undoable command, and `c` copies it, replaces the whole range with one fresh empty node at its first position as one undoable command, and enters Insert mode in that node. A command that cannot complete changes neither the document nor the register;
* `ys` followed by an in-node motion or text object and a delimiter to surround the covered text, `yss` and a delimiter to surround the whole node's text from its first non-whitespace character, `ds` and a delimiter to remove the nearest enclosing pair, and `cs` followed by a target and a replacement delimiter to change that pair;
* `D` as `d$` and `C` as `c$`, operating from the caret through the end of the current node's text, and `Y` as `y$`, copying that text into the local Vim register without changing the document or the saved change for `.`;
* `gu`, `gU`, and `g~` followed by an in-node motion or text object to lowercase, uppercase, or toggle the case of the covered text, and `guu`, `gUU`, and `g~~` for the whole text of the current node. Counts follow the underlying motion and multiply when given on both sides (`2gU3w`), while a count does not extend the whole-node forms; the caret moves to the start of the covered range, and a range that matches nothing, or whose case does not change, changes nothing. A hyperlink's text is its address, so these commands, like Visual `u`, `U`, and `~`, change the case of the text around a hyperlink and leave the hyperlink's own text and link intact; children and attachments are preserved. `gu` takes the `u` key after the `g` prefix as its continuation instead of discarding the prefix;
* `cc` and `S` to clear the current node's text and enter Insert mode without deleting its subtree or metadata;
* `~` to toggle the case of the current character and advance, with a count toggling additional characters without crossing the node boundary; it advances onto an attached image when the changed text ends immediately before the image;
* `yy` to copy the selected node and its entire subtree into the local Vim register;
* `dd` to delete the selected node and its subtree using the normal node-deletion behavior;
* `gd` to enter the selected node, with the same behavior as `Cmd+.`;
* `Enter` to open the image preview when the caret is on the node's image, or open the hyperlink at a text caret in the system's default hyperlink application, with the same behavior as `Cmd+click`; it does nothing when neither applies;
* `Ctrl+o` to go back one parent level, with the same behavior as `Cmd+,`;
* `v` to enter character-wise Visual mode;
* `V` to enter whole-node Visual mode when a displayed sibling is selected; the editable current-parent heading cannot be selected with `V`;
* `p` and `P` to put the most recent local Vim register after or before the current node. A node or sibling-forest put with `p` on a selected node that has at least one child, other than the current-parent heading, puts the content as the first children of that node instead, as `o` creates a first child: the displayed location stays unchanged, the node's fold opens so the content is visible, and the first inserted node is selected. `P`, and `p` on a node without children, keep the sibling insertion. Putting a node into its own children is rejected with the descendant error below, because the target lies inside the source. A text put is unchanged by this rule. A plain-text put from an image caret inserts the text before that image and leaves the Normal caret on the final inserted text character, with the image caret hidden. `gp` and `gP` put like `p` and `P`, with the same counts and rejections, but leave the caret immediately after the inserted content. For text, the Normal caret is on the character after the inserted text, clamped to the final text character, or to the attached image when the inserted text ends immediately before it. For a node put, the node that follows the inserted forest is selected, or the last inserted node when none follows; after a put into the children of a node, that is the node's former first child. In Visual modes `gp` and `gP` are not commands.
* `J` and `gJ` to join the current node with the next sibling; a count joins that many siblings (at least two), clamped at the last sibling, and a node with no following sibling, or the editable current-parent heading, makes no change. `J` removes the trailing whitespace of the earlier text and the leading whitespace of the later text at each join, then inserts one space when both remaining texts are non-empty; `gJ` concatenates the texts unchanged. The first node keeps its ID, hyperlink ranges move with their text, and the children of every joined node follow in sibling order with their IDs intact; children keep their depth, so a join never exceeds the maximum depth (§2.3). If only one participating node has an attachment, the result keeps it; if two or more have attachments, even the same one, the whole join is rejected with the operation error `Cannot join nodes that both have attachments` and changes nothing. A join is one undoable command, leaves the local Vim register unchanged, and puts the Normal caret at the first join point after trimming: on the inserted space for `J` when one is inserted, otherwise on the first character of the appended text, clamped to the final text character or the attached image. Whole-node Visual `J` and `gJ` join the selected range the same way and return to Normal mode; a range that cannot join keeps whole-node Visual mode and its selection. Character-wise Visual `J` and `gJ` are not commands;
* `zc`, `zo`, and `za` to close, open, or toggle the selected node's own fold, and `zC` and `zO` to close or open that fold together with every fold inside it. A fold is one node's direct children, shown or hidden exactly as its disclosure chevron shows them. These five commands do nothing on a node without children and do nothing on the editable current-parent heading, whose children are the displayed location itself. `zM` closes every fold in the current location, and `zR` opens every fold in the current location recursively. Fold commands never move the caret, except that `zM` selects the displayed ancestor of the caret with its caret at the beginning when closing the folds would hide the caret (§2.4). Counts do not apply to fold commands.

Numeric prefixes repeat in-node motions and text edits, including operator motions (`3w`, `2dw`, `3x`, and `2r{character}`). They also count node commands: `3j` and `5k` move by that many visible rows while clamping at the first and last visible row of the location; `10G` selects the tenth visible row of the location, clamped to the last visible row; `3dd` deletes the current node and the next two displayed sibling subtrees, clamped at the last sibling, as one undoable command, and `2yy` copies the current node and the next sibling subtree into the local register as an ordered forest. `dd` and `yy` cover every descendant, whether or not it is expanded. A `dd` that changes nothing (for example on the current-parent heading) leaves the register unchanged. A count on `p` or `P` repeats the most recent subtree register that many times, assigning fresh IDs to every copy, and inserts all copies as one undoable command; a put rejected by the depth limit (§2.3) or by ancestry inserts no copy. Plain-text `p` and `P` repeat the register value by the requested count in one edit. `0` remains the beginning-of-text motion when no count is pending. Counts do not extend commands across nodes for in-node text edits, and do not apply to whole-node commands (other than `J` and `gJ` in Normal mode, and `>`, `<`, `p`, `P`, `j`, and `k` in Visual mode), sibling creation, or the fold commands. `u`, `Ctrl+r`, `Ctrl+o`, `Ctrl+d`, and `Ctrl+u` do not accept a count. Each of them discards a command that is still being assembled — a pending count, operator, prefix, or a command awaiting a character or delimiter — and makes no change; a command awaiting a character or delimiter takes `u` as that character instead, and the `g` prefix takes it as the `gu` operator. Word-motion deletion and yanking stop at the next word start, while `cw` changes through the current word end when the caret is on non-whitespace; `$` ranges include the final character. Text operators affect only the current node's text, preserving the node, children, hyperlinks outside the edited range, and attachment. `dd` and `yy` remain whole-subtree commands, with counted forms operating on a forward sibling range.

Text objects may follow `d`, `y`, or `c`, and may be selected in character-wise Visual mode. `iw`, `aw`, `iW`, and `aW` select a word or whitespace-delimited WORD, with `a` including adjacent whitespace where available. Inner and around quote objects use `"`, `'`, or backtick; bracket objects use either delimiter of `()`, `[]`, `{}`, or `<>`. Inner objects exclude delimiters; around objects include them. Bracket objects choose the nearest enclosing matched pair and counts choose successively outer pairs. Unmatched objects make no change. Text objects stay within the current node.

Surround delimiters are `(`, `[`, `{`, `<`, their closing counterparts, `"`, `'`, and backtick, with `b`, `r`, `B`, and `a` accepted as aliases for `)`, `]`, `}`, and `>`. An opening bracket adds one space inside the pair, while its closing counterpart adds none; removing or changing a pair named by an opening bracket also strips one such space from each side when present. `ds` and `cs` accept either delimiter of a pair, act on the nearest enclosing pair, and a count selects successively outer pairs. An unmatched pair or an unsupported delimiter makes no change. The caret moves to the start of the affected range, and each surround command is one undoable change that preserves hyperlinks inside and outside the affected text. In character-wise Visual mode, `S` followed by a delimiter surrounds the selection and returns to Normal mode; a surround that makes no change leaves the selection intact and remains in Visual mode. Surround commands stay within the current node.

`.` repeats the last completed Vim change at the current caret or node, including text changes, surround commands, counted `dd`, subtree puts, shifts, joins, case commands, `o` and `O` with text typed before Escape, and whole-node Visual mutations. A completed Insert, change, or substitute session that ended with Escape is recorded as a text change and repeats at the current caret in any node, including a different one. An Insert session that was interrupted by `Enter` or a split, breadcrumb or enter-control navigation, pointer focus, an application shortcut, a Vim toggle, undo or redo, or a shutdown flush is not recorded, and the previous repeatable change is kept. A repeated deletion-only Insert edit leaves the Normal caret one position left of its insertion point, clamped at the beginning, as the original Escape does. Repeated `o` opens a first child of the current node when the original `o` opened from a parent heading, or, when the original `o` opened from a selected node, applies the `o` rule above to the current node (a first child when it has children, otherwise a sibling below); repeated `O` opens a sibling above the current node. A count before `.` repeats the completed change that many times, stopping at the first failed repetition and keeping those that already completed. Each structural repetition is a separate undoable command and subtree puts assign fresh IDs on every repetition. A repeated whole-node mutation applies to the original number of siblings starting at the current node; if that many siblings are unavailable, it makes no change. A repeated `p` applies the put rule above to the current node, so it goes into the children of a node that has them and after a node that has none. A repeated put uses the originally incoming value and copy count even if a Visual `p` has since exchanged the register; `gp` and `gP` retain their post-put destination. Motions, yanks, and failed changes do not replace the saved change. Every individual command and repetition is atomic: when it cannot complete in full, it changes neither the document, the register, the history, the focus, nor the saved change for `.`.

Visual mode selects characters only within the current node and uses the same yellow highlight as whole-node Visual mode. A deliberate multi-character selection in Normal mode — a pointer drag or `Cmd+A` — uses that highlight too, while the one-character Normal-mode block caret keeps its own block styling. The Normal-mode character and word motions extend the selection. `o` exchanges the active and anchored ends, and `v` returns to Normal mode. `y` copies the selection into an application-local plain-text register; `d` and `x` copy and delete it; and `c` and `s` copy and delete it before entering Insert mode. When Visual deletion removes the final text character before an attached image, the Normal caret lands on the image. Visual `u`, `U`, and `~` lowercase, uppercase, or toggle the case of the selection and return to Normal mode with the caret at the start of the operated range. Visual `S` surrounds the selection as described above. Visual `p` replaces the selection with a non-empty plain-text register and then stores the removed selection as the new register; Visual `P` performs the same replacement and keeps the incoming register. A count repeats the incoming text before the replacement, in one edit. A successful put returns to Normal mode with the caret on the final inserted character. A Visual put with an empty or structured subtree register, or one the application cannot apply, does nothing, leaves the register unchanged, and remains in Visual mode. In Normal mode, `yy` copies the selected node and its entire subtree, while `dd` copies it before deleting it. If the most recent register action was Visual-mode text yank/delete or a character deletion, `p` and `P` insert that text after or before the current character. If the most recent register action was `yy` or `dd`, `p` and `P` insert a copy of the stored subtree as a sibling after or before the current node, except that `p` on a node with children puts it as that node's first children, as the `p` and `P` rule above defines; on the editable current-parent heading they do nothing, because a sibling of the heading would lie outside the displayed location. Subtree puts preserve text, hyperlinks, and attachments and assign fresh node IDs to every pasted node. Yank, delete, change, case, and successful plain-text put commands return to Normal mode.

Vim yanks and Normal-mode `dd` also copy content to the system clipboard for external applications under the rules below. Descendants are excluded from the system clipboard even when the local register includes the node's subtree. The local register and `p` / `P` retain the behavior described above.

* In character-wise Visual mode, `y` copies only the selected text within the current node to the system clipboard.
* In Normal mode, `yy` copies the entire text of the current node when the caret is on its text, or only its attached image when the image caret is active. Text and image are copied separately, never together. A counted `yy` that covers multiple sibling nodes leaves the system clipboard unchanged.
* Normal-mode `dd` uses the same system-clipboard rules as `yy`, using the caret position before deletion and the subtrees actually removed. A deletion that changes nothing or removes multiple sibling nodes leaves the system clipboard unchanged. Clipboard failure reports an operation error without undoing the deletion or changing the local register; undo and local puts retain their existing behavior.
* In whole-node Visual mode (`V`), when exactly one sibling node is selected, `y` copies that node's entire text when non-empty, including when the node also has an image; otherwise it copies the attached image when present. This preference for text applies specifically to the single-node whole-node Visual selection.
* In whole-node Visual mode (`V`), when multiple consecutive sibling nodes are selected, `y` copies their own text in document order, joined by newline characters, without their descendants. An empty node or a node with only an image contributes an empty text entry, preserving its position as a blank line rather than being skipped. Images are not copied in this case. Empty entries are retained at the beginning and end of the range as well as between nodes; a range whose nodes all have empty text therefore copies only the separating newline characters.

Text copied by these Vim commands is plain text: hyperlink characters are included exactly as selected or stored in the node, without hyperlink formatting or a separate clickable representation. An operation on a single node with neither text nor an image, or an empty character-wise text selection, leaves the system clipboard unchanged; copying nothing never clears it. Empty entries within a multi-node whole-node Visual yank follow the newline rule above.

Whole-node Visual mode (`V`) selects a contiguous range of siblings at the currently displayed level — not the location's visible rows (§2.4) — including every selected node's descendants. `j`, `k`, `gg`, and `G` extend the range, and `j` and `k` accept a count that moves the active end that many siblings, clamped at the first and last sibling, without changing the selection's direction; `o` exchanges its ends. The current-parent heading is excluded. `y` copies the selected subtrees into the local register; `d` and `x` copy and delete them; `c` and `s` copy and replace them with one empty node before entering Insert mode; `u` and `U` change the case of text in the selected subtrees. `p` replaces the selected subtrees with fresh-ID copies of the node register and then stores the removed subtrees as the new register; `P` performs the same replacement and keeps the incoming register. A count repeats the whole incoming register that many times, with fresh IDs for every copy, in the same replacement. A put rejected by the depth limit (§2.3) or by ancestry changes neither the document nor the register. These structural mutations are each one undoable command.

`>` moves the selected siblings, in order and with all descendants, to the end of the children of the unselected sibling immediately before the range; `<` moves them out of their parent to directly after that parent. Unselected children stay under the original parent. In character-wise Visual mode, the same keys move the current node with its whole subtree. Both keys keep the mode, the selection's endpoints and direction, and the selected character offsets, and leave the local Vim register unchanged. They open the collapsed fold that receives a moved range, so the selection stays visible, and change the displayed location only when `<` moves the selection out of it, in which case the location becomes the selection's new parent. A count before `>` or `<` requests that many successive one-level moves as one undoable command and makes no change unless every level is possible. These cases make no change and show no error: `>` with no preceding unselected sibling, `<` on a root node, and any selection that includes the current-parent heading. A move that would place any moved node below level 20 (§2.3) shows the maximum-depth operation error and changes nothing. Normal-mode `>>` and `<<` are not supported. In Normal mode a multi-node register can be put before or after the current node. A node put whose target is a descendant of any source node reports an operation error and leaves the document unchanged. Empty or plain-text registers cannot be put in whole-node Visual mode.

When a node editor has keyboard focus, plain Tab moves the focused node and its whole subtree in one level, and Shift+Tab moves it out one level. In whole-node Visual mode, these keys move the selected sibling range; in every other Vim mode and in standard editing, they move only the focused node. The move keeps the editing mode, focus, caret, and text selection. In Normal mode it discards an unfinished command. In Replace mode it commits any buffered replacement as one undoable edit, performs the move as a separate command, and continues in Replace mode with a new replacement session at the same caret. In Insert mode the move ends the current text undo session and keeps Insert mode active. Each Tab press requests one level and uses the same maximum-depth behavior as `>` and `<`. When the current parent is a zoomed node, Shift+Tab does not move a direct child of that node, or a selected range of its direct children, outside the current location; it is a no-op that preserves the pending edit session and editor state. A deeper descendant may move out one level when it remains inside the current parent's subtree. This location boundary applies to Tab shortcuts only; Vim `<` retains its separately specified behavior. Outside a node editor, Tab and Shift+Tab retain native focus traversal, including navigation to the status-bar controls. This node-focused Tab behavior is a deliberate exception to macOS focus traversal, in service of the keyboard-first editing model (§1.1).

Normal `gv` restores the most recent character-wise or whole-node Visual selection with its direction. After a Visual put it selects the incoming content, and after a shift it selects the moved range. The selection is remembered by node identity, only for the latest selection and only within the running renderer session. Any change that deletes or replaces a node of the remembered range, or removes a remembered character offset from the node's text, invalidates it; `gv` then does nothing and shows no error. A character offset is removed when the text becomes shorter than the offset, or becomes empty after it held text. A whole-node range whose nodes are no longer one contiguous sibling range in their original order, including because other nodes were inserted between its ends or the nodes were reordered, is invalid. When the restored range is hidden by a collapsed fold or is not displayed at the current location, `gv` does nothing. `gv` does nothing in a Visual mode.

The local Vim register is held only for the running renderer session and does not persist across application restarts. It is separate from the system clipboard; character-wise Visual `y`, Normal `yy` and `dd`, and whole-node Visual `y` also copy content to the system clipboard under the rules above, while other register-producing Vim commands do not modify the system clipboard. It holds either one plain-text value, one structured node subtree, or an ordered set of sibling subtrees, with only the most recent register-producing action retained. Document search, named registers, macros, and marks are not supported.

Unsupported unmodified keys do not edit text in Normal or Visual mode. Application shortcuts using modifier keys retain their existing behavior. Vim handling is suspended during native text composition.

### 20.3 Typography

The application uses the bundled JetBrains Mono typeface for all user-interface text. The bundled
font is distributed under the SIL Open Font License 1.1; the application source remains under the
project's MIT license.

Text is drawn character by character: the typeface's ligatures and contextual alternates are disabled, so every typed or stored character appears exactly as it is, and a sequence such as `://` never changes the visible position or shape of its characters.

### 20.4 Immediate Interaction

The application does not animate its own interface. Navigation, entering and leaving a node, expanding and collapsing a node inline, creating and deleting nodes, reordering, selection, Vim mode changes, and error states all apply immediately: no transition, easing, or fade stands between the user's action and its visible result.

This deepens the Responsiveness commitment in §1.1: even a smooth, well-performing animation still spends a fixed delay before the user can act on its result, and that delay cannot be removed by animation quality alone.

This does not govern motion the application does not itself decide to add: native macOS window chrome, and scrolling driven directly by continuous user input, such as the page's own scroll position or the drag auto-scroll in §11 and §20.1, whose motion is the direct feedback of an ongoing input rather than a transition inserted after an action completes. It likewise does not govern appearance that follows the scroll position directly and has no duration of its own, such as the scroll-edge fades in §20.6.

### 20.5 Appearance

The application has an appearance choice with three values, set in the **View > Appearance** menu (§9.3): **Automatic**, **Light**, and **Dark**. Automatic follows the operating system's light or dark appearance, and switching the system appearance restyles the open window immediately. Light and Dark keep that appearance whatever the system uses. Choosing an item restyles the open window immediately, including the native window surface, and the choice is saved and restored at the next start. When no choice has been saved, as at the first start, the appearance is Automatic.

The application must not show unintended flashes of a contrasting background during startup, renderer loading or reloading, closing, or system appearance changes. In dark appearance, even a brief white or light-background flash is a visual defect. This applies to the whole application window, including the native surface before the renderer paints and while it is torn down. The native window background matches the document surface from window creation through closing, including after a system appearance change.

The window's top strip, which holds the window controls (close, minimize, zoom) and the title `Tree`, has the same color as the document background in every appearance, light and dark. The system title bar is not shown, so the strip never differs in tone from the content below it. The strip drags the window, the window controls keep their standard behavior, and the title uses the secondary text color of the current appearance.

The dark appearance uses a palette adapted from the Emacs port of the Zenburn color scheme, `zenburn-emacs` (<https://github.com/bbatsov/zenburn-emacs>), not from the original Vim theme: a warm gray document surface, soft off-white text, and muted accent colors. In the dark appearance the text of a node is colored by its depth below the current parent: the current parent's children use the first of eight colors, their expanded children the second, and so on in order. Rows nested deeper than the eighth level use the ordinary text color. The light appearance does not color text by depth. The depth color gives way to the selection highlight, so a selected row keeps the highlight's text color.

The light appearance is an original palette, not adapted from a published color scheme. Its direction is a soft, paper-like notebook surface, set by a reference screenshot the Product Owner supplied (a note-taking application with a cream background and muted accents) and by the dotted-page look of a bullet journal. It uses a warm cream document surface, warm graphite text, warm gray-beige secondary text and rules, and a muted amber selection highlight with dark text. The gutter dots of node rows are light warm gray, so they stay quiet beside the text. The outer ring of a node with children is a darker warm beige than the surface and its disclosure chevron is a mid warm gray, so both stay visible on the cream surface. Links are a muted blue. The content area of the light appearance carries a faint dot grid with a 20px pitch, like dotted notebook paper; the grid scrolls with the content, stays beneath the toolbar and status bar, and is absent from the dark appearance.

In the dark appearance, Vim mode indicators share a dark gray background and use muted text colors from the document palette: green for Normal, cyan for Insert, sandy yellow for Visual and whole-node Visual, and red for Replace. The Visual indicators retain the shared selection highlight pair.

The active state of the status-bar toggles (`VIM` and the pin) takes its colors from the palette of the current appearance: the same warm surface tone as a hovered disclosure chevron behind the ordinary text color, so it reads as part of the light cream palette and of the dark Zenburn palette alike. The toggles' hover text and focus outline use the hover-text and secondary colors of that palette.

### 20.6 Scroll Edges

Content scrolls at pixel granularity, so a row can be cut where the content area meets the location toolbar (§2.2) or the status bar (§20.2). A cut row fades into the document background toward that edge instead of ending in a hard line through its text.

The top fade shows while content is scrolled beneath the toolbar, and the bottom fade shows while more content lies below the status bar. At the start of the document there is no top fade, at its end there is no bottom fade, and content that fits the window shows neither. Each fade is shorter than one text row and no taller than the capped context of §20.8, leaves the scrollbar uncovered, and does not intercept the pointer: clicking, selecting, and dragging behave inside it exactly as elsewhere. The fade strength follows the scroll position directly, reaching full strength within the first few pixels scrolled away from an edge.

The edges stay flat. A shadow cast by the bars onto the content was tried and rejected: it made the bars look raised above the content, a depth the otherwise flat interface has nowhere else, and it still showed the cut text.

### 20.7 Consistency Across Input Paths

What the application shows and does depends on its state, never on the input path that produced the state. When one command or state can be reached in several ways — mouse, keyboard shortcut, Vim key, menu item, or a restored session — the result is identical in every way: the same appearance, including focus indicators, the same focus target, the same caret and selection, and the same side effects. Opening an image preview with a click, with `Enter`, or with `Cmd+Y` is one example.

A difference between paths is allowed only where this document records it and its reason. An appearance that the platform or browser derives from the most recent input device, rather than from the application's state, is a difference of this kind and is not recorded anywhere: an element that receives focus programmatically shows its focus indicator whether the user last used the mouse or the keyboard.

### 20.8 Keeping the Selection in View

The content area is the scrolling region between the location toolbar and the status bar (§2.2, §20.2). When the selection or the caret moves to another node, the content scrolls so the destination is visible and the position it ends in does not depend on the key or direction that led there.

**Context.** After a keyboard command that reveals a node, the selected node lies at least one context away from the top and bottom edge of the content area, so a node that fits between those contexts never sits in the scroll-edge fades (§20.6) and the next `j` or `k` does not have to scroll first. The context is the height of one single-line node (25 px), not the height of the selected node, so a node that wraps over several lines does not enlarge it. It is capped at a quarter of the content area. A keyboard command moves the content by the smallest distance that restores the context, so `j` and `k` at the edge of the window move it by about one node instead of re-centering it, and the stop positions at the top and at the bottom are mirror images. A node already clear of both edges never causes scrolling. A node taller than the content area minus both contexts shows its start below the top context; its bottom may clip and enter the bottom fade. A node whose start is already at that position does not scroll again.

**Distant destinations.** A destination more than half the height of the content area beyond its nearest edge, such as the target of `G` in a long list, is centered in the content area instead, since the surrounding nodes matter more than a small shift. A node that cannot fit between the contexts keeps the start priority above instead of being centered.

**Document edges.** When a move in one direction would stop within two contexts of the start or end of the content, the content scrolls all the way to that edge. Reaching the first node by walking with `k` or with `gg` reaches the document start, including when that node is taller than the area between the contexts. Reaching the last node by walking with `j` or with `G` reaches the document end when that node fits between the contexts; otherwise its visible start takes priority over reaching the end. These paths end at the same scroll position instead of leaving part of the document's own padding unscrolled. The content never scrolls against the direction of the move. At the start or end of the content the selected node may lie closer to the edge than the context, because nothing can scroll further.

**Changing geometry.** While a reveal remains current, image loading, row measurement and viewport resizing apply the same rule again so its destination remains visible. A new reveal replaces the previous one. Deliberate scrolling with the wheel, touch, scrollbar or a page-scroll key cancels this correction, so later image loads and measurements do not move the content back under the user. Geometry correction changes neither focus nor the caret, text selection, Vim mode or document history.

**Pointer.** A click or press that selects a node does not move a node that is fully visible, even next to an edge, so the content never shifts under the pointer. A node that is not fully visible scrolls into view by the same rules.

**`H`, `M`, and `L`** (§20.2) choose among the nodes that lie wholly outside the contexts, except at an edge where the content is scrolled to its start or end, which keeps no context. They do not scroll, including during later geometry changes. When no node lies outside the contexts, they choose among the nodes in the whole content area as §20.2 describes; this fallback may select a node within a context or a clipped node and preserves the scroll position.

---

## 21. Unexpected Renderer Errors

If the renderer encounters an unexpected error while rendering, the application must not leave the window blank.

Instead, it displays an error message and a `Reload` action. Reloading restarts the renderer and loads the last saved document.

Changes that were queued in memory but not yet persisted may be lost when the user reloads.

---

## 22. Non-Functional Requirements

### 22.1 Performance of State and Persistence Changes

The application must stay responsive and must not accumulate unbounded memory or perform unnecessary disk operations as the document and edit history grow.

Any change to editor state or persistence must include an explicit assessment of its performance implications, covering:

* disk operations, especially writes and filesystem syncs, which must be minimized to limit SSD wear;
* CPU work added to interactive paths, such as typing, navigation, and commands;
* memory usage, especially any structure that can grow without bound with document size or edit count.

The assessment must consider how the cost scales with document size and the number of edits, and the change must state the expected cost and any mitigation.

Concrete budgets are not fixed here. When a change can affect performance at scale, the implementation must add or update an automated performance guard at the appropriate level (unit, boundary, or performance suite). Budgets are derived from measured baselines and recorded by the owning automated guard and its result artifacts.

### 22.2 Perceived Vim Editing Responsiveness

Everyday Vim editing must feel lightweight and consistently responsive on supported documents. Typing, caret movement, moving between nearby nodes, switching modes, and common edit commands must give prompt visible feedback so the user can stay in an editing flow. Repeated interactions must not develop noticeable pauses, and work that only changes the active node or caret must not become slower merely because the document contains more off-screen nodes.

Performance guards must exercise representative sequences in the running application, including key-to-visible-frame latency for Vim interactions and typing, as well as document-scale cases that could expose renderer or React work on the interactive path. Measure both typical and slow interactions; investigate regressions before adding further editing features. This requirement does not imply support for Vim-sized files or prescribe a particular UI implementation.

## 23. Agenda

### 23.1 Opening and Closing

`Cmd+P` opens Agenda for the current Tree location's descendants, or all roots at Root. The current parent's own text and ancestors at or above it are excluded. Today is captured from the local calendar when Agenda opens; its day container is initially selected and revealed. `Cmd+P` closes Agenda and restores the originating Tree location, selection, and text cursor, revealing the selected row. A pending Insert or Replace edit finishes before opening or closing; Replace returns to Normal, and whole-node Visual ends.

This deliberately assigns Apple's standard Print shortcut to Agenda, as approved by the Product Owner: Tree has no printing capability and Agenda is a frequent keyboard command. The binding is application-scoped and adds no menu item or global shortcut.

The location toolbar reads `Agenda`, with no outline-root control. Agenda selection and scrolling do not change the persisted Tree view or create files; restarting opens Tree. Agenda uses the same document, without copying nodes.

### 23.2 Projection and Dates in Text

Only valid canonical `YYYY-MM-DD` dates are recognized, with no touching digit at either end. Impossible dates, incomplete tokens, and dates inside hyperlinks are ordinary text. A node appears under every distinct date it contains. Its proper ancestors below the scope appear as contextual rows in Tree order, preserving the hierarchy. Full text is shown and wraps as in Tree. The displayed day's date uses the accent color and semibold weight; other recognized dates use secondary text. Contextual ancestors use secondary text, ordinary size, and ordinary row height; direct matches retain Tree colors, including depth colors in dark appearance. An outer bullet ring reflects real children; a chevron reflects projected children.

### 23.3 Timeline

Days are ordered chronologically. The three calendar days before Today and the three after it are always shown, including empty days. Other runs of one or two empty days have individual day headers; longer runs have a collapsed gap labeled `N empty days · Sep 30 – Oct 6`. Labels append the year only when it differs from Today's year.

A day is a compact header with small uppercase text, slight letter spacing, and a thin rule to the content's right edge, all in secondary colors. Empty days have a lighter label and no chevron. Today uses the accent color for label and rule, with ` · TODAY` appended. A gap has small secondary text, a chevron, and a dashed rule. Day and gap rows have the ordinary row height. Their chevrons, selected focus dot, and label align to the Tree chevron, bullet, and text columns; nodes start one outline level deeper. Headers scroll with the content; none is sticky. Transitions between Agenda and Tree have no animation or contrasting background flash.

### 23.4 Navigation

Up and Down move over visible Agenda rows and clamp at either edge. In Vim Normal, counted `j`/`k`, `gg`/`G`, `H`/`M`/`L`, and `Ctrl+d`/`Ctrl+u` navigate Agenda rows with the same count and viewport rules as Tree. Clicking a row selects and focuses it with the same focus dot. `Escape` clears unfinished commands and returns Vim to Normal without closing Agenda. Contextual ancestors, day containers and gaps accept no text input; Vim `i`/`a`/`R` on them never enter Insert or Replace.

`Cmd+.` on a direct match or contextual ancestor closes Agenda and opens Tree with that node as current parent. `Cmd+P` there opens that node's own scoped Agenda at Today. Focused days are introduced in a subsequent Agenda task.

### 23.5 Folding and Gaps

Clicking a disclosure chevron, `Cmd+E`, or Vim Normal `za` toggles the selected day or node's projected children. Day folds hide all that day's nodes; node folds hide their projected descendants on that day. A day stays non-empty even when its only matches lie in folded branches. Empty days and projected leaves do not fold. Fold choices are keyed by occurrence, independent across days and independent of Tree expansion. If collapsing an ancestor hides the selected row, the ancestor becomes selected and focused; an unrelated collapse keeps selection and focus. Mode and document content are unchanged.

On a gap, the same controls reveal up to seven days from the start. Its original header stays visible with a down chevron, followed by the revealed empty day headers and a smaller collapsed gap when at least three unrevealed days remain. A remaining one or two days use day headers. Toggling the original expanded gap collapses its revealed region again; toggling the smaller gap reveals its next chunk. Because the smaller gap is replaced by the revealed days and a new smaller gap, revealing from it moves the selection to the original expanded header. Reveal choices remain calendar-day choices as the timeline restructures. All folds and revealed gaps are runtime state, never saved to the Tree view or Undo history.

### 23.6 Large Timelines

Agenda uses the windowing behavior of §20.1 above 500 projected rows, including day headers and gaps. The selected occurrence stays mounted and focused when scrolled off-screen. Repeated occurrences of a real node have independent positions and measured heights. Folding, gap reveal and window resizing update the layout without losing selection or focus; windowing adds no document saves.

### 23.7 Active Occurrence and Date Removal

Selecting a direct match makes that node's occurrence on that day active. Adding a date keeps the active occurrence on its day. Removing its date moves it to the chronologically nearest remaining recognized date, choosing the earlier day on a tie. A live edit reveals that destination if folded so editing can continue; unrelated folds remain unchanged.

Removing the last recognized date keeps the item and its contextual ancestors on the active day until selection leaves it. The real node is not deleted. Selecting another row, closing Agenda, or navigating to Tree leaves it; reselecting the same item, window blur, and changing editing mode on that item do not. Restoring a recognized date removes the temporary pin. These transitions follow document changes and do not create separate Undo entries.

If the scope root no longer exists, Agenda closes and returns to the nearest surviving Tree ancestor, or Root. A removed originating selection falls back to its surviving scope heading, or the first root, with the cursor at the beginning. This keeps the return location valid for persistence and closing.

The active editor retains focus, caret, selection and mode when its active day changes.

Every other occurrence of the active node is a live mirror: it shows the current text, links and image, never owns an editor, and draws its bullet as a hollow ring in the gutter color. Selecting a mirror, by pointer or keyboard, makes it the active occurrence. Editing the active occurrence updates its mirrors immediately without moving focus or changing the scroll position. When a document change moves the active occurrence to another row, the scroll position adjusts so that the active row keeps its place in the viewport; selecting a row never takes this adjustment.

While the last date is removed, the status bar shows `Add a date to keep this item in Agenda`. The message sits beside the Vim mode indicator, or at the left edge when Vim is off, is announced as a status, and never changes any row height. It disappears when the item leaves Agenda or a recognized date returns.

### 23.8 Agenda History Focus

Agenda uses the existing document Undo/Redo history. Restored document content updates its occurrences, including restoring removed dates and pinning an active item when its last date is removed again. History does not change the Tree current parent, Agenda folds, revealed days, or Tree expansion while the scope exists.

After Undo or Redo, select the nearest visible occurrence of the change-site node relative to the current occurrence's day, choosing the earlier day on a tie. If none is visible, or the change is outside the Agenda scope, keep the current selection and focus. A selection whose row no longer exists falls back to the nearest displayed day. History focus uses the change-site text cursor when selecting that node. Persistence locking continues to reject document edits and Undo/Redo, while navigation remains available.

`Cmd+Z` and `Cmd+Shift+Z` work throughout Agenda; Vim Normal `u` and `Ctrl+r` use the same history. Pending Insert and Replace sessions finish by the same rules as Tree before a history command.

### 23.9 Editing in Agenda

Direct matches edit the same real nodes in standard editing and text-oriented Vim modes. Text commands, links, images, strikethrough (`Cmd+Enter`), and ordinary Cut/Paste follow Tree behavior. Contextual ancestors show text only, with no editing or strikethrough command. Day containers and gaps are synthetic and never editable.

Canonical dates are recognized immediately after typing or pasting. Date emphasis preserves every character, caret offset and text-selection operation; dates remain editable text. A single-date node has one editor; a node appearing on several days has an editor only at its active occurrence. Other direct-match occurrences display the current text, hyperlinks and attached image. Native context-menu commands follow keyboard editing rules. Ordinary multiline paste may create nodes, and image paste retains Tree behavior; pasted new nodes receive no additional date.

### 23.10 Structural Restrictions

Agenda does not reorder existing siblings, change their real parents, delete subtrees, or transfer contextual ancestors between days. `Tab`, `Shift+Tab`, `Cmd+Backspace`, `Cmd+,`, Vim `>`/`<`, `J`/`gJ`, `dj`/`dk`, `cj`/`ck`, `yj`/`yk`, `gp`/`gP`, whole-node Visual, and structural dot repeats do nothing and retain focus, caret, mode, and text. Awaited text characters and surround delimiters still work.

`Backspace` on an empty childless direct match deletes it under the ordinary empty-node deletion rules. Selection moves to the previous sibling occurrence on that day, otherwise its contextual parent, otherwise the day container. If the day itself disappears, selection falls back to the nearest displayed day, earlier on a tie, preserving the compressed timeline. An empty node with children is retained. Removing text or dates never deletes a node automatically.

Vim fold commands `zc`/`zo`, `za`, `zC`/`zO`, and `zM`/`zR` act on Agenda folds using the corresponding Tree fold rules. Recursive commands cover projected descendants; all-fold commands cover Agenda, independently of Tree expansion.

Vim Normal `Enter` does nothing on any row. Creation from a day container, splitting, and sibling creation on direct matches are defined in §23.11; `Enter` and `o`/`O` do nothing on contextual ancestors. `dd` and `p`/`P` move occurrences instead of deleting or putting nodes, as §23.13 defines.

### 23.11 Creating Nodes

On a day container, standard `Enter` and Vim Normal `o` create a node for that day, and Vim Normal `O` creates one for the preceding calendar day. If that day lies inside a gap, it is revealed. Vim Normal `Enter`, a counted or prefixed `o`/`O`, and every creation key on a gap or contextual ancestor do nothing; direct matches follow the two subsections below.

The new node is the last child of the Agenda scope, which is a final root when Agenda was opened from Root. Its text is the day's canonical date followed by one space, with the caret after the space. It becomes the active occurrence under that day, unfolding the day if it was collapsed, and Vim enters Insert. Creation is one undoable change that adds only the node, and it saves as any structural change does. If the scope is at the maximum document depth, the ordinary depth error is shown and nothing changes. Creation is rejected while persistence is locked.

Undo removes the node and applies the history focus rule of §23.8.

#### Splitting a Dated Node

In standard editing and Vim Insert, `Enter` in a direct match splits it as in Tree (§5.1): the caret splits the text, and a caret at the start of non-empty text inserts a new node before instead. The new part receives the displayed day's date, so the node stays on that day. The date is inserted at the start of the new part and replaces its leading whitespace with the single space after the date, so `2026-10-14 Prepare| release` becomes `2026-10-14 Prepare` and `2026-10-14 release`. Nothing is inserted when the new part already contains that day's date as a recognized date; a date inside a hyperlink does not count. Only the displayed day's date is inherited, and hyperlinks in the new part keep their text. The caret is placed after the inserted date, or at the start when nothing was inserted, and the new node becomes the active occurrence under that day. The split and the inserted date are one undoable change.

Vim Normal `Enter` stays inert, and a counted or prefixed command still does nothing, as for creation from a day container.

#### Creating a Sibling of a Dated Node

Vim Normal `o` creates a real sibling immediately after the selected direct match and after its subtree, and `O` immediately before it, in the Tree. The new node's text is the displayed day's date followed by one space, the caret follows the space, it becomes the active occurrence and Vim enters Insert. It never becomes a child, even when the node has children. A count before `o`/`O` cancels the command. Creation is one undoable change, is rejected while persistence is locked, and is not repeated by `.`.

### 23.12 Moving Occurrences

#### Mouse Drag

A direct match is moved to another day by pressing and holding it with the primary mouse button, using the hold time and movement tolerance of §11, and dropping it on any row of the target day: the day header or any node row beneath it. Contextual ancestors, day headers, and gaps cannot be dragged, nor can the disclosure chevron or the node bullet start a drag. The dragged row takes the Tree drag highlight, and the pointer shows the grabbing cursor. The target day's header is outlined with the inset drop outline of §11; the source's own day shows no outline and a drop there changes nothing. A gap is not a day: over it the pointer shows the not-allowed cursor and a drop changes nothing. `Esc`, a lost pointer, and window blur cancel the drag. Dragging near the top or bottom of the viewport scrolls it as in Tree. Dragging is unavailable while persistence is locked, and a quick click that does not hold selects and places the caret as before.

A move replaces the source day's date in the node's text and changes nothing else: the parent, the children, and the position among siblings are unchanged, and other dates in the text stay. If the text already contains the target date, no second copy is added and the source date is removed with one adjacent space, so `2026-10-14 Plan 2026-10-15` dropped on Oct 15 becomes `2026-10-15 Plan`. Links keep their text. Descendants are never changed.

The moved node becomes the selected, active occurrence under the target day, which is unfolded together with the moved node's ancestors there. The caret offset is kept when the node owned the focus, and its editor receives the focus again after the drop. The move is one undoable change that saves as any document edit does. Undo restores the previous dates and applies the history focus rule of §23.8.

### 23.13 Pending Vim Move

In Vim Normal, `dd` on a direct match marks that occurrence for a move and never deletes the node. A count marks the occurrence and the following direct matches of the same day at the same nesting level, skipping rows between them that do not qualify, such as contextual ancestors and nodes at other levels, and stops at the end of the day; fewer rows than the count mark the rows that exist. `dd` on a contextual ancestor, a day container, or a gap does nothing. Marking changes no document text, no Vim register, and not the system clipboard, and it is unavailable while persistence is locked.

While a move is pending, each marked occurrence stays visible with its text, bullet, and disclosure chevron dimmed, and the status bar shows `Moving 1 item · p to put · Esc to cancel`, or `Moving N items · …` for several, beside the Vim mode indicator. The text of the marked nodes does not change until the move is put. A pending move and the invalid-item hint of §23.7 never coexist, because any text edit cancels the move.

Navigation keeps the pending move: `j`/`k`, arrow keys, `gg`, `G`, `H`/`M`/`L`, `Ctrl+d`/`Ctrl+u`, mouse selection, scrolling, folding and unfolding, and expanding or collapsing gaps. `Esc` in any Vim mode (including the `Esc` that leaves Insert or Replace), any change of the document (a text edit or another move), Undo and Redo even when they change nothing, turning Vim off, and leaving the Agenda presentation (`Cmd+P`, `Cmd+.`) cancel it without an edit or an Undo entry. `dd` on a temporarily invalid item (§23.7) does nothing.

`p` or `P` on any row of a day (its day container, a direct match, or a contextual ancestor) moves the marked occurrences to that day by replacing each source day's date as §23.12 defines, and the dimming disappears. The moved nodes keep their parents and positions; the first moved node becomes the selected, active occurrence under the target day. The put is one undoable change. When the target is the marked occurrences' own day nothing changes, no history entry is created, and the pending state ends. `p`/`P` on a gap does nothing and the move stays pending; a gap inside the timeline is reached by expanding it with `Cmd+E` and putting on the revealed day.

Without a pending move, a node-register `p`/`P` does nothing in Agenda and a text-register `p`/`P` on a direct match is ordinary text editing (§23.9). `yy` copies as in Tree.

### 23.14 Vim Whole-Node Selection

`V` in Vim Normal on a valid direct match enters whole-node Visual mode. The range includes only visible direct matches of that day at the anchor's nesting level, even across different real parents. Contextual ancestors and nodes at other levels between them are skipped and keep their ordinary appearance. Qualifying rows use the shared selection highlight foreground and background, including their dates. Day containers, gaps, contextual ancestors, and temporarily invalid items cannot start a range.

`j`/`k` and counts extend through qualifying rows; `gg`/`G` reach the first/last qualifying row of that day, stopping at its edges. Moving focus to another node places its text caret at offset zero; a clamped motion keeps the caret. `o` swaps the endpoints as in Tree. `Esc` or `V` ends the range in Normal; `Esc` also cancels a pending move. Pointer navigation or folding that hides an endpoint ends an obsolete range, as does leaving Agenda or changing the document through history or text shortcuts.

Whole-node Visual `d` marks exactly the selected occurrences for the pending move of §23.13 and returns to Normal without changing text, history, registers, or clipboard. Putting the group replaces only the source dates in those nodes in one Undo step, leaving parents, order, descendants, and other dates unchanged. Other whole-node Visual mutation commands do nothing in Agenda. This deliberately differs from Vim's line deletion and structural range editing: Agenda edits a temporal projection of the same nodes.
