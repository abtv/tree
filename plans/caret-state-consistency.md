# Caret State Consistency

## Objective and authorization

The Product Owner requested this plan on 2026-10-01 after an image-navigation defect exposed disagreement between the visible caret and the position used by keyboard commands. The planning session was documentation only. The subsequent request to continue the plan authorizes its next ready task within this objective.

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
| T1 | Inventory caret writers and investigate Replace discrepancy | None | Complete affected transition matrix; evidence distinguishes reproduced defects, internal discrepancies, and valid mode-specific differences | Done |
| T2 | Apply resolved Normal caret through one coherent path | T1 | All affected handlers and deferred projections follow the documented ownership contract; original and any newly reproduced defects have failing-before/passing-after regressions | Done |
| T3 | Guard real-hook sequences and close the initiative | T2 | Independent expected-state checks exercise the production hook and actions after transitions; required validation/reviews pass; lasting knowledge moved to its owners | Ready |

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

#### T1 findings and affected-path inventory (2026-10-01)

Source inspection and real-store hook tests distinguish an internal discrepancy from observable command behavior. A changed Replace Escape publishes `rawCursor` in `finishVimReplace`, but chooses image state from `rawCursor - 1`; the handler retreats the DOM separately. `getCaretState` subsequently merges the DOM cursor into authority. This masks the discrepancy for the tested next commands. No additional user-visible defect was reproduced. This finding does not prove that an untested timing sequence is safe.

Added 48 cases to `use-node-input-bindings.test.tsx`: ordinary and attached `abcd` at offsets 0, 2, and 4, plus image-only nodes; changed and empty sessions; Escape, Cmd+Z, and Cmd+Shift+Z. Six cases also type the existing character, resolving a nonempty buffer without changing text. They assert text, Normal mode, DOM cursor, and the subsequent `x` or image-preview command. A fresh changed-text commit clears redo, so those redo cases specifically exercise unavailable redo. Existing tests separately cover contenteditable Replace, composition restart, blur/pointer completion, native/menu Paste, right-click Cut selection preservation, reentrant completion, and repeated persistence flush. No production diagnostic API was added. The fixture registers manual DOM inputs and synchronizes text/classes, so these results are not evidence of real NodeInput mounting or native pointer timing.

**Writer and reader map.** Locations below name functions or callback bodies rather than unstable line numbers. They were read in this session; ADR 0014 is Accepted, dated 2026-09-27. Existing Electron citations below are test coverage inspected in source, not claimed fresh passes.

| Owner/site | Writes and timing | Readers and limitation |
| --- | --- | --- |
| Hook `applyCaretState` | Replaces `{nodeId, caret}` synchronously; projects image ID through React; optionally consumes current focus token | `getCaretState` overlays DOM cursor; image return handle reads authority. Publication alone never projects DOM |
| Hook `syncImageCaretToFocus` | Consumes each new store token; computes focus transition; publishes target node and image/return state | Store focus remains an intent, possibly an originating text column; same token is a no-op |
| Hook mode/focus effects | Mode redraw uses observed DOM cursor and preserves selections wider than one character; focus effect focuses mapped input and projects matching authority immediately and in a token-guarded microtask | Native Insert/Replace projection uses focus cursor. Deferred focus checks token, not an independent caret revision |
| Hook `pendingCaret` | One `{input,cursor}` slot written by edit scheduling/content input; layout effect projects connected element according to current mode, then clears slot | No node, token, mode, or revision stamp. Disconnected slot is retained. This is a stale-work risk, not a reproduced failure |
| Hook resize/selection observers | Resize redraws active Normal DOM cursor, preserving wide selections; selectionchange updates link/selection decoration | Does not publish cursor authority. Decorations are presentation, not new caret intent |
| Keyboard `move`, `h/l`, Escape, `leaveVisual`, edit helpers | Separate DOM/scheduled cursor and authority calls; Visual motions instead write endpoint selection | Motions and preview read DOM cursor; edits often project only after store/React update. `applySurround` schedules a cursor without publishing complete caret |
| Keyboard `G`, Enter, image return handle | `setImageCaret` reuses authority cursor, changes image flag; return setter directly replaces return field | `G` then dispatches boundary focus; Enter uses DOM cursor. These partial writes must become complete intents |
| Hook Replace completion | Takes session before store commit; computes resolved image state, publishes raw cursor; optional DOM rewrite at raw end | Escape/history retreat separately. Preserving text commands must keep native selection; no-op sessions publish nothing |
| Pointer/focus callbacks | Mousedown publishes pre-default observation; mouseup publishes final Normal pointer observation; onFocus selects a different node or redraws terminal image DOM | Pointer placement is a new intent, including on the same node; mousedown observation is not necessarily final click position |
| Drag begin/release | Captures observed cursor and authority after collapse-to-anchor, blurs; release focuses and writes collapsed DOM position | Frozen record is bounded and pointer-owned; release does not republish image state. Preserve deliberate suspension semantics |
| NodeInput and preview | NodeInput registers/unregisters textarea or contenteditable; rich-editor focus can change editor surface. Preview cleanup refocuses previous element | No independent caret writer in either component; mounting/refocus invokes hook lifecycle and onFocus |

**Transition matrix.** Let `n` be text length, `c` a Normal text position, and `r` the saved non-final image-entry position. Normal text is a block at `0..n-1` (empty ordinary text uses 0); an image is cursor `n`, active image, hidden text caret. Rows apply to textarea and contenteditable unless stated. Counts, beginning/middle/final/empty positions, root/current-parent/sibling/expanded-child context, and same-node/no-op outcomes must be retained where applicable. Pure transitions remain the calculation owner; hook projection must be the sole application path.

| Start/action | Expected node, mode, cursor/selection, image and return | Current path and evidence |
| --- | --- | --- |
| Normal `h/l`, counted/repeated/clamped | Same node, Normal; arithmetic clamp; image entry records originating text position; exit restores `r` then applies remaining count; image no-op retains `r` | `horizontalCaretTransition`, separate setter/publication. `vim-caret-transition.test.ts`; Electron image suite counted exit/oversized entry/boundary cases |
| Normal text motion/find/repeated find, failed search | Same node, Normal text target; clear active image and stale return when leaving it; failed search leaves state | Keyboard `move`; motion and find tests; Electron image suite “clears the image caret when a text motion leaves an attached image” |
| Normal `j/k` same node | Text→image stores `c`; image→text restores `r`; image-only clamped `k` preserves active image | `navigateVertically` same-node setter/publication. Hook non-final return tests; Electron image suite same-node and first-root clamp cases |
| Normal `j/k`, counts across rows | Destination visible sibling/expanded child/current parent; Normal; upward image destination is `n` with originating column saved, downward exit uses destination column 0; no new focus preserves return | Vertical helper publishes and consumes token; hook focus effects project. Original upward regression; Electron expanded rows/counts/child-to-parent cases |
| `gg/G`, viewport/half-page, application enter/leave/back, deletion/fold | Destination selected node and Normal caret from new focus intent; explicit `G` image destination; same-node no new token retains `r`; hidden selected descendant normalizes to visible ancestor | Boundary/viewport/sync callbacks and App/store focus. Hook no-op/Visual-clamp tests; Electron image suite boundary/viewport/fold/enter/breadcrumb cases |
| Normal text edit/operator/put/case/dot/surround | Same node unless structural command; Normal resolved post-edit cursor, image at new `n`; return cleared or fresh image entry; deferred projection waits for new text | Edit/Visual/surround helpers and pending slot. Text-command and handler tests; Electron final-character deletion/toggle/Visual delete/plain-text put/surround cases |
| Normal history `u/Ctrl+r`, Cmd+Z/redo | Change-site node and cursor from history focus; no available history keeps intent; unfinished command suppression remains unchanged | Store history then focus sync. Hook/handler outcomes; Electron text/image history cases |
| Insert entry/native edit/Escape | Same node Insert native insertion position; Escape resolves Normal at observed cursor minus one; insertion text already committed; image-only empty session retains image | Native setters/session capture and edit transition. Hook Insert tests; Electron mode and empty-image Insert case |
| Replace printable/Backspace/composition | Same node Replace, DOM draft and native thin caret; store baseline until completion. Composition finishes buffer, permits native input, then starts new baseline | Session owner, DOM native projection; hook composition/contenteditable cases. Native IME is intentionally unit-contract-only per Development §8 |
| Character Visual enter/move/swap/operator/Escape | Same node; inclusive endpoint selection in Visual; leave resolves Normal target; operators use selected range. Application text command clears endpoints but retains Visual mode | Selection setters and `leaveVisual`; handler/Visual tests; Electron backward selection, case and re-anchor cases |
| Whole-node Visual enter/move/command/exit | Sibling range; range movement may focus same node; exit/commands normalize mode/range as specified, retaining image state on no new intent | Hook range callbacks plus sync; hook same-node/clamped cases; Electron Visual range/shortcut cases |
| Pointer down/up, same-node and cross-node focus | Mode preserved except documented navigation/session interruptions; native selection preserved; final pointer observation is new intent and resets obsolete image return | Pointer transition, onFocus/store select, mouseup; hook pointer tests; Electron image pointer and Visual re-anchor cases |
| Preview open/close | Same selected node/mode; close returns prior element focus; Normal image position/return must survive refocus | Preview cleanup/onFocus. Attachment preview tests and Electron preview/image navigation cases |
| Drag hold/cancel/drop/release | Captured node/mode/cursor suspended; matching pointer releases once, restores focus/collapsed cursor, keeps image indicator; unmount abandons capture | Freeze owner and hook release. Hook pointer ownership/contenteditable/image freeze tests; Electron cancelled-image drag case |
| Mode/resize redraw and immediate/deferred focus | Normal block/image must agree with latest applicable intent; wide native selections survive; old token work must not override newer focus; mounted destination receives correct cursor | Hook effects/observers and NodeInput refs. Hook focus/resize/upward tests; real lifecycle and stale same-token caret work need T2/T3 guards |

**Replace interruption policy and evidence.** `resolveReplaceCommit` rejects an empty typed buffer; a typed buffer can still produce unchanged text (for example replacing a character with itself), so “changed” return means a resolved session, not necessarily a different document. T2 must preserve that distinction.

| Interruption | Resolution and expected outcome | Evidence/limit |
| --- | --- | --- |
| Escape, changed/empty | Commit once when resolved; retreat by one only for a resolved session; Normal at clamped destination; image derived from that destination | New 48-case matrix checks next command. Internal raw/resolved cursor discrepancy remains |
| Cmd+Z/Cmd+Shift+Z | Finish first and retreat when resolved; Normal; successful history creates change-site focus, unavailable history keeps resolved position | New cases include empty sessions and unavailable redo; Electron pending undo/redo source coverage |
| Blur / left pointer | Commit at raw end without retreat; blur returns Normal; pointer default/mouseup supplies placement; terminal attached end is image | Existing hook blur/pointer and Electron tests; native pointer timing cannot be inferred from synthetic mousedown alone |
| Right pointer / Cut/Paste/select-all | Preserving commit precedes command; keep visible draft and deliberate range; Normal; empty Cut selection is no-op | Hook native/menu Paste/right-click Cut, handler shortcut outcomes, App and Electron text tests |
| Enter/leave/delete/enter control/breadcrumb | Finish before command changes focus; new token determines destination; no-op focus does not erase return | Handler navigation completion, App blur-before-navigation; Electron enter/delete/breadcrumb evidence |
| Composition | Consume buffer before native composition, retain Replace mode, restart baseline at observed native position | Existing hook contract test; real IME automation intentionally unsupported |
| Quit/flush, retry, reentry | Commit before save; return Normal; take session before notifications makes repeated finish a no-op; failed save retains committed replacement | Hook flush/reentrant cases; App/store shutdown tests and Electron shutdown-failures source coverage. No new boundary changes |

**T2 API scope.** Replace Normal-specific handler setters with one hook-backed `applyNormalCaret(nodeId, resolvedState, timing)` operation (name may change), carrying cursor, image activity, return position and optional focus-token consumption together. Immediate projection uses the registered destination; after-edit projection stores one bounded intent stamped with node, focus token and monotonically changing intent revision. Focus, pointer observation and a newer same-node command invalidate older work. Never schedule onto a detached or wrong-node element; consume abandoned work. Keep native `scheduleCaret` separate for Insert/contenteditable observations, explicitly stamped so it cannot overwrite a later Normal intent. Keep Visual selection setters and drag capture distinct.

Expected production files are the five T2 files already listed, plus `editor-dom.ts` only if a reusable projection primitive is needed. `vim-vertical-navigation.ts` should issue a complete application callback for same-node and cross-node results instead of separate setter/publication callbacks. Migrate `move`, horizontal motion, edits, surround, Visual leave, Insert Escape, Replace finish/retreat, partial image setters and focus synchronization. For preserving Replace commands, observe the live selection without collapsing it; publish the resolved Normal state only when applicable. Avoid updating PRODUCT to legitimize changed behavior. Add owner revision/property tests only if a pure owner is introduced; test projection through the production hook and real NodeInput lifecycle.

T1 changes tests/documentation only: no disk-write, interactive CPU, or retained-memory change in the product. T2 should add constant-size intent/revision state and no document traversal; retain `perf/expansion.spec.ts` navigation and existing Vim latency guards if their inputs remain applicable. No new requirement gaps or Product Owner decisions were made. No combination was newly excluded; native IME retains its existing automation limit.

**T1 validation and review.** `npm run check` passed on HEAD `56749c74188dce5426907c69136d4ba5eb560dca` plus snapshot `sha256:e0ac5a559617ca4c794ff0aab3b85992a050b5935f1524195662ae154f3cafbf`: 81 files, 1,357 tests, production build, documentation/governance checks, zero audit vulnerabilities. After six unchanged-text cases were added, the affected checks passed at snapshot `sha256:25f96fd27e94ce2ef719aaaa7546136e0600736aa380dfaf6742fdb6b0a32c86`: `npm run typecheck:renderer`, `npx eslint src/renderer/use-node-input-bindings.test.tsx`, `npm run format:check:changed`, and `npx vitest run --coverage` (81 files, 1,363 tests, 6.23 s). The other aggregate stages remain valid; production/build inputs did not change.

`npx playwright test e2e/vim-text-editing.spec.ts --grep 'Replace|replacement text after Escape' --workers=1` passed, 14 existing Electron cases in 6.1 s, at the latter snapshot using the unchanged production build from `npm run check`, macOS GUI session, hidden windows. It freshly exercises pending Replace, pointer/blur, history and clipboard interruptions; unrelated matrix citations remain source-inspected coverage. No new rendered inputs or screenshot baselines were changed, so no new visual inspection was required. Primary diff review found no meaningful issues; independent review/product verification are reserved for T2's shared interaction-state implementation. No failed or blocked checks remain. Final documentation-only changes receive scoped formatting and documentation checks before commit.

### T2 — Coherent Normal caret publication and projection

Expected files: `src/renderer/use-node-input-bindings.ts`, `vim-keyboard-handler.ts`, `vim-keyboard-types.ts`, `editor-input-handlers.ts`, `vim-vertical-navigation.ts`; `vim-caret-transition.ts` or a small new pure renderer-local owner only if T1 justifies it; affected colocated tests; relevant existing E2E specs; `docs/ARCHITECTURE.md` §§9/21 and `docs/VIM_CONFORMANCE.md`; this plan and index.

Use T1's inventory to define a common application path for the complete resolved Normal caret state. Migrate affected paths so a handler cannot publish the image indicator while forgetting the matching cursor projection. Handle post-edit and cross-node projection timing explicitly, preserving new-focus-token semantics, no-op return positions, and protection against stale deferred work. Resolve the Replace cursor discrepancy without discarding the intentional retreat/preserve-selection distinctions.

For each confirmed bug, add its failing regression before implementation, then confirm the fix and, when practical, show that bypassing it reintroduces the failure. Preserve commit `3d22a41`'s original regressions. Add/update property tests if cursor transforms or ownership invariants change; boundary/presentation-only wiring does not require mirroring the implementation in another model.

Acceptance: review traces every affected state-changing path against T1's matrix, including same-node and clamped commands. State, visible caret, and subsequent command agree in their applicable modes. No intentionally unsupported combination is silently introduced. Inspect representative synthetic Electron screenshots for selected/unfocused neighbors and transitions; use both appearances only if affected styling differs. No broad styling changes are intended.

Validation: Moderate Risk, `npm run check`, affected focused unit/property suites, and at least the image, text-editing, and navigation/Visual Electron suites where affected. Broaden E2E for shared interaction infrastructure. Use High Risk `npm run check:full` if the actual change reaches a boundary, shared fixture, or scale-sensitive state covered by that tier. Independent reviewer and separate product verifier are required; supply the full diff, inventory, and reusable validation evidence. Record performance assessment.

Reserved decisions: product changes or major ownership/process boundaries outside the existing renderer architecture. Ordinary implementation details are autonomous.

#### T2 result (2026-10-01)

`applyCaretState` now publishes the complete resolved Normal caret and projects it through the hook's registered input, with immediate, after-edit, or preserve-selection timing. Motions, vertical same-node/cross-node steps, edits, surround, Visual leave, Insert Escape, and Replace completion use that path. Partial image/return handles delegate to complete publication. Replace stores the resolved cursor and callers no longer retreat the DOM separately. One bounded pending projection carries node, focus token, and revision; native scheduling also records its originating element. Superseded, disconnected, replaced, and wrong-node work is consumed without projection. Mode changes invalidate deferred focus and retain only compatible pending placement. Existing pure transition arithmetic and the shared test harnesses remain unchanged; local handler/property fixtures now implement the complete projection callback contract.

The primary matrix audit reproduced stale focus collapsing a newer same-node pointer selection, and queued Normal focus overwriting a newer Insert append position. New hook regressions fail without the respective revision/mode guard and pass with it. The audit also reproduced a refactor regression when composition start consumed a nonempty terminal Replace buffer: Normal projection moved native cursor 4 to 3. A preserving commit fixes it while retaining Replace mode, with a failing-before/passing-after regression. A native change-command outcome test covers pending insertion placement and actual history. Original upward-image regressions and every T1 Replace case remain passing. No requirement gaps, Product Owner decisions, or new unsupported combinations; native IME remains unit-contract-only under Development §8. T3 still owns the broader bounded production-hook sequences and closure.

Final validation: `npm run check` passed on HEAD `a4e494b1e747810e1e599071519812b27870c5cd` plus runtime snapshot `sha256:05ab5734a058ccf09b5ce7feddd71f17691234e5efd92998114d035c4d55c913`: 81 files, 1,368 tests, 5.51 s coverage, production build, zero audit vulnerabilities, unchanged coverage floors. `npx playwright test` passed all 296 cases in 1.2 minutes on that production build, macOS GUI session with hidden windows. Earlier aggregate and Electron passes were superseded by the final runtime pass. Development failures were a coverage floor after moving a callback, an incorrect undo expectation, and the deliberately reproduced pointer/composition/Insert races; corrected before final validation. Documentation-only completion edits receive scoped formatting and documentation checks without repeating runtime validation.

Visual evidence: inspected the actual synthetic upward-focus screenshot from the final `npx playwright test`, preserved at `/private/tmp/tree-caret-t2-upward.png`: selected upper text/image has the image outline and hidden text caret; the lower image-only neighbor is unoutlined. Also deliberately inspected the matched existing light/dark no-op image baselines in `e2e/vim-editing.spec.ts-snapshots/`; selected image and plain peer are correct. No baseline or styling changes. The original artifact is `test-results/vim-image-caret-Vim-editin-d3be1-oving-up-from-another-image-vim/upward-image-caret.png`; performance runs clear that directory.

Independent reviewer traced the supplied complete change statements, source context, and T1 path matrix, including same-node/clamped and mode/composition paths; no remaining meaningful issues. Separate product verifier reviewed exact projection/focus/pointer/mode excerpts, new tests, and the matrix; no additional meaningful product issues. Its review was bounded to those excerpts, complemented by the primary full diff/path review. Role evidence was supplied directly because the role tools lack filesystem reads and prohibit shell inspection. No production boundary, persistence, or scale-dependent algorithm changed. Publication/projection uses constant-time map access and constant-size state; no additional disk writes/syncs or growing history. Existing Vim/expansion performance guards cover the affected paths.

`npx playwright test -c perf.config.ts perf/vim.spec.ts perf/expansion.spec.ts` passed all 14 cases in 12.2 s on the final production build with visible windows. Ordinary Vim paint p95 was 32.8 ms; counted navigation across 1,100 visible rows remained within the existing guard, and the heap-growth guard passed. This is budget evidence, not a before/after performance improvement claim. `npm run format:check:changed`, `npm run check:docs`, and `git diff --check` passed for the completion edits. No failed or blocked checks remain.

### T3 — Production-hook sequence guards and closure

Expected files: `src/renderer/use-node-input-bindings.test.tsx` or a dedicated `use-node-input-bindings.property.test.tsx`; `src/renderer/test/real-store-harness.ts` only if necessary; existing `vim-interaction.property.test.ts` / `vim-mixed-interaction.property.test.ts` only to clarify/reuse appropriate independent expectations; focused E2E specs for missing real-renderer boundaries; `docs/DEVELOPMENT.md` §8/12 and `docs/VIM_CONFORMANCE.md`; this plan and index until closure.

Add bounded deterministic/generated sequences through the production hook with a real EditorStore, using independent expected behavior rather than the production transition functions as the oracle. Cover text-only, text+image, and image-only nodes; non-final return positions; same/cross-node moves; boundary/no-op and counted moves; mode entry/exit; pointer placement; history; and action after navigation. Flush relevant React/deferred work between events and assert that it cannot overwrite a newer intent. Use actual NodeInput/DOM lifecycle coverage where a manual fixture would otherwise supply the very projection being tested.

Do not recreate the complete Vim interpreter. Select the affected invariant and a small event alphabet, preserve any failing seed as a named regression, and use existing focused cases for unrelated behavior. Include actual command outcomes (preview, insertion, or another applicable command) alongside caret/selection assertions. Retain Electron tests for native focus, real rendering, and textarea/contenteditable differences; jsdom is not an Electron substitute.

Acceptance: the guard demonstrably detects a deliberately reintroduced competing focus projection or omitted caret application in a scratch change, which is restored before commit. Existing pure tests remain useful and their limits are documented. No coverage floor is lowered. Record validation and review results; extract durable ownership/testing guidance and remove this completed initiative and index row under AGENTS §8.

Validation: Low Risk for isolated test-only additions, `npm run check` plus affected Electron specs when changed. Shared-fixture changes require High Risk `npm run check:full`; prefer local test composition unless shared changes are genuinely necessary. Any production defect exposed follows a separate defect-first fix and the appropriate T2 validation/review rules; update the plan rather than silently expanding T3.

Reserved decisions: any newly exposed material requirement gap or expanded product behavior.

## Next task and resume prompt

T1 and T2 are complete with inventory, implementation, and validation evidence above. T3 is the next ready task: add bounded production-hook sequence guards and close the initiative. Start with repository state and preserve T1's matrix plus T2's named pointer, mode, composition, and upward-image regressions. No new product behavior is authorized.

```text
Execute the Caret State Consistency initiative in plans/caret-state-consistency.md.
Start with T3, using T1's transition matrix and T2's coherent application path.
Preserve existing product behavior; reproduce any new defect before fixing it.
```
