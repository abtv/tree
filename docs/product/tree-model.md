# Tree Model

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

Alignment is judged from the painted result, not only element rectangles. The outer circle and inner point remain concentric; selecting a node changes the point's color, not its size or position. The gutter keeps one first-line reference across different letters, descenders and emoji; it does not follow the ink bounds of each word. Light and dark appearances preserve geometry, including at different display pixel densities.

Nodes with one or more direct children display a muted outer circle surrounding their solid bullet, producing two concentric circles. Nodes without children display only the solid bullet. Clicking the circular indicator enters that node and displays its children; it does not place the text cursor or edit the node.

Nodes with children display a disclosure chevron to the left of their circular indicator: it points right when the node is collapsed and down when it is expanded. Clicking it expands or collapses that node inline without entering it, moving the text caret, or editing the node. Leaf rows retain the same text alignment without an active disclosure control. The selected node has a separate visible focus indication, whether or not it has children: its bullet is drawn in the ordinary text color instead of the muted gutter color, with the same size and center as the bullet of an unselected node. The editable current-parent heading has no disclosure chevron.

Node text is always edited inline. A node must not have a persistent input border or card-like container.

Node movement begins when the primary mouse button is pressed and held on a node row for 200 ms. When hovering an unfocused node, the pointer uses the standard pointer cursor; a focused node uses the text cursor while it is being edited. A quick press and release still places the text cursor at the clicked position, and pressing and dragging selects text. Holding the left Command key while hovering a hyperlink changes only that hyperlink to the hand cursor and enables Cmd+click opening. Moving the pointer by more than 4 pixels before the threshold cancels the pending drag so the gesture remains an ordinary text selection, and leaving the row while the button is still held also cancels it.

Node text wraps and the whole text is always shown; a node grows in height to fit its text. Wrapping adds no stored line breaks. Each visual line occupies at most 120 character cells of the editor's monospace font, wrapping earlier when the window or indentation leaves less room. This limits displayed width, not the stored text length. In standard editing and Vim Insert, `Enter` creates or splits a node in Tree (§5.1), and inserts a line break in Agenda (§23.9). Long unbroken strings are broken so that text never overflows horizontally.

The editor uses the window width without a fixed centered page cap. Rows retain 28px of trailing space, and the text editor has its ordinary inner padding. The bullet remains aligned with the first text line, and an attached image remains beneath the full text. The editable current-parent heading wraps under the same character-cell limit.

While the Tree or Agenda list contains keyboard focus, only its selected row has a subtle background tint extending from the leading to the trailing edge of the scrolling content area, including the number column, side margins and indentation. Its width does not shrink to the text-width limit. The tint mixes the ordinary text color at 8% over the document surface in either appearance.

* For all text, including soft wrapping, the tint matches the current visual text line's height and position and follows the caret or active selection end.
* A Normal block caret identifies its character's line.
* Textless day separators use one ordinary text-line-height band.
* An active image caret uses a band whose top and bottom coincide with the outer edges of the image's visible focus outline. The band excludes the caption and surrounding spacing. Without a visible outline, the loading placeholder uses its own bounds.
* The tint never changes the text selection.

Other rows retain their normal background and text contrast; hover does not tint rows. Dragging and whole-node Visual selection suppress this tint so their existing feedback takes precedence.

The selected node retains its dark bullet without an additional more-options or selection-dot ornament. When the editable Tree current-parent heading has the caret, its active line uses the same full-width tint as a node row. Moving focus to a child moves the tint to that child.

The current parent is presented above its children as a larger, bold, editable heading without a bullet.

The first child is separated from the current-parent heading by the same compact vertical spacing used between node rows. A drag-and-drop target must not introduce an additional blank gap there.

At the root level, the first root node is positioned at the same height as the first child below a single-line current parent, so both levels share the same vertical rhythm.

* An attached image is displayed beneath its node's text and aligned with that node's text column.
* When a node has an image but no text, its empty text editor remains keyboard-editable but occupies no visible row in Normal mode; the image begins at the node's text column. Clicking the blank portion of the node row focuses its text editor. While the image-only row shows no text line, its bullet and selected-node focus indication keep the vertical position they have on a single-line text row, which places them beside the top edge of the image.
* A collapsed empty editor leaves no text-to-image gap: the image starts at the row's top, with its gutter markers within the image's first-line-height area. Selecting an image does not move or resize it; only its frame and band change. When the empty editor becomes visible for insertion, the ordinary spacing between text and image returns.
* In Insert mode, and always while Vim editing is disabled, the focused empty editor displays a normal-height insertion line and caret until text is entered or Insert mode ends. The same presentation applies when the node is shown as the current parent.
* In Normal mode, the image can be the active character after the node's text; the image is visibly marked while active. For an image-only node, the image is its sole character.

#### 2.1.1 Line Numbers

`Ctrl+L` and the `toggle-line-numbers` command toggle ordinary line numbers in
Tree and Agenda, in standard editing and every Vim mode. Control is literal on
every platform. Numbers are off initially; the preference survives restarts
separately from the document and does not add undo history or save the document.

Each visible node receives one number, starting at 1 in the current view and
following its displayed order, including expanded descendants. Wrapped text and
image-only nodes each receive one number. Collapsed descendants are excluded;
scrolling and list virtualization do not restart numbering. The Tree parent
heading, Agenda day headings and separators are not numbered. Agenda counts each visible
direct-match node occurrence, including repeated occurrences on different
days. Changing view, scope or folds recomputes the numbers for that view.

Numbering stays independent of wrapping. In Vim Normal, `j`/`k` still follow
visual text lines (§20.2.9, §23.4), so the caret can move while the node's number
stays the same.

Numbers occupy a separate, muted, right-aligned column to the left of the outline,
aligned with each node's first text line. They do not replace bullets or fold
controls, enter copied text, or change selection, caret, editing mode or pending
Vim commands. Holding the shortcut does not repeatedly toggle. Modal dialogs,
composition and command/search input keep their own keyboard handling.

Tree and Agenda always reserve the same number column, including when numbers are
hidden. Its width fits the number of digits in the full visible list, with a
two-digit minimum; virtualization does not size it from only the mounted rows.
Changing the preference hides or shows numbers without moving text, disclosure
controls or bullets, changing text width, or changing wrapping. Adding rows or
changing scope or folds may change the width when another digit is needed.

The column begins 4px from the leading edge. Before hierarchy indentation, text
begins 40px after its right edge. Number, disclosure, bullet and text remain
separate; control sizes and the 20px indentation step stay unchanged in both states.

This explicit Control shortcut follows the owner's keyboard-first choice (§1.3).
Browsers may reserve Ctrl+L for their address bar; the command panel remains available.

### 2.2 Location Path

A thin toolbar at the top of the application displays the current location.

At the root level, the toolbar displays only an outline-root glyph representing the implicit document container. The document container itself has no visible text label.

Tree and Agenda use the same toolbar insets and vertically centered 18px location icons. The root glyph has a `Top level` tooltip; the calendar glyph has an `Agenda` tooltip and accessible name. Text path segments use the same `›` separator in both views.

Below the root level, the toolbar displays a breadcrumb beginning with the outline-root glyph and continuing through every ancestor to the current parent. The current parent is the final breadcrumb segment.

The location path represents the current parent/location, not the selected child. The outline-root glyph and each ancestor segment are clickable navigation controls. Clicking the outline-root glyph returns to the top-level root nodes. Clicking an ancestor segment displays that ancestor's immediate children.

When navigation moves to an ancestor through the location path, the direct child on the path from the destination to the previous location becomes selected and its text cursor is placed at the beginning. Clicking the current-parent segment does nothing.

During a node drag, the root glyph below root level and every ancestor segment accept the dragged subtree as their last child (the last root for the glyph). The current-parent segment and the glyph at root level do not accept drops. Each segment's hit region spans its width and the toolbar's full height; an accepting segment shows the existing hover-surface color without animation or layout shift. Toolbar targets take precedence over row targets; toolbar whitespace is invalid, and hovering the toolbar does not auto-scroll the list. A successful drop displays the destination's children and selects the moved node.

The location toolbar is confined to a single line. When space is limited, shorter segments are preserved and longer segments are truncated first. A truncated segment ends with an ellipsis; its full text remains available as a tooltip. The toolbar never causes the window to scroll horizontally, regardless of path depth or segment length.

The toolbar is sticky: it stays fixed at the top of the window while the content scrolls beneath it, and the content never shows through it. The scrollbar belongs to the content area below the toolbar and never overlaps the toolbar.

* The pin toggle sits at the right end of the status bar fixed at the bottom of the window (§20.2). When Vim editing is enabled, the mode indicator sits immediately to its left. There is no Vim editing toggle in the status bar. The toolbar does not contain the pin.
* When enabled, the application window stays above other application windows, including after another application receives focus. The setting persists across application restarts.
* The toggle has a visually distinct active state and a tooltip naming its current action (`Pin window on top` or `Unpin window from top`), shown above the toggle while the pointer is over it or it has keyboard focus. The tooltip is drawn by the application, because native `title` tooltips do not appear in the application window.
* Clicking the toggle with the pointer leaves keyboard focus, the caret, and the current Vim mode in the editor; it does not focus an editor when none had focus. Focusing the toggle with `Tab` still gives it keyboard focus.
* macOS may still impose limitations for some fullscreen Spaces.

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

Expansion choices belong to a view. Tree has one root view and one view for each starred node (§2.6). A location uses the view of the nearest starred node among its current parent and that parent's ancestors; without one, it uses the root view. Within a view, every node remembers whether it is expanded, and a node never expanded there is collapsed. Clicking a node's disclosure chevron shows its direct children immediately beneath it, indented to reflect their depth. An expanded child can be expanded in the same way, and collapsing an ancestor hides every visible descendant beneath it. Expanding that ancestor again restores the nested expansion choices beneath it.

* Visible descendants are ordinary editable nodes: the user can click their text, place the caret, edit them, use their circular indicator to enter them, and expand or collapse their children.
* The location path and current-parent heading continue to represent the current location, even when a visible descendant has the caret.
* Motion between nodes (`↑`, `↓`, `j`, `k`, `←`, `→`, `G`, and counted forms) follows the location's visible rows, including descendants shown by inline expansion.
* Commands that act on the tree — sibling creation, deletion, yank and put, and whole-node Visual ranges — use the focused node's actual sibling level and operate on a sibling subtree as one unit.
* Dragging moves a node's whole subtree between visible rows at the level selected by the pointer; it may change the node's parent.
* The Vim fold commands in §20.2 operate on the selected node's own fold and on the folds within the current location.
* `Cmd+E` toggles the selected node's own fold, exactly as `za` does, in every Vim mode and in the same way whether or not Vim mode is enabled: it does nothing on a node without children and on the editable current-parent heading, never moves the caret, and does not end Insert mode. Like the other `Cmd` commands it discards an unfinished Normal-mode command.
* Expansion adds no other keyboard command.

Expansion is view state, not a document edit. It creates no undo entry and never saves by itself.

An expansion change is a pending change like a selection change: the idle, volume, and quit triggers in §16.1 save it together with the document.

Expansion choices are kept when the location changes: entering a node shows its children with the choices its view remembers, and leaving it or using the location path shows the destination with the choices made in its view before. Reopening the application restores every remembered choice of the root view and of each starred node's view.

* Every fold change in a location — the disclosure chevron, `Cmd+E`, the Vim fold commands, and the folds that Find, a drop, a shift, `o` or a put opens — changes only that location's view. At the root level, `zM` closes every fold of the root view and leaves the starred nodes' views unchanged.
* A starred node receives its own view the first time it governs the displayed location: a copy of the view its locations would use without the star — the nearest starred ancestor's view, or the root view — limited to the node's descendants. Its rows therefore look as they would without the star.
* When a star is removed, the node's locations use the view of its nearest starred ancestor, or the root view. If that view hides the selected node, its nearest displayed ancestor becomes selected with the caret at the beginning of its text. Undo restores the star and its view; starring the node again in the same session also restores the view. A view is saved only while its node is starred.
* Opening and closing Agenda changes no fold choice. A star added or removed while Agenda is open, directly or by undo, selects the governing view under these rules when Agenda closes.

If a collapse hides the node containing the caret, the collapsing node becomes selected with its caret at the beginning of its text. Collapsing a branch that does not contain the caret leaves selection and caret unchanged.

When the application opens with a selected node that a collapsed ancestor hides, for example a document saved before expansion was remembered, the nearest displayed ancestor is selected instead, with its caret at the beginning of its text.

Deleting a node retains its remembered expansion choice, including choices for its descendants. Undoing the deletion restores those choices, so restored nodes keep their previous expansion. These retained choices remain view state and do not become part of document history.

Dragging visible descendants moves a sibling subtree as one unit. Gaps are resolved against the visible rows with that subtree removed; a drop level is no shallower than the row below and no deeper than one level below the row above. A gap can therefore indent beneath an ancestor or outdent to an ancestor or the document root. Gaps inside the dragged subtree are invalid and release there changes nothing.

### 2.5 Struck-Through Nodes

A node can be struck through, for example to mark a task as done. A struck-through node draws a line through its text and shows the text in a muted color in every appearance. Hyperlinks inherit that muted color without an underline and remain operable. Recognized dates in Tree and Agenda inherit the surrounding struck-through text color instead of their date color; their font weight stays unchanged. Inside a selection highlight (§20.2) its text takes the highlight colors and keeps the line. Its circular indicator, disclosure chevron, and attached image are drawn as usual, and its text stays editable.

This presentation applies to Tree, Agenda, location breadcrumbs, recent nodes, global search results, and each node label in their parent paths; path separators remain unstruck. Search-match emphasis remains visible under the line.

* A leaf has its own completion state. A node with children is struck through exactly when all of its direct children are struck through; this rule applies recursively up to the roots. A partially completed parent is not struck through.
* `Cmd+Enter` toggles the selected node and its entire subtree, including collapsed descendants. If the branch is complete, every node in it returns to normal; otherwise every node becomes struck through. It works on every node, including the editable current-parent heading, in every Vim mode and in the same way whether or not Vim mode is enabled. An ordinary click still only places focus or the caret.
* In whole-node Visual mode it acts on all selected subtrees: when every selected branch is complete, they all return to normal; otherwise they all become complete. Ancestors outside the range are recalculated from their children. It then returns to Normal mode, as the other whole-node Visual commands do.
* In character Visual mode it acts on the current node, keeps character Visual mode, and clears the selection endpoints like the other `Cmd` commands. It never moves the caret, does not end Insert mode, and, like the other `Cmd` commands, discards an unfinished Normal-mode command. A pending Replace edit is completed as one edit first and Replace mode ends in Normal mode, as for the other application commands in §20.2.
* `Cmd+Enter` is not repeated by `.` and leaves the Vim register unchanged; `Cmd+Shift+Enter` and `Cmd+Option+Enter` do nothing. It is not part of Apple's standard keyboard shortcuts, so it conflicts with none of them (§1.3).

Each toggle, including its descendant and ancestor changes, is one undoable change. Undo restores the exact previous mixture of completed and incomplete nodes. Undo or redo places the caret at the beginning of the first node it changes (§10), which can be an ancestor whose completion changed. It is a pending change saved by the idle, volume, and quit triggers in §16.1; it does not save immediately. In the locked save-failure state (§16.2) it is rejected like any other document change.

The state belongs to the node and travels with it:

* Splitting a node with `Enter` or a multiline paste keeps the state on the part that keeps the node's identity; the new part starts normal. Every newly created leaf starts normal, including the nodes `Enter`, `o`, and `O` create. Adding an incomplete child reopens its parent and any completed ancestors.
* Joining nodes with `gJ` derives the result's state from its combined children. When the result has no children, it keeps the first node's state.
* Moving a node, by dragging or by `>` and `<`, keeps the moved subtree's state, and a node or subtree put with `p` or `P` copies the state of every copied node. Insertions, deletions, replacements, and moves recalculate all affected ancestors in the same history change. If a parent loses its last child, it becomes a leaf and keeps its state immediately before that removal.
* The system clipboard carries text only, so copying text and pasting it creates no struck-through node.
* Saving and reopening the application keeps completion. Existing documents preserve every leaf's state and recalculate parents from children when loaded, even if their old independent parent states disagree. A document saved before struck-through nodes existed opens with every node normal.

`toggle-finished-tasks` in the command panel shows or hides struck-through nodes throughout Tree, the Agenda timeline and focused days, local Find, and global Search, including marked, starred and recent results and marker suggestions. Find and Search include unfinished nodes in folded branches. Finished tasks are visible by default. The desktop and browser each remember the choice in their local application preferences across restarts. The choice is independent of notes and Undo history.

If the selected Tree row is hidden, select the next visible row, or the preceding row if there is no next row. In an open branch with no visible child, select its heading. If the open branch itself is finished, first move to its nearest unfinished parent or the root. If the root has no visible rows, keep it empty with no selected task. The command remains available there. In Agenda, a hidden selected occurrence moves to the next visible occurrence in its day or Overdue group, then the preceding occurrence, then the ordinary nearest day heading. A selection that remains visible keeps focus and its caret.

---

### 2.6 Starred Nodes

`toggle-star-node` in the command panel adds or removes a star on the current real node. It changes only that node, including the editable Tree parent heading and real Agenda nodes; synthetic Agenda rows cannot be starred. It has no default keyboard shortcut. The command shows its active state when the current node is starred.

A starred node also has its own expansion view for the locations below it (§2.4).

A small star replaces the node's circular marker in Tree and Agenda. For the current node, the star itself takes the focused marker's text color; no circular focus dot is drawn over it. The editable parent heading shows a larger star to the left of its text, centered vertically on the first line. Starred Search results also show the star to the left of their text. The indicator is outside editable text and does not change text, caret offsets or the marker's navigation action.

The star is document content. A toggle is one undoable change, keeps selection and caret in place, and uses the ordinary pending-save policy and save-failure lock (§16). A pending Vim Replace edit finishes as a separate change before the toggle, returning to Normal mode. Undo/Redo uses the changed node's beginning as its change site (§10). Stars survive restart, content edits and moves. Subtree copies retain each copied node's star. Newly created nodes start without a star; splitting retains it on the original identity and joining retains the surviving identity's star. Older documents load without stars. Text-only clipboard copies contain no star metadata.

### 2.7 Marked Nodes

`toggle-mark-node` in the command panel adds or removes a mark on the current real node. It targets the same node as `toggle-star-node` (§2.6), including the editable Tree parent heading and real Agenda nodes; synthetic Agenda rows cannot be marked. It has no default keyboard shortcut. The command shows its active state when the current node is marked.

A mark has no date. Agenda lists every marked node under Today, on every day, until the mark is removed (§23.2). Striking a marked node through keeps its mark; finished-task visibility (§2.5) applies to it as to any other node. Search lists marked nodes first (§20.14).

A marked node's circular marker is drawn in a calm teal in Tree and Agenda: `#4a9b8f` in the light appearance, `#6aa99b` in the dark appearance, and `#4c9a93` in Gray and White.

* A marked node with children also draws its outer ring in a soft tint of that teal instead of the neutral ring color; the tint is stronger while the pointer is over the marker.
* A node that is both starred and marked keeps its star, drawn in that teal.
* For the current node, the dot or star uses a stronger teal (`#1c7166`, `#9fe0cf` and `#1a7068` respectively) instead of the text color, so the mark stays visible on the current row.
* A marked parent heading without a star shows a teal dot where a star would be.
* A live Agenda mirror of a marked node (§23.7) draws its hollow ring in that teal instead of the gutter color.
* Marked Search results show the teal dot, or the teal star, to the left of their text.
* The indicator is outside editable text and does not change text, caret offsets or the marker's navigation action.

The mark is document content and follows the star's rules (§2.6): a toggle is one undoable change, keeps selection and caret in place, and uses the ordinary pending-save policy and save-failure lock (§16). A pending Vim Replace edit finishes as a separate change before the toggle. Undo/Redo uses the changed node's beginning as its change site (§10). Marks survive restart, content edits and moves. Subtree copies retain each copied node's mark. Newly created nodes start without a mark; splitting retains it on the original identity and joining retains the surviving identity's mark. Older documents load without marks. Text-only clipboard copies contain no mark metadata.

## 3. Initial State

On first launch, when no document exists:

* create one empty top-level root node;
* display it;
* place the text cursor into it.

Empty nodes are valid and must never be automatically deleted.

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
