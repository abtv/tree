# Vim Text Search

Status: Awaiting owner acceptance — T1–T4 complete.

## Objective and authorization

Deliver literal text search in Vim Normal mode across Tree and Agenda, with live highlighting and bounded counts, explicit navigation, and responsive editing on large documents.

The owner approved the behavior recorded below in conversation and then asked to record a multi-task initiative plan. In the follow-up discussion, the owner settled D1–D5 and authorized saving those decisions to Git. On 2026-10-22, the owner explicitly authorized implementation of the initiative, starting with T1. Continue its ready tasks within the recorded scope and workflow limits. The selected coding tool is Codex. Planning started from clean commit `f5b911f` with no working plan or other indexed initiative.

Priority: prompt visible feedback for typing, scrolling, folding and navigation; correct results after edits and structural changes; ordinary Vim conventions except the explicitly agreed differences. Do not trade correctness for a stale count or stale navigation target.

Sources of truth: [PRODUCT](../docs/PRODUCT.md) §§1.1–1.3, 2.4, 13, 20.1–20.2, 20.7–20.8, 22 and 23; [ARCHITECTURE](../docs/ARCHITECTURE.md); [VIM_CONFORMANCE](../docs/VIM_CONFORMANCE.md); [DEVELOPMENT](../docs/DEVELOPMENT.md) §§8–12; [workflow procedures](../docs/AGENT_WORKFLOW.md) §§5, 8–14. PRODUCT §20.2.26 describes delivered Tree and Agenda search. Integrated assessment is complete; final owner acceptance remains.

## Agreed behavior

### Matching and scope

- Search is literal, with no regular expressions. Smart case ignores case for a query without uppercase letters and respects case when it contains uppercase letters.
- Search node text, including displayed HTTP(S) URL text and phrases crossing a link boundary within one node. Do not search linked websites or match across node boundaries.
- Tree searches the editable current-parent heading before its descendants, including descendants hidden by folds.
- Agenda searches its current projection, including collapsed days and branches. Focused-day presentation limits search to that day. Include real-node text in contextual ancestors; exclude synthetic day and gap labels. Count each displayed occurrence separately when a node appears on several days.
- Traverse depth-first in display order: node, descendants, next sibling. Agenda visits days in timeline order and their projected hierarchies in depth-first order. Within text, navigate in text order; reverse navigation reverses this order.
- Matches do not overlap: searching `aa` in `aaa` yields the match at positions 1–2, not an additional match at positions 2–3. Search navigation keeps the caret on visible-character (grapheme) boundaries, never inside a combined emoji or a letter with combining marks.

### Query entry and navigation

- `/` in Normal opens a search field in the bottom status area without moving the tree layout. Prefill the last confirmed query and select all its text: `Enter` repeats it, while typing replaces it. With no confirmed query, the field is empty. Opening search from Visual, backward entry with `?`, and search as an operator motion are outside this version.
- While typing, update the count and highlight matches in mounted text, including rows that become visible through scrolling or manual expansion. Do not move the document caret, scroll to a match, or automatically unfold anything.
- Stop exact counting when the 101st match is found and show `100+` without a current ordinal. This cap never limits navigation or visible highlighting. At most 100 matches have an exact total; after navigation show the current ordinal and total, such as `3 / 8`.
- `Enter` confirms the query and navigates forward strictly after the origin captured at query entry, skipping a match that begins exactly at the caret until wrapping. An empty confirmed query reuses the last confirmed query if present, otherwise does nothing. `n` and `N` then navigate to the next and previous match from the current position. Support numeric prefixes, such as `3n` for the third next match. Wrap at scope boundaries with a brief notice.
- Reveal only the ancestor path needed for the selected result, including an Agenda day when necessary. Keep unrelated folds unchanged. Successive `n`/`N` jumps leave previous search reveals open. On Normal `Esc` after confirmation, close branches opened by search except the path needed to keep the current match visible. Stay at that match. Preserve branches already open before search and manual fold choices.
- Scrolling during query entry preserves prompt focus, query, count and search origin. Confirmation may scroll back to the match reached from that origin.
- Clicking a disclosure chevron while entering a query keeps the prompt active and the logical node/offset origin unchanged, even when the origin becomes hidden; ordinary fold selection rules still apply underneath. Manual fold choices survive query cancellation. Folding alone does not change the search corpus or count. Clicking ordinary node text cancels the draft and performs ordinary selection.
- `Esc` during entry cancels the draft and restores the prior confirmed query. Canceled drafts never replace it. Automatic selected prefill on `/` replaces the earlier proposal to require `Up` for recall.
- Owner-approved interruption policy: losing prompt focus, deactivating the window, or opening the command panel cancels the unconfirmed draft and restores the previous confirmed search. Scrolling and disclosure controls retain the explicitly agreed exceptions above.
- Disabling Vim closes search entry and hides search feedback, while retaining the last confirmed query for recall when Vim is enabled again.
- After confirmation, Normal `Esc` hides search highlighting and count but remembers the query. `n` or `N` restores search feedback. Entering Insert retains highlights; text input is immediate, local highlights update, and asynchronous recount shows a pending indicator instead of a stale number.
- Changing Tree location, switching Tree/Agenda, or entering/leaving a focused day closes active search and retains the last confirmed query for recall.
- Retain only the last confirmed query in memory for the running application session, shared by Tree and Agenda. Do not persist search history or add search fields to saved documents, view state, preferences or backups.

## Architecture and performance direction

The first version has no search index, Worker, new dependency, IPC or persistence schema. Use a pure domain matcher and resumable traversal, an application-owned session and replaceable asynchronous execution contract, and renderer adapters for input, highlighting and focus. Search rules must remain independent of React, DOM, Electron and scheduling APIs. The main-thread scheduler belongs outside the pure domain.

The execution contract identifies each request, document revision and presentation scope. It rejects late results after cancellation, mutation or scope change. Bound work between yields, including work inside unusually long node text and scope enumeration; wrapping a full synchronous scan in a Promise is insufficient. Avoid rebuilding a full unfolded row list or copying all text on each keystroke. Keep count, nearest-match navigation and mounted-row highlighting separate so capped counting does not restrict navigation.

Store stable node identity and text offsets; Agenda destinations also require occurrence identity, including day. Do not key results by DOM nodes or transient visible-row indices. Tree traversal must not use only the fold-filtered visible rows. Agenda must traverse the full current projection before fold filtering. Reuse matching work for repeated real-node text where useful without collapsing distinct occurrence counts or order.

After typing, removal, movement, splitting, joining, date changes, Undo or Redo, results must describe the current text, structure and scope. A moved subtree can change scope and order even with unchanged text. Never navigate with stale identities or offsets. Preserve existing text, history, caret and image-caret ownership rather than introducing a parallel document selection model.

Without active search, ordinary editing must not incur a corpus scan. With active search, local text feedback must not wait for global recount. Bound retained state and cancel obsolete work promptly. Measure both input-to-frame latency and time to current results; responsiveness alone does not excuse excessive result delay. Count saturation optimizes frequent matches, while absent and rare queries still require full traversal.

Future indexing and Worker execution are separate optimizations, not deliverables. Keep the executor replaceable and results serializable; do not build unused worker synchronization or index infrastructure. A future text index would use node IDs independently of ordering and scope. Moving a subtree must not require reindexing unchanged text. Introducing a Worker or index requires measured justification and review of any reserved architecture choice before implementation.

## Approved decisions

The owner approved D1–D5 in the follow-up discussion and requested that they be saved to Git. The agreed behavior above incorporates them. Implementation was subsequently authorized on 2026-10-22. Update PRODUCT and conformance documentation with each implemented stage in the same commit, rather than waiting until the initiative ends or describing unimplemented behavior as available now.

| ID | Decision | Approved resolution |
| --- | --- | --- |
| D1 | Include the editable current-parent heading in Tree search? | Include its text before descendants. Agenda retains its independently specified descendant scope. |
| D2 | What happens to folds opened by successive confirmed `n`/`N` jumps? | Leave them open during navigation. On Normal `Esc`, close search-opened branches except the current match's ancestor path, and stay at that match. Preserve pre-existing expansion and manual fold choices. |
| D3 | Ordinary text click during query entry, and collapsing the ancestor containing the captured origin | A text click cancels the draft and performs ordinary selection. A chevron keeps query entry active and retains the logical node/offset origin even if hidden, while ordinary fold selection rules still apply underneath. |
| D4 | Recall, empty-query confirmation and a match beginning exactly at the origin | `/` prefills and selects the last confirmed query. Typing replaces it; `Enter` repeats it. Empty confirmation reuses the last query if present, otherwise does nothing. A forward jump starts strictly after the caret and may wrap. |
| D5 | Count prefixes, overlapping matches and Unicode position rules | Support numeric prefixes for `n`/`N`, nonoverlapping matches and caret positions at grapheme boundaries. This does not add regex support. |
| D6 | Search origins on Agenda day and gap labels | The owner accepted the examples: forward search starts after the synthetic row, including a day header's contents; reverse search starts before it. Gap origins lie between surrounding days. Wrap at scope boundaries. |
| D7 | Search entry alongside Agenda status | The owner accepted simultaneous display: query field at the left, existing move/date-removal message beside it, and count at the right. Search navigation retains pending moves; Escape retains its existing cancellation rule. |

Other implementation details are delegated only within existing recorded requirements. New capabilities, persistence, architecture boundaries, or competing user-visible interpretations remain reserved under AGENTS §§5–6. The implementation must inventory prompt blur, application commands, IME composition, pending Agenda moves, overlays, Vim disable, scope deletion and read-only contextual rows, and raise any material conflict not settled by existing requirements.

## Task sequence

Working-task count: **4**, excluding this planning commit and eventual closure. Each implementation task uses `WORKING_PLAN.md` for its exact scope, state-transition inventory, temporary evidence and review inputs; remove it before that task's final commit. Update this initiative and index in each task commit.

All runtime tasks provisionally use **High Risk** functional validation because search adds scale-sensitive shared interaction state. Reassess only from the complete actual diff and the risk matrix. Performance scope remains selected separately, as specified below. Do not postpone task-specific tests, screenshots or independent review to T4.

| Task | Outcome | Dependency | Acceptance evidence | Status |
| --- | --- | --- | --- | --- |
| T1 | Pure matching, scope traversal and asynchronous session/executor contracts | Authorized | Rule/property tests, cancellation and revision tests, bounded-work scale guards | Complete |
| T2 | Complete Tree search interaction and rendering | T1 | Real keyboard/pointer/caret flows, inspected screenshots, typing and navigation measurements | Complete |
| T3 | Agenda search using the same session and matching rules | T2 | Projection/occurrence tests, real Agenda transitions and independent folds, visual and scale evidence | Complete |
| T4 | Integrated mutation, lifecycle and performance assessment; delivery for owner acceptance | T3 | Cross-feature stress cases, measured latency/results/memory, consolidated conformance and independent passes | Complete |

### T1 — Search foundation

Expected files: new `src/domain/text-search.ts` and focused unit/property tests; new `src/application/search-session.ts` and `search-executor.ts` with tests; integration with `src/application/editor-store.ts`, `editor-store-types.ts`, `editor-runtime-state.ts`, and scope data in `agenda-rows.ts` where needed. Read nested instructions before changes. Final filenames may change within these owners.

Acceptance: literal punctuation, smart case, Unicode offsets and agreed overlap behavior; deterministic forward/reverse traversal; collapsed descendants; exact/capped counts; cancellation before and during a scan; old query/document/scope responses rejected; single oversized text cannot monopolize the thread; no search persistence; no normal-edit corpus work without active search. Property tests cover traversal order, stable identities and mutation invalidation. Define how queued navigation resolves against current data without stale jumps.

Document delivered contracts in ARCHITECTURE and the relevant implemented requirement boundaries in PRODUCT. Do not advertise a usable search UI before T2/T3. Independent review checks ownership, cancellation and state lifetime. Establish executor-level scale guards during this task.

Delivered: `src/domain/text-search.ts`, `search-scope.ts`, and application `search-executor.ts`/`search-session.ts`, with focused rule, property, cancellation and performance guards. The foundation is intentionally unwired: T2 must connect monotonic document revision invalidation at `EditorRuntimeState.replaceReady`, serialize repeated navigation intents after applying each destination, and preserve the raw match anchor separately from its grapheme caret. T3 must supply the full immutable Agenda projection. Current contracts and performance limits are recorded in ARCHITECTURE.

T1 and the separate owner-performed Electron update passed independent review. Electron 44.9.3 is committed in `638afb1`; audit reports zero vulnerabilities. Validation covered all `npm run check` stages, 857 Electron E2E tests and all 64 Electron performance scenarios. The full performance invocation had one Agenda opening-time failure (164.9 ms against 150 ms); three focused repeats passed at 137.6, 139.7 and 139.2 ms without code or threshold changes. This is absolute-guard evidence, not a pre/post-upgrade speed comparison. No unresolved validation failure remains.

### T2 — Tree interaction

Expected files: `src/renderer/App.tsx`, a new search prompt/controller adapter, `use-node-input-bindings.ts`, `vim-keyboard-handler.ts`, `caret-projection-state.ts`, `NodeInput.tsx`, `NodeRow.tsx`, `NodeList.tsx`, `editor-dom.ts`, relevant styles and tests; application focus/reveal commands through existing store owners; new `e2e/electron/vim-search.spec.ts`; relevant `perf/electron/typing.spec.ts`, `vim.spec.ts`, `expansion.spec.ts` or a focused new search scenario. Update PRODUCT and VIM_CONFORMANCE, and ARCHITECTURE as needed.

Repository finding: `editor-dom.ts` currently drops decorations overlapping links and assumes nonoverlapping decoration ranges. Search must compose link, date and match ranges while preserving original text offsets. `NodeInput.tsx` can switch from a plain editor to rich text when decorations appear; test that the first query update and subsequent Insert/composition edits retain caret and selection. Appending search ranges to the current decoration list is insufficient.

Acceptance: entry from all supported Tree row/caret contexts; prompt input with literal `n`/`N`; live counts/highlights without scroll or expansion; scrolling and manual folds; confirmation, reverse navigation and wrap; more than the count cap remains reachable; cancellation and recall; Insert editing with pending recount; links and decorated text; no link activation when Enter confirms the prompt; standard editing unaffected. Inventory caret/image-return state, same-node jumps, empty nodes and current-parent behavior before implementation.

Inspect real Electron light/dark screenshots of prompt, current and other matches, link/date decoration, folded-result navigation and windowed scrolling. Verify focus remains in the prompt after chevron use. Compare typing without search, draft entry and editing with confirmed search active. Independent reviewer and product verifier are required before commit. Apply PRODUCT §1.3 HIG checks, including keyboard focus, status feedback and unchanged row geometry.

T2 delivered the Tree prompt, live mounted highlights and capped counts, serialized navigation, fold reveal/cleanup and cancellation when newer input takes focus. Independent reviewer and product verifier passed after the stale-navigation correction. All check stages, 863 Electron tests, focused Chrome search and 30 selected Electron performance scenarios passed; the six search cases also passed after restoring selected recall. Light/dark and folded/windowed screenshots were inspected. The owner reported “it works” after the prepared native-keyboard check and retained selected prefill. No unresolved T2 validation failure remains.

### T3 — Agenda integration

Expected files: `src/application/agenda-rows.ts`, `editor-store.ts`, runtime Agenda state, `src/domain/agenda-projection.ts` only if its public pure projection contract needs extension; `src/renderer/AgendaView.tsx`, `AgendaRow.tsx`, `agenda-row-keyboard.ts`, row decoration/controller adapters and tests; new `e2e/electron/agenda-search.spec.ts` and affected existing Agenda specs; `perf/electron/agenda.spec.ts` or focused search scenarios. Update PRODUCT, ARCHITECTURE and VIM_CONFORMANCE.

Acceptance: timeline and focused-day scope; chronological/depth-first ordering; contextual text, active editor and mirrors; repeated day/node occurrences counted independently; collapsed days and projected ancestors revealed without altering Tree folds; synthetic headers excluded from matching but usable as navigation origins; date removal and temporary active-item retention; editing changes every mirror; current scope/root removal; last query recall across presentation changes. Reuse matcher tests; test the projection and runtime wiring instead of duplicating its entire rule matrix.

Inspect actual light/dark contextual/mirror highlighting and focused-result caret geometry. Verify search feedback alongside Agenda's existing date-removal status message. Measure repeated-occurrence scaling and scrolling during search. Independent reviewer and product verifier are required before commit.

T3 delivered occurrence-aware Agenda search, contextual/mirror highlighting, independent
fold reveal/cleanup, focused-day recall, and concurrent status messages. Independent
reviewer and product verifier found no meaningful issues. The owner reported "it works"
after the prepared native-keyboard round, satisfying the T3 pre-commit gate.

All required validation stages passed through composed evidence, including 4452 unit
tests with coverage floors, affected Electron/browser transitions and inspected visuals.
The full Electron attempt had one clipboard mouse-selection failure; its unchanged
isolated rerun passed in both modes. Later affected Agenda tests passed after the wrapped
context reveal correction. No unresolved functional failure remains.

T3 identified narrow performance headroom: repeated Agenda search navigation
exceeded its existing ceiling in some runs, then passed three serial instrumented runs
without production or limit changes. T4 reproduced a repeat-navigation failure and
resolved the dominant scheduler-wait cost within the existing bounded executor.
The retained `.scratch/agenda-search/` directory contains T3 synthetic manual-check
data and the baseline worktree. Retire it through the guarded workflow before closure;
lasting conclusions are in ARCHITECTURE and the maintained performance suite.

### T4 — Integrated assessment and delivery

Expected files: focused domain/application state tests, `e2e/electron/vim-search.spec.ts`, `agenda-search.spec.ts`, affected history/structural specs, focused `perf/electron/` scenarios and owning requirements/conformance documents. Production fixes remain within the approved feature; index/Worker changes are not implicitly authorized by a failed measurement.

Acceptance: query refinement while prior work is pending; rapid next/previous navigation; large branch removal and movement into/out of scope; Undo/Redo; date/projection changes; same-node and image-caret transitions; cancellation, scope switches and application restart without persisted history. Verify query entry, counting and highlighting add no persistence writes/syncs; confirmed navigation and retained Tree folds follow existing view-state persistence. Check for no accumulating abandoned results and no slowdown of ordinary typing as off-screen corpus size grows. Benchmark deep and wide trees, repeated Agenda occurrences, long node text, common single characters, rare/absent phrases, scrolling, unfolding and active-search edits.

Use same-machine before/after baselines. Derive and encode budgets in the owning automated guards; record meaningful measured conclusions in durable owning docs rather than a validation archive. Reuse valid prior evidence and repeat only invalidated checks. Resolve findings before delivery. Then mark this plan and its index `Awaiting owner acceptance`, with delivered commit and concise inspection instructions, rather than retiring them.

Delivered: integrated store tests for structural changes, scope movement, large folded
branch removal, pending query/navigation invalidation and history; real Electron
query-only persistence, restart and Tree/Agenda history coverage; repeated navigation,
deep/long text and cancellation-retention performance guards. Increasing the bounded
executor slice removed the reproduced repeated-navigation budget failure without
changing limits, scheduling architecture or input handling. Ordinary typing remained
responsive across the existing document-scale controls. All required functional,
performance, mutation and audit checks passed. Independent reviewer and product
verifier found no meaningful issues. T2/T3 native-keyboard and HIG evidence remains valid.

## Validation and capability inventory

The original plan-only change was Minimal Risk. T1 retains the planned High Risk validation tier even though its foundation is not wired to runtime input yet.

For each High Risk runtime task, use focused tests during development, then `npm run check`, `npm run test:e2e`, and `npm run audit`. Electron E2E must use host execution from its first invocation under the supported permission mechanism. The primary selects affected real browser coverage when shared renderer changes reach browser-specific input paths. Do not infer a pass from an empty selection. Use `npm run test:perf -- <specs>` for the selected changed costs, not the full performance suite solely because the functional tier is High Risk.

Automated verification must cover each implemented requirement at its fastest reliable level, with real Electron tests for focus/caret/keyboard/pointer/rendering risks. Follow DEVELOPMENT §8's navigation matrix and workflow §9's screenshot inspection rules. Keep ephemeral logs and screenshots under task-owned scratch or suite-owned paths, and retire them through the documented workflow after their final use.

Planning established repository inspection, native file editing and planner read access. T1 additionally verified production build, full host Electron E2E, unit performance guards and independent reviewer access. T2 verified screenshot inspection, Electron performance workflows and separate product-verifier access. Reuse successful capabilities within a session; check T3-specific runtime needs as they arise.

DEVELOPMENT §9, Validation Evidence and Reuse, explicitly requires changed input handling to be checked by hand in `npm run dev` with a real keyboard. Available session tools do not provide that physical input capability; Playwright or synthetic system events do not substitute. Plan owner checks before T2 and T3 commits. The primary prepares isolated synthetic data and concrete steps first. Only demonstrated access satisfying the same requirement can remove this owner dependency.

## Owner involvement and budget

- Current authorization: implement the initiative, starting with T1, as explicitly approved on 2026-10-22. D1–D5 remain approved.
- Implementation allowance: the four working tasks, their required checks and in-scope review corrections, at most four task commits per primary session. Use the workflow limit of two unsuccessful recovery attempts at the same blocker without new evidence before escalation. No token or elapsed-time allowance has been approved or invented.
- Proposed separate closure allowance: one documentation retirement commit after explicit acceptance of the unchanged delivered result. Waiting for acceptance does not consume implementation allowance.
- Expected remaining owner involvement: one final acceptance round after T4. T2 and T3 native-keyboard checks are complete. D1–D7 and implementation are settled and do not need renewed approval. The owner updated Electron to 44.9.3; validation resolved the audit blocker. Missing runtime capabilities or material newly discovered conflicts may add rounds. Reuse valid checks unless later changes invalidate their input paths.

| Gate | Owner action | Reason and timing |
| --- | --- | --- |
| Before T2 commit — complete | Owner checked the prepared Tree instance and reported “it works” | Selected recall retained after owner comparison; the prepared steps covered search, cancellation, held keys and applicable native input. |
| Before T3 commit — complete | Owner checked the prepared Agenda instance and reported "it works" | The prepared round covered contextual/mirror destinations, editing, recall, repeated keys, focused days and pending moves. |
| After T4 | Inspect the delivered result using concrete commit-bound instructions and accept or report issues | Four substantive tasks trigger workflow §8 final acceptance. This is distinct from automated verification. |

## Exact next action and continuation

Next action: await explicit owner acceptance of the T4 delivery commit containing this
status update. The conversation delivery report identifies that commit. Do not infer
acceptance from another generic continuation. After acceptance, retire the retained
task scratch directory and this plan/index entry in the authorized closure commit.

For final inspection, use the delivered revision in Tree and Agenda: enter a literal
query with `/`, navigate with `n` and `N`, and confirm that folded results are revealed.
Edit a matching node and use Undo/Redo; check that counts reflect current content.
Cancel a draft and reopen `/` to check confirmed-query recall. The prior isolated
synthetic profile remains available through
`npm run dev -- -- --user-data-dir=/Users/andrew/work/tree/.scratch/agenda-search/manual-profile`.
This is final acceptance of the delivered feature, not a repeat of the passed native
keyboard gate. Report acceptance or concrete remaining issues.

Preserve the four-task acceptance gate even if engineering boundaries later combine tasks.

Copyable continuation prompt:

> Continue the Vim text-search initiative in `plans/vim-text-search.md`. Implementation T1–T4 is complete and awaits explicit owner acceptance. Recover any later acceptance or issue report before taking the next action. Speak simple Russian with the owner and write repository content in English.
