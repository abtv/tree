# Caret State Consistency

## Objective and authorization

The Product Owner requested this plan on 2026-10-01 after an image-navigation defect exposed disagreement between the visible caret and the position used by keyboard commands. This session is documentation only. A later agent, launched with the resume prompt below, should execute the ordered tasks within this objective.

Make resolved Normal-mode caret state, its text/image presentation, and the next command's target agree through a common application path. Preserve existing product behavior. Investigate the remaining Replace discrepancy before claiming that it causes another user-visible defect.

This is separate from [Test Oracle Hardening](test-oracle-hardening.md). Its mutation-tooling decision remains unresolved and does not block this initiative. Do not resume or change that initiative as part of this work.

## Sources of truth

Read root `AGENTS.md`, relevant nested `src/renderer/AGENTS.md` and `e2e/AGENTS.md`, and these narrow sections before implementation:

* `docs/PRODUCT.md` §§17.1, 20.2, and 22: preview, Vim caret/mode behavior, and performance.
* `docs/ARCHITECTURE.md` §§8, 9, and 21: UI adapters, runtime state ownership, and caret transitions.
* [ADR 0014](../docs/decisions/0014-single-owner-for-renderer-interaction-state.md): the accepted single-owner rule. Its recorded date is 2026-09-27; it is architectural evidence, not proof that every implementation path follows it.
* `docs/DEVELOPMENT.md` §§8 and 9: affected-path inventory, navigation matrix, validation tiers, and evidence reuse.
* `docs/VIM_CONFORMANCE.md`: existing transition contract, coverage, and intentional Vim divergences.
* `docs/AGENT_ROLES.md` §§3 and 4 for required independent review and product verification.

## Evidence and limits

### Confirmed defect already fixed

Commit `3d22a41` (`fix(renderer): project the resolved image caret on focus`) fixes this sequence in Normal mode:

1. Select a lower image-only node.
2. Press `k` to move upward to a node with text and an image.
3. The destination image has a selection outline.
4. Press `Enter`: before the fix, no preview opens.
5. Moving onto the text and back onto the image made Enter work.

The Product Owner described upward keyboard navigation; reproduction used the existing Normal-mode `k` command. Do not interpret this as authorization to add arrow-key commands.

`vim-vertical-navigation.ts` resolved the destination to its image, placing the caret authority at `text.length`, while the application focus intent retained the originating text column. The hook's focus effect projected that column into the DOM instead of the resolved image cursor. Enter read the DOM cursor. The immediate and deferred focus passes now project the matching caret authority's cursor.

Before the fix, both the Electron preview regression and real-store hook cursor assertion failed. After the fix, `npm run check` passed with 1315 tests, and `npx playwright test e2e/vim-image-caret.spec.ts e2e/vim-navigation-and-visual.spec.ts --workers=1` passed with 71 tests. These are historical evidence of that fix, not reusable validation for future changed source or builds.

The hook regression is named `projects the upward image destination`; the Electron regression is `opens an image immediately after moving up from another image`. Preserve them.

### Remaining structural risk, read on 2026-10-01

* `vim-keyboard-handler.ts` applies `h/l` results with separate `setNormalCaret(input, next.cursor)` and `vim.applyCaretState(node.id, next)` calls. Other text motions, mutations, and deferred caret requests have similar split responsibilities. A caller can omit one side.
* `use-node-input-bindings.ts` retains `caretAuthority`, `syncedImageFocusToken`, and `pendingCaret`; immediate focus, deferred focus, mode changes, resize, pointer placement, edit completion, and drag release can write DOM selection.
* `getCaretState` merges the DOM cursor into the stored caret state. Consequently, passing commands do not prove that the stored cursor itself agrees with the DOM.
* `finishVimReplace` computes `committedCursor` using the `retreatCursor` flag and derives image state from that cursor, but publishes `cursor: rawCursor`. Escape and application undo callers then retreat the DOM separately. This is a concrete internal discrepancy when a replacement commits and retreats; no additional user-visible defect has been reproduced from it. Empty/no-op Replace, preserved selections, and native editing need separate analysis.
* The lower-level generated interaction fixtures project the resolved caret themselves. They bypass the production React focus effects and therefore could not detect the competing focus projection that caused the original bug. Retain their arithmetic/model coverage and complement it with production-hook integration coverage.

The established failure class is disagreement between a resolved interaction state and its presentation or command input. Do not claim that all scattered DOM writes are defects: Insert/Replace native positions, deliberate text selections, character Visual endpoints, and drag suspension have distinct documented responsibilities.

## Boundaries and design constraints

* No new command, gesture, mode, preview behavior, or selection behavior. Do not change PRODUCT requirements to justify a refactor.
* No domain, document model, persistence, IPC, attachment-byte, process, technology-stack, or compatibility changes.
* Keep transitions pure and renderer-local; keep DOM operations in `editor-dom.ts`. The hook adapts transitions to DOM, React, and the store. Handlers must not become additional owners.
* Provide one path for publishing and projecting a resolved Normal caret, including active image and saved text return position. Resolve the precise API during planning of T2; a small renderer-local owner/helper is allowed within existing architecture.
* Separate calculation, publication, and DOM timing explicitly. An edit may require projection after React updates the text; navigation may require the destination input to mount. Deferred work must not overwrite a newer focus/caret intent or project onto the wrong node.
* Preserve deliberate multi-character Normal selections, Visual selections, browser-native Insert/Replace editing, pointer placement, composition, and existing focus-return behavior. Do not force every DOM selection through a Normal image-caret invariant.
* Do not make an unchecked ref cursor the sole truth for native pointer or text input. Record how those observations become a new resolved intent.
* No growing queues or retained histories. Assess disk writes/syncs, interactive CPU, and memory under PRODUCT §22. Prefer constant-time publication/projection. Reuse relevant existing scale guards; add a guard if the final design can change scale behavior.
* Find requirement gaps before coding. No material gap has been identified for preserving the stated behavior. Ask the Product Owner if preserving behavior reveals contradictory requirements, a new user experience, or a major architectural change. Stop if more than three minor decisions are needed.

## Ordered tasks

| ID | Outcome | Dependencies | Acceptance evidence | Status |
| --- | --- | --- | --- | --- |
| T1 | Inventory caret writers and investigate Replace discrepancy | None | Complete affected transition matrix; evidence distinguishes reproduced defects, internal discrepancies, and valid mode-specific differences | Ready |
| T2 | Apply resolved Normal caret through one coherent path | T1 | All affected handlers and deferred projections follow the documented ownership contract; original and any newly reproduced defects have failing-before/passing-after regressions | Planned |
| T3 | Guard real-hook sequences and close the initiative | T2 | Independent expected-state checks exercise the production hook and actions after transitions; required validation/reviews pass; lasting knowledge moved to its owners | Planned |

Each task gets a current `WORKING_PLAN.md` carrying its inventory and evidence, required clean-context reviews, and a focused commit. Update this plan and index in that commit. Do not combine an unrelated defect or a materially larger refactor into these tasks.

### T1 — Inventory and Replace investigation

Expected files: temporary `WORKING_PLAN.md`; `src/renderer/use-node-input-bindings.test.tsx`; existing focused `editor-input-handlers.test.ts` or `vim-caret-transition.test.ts` only if needed; `e2e/vim-text-editing.spec.ts` or `e2e/vim-image-caret.spec.ts` for any confirmed real-renderer sequence; this plan and index. Production changes belong to T2.

Trace every caller of DOM caret/selection setters and every writer of caret authority, image state, saved return position, focus-token consumption, and deferred caret work in:

* `use-node-input-bindings.ts`, `vim-keyboard-handler.ts`, `vim-keyboard-types.ts`, and `editor-input-handlers.ts`;
* `vim-caret-transition.ts`, `vim-vertical-navigation.ts`, and `editor-dom.ts`;
* `NodeInput.tsx` textarea/contenteditable mounting and focus, plus preview/drag integration when those paths affect caret state.

Inventory keyboard motion, counts and boundaries, pointer/focus, same-node navigation, parent/sibling/expanded-child destinations, edits, undo/redo, modes, composition, preview close, drag suspension/release, mode/resize redraw, and immediate/deferred focus. For each, distinguish the resolved state writer, DOM projector, command reader, and execution timing. Record expected node, mode, cursor/selection, image state, and return position, with existing or new test evidence.

Investigate Replace Escape and Cmd+Z/Cmd+Shift+Z with changed and unchanged text, image and ordinary text nodes, final and non-final positions, plus blur, pointer, cut/paste, and quit interruption semantics where relevant. Observe both actual next-command outcomes and state/DOM agreement; do not add production-only diagnostic APIs. A discrepant internal cursor alone must not be reported as reproduced user-visible breakage.

If no new user-visible bug reproduces, record that finding and the internal discrepancy as a T2 consistency requirement. Keep all committed tests passing. Leave a failing diagnostic outside committed test discovery or record the exact reproduction for T2; do not commit a deliberately failing suite.

Validation: Low Risk for tests/documentation only, `npm run check` when executable tests/tooling change, and affected Electron specs if added. Documentation-only evidence uses Minimal Risk checks. Do not claim full validation from static inspection.

Reserved decisions: contradictory behavior requirements, a new command/gesture, or expanded architecture. No separate approval for ordinary test/owner API choices. Acceptance: self-contained matrix and precise T2 file/API scope in this plan; no production fixes in T1.

### T2 — Coherent Normal caret publication and projection

Expected files: `src/renderer/use-node-input-bindings.ts`, `vim-keyboard-handler.ts`, `vim-keyboard-types.ts`, `editor-input-handlers.ts`, `vim-vertical-navigation.ts`; `vim-caret-transition.ts` or a small new pure renderer-local owner only if T1 justifies it; affected colocated tests; relevant existing E2E specs; `docs/ARCHITECTURE.md` §§9/21 and `docs/VIM_CONFORMANCE.md`; this plan and index.

Use T1's inventory to define a common application path for the complete resolved Normal caret state. Migrate affected paths so a handler cannot publish the image indicator while forgetting the matching cursor projection. Handle post-edit and cross-node projection timing explicitly, preserving new-focus-token semantics, no-op return positions, and protection against stale deferred work. Resolve the Replace cursor discrepancy without discarding the intentional retreat/preserve-selection distinctions.

For each confirmed bug, add its failing regression before implementation, then confirm the fix and, when practical, show that bypassing it reintroduces the failure. Preserve commit `3d22a41`'s original regressions. Add/update property tests if cursor transforms or ownership invariants change; boundary/presentation-only wiring does not require mirroring the implementation in another model.

Acceptance: review traces every affected state-changing path against T1's matrix, including same-node and clamped commands. State, visible caret, and subsequent command agree in their applicable modes. No intentionally unsupported combination is silently introduced. Inspect representative synthetic Electron screenshots for selected/unfocused neighbors and transitions; use both appearances only if affected styling differs. No broad styling changes are intended.

Validation: Moderate Risk, `npm run check`, affected focused unit/property suites, and at least the image, text-editing, and navigation/Visual Electron suites where affected. Broaden E2E for shared interaction infrastructure. Use High Risk `npm run check:full` if the actual change reaches a boundary, shared fixture, or scale-sensitive state covered by that tier. Independent reviewer and separate product verifier are required; supply the full diff, inventory, and reusable validation evidence. Record performance assessment.

Reserved decisions: product changes or major ownership/process boundaries outside the existing renderer architecture. Ordinary implementation details are autonomous.

### T3 — Production-hook sequence guards and closure

Expected files: `src/renderer/use-node-input-bindings.test.tsx` or a dedicated `use-node-input-bindings.property.test.tsx`; `src/renderer/test/real-store-harness.ts` only if necessary; existing `vim-interaction.property.test.ts` / `vim-mixed-interaction.property.test.ts` only to clarify/reuse appropriate independent expectations; focused E2E specs for missing real-renderer boundaries; `docs/DEVELOPMENT.md` §8/12 and `docs/VIM_CONFORMANCE.md`; this plan and index until closure.

Add bounded deterministic/generated sequences through the production hook with a real EditorStore, using independent expected behavior rather than the production transition functions as the oracle. Cover text-only, text+image, and image-only nodes; non-final return positions; same/cross-node moves; boundary/no-op and counted moves; mode entry/exit; pointer placement; history; and action after navigation. Flush relevant React/deferred work between events and assert that it cannot overwrite a newer intent. Use actual NodeInput/DOM lifecycle coverage where a manual fixture would otherwise supply the very projection being tested.

Do not recreate the complete Vim interpreter. Select the affected invariant and a small event alphabet, preserve any failing seed as a named regression, and use existing focused cases for unrelated behavior. Include actual command outcomes (preview, insertion, or another applicable command) alongside caret/selection assertions. Retain Electron tests for native focus, real rendering, and textarea/contenteditable differences; jsdom is not an Electron substitute.

Acceptance: the guard demonstrably detects a deliberately reintroduced competing focus projection or omitted caret application in a scratch change, which is restored before commit. Existing pure tests remain useful and their limits are documented. No coverage floor is lowered. Record validation and review results; extract durable ownership/testing guidance and remove this completed initiative and index row under AGENTS §8.

Validation: Low Risk for isolated test-only additions, `npm run check` plus affected Electron specs when changed. Shared-fixture changes require High Risk `npm run check:full`; prefer local test composition unless shared changes are genuinely necessary. Any production defect exposed follows a separate defect-first fix and the appropriate T2 validation/review rules; update the plan rather than silently expanding T3.

Reserved decisions: any newly exposed material requirement gap or expanded product behavior.

## Next task and resume prompt

T1 is the next ready task. No implementation or new defect reproduction has been performed under this initiative yet. Start with repository state, not the earlier conversation; compare this record with commits and any unfinished working plan.

```text
Execute the Caret State Consistency initiative in plans/caret-state-consistency.md.
Start with T1, then continue its ordered tasks within the recorded scope and session rules.
Preserve existing product behavior; reproduce any new defect before fixing it.
```
