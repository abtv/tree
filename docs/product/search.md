# Search

#### 20.2.26 Local Vim Register and Local Search

* The local Vim register is held only for the running renderer session and does not persist across application restarts. It is separate from the system clipboard; character-wise Visual `y`, Normal `yy` and `dd`, and whole-node Visual `y` also copy content to the system clipboard under the rules of §20.2.22, while other register-producing Vim commands do not modify the system clipboard. It holds either one plain-text value, one structured node subtree, or an ordered set of sibling subtrees, with only the most recent register-producing action retained.
* Named registers, macros, and marks are not supported.

Tree and Agenda support literal text search in standard editing and Vim.
Regular expressions and Vim's `?` backward-search command are not supported.
These are deliberate product limitations; backward navigation through matches remains available.

`Cmd+F`
opens the local search in either editing mode; `/` also opens it in Vim Normal.
`Cmd+;` remains the separate global node search (§20.14). A nonmodal Find panel
opens at the upper right without moving the document layout. It selects the last confirmed query for
replacement, or starts empty. Smart case ignores case unless the query contains an
uppercase character. Matches do not overlap and do not cross node boundaries.
Displayed link text participates, including phrases crossing a link boundary.

With Vim enabled, local search uses `/query` and the match count in the bottom status
bar instead of the Find panel. Both `/` in Normal and `Cmd+F` use this entry.
Enter (or Shift+Enter backward) confirms and returns focus to the editor; `n` and `N`
repeat from the current position. Escape cancels entry or hides confirmed feedback.
The confirmed query and count remain visible without an editable field. Navigation
and close buttons belong only to the standard Find panel. The standard-panel focus
and placement rules below apply only with Vim disabled; other search rules are shared.

Tree scope includes the current-parent heading before all descendants, regardless of folds.

Agenda searches direct-match occurrences in the displayed week and its Overdue group (§23.3), including collapsed days and a collapsed Overdue group. Changing weeks closes search and cancels pending navigation while retaining query recall. Day headings and separators are excluded. Focused-day search includes only that day. Each occurrence
of a node on a different day counts separately. Synthetic day labels are
excluded. Order is chronological by day, then depth-first through projected rows.
From a day header, forward search starts before that day's contents and reverse
search starts before the header.
The caret offset within a synthetic label does not affect search order.

Counting stops at the 101st match and reports `100+` without an ordinal. Navigation
and mounted-text highlighting are independent of that cap. Query entry updates
counts and highlights without moving the document caret, scrolling or unfolding.
Scrolling and disclosure clicks retain the prompt and its captured logical origin,
even if folding hides that origin; ordinary fold selection still applies underneath.
Ordinary node-text clicks close the panel, discard any draft and hide highlights,
while preserving the clicked caret or selection. The last confirmed query remains
available to Cmd+F and repeat commands. Scrolling and disclosure clicks keep search open.

Enter confirms and moves strictly after the captured origin, wrapping if necessary.
An empty confirmation reuses the last confirmed query, or does nothing if none exists.
In Vim Normal, `n` and `N` navigate forward/backward from the current position, with numeric prefixes.

In either editing mode, `Cmd+G` and `Cmd+Shift+G` repeat forward and backward;
previous/next buttons beside the count provide the same actions. `Shift+Enter`
confirms backward. Focus remains in the input after confirmation; repeated Enter
or Shift+Enter moves to the next or previous match. The query remains editable.
Escape or the close button hides the panel and restores editor focus at the last
match, or preserves the original selection if no jump occurred. The compact panel
shows an input with placeholder `Find`, the count, navigation arrows and close button.
It has no scope label; scope follows the current presentation automatically.

The count area reserves space for pending and completed counts so typing and
recounting never resize the input or move its controls.
While counting, the previous completed count remains visible until the new count
replaces it, without an empty intermediate state. The status is marked busy for
assistive technology. `Searching…` replaces the previous count only after 200ms
of continuous pending work; the completed count appears immediately.
Closing Find cancels the pending indicator delay.

The previous/next and close buttons show application-drawn tooltips on hover and
visible keyboard focus, naming only the action without shortcuts. Tooltips appear
below the panel and do not intercept input.

Edit menu and command-panel actions expose local Find, Find Next, Find Previous
and Search All Nodes. Search opening borrows editing focus; cancellation preserves
the original mode and selection, including its direction, even when match highlighting
replaces the text editor or its contents. Pending Replace text is committed before searching,
without leaving Replace on opening; cancellation or confirmation without a match permits
replacement typing to continue at the retained caret. This applies to the Edit menu, command panel and shortcuts. A confirmed jump ends Visual/Replace in Normal, including when leaving the current Agenda occurrence removes it from the results.

Destinations place the text caret at a grapheme boundary. Exact totals show the current
ordinal after navigation; wrapping updates the ordinal without a separate notice. Reveal only the destination's
ancestor path. Successive jumps keep earlier search reveals open. Escape in standard
editing or Vim Normal hides
feedback and closes search-opened branches except the current path, preserving
pre-existing expansion and explicit manual fold choices. Repeat commands restore feedback.

Agenda reveals only the selected occurrence's day; its folds remain independent of other days and Tree expansion. A search destination becomes the active occurrence.

A newer manual selection, text input, native composition, non-search command or command-panel opening cancels
pending search jumps and queued repeats. A delayed result must not replace the
newer caret or focus choice. Search feedback remains available.

Escape during entry discards the draft, retains the prior confirmed query for recall,
and closes the panel. Losing prompt focus,
deactivating the window, or opening the command panel also cancels the unconfirmed
draft; scrolling and disclosure controls retain the exceptions above. Prompt text,
including `n`, `N` and `:`, remains literal. Native composition owns its input.

Insert retains highlights; edits update local matches and show pending recount
instead of a stale count. Document revisions invalidate obsolete destinations.
Changing Tree location or presentation closes active search. Disabling Vim closes
entry and hides search feedback. Both retain the last confirmed query for recall.

Entering or leaving a focused Agenda day also closes search. Query recall is shared
between Tree and Agenda. Agenda edits update all mounted mirrors; leaving a temporarily
pinned item removes it from the search corpus and refreshes the count.
While search is visible, the Agenda status message of §23.7 remains visible in the
bottom status bar, independently of the Find panel and without changing document geometry.

Only that query is remembered in application-session memory; no search state is
persisted in documents, view state, preferences or backups.

Visual-mode search entry, backward `?` entry, regex and operator search motions are
not supported.

### 20.14 Search

`Cmd+;` opens global Search in Tree or Agenda, in standard editing and every Vim mode. `Cmd+F` opens local search (§20.2). Outside Apple platforms they use Ctrl (§1.5). Cmd+; deliberately replaces macOS's check-spelling shortcut with the owner's frequently used navigation command (§1.3).

* The input receives focus and starts empty on every opening. Empty input shows marked and starred nodes (§20.14.5).
* Valid `#tag`, `@person` and `&event` terms in the query use the same color, bold weight and transparent background as search suggestion and result matches. Ordinary terms and invalid marker terms stay plain. Native text editing, selection, horizontal scrolling, clearing and composition remain available. Result highlighting still marks query matches independently of query-term styling and retains its match underline.
* Every nonempty query searches required terms using the ancestor-context and per-term smart-case rules in §20.14.3. Results update as the input changes.
* Search covers the entire document, including folded nodes and nodes outside the current Tree or Agenda scope. Each matching node appears once with its text and parent path, in the order specified in §20.14.3.
* All results are reachable by scrolling and keyboard selection. Pending work lasting more than 200ms displays `Searching…` once in the footer; no matches displays `No results`. Typing does not navigate or edit the document.
* While tag suggestions are visible, an empty node-result list does not display `No results`.
* Pending searches retain rows, empty-state text and list height; stale rows cannot be activated or navigated. Without tag suggestions, the footer keeps its hint for 200ms, then shows `Searching…`. Results replace the list atomically, including short queries and queries with no matches. Clearing restores the marked and starred list. Completion, clearing and closing cancel the indicator timer.
* The popup is centered horizontally and vertically when opened, using its initial content height. Its top edge, width and input position then remain unchanged during query changes; only the bottom edge adapts to content, up to the available window height. Resizing the application window recenters the popup within the new available space. Lists scroll within the available space.
* On small windows Search uses up to 92% of the window width with at least 12 px on each side. This width levels off at 960 px until 80% of the window exceeds it, then grows to a maximum of 1040 px. The height limit is 88% for windows up to 900 px tall and 80% otherwise, constrained by space below the fixed top edge. Short lists retain a compact height. The document and application chrome behind Search are dimmed without blur or animation.
* The search field is the first visible element. Section headings identify marked and starred nodes, marker suggestions and matching results. Section labels, field text, options, paths and keyboard hints share a left edge. Only the active list shows selection.
* The 27 px footer displays `↑↓ Select`, `↵ Open` and `Esc Close`. During marker completion it displays `↵/Tab Apply` for the middle action. Accepting a suggestion returns focus to the completed query and activates result navigation.
* When the node-result list is active and nonempty, the trailing edge of its heading shows the selected row and total as `3 / 24`, for the marked and starred list as well as `Results`. The total covers all listed nodes, including those outside the rendered scroll window. A selected group heading shows the position of its first matching node and the same total.
* The counter does not move while the popup is open. The position and the total each reserve one digit place per digit of the document's node count; the position is right-aligned and the total left-aligned around a fixed ` / ` separator. No digit, separator or counter edge moves as selection moves between nodes and group headings, wraps, or as the query changes the total. For example, a document of 3,200 nodes shows `   1 / 5   ` and `3200 / 3200`. The reserved width can change only when the document's node count gains or loses a digit.
* The indicator is hidden during tag completion or when there are no node results. The footer contains keyboard hints or the pending-search status, not the result counter.

Search work yields between batches and obsolete queries are cancelled on refinement or dismissal. Result rendering is windowed. A document replacement refreshes the active query. Search text is not persisted or recalled; the independent Vim `/` search follows §20.2.26. Resource constraints are in §20.14.3. The list for empty input is specified in §20.14.5.

* Without tag suggestions, Up and Down cycle through group headings and node results in display order. The first node is initially selected.
* Arrow navigation keeps visible results in place and scrolls only far enough to reveal the next selected row. If that row exceeds the available list height, reveal its first highlighted match, or its beginning when no match exists. Late-arriving highlights also reveal that match for the active selection. Ordinary manual scrolling does not repeatedly return to the match. Crossing the list boundary wraps to the opposite end. Selection changes the highlight, not the text size or row geometry. Resizing invalidates measured row heights and preserves correct navigation and scrolling.
* Pointer scrolling and large scrollbar jumps retain the last painted results until replacement rows and their position are ready together. The results list must not flash empty while its rendered window changes. Scrolling preserves the query, result selection and input focus. At most 40 rows are mounted in the results list, including group headings and the selected entry when scrolled out of view. The list limits its height in tall windows to leave room for those rows. Any spare rows mounted outside the visible area also count toward the limit.
* A thin divider separates each list heading from its scrollable list. The node-result list softly fades at an edge only while more content exists beyond that edge, so partially visible rows do not appear to overlap the heading or footer. Keyboard reveal leaves the selected row clear of the fades when space permits; a list that fits shows no fade. A width change remeasures wrapped rows and reveals the selected result after the new geometry is applied.
* Enter or clicking a result or group heading closes the popup and finishes buffered editing. A heading targets its parent node. Search always selects the target itself. If the target has children, Tree enters it as the current parent and selects its editable parent heading with the caret at the start, unlike the usual child selection of entering (§6.1). For a leaf, Tree shows its parent, or the root list for a top-level leaf, and places the caret at the start of the leaf.
* Escape, outside dismissal and window deactivation close without a jump and restore the originating editor selection and mode.
* Opening borrows editing focus, clears unfinished Vim commands and cancels a pending search draft as the command panel does. Modal dialogs, IME composition and the open command panel retain their input.
* Opening, closing and list changes have no animation.

#### 20.14.2 Result Presentation

* Empty nodes use `Empty node`; image-only nodes use `Image`.
* Both the marked and starred list and Search results display the complete node text with preserved line breaks and wrapping, without a character cutoff.
* Ancestor labels in paths remain single-line previews bounded to their first 160 characters.
* Consecutive entries with the same parent node share one path heading above them, in both the marked and starred list and Results. A different parent starts a new group; a path that recurs after another group is shown again. Grouping never reorders entries or shortens their text. Each option retains its own parent path as an accessible description. Top-level entries retain their root icon and have no path heading.
* Selecting the first result reveals the start of the list when the result and its path heading fit. An oversized result can still scroll to its first match.
* Nonempty whitespace text is preserved like other node content.
* Top-level nodes show a small muted tree icon beside the title, with the accessible label `Top level`; they have no path line.
* Every marked entry, in the marked and starred list and in Results, has a 3 px stripe at the leading edge of the list in the mark color of §2.7, spanning its path heading and row. Consecutive marked entries form one uninterrupted stripe, so the marked part reads as one block; starred and other entries have no stripe. The stripe stays visible on the selected entry.
* Titles use the 15 px tree font. Group headings use 12 px secondary text. Thin dividers mark group boundaries, including runs of top-level results. They span the selection width without adding height.
* Single-line group headings, marked and starred entries, search results and tag suggestions use the same 25 px height as Tree rows. Wrapped rows grow with their text and keep equal vertical padding. Nodes at the root reserve no heading space. Tag suggestions keep full-width separators between unselected neighbors.
* Selected nodes, group headings and tag suggestions use a distinct fill with 4 px rounded corners. Light and Dark include a complete inset frame. Gray and White use the same muted gray-violet fill as the current Tree row, without a frame. Selection does not change row geometry or text alignment.
* Trailing scroll space is reserved only for overflowing node results. A list that fits has no extra trailing space. Tags and node results use the same gap before the footer.
* Literal title matches and matching tag suggestions use bold colored text without a separate background. Matches in every node title also have a visible underline, including unselected nodes and short fragments within a word. Path matches remain bold in the path's normal text color, without a separate background or underline.
* Each query term highlights its matches independently in node text and displayed parent paths, using the same per-term smart case as result matching. Marker terms highlight only complete recognized names, excluding hyperlink ranges. Ordinary terms highlight literal substrings. Overlapping highlights merge without repeating text; repeated terms add no duplicate highlights. Matches beyond the displayed ancestor preview remain undisplayed.
* Tag suggestions highlight only the continuous matched fragment, preserving the suggestion's original spelling; a matching prefix includes its leading `#`.
* Bare `#` does not highlight every suggestion.

#### 20.14.3 Query Terms and Ancestor Context

* Search lists matching nodes that are both marked and starred first, then the other matching marked nodes, then matching starred nodes that are not marked, followed by all other matches. Each node appears in one group only, and each group keeps document order.
* Every nonempty query starts search, including one- and two-character terms. Whitespace separates required terms; repeated and leading/trailing whitespace is ignored. A whitespace-only query has no results. Term order is irrelevant, and repeating a term does not require multiple occurrences. Quotes and regular-expression syntax have no special meaning.
* Every term must match somewhere in the result node or its complete ancestor chain up to the root, regardless of depth or the displayed parent-path cutoff. At least one term must match the result node itself. Intermediate ancestors need not match; siblings and other branches never contribute. A matching ancestor and its matching descendant may both appear.
* Ordinary terms match literal substrings. Terms beginning with `#`, `@` or `&` match complete recognized tags, people or events, excluding hyperlinks and embedded markers (§20.13); incomplete names and bare markers do not match nodes. Different terms may match different ancestors. For example, `@alex #k8s opensearch` can find a node containing `opensearch-dashboards` under ancestors containing `@Alex` and `#K8s`.
* Smart case applies independently to each term: a term without uppercase letters ignores case; a term containing an uppercase letter requires that case. This applies equally to ordinary text and complete marker names. Local Cmd+F and Vim `/` retain their separate literal phrase-search rules (§20.2).
* Ordinary terms also match hidden recognized image text (§15.1), including ancestor context. Results still display only the node's ordinary text and path; hidden matches never highlight unrelated visible text. Marker terms and completion catalogs use only ordinary node text.

Query preparation and matching retain only the current terms, result list and ancestor traversal state, without earlier query snapshots or a persistent full-text index. Ancestor term matches are accumulated during traversal, rather than rescanning all ancestor text for each descendant. Query input causes no document/history writes or syncs.

#### 20.14.4 Marker Completion

* The `#`, `@` or `&` term at the caret offers catalog suggestions in every position of a multi-term query. Typing or moving the caret with the keyboard or pointer updates suggestions for that whole whitespace-delimited term. A noncollapsed text selection suppresses suggestions. Global Search suggestions match a continuous, case-insensitive substring of the name; unlike inline tag completion (§20.13), they do not match letters separated by gaps. The exact-name, prefix, word-prefix and substring ranking of inline tag completion (§20.13) applies.
* When the only matching tag suggestion exactly equals the active term, Search omits the redundant suggestion and activates the node results as soon as they are ready. The first result is selected and Enter opens it directly. A nonexact fragment or a term with multiple matching tag suggestions keeps tag completion active, even when one suggestion is an exact match.
* Up/Down and Ctrl+N/Ctrl+P wrap suggestions; Enter, Tab or a click accepts a full tag into the search input. Escape closes the entire Search popup on the first press, including when tag suggestions are open, and restores the originating editor selection and mode.
* A manually typed complete marker name searches immediately, including one-character names and case variants accepted by smart case; a fragment or unknown name has no node results. Search matches complete recognized names, excluding hyperlink ranges, and never creates tags.
* Completion acceptance replaces only the active term, preserves all text and whitespace before and after it, leaves the caret immediately after the inserted name and retains focus in the search input without jumping to a node. Suggestions remain dismissed until the next edit or caret movement. IME composition owns its keys and suspends suggestions until commitment.

#### 20.14.5 Marked and Starred List

* With empty input the popup lists three parts: nodes that are both marked (§2.7) and starred (§2.6), then the other marked nodes, then the starred nodes that are not marked. Each node appears once. No other nodes appear, and editing or visiting a node does not add it to this list.
* Each part is sorted alphabetically by its ancestor path and node name, one level at a time from the top, without the display preview cutoff. Equal paths keep document order.
* A name that equals the start of a longer path sorts first, so a node's descendants follow it before a sibling whose name only begins with the same text.
* Runs of digits compare by numeric value, so `Release 0.9` precedes `Release 0.11` and `Item 2` precedes `Item 10`.
* All parts use the consecutive-parent grouping of §20.14.2. The first result is selected.
* The heading names the flags that the listed nodes carry: `Marked and starred`, `Marked`, or `Starred`; a list that contains only nodes with both flags uses `Marked and starred`. An empty list keeps the heading `Marked and starred` and displays `No marked or starred nodes`.
* Typing replaces the heading text with `Results` in the same heading row, so the list does not shift. Clearing the query restores this list. Titles and paths follow edits and moves.
