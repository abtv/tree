# Agenda

## 23. Agenda

### 23.1 Opening and Closing

* `Cmd+P` opens Agenda for the entire document, including all roots, folded descendants, the current parent and its ancestors, regardless of Tree location or selection. Today is captured from the local calendar when Agenda opens; its Monday–Sunday week is displayed and its day container is initially selected. Closing and reopening always returns to the current week and Today.
* Opening makes a best effort to center the complete Today block, including its heading and entries, within the content viewport. A block taller than the viewport starts at its heading with the ordinary context margin. Natural scroll limits apply; no blank padding is added just to center it. Alignment follows measured layout changes until explicit user scrolling or a subsequent command takes over.
* `Cmd+P` closes Agenda and restores the originating Tree location, selection, and text cursor, subject to finished-task visibility (§2.5). It reveals the selected row. A pending Insert or Replace edit finishes before opening or closing. Replace returns to Normal, and whole-node Visual ends.

Holding `Cmd+P` repeatedly switches views at a pace that allows consistent rendering. The first press and separate presses respond immediately. Excess autorepeat events may merge into one pending switch; they must not create a growing queue. Repeated switches leave a rendering opportunity between view replacements. Releasing the shortcut, losing window focus, or starting another interaction cancels an unperformed repeat. On an unchanged document, repeated opening must reuse derived work where possible (§22.2). Each opening still captures the current origin and Today and starts with the normal initial Agenda presentation.

This deliberately assigns Apple's standard Print shortcut to Agenda: Tree has no printing capability and Agenda is a frequent keyboard command. The binding is application-scoped and adds no global shortcut. View > Agenda opens Agenda through the same named command as the command panel; View > Tree returns to Tree (§9.3).

The location toolbar displays a calendar glyph, with no visible `Agenda` text or outline-root control. The glyph is a noninteractive location indicator. Agenda selection and scrolling do not change the persisted Tree view or create files; restarting opens Tree. Agenda uses the same document, without copying nodes.

### 23.2 Projection and Dates in Text

* Only valid canonical `YYYY-MM-DD` dates are recognized, with no touching digit at either end.
* Impossible dates, incomplete tokens, and dates inside hyperlinks are ordinary text.
* A node appears under every distinct date it contains. Only direct matches are node rows, ordered by Tree preorder within each day.
* A marked node (§2.7) is also a direct match of Today, the day captured when Agenda opened. It appears there once, including when its text contains Today's date, in Tree preorder among that day's other matches. It keeps its occurrences under its own dates, including in Overdue. The mark adds no occurrence to any other day.
* Consecutive direct matches with the same parent share one ancestor-path heading, using Search's compact ancestor labels (§20.14.2). A different parent starts a new group; a path that recurs after another group appears again. Grouping preserves node order within each day and Overdue. Top-level nodes have no path heading. Ancestors are not editable node rows.
* Path headings use 12px secondary text, wrap when needed and align with node text. A new parent group starts with its heading on the next row. Each path is a selectable, read-only Agenda row; keyboard navigation and clicks can stop on it, and text selection and copying work as on day headings. Editing, folding and opening an Agenda path do nothing. Global Search path headings follow §20.14.
* Full text is shown and wraps as in Tree.
* Every recognized date uses regular font weight and a quieter variant of the temporal color of §20.11, independent of the displayed day. Dates are slightly smaller than node text. Date colors yield to struck-through text color (§2.5). Direct matches retain Tree text colors, including depth colors in dark appearance.
* An outer bullet ring reflects real children. Node rows have no disclosure chevron.

### 23.3 Timeline

Show one Monday–Sunday week at a time, with all seven dated day headings in chronological order, including empty days. Empty days do not fold. No separate week-range label or return-to-Today command is shown. At the canonical calendar boundaries, omit dates outside years 0000–9999. A temporary last-date pin retains its occurrence until the item leaves Agenda (§23.7).

* In the current week's timeline only, an `Overdue` group precedes Monday when the document contains non-struck-through nodes with recognized dates before that week's Monday. It includes nodes from the entire document, including folded branches.
* Each qualifying node appears once, ordered by its earliest overdue date and then document order; an active occurrence retains its date while editing (§23.7).
* Completing an Overdue item with `Cmd+Enter` selects the remaining item at the same list position, or the preceding item at the end, retaining the text offset where possible. If no Overdue items remain, ordinary nearest-day selection applies. This rule does not affect the selection after completing any other item.
* The group uses the ordinary heading, flat rows and folding appearance; its fold is independent of dated days. It is hidden when empty and is not a dated day that can be opened separately.
* Past and future weeks and focused-day views do not show it. Dates within the current week remain in their ordinary day groups.

* Day headings use the same 15px text size as nodes, with regular weight and ordinary case. The `Overdue` heading uses a heavier weight. Today uses the normal heading color with a small neutral `Today` badge and an accessible current-date indication. The badge is vertically centered on the heading's text line rather than the full row.
* A thin neutral separator spans the scrolling content from its leading to trailing edge between groups (Overdue and dated days), with none before the first group. Each separator occupies one 25px row.
* Headings and node rows use Tree's 25px minimum height and 20px text line height, without extra gaps after day headings or between nodes within a path group. Agenda starts with the same 10px top inset as Tree inside a parent. Day headings and node text share one left alignment axis; disclosure and bullet markers occupy the gutter.

Headers scroll with the content; none is sticky. Transitions between Agenda and Tree have no animation or contrasting background flash. Labels append the year only when it differs from Today's year.

### 23.4 Navigation

#### Moving Between Rows

* `Cmd+Shift+[` and `Cmd+Shift+]` move exactly one calendar week backward or forward, matching browser tab navigation. `Cmd+[` and `Cmd+]` also work. Shifted bracket key events are accepted whether their reported character is a square bracket or a brace. Empty weeks are included. Select the same weekday's heading with its caret at the beginning, using the selected occurrence or separator's day when applicable. Finish pending editing as for other navigation; leave any temporary pin. In focused-day presentation, retain that presentation and shift its day by seven days. Returning to the timeline restores its captured week. A transition beyond the canonical calendar range does nothing.
* As an exception to same-weekday selection, week navigation from the Overdue heading or any node in that group selects the adjacent week's Monday heading, regardless of the node's original weekday.
* Up and Down move over visible Agenda rows, including one stop on each day separator, and clamp at either edge. Separators remain between folded days and expose an empty, read-only caret position without a node dot or line number. This deliberately makes a visual separator selectable so movement follows the same row rhythm as Tree. Separators can also be selected by a row click; editing, folding and opening them do nothing.
* In Vim Normal, `j`/`k` and Up/Down first move through the current row's visible text lines, then cross to another Agenda row, using Tree's desired horizontal position, image and caret-line reveal rules (§20.2.9). Counts and `J`/`K` consume these same steps, including when the selected occurrence does not change. Day labels, inactive occurrences and the focused-day heading use their own displayed text and wrapping. `gg`/`G`, `H`/`M`/`L`, and `Ctrl+d`/`Ctrl+u` retain their row-based boundary and viewport rules.
* In Vim Normal, `h` and `l` continue through all visible rows, including direct matches, day containers and the focused-day heading. `l` crosses from the final character to the next row's first character; `h` crosses from the first character to the previous row's final character. Counts include character and crossing steps as in Tree (§4.3), and stop at the outer boundaries.
* A direct match's image is its final character; day rows expose text only. Occurrences of the same node on different days remain distinct destinations. Visual and operator motions stay within the current row. This deliberate Vim divergence makes horizontal navigation continuous in both views.
* Normal vertical movement preserves the desired horizontal position across consecutive text lines and row boundaries, temporarily clamping on short lines as in Tree. Other commands, pointer placement, changed text, focus outside that vertical navigation, and a changed window width reset it. Standard and Insert row movement retain their existing clamped text-offset behavior.
* Normal `j`/`k` treat a direct match's attached image as Tree does: moving down after the final text line enters the image and records the text caret, moving up from that image restores it, and arriving from below activates the image with a return position on the final text line at the desired horizontal position. A count takes the same steps as repeating the motion, including each passed image, as in Tree (§20.2.9).
* `gg`/`G`, `H`/`M`/`L`, and `Ctrl+d`/`Ctrl+u` land on the destination's first non-whitespace text character, using a direct match's image only when it has no text, as in §20.2.9.
* A vertical motion that clamps at the current row preserves its caret and image return position.
* Clicking a row selects and focuses it with the same focus dot, except on separators.
* An ordinary primary-button row click keeps Replace mode and completes any pending replacement as one edit before changing rows. A row without an editor retains Replace without accepting text edits; clicking an editable occurrence then resumes overwrite at its focused caret. Text typed after changing rows is a separate edit for Undo. This includes day containers, inactive occurrences and the focused-day heading; it does not extend Replace to navigation controls or other focus losses.
* `Escape` clears unfinished commands and returns Vim to Normal without closing Agenda, except when it dismisses an open completion popup in Insert (§20.2.4).
* Day containers accept no text input; Vim `i`/`a`/`R` on them never enter Insert or Replace.
* The caret never disappears while selection moves.
* A selected row without an editor (a day container, a parent path, a separator, an occurrence that is not the active one, or the focused-day heading) has a caret over its displayed text, drawn as in Tree: a block in Vim Normal, a thin line in Vim Insert/Replace and standard editing, and the shared selection highlight for a selection. Whole-node Visual selection is unavailable in Agenda.
* Explicit pointer selection of a different row without an editor places its caret at offset zero; keyboard navigation carries its offset as above.
* An empty text shows the caret at its end.

#### Moving the Caret on Rows Without an Editor

* The caret moves over that text without changing it.
* In Vim Normal and Visual, `0`, `^`, `$`, `w`, `W`, `b`, `B`, `e`, `E`, `ge`, `f`, `F`, `t`, `T`, `;` and `,` work with counts and stop at the first and last character; they never cross to another row. Visual `h` and `l` also stay within the row; Normal `h` and `l` follow the row-crossing rules above.
* `v` starts a character Visual selection (both end characters are selected), `o` exchanges its ends, `v` or `Esc` leaves it with the caret at the active endpoint, and `y` copies the selected text to the system clipboard and the Vim register.
* In standard editing and Vim Insert, `Left`, `Right`, `Home`, `End`, `Option+Left`, `Option+Right`, `Cmd+Left`, `Cmd+Right` and `Shift` with any of them move or extend a selection, clamped at both ends, and an arrow with a selection collapses it to the matching end.
* `Cmd+C` copies the selection, or in Vim Normal the character under the block; `Cmd+A` selects the whole text, entering Visual in Vim.
* `Left`, `Right`, `Home` and `End` do nothing in Vim Normal and Visual. Up and Down retain the row-navigation behavior above.
* Day text is copied as displayed, in its original case.
* A pointer click on another row selects it with the caret at offset zero, and a click on the row that is already selected leaves its caret where it is.
* Every command that would insert, change, delete, put, join, indent, surround or repeat text does nothing on these rows and keeps document, caret and mode unchanged.

#### Opening Tree from Agenda

`Cmd+.` or Vim Normal `gd` on a direct match closes Agenda and opens Tree with that exact node as current parent, regardless of the Tree location from which Agenda was opened. This includes a match in another branch, an ancestor, or the original current parent. Focus follows Tree entry (§6.1): select the first child at text offset zero, or focus the editable parent when it has no children. The same rule applies in the timeline and a focused day, including inactive and temporarily pinned occurrences. `Cmd+P` there reopens the entire document's Agenda at Today. Closing Agenda with `Cmd+P` still restores its captured Tree origin (§23.1).

### 23.5 Folding Days

Clicking a disclosure chevron, `Cmd+E`, or Vim Normal `za` toggles a populated day. Folding hides all its entries; a folded day stays non-empty. Empty Today does not fold. Node and separator rows never fold. If collapsing a day hides the selected entry, the day becomes selected and focused; an unrelated fold retains selection and focus. Mode and document content are unchanged.

Vim `zc`/`zo`, `za`, and `zC`/`zO` close, open or toggle only the selected populated day; recursive forms have the same effect because entries are flat. `zM`/`zR` close or open all populated days from any row.

Explicit timeline fold choices are remembered by calendar day when leaving and reopening Agenda, including after an application restart. They are independent of Tree expansion, document content and Undo history. They use the pending-save policy of §16.1. Missing saved choices default to open. A choice remains remembered when its day temporarily has no entries. The Overdue container remembers its choice for the displayed current week; a new current week starts open unless that week's choice was already saved. Startup still opens Tree, and opening Agenda still selects Today under §23.1.

Search and live editing may temporarily reveal a remembered folded day without changing its saved choice. An explicit open or close records the resulting choice even when a temporary reveal already made the day open. Folding a different day does not save temporary reveals elsewhere. Focused-day folds keep the temporary behavior of §23.15.

### 23.6 Large Timelines

Agenda uses the windowing behavior of §20.1 above 100 projected rows, including day headers, parent paths and separators. The selected row stays mounted and focused when scrolled off-screen. Repeated occurrences of a real node have independent positions and measured heights. Day folding and window resizing update the layout without losing selection or focus; windowing adds no document saves. Single-line entries, headings and separators use the same row bounds for keyboard reveal, so crossing between them does not shift the caret vertically at a viewport edge. Wrapped text and attached images retain their caret-line reveal behavior.

Measurement corrections preserve scroll continuity under §20.1. An explicit jump to the end continues to follow the end while its rows are measured. Opening Today, returning from a focused day and keeping an edited occurrence in place follow the alignment rules of §23.1, §23.15 and §23.7.

Scrolling must populate the newly visible range before the next rendered frame, including large scrollbar jumps and rapid direction changes. The viewport must not flash empty while its rows are replaced. Scrolling preserves the selected occurrence, active editor, caret, text selection and editing mode.

### 23.7 Active Occurrence and Date Removal

Selecting a direct match makes that node's occurrence on that day active. Adding a date keeps the active occurrence on its day. Removing its date moves it to the chronologically nearest remaining recognized date, choosing the earlier day on a tie. A live edit reveals that destination if folded and switches to its week when needed so editing can continue; unrelated folds remain unchanged. Undo and Redo preserve the displayed week.

A destination before the current week is the item's Overdue row only for an unfinished item. Overdue does not list finished items (§23.3), so a finished item continues in the week of that date and stays selected.

Removing the last recognized date keeps the item on the active day until selection leaves it. The real node is not deleted. Selecting another row, closing Agenda, or navigating to Tree leaves it; reselecting the same item, window blur, and changing editing mode on that item do not. Restoring a recognized date removes the temporary pin. These transitions follow document changes and do not create separate Undo entries.

If the originating Tree parent or selection no longer exists, Agenda stays open and updates its return location to the nearest surviving Tree ancestor, or the first root, with the cursor at the beginning. This keeps the return location valid for persistence and closing.

A mark (§2.7) counts as a date on Today for these rules. Removing the mark of the active occurrence under Today moves it to its nearest remaining date, or keeps it on Today until selection leaves it when it has no date. Marking a temporarily kept item moves it to Today.

The active editor retains focus, caret, selection and mode when its active day changes.

Every other occurrence of the active node is a live mirror: it shows the current text, links and image, never owns an editor, and draws its bullet as a hollow ring in the gutter color. Selecting a mirror, by pointer or keyboard, makes it the active occurrence. Editing the active occurrence updates its mirrors immediately without moving focus or changing the scroll position. When a document change moves the active occurrence to another row, the scroll position adjusts so that the active row keeps its place in the viewport; selecting a row never takes this adjustment.

While the last date is removed, the status bar shows `Add a date to keep this item in Agenda`. The message sits at the left edge, including during search entry (§20.2.26), while the mode indicator remains beside the pin on the right when Vim is enabled. It is announced as a status and never changes any row height. It disappears when the item leaves Agenda or a recognized date returns.

### 23.8 Agenda History Focus

Agenda uses the document's Undo/Redo history (§10). Restored document content updates its occurrences, including restoring removed dates and pinning an active item when its last date is removed again. History does not change the captured Tree return location, Agenda folds or Tree expansion while the originating nodes still exist.

After Undo or Redo, select the nearest visible occurrence of the change-site node relative to the current occurrence's day, choosing the earlier day on a tie. If none is visible, keep the current selection and focus. A selection whose row no longer exists falls back to the nearest displayed day. History focus uses the change-site text cursor when selecting that node. Persistence locking continues to reject document edits and Undo/Redo, while navigation remains available.

`Cmd+Z` and `Cmd+Shift+Z` work throughout Agenda; Vim Normal `u` and `Ctrl+r` use the same history. Pending Insert and Replace sessions finish by the same rules as Tree before a history command.

### 23.9 Editing in Agenda

Direct matches edit the same real nodes in standard editing and text-oriented Vim modes. Text commands, links, images, strikethrough (`Cmd+Enter`), and ordinary Cut/Paste follow Tree behavior. Path labels are passive context. Day containers are synthetic and never editable.

Pending Cut/Paste operations apply only if their target node is still selected when the clipboard read/write or image write finishes. If a day, path, separator, or another node is selected instead, the document and new selection stay unchanged. The retained Tree location does not override the selected Agenda row.

* Canonical dates are recognized immediately after typing or pasting. Date emphasis preserves every character, caret offset and text-selection operation; dates remain editable text.
* A single-date node has one editor; a node appearing on several days has an editor only at its active occurrence. Other direct-match occurrences display the current text, hyperlinks and attached image.
* Native context-menu commands follow keyboard editing rules. Enter in standard editing or Vim Insert inserts a newline in the existing node rather than splitting it. Multiline paste inserts at the text cursor in that node and preserves hyperlinks, following §13. Normalize CRLF and CR line endings to LF, keeping the caret and hyperlink ranges aligned. Completion acceptance takes precedence.
* Image paste can attach an image to a node without one; a paste that would create a sibling for a second image does nothing. Overlapping image pastes obey the same restriction. Image-to-text does nothing in Agenda because it creates nodes.

### 23.10 Structural Restrictions

Agenda never creates or deletes nodes, reorders siblings, changes real parents, or moves occurrences between days. `Tab`, `Shift+Tab`, `Cmd+Backspace`, `Cmd+,` on a node, Vim `>`/`<`, `gJ`, `dj`/`dk`, `cj`/`ck`, `yj`/`yk`, `gp`/`gP`, and structural dot repeats do nothing and retain focus, caret, mode and text. Awaited text characters and surround delimiters still work. These restrictions do not override completion acceptance (§20.9, §20.12).

`Backspace` on an empty direct match retains the node, including when it has no children. Removing text or dates never deletes a node automatically.

Vim Normal `Enter` on a direct match follows Tree: it opens the hyperlink under the caret or previews its image when the image is the active character; elsewhere it does nothing. A counted `Enter` does nothing. On a day container it does nothing.

### 23.11 Node Creation

Creation is unavailable throughout Agenda. Standard `Enter` on a day and Vim Normal `o`/`O` on any row do nothing. Enter in an editable node follows §23.9; it adds no date and no sibling.

### 23.12 Occurrence Movement

Agenda has no node drag or occurrence move command. Holding or moving the pointer never changes dates or structure. Ordinary click, text selection and scrolling remain available. Edit a node's dates directly to change its day membership (§23.7).

### 23.13 Vim Node Commands

Vim `dd`, including counted forms, does nothing in Agenda: it neither deletes nor starts a pending move, changes registers, writes the clipboard or creates history. Node-register `p`/`P` does nothing. Text-register `p`/`P` on a direct match is ordinary text editing (§23.9). `yy` copies as in Tree.

### 23.14 Vim Whole-Node Selection

`V` does nothing throughout Agenda. There is no group selection or group mutation. Character Visual `v`, text selection, copy and text editing remain available under §23.4 and §23.9.

### 23.15 Focused Days

`Cmd+.` on a day container opens that day's flat entries. In Vim Normal, `gd` does the same. The location path displays the calendar glyph followed by `› Wed Oct 14`; its date label matches the non-editable heading, including the weekday and the year when it differs from the current year. The heading uses regular font weight and occupies the current-parent heading position, with no timeline day header. Navigation and scrolling stay within that day. `gg` selects the heading, which supports day folding but no creation. If the focused day becomes empty, retain its heading and show the passive message `No entries for this day`.

`Cmd+,` returns to the timeline. In Vim Normal, `Ctrl+o` also returns to the timeline. If a Vim command is unfinished, `Ctrl+o` discards it and keeps the current day and row selected (§20.2.16). Returning restores the timeline's selection, scroll position and folds instead of selecting Today. If edits removed the saved row, selection falls back to the nearest visible day, choosing the earlier day on a tie. Focused folds are independent of that saved timeline state. Presentation changes retain the ordinary text-session completion rules. `Cmd+.` or `gd` on a real node still opens Tree at that node.

When a live edit removes the active occurrence's date but another date remains, the focused view follows the chronologically nearest remaining date under §23.7, preserving editing continuity. Returning still restores the original timeline state. History does not change the focused presentation or its folds. Focused-day state is runtime only and creates no additional persistence writes.
