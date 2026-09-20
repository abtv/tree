# Architecture Decision Records

Architecture Decision Records (ADRs) capture important technical or architectural decisions and the rationale at the time they were made. They are historical records and are not edited to follow later implementation changes, but a fact that remains live and is owned elsewhere is referenced rather than restated. The conventions are defined in `AGENTS.md` §8.

| ADR | Title | Status | Date |
| --- | --- | --- | --- |
| [0001](0001-snapshot-history-and-attachment-retention.md) | Snapshot History and Attachment Retention | Superseded by ADR 0004 | 2026-09-11 |
| [0002](0002-e2e-testing-with-playwright.md) | End-to-End Testing with Playwright | Accepted | 2026-09-11 |
| [0003](0003-renderer-owns-standard-editing-commands.md) | Renderer Owns Standard Editing Commands | Accepted | 2026-09-13 |
| [0004](0004-bounded-history-and-autosave-policy.md) | Bounded Snapshot History and Automatic Save Policy | Accepted | 2026-09-13 |
| [0005](0005-non-rebuilding-save-validation.md) | Non-Rebuilding Save Validation | Accepted | 2026-09-13 |
| [0006](0006-exact-dependency-pinning.md) | Exact Dependency Pinning | Accepted | 2026-09-13 |
| [0007](0007-windowed-node-list-rendering.md) | Windowed Rendering for Wide Node Lists | Accepted | 2026-09-14 |
| [0008](0008-fsync-based-persistence-durability.md) | Fsync-Based Persistence Durability | Accepted | 2026-09-14 |
| [0009](0009-bounded-loss-document-generations.md) | Bounded-Loss Document Generations | Accepted | 2026-09-14 |
| [0010](0010-bounded-save-retries-and-failure-lock.md) | Bounded Save Retries and Read-Only Failure Lock | Accepted | 2026-09-14 |
| [0011](0011-hidden-e2e-windows.md) | Hidden E2E Windows with a Visibility Escape Hatch | Accepted | 2026-09-20 |
| [0012](0012-parallel-e2e-execution.md) | Parallel E2E Execution with Test-Owned Shortcut and Clipboard Isolation | Accepted | 2026-09-20 |

Every ADR carries a `Status` of `Accepted` or `Superseded by ADR NNNN`, and this index lists every ADR. `npm run check:docs` enforces both.
