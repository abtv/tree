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

The application is keyboard-first. Mouse interaction is primarily used for drag-and-drop reordering.

Text remains editable inline. The editor also provides Vim-inspired Insert, Normal, and Visual interaction modes as defined in §20.2.

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

The user enters a node to view and edit its children.

The node representing the current parent is displayed as contextual information, is visually highlighted, and can be edited inline.

The node whose text field contains the caret is the selected node. When the current parent contains the caret, the current parent is selected and no child is selected.

Below the root level, the current parent is a real tree node, not a fake UI-only title.

If the current parent's text changes, the displayed context must update immediately.

The current parent is not part of `↑` / `↓` sibling navigation, except that `↑` on the first child moves selection to the current parent (see 4.1).

### 2.1 Node Presentation

Nodes are presented as plain outline rows with a solid 7px circular bullet to the left of their text. The bullet and text are aligned to consistent outline columns.

The visible center of each row's bullet, disclosure triangle, and selected-node focus indication aligns vertically with the center of the first text line. This alignment holds for wrapped text and remains correct as focus moves between rows. This is a product requirement, not a stylistic preference.

Nodes with one or more direct children display a muted outer circle surrounding their solid bullet, producing two concentric circles. Nodes without children display only the solid bullet. Clicking the circular indicator enters that node and displays its children; it does not place the text cursor or edit the node.

Nodes with children display a disclosure triangle to the left of their circular indicator. Clicking it expands or collapses that node inline without entering it, moving the text caret, or editing the node. Its direction indicates whether the node is expanded. Leaf rows retain the same text alignment without an active disclosure control. The selected node has a separate visible focus indication that is distinct from the disclosure triangle, whether or not it has children. The editable current-parent heading has no disclosure triangle.

Node text is always edited inline. A node must not have a persistent input border or card-like container.

Sibling reordering is started by pressing and holding the primary mouse button on a node row for 200 ms. When hovering an unfocused node, the pointer uses the standard pointer cursor; a focused node uses the text cursor while it is being edited. A quick press and release still places the text cursor at the clicked position, and pressing and dragging selects text. Holding the left Command key while hovering a hyperlink changes only that hyperlink to the hand cursor and enables Cmd+click opening. Moving the pointer by more than 4 pixels before the threshold cancels the pending drag so the gesture remains an ordinary text selection, and leaving the row while the button is still held also cancels it.

Node text wraps and the whole text is always shown; a node grows in height to fit its text. Wrapping is visual only: a node's text contains no line breaks, so the text flows across visual lines according to the available width. `Enter` does not insert a line break; it creates a sibling (see 5.1). Long unbroken strings are broken so that text never overflows horizontally. The bullet remains aligned with the first line of the node's text, and the attached image remains beneath the full text. The editable current-parent heading wraps in the same way.

Node rows retain the document-surface background when focused or hovered (white in the light appearance); focus and hover must not tint the editing row. Apart from the selection triangle of the selected node, a focused node must not display an additional more-options or selection-dot ornament.

The current parent is presented above its children as a larger, bold, editable heading without a bullet.

The first child is separated from the current-parent heading by the same compact vertical spacing used between node rows. A drag-and-drop target must not introduce an additional blank gap there.

At the root level, the first root node is positioned at the same height as the first child below a single-line current parent, so both levels share the same vertical rhythm.

An attached image is displayed beneath its node's text and aligned with that node's text column.
When a node has an image but no text, its empty text editor remains keyboard-editable but occupies no visible row in Normal mode; the image begins at the node's text column. Clicking the blank portion of the node row focuses its text editor. In Insert mode, the focused empty editor displays a normal-height insertion line and caret until text is entered or Insert mode ends. The same presentation applies when the node is shown as the current parent.
In Normal mode, the image can be the active character after the node's text; the image is visibly marked while active. For an image-only node, the image is its sole character.

### 2.2 Location Path

A thin toolbar at the top of the application displays the current location.

At the root level, the toolbar displays only an outline-root glyph representing the implicit document container. The document container itself has no visible text label.

Below the root level, the toolbar displays a breadcrumb beginning with the outline-root glyph and continuing through every ancestor to the current parent. The current parent is the final breadcrumb segment.

The location path represents the current parent/location, not the selected child. The outline-root glyph and each ancestor segment are clickable navigation controls. Clicking the outline-root glyph returns to the top-level root nodes. Clicking an ancestor segment displays that ancestor's immediate children.

When navigation moves to an ancestor through the location path, the direct child on the path from the destination to the previous location becomes selected and its text cursor is placed at the beginning. Clicking the current-parent segment does nothing.

The location toolbar is confined to a single line. When space is limited, shorter segments are preserved and longer segments are truncated first. A truncated segment ends with an ellipsis; its full text remains available as a tooltip. The toolbar never causes the window to scroll horizontally, regardless of path depth or segment length.

The toolbar also contains a pin toggle to the right of the location path. When enabled, the application window stays above other application windows, including after another application receives focus. The setting persists across application restarts. The toggle has a tooltip and a visually distinct active state. macOS may still impose limitations for some fullscreen Spaces.

### 2.3 Maximum Depth

Node depth is counted from the top-level root nodes. A top-level root node is at level 1, its children are at level 2, and so on.

The maximum node depth is 20 levels. A node at level 20 may be entered, selected, and edited normally, but it cannot have children.

If an action would create a node below level 20:

* do not change the document, selection, focus, undo/redo history, or persisted state;
* display `Nodes cannot be nested deeper than 20 levels.` as an operation error.

Sibling creation, multiline paste, image paste, editing, and reordering remain available at level 20 because they do not increase node depth.

Pasting a subtree or a multi-node Vim register is rejected in full when any copied node would fall below level 20; it is never partially applied or truncated.

A persisted document containing a node below level 20 is invalid. Loading such a document must fail safely, display the document-error state, and leave the persisted data unchanged.

### 2.4 Inline Expansion

All nodes begin collapsed when a location is opened. Clicking a node's disclosure triangle shows its direct children immediately beneath it, indented to reflect their depth. An expanded child can be expanded in the same way, and collapsing an ancestor hides every visible descendant beneath it. Expanding that ancestor again restores any nested expansion choices made during the same visit to the location.

Visible descendants are ordinary editable nodes: the user can click their text, place the caret, edit them, use their circular indicator to enter them, and expand or collapse their children. The location path and current-parent heading continue to represent the current location, even when a visible descendant has the caret. Existing keyboard commands that act on nodes use the focused node's actual sibling level. The Vim fold commands in §20.2 operate on the selected node's own fold and on the folds within the current location; expansion adds no other keyboard command and does not make the flattened view a new sibling list.

Expansion is view state, not a document edit. It creates no undo entry or save. Changing location, including entering a node or using the location path, clears all expansion choices; reopening the application also starts collapsed. If a collapse hides the node containing the caret, the collapsing node becomes selected with its caret at the beginning of its text. Collapsing a branch that does not contain the caret leaves selection and caret unchanged.

Dragging visible descendants can reorder nodes only among their actual siblings. An expanded view provides no cross-level drop target and cannot change hierarchy by dragging.

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

In Normal mode, `h` and `l` move across the node's text characters and its optional image character, which follows the text. An image-only node has the image as its sole character.

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

`Cmd+Z`, or `u` in Normal mode.

### Redo

`Cmd+Shift+Z`, or `Ctrl+r` in Normal mode.

Undo/redo must support:

* text edits;
* node creation;
* Enter/split;
* node deletion;
* subtree deletion;
* sibling reordering;
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

Undo and redo place the caret at the start of the change they apply, in the resulting document, as Vim does. The caret therefore stays on an undone or redone text edit rather than returning to the beginning of the node, and it reaches the change even when the user moved the caret away first. A change that restored, removed, or reordered whole nodes places the caret at the start of the affected node; when a removal leaves no node in that place, the caret moves to the next remaining sibling, then the previous one, then the parent. This may select a different node and change the current parent so that the change is displayed. The rule is the same whether undo or redo was invoked with `u` and `Ctrl+r` in Normal mode or with the `Cmd+Z` and `Cmd+Shift+Z` application shortcuts.

Undo and redo restore no other previous selection or navigation state. The application must still keep those runtime states valid after the document changes.

Undo/redo history does not need to survive application restart.

The undo/redo history retains at most the 200 most recent entries. A history entry is one text-editing session or one structural command. When the limit is exceeded, the oldest entries are discarded and can no longer be undone.

---

## 11. Drag and Drop

Mouse drag-and-drop is supported for sibling reordering.

Sibling reordering begins when the primary mouse button is pressed and held on a node row for 200 ms. A quick press and release edits text and places the text cursor at the clicked position. Pointer movement within 4 pixels does not cancel the pending hold, but moving farther before the threshold cancels the pending drag so the gesture selects text instead; the pending hold also cancels if the pointer leaves the row.

Once drag mode activates, the cursor changes to `grabbing`, text selection and caret movement stop, and the source row shows its gray drag highlight. The node's text surface loses focus while the drag is active: any transient selection is cleared, no text can be selected, and pointer movement cannot move the text cursor. Moving the pointer highlights the current between-row drop target and releasing completes the move. Releasing without changing the position leaves the document unchanged. When the drag ends, focus and the text cursor return to the node. `Escape` cancels an active drag without moving the node, and cancellation keeps text selection disabled until the primary mouse button is released.

Drag-and-drop is allowed only between actual siblings at the dragged node's level, including when those siblings are visible through inline expansion.

A drag operation:

* can reorder siblings;
* cannot change hierarchy;
* cannot change depth;
* cannot make one node a child of another;
* cannot move a node to another level.

The circular indicator remains a dedicated pointer target for entering the node; it never places a text cursor or starts a row drag.

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

When a valid HTTP or HTTPS URL is pasted, the URL is stored as a clickable hyperlink. The displayed link text is the URL itself. Plain-clicking a link places the editing caret, while `Cmd+click` opens it in the system's default hyperlink application. Links are underlined and use a distinct color that adapts to the light or dark appearance.

Only `http` and `https` URLs are hyperlinks. Invalid URLs and other schemes are pasted as ordinary text.

---

## 13. Plain Text Paste

Plain text is inserted at the current cursor position.

It does not replace the entire node.

Pasted valid HTTP(S) URLs receive hyperlink behavior at the inserted range. A hyperlink is editable character by character in Insert mode, including at its first and last characters. The caret and Normal-mode character motions can stop at each character inside a link. `Backspace` and `Delete` remove one character at a time within or next to a link, as they do for ordinary text.

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

Changes that do not insert content — creating, splitting, deleting, reordering, or undoing/redoing nodes — do not by themselves trigger a save. They remain pending and are saved by the next volume, idle, or quit trigger.

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

Text remains inline in every interaction mode; Vim-inspired modes change keyboard interpretation rather than opening a separate editing surface.

The user normally interacts with the application through:

* keyboard navigation;
* keyboard commands;
* text editing;
* clipboard;
* mouse drag-and-drop for sibling reordering.

The tree hierarchy can be navigated by entering and leaving nodes or inspected and edited through inline expansion. Expansion does not change the current location.

### 20.1 Very Wide Node Lists

When the current location contains more than 500 visible rows, including inline descendants, the application renders only the rows near the viewport plus a small overscan. The off-screen rows are absent from the DOM: browser find-in-page and assistive technology expose only the mounted rows, and selecting or copying text that spans off-screen rows requires scrolling to them.

The focused row stays mounted even when it is off-screen, so keyboard navigation, focus restoration, typing, and the caret never lose their input.

A drag that reaches the top or bottom edge of the window scrolls the page automatically, so a sibling can be moved to a position outside the mounted rows.

The page continues to scroll as a single document. The location bar and the current-parent heading scroll with the content.

At or below 500 visible rows, the list renders every row, including inline descendants, without windowing.

### 20.2 Vim-Inspired Editing

The editor starts in Normal mode, with a block caret on the current character. When the current node is empty, Normal mode displays a non-blinking block caret at its only insertion position. Pressing `i` or `a` enters Insert mode, where text entry and all existing application commands behave normally; Insert mode uses the normal thin text caret. Pressing `R` enters Replace mode, where printable input overwrites existing characters and appends after the end of the node. Pressing `Escape` enters Normal mode from Insert, Replace, or either Visual mode. If the user invokes an application undo or redo shortcut, selects all text, cuts or pastes, enters or leaves a node (including with the mouse), or deletes the selected node while Replace mode has a pending replacement, finish that replacement as one edit before running the command, then return to Normal mode; a select-all, cut, or paste commits it without disturbing the visible text or selection, so the command still acts on what the user selected. Quitting the application or closing the window while Replace mode has a pending replacement completes that replacement as one edit before the quit save, so the saved document includes it; a failed save leaves the replacement committed and the application open for a retry. The same interruptions during Insert mode leave Insert mode active, since Insert already behaves like other application commands run normally within it. Mouse clicks and pointer presses place focus or a text selection without changing the Vim mode, except that navigation through the location breadcrumb or a node's enter control, and an application command that changes focus or replaces the selection, end whole-node Visual mode for Normal mode and clear its selected range. A select-all, cut, or paste drops an unfinished Normal-mode command and both character-wise Visual endpoints before it runs; character Visual mode stays active, while a cut or paste leaves whole-node Visual mode and its selected range unchanged. A persistent indicator displays `INSERT`, `REPLACE`, `NORMAL`, `VISUAL`, or `VISUAL NODE`.

Normal mode supports:

* `gg` to focus the current parent when one exists, or the first displayed root node at the root level, and `G` to select the last displayed node (or the counted node) and its image when it has one;
* `h` and `l` to move by character within the current node; when the node has an image, it acts as a final character after the text, and an image-only node's sole character is its image;
* `j` and `k` to move between rows: for a node with text and an image, the text and image are separate rows, so `j` moves from text to image and `k` returns to the previous text position; when `k` moves from the first child to a current parent with an image, the image is the destination; `j` on the image moves to the next node, while `k` on an image-only node moves to the previous node. When no previous node exists at the displayed level, `k` on an image-only node leaves it selected with its image caret active. Only one caret is visible at a time: the text caret is hidden while the image caret is active;
* `H`, `M`, and `L` to select the top, middle, or bottom node currently visible in the viewport;
* `Ctrl+d` and `Ctrl+u` to move down or up by half the currently visible node rows;
* `u` to undo and `Ctrl+r` to redo the most recent undoable change;
* `w` and `b` to move between word starts, and `e` to move to a word end; letters, numbers, and underscores form words, while adjacent punctuation forms separate words;
* `W` and `B` to move between whitespace-delimited WORD starts, `E` to move to a WORD end, and `ge` to move backward to a word end;
* `f{character}` and `F{character}` to find the next or previous occurrence of a character within the current node, and `t{character}` and `T{character}` to stop immediately before or after that occurrence; a failed search leaves the caret in place;
* `;` to repeat the most recently issued `f`, `F`, `t`, or `T` motion and `,` to repeat it in the opposite direction; repeated finds support counts and never wrap or cross a node;
* `0`, `^`, and `$` to move to the beginning, first non-whitespace character, and final text character; `$` stops at the end of the text row even when an image occupies a second row;
* `i` to enter Insert mode at the current character, `a` to enter Insert mode after it, `I` to enter Insert mode at the first non-whitespace character, and `A` to enter Insert mode at the end of the current node;
* `o` to create an empty first child of the current parent when its heading is selected, or an empty sibling below the selected node, and enter Insert mode; `O` creates an empty sibling above the selected node, but does nothing when the editable current-parent heading is selected;
* `x` to delete the current character, `X` to delete the character before it, `r{character}` to replace it without entering Insert mode, and `s` to delete it and enter Insert mode; when deleting the final text character before an attached image, the Normal caret lands on the image, including when that was the node's only text character;
* `d`, `y`, and `c` followed by an in-node motion (`h`, `l`, `w`, `W`, `b`, `B`, `e`, `E`, `ge`, `0`, `^`, `$`, `f`, `F`, `t`, `T`, `;`, or `,`) to delete, copy, or change the covered text; `dw`, `d$`, `cw`, `c$`, and `yw` are supported examples; `c` enters Insert mode after changing text;
* `ys` followed by an in-node motion or text object and a delimiter to surround the covered text, `yss` and a delimiter to surround the whole node's text from its first non-whitespace character, `ds` and a delimiter to remove the nearest enclosing pair, and `cs` followed by a target and a replacement delimiter to change that pair;
* `D` as `d$` and `C` as `c$`, operating from the caret through the end of the current node's text;
* `cc` and `S` to clear the current node's text and enter Insert mode without deleting its subtree or metadata;
* `~` to toggle the case of the current character and advance, with a count toggling additional characters without crossing the node boundary; it advances onto an attached image when the changed text ends immediately before the image;
* `yy` to copy the selected node and its entire subtree into the local Vim register;
* `dd` to delete the selected node and its subtree using the normal node-deletion behavior;
* `gd` to enter the selected node, with the same behavior as `Cmd+.`;
* `Enter` to open the image preview when the caret is on the node's image, or open the hyperlink at a text caret in the system's default hyperlink application, with the same behavior as `Cmd+click`; it does nothing when neither applies;
* `Ctrl+o` to go back one parent level, with the same behavior as `Cmd+,`;
* `v` to enter character-wise Visual mode;
* `V` to enter whole-node Visual mode when a displayed sibling is selected; the editable current-parent heading cannot be selected with `V`;
* `p` and `P` to put the most recent local Vim register after or before the current node. A plain-text put from an image caret inserts the text before that image and leaves the Normal caret on the final inserted text character, with the image caret hidden.
* `zc`, `zo`, and `za` to close, open, or toggle the selected node's own fold, and `zC` and `zO` to close or open that fold together with every fold inside it. A fold is one node's direct children, shown or hidden exactly as its disclosure triangle shows them. These five commands do nothing on a node without children and do nothing on the editable current-parent heading, whose children are the displayed location itself. `zM` closes every fold in the current location, and `zR` opens every fold in the current location recursively. Fold commands never move the caret, except that `zM` selects the displayed ancestor of the caret with its caret at the beginning when closing the folds would hide the caret (§2.4). Counts do not apply to fold commands.

Numeric prefixes repeat in-node motions and text edits, including operator motions (`3w`, `2dw`, `3x`, and `2r{character}`). They also count node commands: `3j` and `5k` move by that many displayed nodes while clamping at the level boundary; `10G` selects the tenth displayed node at the current level, clamped to the last node; `3dd` deletes the current node and the next two displayed sibling subtrees; and `2yy` copies the current node and the next sibling subtree into the local register as an ordered forest. A count on `p` or `P` repeats the most recent subtree register that many times, assigning fresh IDs to every copy. Plain-text `p` and `P` repeat the register value by the requested count in one edit. `0` remains the beginning-of-text motion when no count is pending. Counts do not extend commands across nodes for in-node text edits, and do not apply to whole-node commands, sibling creation, or the fold commands. `u`, `Ctrl+r`, `Ctrl+o`, `Ctrl+d`, and `Ctrl+u` do not accept a count. Each of them discards a command that is still being assembled — a pending count, operator, prefix, or a command awaiting a character or delimiter — and makes no change; a command awaiting a character or delimiter takes `u` as that character instead. Word-motion deletion and yanking stop at the next word start, while `cw` changes through the current word end when the caret is on non-whitespace; `$` ranges include the final character. Text operators affect only the current node's text, preserving the node, children, hyperlinks outside the edited range, and attachment. `dd` and `yy` remain whole-subtree commands, with counted forms operating on a forward sibling range.

Text objects may follow `d`, `y`, or `c`, and may be selected in character-wise Visual mode. `iw`, `aw`, `iW`, and `aW` select a word or whitespace-delimited WORD, with `a` including adjacent whitespace where available. Inner and around quote objects use `"`, `'`, or backtick; bracket objects use either delimiter of `()`, `[]`, `{}`, or `<>`. Inner objects exclude delimiters; around objects include them. Bracket objects choose the nearest enclosing matched pair and counts choose successively outer pairs. Unmatched objects make no change. Text objects stay within the current node.

Surround delimiters are `(`, `[`, `{`, `<`, their closing counterparts, `"`, `'`, and backtick, with `b`, `r`, `B`, and `a` accepted as aliases for `)`, `]`, `}`, and `>`. An opening bracket adds one space inside the pair, while its closing counterpart adds none; removing or changing a pair named by an opening bracket also strips one such space from each side when present. `ds` and `cs` accept either delimiter of a pair, act on the nearest enclosing pair, and a count selects successively outer pairs. An unmatched pair or an unsupported delimiter makes no change. The caret moves to the start of the affected range, and each surround command is one undoable change that preserves hyperlinks inside and outside the affected text. In character-wise Visual mode, `S` followed by a delimiter surrounds the selection and returns to Normal mode; a surround that makes no change leaves the selection intact and remains in Visual mode. Surround commands stay within the current node.

`.` repeats the last completed Vim change at the current caret or node, including text changes, surround commands, `dd`, subtree puts, `o` and `O` with text typed before Escape, and whole-node Visual mutations. A repeated deletion-only Insert edit leaves the Normal caret one position left of its insertion point, clamped at the beginning, as the original Escape does. Repeated `o` opens a first child of the current node when the original `o` opened from a parent heading, or a sibling below when the original `o` opened from a selected node; repeated `O` opens a sibling above the current node. A count before `.` repeats the completed change that many times. Each structural repetition is a separate undoable command and subtree puts assign fresh IDs on every repetition. A repeated whole-node Visual mutation applies to the same number of siblings starting at the current node; if that many siblings are unavailable, it makes no change. Motions and yanks do not replace the saved change.

Visual mode selects characters only within the current node and uses the same yellow highlight as whole-node Visual mode. A deliberate multi-character selection in Normal mode — a pointer drag or `Cmd+A` — uses that highlight too, while the one-character Normal-mode block caret keeps its own block styling. The Normal-mode character and word motions extend the selection. `o` exchanges the active and anchored ends, and `v` returns to Normal mode. `y` copies the selection into an application-local plain-text register; `d` and `x` copy and delete it; and `c` and `s` copy and delete it before entering Insert mode. When Visual deletion removes the final text character before an attached image, the Normal caret lands on the image. Visual `u` and `U` lowercase or uppercase the selection and return to Normal mode with the caret at the start of the operated range. Visual `S` surrounds the selection as described above. Visual `p` and `P` replace the selection with a non-empty plain-text register, retain the pasted text in the register, and return to Normal mode. A Visual put with an empty or structured subtree register does nothing and remains in Visual mode. In Normal mode, `yy` copies the selected node and its entire subtree, while `dd` copies it before deleting it. If the most recent register action was Visual-mode text yank/delete or a character deletion, `p` and `P` insert that text after or before the current character. If the most recent register action was `yy` or `dd`, `p` and `P` insert a copy of the stored subtree as a sibling after or before the current node. Subtree puts preserve text, hyperlinks, and attachments and assign fresh node IDs to every pasted node. Yank, delete, change, case, and successful plain-text put commands return to Normal mode.

Whole-node Visual mode (`V`) selects a contiguous range of siblings at the currently displayed level, including every selected node's descendants. `j`, `k`, `gg`, and `G` extend the range; `o` exchanges its ends. The current-parent heading is excluded. `y` copies the selected subtrees into the local register; `d` and `x` copy and delete them; `c` and `s` copy and replace them with one empty node before entering Insert mode; `u` and `U` change the case of text in the selected subtrees. `p` and `P` replace the selected subtrees with fresh-ID copies of the node register without replacing that register. These structural mutations are each one undoable command. In Normal mode a multi-node register can be put before or after the current node. A node put whose target is a descendant of any source node reports an operation error and leaves the document unchanged. Empty or plain-text registers cannot be put in whole-node Visual mode.

The local Vim register is held only for the running renderer session. It does not replace or modify the system clipboard or persist across application restarts. It holds either one plain-text value, one structured node subtree, or an ordered set of sibling subtrees, with only the most recent register-producing action retained. Document search, named registers, macros, and marks are not supported.

Unsupported unmodified keys do not edit text in Normal or Visual mode. Application shortcuts using modifier keys retain their existing behavior. Vim handling is suspended during native text composition.

### 20.3 Typography

The application uses the bundled JetBrains Mono typeface for all user-interface text. The bundled
font is distributed under the SIL Open Font License 1.1; the application source remains under the
project's MIT license.

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
