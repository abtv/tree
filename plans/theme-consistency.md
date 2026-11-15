# Theme consistency follow-ups

Status: In progress

## Authorization and scope

The owner authorized the complete three-finding batch with “let's fix it” on
2026-11-15 after the color-theme audit at `1bf1142`. Codex owns implementation,
validation and focused commits. No publication, dependency changes, new appearance,
or interaction-state redesign is authorized.

Sources: [Appearance](../docs/PRODUCT.md#205-appearance),
[renderer architecture](../docs/ARCHITECTURE.md), and the audit summarized below.
The complete batch is known; there is no unverified remainder.

## Tasks

| ID | Outcome and expected files | Validation and acceptance | Status |
| --- | --- | --- | --- |
| T1 | Selected hyperlinks use the shared highlight pair, including focus transfer. `src/renderer/styles.css`, `e2e/electron/completion-links.spec.ts`, `docs/PRODUCT.md`. | Moderate Risk: `npm run check`, 13 focused completion/selection E2E passed, Light/Dark/Gray screenshots inspected, separate product verifier passed. | Done |
| T2 | Save and attachment errors remain legible in Dark. `src/renderer/styles.css`, focused error-appearance E2E and baselines, `docs/PRODUCT.md`. | Moderate Risk: `npm run check`, actual error rendering and contrast assertions, inspected Light/Dark/Gray screenshots. | Ready |
| T3 | Browser shadows use shared color properties; the guard includes Gray, browser styles and named colors. `src/renderer/styles.css`, `src/web/styles.css`, `src/renderer/styles.test.ts`, `docs/ARCHITECTURE.md`. | Low Risk: `npm run check`, a failing-before-fix color-ownership guard, unchanged computed shadow values. | Ready |

T2 follows T1; T3 follows T2. Each task receives its own validated commit.
Exact next task: T2, readable Dark error messages.

## Findings and choices

- T1: `Highlight`/`HighlightText` bypass the palette. A selected hyperlink can remain
  system blue after opening the command panel. Use the already required highlight
  pair; do not change selection ownership or timing.
- T2: Dark inherits `#b42318` save errors and `#9c3b34` attachment errors from Light,
  giving approximately 1.60:1 and 1.55:1 contrast against the document surface.
  Use a lighter variant of the muted Zenburn red for Dark error text. This is a local palette
  correction within the authorized readability outcome, not a new theme decision.
- T3: Three browser shadow declarations contain literal colors. Move the exact
  existing values into shared properties so the rendered browser shadows stay the
  same. The existing guard misses browser/Gray files and named system colors.
- No material requirement gaps, state changes, persistence changes or performance
  triggers were found. No timing/performance run is needed for color-only changes.
- `npm run fix:history` reported no matching history or possible shared cause.

## Execution and owner involvement

Budget: three focused working tasks in this session, with the repository's two
unsuccessful-recovery-attempt limit per blocker. Closure allowance: one small
documentation-only retirement commit after acceptance. No fresh planner is needed
for these contained, already investigated corrections.

Required capabilities already verified in this session: repository inspection,
native file edits, unit tests, isolated Electron execution, screenshot inspection.
Product-verifier access will be verified on its first review. No manual pre-commit
owner check is planned. Surface colors and window lifecycle are unchanged; startup
and closing transition verification is outside these corrections.

Working-task count: three. One final owner acceptance round is required by
[workflow §8](../docs/AGENT_WORKFLOW.md#8-plans-and-architecture-decisions), including
confirmation that no further tasks remain in this batch. Keep this plan and its
index entry at `Awaiting owner acceptance` after delivery.

## Continuation

Continue the authorized theme-consistency batch. Read this plan and the working
plan, reconcile Git state, and resume the exact next unfinished task. Preserve the
final owner acceptance gate; do not expand the audit into unrelated UI changes.
