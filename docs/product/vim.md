# Vim-Inspired Editing

### 20.2 Vim-Inspired Editing

#### 20.2.1 Toggle and Preference

* Vim-inspired editing is optional.
* Edit > Vim Editing switches it on and off. The command panel's `toggle-vim-mode` command also switches it off from Vim Normal mode (§20.2.28).
* The status bar shows the mode indicator while Vim editing is enabled, but has no `VIM` button or editing-preference toggle.
* No keyboard shortcut switches it.
* Switching the preference keeps editor focus and applies the caret behavior in §20.2.3.
* The choice persists across application restarts as a user preference stored apart from the document; it is not a document edit, creates no undo entry, and does not trigger a document save.
* On first launch, and whenever no saved choice exists — including installations from before the toggle existed — Vim editing is disabled.

#### 20.2.2 Standard Editing While Vim Is Disabled

* While Vim editing is disabled, the editor is a standard text editor: it has no modes and no mode indicator, every key that inserts text inserts it, `Escape` does nothing, the caret is the normal thin text caret, and the application commands and editing behavior defined outside this section apply unchanged.
* The commands that exist only as Vim keys in this section — among them the local Vim register with `yy` and `p`, whole-node Visual mode, the Normal-mode image caret, `.` repeat, `Ctrl+d` and `Ctrl+u`, and the `z` fold keys — are unavailable; `Cmd+E` (§2.4), `Cmd+Enter` (§2.5), and `Cmd+Y` (§17.1) remain.

#### 20.2.3 Switching Vim Editing On and Off

* Disabling Vim editing completes a pending Replace-mode replacement as one undoable edit, discards an unfinished Normal-mode command, and clears a character-wise or whole-node Visual selection; a Visual selection or Normal-mode block caret collapses to its start while a text selection made in Insert mode is kept, and a Normal-mode caret on an attached image moves to the end of the node's text.
* Enabling Vim editing enters Normal mode with the block caret on the character at the caret, clamped to the final text character or the attached image; a deliberate multi-character selection is kept instead.
* The local Vim register, the last repeatable change, and the last character find belong to the running session and survive switching Vim editing off and on.
* The rest of this section describes the editor while Vim editing is enabled.

#### 20.2.4 Modes and Escape

* The editor starts in Normal mode, with a block caret on the current character.
* When the current node is empty, Normal mode displays a non-blinking block caret at its only insertion position. This applies to plain and decorated editors, including the current-parent heading, in both appearances and in the browser version.
* Pressing `i` or `a` enters Insert mode, where text entry and all existing application commands behave normally; Insert mode uses the normal thin text caret.
* Pressing `R` enters Replace mode, where printable input overwrites existing characters and appends after the end of the node.
* Pressing `Escape` enters Normal mode from Insert, Replace, or either Visual mode. If a completion popup is open in Insert, the first `Escape` only dismisses it and preserves Insert mode, focus, text and caret; another `Escape` with no popup enters Normal. This deliberate Vim divergence lets users dismiss suggestions without interrupting typing (§20.9, §20.12).
* On an image-only node, `i`, `a`, or `A` followed by `Escape` with no typed text leaves the Normal caret on the sole image character.
* Replace mode started on an active image commits the replacement text before the image; `Escape` then returns to Normal mode with the caret on the final replaced character and the image caret hidden.

#### 20.2.5 Pending Replace and Insert Sessions

* If the user invokes an application undo or redo shortcut, selects all text, cuts or pastes, toggles a strikethrough (§2.5), enters or leaves a node (including with a navigation control), or deletes the selected node while Replace mode has a pending replacement, finish that replacement as one edit before running the command, then return to Normal mode; a select-all, cut, paste, or strikethrough toggle commits it without disturbing the visible text or selection, so the command still acts on what the user selected.
* Quitting the application or closing the window while Replace mode has a pending replacement completes that replacement as one edit before the quit save, so the saved document includes it; a failed save leaves the replacement committed and the application open for a retry.
* The same interruptions during Insert mode leave Insert mode active, since Insert already behaves like other application commands run normally within it.
* After a pending Replace replacement is completed for a quit, the editor is in Normal mode.
* A cut with no selected text leaves a pending Replace replacement uncommitted and Replace mode active.
* When the input blurs to a target that is not a node, a pending Replace replacement is completed as one edit at its typed end, with no step back as `Escape` makes; if the text then ends at the attached image's position, the image caret is active once Normal mode shows.

#### 20.2.6 Pointer Presses and Application Commands

* Mouse clicks and pointer presses place focus or a text selection without changing the Vim mode, except that navigation through the location breadcrumb or a node's enter control, and an application command that changes focus or replaces the selection, end whole-node Visual mode for Normal mode and clear its selected range.
* An ordinary primary-button click on node text, in the same node or another, keeps Replace mode. Any pending replacement completes as one edit first; the caret then moves to the clicked position, and the next typed characters overwrite from there. Text typed after the click is a separate edit, so Undo reverts it on its own.
* A double-click keeps the selected word visible and Replace active until typing: the first typed character replaces the selected range once, then subsequent characters overwrite from the resulting caret. This applies to plain and rich text with or without a pending replacement.
* A click on a navigation control, a click outside node text or an Agenda row (§23.4), a right-click, and a drag that selects text keep their existing behavior.
* A select-all, cut, or paste drops an unfinished Normal-mode command and both character-wise Visual endpoints before it runs; character Visual mode stays active, while a cut or paste leaves whole-node Visual mode and its selected range unchanged.
* An application undo or redo, `Cmd+.`, `Cmd+,`, and `Cmd+Backspace` likewise drop an unfinished Normal-mode command; in character-wise Visual mode they, and a click on the location breadcrumb or a node's enter control, clear both endpoints and keep the mode, so the next motion anchors at the caret of the node reached.
* When `Cmd+A` ends whole-node Visual mode, the whole text of the node stays selected.

#### 20.2.8 Drops and Whole-Node Visual Mode

* Whole-node Visual mode ends and returns to Normal mode when a drop changes the selected node's parent, whether it lands between rows, onto a row, or onto a breadcrumb entry.
* Same-parent reordering does not end the mode.
* The Vim register and `.` repeat are unchanged by drag-and-drop.

#### 20.2.9 Motions and Undo

Normal mode supports:

* `gg` to focus the current parent when one exists, or the first displayed root node at the root level, and `G` to select the last visible row of the location (or the counted visible row).
* `gg`, `G`, `H`, `M`, `L`, `Ctrl+d`, and `Ctrl+u` place the caret on the destination's first non-whitespace text character. An attached image is the destination only when the node has no text; an empty node without an image uses its sole insertion position. These commands clear any saved image return position.
* `h` and `l` to move by character, continuing across visible Tree nodes (§4.3) or Agenda rows (§23.4) at either end. When the node has an image, it acts as a final character after the text, and an image-only node's sole character is its image. **Vim divergence:** crossing row boundaries keeps navigation continuous.
* **Vim divergence:** in Tree and Agenda Normal mode, `j` and `k` move down and up by visible text line, like Vim's `gj` and `gk`, so wrapped notes can be traversed without leaving the node. Counts consume visible text-line steps; an intervening image-bearing node retains its existing node-level step. At a text boundary they continue through the view's visible rows, including an expanded node's children in Tree; downward entry uses the first text line and upward entry the last.
* In Tree and Agenda Normal mode, `ArrowDown` and `ArrowUp` use the same vertical navigation as `j` and `k`, including counts, wrapped lines, desired horizontal position, images, and node boundaries.
* Consecutive vertical motions remember the desired horizontal position relative to the text column, temporarily clamping at the final character of a short line and restoring the position on a longer line. Another command, pointer placement, a new focus intent, changed text, or a changed window width starts a new desired position. Each motion uses the current wrapping, including after resizing and in windowed lists. Empty text has one position. This deliberately replaces logical-line `j`/`k` with display-line navigation so wrapped text is traversed one visible line at a time (§2).
* A node's attached image remains a separate vertical step after its final text line. `j` enters it after traversing the text; `k` returns to the saved text position. Upward entry from another node selects the image and saves a position on the final text line at the desired horizontal position.
* A downward motion starting on an image starts the next node at text position zero. An image reached during a count keeps that count's existing carried offset when it continues to another node. After crossing from an image to text, the actual destination position becomes the desired horizontal position for subsequent vertical steps. `k` on an image-only node moves to the previous visible node. Agenda uses the same Normal text-line and image rules (§23.4). Whole-node Visual and vertical operators retain their sibling-range rules; Tree character Visual follows §20.2.20.
* **Vim divergence:** `J` and `K` are fast vertical motions: they behave as `10j` and `10k` in Normal and Visual modes. A preceding count multiplies the distance (`2J` is `20j`). They preserve the corresponding motion's caret, image, range and boundary rules and never join nodes. Whole-node Visual extends its sibling range; Tree character Visual extends its text selection within the node. These aliases do not apply after operators or prefixes; `gJ` remains the join command. Awaited characters and Insert/Replace text remain literal. This deliberately replaces Vim's join/help bindings with faster navigation.
* When no previous visible row exists and there is no current parent, `k` on an image-only node leaves it selected with its image caret active.
* Only one caret is visible at a time: the text caret is hidden while the image caret is active.
* `l` or `j` from text into the image saves the text position it left; `h` from the image restores that position and applies any remaining count from there. When an oversized `l` count stops on the image at the outer boundary, `h` returns to the final text character.
* The saved text position is cleared when an in-node motion such as `0` or `$` moves to text, an edit lands on text, the caret moves to another node, or pointer input leaves the image, and the image caret is hidden unless the destination is itself an image; it belongs only to the node that saved it, and a destination image never reuses another node's saved position.
* An image-only node has no text position to save, so its horizontal motions, and a `k` clamped at the first root, save none. Horizontal motions can leave it for an adjacent visible Tree node (§4.3) or Agenda row (§23.4).
* At the last row, repeated `j` on an image or on a childless current parent with an image leaves the image caret active. Horizontal motions clamped at an outer boundary also preserve the image caret and any saved text return position.
* An undo, redo, or leave with nothing to do, and a whole-node Visual entry followed by an exit without movement, leave the image caret and its saved text position unchanged, so `k` still returns to the originating text character.
* After a successful undo or redo, the image caret is active exactly when the resulting caret position (§10) reaches the node's attached image.
* `H`, `M`, and `L` to select the top, middle, or bottom node currently visible in the viewport, without scrolling: a node clipped by the viewport edge, or lying within the edge context of §20.8, is skipped while any node lies wholly outside it, and the remaining nodes are used only when none does.
* `{count}H` selects the count-th visible node from the top and `{count}L` the count-th from the bottom, stopping at the last or first visible node when the count exceeds them; `M` ignores a count, as in Vim.
* `Ctrl+d` and `Ctrl+u` to move down or up by half the currently visible node rows.
* `u` to undo and `Ctrl+r` to redo the most recent undoable change.
* `w` and `b` to move between word starts, and `e` to move to a word end; letters, numbers, and underscores form words, while adjacent punctuation forms separate words.
* `W` and `B` to move between whitespace-delimited WORD starts, `E` to move to a WORD end, and `ge` to move backward to a word end.
* Word and WORD motions stop at the beginning and end of the current node and never cross to another node.
* `f{character}` and `F{character}` to find the next or previous occurrence of a character within the current node, and `t{character}` and `T{character}` to stop immediately before or after that occurrence; a failed search leaves the caret in place.
* `;` to repeat the most recently issued `f`, `F`, `t`, or `T` motion and `,` to repeat it in the opposite direction; repeated finds support counts and never wrap or cross a node.
* `0`, `^`, and `$` to move to the beginning, first non-whitespace character, and final text character; `$` stops at the end of the text row even when an image occupies a second row.

#### 20.2.10 Insert, Node Creation and Character Edits

Normal mode also supports:

* `i` to enter Insert mode at the current character, `a` to enter Insert mode after it, `I` to enter Insert mode at the first non-whitespace character, and `A` to enter Insert mode at the end of the current node.
* `o` to create an empty first child of the current parent when its heading is selected, an empty first child of the selected node when that node is expanded and has at least one child, or otherwise an empty sibling after the selected node's entire subtree, and enter Insert mode. The displayed location and existing folds stay unchanged. This follows the visible outline: an expanded branch receives a child, while a collapsed branch stays together as a sibling is added; `O` creates an empty sibling above the selected node, but does nothing when the editable current-parent heading is selected.
* On an empty inline leaf, `o` uses the same rule and current-parent boundary as `Enter` (§5.1). A following sibling keeps creation at the same level, immediately after the empty leaf, preserving it and selecting the new empty node at text position zero in Insert mode. A last empty sibling is instead moved one level left, directly after its parent, without creating a node; it stays selected at text position zero in Insert mode, and repeating moves it until the current location boundary, where `o` creates a sibling at the same level.
* `x` to delete the current character, `X` to delete the character before it, `r{character}` to replace it without entering Insert mode, and `s` to delete it and enter Insert mode; when deleting the final text character before an attached image, the Normal caret lands on the image, including when that was the node's only text character.
* `Ctrl+A` and `Ctrl+X` add or subtract the preceding count (one by default) from the number under the cursor, or the next number to its right within the same node. They use Vim's `defaults.vim` number formats: signed decimal, unsigned `0x` hexadecimal and `0b` binary; leading zeros retain their width where possible and do not imply octal. Arithmetic uses Vim's 64-bit range.
* After a number change, the caret lands on the final digit, Normal remains active, and the register is unchanged. Each successful edit is one Undo step and is repeatable with `.`; a count before `.` replaces the saved counter count for subsequent repeats. Hexadecimal letter case follows the rightmost letter, including the `x` or `X` prefix. With no matching number, including on an attached image, nothing changes. A pending operator, prefix or awaited character is discarded without editing. These commands apply to Tree and editable Agenda matches; read-only Agenda rows remain unchanged.

#### 20.2.11 Operators

Normal mode also supports:

* `d`, `y`, and `c` followed by an in-node motion (`h`, `l`, `w`, `W`, `b`, `B`, `e`, `E`, `ge`, `0`, `^`, `$`, `f`, `F`, `t`, `T`, `;`, or `,`) to delete, copy, or change the covered text; `dw`, `d$`, `cw`, `c$`, and `yw` are supported examples; `c` enters Insert mode after changing text.
* `d`, `y`, and `c` followed by `j` or `k` to operate on whole subtrees: `dj` covers the current node and the next sibling, `d2j` the current node and the following two, and `dk` the previous sibling and the current node, each including every descendant.
* The operator and motion counts multiply and clamp at the first and last sibling, so at a boundary the range is the current node alone; expanded descendant rows never count as separate members, and the range never includes the editable current-parent heading, on which these commands do nothing. `y` copies the ordered forest into the local Vim register, `d` copies and removes it as one undoable command, and `c` copies it, replaces the whole range with one fresh empty node at its first position as one undoable command, and enters Insert mode in that node. A command that cannot complete changes neither the document nor the register.
* `ys` followed by an in-node motion or text object and a delimiter to surround the covered text, `yss` and a delimiter to surround the whole node's text from its first non-whitespace character, `ds` and a delimiter to remove the nearest enclosing pair, and `cs` followed by a target and a replacement delimiter to change that pair.
* `D` as `d$` and `C` as `c$`, operating from the caret through the end of the current node's text, and `Y` as `y$`, copying that text into the local Vim register without changing the document or the saved change for `.`.
* `gu`, `gU`, and `g~` followed by an in-node motion or text object to lowercase, uppercase, or toggle the case of the covered text, and `guu`, `gUU`, and `g~~` for the whole text of the current node.
* Counts follow the underlying motion and multiply when given on both sides (`2gU3w`), while a count does not extend the whole-node forms; the caret moves to the start of the covered range, and a range that matches nothing, or whose case does not change, changes nothing.
* A hyperlink's text is its address, so these commands, like Visual `u`, `U`, and `~`, change the case of the text around a hyperlink and leave the hyperlink's own text and link intact; children and attachments are preserved.
* `gu` takes the `u` key after the `g` prefix as its continuation instead of discarding the prefix.
* A case operator followed by `j` or `k` changes nothing.
* `cc` and `S` to clear the current node's text and enter Insert mode without deleting its subtree or metadata.
* `~` to toggle the case of the current character and advance, with a count toggling additional characters without crossing the node boundary; it advances onto an attached image when the changed text ends immediately before the image.

#### 20.2.12 Node Commands

Normal mode also supports:

* `yy` to copy the selected node and its entire subtree into the local Vim register.
* `dd` to delete the selected node and its subtree using the normal node-deletion behavior.
* `gd` to enter the selected node, with the same behavior as `Cmd+.`.
* `Enter` to open the image preview when the caret is on the node's image, or open the hyperlink at a text caret in the system's default hyperlink application, with the same behavior as `Cmd+click`; it does nothing when neither applies.
* `Ctrl+o` to go back one parent level, with the same behavior as `Cmd+,`.
* `v` to enter character-wise Visual mode.
* `V` to enter whole-node Visual mode when a displayed sibling is selected; the editable current-parent heading cannot be selected with `V`.

#### 20.2.13 Put Commands

Normal mode also supports:

* `p` and `P` to put the most recent local Vim register after or before the current node.
* A node or sibling-forest put with `p` follows the same visible-outline rule as `o`: on an expanded selected node with children, it puts the content as the first children; on a collapsed node or a leaf, it puts after the node's entire subtree as siblings. The displayed location and existing folds stay unchanged, and the first inserted node is selected. `P` puts siblings before the selected node, like `O`.
* On the current-parent heading, `p` puts first children even when it has no children; `P` does nothing because a sibling of the heading would lie outside the displayed location. Putting a node into its own children is rejected with the descendant error below, because the target lies inside the source. A text put is unchanged by this rule.
* A plain-text put from an image caret inserts the text before that image and leaves the Normal caret on the final inserted text character, with the image caret hidden.
* `gp` and `gP` put like `p` and `P`, with the same counts and rejections, but leave the caret immediately after the inserted content. For text, the Normal caret is on the character after the inserted text, clamped to the final text character, or to the attached image when the inserted text ends immediately before it. For a node put, the node that follows the inserted forest is selected, or the last inserted node when none follows; after a put into the children of a node, that is the node's former first child.
* In Visual modes `gp` and `gP` are not commands.
* `gp` and `gP` with an empty register change nothing.

#### 20.2.14 Join Commands

Normal mode also supports:

* `gJ` to join the current node with the next sibling; a count joins that many siblings (at least two), clamped at the last sibling, and a node with no following sibling, or the editable current-parent heading, makes no change.
* `gJ` concatenates the texts unchanged, without trimming or inserting spaces.
* The first node keeps its ID, hyperlink ranges move with their text, and the children of every joined node follow in sibling order with their IDs intact; children keep their depth, so a join never exceeds the maximum depth (§2.3).
* If only one participating node has an attachment, the result keeps it; if two or more have attachments, even the same one, the whole join is rejected with the operation error `Cannot join nodes that both have attachments` and changes nothing.
* A join is one undoable command, leaves the local Vim register unchanged, and puts the Normal caret at the first character of the appended text, clamped to the final text character or the attached image.
* Whole-node Visual `gJ` joins the selected range the same way and returns to Normal mode; a range that cannot join keeps whole-node Visual mode and its selection. Character-wise Visual `gJ` is not a command.

#### 20.2.15 Fold Commands

Normal mode also supports:

* `zc`, `zo`, and `za` to close, open, or toggle the selected node's own fold, and `zC` and `zO` to close or open that fold together with every fold inside it. A fold is one node's direct children, shown or hidden exactly as its disclosure chevron shows them. These five commands do nothing on a node without children and do nothing on the editable current-parent heading, whose children are the displayed location itself.
* `zM` closes every fold in the current location, and `zR` opens every fold in the current location recursively.
* Fold commands never move the caret, except that `zM` selects the displayed ancestor of the caret with its caret at the beginning when closing the folds would hide the caret (§2.4).
* Counts do not apply to fold commands.

#### 20.2.16 Counts and Operator Scope

* Numeric prefixes repeat in-node motions and text edits, including operator motions (`3w`, `2dw`, `3x`, and `2r{character}`). `3j` and `5k` repeat the display-line and image steps defined in §20.2.9 and §23.4 for Tree and Agenda, clamping at the view boundaries. Counts also apply to node commands: `10G` selects the tenth visible row of the location, clamped to the last visible row; `3dd` deletes the current node and the next two displayed sibling subtrees, clamped at the last sibling, as one undoable command, and `2yy` copies the current node and the next sibling subtree into the local register as an ordered forest.
* `dd` and `yy` cover every descendant, whether or not it is expanded.
* A `dd` that changes nothing (for example on the current-parent heading) leaves the register unchanged.
* A count on `p` or `P` repeats the most recent subtree register that many times, assigning fresh IDs to every copy, and inserts all copies as one undoable command; a put rejected by the depth limit (§2.3) or by ancestry inserts no copy.
* Plain-text `p` and `P` repeat the register value by the requested count in one edit.
* `0` remains the beginning-of-text motion when no count is pending.
* Counts do not extend commands across nodes for in-node text edits, and do not apply to whole-node commands (other than `gJ` in Normal mode, and `>`, `<`, `p`, `P`, `j`, `k`, `J`, and `K` in Visual mode), sibling creation, or the fold commands.
* `u`, `Ctrl+r`, `Ctrl+o`, `Ctrl+d`, and `Ctrl+u` do not accept a count. Each of them discards a command that is still being assembled — a pending count, operator, prefix, or a command awaiting a character or delimiter — and makes no change; a command awaiting a character or delimiter takes `u` as that character instead, and the `g` prefix takes it as the `gu` operator.
* Word-motion deletion and yanking stop at the next word start, while `cw` changes through the current word end when the caret is on non-whitespace; `$` ranges include the final character.
* Text operators affect only the current node's text, preserving the node, children, hyperlinks outside the edited range, and attachment.
* `dd` and `yy` remain whole-subtree commands, with counted forms operating on a forward sibling range.

#### 20.2.17 Text Objects

* Text objects may follow `d`, `y`, or `c`, and may be selected in character-wise Visual mode.
* `iw`, `aw`, `iW`, and `aW` select a word or whitespace-delimited WORD, with `a` including adjacent whitespace where available.
* Counts follow Vim: `iw` and `iW` count each word/WORD run and each intervening whitespace run. `aw` and `aW` count only words/WORDs. Starting an around object in whitespace includes that leading run and the requested following words without adding trailing whitespace. Otherwise, around objects prefer trailing whitespace and include preceding whitespace when none follows. If the requested count is unavailable within the node, the command makes no change.
* Inner and around quote objects use `"`, `'`, or backtick; bracket objects use either delimiter of `()`, `[]`, `{}`, or `<>`.
* Inner objects exclude delimiters; around objects include them.
* Bracket objects choose the nearest enclosing matched pair and counts choose successively outer pairs.
* Unmatched objects make no change.
* Text objects stay within the current node.

#### 20.2.18 Surround Delimiters

* Surround delimiters are `(`, `[`, `{`, `<`, their closing counterparts, `"`, `'`, and backtick, with `b`, `r`, `B`, and `a` accepted as aliases for `)`, `]`, `}`, and `>`.
* An opening bracket adds one space inside the pair, while its closing counterpart adds none; removing or changing a pair named by an opening bracket also strips one such space from each side when present.
* `ds` and `cs` accept either delimiter of a pair, act on the nearest enclosing pair, and a count selects successively outer pairs.
* An unmatched pair or an unsupported delimiter makes no change.
* The caret moves to the start of the affected range, and each surround command is one undoable change that preserves hyperlinks inside and outside the affected text.
* In character-wise Visual mode, `S` followed by a delimiter surrounds the selection and returns to Normal mode; a surround that makes no change leaves the selection intact and remains in Visual mode.
* Surround commands stay within the current node.

#### 20.2.19 Dot Repeat

* `.` repeats the last completed Vim change at the current caret or node, including text changes, surround commands, counted `dd`, subtree puts, shifts, joins, case commands, `o` and `O` with text typed before Escape, and whole-node Visual mutations.
* A completed Insert, change, or substitute session that ended with Escape is recorded as a text change and repeats at the current caret in any node, including a different one.
* An Insert session that was interrupted by `Enter` or a split, breadcrumb or enter-control navigation, pointer focus, an application shortcut, a Vim toggle, undo or redo, or a shutdown flush is not recorded, and the previous repeatable change is kept.
* This interruption rule also applies to structural Insert sessions started by `o`, `O`, or whole-node Visual `c` or `s`. The focus transfer that creates their new node does not interrupt the new session. A text pointer press, including one within the same node, interrupts recording.
* Select-all, cut, and paste interrupt Insert recording through keyboard shortcuts, the editor context menu, and native paste events. Insert mode stays active and the command edits or selects the current text normally. Copy and a cut with no selected text do not interrupt recording.
* A repeated deletion-only Insert edit leaves the Normal caret one position left of its insertion point, clamped at the beginning, as the original Escape does.
* Repeated `o` opens a first child of the current node when the original `o` opened from a parent heading, or, when the original `o` opened from a selected node, applies the `o` rule above to the current node (a first child when expanded with children, otherwise a sibling after its subtree); repeated `O` opens a sibling above the current node.
* A count before `.` repeats the completed change that many times, stopping at the first failed repetition and keeping those that already completed.
* Each structural repetition is a separate undoable command and subtree puts assign fresh IDs on every repetition.
* A repeated whole-node mutation applies to the original number of siblings starting at the current node; if that many siblings are unavailable, it makes no change.
* A repeated `p` applies the put rule above to the current node, so it goes into the first children of an expanded branch or the current-parent heading, and after a collapsed branch or a leaf.
* A repeated put uses the originally incoming value and copy count even if a Visual `p` has since exchanged the register; `gp` and `gP` retain their post-put destination.
* Motions, yanks, and failed changes do not replace the saved change.
* Every individual command and repetition is atomic: when it cannot complete in full, it changes neither the document, the register, the history, the focus, nor the saved change for `.`.

#### 20.2.20 Character Visual Mode

* Visual mode selects characters only within the current node and uses the same yellow highlight as whole-node Visual mode. A deliberate multi-character selection in Normal mode — a pointer drag or `Cmd+A` — uses that highlight too, while the one-character Normal-mode block caret keeps its own block styling.
* The Normal-mode character and word motions extend the selection.
* Temporarily leaving and returning to the application window, opening and closing an image preview (§17.1), or canceling the quit-without-saving confirmation (§16.2) retains the active Visual endpoints when the selected node is unchanged. The next motion extends the existing selection; editing commands use that selection when editing is available. Insert and Replace sessions keep their ordinary blur completion rules (§20.2.5).
* In Tree, `j` and `k` move the active endpoint down or up by visible text line, preserving the anchor and desired horizontal position. Counts and `J`/`K` use the same steps. They clamp at the first or last text line without selecting another node or an attached image; empty and single-line text remain unchanged. The active endpoint stays visible. Other commands, pointer placement, focus changes, changed text or window width reset the desired position. This deliberate Vim divergence matches Tree's display-line Normal navigation; Agenda retains its existing character Visual rules.
* `o` exchanges the active and anchored ends. `v` and `Esc` return to Normal mode with the caret at the active endpoint, in either selection direction and after exchanging ends. When an image selection's active endpoint is on text, exiting leaves the image caret hidden and clears the saved image return position.
* `y` copies the selection into an application-local plain-text register; `d` and `x` copy and delete it; and `c` and `s` copy and delete it before entering Insert mode.
* When Visual deletion removes the final text character before an attached image, the Normal caret lands on the image.
* Visual `u`, `U`, and `~` lowercase, uppercase, or toggle the case of the selection and return to Normal mode with the caret at the start of the operated range.
* Visual `S` surrounds the selection as described above.
* Visual `p` replaces the selection with a non-empty plain-text register and then stores the removed selection as the new register; Visual `P` performs the same replacement and keeps the incoming register. A count repeats the incoming text before the replacement, in one edit. A successful put returns to Normal mode with the caret on the final inserted character.
* A Visual put with an empty or structured subtree register, or one the application cannot apply, does nothing, leaves the register unchanged, and remains in Visual mode.

#### 20.2.21 Registers and Puts in Normal Mode

* In Normal mode, `yy` copies the selected node and its entire subtree, while `dd` copies it before deleting it.
* If the most recent register action was Visual-mode text yank/delete or a character deletion, `p` and `P` insert that text after or before the current character.
* If the most recent register action was `yy` or `dd`, `p` and `P` insert a copy of the stored subtree as a sibling after or before the current node, except that `p` on an expanded node with children or on the editable current-parent heading puts it as that node's first children, as the `p` and `P` rule above defines; `P` on the heading does nothing.
* Subtree puts preserve text, hyperlinks, and attachments and assign fresh node IDs to every pasted node.
* Yank, delete, change, case, and successful plain-text put commands return to Normal mode.

#### 20.2.22 System Clipboard

* Vim yanks and Normal-mode `dd` also copy content to the system clipboard for external applications under the rules below.
* Normal `dd` excludes descendants from the system clipboard even when the local register includes the node's subtree.
* The local register and `p` / `P` retain the behavior described above.
* In character-wise Visual mode, `y` copies only the selected text within the current node to the system clipboard.
* In Normal mode, `yy` on text copies the current node and all descendant text, including collapsed descendants, using the same preorder and four-space indentation as whole-node Visual `y` below. Counted `yy` copies the actual selected sibling forest, clamped at the last sibling. A single empty text leaf leaves the clipboard unchanged. Uncounted `yy` also copies the current-parent heading and its subtree without entering Visual mode.
* On an image caret, `yy` retains image-only copying: one actual selected root copies its attached image; a counted yank covering multiple roots leaves the system clipboard unchanged. Text and image are copied separately, never together. The local register still contains complete subtrees.
* Normal-mode `dd` copies only the removed node's own text or attached image according to the caret position before deletion. A deletion that changes nothing or removes multiple sibling nodes leaves the system clipboard unchanged. Clipboard failure reports an operation error without undoing the deletion or changing the local register; undo and local puts retain their existing behavior.
* In whole-node Visual mode (`V`), when exactly one leaf is selected, `y` copies its entire text when non-empty, including when it also has an image; otherwise it copies the attached image when present.
* For any larger whole-node Visual selection, `y` copies all selected subtree text, including collapsed descendants, in preorder. Lines are joined by newline characters with four spaces per nesting level relative to each selected root. Empty and image-only nodes contribute empty text entries with their nesting indentation; entries at the beginning and end are retained. Images are not included in this text export. The local structured register retains them.
* Text copied by these Vim commands is plain text: hyperlink characters are included exactly as selected or stored in the node, without hyperlink formatting or a separate clickable representation.
* An operation on a single leaf with neither text nor an image, or an empty character-wise text selection, leaves the system clipboard unchanged; copying nothing never clears it. Normal `dd` also leaves it unchanged when the current node has neither text nor an image.
* Empty entries within a multi-node whole-node Visual yank follow the newline rule above.

#### 20.2.23 Whole-Node Visual Mode and Shifts

* Whole-node Visual mode (`V`) selects a contiguous range of siblings at the currently displayed level — not the location's visible rows (§2.4) — including every selected node's descendants.
* Highlight every visible descendant of the selected siblings, including the final selected branch. Selection does not expand collapsed branches.
* `j`, `k`, `gg`, and `G` extend the range, and `j` and `k` accept a count that moves the active end that many siblings, clamped at the first and last sibling, without changing the selection's direction; `J` and `K` move ten times that count as specified in §20.2.9; `o` exchanges its ends.
* A motion clamped at the active end keeps the range, caret position, and any active image caret with its saved text return position.
* The current-parent heading is excluded.
* `y` copies the selected subtrees into the local register; `d` and `x` copy and delete them; `c` and `s` copy and replace them with one empty node before entering Insert mode; `u` and `U` change the case of text in the selected subtrees.
* `p` replaces the selected subtrees with fresh-ID copies of the node register and then stores the removed subtrees as the new register; `P` performs the same replacement and keeps the incoming register. A count repeats the whole incoming register that many times, with fresh IDs for every copy, in the same replacement. A put rejected by the depth limit (§2.3) or by ancestry changes neither the document nor the register.
* These structural mutations are each one undoable command.
* `>` moves the selected siblings, in order and with all descendants, to the end of the children of the unselected sibling immediately before the range; `<` moves them out of their parent to directly after that parent.
* Unselected children stay under the original parent.
* In character-wise Visual mode, the same keys move the current node with its whole subtree.
* Both keys keep the mode, the selection's endpoints and direction, and the selected character offsets, and leave the local Vim register unchanged. They open the collapsed fold that receives a moved range, so the selection stays visible, and change the displayed location only when `<` moves the selection out of it, in which case the location becomes the selection's new parent.
* A count before `>` or `<` requests that many successive one-level moves as one undoable command and makes no change unless every level is possible. These cases make no change and show no error: `>` with no preceding unselected sibling, `<` on a root node, and any selection that includes the current-parent heading. A move that would place any moved node below level 20 (§2.3) shows the maximum-depth operation error and changes nothing.
* Normal-mode `>>` and `<<` are not supported.
* In Normal mode a multi-node register can be put before or after the current node.
* A node put whose target is a descendant of any source node reports an operation error and leaves the document unchanged.
* Empty or plain-text registers cannot be put in whole-node Visual mode.
* A whole-node Visual put that is rejected, or blocked while persistence is locked, changes neither the mode nor the selection.
* Leaving whole-node Visual mode with `Escape`, or by a mutation command that ends it, clears an unfinished `g` prefix, so a later Normal-mode `d` starts a delete instead of running `gd`.
* `V` also leaves whole-node Visual mode for Normal mode, clearing an unfinished `g` prefix the same way.

#### 20.2.24 Tab and Shift+Tab

* When a node editor has keyboard focus, plain Tab moves the focused node and its whole subtree in one level, and Shift+Tab moves it out one level. While completion suggestions are open, plain Tab instead accepts the selected suggestion (§20.9, §20.12); Escape then Tab permits the ordinary structural action. In whole-node Visual mode, these keys move the selected sibling range; in every other Vim mode and in standard editing, they move only the focused node.
* The move keeps the editing mode, focus, caret, and text selection. In Normal mode it discards an unfinished command. In Replace mode it commits any buffered replacement as one undoable edit, performs the move as a separate command, and continues in Replace mode with a new replacement session at the same caret. In Insert mode the move ends the current text undo session and keeps Insert mode active.
* Whole-node Visual mode keeps its range through the move, and an active image caret keeps its saved text position.
* Each Tab press requests one level and uses the same maximum-depth behavior as `>` and `<`.
* When the current parent is a zoomed node, Shift+Tab does not move a direct child of that node, or a selected range of its direct children, outside the current location; it is a no-op that preserves the pending edit session and editor state. A deeper descendant may move out one level when it remains inside the current parent's subtree. This location boundary applies to Tab shortcuts only; Vim `<` retains its separately specified behavior.
* Outside a node editor, Tab and Shift+Tab retain native focus traversal, including navigation to the status-bar controls. This node-focused Tab behavior is a deliberate exception to macOS focus traversal, in service of the keyboard-first editing model (§1.1).

#### 20.2.25 Restoring a Selection with gv

* Normal `gv` restores the most recent character-wise or whole-node Visual selection with its direction. After a Visual put it selects the incoming content, and after a shift it selects the moved range.
* The selection is remembered by node identity, only for the latest selection and only within the running renderer session.
* Any change that deletes or replaces a node of the remembered range, or removes a remembered character offset from the node's text, invalidates it; `gv` then does nothing and shows no error. A character offset is removed when the text becomes shorter than the offset, or becomes empty after it held text. A whole-node range whose nodes are no longer one contiguous sibling range in their original order, including because other nodes were inserted between its ends or the nodes were reordered, is invalid.
* When the restored range is hidden by a collapsed fold or is not displayed at the current location, `gv` does nothing.
* `gv` does nothing in a Visual mode.

#### 20.2.27 Unsupported Keys, Composition and Selection Offsets

* Unsupported unmodified keys do not edit text in Normal or Visual mode.
* Application shortcuts using modifier keys retain their existing behavior.
* Vim handling is suspended during native text composition.
* Reading a text selection's offsets preserves its endpoints and direction, including backward selections in rich text editors.
