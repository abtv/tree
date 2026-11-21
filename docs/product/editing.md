# Editing

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

In Normal mode, `h` and `l` move across the node's visible text characters and its optional image character, which follows the text. One visible character is one Unicode grapheme cluster: an emoji, including its skin tone, flag pair or joined sequence, takes one movement step and one block-caret position. Counts and character-wise Visual endpoints use those same boundaries. This visible-character rule takes precedence over component-level Vim movement for compound emoji. Standard editing and Vim Insert keep native Left/Right movement and selection over complete visible characters. An image-only node has the image as its sole character.

In Tree Normal mode, `l` from the final character selects the next visible row at its first character, and `h` from the first character selects the previous visible row at its final character. An attached image is the final character; an empty node without an image has one position. Crossing a node boundary consumes one movement step, and counts continue across as many visible rows as needed.

The order includes expanded descendants and the editable current-parent heading before its first child; hidden descendants are skipped, and the current location stays unchanged. At the outer boundaries, movement stops and preserves the active caret. This deliberate Vim divergence allows continuous horizontal navigation through the outline. Character Visual and operator motions remain within their node. Agenda applies the same character and boundary steps to its visible rows (§23.4).

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

In Tree standard editing and Vim Insert, `Enter` creates a node or splits its text according to the caret position. Agenda uses the single-node editing rules in §23.9. Vim Normal `Enter` keeps its image-preview and hyperlink behavior (see §20.2).

When a completion popup is open in standard editing or Vim Insert, plain `Enter` accepts its selected suggestion instead (§20.9, §20.12). Dismiss it with `Escape` before pressing `Enter` to keep the literal expression and create or split a node.

At the end of text, `Enter` follows the same placement rule as Vim `o` (§20.2.10): an expanded node with children receives a new empty first child, before its existing children; a collapsed node or a leaf receives a new empty sibling after its entire subtree. The current location and existing folds stay unchanged. An expanded parent with empty text also receives a first child; it is not an empty leaf.

At the beginning of nonempty text, the new empty sibling is inserted immediately before the current node. The current node stays selected with the caret at text position zero, after the inserted empty sibling. Repeated Enter inserts further empty siblings before that same text without moving the caret away from it. In the middle of text, the suffix becomes a new sibling after the current node's entire subtree. These two rules do not depend on expansion.

* On an empty leaf (no text, attachment, or children) shown inside an inline-expanded branch, `Enter` preserves that leaf. If it has a following sibling, `Enter` creates another empty sibling immediately after it at the same level, before the following sibling. Only when the empty leaf is the last sibling does `Enter` move that leaf immediately after its parent, one level left. It creates no node: the leaf keeps its identity, stays selected with the caret at text position zero, and the parent keeps its other children.
* This never leaves the current location: on a root or a direct child of the focused current parent, `Enter` creates the next sibling at the same level.
* Thus the first press at the end of nonempty text creates an empty child or sibling as specified above; the next press on that empty leaf moves it one level left only if it is the last sibling and that level is available. Vim `o` follows the same rule (§20.2.10).
* Each press creates one node, or moves one empty leaf, as one undoable change and keeps standard editing or Vim Insert active. It selects that node at text position zero, except at the beginning of nonempty text, where the original node stays selected as described above.

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

The example above is a leaf. An expanded parent creates the empty node as its first child instead. The new node has empty text, is selected, and receives the text cursor at the beginning of its text. The UI does not display a `New node` placeholder.

### Cursor at the beginning

Given:

```text
|Current
```

Press `Enter`.

Result:

```text

|Current
```

The new sibling is empty, and the original node keeps its text, image, children, selection, and text cursor.

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
* `↑` follows §4.1;
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

This is different from normal `Backspace`, which is ordinary text editing except when the node is empty or the caret is at its beginning (see 8.2–8.3).

After deleting a node from the currently displayed level:

1. If a next sibling exists, select it.
2. Otherwise select the previous sibling.
3. If the deleted node was the only node on the current level, return to the parent.
4. If the deleted node was the only root node, create a new empty root node.

When the deleted node is a visible descendant shown by inline expansion (§2.4) and has no sibling, its parent is selected and the location does not change; deleting a node never enters or leaves a location. The same holds for `dd`.

When the editable current parent is focused, `Cmd+Backspace` does nothing. The current parent and its subtree can only be removed by explicitly deleting that node from its displayed parent level.

### 8.2 Backspace on an Empty Node

Pressing `Backspace` on a node whose text is empty deletes that node and its entire subtree.

This applies to nodes on the displayed level. It does not apply to the editable current-parent heading, where `Backspace` is ordinary text editing.

An empty node that has an attachment or children is still deleted this way, including its subtree and its attachment.

After the deletion:

1. If a previous sibling exists, select its last visible row and place the text cursor at the end of that row's text. An expanded sibling's last visible descendant receives the caret; a collapsed sibling or a leaf receives it itself.
2. Otherwise, if the current parent exists, select the editable current parent and place the text cursor at the end of its text.
3. Otherwise, at the root level, select the next root node and place the text cursor at the beginning of its text.
4. If the deleted node was the only root node, do nothing; the empty root is kept.

When the deleted node is a visible descendant shown by inline expansion (§2.4), rule 2 selects its own parent with the text cursor at the end of its text and leaves the location unchanged. Only an explicit command — `Cmd+.`, `gd`, or the node's enter control — changes the location.

This is an explicit user action; §19 forbids automatic deletion of empty nodes.

### 8.3 Backspace at the Beginning of a Nonempty Node

In Tree standard editing and Vim Insert, plain `Backspace` with a collapsed text caret at position zero removes the immediately preceding visible row only if that row has no text, attachment, or children. The current node, its subtree, selection, caret at zero, location, and editing mode remain unchanged. The preceding row may be the last visible descendant of an expanded sibling. A collapsed node with children is not empty for this rule.

Otherwise, if the current node and its immediately preceding sibling both have nonempty text, no children and no attachment, the command joins them. It appends the current text unchanged, without inserting a space, to the preceding sibling. The preceding sibling keeps its ID; hyperlink ranges move with their text. Selection moves to that sibling with the text caret at the join, while location and editing mode remain unchanged. Nodes with different parents never join, even if their rows are adjacent on screen.

If neither rule applies, nothing changes. The editable current-parent heading cannot be removed or joined this way. Each removal or join is one undoable change. A successful change interrupts Vim Insert recording while keeping the previous repeatable change; a no-op keeps the Insert recording. Backspace on an empty current node follows §8.2, and Backspace with selected text or a caret after position zero is ordinary text editing. Agenda does not join nodes (§23.10).

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

Node identity under undo and redo follows §18.

Consecutive direct text edits are grouped into a continuous editing session for undo purposes. Direct text edits include typing, `Backspace`, and `Delete` within the same node.

A continuous text-editing session ends when any of the following occurs:

* five seconds pass without a text change;
* focus switches to another node or leaves the text field;
* the user explicitly moves the text cursor or changes the text selection within the node;
* the user cuts or pastes content;
* the user performs a structural command, including node creation, splitting, deletion, or reordering;
* the user invokes undo or redo.

Normal cursor advancement caused by typing or deletion does not end the session. Cut, paste, structural commands, undo, and redo are recorded separately from the preceding text-editing session.

* Undo and redo place the caret at the start of the change they apply, in the resulting document, as Vim does. The caret therefore stays on an undone or redone text edit rather than returning to the beginning of the node, and it reaches the change even when the user moved the caret away first.
* A change that restored, removed, or reordered whole nodes, or that struck a node through or returned it to normal (§2.5), places the caret at the start of the affected node; when a removal leaves no node in that place, the caret moves to the next remaining sibling, then the previous one, then the parent. This may select a different node.
* When the affected node is already a visible row of the current location (§2.4), including a descendant shown by inline expansion, undo and redo leave the location unchanged; only when it is not visible do they change the current parent so that the change is displayed.
* The rule is the same whether undo or redo was invoked with `u` and `Ctrl+r` in Normal mode or with the `Cmd+Z` and `Cmd+Shift+Z` application shortcuts.

Undo and redo restore no other previous selection or navigation state. The application must still keep those runtime states valid after the document changes.

For a move between parents, undo and redo select the moved node and place the caret at its start. They retain the current location when that node is visible there; otherwise they display its own parent's level. They do not restore the location that preceded the move.

Undo/redo history does not need to survive application restart.

The undo/redo history retains at most the 200 most recent entries. A history entry is one text-editing session or one structural command. When the limit is exceeded, the oldest entries are discarded and can no longer be undone.

---

## 11. Drag and Drop

External drops are not accepted anywhere in the desktop window or browser page, including Tree, Agenda, text fields, and dialogs. Dropping text, HTML, links, images, or files must not insert content, load resources, navigate, or import notes. This deliberately limits native drag-and-drop for security (§1.3); use clipboard paste or the explicit import commands to bring in content. Internal node movement described below is available.

Mouse drag-and-drop moves one node together with its subtree. Between-row gaps can reorder siblings or move the node to another parent. Dropping onto the middle of a node row makes the dragged node its last child. Dropping onto an ancestor breadcrumb segment or the root glyph appends to that destination and follows it, as specified in §2.2.

On touch devices, holding the empty gutter beside a node or its trailing row margin starts the same drag after 200 ms. Holding text uses native text selection and its magnifier. The node dot and fold arrow keep the actions of §2.1 and §2.4. Touch dragging uses Tree's destinations and cancellation rules. Agenda does not support node dragging (§23.12). Moving more than 4 pixels before activation or releasing early cancels the hold. Browser scrolling, text selection and callouts are disabled only on the empty drag surfaces, preserving native gestures over text and elsewhere.

Node movement begins when the primary mouse button is pressed and held on a node row for 200 ms. A quick press and release edits text and places the text cursor at the clicked position. Pointer movement within 4 pixels does not cancel the pending hold, but moving farther before the threshold cancels the pending drag so the gesture selects text instead; the pending hold also cancels if the pointer leaves the row.

* Once drag mode activates, the cursor changes to `grabbing`, text selection and caret movement stop, and the source row stays in place with its gray drag highlight. Keeping the source visible preserves its outline context while the user chooses a destination.
* The node's text surface loses focus while the drag is active: any transient selection is cleared, no text can be selected, and pointer movement cannot move the text cursor.
* The outer quarter of a row's height, capped at 8 pixels, acts as the gaps before and after it; its middle accepts the dragged node as a child.
* A gap shows a marker at the level chosen by horizontal movement from the press point: each full row-indent step right moves one level deeper, each step left moves one level shallower, and vertical movement alone keeps the source level. The level is clamped to the levels that gap permits.
* The dragged node and its visible descendants cannot be drop targets; hovering their row middles or internal gaps shows the not-allowed cursor, and release changes nothing.
* Releasing on an allowed gap or row completes the move. Releasing without changing the position leaves the document unchanged.
* When the drag ends, focus and the text cursor return to the node at the position captured when dragging activated. A successful move preserves that position through deferred focus restoration and a change of displayed location, including when the input is remounted. The caret uses the resulting editing mode's normal rendering and preserves an attached-image caret and its saved text return position. Later navigation and undo/redo apply their own caret rules.
* `Escape` cancels an active drag without moving the node, and cancellation keeps text selection disabled until the primary mouse button is released.

Gap targets are resolved against the visible rows with the dragged block removed. The chosen level cannot be shallower than the row below or deeper than one level below the row above. A gap inside the dragged block is invalid. Drops may reorder siblings, indent beneath a visible node, or outdent to a displayed ancestor or the document root.

The circular indicator is a dedicated pointer target for entering the node; it never places a text cursor or starts a row drag.

While a node is being dragged, its row displays a subtle gray background. The highlight clears when the drag ends.

The entire subtree moves together with its node.

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
