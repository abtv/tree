# Agenda

## Objective

Add an **Agenda**: a temporal projection of the existing tree that arranges nodes containing dates by calendar day, lets the user edit the same nodes there, and navigates between Agenda and Tree.

The work proceeded through four design stages — UX consistency review, visual design discovery, final product/UX specification, and implementation planning — and continues with the implementation tasks AG-5 to AG-28. This plan records the accepted specification, the visual decisions, and the implementation plan, so later sessions start from repository state.

## Scope and Sources of Truth

* This plan is a coordination record, not a product requirement. `docs/PRODUCT.md` remains the source of truth for implemented behavior; Agenda behavior enters it only together with its implementation and tests (`AGENTS.md` §§5, 9).
* The accepted behavior below is binding for the later stages unless the Product Owner changes it.
* Out of scope: task semantics (deadlines, overdue, priority, status, automatic rescheduling), time-of-day semantics, a calendar grid, and cloud services.
* Implementation details — storage, data structures, libraries, list virtualization — are decided during implementation planning, not in the design stages.

## Authorization State

* Authorized: recording this specification (AG-1) and running visual design discovery (AG-2) as a discussion that changes no runtime code. The Product Owner accepted the visual direction and decisions V1–V5 on 2026-10-09.
* AG-3: the Product Owner accepted resolutions F1–F7 and the state treatments S1–S5 on 2026-10-09; the Final Specification below records them.
* AG-3 is complete: the Product Owner approved the Final Specification on 2026-10-09 and authorized AG-4 (implementation planning).
* AG-4 is complete: tasks AG-5 to AG-28 were planned on 2026-10-09 and no runtime code changed.
* The Product Owner answered Q1–Q5 on 2026-10-09 (Implementation Planning (AG-4) below).
* The Product Owner authorized Agenda implementation on 2026-10-09 with “start agenda”. Implementation proceeds in task order.
* Reserved for the Product Owner: approval of the AG-22 expression table before AG-23.

## Tasks

| ID | Outcome | Depends on | Acceptance evidence | Status |
| --- | --- | --- | --- | --- |
| AG-1 | UX consistency review completed and recorded | — | This plan with the accepted specification and decisions D1–D5 | Done |
| AG-2 | Visual design discovery: a small number of substantially different directions, then one accepted visual system | AG-1 | Accepted visual decisions recorded in this plan; Product Owner accepted the direction | Done |
| AG-3 | Final product/UX specification: resolve Open Items, add visual contracts, state descriptions, end-to-end scenarios, and acceptance criteria | AG-2 | Final specification recorded in this plan and approved by the Product Owner | Done |
| AG-4 | Implementation planning: ordered, small, testable tasks added to this plan by the planner role | AG-3 | Task table extended with implementation tasks, each naming files, acceptance evidence, and validation tier | Done |
| AG-5 | Calendar date value and canonical `YYYY-MM-DD` recognition in the domain | AG-4, authorization | Unit and property tests, mutation, `npm run check` | Done |
| AG-6 | Agenda projection in the domain: scope, hierarchy, occurrences, per-node memo | AG-5 | Unit and property tests (spec examples, every match under each day, ancestor order, one-edit rescan proportional to depth), mutation | Done |
| AG-7 | Compressed timeline in the domain: Today neighborhood, gaps, reveal | AG-5 | Unit and property tests (scenario 3 numbers, every day shown once, no gap shorter than three days, reveal at most seven), mutation | Done |
| AG-8 | Date edit transforms in the domain: move, new-node text, split inheritance, nearest remaining day | AG-5 | Unit and property tests (every §9 and §11 example, a move changes only moved dates, links keep covered text), mutation | Done |
| AG-9 | Agenda view state in `EditorStore` (open, close, rows, selection, folds, reveal) without UI; new ADR | AG-6, AG-7 | Unit and property tests, no persisted leakage, performance assessment and guard, `npm run check:full`, independent review | Done |
| AG-10 | `Cmd+P` opens and closes a read-only Agenda timeline (headers, Today, collapsed gaps, hierarchy, full text, `Cmd+.` to Tree) | AG-9 | E2E scenarios 1, 2, 3 (without expansion), 14, 15 (isolation); VC1 geometry; light and dark screenshots; review and product verifier | Done |
| AG-11 | Folding and gap expansion (`Cmd+E`, chevrons), independent of Tree | AG-10 | Unit tests, E2E scenario 3 remainder and 15, chevron geometry, screenshots | Done |
| AG-12 | Windowed Agenda list and large-document performance guard | AG-10 | Component tests (bounded mounted rows), `perf/agenda.spec.ts`, `npm run check:full`, review | Done |
| AG-13 | Active occurrence, last-date state, and Agenda-aware Undo/Redo in the store | AG-8, AG-9 | Unit and property tests (Undo restores the previous document, selection valid, presentation unchanged), performance check, review | Ready |
| AG-14 | Edit dated nodes in place with structural restrictions (D1, D2, Command Matrix) | AG-10, AG-13 | E2E scenarios 4 (without underline), 9, 15, clipboard; key-policy tests; emphasis screenshots; review and product verifier | Planned |
| AG-15 | Live occurrences: mirrors, active switching, invalid last-date item with status hint | AG-14 | E2E scenarios 6 and 7; VC7 and VC11 screenshots; focus and scroll stability assertions | Planned |
| AG-16 | Create dated nodes from a day container (`Enter`, `o`, `O`) | AG-8, AG-15 | E2E scenario 8 first half; unit and property tests (one node appended, one history entry) | Planned |
| AG-17 | Split a dated node with date inheritance; `o`/`O` on dated nodes | AG-16 | E2E scenario 8 second half; one-Undo test | Planned |
| AG-18 | Move occurrences between days by mouse drag (single and group store operation) | AG-8, AG-15 | E2E scenario 10 with a real drag; property test (a move changes only moved dates, Undo restores); drop screenshot | Planned |
| AG-19 | Vim pending move: `dd`, counted `dd`, `p`/`P`, cancel rules, dimming, status message | AG-18 | E2E scenario 11; D4 lifecycle table test; VC8 screenshot; `docs/VIM_CONFORMANCE.md` rows | Planned |
| AG-20 | Vim whole-node Visual selection and group move | AG-19 | E2E scenario 12; selection-skip property test; VC12 screenshot | Planned |
| AG-21 | Focused day: `Cmd+.` on a day, `Cmd+,` back, `Agenda / Oct 14` heading | AG-11, AG-14 | E2E scenario 13; VC13 screenshot; VC14 observed | Planned |
| AG-22 | Natural-language date parser in the domain, with the expression table for Product Owner review | AG-5 | Table-driven unit tests from §5, property tests, mutation, Product Owner approves the table (Q2) | Planned |
| AG-23 | Natural-language completion popup (S1, VC9, F3) in standard editing and Vim Insert | AG-14, AG-22 | E2E scenario 5; VC9 geometry; S1 screenshot; lifecycle tests; manual native-keyboard check | Planned |
| AG-24 | Date-like text indicator (S2, F6, VC10) | AG-14 | E2E scenario 4 underline; screenshots; resemblance-rule tests | Planned |
| AG-25 | Command Matrix conformance test and completion of visual regression (scenario 16) | AG-10 to AG-24 | Every Command Matrix and Derived Rule cell asserted; every scenario 16 state inspected in light and dark; `npm run check:requirements` | Planned |
| AG-26 | Performance guards for the edit and group-move paths | AG-12, AG-14, AG-20 | `perf/agenda.spec.ts` scenarios against a same-machine baseline; save-count assertion | Planned |
| AG-27 | Agenda in the README screenshots (Q4) | AG-25 | Updated capture script; `npm run screenshots:readme` output inspected in light and dark | Planned |
| AG-28 | Close the initiative: verify documentation, extract knowledge, remove this plan and its index row | AG-26, AG-27, Product Owner confirmation | `npm run check:docs`; removal commit | Planned |

Task details:

* **AG-2.** Files: `plans/agenda.md`. Mockups, if any, are produced outside the repository or as artifacts and contain only synthetic data. Validation tier: Minimal Risk. Cover the areas listed under Visual Direction. Use real-looking hierarchical examples, not flattened task lists. Keep the Agenda recognizably an outliner. Discuss major visual decisions with the Product Owner before finalizing them.
* **AG-3.** Files: `plans/agenda.md`. Validation tier: Minimal Risk. Separate accepted behavior from implementation choices; include no speculative features. Turn the Accepted Visual Decisions and the proposed state treatments into visual contracts, and ask the Product Owner to confirm the proposed treatments.
* **AG-4.** Files: `plans/agenda.md`. Validation tier: Minimal Risk. May inspect the repository and architecture. Each implementation task updates `docs/PRODUCT.md` for the behavior it implements.

Conventions for AG-5 to AG-28: tier names are those of `docs/DEVELOPMENT.md` §9. "Review" means an independent reviewer and "Verify" a separate product verifier (`AGENTS.md` §13); a user-visible task without "Verify" still gets product verification by the primary agent. "WP" means `WORKING_PLAN.md` is required, including the navigation and caret inventory of `AGENTS.md` §9. "Mutation" means `npm run test:mutation -- --mutate <changed files>` with survivors read (`docs/DEVELOPMENT.md` §12). Commit scope is `agenda`. E2E specs declare `// @editing-modes: both`, or `vim` for Vim-only behavior. Existing Tree suites pass unmodified; only the store double and the command-inventory test change by necessity, and AG-23 and AG-24 may update Tree tests for the Tree behavior Q1 adds. Product requirements go into a new `docs/PRODUCT.md` §23 Agenda, whose leaf sections are written by the task that implements them, with `@requirement PRODUCT.md §23.n` markers in tests. Codes C*, Q*, and m* refer to Implementation Planning (AG-4) below.

* **AG-5.** Files (new): `src/domain/calendar-date.ts`, `src/domain/date-recognition.ts`, each with `.test.ts` and `.property.test.ts`. Content: `DayNumber` (integer days since 1970-01-01, proleptic Gregorian, integer arithmetic, no `Date`), `CalendarDate`, `isValidCalendarDate`, `dayNumberOf`, `calendarDateOf`, `weekdayOf` (Monday first), `formatCanonicalDate`, `findCanonicalDates(text, excludedRanges?)` returning `{ start, end, day }[]`. Implements F1, §4 recognition, m2, m3. PRODUCT.md: none (no observable behavior yet). Evidence: unit (`2026-10-14` valid, `2026-10-1` and `2026-02-31` not, leap days, 2026-10-08 is Thursday); property (format/parse round trip, day-number inverse, weekday agrees with `Date.UTC` in the test only, tokens are exactly the valid canonical substrings, never overlap, never touch a digit, never fall in an excluded range); mutation. Tier: Low Risk (`npm run check`). PO: none.
* **AG-6.** Files (new): `src/domain/agenda-projection.ts` with unit and property tests. Content: `projectAgenda(document, scopeParentId)` returns days in ascending order, each a preorder list of `{ nodeId, depth, role: 'match' | 'context' }`; scope is the current parent's descendants or all roots at Root (m1); hyperlink ranges are excluded; only branches leading to a match are kept; sibling order is preserved; the per-node date summary is memoized in a `WeakMap` keyed by `TreeNode`. Implements §2, §3, §6 first bullet. PRODUCT.md: none. Evidence: unit (both §2 examples, the Release/Prepare example, scope excludes `Work` and `Team A`, impossible and in-link dates ignored); property (every direct match under each of its days, ancestors are exactly the proper ancestors below the scope in tree order, one text edit re-derives only its root path); mutation. Tier: Low Risk. PO: none.
* **AG-7.** Files (new): `src/domain/agenda-timeline.ts` with tests. Content: `buildTimeline({ contentDays, today, revealed })` returns day entries `{ kind: 'day', day, content, isToday }` and gap entries `{ kind: 'gap', startDay, endDay, count, expanded }`; Today neighborhood per F2; runs of one or two empty days are day entries, longer runs are gaps; `revealNext` reveals at most seven days from the gap start; `collapseGap` clears that gap's revealed days (m5). Implements §7, F2, the V1/VC4 content model. PRODUCT.md: none. Evidence: unit with Today 2026-10-08 (Oct 5–11 shown, an 11-day gap, two empty days as two headers, reveal leaves a gap of 4); property (every date in range appears once as a day or inside one gap, neighborhood always present, no short gap outside it, reveal then collapse restores, new content splits at most one gap and keeps revealed days); mutation. Tier: Low Risk. PO: none.
* **AG-8.** Files (new): `src/domain/agenda-date-edits.ts` with tests; consumes `LinkedTextEdit` and `replaceLinkedTextRanges` from `src/domain/document-links.ts`. Content: `moveDayEdits(text, links, sourceDay, targetDay)` (m4), `newDatedNodeText(day)`, `splitDatePrefix(rightText, day)` (m17), `nextActiveDay(remainingDays, previousActive)` (nearest, earlier on a tie, undefined when none). Implements §6 bullets 3–4, §9 text forms, §11 examples, the §12 group transform. PRODUCT.md: none. Evidence: unit for every §9 and §11 example; property (a move changes only moved or duplicate tokens, resulting days equal previous days minus source plus target, links outside the edits keep their text, `nextActiveDay` minimizes distance); mutation. Tier: Low Risk. PO: none.
* **AG-9.** Files: new `src/application/agenda-state.ts`, `src/application/agenda-rows.ts` (rows from projection, timeline, and fold state, memoized like `visible-rows.ts`), their tests, `src/application/editor-store-agenda.test.ts`, `src/application/editor-store-agenda.property.test.ts`, a new ADR in `docs/decisions/` with the next free number, titled "Agenda derived projection and runtime view state"; modify `src/application/editor-store-types.ts` (optional `agenda` on the ready snapshot, optional `EditorServices.today`), `src/application/editor-runtime-state.ts` (reconcile call in `replaceReady`, identity until AG-13), `src/application/editor-store.ts` (`openAgenda`, `closeAgenda`, `applyAgenda`, `getAgendaRows`), `src/renderer/test/editor-store-double.ts`, `src/application/editor-store-command-inventory.test.ts`, `src/infrastructure/renderer/electron-services.ts`, `src/renderer/main.tsx`, `docs/decisions/README.md`, `docs/ARCHITECTURE.md` (runtime state, persistence unchanged, modules, performance assessment), `vitest.config.ts`. Content: open records the origin location and cursor, scope, and Today (m6) and selects Today's container (m7); close restores the origin selection and never changes `currentParentId`; real-row selection writes `location.selectedNodeId` and focus in one `replaceReady`; day, gap, and fold toggles are independent of Tree expansion and mark no persisted change. Evidence: unit (scope from Root and from a nested location, open/close round trip, Tree expansion unchanged, serialized state identical across open, close, and fold, save count unchanged); property (Agenda commands never alter the document, selection always names an existing row, rows equal projection composed with timeline); counter guard on row identity for a keystroke that changes no date; mutation. Tier: High Risk (`npm run check:full`, same-machine performance comparison). Review, WP. PO: none.
* **AG-10.** Files: new `src/renderer/AgendaView.tsx`, `src/renderer/AgendaRow.tsx` (day, gap, and node variants), `src/renderer/AgendaLocationBar.tsx`, `src/renderer/agenda-labels.ts`, `src/renderer/agenda-row-keyboard.ts` (arrows, `j`/`k` with counts, `Cmd+P`, `Cmd+.`, `Esc` on non-input rows), their tests, `e2e/agenda-view.spec.ts` with snapshots; modify `src/renderer/App.tsx` (render Agenda when `state.agenda` is set; disable `useScrollRestoration` while Agenda is open), `src/renderer/editor-input-handlers.ts` (`Cmd+P` branch beside `Cmd+.`), `src/renderer/use-node-input-bindings.ts` (expose `vimTextCommandState`), `src/renderer/styles.css` (shared gutter geometry through grouped selectors or custom properties; class `agenda-row`, never `.node-row`), `e2e/fixtures.ts` (`setAgendaToday` via the page clock), `docs/PRODUCT.md` (§23 heading; Opening and Closing, Projection and Dates in Text, Timeline, Navigation, with the D3 Print-shortcut deviation next to the requirement), `docs/ARCHITECTURE.md` §8, `docs/DEVELOPMENT.md` (clock helper), `scripts/check-requirement-coverage.mjs` if needed. Implements D3, §2, §3 rows, §7 days, Today and collapsed gaps, §8 open/close and `Cmd+.` on real rows, F5, VC1–VC4, VC6, VC5 as plain spans, m7–m10. Evidence: E2E scenarios 1, 2, 3 (without expansion), 14, 15 (persisted view unchanged, no extra files); VC1 geometry; light and dark screenshots; VC14 observed in a visible window; full `npm run test:e2e`. Tier: Moderate Risk. Review, Verify, WP (inventory of input-hook effects that assume a focused input). PO: none (Q5 confirmed). If the diff outgrows one session, split rows from headers and record the split here before the first commit.
* **AG-11.** Files: `src/renderer/AgendaRow.tsx`, `src/renderer/agenda-row-keyboard.ts` (`Cmd+E`, `za`), `src/application/agenda-state.ts`, `src/renderer/styles.css`, `e2e/agenda-view.spec.ts`, `docs/PRODUCT.md` (Folding and Gaps). Implements §7 collapse and gaps, the `Cmd+E` matrix row, VC1 chevron column, VC4, m5, m11. Evidence: unit (a day whose matches are in collapsed branches stays non-empty); E2E scenario 3 remainder and 15 (persisted Tree expansion unchanged); chevron geometry; screenshots of collapsed and partly expanded gaps. Tier: Moderate Risk. PO: none.
* **AG-12.** Files: new `src/renderer/agenda-list-layout.ts` with tests, `perf/agenda.spec.ts`; modify `src/renderer/node-list-layout.ts` (key-based `buildLayout`/`pruneHeights`, Tree behavior unchanged), `src/renderer/AgendaView.tsx`, `perf/fixtures.ts` (dated large seed), `docs/PRODUCT.md` (refers to §20.1), `docs/ARCHITECTURE.md` §8. Evidence: mounted rows stay bounded above the windowing threshold and the selected row stays mounted; performance scenario for open, scroll, and `j`/`k` on the large fixture against a same-machine baseline, with no extra saves. Tier: High Risk (`npm run check:full`). Review. PO: none.
* **AG-13.** Files: new `src/application/agenda-reconcile.ts` with tests; modify `src/application/agenda-state.ts`, `src/application/editor-runtime-state.ts`, `src/application/editor-store.ts`, the AG-9 store tests, `docs/ARCHITECTURE.md` §11. Content: the active occurrence is (node, day); on every document change `reconcileAgenda` applies `nextActiveDay`; the last-date case pins the item (m13); Undo/Redo pass an always-visible predicate to `changeSiteFocus` so `currentParentId` never changes, and select per m12; Agenda closes when its scope root no longer exists; mutating commands stay rejected while persistence is locked; the step short-circuits when `agenda` is undefined. Implements §6 bullets 3–6, §14. Evidence: property (Undo of any Agenda edit restores the previous document, Redo reapplies, selection valid, `currentParentId` and presentation unchanged); unit (active date removal moves to the nearest day, last-date removal pins, Undo restores the occurrence); Tree typing performance scenarios unchanged (`npm run test:perf`); mutation. Tier: Moderate Risk. Review, WP. PO: none.
* **AG-14.** Files: new `src/renderer/agenda-key-policy.ts` (pure table for the Command Matrix and Derived Rules) with test, `e2e/agenda-editing.spec.ts`; modify `src/renderer/AgendaRow.tsx` and `AgendaView.tsx` (a direct match renders `NodeInput` when it is the only or the active occurrence), `src/renderer/NodeInput.tsx` and `src/renderer/editor-dom.ts` (decoration ranges in the rich-text path; selectors also match `.agenda-row`), `src/renderer/use-node-input-bindings.ts` (reveal selector; one owner transition that restores focus, caret, selection, and mode when the active row remounts under another day), `src/renderer/editor-input-handlers.ts` (Agenda policy consulted before Tab, Backspace, `Cmd+,`, `Cmd+Backspace`, `Cmd+E`), `src/renderer/vim-keyboard-handler.ts` (interception call sites only), `docs/PRODUCT.md` (Editing in Agenda, Structural Restrictions, Undo and Redo), `docs/VIM_CONFORMANCE.md`, `docs/ARCHITECTURE.md` §8, `scripts/check-requirement-coverage.mjs`, `stryker.config.mjs` and `docs/DEVELOPMENT.md` §12 if the key policy is a pure renderer module. Implements D1, D2, §4 live recognition, §10, §11 ordinary Cut and Paste, the Derived Rules, the matrix rows for direct matches and contextual ancestors, m14, m15, Q3 (text, motion, fold, and structural command groups). Until their tasks land, `Enter`, `o`, `O`, `dd`, `p`, `P`, `J` do nothing on Agenda rows so no Tree semantics leak. Evidence: E2E scenarios 4 (without underline), 9, 15 (edits persist across restart); ordinary Cut and Paste; `Cmd+Enter`; Undo keys in both modes; focus, caret, and mode preserved when typing moves the active row; emphasis geometry and screenshots; key-policy table test; manual native-keyboard check (IME, key repeat). Tier: Moderate Risk. Review, Verify, WP. Stop and report if neither rich spans nor a highlight overlay meets VC5 (C7). PO: none.
* **AG-15.** Files: `src/renderer/AgendaRow.tsx` (mirror row with hollow ring), `src/renderer/AgendaView.tsx` (scroll anchoring keeps the active row's viewport position when it moves), `src/renderer/App.tsx` (status-bar message slot with `role="status"`, m16), `src/renderer/styles.css`, `e2e/agenda-editing.spec.ts`, `docs/PRODUCT.md` (Live Occurrences, Temporarily Invalid Item). Implements §6, §7 restructuring, V4/VC7, S3/VC11. Evidence: E2E scenarios 6 and 7; a mirror update never changes `document.activeElement` or `scrollTop`; Vim `Esc` keeps the invalid item; light and dark screenshots. Tier: Moderate Risk. Review, Verify, WP. PO: none.
* **AG-16.** Files: new `src/application/editor-agenda-transitions.ts` with tests; modify `src/application/editor-store.ts`, `src/renderer/agenda-key-policy.ts`, `src/renderer/agenda-row-keyboard.ts`, `e2e/agenda-editing.spec.ts`, `docs/PRODUCT.md` (Creating Nodes). Content: `Enter` (standard) and `o`/`O` (Vim) on a day container append a node as the last child of the scope with `YYYY-MM-DD ` and the caret after the space, entering Insert in Vim; `O` uses the preceding day and reveals it from a gap; the depth limit shows the existing operation error; rejected while persistence is locked. Evidence: E2E scenario 8 first half; property (exactly one node appended, nothing else changed, one history entry); Undo removes the node. Tier: Moderate Risk. Review, Verify, WP. PO: none.
* **AG-17.** Files: `src/application/editor-agenda-transitions.ts`, `src/application/editor-store.ts`, `src/renderer/editor-input-handlers.ts` (Enter), `src/renderer/vim-keyboard-handler.ts` (`o`/`O` interception), tests, `e2e/agenda-editing.spec.ts`, `docs/PRODUCT.md`. Content: `Enter` keeps ordinary split semantics and the new node inherits the displayed day's date (m17) in the same history entry; `o`/`O` on a direct match create a real sibling after or before it with the day's date in Insert. Evidence: E2E scenario 8 second half including `2026-10-14 Prepare| release`; one Undo restores the original node; matrix cells for ancestors, days, and gaps do nothing. Tier: Moderate Risk. Review, Verify, WP. PO: none.
* **AG-18.** Files: new `src/renderer/use-agenda-drag.ts` (reuses the `node-drag.ts` reducer, hold constants, and `drag-caret-freeze.ts`), `src/renderer/agenda-drop-targets.ts` with tests, `e2e/agenda-moves.spec.ts`; modify `src/application/editor-agenda-transitions.ts` and `src/application/editor-store.ts` (`move-occurrences` for one or many nodes as one history entry, through a multi-node text-edit domain operation), `src/renderer/AgendaView.tsx`, `src/renderer/styles.css`, `docs/PRODUCT.md` (Moving Occurrences), `docs/ARCHITECTURE.md` §8, `scripts/check-requirement-coverage.mjs`. Implements §11 mouse drag, m18. Evidence: E2E scenario 10 with a real drag; contextual ancestors not draggable; Undo restores; property (a move changes only moved dates, Undo restores); Tree drag specs unchanged; drop-feedback screenshot. Tier: Moderate Risk with drag-and-drop boundary E2E. Review, Verify, WP. PO: none.
* **AG-19.** Files: `src/application/agenda-state.ts` (`pendingMove`), `src/application/agenda-reconcile.ts`, `src/renderer/agenda-key-policy.ts`, `src/renderer/vim-keyboard-handler.ts` (`dd`, `p`/`P` interception), `src/renderer/agenda-row-keyboard.ts`, `src/renderer/App.tsx` (F7 message), `src/renderer/styles.css` (VC8), `e2e/agenda-vim.spec.ts` (`vim`), `docs/PRODUCT.md`, `docs/VIM_CONFORMANCE.md` (`dd` never deletes, `p` moves), tests. Implements §13, D1, D4, F7, V5/VC8, m19. Evidence: E2E scenario 11; table-driven D4 lifecycle test; clipboard and Vim register unchanged; VC8 screenshot. Tier: Moderate Risk. Review, Verify, WP. PO: none.
* **AG-20.** Files: new `src/application/agenda-visual-selection.ts` with property test; modify `src/renderer/vim-node-visual-commands.ts` or the interception in `src/renderer/use-node-input-bindings.ts`, `src/renderer/agenda-key-policy.ts`, `src/renderer/AgendaView.tsx`, `src/renderer/styles.css`, `e2e/agenda-vim.spec.ts`, `docs/PRODUCT.md`, `docs/VIM_CONFORMANCE.md`. Implements D5, §12 group move, S4/VC12. Evidence: E2E scenario 12; property (skipped rows never selected, group move changes only source dates, one Undo step); VC12 screenshot. Tier: Moderate Risk. Review, Verify, WP. PO: none.
* **AG-21.** Files: `src/application/agenda-state.ts` (presentation and saved timeline anchor, selection, folds), `src/renderer/AgendaView.tsx`, `src/renderer/AgendaLocationBar.tsx`, `src/renderer/agenda-row-keyboard.ts`, `src/renderer/agenda-key-policy.ts` (`Cmd+.` on a day, `Cmd+,`, Vim `gd` and `Ctrl+o`), `src/renderer/styles.css` (S5 heading), tests, `e2e/agenda-view.spec.ts`, `docs/PRODUCT.md`. Implements §8 focused day, S5/VC13. Evidence: E2E scenario 13 (`j`/`k` stop at the edges, `Cmd+,` restores scroll, selection, and folds without re-targeting Today); VC13 screenshot; VC14 observed in a visible window. Tier: Moderate Risk. Review, Verify, WP. PO: none.
* **AG-22.** Files (new): `src/domain/natural-date.ts` with unit and property tests. Content: `suggestDates(text, caret, today)` returns the replacement span and ordered suggestions; weeks start Monday; covers every §5 expression, the ambiguity ordering, and F3; returns nothing for `t`, `to`, `mar`, `may` and inside a canonical date. The handoff lists the proposed expression table and thresholds. Evidence: table-driven tests for every §5 example; property (suggestions are valid dates, the first is the upcoming one, only the recognized span is replaced); mutation. Tier: Low Risk. PO: Q2 (approve the table before AG-23).
* **AG-23.** Files: new `src/renderer/date-assist.ts` (pure popup owner and F3 lifecycle), `src/renderer/DatePopup.tsx`, their tests, `e2e/agenda-completion.spec.ts`; modify `src/renderer/node-input-text-handlers.ts`, `src/renderer/editor-input-handlers.ts` (`Ctrl+N`, `Ctrl+P`, and `Tab` with an open popup before the indent branch; `Esc` never intercepted), `src/renderer/use-node-input-bindings.ts` (close on blur, mode change, caret leaving), `src/renderer/styles.css`, `docs/PRODUCT.md` (a §20 subsection, because Q1 applies completion in Tree and Agenda), `docs/DEVELOPMENT.md`, Tree E2E specs affected by the popup. Acceptance goes through `store.replaceTextRange` as one undoable edit that does not reopen the popup. Evidence: E2E scenario 5 in both modes, in Agenda and in Tree; ordinary Tree typing opens no popup for low-confidence fragments; VC9 geometry; S1 screenshot; lifecycle property test; composition contract sequence; manual native-keyboard check. Tier: Moderate Risk. Review, Verify, WP. PO: approval of the AG-22 table.
* **AG-24.** Files: `src/domain/date-recognition.ts` (`findDateLikeTokens`, m20), `src/renderer/AgendaRow.tsx` and the AG-14 decoration path, `src/renderer/styles.css` (muted-red token in both appearances), `src/renderer/NodeInput.tsx` and `src/renderer/editor-dom.ts` for Tree rows, `src/renderer/styles.test.ts`, `e2e/agenda-editing.spec.ts`, a Tree E2E spec, `docs/PRODUCT.md` (§20, because Q1 applies the underline in Tree and Agenda). Implements §4 indicator, S2, F6, VC10. Evidence: E2E scenario 4 underline in Agenda and in Tree (none while the caret is in or adjacent to the token, shown after it leaves, no Agenda entry); light and dark screenshots; resemblance-rule tests; mutation. Tier: Moderate Risk. PO: none.
* **AG-25.** Files: new `src/renderer/agenda-command-matrix.test.ts`, `e2e/agenda-visual.spec.ts` for any scenario 16 state not yet covered; review `docs/VIM_CONFORMANCE.md` and `docs/PRODUCT.md` coverage. Evidence: every Command Matrix and Derived Rule cell asserted; every scenario 16 state has an inspected light and dark baseline; `npm run check:requirements` and `npm run check:docs` pass. Tier: Low Risk. Review (traces the matrix against the code). PO: none.
* **AG-26.** Files: `perf/agenda.spec.ts`, `perf/fixtures.ts`. Evidence: scenarios for a keystroke that changes date recognition, a group move, and a mirror update on the large fixture, against a same-machine baseline that is not committed; save-count assertion. Tier: Low Risk with `npm run test:perf`. PO: none.
* **AG-27.** Files: `scripts/readme-screenshots.mjs`, the committed synthetic demo document it captures from (add dated nodes around a fixed capture date if it has none), `README.md` if the gallery lists images explicitly, `docs/DEVELOPMENT.md` (README Screenshot Maintenance). Content: add Agenda captures to the README gallery following `AGENTS.md` §11 and `docs/DEVELOPMENT.md` (isolated application data directory, synthetic data only, the same node identities as the Tree images). Evidence: `npm run screenshots:readme` runs and its Agenda images are inspected in light and dark. Tier: Low Risk. PO: none.
* **AG-28.** Files: `plans/agenda.md` (deleted), `plans/README.md`, `docs/PRODUCT.md`, `docs/ARCHITECTURE.md`, `docs/DEVELOPMENT.md`. Verify Agenda documentation against the implementation, move lasting knowledge to its owners, and remove the plan and index row after the Product Owner confirms no further tasks remain. Tier: Minimal Risk. PO: confirmation.

Suggested sessions (at most four commits each, `AGENTS.md` §12): AG-5–AG-8; AG-9; AG-10–AG-12, so the first user-visible state is windowed; AG-13–AG-14; AG-15–AG-17; AG-18–AG-21; AG-22–AG-24; AG-25–AG-28.

**Next task:** AG-13: Active occurrence, last-date state, and Agenda-aware Undo/Redo in the store. Start a new session: AG-10 through AG-12 completed the read-only rollout required by C11.

AG-12 implemented occurrence-keyed measurements and viewport windowing with the selected DOM row retained as a pin, shared layout helpers and unchanged NodeList. Width and fold changes update measurements without losing focus. Component guards, real-Electron scroll/resize/fold/neighbor tests, geometry and inspected synthetic light/dark screenshots passed. Full validation passed (2548 unit tests, 610 Electron tests, 42 performance tests, zero audit vulnerabilities); independent review and product verification found no meaningful issues. A native same-machine comparison passed against the unwindowed AG-11 runtime; the new mounted-row guard rejected that runtime. Agenda windowing adds no saves. Performance budgets and local baseline artifacts remain owned by the suite.

AG-11 implemented occurrence-local day/node folding through chevrons, Cmd+E and Normal za, and seven-day gap expansion with retained headers/remainders. Empty days and projected leaves do not fold. Collapsing a selected descendant focuses its ancestor; unrelated folds preserve focus. Tree expansion and persistence stay unchanged. Independent review and product verification found no meaningful issues; unit checks, ten real-Electron Agenda tests and inspected light/dark screenshots passed.

AG-10 implemented the read-only renderer and application-scoped shortcuts. The Product Owner confirmed the native flow after clarifying the staged `Cmd+.` behavior. Day focus remains AG-21; date editing remains AG-14.

AG-9 completed the runtime store foundation and [ADR 0020](../docs/decisions/0020-agenda-derived-projection-and-runtime-view-state.md). Today is injected by the existing Electron service factory; `main.tsx` needed no change. The cache returns node identities and reuses its row array when date membership and hierarchy are unchanged. The save path captures the Tree origin location and viewport while Agenda is open. Edit reconciliation remains the AG-13 task; no renderer entry point is exposed by AG-9.

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

Recorded on 2026-10-09 from the Product Owner's acceptance of F1–F7 and S1–S5, and approved by the Product Owner on 2026-10-09. This section completes the Accepted Specification and Accepted Visual Decisions; where it is more precise, it governs.

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
* Tree behavior is unchanged except for natural-language completion and the date-like underline, which apply in Tree too (Q1); the existing Tree test suites pass without modification apart from tests that AG-23 and AG-24 update for that behavior.

## Implementation Planning (AG-4)

Recorded on 2026-10-09 from the planner role's repository inspection at commit `a99d5a6`. No runtime code changed.

### Existing Code Facts

* `Cmd+P` is unbound: the application menu has no Print item (`src/main/application-menu.ts`) and the renderer key chain (`src/renderer/editor-input-handlers.ts`, branch for `Cmd+.`) has no `p` branch. `Cmd+.`, `Cmd+E`, `Cmd+Enter`, `Cmd+,`, `Cmd+Backspace`, and `Cmd+Z` are bound there; Cmd-modified keys bypass the Vim handler, so a `Cmd+P` branch works in every mode.
* A status bar exists (`src/renderer/App.tsx`, `.status-bar` in `src/renderer/styles.css`) with the Vim indicator at the left; V5 and S3 add a message slot beside it.
* `Location { currentParentId, selectedNodeId }` (`src/domain/document-types.ts`); `enter` enters the selected node and `leave` derives the parent from the document. `Cmd+.` on an Agenda row is therefore "select the row's node, then enter". Day containers and gaps cannot be a `selectedNodeId`.
* Inputs are keyed by node id (`src/renderer/use-node-input-bindings.ts`), so live mirrors must not be inputs. Global `.node-row` queries (`vim-viewport-motion.ts`, `editor-dom.ts`, `use-node-input-bindings.ts`) would match Agenda rows that reuse the class, and `use-scroll-restoration.ts` would schedule view-state saves from Agenda scrolling.
* Undo calls `changeSiteFocus` (`src/application/editor-undo-focus.ts`), which can change `currentParentId`; Agenda must prevent that.
* `NodeInput.tsx` renders a plain textarea unless the node has links; date emphasis inside an editable row needs the rich-text path.
* Tree handlers that would leak into Agenda unless intercepted: Tab indent, empty-node Backspace (deletes the subtree, conflicting with D1), Enter split, `Cmd+Backspace` delete.
* New public store methods must be listed in `src/renderer/test/editor-store-double.ts` and `src/application/editor-store-command-inventory.test.ts`. `scripts/check-docs.mjs` rejects restated product quantities in documentation.
* `docs/PRODUCT.md` ends at §22, so Agenda becomes §23 and existing `@requirement` markers stay valid.
### Architecture and Persistence Choices

No new IPC channel, preload or main-process change, dependency, persisted field, or schema change is needed; the work stays in the domain, application, and renderer layers.

* **C1 — Runtime state.** An optional `agenda` field on the ready `EditorSnapshot`, with pure transitions in `src/application/agenda-*.ts`. `EditorRuntimeState.replaceReady` calls one pure `reconcileAgenda` that short-circuits when `agenda` is undefined. React state is rejected (`AGENTS.md` §7) and a separate store is rejected (two publishers). Autonomous; recorded in the new ADR written by AG-9.
* **C2 — Persistence.** Agenda view state (folds, revealed gaps, focused day, pending move, selection) is not persisted; the schema stays at version 4 and a restart opens Tree at the stored location. Persisting it would change the persistence model and need Product Owner approval; not proposed.
* **C3 — Selection.** Real-row selection is the store's `location.selectedNodeId`; day and gap selection live only in `agenda`. The origin location is recorded at open and restored on close.
* **C4 — Today.** Optional `EditorServices.today`, defaulting to the local system date, captured at open. E2E fixes it through the page clock. No IPC.
* **C5 — `Cmd+P`.** Renderer key handling like `Cmd+.`; no menu item, accelerator, or `globalShortcut`. A View-menu item would add IPC and need approval; not proposed.
* **C6 — Projection.** Derived and memoized per immutable `TreeNode` in a `WeakMap`, never stored. The domain model is unchanged.
* **C7 — Date emphasis.** Spans through the existing rich-text path; fall back to a highlight overlay if caret, IME, or typing regress. Escalate only if neither meets VC5.
* **C8 — Windowing.** Own `AgendaView`, reusing `list-window.ts` and key-based layout helpers generalized from `node-list-layout.ts`; `NodeList` untouched (ADR 0007).
* **C9 — Keyboard.** One optional `agenda` dependency in the editor key handler, backed by the pure table `agenda-key-policy.ts`; non-input rows reuse the hook's Vim command state so counts and pending commands keep a single owner (ADR 0014).
* **C10 — Undo.** Same history, no format change; Agenda passes an always-visible predicate to `changeSiteFocus`.
* **C11 — Rollout.** No feature flag. The `Cmd+P` entry point arrives with the complete read-only view in AG-10, and AG-10 to AG-12 land in one session so the first user-visible state is windowed. `docs/PRODUCT.md` describes only what exists.
* **C12 — PRODUCT.md placement.** New `## 23. Agenda`; leaf sections are added by the tasks that implement them.

### Product Owner Decisions on the Planning Questions

Answered by the Product Owner on 2026-10-09.

* **Q1 — Scope of natural-language completion and the date-like underline: everywhere.** Both apply in Tree editors as well as in Agenda. AG-23 and AG-24 therefore change Tree typing: they document the behavior in `docs/PRODUCT.md` §20 rather than §23, update affected Tree tests, and verify that the popup never interferes with ordinary Tree typing (the confidence rule of §5 holds in Tree too).
* **Q2 — Expression table and thresholds: accepted as proposed.** AG-22 writes the full table; the Product Owner approves that table before AG-23 starts.
* **Q3 — Vim commands the specification does not name.**
  * Text commands (for example `x`, `dw`, `ciw`, `r`, `~`, `gu`, `u`, `Ctrl+r`) work on direct matches exactly as in Tree, and do nothing on contextual ancestors, day containers, and gaps.
  * Motion commands (`gg`, `G`, `H`, `M`, `L`, `Ctrl+d`, `Ctrl+u`) move the selection over Agenda rows by the same rules as in Tree. `gg` selects the first row of the timeline, and the heading in a focused day.
  * Fold commands (`zc`, `zo`, `za`, `zC`, `zO`, `zM`, `zR`) act on Agenda collapse state by the same rules as in Tree; `zM` and `zR` cover the current Agenda presentation. They never change Tree expansion.
  * Structural commands (`J`, `gJ`, `dj`, `dk`, `cj`, `ck`, `yj`, `yk`, `gp`, `gP`, `>`, `<`, and whole-node Visual outside D5) do nothing in Agenda.
* **Q4 — README gallery: yes.** Agenda appears in the README screenshots (task AG-27).
* **Q5 — AG-10 display defaults m7–m10: confirmed.**

### Minor Gap Resolutions

Each is written into `docs/PRODUCT.md` by the named task, with the principle it follows.

| # | Gap | Resolution and principle | Task |
| --- | --- | --- | --- |
| m1 | Is the current parent's own text scanned? | No: §2 and scenario 1 never repeat ancestors at or above the scope. | AG-6 |
| m2 | Date token boundary | Recognized only when no digit touches either end; §4 treats `2026-10-1` as ordinary text. | AG-5 |
| m3 | Dates inside hyperlink text | Not recognized: a link's text is its address and other text commands leave it intact (`docs/PRODUCT.md` §§13, 20.2). | AG-5 |
| m4 | Move with duplicates | Replace every source-day token; keep one target token at the first moved token's position; remove other source or target tokens with one adjacent space (§11 examples). | AG-8 |
| m5 | Revealed days after restructuring | Revealed days are a set; an expanded gap keeps its header; unrevealed sub-runs become smaller gaps; revealed days stay revealed when a gap splits (§7). | AG-7, AG-11 |
| m6 | Midnight rollover | Today is captured at open and changes at the next open ("Reactive, but not jumpy"). | AG-9 |
| m7 | Initial selection and return | Today's day container is selected on open; on close the origin node is selected and revealed (`docs/PRODUCT.md` §20.8). | AG-10 (Q5) |
| m8 | Location toolbar in Agenda | Reads `Agenda` in the timeline and `Agenda / Oct 14` in a focused day (VC13); no outline-root control, because it would navigate Tree. | AG-10 (Q5) |
| m9 | Year in labels | The year is appended only when it differs from Today's year (`WED OCT 14 2027`, gap ranges likewise): minimal visual noise without ambiguity. | AG-10 (Q5) |
| m10 | Has-children ring versus chevron | The ring reflects real children (`docs/PRODUCT.md` §2.1); the chevron reflects projected children. | AG-10 (Q5) |
| m11 | Fold keys and selection after collapse | Collapse state is keyed by day and node, because rows are distinct occurrences (§3); collapsing an ancestor of the selection selects the collapsing row (`docs/PRODUCT.md` §2.4). | AG-11 |
| m12 | Selection after Undo or Redo | Nearest occurrence of the change-site node, the earlier day on a tie (§6); otherwise the current selection stays. A change outside the scope never moves selection ("Undo never steals focus"). | AG-13 |
| m13 | Leaving a temporarily invalid item | The item stays until selection moves, `Cmd+P` or `Cmd+.` is used, or another row is clicked; window blur is not leaving. If the scope root no longer exists, Agenda closes. | AG-13 |
| m14 | Images, strikethrough, links | Direct matches behave as in Tree; contextual ancestors show text only (D2). | AG-14 |
| m15 | Selection after D1 deletion | Previous sibling row, else parent row, else the day container (`docs/PRODUCT.md` §8.2 applied to the projection). | AG-14 |
| m16 | Status message with Vim off | Left end of the status bar, where the Vim indicator would be. | AG-15 |
| m17 | Split text | The right part's leading whitespace becomes the single space after the inserted date (§9 example); no insertion when the right part already contains the day's date. | AG-17 |
| m18 | Drop region and feedback | Any row of the target day, header included (D4 `p` rule); feedback is the `docs/PRODUCT.md` §11 inset outline on the day header. | AG-18 |
| m19 | Counted `dd` | The current direct match plus the next N−1 qualifying rows (D5). | AG-19 |
| m20 | "Strongly resembles a date" | Four-digit year, hyphen, one- or two-digit month, hyphen, one- or two-digit day, touching no digit and not a valid date; impossible canonical dates qualify ("arbitrary text is never flagged"). | AG-24 |

Observations, not proposals: standard editing has no keyboard way to move an occurrence between days other than editing the date text or dragging; a focused day has no pointer path.

### Risks

* Decorated editable text (AG-14) can regress caret, IME, or typing; C7 defines the fallback and stop condition.
* When an edit moves the active row to another day, focus, caret, selection, and mode must survive the remount (AG-14, AG-15).
* Input-hook effects assume a focused real input; AG-10 inventories them before writing code.
* Per-keystroke projection cost; AG-9, AG-12, and AG-26 hold the budgets.

## Visual Direction

The existing application uses JetBrains Mono, a warm paper-like light theme, a dark theme, minimal chrome, restrained hierarchy, and no decorative animation. Agenda must feel calm, fast, native to macOS, minimal, and consistent with the Tree editor. Avoid cards, borders, badges, toolbars, panels, modals, heavy date chips, and animations.

AG-2 covered these areas: canonical date highlighting; invalid date indication; autocomplete popup; day containers; Today; focused day; contextual ancestor versus direct match; active occurrence versus live mirror; temporarily invalid item; collapsed and partially expanded gaps; Vim whole-node selection; pending move; light and dark variants. Directions considered and not chosen: day labels in a left margin column, and days as outline rows with a square bullet.

## Resume Prompt

> Continue the Agenda initiative in `plans/agenda.md`. If I have authorized implementation, run the Next task: follow its Task details, validate at its tier, commit it together with its status update, and stop at the session limit in `AGENTS.md` §12.
