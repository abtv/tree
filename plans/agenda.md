# Agenda

## Objective

Add an **Agenda**: a temporal projection of the existing tree that arranges nodes containing dates by calendar day, lets the user edit the same nodes there, and navigates between Agenda and Tree.

The work proceeds in four stages: UX consistency review, visual design discovery, final product/UX specification, and implementation planning. This plan records the behavioral specification accepted in the UX consistency review and the visual decisions accepted in visual design discovery, so later sessions start from repository state.

## Scope and Sources of Truth

* This plan is a coordination record, not a product requirement. `docs/PRODUCT.md` remains the source of truth for implemented behavior; Agenda behavior enters it only together with its implementation and tests (`AGENTS.md` §§5, 9).
* The accepted behavior below is binding for the later stages unless the Product Owner changes it.
* Out of scope until the Product Owner authorizes it: task semantics (deadlines, overdue, priority, status, automatic rescheduling), time-of-day semantics, a calendar grid, cloud services, and any implementation work.
* Implementation details — storage, data structures, libraries, list virtualization — are decided during implementation planning, not in the design stages.

## Authorization State

* Authorized: recording this specification (AG-1) and running visual design discovery (AG-2) as a discussion that changes no runtime code. The Product Owner accepted the visual direction and decisions V1–V5 on 2026-10-09.
* AG-3: the Product Owner accepted resolutions F1–F7 and the state treatments S1–S5 on 2026-10-09; the Final Specification below records them.
* Reserved for the Product Owner: approval of the recorded Final Specification, which completes AG-3, and authorization of implementation.

## Tasks

| ID | Outcome | Depends on | Acceptance evidence | Status |
| --- | --- | --- | --- | --- |
| AG-1 | UX consistency review completed and recorded | — | This plan with the accepted specification and decisions D1–D5 | Done |
| AG-2 | Visual design discovery: a small number of substantially different directions, then one accepted visual system | AG-1 | Accepted visual decisions recorded in this plan; Product Owner accepted the direction | Done |
| AG-3 | Final product/UX specification: resolve Open Items, add visual contracts, state descriptions, end-to-end scenarios, and acceptance criteria | AG-2 | Final specification recorded in this plan and approved by the Product Owner | Recorded; awaiting Product Owner approval |
| AG-4 | Implementation planning: ordered, small, testable tasks added to this plan by the planner role | AG-3 | Task table extended with implementation tasks, each naming files, acceptance evidence, and validation tier | Planned |

Task details:

* **AG-2.** Files: `plans/agenda.md`. Mockups, if any, are produced outside the repository or as artifacts and contain only synthetic data. Validation tier: Minimal Risk. Cover the areas listed under Visual Direction. Use real-looking hierarchical examples, not flattened task lists. Keep the Agenda recognizably an outliner. Discuss major visual decisions with the Product Owner before finalizing them.
* **AG-3.** Files: `plans/agenda.md`. Validation tier: Minimal Risk. Separate accepted behavior from implementation choices; include no speculative features. Turn the Accepted Visual Decisions and the proposed state treatments into visual contracts, and ask the Product Owner to confirm the proposed treatments.
* **AG-4.** Files: `plans/agenda.md`. Validation tier: Minimal Risk. May inspect the repository and architecture. Each implementation task updates `docs/PRODUCT.md` for the behavior it implements.

**Next task:** Product Owner approval of the Final Specification (completes AG-3), then AG-4.

## Accepted Specification

### 1. Principles

* Keyboard first; mouse is useful but secondary. Instant response without decorative animation. Local only, no cloud AI. Minimal visual noise. Inline editing wherever possible. Vim is an alternative way to use the same product. Consistency over features. No hidden state or surprising behavior. Direct manipulation over confirmation dialogs or special modes.
* **Tree determines where. Agenda determines when.**
* **Reactive, but not jumpy.**
* A date is not a task. A date means only "this node is associated with this calendar day".
* Existing Tree behavior (`docs/PRODUCT.md`) remains unchanged unless an Agenda-specific rule below says otherwise.

### 2. Agenda as a projection

* Agenda shows the same real nodes as Tree, never copies.
* **Scope.** Agenda inherits the Tree location it was opened from. Opened from Root, it covers the whole tree; opened inside `Work / Team A`, only that subtree.
* **Hierarchy.** Agenda preserves the original hierarchy and sibling order. Each day shows only branches that lead to matching nodes, with their ancestors below the scope as context. Ancestors at or above the scope are not repeated. Agenda never flattens dated nodes into a list.
* **Full text.** Every real node shows exactly the same text as in Tree, including every date it contains, in every occurrence and in contextual ancestors. Matching dates may be emphasized visually.

Example, opened from Root:

```
Oct 14
  Work
    Team A
      Release
        2026-10-14 Prepare rollout
```

Opened from `Work / Team A`:

```
Oct 14
  Release
    2026-10-14 Prepare rollout
```

### 3. Direct matches and contextual ancestors

* A **direct match** for a day is a real node whose text contains that day's valid canonical date.
* A **contextual ancestor** appears only because a descendant matches the day.
* **D2 — Agenda works only with dated nodes.** Contextual ancestors show the path and nothing more: they can be selected, collapsed and expanded, used for navigation, and entered in Tree with `Cmd+.`. Their text is not editable in Agenda, and `o`, `O`, `Enter`, and `Cmd+Enter` do nothing on them. (Supersedes the earlier decision that contextual ancestors are editable and act as anchors for creating siblings. `Cmd+Enter` doing nothing is a derivation from D2; the Product Owner may revisit it.)
* Contextual ancestors are never moved between days. Moving a node never reschedules its descendants.
* A node can be a direct match on one day and a contextual ancestor on another. Example: moving `2026-10-14 Release` (with child `2026-10-14 Prepare`) to Oct 15 yields `2026-10-15 Release`, shown as a direct match on Oct 15 and as a contextual ancestor of `Prepare` on Oct 14.

### 4. Dates in text

* Dates are ordinary editable text. A valid canonical date is recognized however the text was produced: typing, pasting, editing, undo, or redo. No confirmation step and no hidden metadata; the current text determines date semantics.
* Canonical format: `YYYY-MM-DD` (final, F1).
* Recognized date → participates in Agenda. Ordinary text → does not. Highlighting never turns a date into an indivisible widget.
* Editing a date updates recognition immediately (`2026-10-14` valid, `2026-10-1` ordinary text, `2026-10-15` valid).
* An impossible date such as `2026-02-31` is ordinary text and does not participate. A subtle spell-check-like indicator may mark text that strongly resembles an attempted canonical date; arbitrary text is never flagged.

### 5. Natural-language date completion

* Expressions such as `today`, `tomorrow`, `yesterday`, `Friday`, `next Friday`, `next week`, `Oct 22`, `in 3 days`, and `3 days ago` are not dates until the user explicitly converts them.
* Conservative, IDE-like incremental autocomplete shows a compact popup only when confidence is high. Short uncertain fragments (`t`, `to`, `mar`, `may`) trigger nothing; a recognizable `tomor` may offer `tomorrow`. The popup updates or dismisses as the user types. Ignored expressions stay ordinary text; editing them later may trigger suggestions again.
* In standard editing and Vim Insert: `Ctrl+N` next suggestion, `Ctrl+P` previous suggestion, `Tab` accepts. Mouse selection also accepts. Without an open popup, `Tab` keeps its indentation behavior. No special date-editing mode.
* `Esc` is never hijacked. In Vim Insert it returns to Normal and the popup disappears as a consequence; the typed text is unchanged. In standard editing there is no double-Esc requirement. Moving away from the expression or leaving the editor context also dismisses the popup.
* Multiword expressions are recognized as a whole. `this Friday` = Friday of the current calendar week; `next Friday` = Friday of the next calendar week; `last Friday` = Friday of the previous calendar week. The parser favors a limited, predictable set of expressions.
* Ambiguity: offer at least two meaningful alternatives with the most probable first. `Friday` on a Tuesday: upcoming Friday, then the following week's Friday. On a Saturday: next week's Friday, then yesterday. On a Friday the closest Friday may be today. `next week`: Monday of next week first, then other days of that week. Unambiguous expressions (`today`, `tomorrow`, `yesterday`) offer one suggestion only.
* Only the recognized expression is replaced: `tomorrow morning` → `2026-10-09 morning`; `next Friday at 10` → `2026-10-16 at 10` (illustrative dates). Time words remain ordinary text.
* Pasted canonical dates are recognized immediately. Pasted natural language is neither converted nor forces the popup open.
* A conversion is one undoable edit. One Undo restores the original expression and does not reopen the popup.

### 6. Multiple dates and live occurrences

* A node with several valid dates appears under each of those days. These are occurrences of one real node.
* Edits in any occurrence update all others immediately. Only one occurrence owns focus, caret, and selection; the others are live mirrors. Updating a mirror never steals focus or changes scroll. Explicitly starting to edit another occurrence makes it active.
* Adding a date: the active occurrence stays active; a mirror appears under the new day; focus and scroll stay stable.
* Removing the active occurrence's date while other dates remain: the active occurrence moves to the chronologically nearest remaining date (the earlier one on a tie), preserving mode, caret, selection, and editing continuity.
* Removing the last date: the node is not deleted and the user is not ejected. The item stays with a subtle invalid state (possible hint: `Add a date to keep this item in Agenda`) and disappears from Agenda when the user leaves it. Its contextual ancestors stay while it stays. In Vim, `Esc` from Insert to Normal on the same item is not leaving it.
* Undo restoring a removed date restores the occurrence; Redo removes it again. Appearance and disappearance are consequences of text changes, not separate history entries. Undo never steals focus from the user's current location.

### 7. Timeline and day containers

* Days run past at the top, future at the bottom. Agenda opens at Today, which remains visually identifiable. No calendar grid and no week/month modes.
* Days are synthetic containers (for example `Oct 14`): selectable, focusable, collapsible, not text-editable, not real nodes.
* Branches inside Agenda are expanded by default and can be collapsed. Agenda collapse state is independent of Tree. A manually collapsed branch does not make a day empty, and no hidden-item counters are shown.
* **Compressed timeline.** Shown: every day with relevant dated nodes in scope, Today even when empty, a small neighborhood of empty days around Today, and long empty intervals as compact collapsible gap elements (`11 empty days`). A day whose matches are inside collapsed branches is not empty.
* The scrollbar reflects the displayed content like an ordinary document. No artificial infinite scrollbar.
* **Gaps.** Gaps are selectable synthetic elements. `Cmd+E` on a gap reveals at most the next seven consecutive calendar days (all remaining days when fewer remain), with the remainder shown as a smaller gap; the original gap stays visible so the whole region can be collapsed again. Expansion is incremental, instant, and keyboard-navigable.
* **Restructuring.** When an empty day gains content, the timeline restructures immediately and splits the gap around that day. The edited item stays active; caret, selection, mode, and visible position are preserved as much as possible.

### 8. Navigation

* **D3 — Opening and closing.** `Cmd+P` in Tree opens Agenda for the current Tree location, positioned at Today. `Cmd+P` in Agenda closes it and returns to the Tree location it was opened from. There is no separate Back command. `Cmd+P` is Apple's standard Print shortcut; this is a deliberate difference from the Human Interface Guidelines (`docs/PRODUCT.md` §1.3) because the application has no printing. Record this difference next to the requirement when it enters `docs/PRODUCT.md`.
* `Cmd+.` on a real node leaves Agenda and focuses that node as the current parent in Tree. No detail panel, copy, or separate editing model. Pressing `Cmd+P` there opens the Agenda of that node, at Today.
* **Focused day.** `Cmd+.` on a day container opens `Agenda / Oct 14`, showing only that day's hierarchy with full text. `j`/`k` and arrows navigate only within the day; scrolling never moves to adjacent days. `Cmd+,` returns to the timeline and restores its scroll position, its selection (normally the day container), and its collapse state; it does not reopen Agenda at Today.

### 9. Creating nodes

* **From a day container.** The new node's physical place is the last child of the current scope (a final root-level node when opened from Root). No Inbox or special storage. Its text starts as `2026-10-14 ` with the caret after the trailing space. In Vim, creation enters Insert.
* `Enter` on a day container in standard editing creates a dated node for that day. `Enter` on a day container in Vim Normal does nothing.
* `o` on a day container creates a node for that day; `O` creates a node for the preceding calendar day, revealing it if it lies inside a gap. Both enter Insert, and both place the node at the end of the scope.
* **Splitting a dated node.** In standard editing and Vim Insert, `Enter` keeps ordinary split semantics. The new node receives the displayed day's date unless it already contains it; only that day's date is inherited. One Undo reverts the split and the inserted date together. Example: `2026-10-14 Prepare| release` → `2026-10-14 Prepare` and `2026-10-14 |release`.
* **`o`/`O` on a dated node** (direct match only, per D2): `o` creates a sibling immediately after the node, `O` immediately before it, in the real tree. The new node receives the current day's date and enters Insert.

### 10. Structural restrictions

* Allowed in Agenda: editing the text of dated nodes, the creation interactions above, splitting, changing or removing dates by editing text, moving occurrences between days, collapsing and expanding, navigating to Tree.
* Not allowed: reordering existing siblings, moving nodes between real parents, rescheduling a subtree implicitly, transferring contextual ancestors between days, and structural deletion except as D1 allows. Structural reorganization belongs to Tree.
* Deleting text is not deleting a node. Removing a date may remove a node from Agenda but never deletes it.
* **D1 — Deletion.** `Backspace` on an empty node that has no children deletes it, as the natural reversal of an accidental creation. `Backspace` on an empty node with children does nothing. `Cmd+Backspace` does nothing in Agenda.

### 11. Moving occurrences between days

* Moving an occurrence replaces the matching canonical date in the node's text. Parent, children, and position are unchanged: `2026-10-14 Prepare release` moved to Oct 15 becomes `2026-10-15 Prepare release`.
* With several dates, only the moved occurrence's date is replaced: `2026-10-14 Prepare 2026-10-20` → `2026-10-15 Prepare 2026-10-20`.
* When the target date is already present, it is not duplicated: `2026-10-14 Prepare 2026-10-15` → `2026-10-15 Prepare`, and the existing Oct 15 occurrence becomes active.
* Only direct matches of the source day can be moved. Descendants are never changed: moving `2026-10-14 Release` with child `2026-10-20 QA` to Oct 15 leaves the child's date unchanged.
* **Mouse drag-and-drop** of a direct match onto another day changes the date only, never the parent or sibling order. Contextual ancestors cannot be dragged between days. Undo restores the previous dates.
* `Cmd+X` and `Cmd+V` keep their ordinary Cut and Paste behavior; they are not date-transfer commands.

### 12. Vim whole-node selection and group moves

* **D5 — Selection.** In Agenda, whole-node Visual selection includes only direct matches of the current day at one nesting level. Rows between them that do not qualify — contextual ancestors and nodes at other levels — are skipped and not highlighted. Nodes under different real parents may be selected together; no same-parent requirement is added.
* A group move replaces the source day's date in every selected node. It moves no parents, reorders nothing, changes no unselected descendants, and adds the target date to no other node. It is one atomic Undo step. Selection and focus stay as stable as possible.

### 13. Vim `dd` / `p` pending move

* **D1 — Registers.** In Agenda Vim Normal, `dd` starts a pending move of an eligible dated occurrence and never deletes the node. It changes neither the local Vim register nor the system clipboard. `yy` copies as in Tree. Counted `dd` and whole-node Visual `d` follow the selection rules above.
* While pending, the source occurrence remains visible and is dimmed; its text does not change yet.
* **D4 — Pending move lifecycle.**
  * Kept during navigation within the current timeline: `j`/`k`, arrow keys, mouse selection, trackpad or wheel scrolling, moving to another day container, collapsing and expanding branches, and expanding gaps.
  * Canceled, with no change and no Undo entry, by: `Esc`, any text edit, Undo or Redo, leaving Agenda (`Cmd+P`), `Cmd+.` on a day or node, and any other transition that leaves the current Agenda presentation.
  * `p` or `P` on any row of a day — its day container or any node within it — moves the pending nodes to that day by replacing the source dates. The dimmed state disappears. The move is one undoable operation.
  * A destination inside a gap is reached by expanding the gap with `Cmd+E` and then using `p` on the revealed day.
* **D1 — Puts without a pending move.** A node-register `p`/`P` does nothing in Agenda. A text-register put works as ordinary text editing.

### 14. Undo/Redo

Text edits, date conversions, node creation, splitting, date moves, and group moves participate in Undo/Redo. Projection updates are effects of content changes, never separate history entries. Undoing a date deletion restores the occurrence; redoing removes it; undoing a group move reverts all affected dates in one step; undoing a split reverts the inherited date with it; undoing a conversion restores the original expression.

## Decisions Recorded During the Consistency Review

* **D1** — Deletion and registers in Agenda (§§10, 13).
* **D2** — Agenda works only with dated nodes; contextual ancestors are context only (§3). This also resolves the conflict between §10.6 of the earlier draft and Tree's `o` rule (`docs/PRODUCT.md` §20.2, where `o` on a node with children creates a first child): `o`/`O` no longer apply to contextual ancestors.
* **D3** — `Cmd+P` opens and closes Agenda; no Back command (§8).
* **D4** — Pending move lifecycle and `p` target (§13).
* **D5** — Visual selection skips non-qualifying rows (§12).

## Accepted Visual Decisions

Accepted by the Product Owner in AG-2 on 2026-10-09. All colors, the typeface, row geometry, bullets, and chevrons come from the existing Tree editor (`src/renderer/styles.css`); Agenda introduces no new surface, card, border, or badge.

* **V1 — Direction: days as section headers.** A day container is a compact header row: the day in small uppercase letters with slight letter spacing (`WED OCT 14`), in the secondary text color, followed by a thin horizontal rule to the right edge in the location-border color. A day with content has a disclosure chevron left of the label in the ordinary chevron column; an empty day has none and a lighter label weight. When the day container is selected, the ordinary selected-node focus dot appears in the bullet column of the header. The day's nodes start at the first outline level below the header.
  * **Today:** label and rule in the accent color (light: the warm amber of `--color-drop-marker`; dark: the Zenburn yellow `#f0dfaf`), with ` · TODAY` after the label.
  * **Gaps:** a row in the header column with a chevron, small secondary text such as `7 empty days · Sep 30 – Oct 6`, and a dashed rule to the right edge. An expanded gap points its chevron down and is followed by the revealed days as empty day headers and, when days remain, a smaller gap.
* **V2 — Date emphasis.** In node text, the date of the day being displayed is drawn in the accent color at semibold weight. Other recognized canonical dates in the same text use the secondary text color. Emphasis never changes the characters or makes a date an indivisible widget.
* **V3 — Contextual ancestors.** Drawn in the secondary text color at the ordinary size and row height, so the row rhythm matches Tree. In the dark appearance the secondary color replaces the depth color for ancestors; direct matches keep the Zenburn depth colors (`docs/PRODUCT.md` §20.5).
* **V4 — Live mirror.** A mirror occurrence shows its bullet as a hollow ring in the gutter color; its text is unchanged. The active occurrence shows the ordinary selected-node bullet and caret.
* **V5 — Pending move.** The source occurrence's text, bullet, and chevron are dimmed to about 38 % opacity, and the status bar shows a message such as `Moving 1 item · p puts it on the selected day · Esc cancels` next to the Vim mode indicator. This is the first use of the status bar for a transient message.

## Final Specification (AG-3)

Recorded on 2026-10-09 from the Product Owner's acceptance of F1–F7 and S1–S5. Awaiting the Product Owner's approval of this text. This section completes the Accepted Specification and Accepted Visual Decisions; where it is more precise, it governs.

### Resolved Open Items

* **F1 — Canonical format.** `YYYY-MM-DD`, final. It is locale-independent and sorts as text.
* **F2 — Today neighborhood.** The three calendar days before Today and the three after it are always shown as day containers, empty or not, within the current scope. Every other run of consecutive empty days is shown as a gap element (§7). *Agent decision (minor, reported):* a run of one or two empty days outside the neighborhood is shown as empty day headers rather than a gap, because a gap row would save at most one row. A run of three or more is a gap.
* **F3 — Year interpretation and popup lifecycle.** A month-day expression without a year (`Oct 22`) offers the nearest future occurrence first — the current year when that day is today or later, otherwise the next year — and the other interpretation (the previous year's or current year's occurrence, respectively) second. This follows the rule already accepted for weekday names: upcoming occurrence first, alternative second. The popup closes when the caret leaves the recognized expression, when the Vim mode changes, when the editor loses focus, and when a suggestion is accepted. After closing, it reopens only after the next edit inside an expression that again meets the confidence rule (§5).
* **F4 — Go to date.** Not part of Agenda. Scrolling and gap expansion are the only ways to reach a day. A future addition is a new capability and needs separate authorization.
* **F5 — Pinned day header.** None. Day headers scroll with the content like every other row; only the location toolbar stays fixed, as in Tree (`docs/PRODUCT.md` §2.2).
* **F6 — Date-like text indicator timing.** The wavy underline (S2) appears only when the caret is outside the date-like token or the node is not being edited. While the caret is inside or directly adjacent to the token, no underline is drawn, so intermediate typing states such as `2026-10-1` are never flagged.
* **F7 — Pending-move message.** `Moving 1 item · p to put · Esc to cancel`; for several items `Moving N items · p to put · Esc to cancel`.

### Confirmed State Treatments

* **S1 — Autocomplete popup:** a compact list anchored below the first character of the recognized expression, on the document surface, with a 1px border in the location-border color and a soft shadow. Each row shows the canonical date and a short secondary description (`2026-10-09  Fri · tomorrow`). The current suggestion uses the shared selection highlight pair. A one-line footer reads `Tab accept · ⌃N ⌃P`.
* **S2 — Text resembling a date:** a 1px wavy underline in a muted red (light `#b4554b`, dark `#cc9393`), with the timing in F6.
* **S3 — Temporarily invalid item:** changed from the AG-2 proposal. The item keeps the ordinary selected-node bullet, because it is always the active item (it disappears when the user leaves it) and a hollow bullet would be indistinguishable from a live mirror (V4). The hint `Add a date to keep this item in Agenda` appears in the status bar, in the same place as the pending-move message (V5), so the row height never changes. The two messages never coexist: any text edit cancels a pending move (D4), and only a text edit makes an item invalid.
* **S4 — Vim whole-node selection:** the shared selection highlight pair on qualifying rows only (D5); skipped rows keep their ordinary appearance.
* **S5 — Focused day:** the location path reads `Agenda / Oct 14`, and the day is shown as a non-editable current-parent heading (`Wed Oct 14`) above its hierarchy, without a day header.

### Derived Rules

These follow from accepted decisions and add no behavior; the Product Owner may revisit them.

* **Structural commands are no-ops in Agenda (§10).** `Tab` and `Shift+Tab` without an open popup, Vim `>` and `<`, and every other command that moves a node between parents or reorders siblings do nothing in Agenda. They leave focus, caret, mode, and text unchanged. `Tab` with an open popup accepts the suggestion (§5).
* **`Cmd+Enter` (strikethrough, `docs/PRODUCT.md` §2.5)** works on direct matches as in Tree and does nothing on contextual ancestors, day containers, and gaps (D2).
* **Gaps are not days.** On a gap, `Enter`, `o`, `O`, `p`, `P`, `dd`, `Cmd+.`, and `Backspace` do nothing; `Cmd+E` is the only gap command. `p`/`P` on a gap leave a pending move pending (D4).
* **Synthetic elements are never text-editable.** Day containers, gaps, and the focused-day heading accept no text input; printable keys on them do nothing in standard editing, and Vim `i`/`a`/`R` do not enter Insert or Replace on them.

### Command Matrix

Rows are the selected element. "Tree" means the behavior in `docs/PRODUCT.md` applies unchanged.

| Command | Day container | Gap | Direct match | Contextual ancestor |
| --- | --- | --- | --- | --- |
| `↑` `↓` `j` `k` | Moves between visible rows of the timeline (or of the focused day) | Same | Same | Same |
| `Cmd+E` | Toggles the day's fold | Reveals up to seven days, or collapses the gap when it is expanded (§7) | Toggles the node's fold (Tree) | Toggles the node's fold (Tree) |
| `Enter` (standard) | Creates a dated node for that day (§9) | Nothing | Splits; the new node inherits the day's date (§9) | Nothing |
| `Enter` (Vim Normal) | Nothing | Nothing | Tree | Nothing |
| `o` / `O` (Vim Normal) | New node for that day / the preceding day, at the end of the scope (§9) | Nothing | New sibling after / before, with the day's date (§9) | Nothing |
| `Backspace` on an empty node | — | — | Deletes it when it has no children; otherwise nothing (D1) | — |
| `Cmd+Backspace` | Nothing | Nothing | Nothing | Nothing |
| `Cmd+Enter` | Nothing | Nothing | Toggles strikethrough (Tree) | Nothing |
| `dd` (Vim Normal) | Nothing | Nothing | Starts a pending move of this occurrence (§13) | Nothing |
| `p` / `P` with a pending move | Moves the pending items to that day | Nothing; the move stays pending | Moves to this row's day | Moves to this row's day |
| `p` / `P` without a pending move | Nothing (node register) | Nothing | Text-register put as text editing; node register nothing (D1) | Nothing |
| `Cmd+.` | Opens the focused day | Nothing | Opens Tree at that node as current parent | Opens Tree at that node as current parent |
| `Cmd+,` | Returns from the focused day to the timeline (focused day only) | — | Same | Same |
| `Cmd+P` | Closes Agenda and returns to the originating Tree location | Same | Same | Same |
| `Tab` / `Shift+Tab`, `>` / `<` | Nothing | Nothing | Nothing (popup open: `Tab` accepts) | Nothing |

### State Descriptions

Each element is in exactly one presentation state for each independent axis below; the visual treatment is in the Visual Contracts.

* **Day container:** {with content, empty} × {expanded, collapsed} × {selected, not selected} × {Today, other day}. An empty day has no chevron and therefore no collapsed state. A day whose only matches are inside collapsed branches counts as with content.
* **Gap:** {collapsed, expanded} × {selected, not selected}. An expanded gap is followed by the revealed day containers and, when days remain, a smaller collapsed gap.
* **Real node row:** role {direct match, contextual ancestor} × occurrence {active, live mirror, not edited} × {pending move source, not} × {temporarily invalid, valid}. Only a direct match can be a pending source; only the active occurrence can be temporarily invalid; a mirror is never active.
* **Editing:** standard editing, or Vim {Normal, Insert, Replace, Visual, Visual Node}. Visual Node selection includes only qualifying rows (D5).
* **Popup:** {closed, open with N ≥ 1 suggestions, current suggestion index}.
* **Presentation:** {timeline, focused day `D`}. The timeline keeps its scroll position, selection, and collapse state while a focused day is open, and restores them on `Cmd+,`.
* **Pending move:** {none, pending with source occurrences}. Lifecycle per D4.
* **Status bar message:** {none, pending-move message (F7), invalid-item hint (S3)}; at most one at a time.

### Visual Contracts

All tokens come from `src/renderer/styles.css`; no new surface, card, border, badge, or animation. Each contract holds in light and dark appearances unless stated otherwise.

* **VC1 — Day header geometry.** The disclosure chevron sits in the Tree chevron column, the selected-day focus dot in the Tree bullet column, and the label starts in the Tree text column of the same level. The first node level of the day starts one outline level deeper than the header. The header row has the ordinary row height. The rule starts after the label with the ordinary label gap and ends at the content's right edge.
* **VC2 — Day header type.** Label in small uppercase with slight letter spacing (`WED OCT 14`), in the secondary text color; an empty day uses a lighter weight and has no chevron. The rule is 1px in the location-border color.
* **VC3 — Today.** Label and rule in the accent color (light `--color-drop-marker` amber, dark `#f0dfaf`), label followed by ` · TODAY`. Today is the initial scroll target when Agenda opens.
* **VC4 — Gap.** A row in the header column with a chevron, small secondary text `N empty days · Sep 30 – Oct 6`, and a 1px dashed rule in the location-border color to the right edge. The chevron points down when the gap is expanded.
* **VC5 — Date emphasis.** The displayed day's date in node text is in the accent color at semibold weight; other recognized canonical dates use the secondary text color. Characters, caret positions, and selection behavior are identical to unemphasized text.
* **VC6 — Contextual ancestor.** Secondary text color, ordinary size and row height; in dark, the secondary color replaces the depth color. Direct matches keep their Tree colors, including Zenburn depth colors.
* **VC7 — Live mirror.** The bullet is a hollow ring in the gutter color; text unchanged. The active occurrence shows the ordinary selected-node bullet and caret.
* **VC8 — Pending source.** Text, bullet, and chevron at about 38 % opacity; the status bar shows the F7 message to the right of the Vim mode indicator.
* **VC9 — Popup (S1).** Its left edge aligns with the first character of the recognized expression, and its top edge is directly below that row. It never covers the row being edited.
* **VC10 — Date-like underline (S2, F6).**
* **VC11 — Invalid item (S3).** Ordinary selected bullet; no row-height change; status-bar hint.
* **VC12 — Vim selection (S4).** Selection highlight pair on qualifying rows only.
* **VC13 — Focused day (S5).** Location path `Agenda / Oct 14`; non-editable heading `Wed Oct 14` in the current-parent heading position; no day header.
* **VC14 — No flashes.** Opening and closing Agenda, entering and leaving a focused day, and timeline restructuring show no contrasting flash and no animation (`docs/PRODUCT.md` §20.5).

### End-to-End Scenarios

Each scenario runs in the real Electron application with a synthetic document. Dates are relative to a fixed test clock set to Thursday 2026-10-08.

1. **Open and close.** From Root, `Cmd+P` opens Agenda at Today; `Cmd+P` returns to Root with the previous selection. Repeat from `Work / Team A`: Agenda shows only that subtree, without `Work` and `Team A` rows.
2. **Hierarchy and full text.** A node `2026-10-14 Prepare rollout` under `Work / Team A / Release` appears under `WED OCT 14` with its ancestors as contextual rows and its full text, the date emphasized.
3. **Compressed timeline.** Days 2026-10-05 to 2026-10-11 are shown; a run of 11 empty days becomes `11 empty days · …`; a run of two empty days is two headers. `Cmd+E` on the gap reveals seven days and a smaller gap; `Cmd+E` on the original gap collapses the region again.
4. **Typing a date.** Typing `2026-10-1` shows no Agenda change and no underline while the caret stays in the token; typing `5` makes the node appear under Oct 15 without moving focus or scroll. Typing `2026-02-31` and moving the caret away shows the wavy underline and no Agenda entry.
5. **Natural-language completion.** In standard editing and in Vim Insert: typing `tomor` opens the popup with one suggestion; `Tab` replaces only `tomorrow` with `2026-10-09`; one `Cmd+Z` restores `tomorrow` without reopening the popup. `Friday` offers 2026-10-09 first and 2026-10-16 second; `Ctrl+N`/`Ctrl+P` move between them. `Esc` in Vim Insert enters Normal and closes the popup with the text unchanged. `t`, `to`, `mar` open nothing. Pasting `next Friday` converts nothing.
6. **Live occurrences.** A node with dates Oct 14 and Oct 20 appears under both days; editing under Oct 14 updates the Oct 20 mirror immediately, the mirror shows a hollow ring, and focus and scroll stay. Deleting the Oct 14 date moves the active occurrence to Oct 20 with caret and mode kept.
7. **Removing the last date.** The item stays with the status-bar hint; Vim `Esc` to Normal keeps it; moving to another row removes it from Agenda; `Cmd+Z` restores the date and the occurrence without stealing focus.
8. **Creating nodes.** `Enter` on a day container (standard) and `o` (Vim) create `2026-10-14 ` as the last child of the scope with the caret after the space, in Insert for Vim; `O` creates a node for Oct 13, revealing it from a gap when needed. `Enter` inside `2026-10-14 Prepare| release` splits into `2026-10-14 Prepare` and `2026-10-14 release`; one Undo restores the original node.
9. **Structural restrictions.** `Tab`, `Shift+Tab`, `>`, `<`, `Cmd+Backspace`, and `o`/`Enter` on a contextual ancestor change nothing. `Backspace` in an empty childless created node deletes it; with children it does nothing.
10. **Moving occurrences.** Dragging `2026-10-14 Prepare 2026-10-20` onto Oct 15 yields `2026-10-15 Prepare 2026-10-20` with parent and order unchanged; dragging onto a day already present in the text removes the duplicate and activates that occurrence. Contextual ancestors cannot be dragged. Undo restores the dates.
11. **Pending move.** `dd` dims the occurrence and shows the F7 message; `j`/`k`, scrolling, collapsing, and `Cmd+E` on a gap keep it; `p` on any row of Oct 16 moves it in one Undo step. `Esc`, a text edit, Undo, `Cmd+P`, and `Cmd+.` cancel it with no Undo entry. The system clipboard and Vim register are unchanged.
12. **Group move.** Whole-node Visual selection over three direct matches at one level, with a contextual ancestor between them, highlights only the three; moving them to another day replaces only the source dates in one Undo step.
13. **Focused day.** `Cmd+.` on Oct 14 shows `Agenda / Oct 14` and only that day; `j`/`k` stop at its edges. `Cmd+,` restores the timeline's scroll, selection, and collapse state.
14. **Navigation to Tree.** `Cmd+.` on a direct match and on a contextual ancestor opens Tree with that node as current parent; `Cmd+P` there opens that node's Agenda at Today.
15. **Persistence and isolation.** Agenda collapse state does not change Tree expansion; all edits made in Agenda persist across a restart exactly as Tree edits do.
16. **Visual regression.** Screenshots in light and dark for: a timeline with Today, a collapsed and a partly expanded gap, a direct match with emphasized and secondary dates, contextual ancestors, an active occurrence with a mirror, a pending source with the status message, the open popup, the date-like underline, an invalid item, Vim whole-node selection with a skipped row, and a focused day.

### Acceptance Criteria

* Every rule in the Accepted Specification, the Final Specification, and the Command Matrix is covered by at least one automated test; rules crossing the renderer, persistence, clipboard, or drag-and-drop boundaries also by an end-to-end scenario above (`AGENTS.md` §9).
* Date recognition, natural-language parsing, projection (scope, hierarchy, compressed timeline), occurrence selection after date removal, and date replacement for moves are domain logic with unit tests and no React or Electron dependency (`AGENTS.md` §7). Projection and move transforms have property tests for: every direct match appears under each of its days; ancestors preserve tree order; a move changes only the moved dates; Undo of any Agenda edit restores the previous document.
* Geometry assertions in the real renderer cover VC1 and VC9; the screenshots in scenario 16 are inspected and committed as synthetic baselines.
* The `Cmd+P` deviation from Apple's Print shortcut is recorded next to the requirement in `docs/PRODUCT.md` (D3); no other unrecorded Human Interface Guidelines conflict exists.
* Performance (`docs/PRODUCT.md` §22): opening Agenda, a keystroke that changes date recognition, and a group move stay within the interactive budgets on the large-document performance fixture; Agenda adds no disk write beyond the ordinary document and view-state saves.
* Tree behavior is unchanged; the existing Tree test suites pass without modification.

## Visual Direction

The existing application uses JetBrains Mono, a warm paper-like light theme, a dark theme, minimal chrome, restrained hierarchy, and no decorative animation. Agenda must feel calm, fast, native to macOS, minimal, and consistent with the Tree editor. Avoid cards, borders, badges, toolbars, panels, modals, heavy date chips, and animations.

AG-2 covered these areas: canonical date highlighting; invalid date indication; autocomplete popup; day containers; Today; focused day; contextual ancestor versus direct match; active occurrence versus live mirror; temporarily invalid item; collapsed and partially expanded gaps; Vim whole-node selection; pending move; light and dark variants. Directions considered and not chosen: day labels in a left margin column, and days as outline rows with a square bullet.

## Resume Prompt

> Continue the Agenda initiative in `plans/agenda.md`. If I have approved the Final Specification, mark AG-3 Done and run AG-4 with the planner role: add ordered, small, testable implementation tasks to this plan, each naming files, acceptance evidence, and validation tier. Do not change runtime code.
