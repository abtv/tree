# Quality hardening

Status: Completed
Created: 2026-09-12
Completed: 2026-09-12

## Goal

Raise repository quality before the next product task by addressing the four review findings selected by the Product Owner:

1. make performance-process teardown wait for exit with a bounded fallback;
2. enforce and exercise the documented single-instance Electron behavior;
3. add meaningful coverage for currently untested reliability and platform branches;
4. reduce renderer complexity by extracting keyboard command handling from `App.tsx`;
5. harden main-process failure handling;
6. make document persistence recoverable after interrupted replacement;
7. continue reducing renderer event and DOM coordination complexity.

## Testing strategy

- Unit-test the single-instance coordination helper, main-process failure handling, and persistence recovery branches.
- Keep real-Electron launch and shutdown coverage; the second-process probe remains a documented follow-up because this managed macOS runner intermittently leaves native Electron processes attached when a deliberately windowless launch is probed.
- Keep the existing real-Electron E2E launch and shutdown coverage; test the single-instance coordination deterministically at the main-process boundary because Playwright cannot reliably attach to a deliberately windowless second process.
- Keep the existing full E2E and performance suites as the final validation.
- Add a renderer save-error observer to E2E and performance fixtures so transient `Changes could not be saved:` messages fail validation.
- Serialize document saves in the main-process file service and cover overlapping saves with a regression test.
- Treat an already-exited Electron process as closed in fixtures to avoid waiting for a close event that has already fired.

## Documentation

Update the development guide if the single-instance, persistence recovery, or fixture lifecycle behavior needs clarification. Move this plan to `docs/plans/completed/` after validation passes.
