# Starred View Review Follow-ups

Status: In progress

## Source and authorization

Source: the owner's review of `577031e` (`feat(tree): remember folds per starred node view`), received on 2026-11-20. It reported four defects reproduced through `EditorStore` commands and one false failure of the new property test. On 2026-11-20 the owner authorized correcting all five items. This approval covers implementation, regression coverage, required documentation, validation and normal validated commits under repository policy. It does not cover product behavior beyond `docs/PRODUCT.md` §2.4 as recorded in `577031e`.

The list below is the complete list the review provided. No unverified remainder is known. Review-batch closure requires the owner's confirmation that no tasks remain (`docs/AGENT_WORKFLOW.md` §8). No manual owner check is expected before a commit. Do not publish or push.

`npm run fix:history` reported three or more recent fix commits in `src/application/editor-search.ts` and `src/application/editor-store.ts`. Those earlier fixes concern updates, Find with the active editor, saves and Agenda navigation; they do not share a cause with this batch. The shared cause inside this batch, view activation at the wrong moment, is resolved by R1.

## Tasks

| ID | Review item | Outcome | Status |
| --- | --- | --- | --- |
| R1 | 2, 3 | Tree activates a starred view only for the final displayed location, then checks the selection against that view | Done |
| R2 | 1 | Find releases its fold ownership when the active view changes | Ready |
| R3 | 4 | Views of nodes that neither the document nor undo history contains are dropped | Planned |
| R4 | 5 | The starred-view property test always exercises a starred view | Planned |

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

### R3: Bound dormant views

- Defect: `ExpansionState.otherViews` keeps views of deleted nodes after undo history evicts them, and every view switch copies the whole map.
- Rule: drop a dormant view when its owner exists neither in the current document nor in a document held by undo or redo history. This keeps both promises of `docs/PRODUCT.md` §2.4 line "Undo restores the star and its view; starring the node again in the same session also restores the view".
- Files: `src/application/expansion-state.ts`, `src/application/editor-store.ts` and/or `src/application/editor-history.ts`, focused tests, a scale guard, `docs/ARCHITECTURE.md` if it states the retention rule.
- Acceptance: 500 create/star/enter/delete cycles leave a bounded number of views; undo within history still restores a deleted node's view; re-starring an existing node in the session restores its view.
- Validation: High Risk (scale-sensitive state): `npm run check`, full `npm run test:e2e`, `npm run audit`.
- Review: independent review.

### R4: Deterministic starred-view coverage

- Defect: `FC_SEED=1 TREE_PROPERTY_RUNS=0.001` fails because no generated sequence enters a starred node.
- Files: `src/application/editor-store-starred-views.property.test.ts`.
- Acceptance: the property passes for reduced run counts and seeds, and an explicit case enters a starred node.
- Validation: Low Risk: focused property run with the failing seed, `npm run check`.

## Owner involvement

Four working tasks. No manual check before a commit. After R4, the owner confirms that no further follow-up remains; that confirmation authorizes removing this plan and its index row.

## Next task

R2.

## Resume prompt

Continue the starred view review follow-ups in `plans/starred-views-review-fixes.md` from its next task.
