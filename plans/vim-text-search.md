# Vim Text Search

Status: Planned — plan recording authorized; implementation not yet authorized.

## Objective and authorization

Deliver literal text search in Vim Normal mode across Tree and Agenda, with live highlighting and bounded counts, explicit navigation, and responsive editing on large documents.

The owner approved the behavior recorded below in conversation and then asked to record a multi-task initiative plan. That request authorizes this plan and its index entry, not runtime implementation. The selected coding tool is Codex. No prototype or implementation has been made. Planning started from clean commit `f5b911f` with no working plan or other indexed initiative.

Priority: prompt visible feedback for typing, scrolling, folding and navigation; correct results after edits and structural changes; ordinary Vim conventions except the explicitly agreed differences. Do not trade correctness for a stale count or stale navigation target.

Sources of truth: [PRODUCT](../docs/PRODUCT.md) §§1.1–1.3, 2.4, 13, 20.1–20.2, 20.7–20.8, 22 and 23; [ARCHITECTURE](../docs/ARCHITECTURE.md); [VIM_CONFORMANCE](../docs/VIM_CONFORMANCE.md); [DEVELOPMENT](../docs/DEVELOPMENT.md) §§8–12; [workflow procedures](../docs/AGENT_WORKFLOW.md) §§5, 8–14. This plan records agreed future scope; it does not claim that current product requirements already support search. PRODUCT §20.2.26 currently excludes document search. Update the owning requirements and conformance evidence as implementation lands.

## Agreed behavior

### Matching and scope

- Search is literal, with no regular expressions. Smart case ignores case for a query without uppercase letters and respects case when it contains uppercase letters.
- Search node text, including displayed HTTP(S) URL text and phrases crossing a link boundary within one node. Do not search linked websites or match across node boundaries.
- Tree searches the current location, including descendants hidden by folds. Resolve the current-parent heading detail below before implementing its adapter.
- Agenda searches its current projection, including collapsed days and branches. Focused-day presentation limits search to that day. Include real-node text in contextual ancestors; exclude synthetic day and gap labels. Count each displayed occurrence separately when a node appears on several days.
- Traverse depth-first in display order: node, descendants, next sibling. Agenda visits days in timeline order and their projected hierarchies in depth-first order. Within text, navigate in text order; reverse navigation reverses this order.

### Query entry and navigation

- `/` in Normal opens a search field in the bottom status area without moving the tree layout. Opening search from Visual, backward entry with `?`, and search as an operator motion are outside this version.
- While typing, update the count and highlight matches in mounted text, including rows that become visible through scrolling or manual expansion. Do not move the document caret, scroll to a match, or automatically unfold anything.
- Stop exact counting when the 101st match is found and show `100+` without a current ordinal. This cap never limits navigation or visible highlighting. At most 100 matches have an exact total; after navigation show the current ordinal and total, such as `3 / 8`.
- `Enter` confirms the query and navigates forward from the origin captured at query entry. `n` and `N` then navigate to the next and previous match from the current position. Wrap at scope boundaries with a brief notice. Resolve exact origin inclusion and empty-query behavior below.
- Reveal only the ancestor path needed for the selected result, including an Agenda day when necessary. Keep unrelated folds unchanged. The earlier temporary-reveal proposal requires the lifecycle clarification below now that typing itself never reveals results.
- Scrolling during query entry preserves prompt focus, query, count and search origin. Confirmation may scroll back to the match reached from that origin.
- Clicking a disclosure chevron while entering a query keeps the prompt active and the origin unchanged. Manual fold choices survive query cancellation. Folding alone does not change the search corpus or count. Resolve selected-origin collapse and ordinary text clicks below.
- `/` followed by `Up` recalls the last confirmed query for editing. `Esc` during entry cancels the draft and restores the prior confirmed query. Canceled drafts never replace it.
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

## Decisions to settle before implementation

No new product decisions are silently approved by this plan. The following are material ambiguities or interactions to consolidate in the implementation-start discussion. Recommendations are proposals only.

| ID | Decision | Proposed resolution and reason |
| --- | --- | --- |
| D1 | Include the editable current-parent heading in Tree search? | Include its text before descendants, since it is visible editable content of the current location. Agenda retains its independently specified descendant scope. |
| D2 | What happens to folds opened by successive confirmed `n`/`N` jumps? | Keep paths opened by confirmed navigation. No draft-time automatic reveals exist to restore; manual folds always survive. This needs explicit resolution against the earlier temporary-reveal suggestion. |
| D3 | Ordinary text click during query entry, and collapsing the ancestor containing the captured origin | A text click cancels the draft and performs ordinary selection. A chevron keeps query entry active and retains the logical node/offset origin even if hidden, while ordinary fold selection rules still apply underneath. |
| D4 | Empty-query confirmation and a match beginning exactly at the origin | Follow ordinary forward Vim search: an empty confirmed query reuses the last confirmed query if present, otherwise does nothing; a forward jump starts strictly after the caret and may wrap. Confirm this before defining exact ordinal tests. |
| D5 | Count prefixes, overlapping matches and Unicode position rules | Resolve against current Vim fidelity and visible-character requirements before coding. Do not silently turn this into regex support or broaden the command family. |

Other implementation details are delegated only within existing recorded requirements. New capabilities, persistence, architecture boundaries, or competing user-visible interpretations remain reserved under AGENTS §§5–6. The implementation must inventory prompt blur, application commands, IME composition, pending Agenda moves, overlays, Vim disable, scope deletion and read-only contextual rows, and raise any material conflict not settled by existing requirements.

## Task sequence

Working-task count: **4**, excluding this planning commit and eventual closure. Each implementation task uses `WORKING_PLAN.md` for its exact scope, state-transition inventory, temporary evidence and review inputs; remove it before that task's final commit. Update this initiative and index in each task commit.

All runtime tasks provisionally use **High Risk** functional validation because search adds scale-sensitive shared interaction state. Reassess only from the complete actual diff and the risk matrix. Performance scope remains selected separately, as specified below. Do not postpone task-specific tests, screenshots or independent review to T4.

| Task | Outcome | Dependency | Acceptance evidence | Status |
| --- | --- | --- | --- | --- |
| T1 | Pure matching, scope traversal and asynchronous session/executor contracts | Implementation authorization and decisions above | Rule/property tests, cancellation and revision tests, bounded-work scale guards | Planned |
| T2 | Complete Tree search interaction and rendering | T1 | Real keyboard/pointer/caret flows, inspected screenshots, typing and navigation measurements | Planned |
| T3 | Agenda search using the same session and matching rules | T2 | Projection/occurrence tests, real Agenda transitions and independent folds, visual and scale evidence | Planned |
| T4 | Integrated mutation, lifecycle and performance assessment; delivery for owner acceptance | T3 | Cross-feature stress cases, measured latency/results/memory, consolidated conformance and independent passes | Planned |

### T1 — Search foundation

Expected files: new `src/domain/text-search.ts` and focused unit/property tests; new `src/application/search-session.ts` and `search-executor.ts` with tests; integration with `src/application/editor-store.ts`, `editor-store-types.ts`, `editor-runtime-state.ts`, and scope data in `agenda-rows.ts` where needed. Read nested instructions before changes. Final filenames may change within these owners.

Acceptance: literal punctuation, smart case, Unicode offsets and agreed overlap behavior; deterministic forward/reverse traversal; collapsed descendants; exact/capped counts; cancellation before and during a scan; old query/document/scope responses rejected; single oversized text cannot monopolize the thread; no search persistence; no normal-edit corpus work without active search. Property tests cover traversal order, stable identities and mutation invalidation. Define how queued navigation resolves against current data without stale jumps.

Document delivered contracts in ARCHITECTURE and the relevant implemented requirement boundaries in PRODUCT. Do not advertise a usable search UI before T2/T3. Independent review checks ownership, cancellation and state lifetime. Establish executor-level scale guards during this task.

### T2 — Tree interaction

Expected files: `src/renderer/App.tsx`, a new search prompt/controller adapter, `use-node-input-bindings.ts`, `vim-keyboard-handler.ts`, `caret-projection-state.ts`, `NodeInput.tsx`, `NodeRow.tsx`, `NodeList.tsx`, `editor-dom.ts`, relevant styles and tests; application focus/reveal commands through existing store owners; new `e2e/electron/vim-search.spec.ts`; relevant `perf/electron/typing.spec.ts`, `vim.spec.ts`, `expansion.spec.ts` or a focused new search scenario. Update PRODUCT and VIM_CONFORMANCE, and ARCHITECTURE as needed.

Repository finding: `editor-dom.ts` currently drops decorations overlapping links and assumes nonoverlapping decoration ranges. Search must compose link, date and match ranges while preserving original text offsets. `NodeInput.tsx` can switch from a plain editor to rich text when decorations appear; test that the first query update and subsequent Insert/composition edits retain caret and selection. Appending search ranges to the current decoration list is insufficient.

Acceptance: entry from all supported Tree row/caret contexts; prompt input with literal `n`/`N`; live counts/highlights without scroll or expansion; scrolling and manual folds; confirmation, reverse navigation and wrap; more than the count cap remains reachable; cancellation and recall; Insert editing with pending recount; links and decorated text; no link activation when Enter confirms the prompt; standard editing unaffected. Inventory caret/image-return state, same-node jumps, empty nodes and current-parent behavior before implementation.

Inspect real Electron light/dark screenshots of prompt, current and other matches, link/date decoration, folded-result navigation and windowed scrolling. Verify focus remains in the prompt after chevron use. Compare typing without search, draft entry and editing with confirmed search active. Independent reviewer and product verifier are required before commit. Apply PRODUCT §1.3 HIG checks, including keyboard focus, status feedback and unchanged row geometry.

### T3 — Agenda integration

Expected files: `src/application/agenda-rows.ts`, `editor-store.ts`, runtime Agenda state, `src/domain/agenda-projection.ts` only if its public pure projection contract needs extension; `src/renderer/AgendaView.tsx`, `AgendaRow.tsx`, `agenda-row-keyboard.ts`, row decoration/controller adapters and tests; new `e2e/electron/agenda-search.spec.ts` and affected existing Agenda specs; `perf/electron/agenda.spec.ts` or focused search scenarios. Update PRODUCT, ARCHITECTURE and VIM_CONFORMANCE.

Acceptance: timeline and focused-day scope; chronological/depth-first ordering; contextual text, active editor and mirrors; repeated day/node occurrences counted independently; collapsed days and projected ancestors revealed without altering Tree folds; synthetic headers excluded from matching but usable as navigation origins; date removal and temporary active-item retention; editing changes every mirror; current scope/root removal; last query recall across presentation changes. Reuse matcher tests; test the projection and runtime wiring instead of duplicating its entire rule matrix.

Inspect actual light/dark contextual/mirror highlighting and focused-result caret geometry. Verify search feedback alongside Agenda's existing date-removal status message. Measure repeated-occurrence scaling and scrolling during search. Independent reviewer and product verifier are required before commit.

### T4 — Integrated assessment and delivery

Expected files: focused domain/application state tests, `e2e/electron/vim-search.spec.ts`, `agenda-search.spec.ts`, affected history/structural specs, focused `perf/electron/` scenarios and owning requirements/conformance documents. Production fixes remain within the approved feature; index/Worker changes are not implicitly authorized by a failed measurement.

Acceptance: query refinement while prior work is pending; rapid next/previous navigation; large branch removal and movement into/out of scope; Undo/Redo; date/projection changes; same-node and image-caret transitions; cancellation, scope switches and application restart without persisted history. Verify query entry, counting and highlighting add no persistence writes/syncs; confirmed navigation and retained Tree folds follow existing view-state persistence. Check for no accumulating abandoned results and no slowdown of ordinary typing as off-screen corpus size grows. Benchmark deep and wide trees, repeated Agenda occurrences, long node text, common single characters, rare/absent phrases, scrolling, unfolding and active-search edits.

Use same-machine before/after baselines. Derive and encode budgets in the owning automated guards; record meaningful measured conclusions in durable owning docs rather than a validation archive. Reuse valid prior evidence and repeat only invalidated checks. Resolve findings before delivery. Then mark this plan and its index `Awaiting owner acceptance`, with delivered commit and concise inspection instructions, rather than retiring them.

## Validation and capability inventory

This plan-only change is Minimal Risk: `npm run format:check:changed`, `npm run check:docs`, and primary diff review. It does not require runtime tests or an independent implementation review.

For each High Risk runtime task, use focused tests during development, then `npm run check`, `npm run test:e2e`, and `npm run audit`. Electron E2E must use host execution from its first invocation under the supported permission mechanism. The primary selects affected real browser coverage when shared renderer changes reach browser-specific input paths. Do not infer a pass from an empty selection. Use `npm run test:perf -- <specs>` for the selected changed costs, not the full performance suite solely because the functional tier is High Risk.

Automated verification must cover each implemented requirement at its fastest reliable level, with real Electron tests for focus/caret/keyboard/pointer/rendering risks. Follow DEVELOPMENT §8's navigation matrix and workflow §9's screenshot inspection rules. Keep ephemeral logs and screenshots under task-owned scratch or suite-owned paths, and retire them through the documented workflow after their final use.

Planning capabilities: repository read/search, clean Git inspection, native file editing and the fresh-context configured planner's read access were verified in this session. Runtime builds, Electron launch, screenshot capture/inspection, performance workflows and separate implementation review/verifier access are not established by this plan. Verify them at implementation startup and first required use; report a missing mandatory capability promptly.

DEVELOPMENT §9, Validation Evidence and Reuse, explicitly requires changed input handling to be checked by hand in `npm run dev` with a real keyboard. Available session tools do not provide that physical input capability; Playwright or synthetic system events do not substitute. Plan owner checks before T2 and T3 commits. The primary prepares isolated synthetic data and concrete steps first. Only demonstrated access satisfying the same requirement can remove this owner dependency.

## Owner involvement and proposed budget

- Current authorization: record and validate this plan only. Implementation-start approval must cover the final settled decisions and initiative scope; a status label is never approval.
- Proposed implementation allowance: the four working tasks, their required checks and in-scope review corrections, at most four task commits per primary session. Use the workflow limit of two unsuccessful recovery attempts at the same blocker without new evidence before escalation. No token or elapsed-time allowance has been approved or invented.
- Proposed separate closure allowance: one documentation retirement commit after explicit acceptance of the unchanged delivered result. Waiting for acceptance does not consume implementation allowance.
- Expected owner involvement: one consolidated decision/implementation-authorization round before T1, two planned pre-commit native-keyboard verification rounds at T2 and T3, and one final acceptance round after T4. Missing runtime capabilities or material newly discovered conflicts may add rounds. Reuse valid checks unless later changes invalidate their input paths.

| Gate | Owner action | Reason and timing |
| --- | --- | --- |
| Before T1 | Resolve D1–D5 and authorize the initiative with its proposed budget | These determine behavior or execution scope not settled by plan-recording approval. |
| Before T2 commit | In the prepared Tree instance, type/refine a query, cancel/recall it, hold navigation keys, and exercise applicable native composition/autocorrection while editing | DEVELOPMENT §9 requires real-keyboard evidence; expect literal input, responsive repeats, stable prompt/caret and no composition loss. |
| Before T3 commit | Repeat the distinct Agenda input paths, including contextual/mirror destinations and editing the active occurrence | The separate Agenda handlers and read-only row paths require their own real-keyboard verification before commit. |
| After T4 | Inspect the delivered result using concrete commit-bound instructions and accept or report issues | Four substantive tasks trigger workflow §8 final acceptance. This is distinct from automated verification. |

## Exact next action and continuation

Next action: consolidate D1–D5 with the owner and obtain implementation authorization. **No implementation task is Ready yet.** Do not select another initiative or an open question as a substitute.

After that approval, record the answers, mark T1 Ready, verify required capabilities and execute T1. Preserve the four-task acceptance gate even if engineering boundaries later combine tasks.

Copyable continuation prompt:

> Continue planning the Vim text-search initiative in `plans/vim-text-search.md`. Recover repository state and recorded authorization first. The plan was authorized for recording only; resolve its pending behavior decisions and obtain initiative implementation approval before starting T1. Speak simple Russian with the owner and write repository content in English.
