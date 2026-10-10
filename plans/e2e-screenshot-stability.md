# E2E Screenshot Stability Follow-ups

## Objective and scope

Stabilize the two screenshot cases identified in the read-only follow-up scan after commit `bb3da39`. The Product Owner authorized these two screenshot fixes on 2026-10-11. This batch changes E2E capture mechanics and baselines only; it does not change application behavior.

Source of truth: [E2E validation and visual-regression workflow](../docs/DEVELOPMENT.md#9-full-validation), [E2E fixture rules](../e2e/AGENTS.md).

## Authorization and decisions

- Authorized: exclude the native scrollbar edge from the large, scrolled Agenda screenshot; capture the Vim undo screenshots from the node-list's measured box instead of asking Playwright to scroll the locator into view.
- No Product Owner decisions are reserved.
- The scan also noted a fixed 200 ms wait after a wheel event in `e2e/scroll-selection.spec.ts`. The Product Owner selected the two screenshot fixes; that separate scroll-timing observation is outside this batch and is not authorized work.
- No unverified remainder exists within the authorized two-fix scope.

## Tasks

| ID | Outcome | Dependencies | Files expected to change | Acceptance evidence | Validation tier | Status |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | Exclude only the native scrollbar strip from the large virtualized Agenda screenshot. | None | `e2e/agenda-focused-day.spec.ts`; its screenshot baselines | The focused test passes in both editing modes; the updated baseline is visually inspected and preserves the focused heading and surrounding rows. | Low Risk | Done |
| S2 | Avoid locator scroll-into-view for light/dark Vim undo screenshots. | S1 | `e2e/vim-text-editing.spec.ts`; its screenshot baselines if changed | The focused test passes; screenshot dimensions and inspected contents preserve the node-list image caret in both appearances. | Low Risk | Ready |

## Findings and status

- S1 is the highest-confidence remaining scrollbar candidate: it scrolls a 600-row document to `scrollTop = 8000` and immediately captures the full window.
- S2 repeats the locator screenshot plus appearance-switch sequence implicated in the prior CI timeout.
- No runtime implementation change is planned.
- S1 completed in the current worktree: both editing modes pass the focused test with snapshot comparison, and both updated images were visually inspected.
- Current status: S2 is the exact next task. After both tasks are done, keep this review-batch record until the Product Owner confirms no further tasks remain; then remove this file and its index row in a separate completion commit.

## Resume prompt

Continue the authorized E2E screenshot stability batch. Read `AGENTS.md`, this plan, and `plans/README.md`. Take the next Ready task only. Preserve the one-fix-per-commit rule, run its focused E2E check, inspect any changed baseline, update this plan with the task commit, and stop for Product Owner confirmation before retiring the completed batch plan.
