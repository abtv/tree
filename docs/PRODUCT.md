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

The current parent is not part of `↑` / `↓` sibling navigation, except that `↑` on the first child moves selection to the current parent (see 4.1).

### 2.1 Node Presentation

Nodes are presented as plain outline rows with a solid 7px circular bullet to the left of their text. The bullet and text are aligned to consistent outline columns.

Nodes with one or more direct children display a muted outer circle surrounding their solid bullet, producing two concentric circles. Nodes without children display only the solid bullet. Clicking the circular indicator enters that node and displays its children; it does not place the text cursor or edit the node.

Node text is always edited inline. A node must not have a persistent input border or card-like container.

When the pointer enters a draggable node, its text-editing cursor remains visible briefly before the drag cursor appears. Moving the pointer away before that delay cancels the drag-cursor affordance.

Node text wraps and the whole text is always shown; a node grows in height to fit its text. Wrapping is visual only: a node's text contains no line breaks, so the text flows across visual lines according to the available width. `Enter` does not insert a line break; it creates a sibling (see 5.1). Long unbroken strings are broken so that text never overflows horizontally. The bullet remains aligned with the first line of the node's text, and the attached image remains beneath the full text. The editable current-parent heading wraps in the same way.

Node rows retain the document-surface background when focused or hovered (white in the light appearance); focus and hover must not tint the editing row. A focused node must not display an additional more-options or selection-dot ornament.

The current parent is presented above its children as a larger, bold, editable heading without a bullet.

The first child is separated from the current-parent heading by the same compact vertical spacing used between node rows. A drag-and-drop target must not introduce an additional blank gap there.

An attached image is displayed beneath its node's text and aligned with that node's text column.

### 2.2 Location Path

A thin toolbar at the top of the application displays the current location.

At the root level, the toolbar displays only an outline-root glyph representing the implicit document container. The document container itself has no visible text label.

Below the root level, the toolbar displays a breadcrumb beginning with the outline-root glyph and continuing through every ancestor to the current parent. The current parent is the final breadcrumb segment.

The location path represents the current parent/location, not the selected child. The outline-root glyph and each ancestor segment are clickable navigation controls. Clicking the outline-root glyph returns to the top-level root nodes. Clicking an ancestor segment displays that ancestor's immediate children.

When navigation moves to an ancestor through the location path, the direct child on the path from the destination to the previous location becomes selected and its text cursor is placed at the beginning. Clicking the current-parent segment does nothing.

The location toolbar is confined to a single line. When space is limited, shorter segments are preserved and longer segments are truncated first. A truncated segment ends with an ellipsis; its full text remains available as a tooltip. The toolbar never causes the window to scroll horizontally, regardless of path depth or segment length.

### 2.3 Maximum Depth

Node depth is counted from the top-level root nodes. A top-level root node is at level 1, its children are at level 2, and so on.

The maximum node depth is 20 levels. A node at level 20 may be entered, selected, and edited normally, but it cannot have children.

If an action would create a node below level 20:

* do not change the document, selection, focus, undo/redo history, or persisted state;
* display `Nodes cannot be nested deeper than 20 levels.` as an operation error.

Sibling creation, multiline paste, image paste, editing, and reordering remain available at level 20 because they do not increase node depth.

A persisted document containing a node below level 20 is invalid. Loading such a document must fail safely, display the document-error state, and leave the persisted data unchanged.

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

If the current node is the first node on the level, and the current parent exists:

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

Move selection to the next node on the current level.

If the current node is the last node on the displayed level:

* keep the last node selected;
* place the caret at the end of its text.

For sibling movements, cursor-position behavior is the same as for `↑`.

### 4.3 Left and right

`←` and `→` move between adjacent nodes when the caret is at the corresponding text boundary.

When the caret is at the beginning of a node and the user presses `←`:

* if a previous sibling exists, select it and place the caret at the end of its text;
* otherwise, if the node is a child, select its parent and place the caret at the end of the parent's text;
* otherwise, do nothing.

When the caret is at the end of a node and the user presses `→`:

* if a next sibling exists, select it and place the caret at the beginning of its text;
* otherwise, do nothing.

When the editable current parent is selected and the caret is at the end of its text, pressing `→` selects its first child and places the caret at the beginning of that child's text. If the current parent has no children, do nothing.

At any other caret position, `←` and `→` retain their ordinary text-editing behavior.

---

## 5. Creating Nodes

### 5.1 Enter

When focus is on a node in the currently displayed level, `Enter` always creates a new sibling on the same level.

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

This is different from normal `Backspace`, which remains ordinary text editing except when the node is empty (see 8.2).

After deleting a node from the currently displayed level:

1. If a next sibling exists, select it.
2. Otherwise select the previous sibling.
3. If the deleted node was the only node on the current level, return to the parent.
4. If the deleted node was the only root node, create a new empty root node.

When inside a parent, `Cmd+Backspace` deletes the currently selected child.

When the editable current parent is focused, `Cmd+Backspace` deletes that parent and its entire subtree, then navigates one level outward to the deleted node's parent.

If the deleted current parent was not a top-level root node, its parent becomes the new current parent and receives the text cursor.

If the deleted current parent was a top-level root node, navigate to the root level and apply the root-node selection and replacement rules above.

### 8.2 Backspace on an Empty Node

Pressing `Backspace` on a node whose text is empty deletes that node and its entire subtree.

This applies to nodes on the displayed level. It does not apply to the editable current-parent heading, where `Backspace` remains ordinary text editing.

An empty node that has an attachment or children is still deleted this way, including its subtree and its attachment.

After the deletion:

1. If a previous sibling exists, select it and place the text cursor at the end of its text.
2. Otherwise, if the current parent exists, select the editable current parent and place the text cursor at the end of its text.
3. Otherwise, at the root level, select the next root node and place the text cursor at the beginning of its text.
4. If the deleted node was the only root node, do nothing; the empty root is kept.

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

The undo/redo history retains at most the 200 most recent entries. A history entry is one text-editing session or one structural command. When the limit is exceeded, the oldest entries are discarded and can no longer be undone.

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

The row's editable surface is also a grab area when it is not focused, providing a broad drag target. The circular indicator remains a pointer target for entering the node, and a focused text field remains an editing target.

While a node is being dragged, its row displays a subtle gray background. The highlight clears when the drag ends.

The entire subtree moves together with its node.

Use drop zones between nodes.

The drop zones before the first sibling and after the last sibling have expanded hit areas while preserving the list's normal spacing. The bottom edge target is larger than the top edge target to make use of the available space after the final sibling.

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

When a valid HTTP or HTTPS URL is pasted, the URL is stored as a clickable hyperlink. The displayed link text is the URL itself. Clicking the link opens it in the system's default hyperlink application. Links are underlined and use a distinct color that adapts to the light or dark appearance.

Only `http` and `https` URLs are hyperlinks. Invalid URLs and other schemes are pasted as ordinary text.

---

## 13. Plain Text Paste

Plain text is inserted at the current cursor position.

It does not replace the entire node.

Pasted valid HTTP(S) URLs receive hyperlink behavior at the inserted range. Existing links cannot be edited. Pressing `Backspace` immediately after a link removes the complete link rather than one character at a time.

When a caret position falls inside a non-editable hyperlink, the visible caret is placed at the nearer editable boundary of that hyperlink. If the position is exactly halfway between the boundaries, it is placed before the hyperlink.

### 13.1 Selecting, copying, cutting, and pasting linked text

`Cmd+A` visibly selects all text in the currently focused node, including its hyperlinks.

`Cmd+C` copies the selected text. When the selection contains hyperlinks, the clipboard content preserves both the text and the clickable hyperlink ranges.

Copying does not clear or otherwise change the visible text selection.

`Cmd+X` cuts the selected text. When the selection contains hyperlinks, the cut clipboard content preserves both the text and the clickable hyperlink ranges.

Cutting writes the selection to the clipboard before removing it from the node. If the node's content changes while the clipboard write is still pending, the cut does not remove any text: the changed document is preserved and the application reports an operation error explaining that the text changed. The clipboard may already contain the original selection, and the intervening changes are not reverted.

Pasting that content into another node inserts the text and preserves its clickable hyperlinks. If only part of a hyperlink is selected, only the selected portion is pasted as a hyperlink when the selected text remains the complete URL; otherwise it is pasted as ordinary text.

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

### 16.1 Automatic Save Policy

The application does not save on every keystroke.

A save is performed when:

* an image is inserted;
* a hyperlink is inserted;
* ten words have been inserted since the last successful save;
* no document change has occurred for ten seconds while changes are pending.

Changes that do not insert content — creating, splitting, deleting, reordering, or undoing/redoing nodes — do not by themselves trigger a save. They remain pending and are saved by the next volume, idle, or quit trigger.

Only inserted words count toward the volume threshold. Deletions and other changes still reset the idle timer and keep changes pending.

Every pending change is flushed before a normal quit completes.

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
* the selected node.

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

`Cmd+Enter` opens the image preview for the selected node or the editable current parent when that node has an attached image. When neither the selected node nor the current parent has an image, `Cmd+Enter` does nothing.

The image preview is a modal overlay within the application window. It displays the image fitted within the available window area while preserving its aspect ratio, and it does not enlarge the image beyond its natural size.

Only one preview is open at a time. The preview has a visible close button and also closes on `Esc`. Closing the preview returns focus to the element that was focused before the preview opened.

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

There is no separate view mode and edit mode.

The user normally interacts with the application through:

* keyboard navigation;
* keyboard commands;
* text editing;
* clipboard;
* mouse drag-and-drop for sibling reordering.

The tree hierarchy is primarily navigated by entering and leaving nodes rather than by expanding and collapsing a full tree view.

### 20.1 Very Wide Node Lists

When a displayed level contains more than 500 siblings, the application renders only the rows near the viewport plus a small overscan. The off-screen rows are absent from the DOM: browser find-in-page and assistive technology expose only the mounted rows, and selecting or copying text that spans off-screen rows requires scrolling to them.

The focused row stays mounted even when it is off-screen, so keyboard navigation, focus restoration, typing, and the caret never lose their input.

A drag that reaches the top or bottom edge of the window scrolls the page automatically, so a sibling can be moved to a position outside the mounted rows.

The page continues to scroll as a single document. The location bar and the current-parent heading scroll with the content.

At or below 500 displayed siblings, the list renders every row and behaves exactly as before, including find-in-page and accessibility.

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

Concrete budgets are not fixed here. When a change can affect performance at scale, the implementation must add or update an automated performance guard at the appropriate level (unit, boundary, or performance suite). Budgets are derived from measured baselines and recorded with the relevant implementation plan.
