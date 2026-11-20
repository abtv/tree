# Starred View Review Follow-ups

Status: Awaiting owner confirmation

## Source and authorization

Source: the owner's review of `577031e` (`feat(tree): remember folds per starred node view`), received on 2026-11-20. It reported four defects reproduced through `EditorStore` commands and one false failure of the new property test. On 2026-11-20 the owner authorized correcting all five items. This approval covers implementation, regression coverage, required documentation, validation and normal validated commits under repository policy. It does not cover product behavior beyond `docs/PRODUCT.md` §2.4 as recorded in `577031e`.

The owner's second review of `577031e..8606e59`, received on 2026-11-20, confirmed items 1–3 and found remaining problems in items 4 and 5. The owner authorized correcting them as R5 and R6. These are immediate follow-ups to committed fixes (`docs/AGENT_WORKFLOW.md` §12): the owner verifies the uncommitted result of R5 and R6 before any commit.

The list below is the complete list the reviews provided. No unverified remainder is known. Review-batch closure requires the owner's confirmation that no tasks remain (`docs/AGENT_WORKFLOW.md` §8). Do not publish or push.

`npm run fix:history` reported three or more recent fix commits in `src/application/editor-search.ts` and `src/application/editor-store.ts`. Those earlier fixes concern updates, Find with the active editor, saves and Agenda navigation; they do not share a cause with this batch. The shared cause inside this batch, view activation at the wrong moment, is resolved by R1.

## Tasks

| ID | Review item | Outcome | Status |
| --- | --- | --- | --- |
| R1 | 2, 3 | Tree activates a starred view only for the final displayed location, then checks the selection against that view | Done |
| R2 | 1 | Find releases its fold ownership when the active view changes | Done |
| R3 | 4 | Views of nodes that neither the document nor undo history contains are dropped | Done |
| R4 | 5 | The starred-view property test always exercises a starred view | Done |
| R5 | 4 (second review) | Views of deleted nodes are dropped as soon as no undo or redo snapshot holds the node, without walking documents | Done |
| R6 | 5 (second review) | The property test has no run-count-dependent assertion; a deterministic test enters a starred node | Done |

### R1: Activate the view of the final location

- Defects: closing Agenda checks the selection against the view that was active before the close (`closeAgenda`), so a task the new view shows can select its parent with the caret at 0. With finished tasks hidden, a location that is immediately relocated (undo, launch) creates a starred view that later shadows the inherited view at the first real entry.
- Files: `src/application/editor-runtime-state.ts`, `src/application/editor-store.ts` (`closeAgenda`, `initialize`), `src/application/finished-task-location.ts`, `src/application/editor-store-starred-views.test.ts`.
- Acceptance: regressions fail before the fix and pass after it: Agenda close after two undos keeps the task and caret; an undo relocated by hidden finished tasks and a launch inside a hidden finished starred node create no view. Existing Agenda, hidden-finished and starred-view tests pass.
- Validation: High Risk, because the launch publication changed: `npm run check`, full `npm run test:e2e`, `npm run audit`.
- Review: independent review (shared interaction state) and product verification of the Agenda and hidden-finished transitions.
- Result: `EditorRuntimeState.showTreeLocation` chooses the final parent first (`unfinishedParentId`), activates only its view, then normalizes and relocates. `closeAgenda` and `initialize` pass the unnormalized location. Validation, review and product verification passed; the dependency audit has only the standing development-only minimatch findings.

### R2: Release Find fold ownership on a view change

- Defect: Find records the folds it opened without their view. After a star change switches the active view, closing Find closes those ids in the new view, including folds the user opened there.
- Files: `src/application/editor-search.ts`, a focused store test (`src/application/editor-store-starred-views.test.ts` or the Find store tests).
- Acceptance: the review scenario keeps the manually opened fold of the root view after Find closes; Find still closes its own folds when the view does not change.
- Validation: Moderate Risk: `npm run check`, focused Find E2E.
- Review: independent review (shared interaction state).
- Result: `EditorSearch.update` clears its fold ownership when the active view owner changes, as it already did on a location change. Folds Find opened stay open in the view it left. Validation and independent review passed; the primary agent verified the contained Find flow.

### R3: Bound dormant views

- Defect: `ExpansionState.otherViews` keeps views of deleted nodes after undo history evicts them, and every view switch copies the whole map.
- Rule: drop a dormant view when its owner exists neither in the current document nor in a document held by undo or redo history. This keeps both promises of `docs/PRODUCT.md` §2.4 line "Undo restores the star and its view; starring the node again in the same session also restores the view".
- Files: `src/application/expansion-state.ts`, `src/application/editor-store.ts` and/or `src/application/editor-history.ts`, focused tests, a scale guard, `docs/ARCHITECTURE.md` if it states the retention rule.
- Acceptance: 500 create/star/enter/delete cycles leave a bounded number of views; undo within history still restores a deleted node's view; re-starring an existing node in the session restores its view.
- Validation: High Risk (scale-sensitive state): `npm run check`, full `npm run test:e2e`, `npm run audit`.
- Review: independent review.
- Result: `ExpansionViewRetention` (`src/application/expansion-view-retention.ts`) runs when `EditorHistory.begin` releases snapshots. It walks history only after the number of views of absent nodes reaches a doubling threshold, and the walk skips subtrees the document shares. ADR 0028 records the amended retention rule. Validation passed; review found only the stale ADR sentence, now corrected.

### R4: Deterministic starred-view coverage

- Defect: `FC_SEED=1 TREE_PROPERTY_RUNS=0.001` fails because no generated sequence enters a starred node.
- Files: `src/application/editor-store-starred-views.property.test.ts`.
- Acceptance: the property passes for reduced run counts and seeds, and an explicit case enters a starred node.
- Validation: Low Risk: focused property run with the failing seed, `npm run check`.
- Result: an explicit fast-check example enters a starred root, and fast-check runs examples on every run. With the example disabled, `FC_SEED=1 TREE_PROPERTY_RUNS=0.001` fails as reported; with it, that seed, another reduced-run seed and the default run pass. Typecheck and lint pass.

### R5: Record departed view owners in undo history

- Defects in R3's `ExpansionViewRetention`: (1) after a separate edit, deleting a branch with 500 saved views and then creating and deleting 500 unstarred nodes keeps all 500 views, although no undo state holds the branch; the first scan found every view still reachable and raised its threshold to 1,000, so later evictions skipped the scan. (2) With 50,000 roots, deleting a branch with 32 saved views and then making 200 separate edits of one node makes the 200th `EditorStore.editText` walk the roots of 200 snapshots synchronously: median 144 ms against 0.76 ms at `577031e`.
- Preserve: hundreds of starred create/enter/delete cycles keep a bounded number of views; Undo and Redo restore a deleted node's view; starring an existing node again restores its view.
- Rule: each history snapshot stores the view owners whose nodes left the document when a change, undo or redo replaced it. That snapshot is the last history state that can restore them, so their views are dropped when history releases it, unless the document holds the nodes again. No document walk, no threshold, and no per-snapshot set of every owner.
- Owner's check of the first uncommitted result, received on 2026-11-20: R6 is confirmed. Two R5 regressions must be fixed before the commit: (3) releasing the Tree view that Agenda keeps active changed the active owner, and `EditorSearch.update` then forgot the Agenda days Find had opened, so closing Find left an earlier day open; (4) recording every snapshot's complete owner set made the edit that discards a redo branch of 200 different sets with 10,000 views take 36 ms against 0.36 ms at `8606e59`.
- Files: `src/application/editor-history.ts`, `src/application/expansion-view-retention.ts`, `src/application/editor-store.ts`, `src/application/editor-search.ts`, `src/application/expansion-state.ts` (`otherViews` comment), focused tests, timing guards, `docs/decisions/0028-expansion-views-of-starred-nodes.md`, `docs/ARCHITECTURE.md`.
- Acceptance: regressions fail before the change and pass after it: the bulk deletion drops every view once history no longer holds the branch; the 200th edit on 50,000 roots and the edit that discards the varied redo branch stay within one frame; a Tree view released under Agenda is dropped and Agenda Find still closes the days it opened. The R3 store tests still pass.
- Validation: High Risk (scale-sensitive state), as R3: `npm run check`, `npm run test:performance` for the new guards, full `npm run test:e2e`, `npm run audit`.
- Review: independent review.
- Result (uncommitted): `departedViewOwners` stores the departed owners with each snapshot and `EditorHistory` reports them when it releases the snapshot; `releaseViews` drops the views the document lacks and replaces a released active view, which only Agenda keeps, with the root view. `EditorSearch.update` forgets its opened folds on a view change only while Tree is displayed. Regressions: bulk deletion, the redo-branch discard, the Agenda leak found by the independent review, Agenda Find, and two timing guards: 149 ms before and under 1 ms after on 50,000 roots; 43 ms before and 0.2 ms after for the varied redo branch. A history property checks that an absent node keeps its view exactly while a retained snapshot holds it, and the store property checks that no undo or redo state restores a node whose view was dropped. On 2026-11-20 the owner confirmed the corrected result and asked to state the limits of the cost estimate: dropping a view copies the inactive-view map, and recording a structural change may build the replacement's node index. ARCHITECTURE.md and ADR 0028 now state them. R5 and R6 share one commit because the property test file carries changes for both.

### R6: Deterministic starred-view entry

- Defect: fast-check counts the explicit example towards the run limit. With `FC_SEED=1 FC_PATH=1 TREE_PROPERTY_RUNS=0.001` the example does not run, and the final `exercisedStarredView` assertion fails falsely.
- Files: `src/application/editor-store-starred-views.property.test.ts`.
- Acceptance: the property has no assertion that depends on the run count or replay path; a separate deterministic test enters a starred node with the same view and save-restore checks. The reported command passes.
- Validation: Low Risk: the reported command, a default property run, `npm run check` (shared with R5).
- Result (uncommitted): the property has no example and no trailing assertion. `checkViews` runs the shared checks; one deterministic test enters a starred root, another drops the view of a node that only a discarded redo branch held. The reported command failed before the change and passes after it.

## Owner involvement

Six working tasks. The owner checked the uncommitted R5 and R6 before their commit. The owner now confirms that no further follow-up remains; that confirmation authorizes removing this plan and its index row.

## Next task

None. All six tasks are committed. The owner confirms that no further follow-up from the reviews remains; that confirmation authorizes removing this plan and its index row. No renewed implementation approval or manual application check is required.

## Resume prompt

Close the starred view review follow-ups in `plans/starred-views-review-fixes.md` once the owner confirms that no follow-up remains.
