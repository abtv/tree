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
* Reserved for the Product Owner: every item under Open Items, approval of the final specification, and authorization of implementation.

## Tasks

| ID | Outcome | Depends on | Acceptance evidence | Status |
| --- | --- | --- | --- | --- |
| AG-1 | UX consistency review completed and recorded | — | This plan with the accepted specification and decisions D1–D5 | Done |
| AG-2 | Visual design discovery: a small number of substantially different directions, then one accepted visual system | AG-1 | Accepted visual decisions recorded in this plan; Product Owner accepted the direction | Done |
| AG-3 | Final product/UX specification: resolve Open Items, add visual contracts, state descriptions, end-to-end scenarios, and acceptance criteria | AG-2 | Final specification recorded in this plan and approved by the Product Owner | Ready |
| AG-4 | Implementation planning: ordered, small, testable tasks added to this plan by the planner role | AG-3 | Task table extended with implementation tasks, each naming files, acceptance evidence, and validation tier | Planned |

Task details:

* **AG-2.** Files: `plans/agenda.md`. Mockups, if any, are produced outside the repository or as artifacts and contain only synthetic data. Validation tier: Minimal Risk. Cover the areas listed under Visual Direction. Use real-looking hierarchical examples, not flattened task lists. Keep the Agenda recognizably an outliner. Discuss major visual decisions with the Product Owner before finalizing them.
* **AG-3.** Files: `plans/agenda.md`. Validation tier: Minimal Risk. Separate accepted behavior from implementation choices; include no speculative features. Turn the Accepted Visual Decisions and the proposed state treatments into visual contracts, and ask the Product Owner to confirm the proposed treatments.
* **AG-4.** Files: `plans/agenda.md`. Validation tier: Minimal Risk. May inspect the repository and architecture. Each implementation task updates `docs/PRODUCT.md` for the behavior it implements.

**Next task:** AG-3.

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
* Working canonical format: `YYYY-MM-DD` (not yet final).
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

Proposed state treatments shown in AG-2 and not yet confirmed; AG-3 confirms or changes them:

* **Autocomplete popup:** a compact list anchored below the first column of the recognized expression, on the document surface with a 1px border in the location-border color and a soft shadow; each row shows the canonical date and a short secondary description (`2026-10-09  Fri · tomorrow`); the current suggestion uses the shared selection highlight pair; a one-line footer `Tab accept · ⌃N ⌃P`.
* **Text resembling a date:** a 1px wavy underline in a muted red (light `#b4554b`, dark `#cc9393`), like a spell-check mark.
* **Temporarily invalid item:** a hollow bullet and a one-line secondary hint below the text, `Add a date to keep this item in Agenda`.
* **Vim whole-node selection:** the shared selection highlight pair on qualifying rows only; skipped rows keep their ordinary appearance.
* **Focused day:** the location path reads `Agenda / Oct 14`, and the day is shown as the current-parent heading (`Wed Oct 14`) above its hierarchy, without a day header.

## Open Items

Each needs a Product Owner decision in AG-3. None blocks the visual direction.

* Final canonical date format (working candidate `YYYY-MM-DD`).
* Number of empty days shown around Today.
* Ordering of year interpretations for expressions such as `Oct 22`, and remaining popup lifecycle details.
* Whether a compact Go to date control exists, and its behavior.
* Whether the header of the day at the top of the content area stays pinned while scrolling. Direction C mentioned it as possible; it is additional behavior with no Tree counterpart and was not accepted.
* Whether the wavy underline appears while the caret is still inside the text, or only after the caret leaves it.
* Final wording of the pending-move status message.

## Visual Direction

The existing application uses JetBrains Mono, a warm paper-like light theme, a dark theme, minimal chrome, restrained hierarchy, and no decorative animation. Agenda must feel calm, fast, native to macOS, minimal, and consistent with the Tree editor. Avoid cards, borders, badges, toolbars, panels, modals, heavy date chips, and animations.

AG-2 covered these areas: canonical date highlighting; invalid date indication; autocomplete popup; day containers; Today; focused day; contextual ancestor versus direct match; active occurrence versus live mirror; temporarily invalid item; collapsed and partially expanded gaps; Vim whole-node selection; pending move; light and dark variants. Directions considered and not chosen: day labels in a left margin column, and days as outline rows with a square bullet.

## Resume Prompt

> Continue the Agenda initiative in `plans/agenda.md` with task AG-3, the final product/UX specification. Treat the Accepted Specification and Accepted Visual Decisions as binding. Put every Open Item and the proposed state treatments to me in one exchange, then record the final specification with visual contracts, state descriptions, end-to-end scenarios, and acceptance criteria. Do not change runtime code.
