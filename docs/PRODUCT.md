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

The user is always viewing one level: either the top-level root nodes or the immediate children of the current parent.

The application is keyboard-first. Mouse interaction is primarily used for drag-and-drop reordering.

There is no separate view/edit mode.

The application automatically saves changes.

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

The UI does not display the entire expanded tree.

The user enters a node to view and edit its children.

The node representing the current parent is displayed as contextual information, is visually highlighted, and can be edited inline.

The node whose text field contains the caret is the selected node. When the current parent contains the caret, the current parent is selected and no child is selected.

Below the root level, the current parent is a real tree node, not a fake UI-only title.

If the current parent's text changes, the displayed context must update immediately.

The current parent is not part of `↑` / `↓` sibling navigation.

### 2.1 Node Presentation

Nodes are presented as plain, single-line outline rows with a solid 7px circular bullet to the left of their text. The bullet and text are aligned to consistent outline columns.

Nodes with one or more direct children display a muted outer circle surrounding their solid bullet, producing two concentric circles. Nodes without children display only the solid bullet. Clicking the circular indicator enters that node and displays its children; it does not place the text cursor or edit the node.

Node text is always edited inline. A node must not have a persistent input border or card-like container.

The focused node may have a subtle background to show its active editing state. It must not display an additional more-options or selection-dot ornament.

The current parent is presented above its children as a larger, bold, editable heading without a bullet.

An attached image is displayed beneath its node's text and aligned with that node's text column.

### 2.2 Location Path

A thin toolbar at the top of the application displays the current location.

At the root level, the toolbar displays only an outline-root glyph representing the implicit document container. The document container itself has no visible text label.

Below the root level, the toolbar displays a breadcrumb beginning with the outline-root glyph and continuing through every ancestor to the current parent. The current parent is the final breadcrumb segment.

The location path represents the current parent/location, not the selected child. The outline-root glyph and each ancestor segment are clickable navigation controls. Clicking the outline-root glyph returns to the top-level root nodes. Clicking an ancestor segment displays that ancestor's immediate children.

When navigation moves to an ancestor through the location path, the direct child on the path from the destination to the previous location becomes selected and its text cursor is placed at the beginning. Clicking the current-parent segment does nothing.

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

Move selection to the previous node on the current level.

If the current node is the first node on the level:

* do nothing.

When moving between nodes, preserve the horizontal cursor position as much as possible.

If the target node's text is shorter than the previous cursor position, place the cursor at the end of the target text.

### 4.2 Down

`↓`

Move selection to the next node on the current level.

If the current node is the last node on the level:

* do nothing.

Cursor-position behavior is the same as for `↑`.

---

## 5. Creating Nodes

### 5.1 Enter

When focus is on a node in the currently displayed level, `Enter` always creates a new sibling on the same level.

In that context, it never creates a child.

The new node is inserted immediately after the current node.

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

The new node has empty text. The UI does not display a `New node` placeholder.

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

The original text moves to the newly created sibling.

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

If the current node has an image:

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
* `↓` selects the first child and places the text cursor at the beginning of its text;
* if the parent has no children, `↓` does nothing;
* `↑` does nothing;
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

`Cmd+Backspace` deletes the current node and its entire subtree.

This is different from normal `Backspace`, which remains ordinary text editing.

After deleting a node from the currently displayed level:

1. If a next sibling exists, select it.
2. Otherwise select the previous sibling.
3. If the deleted node was the only node on the current level, return to the parent.
4. If the deleted node was the only root node, create a new empty root node.

When inside a parent, `Cmd+Backspace` deletes the currently selected child.

When the editable current parent is focused, `Cmd+Backspace` deletes that parent and its entire subtree, then navigates one level outward to the deleted node's parent.

If the deleted current parent was not a top-level root node, its parent becomes the new current parent and receives the text cursor.

If the deleted current parent was a top-level root node, navigate to the root level and apply the root-node selection and replacement rules above.

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

---

## 10. Undo and Redo

Undo and redo are mandatory in v1.

### Undo

`Cmd+Z`

### Redo

`Cmd+Shift+Z`

Undo/redo must support:

* text edits;
* node creation;
* Enter/split;
* node deletion;
* subtree deletion;
* sibling reordering;
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

Undo and redo do not restore the previous selection, text cursor position, or navigation state. The application must still keep those runtime states valid after the document changes.

Undo/redo history does not need to survive application restart.

---

## 11. Drag and Drop

Mouse drag-and-drop is supported for sibling reordering.

Drag-and-drop is allowed only between nodes on the displayed level: either top-level root nodes or immediate children of the current parent.

A drag operation:

* can reorder siblings;
* cannot change hierarchy;
* cannot change depth;
* cannot make one node a child of another;
* cannot move a node to another level.

The entire subtree moves together with its node.

Use drop zones between nodes.

There must be no "drop inside node" target.

After a move:

* the moved node remains selected;
* the change is automatically saved.

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

---

## 13. Plain Text Paste

Plain text is inserted at the current cursor position.

It does not replace the entire node.

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

Images are attachments, not independently draggable objects.

Dragging a node moves its image together with the node.

---

## 16. Persistence

The application automatically saves changes.

There is no Save button.

The document must persist between application restarts.

The following state must be persisted:

* the ordered top-level root nodes and their trees;
* stable node IDs;
* the current parent, or the root-level location when there is no current parent;
* the selected node.

The exact text cursor position does not need to be persisted.

The runtime navigation history does not need to be persisted.

Undo/redo history does not need to be persisted.

---

## 17. Images and Attachments

Each node may contain at most one image attachment.

Images are stored as local attachments rather than embedded directly into the document data.

Attachments belong to their nodes.

Moving a node moves the attachment with the node logically; the attachment does not need to be copied to another location.

Deleting a node must also delete its attachment when that attachment is no longer referenced.

Deleting a subtree must clean up attachments belonging to deleted nodes when they are no longer referenced.

Image attachments must survive application restart.

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
* be deleted explicitly by the user.

---

## 20. User Interaction Principles

The application is keyboard-first.

Text is always edited inline.

There is no separate view mode and edit mode.

The user normally interacts with the application through:

* keyboard navigation;
* keyboard commands;
* text editing;
* clipboard;
* mouse drag-and-drop for sibling reordering.

The tree hierarchy is primarily navigated by entering and leaving nodes rather than by expanding and collapsing a full tree view.
