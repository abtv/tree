# Vim Interaction Quality

## Objective and authority

Reduce Vim-mode defects that escape automation, particularly caret, image, focus, and interrupted editing transitions, while reducing redundant end-to-end test cost. The Product Owner requested this multi-session plan; implementation has not yet been requested. A later request to continue this initiative authorizes its next ready task within the boundaries below.

Current user-visible behavior is owned by [Product Requirements §20.2](../docs/PRODUCT.md#202-vim-inspired-editing). The existing interaction architecture is described in [Architecture](../docs/ARCHITECTURE.md), the navigation test contract in [Development Guide §8](../docs/DEVELOPMENT.md#navigation-and-caret-changes), and current requirement-to-test coverage in [Vim Conformance](../docs/VIM_CONFORMANCE.md). These documents take precedence over this plan.

## Boundaries

* Preserve specified Vim behavior, document and persistence models, and process boundaries. Fix a demonstrated inconsistency only after reproducing it and adding a regression test.
* Keep any new transition model pure and renderer-local within the existing architecture unless the Product Owner approves a larger architectural change.
* Keep E2E tests that prove a distinct Electron boundary or rendered state. Remove or consolidate a test only after demonstrating equivalent coverage and comparing runtime.
* Do not turn unsupported Vim features into requirements. Escalate material behavior choices or conflicts with `docs/PRODUCT.md`.
* Complete one task per session and commit, using the repository's validation, independent review, product verification, and handoff requirements.

## Tasks

| ID | Outcome and acceptance evidence | Depends on | Status |
| --- | --- | --- | --- |
| VIM-1 | Inventory the historical escaped defects as reproducible input/state/expected-result sequences; map each to its state writers and existing tests. Measure the focused unit and E2E suites with exact commands and environment. Record a baseline and identify distinct E2E boundary/visual coverage. Do not remove tests. | None | Ready |
| VIM-2 | Define an explicit contract for selected node, mode, text or image caret, saved image return position, focus intent, and no-op transitions. Add characterization tests for historical sequences where needed; show they fail against the faulty revision or a bypassed fix when practical. Review the contract against `docs/PRODUCT.md` and VIM-1 before changing state ownership. | VIM-1 | Planned |
| VIM-3 | Implement and test a pure renderer-local caret transition model for the VIM-2 contract. Integrate only horizontal motion and same-node text/image entry and exit; keep remaining paths working through a documented compatibility adapter. Prove the affected historical sequences still pass. | VIM-2 | Planned |
| VIM-4 | Route vertical and counted navigation, store focus intents, pointer focus, and no-op boundaries through the transition model. Establish one authority for the image caret and saved return position on these paths; make DOM caret classes a rendering result. Prove same-node and cross-node histories and representative real-Electron visuals. | VIM-3 | Planned |
| VIM-5 | Route edit, Visual, undo/redo, and node entry/exit caret updates through that authority. Remove redundant resynchronization calls only when their callers have focused coverage. Prove all inventoried historical caret failures and representative Electron paths pass. | VIM-4 | Planned |
| VIM-6 | Give Insert and Replace sessions one completion policy for Escape, blur, shortcuts, navigation, undo, and redo. Test whether a pending edit commits or discards, command ordering, resulting mode, focus, and caret. Include the historical Replace-plus-undo sequence. | VIM-5 | Planned |
| VIM-7 | Generate mixed event sequences against production transition logic with an independent expected-state model. Cover counts, empty/image-only nodes, cross-node motion, boundaries, focus changes, edits, interruptions, and history. Preserve every found failure as a deterministic seed; keep the fast suite bounded and reproducible. | VIM-5, VIM-6 | Planned |
| VIM-8 | Audit and consolidate redundant Vim E2E cases only where fast tests now cover the rule and retained E2E cases still prove the real boundary or pixels. Compare suite runtime with VIM-1 and document any tradeoff or remaining manual check. Update durable development guidance, then remove this completed active plan and its index row in the final commit. | VIM-7 | Planned |

Each task must determine its own highest applicable validation tier from `docs/DEVELOPMENT.md` §9. A caret or rendered-pixel change also requires representative real-Electron screenshot inspection. The temporary `WORKING_PLAN.md` holds the per-task transition inventory, exact validation record, and visual evidence; those are not copied into this durable plan unless a finding affects a later task.

## Current state and next task

Status: Awaiting implementation request. No VIM task has started. The repository had a clean worktree when this plan was created. The first task is **VIM-1**. Later sessions should verify Git status and plan state before acting.

Next-session prompt: “Continue the Vim interaction quality plan in `plans/vim-interaction-quality.md`. Complete VIM-1 only, following AGENTS.md and the plan's acceptance criteria. Update the plan with findings and the next task, validate, review, commit, and hand off.”
