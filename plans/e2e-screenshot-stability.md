# E2E Screenshot Stability Follow-ups

## Objective and scope

Stabilize the screenshot and scroll-settlement cases identified in the read-only follow-up scans after commit `bb3da39`. The Product Owner authorized all reported candidates on 2026-10-11. This batch changes E2E capture mechanics and waits only; it does not change application behavior.

Source of truth: [E2E validation and visual-regression workflow](../docs/DEVELOPMENT.md#9-full-validation), [E2E fixture rules](../e2e/AGENTS.md).

## Authorization and decisions

- Authorized: exclude transient scrollbar pixels from full-window captures; capture affected Vim and drag-and-drop screenshots from measured element bounds instead of asking Playwright to scroll locators into view; wait for wheel scrolling to become quiet before releasing delayed image loading.
- No Product Owner decisions are reserved.
- No unverified remainder exists within the candidates reported and authorized so far.

## Tasks

| ID | Outcome | Dependencies | Files expected to change | Acceptance evidence | Validation tier | Status |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | Exclude only the native scrollbar strip from the large virtualized Agenda screenshot. | None | `e2e/agenda-focused-day.spec.ts`; its screenshot baselines | The focused test passes in both editing modes; the updated baseline is visually inspected and preserves the focused heading and surrounding rows. | Low Risk | Done |
| S2 | Avoid locator scroll-into-view for light/dark Vim undo screenshots. | S1 | `e2e/vim-text-editing.spec.ts`; its screenshot baselines if changed | The focused test passes; screenshot dimensions and inspected contents preserve the node-list image caret in both appearances. | Low Risk | Done |
| S3 | Exclude only the native scrollbar strip from the scrolled windowed-list drag screenshot. | S2 | `e2e/windowed-list.spec.ts`; its screenshot baselines | The focused test passes in both editing modes; the inspected baseline preserves the scrolled rows and receiving-row drop outline. | Low Risk | Done |
| S4 | Capture Vim image-caret screenshots from measured node-list bounds. | S3 | `e2e/vim-image-caret.spec.ts`; its screenshot baselines if changed | The focused test passes with light/dark baseline comparison and preserves the focused and peer image-caret states. | Low Risk | Done |
| S5 | Capture hierarchy drag feedback screenshots from measured node-list bounds. | S4 | `e2e/drag-and-drop-hierarchy.spec.ts`; its screenshot baselines if changed | The focused test passes in both editing modes and appearances; existing captures compare unchanged. | Low Risk | Done |
| S6 | Replace the fixed post-wheel delay with a quiet-scroll wait before releasing image loading. | S5 | `e2e/scroll-selection.spec.ts` | The focused test passes repeatedly and still proves image loading does not pull the viewport back after wheel input. | Low Risk | Ready |

## Findings and status

- S1 is the highest-confidence remaining scrollbar candidate: it scrolls a 600-row document to `scrollTop = 8000` and immediately captures the full window.
- S2 repeats the locator screenshot plus appearance-switch sequence implicated in the prior CI timeout.
- No runtime implementation change is planned.
- S1 completed in the current worktree: both editing modes pass the focused test with snapshot comparison, and both updated images were visually inspected.
- S2 completed in the current worktree: the focused undo screenshot test passes with baseline comparison in light and dark appearance. The existing baselines were inspected; capture dimensions and image-caret rendering are unchanged.
- The Product Owner authorized the four additional candidates after the follow-up scan: a second scrolled full-window screenshot, two groups of locator screenshots, and the fixed wheel wait.
- Current status: S3 is the exact next task. Keep this review-batch record until all six tasks are done and the Product Owner confirms no further tasks remain; then remove this file and its index row in a separate completion commit.

## Resume prompt

Continue the authorized E2E stability batch from the next Ready task. Read `AGENTS.md`, this plan, and `plans/README.md`. Preserve one focused fix per commit, run its focused E2E checks, inspect changed screenshot baselines, and update this plan with each task commit. When all six tasks are done, ask the Product Owner to confirm no further tasks remain before removing this plan and its index row in a separate completion commit.
