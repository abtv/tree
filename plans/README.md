# Active Plans

This index lists work that spans multiple sessions: initiatives and review follow-up batches whose tasks the Product Owner authorizes one at a time. Read the linked plan before continuing its work. The workflow and plan format are in [Development Guide §11](../docs/DEVELOPMENT.md#11-multi-session-initiatives); authorization and session rules are in [AGENTS.md](../AGENTS.md).

| Initiative | Status | Next task |
| --- | --- | --- |
| [E2E Coverage Efficiency](e2e-coverage-efficiency.md) | Bounded memory separation completed; broader work deferred | None. No runner/readiness or other test-family work authorized |

Deferred plans remain indexed to preserve their scope and evidence, but are excluded from ready-task selection. Generic continuation and `improve-permissions` do not resume them. Independently authorized product tasks proceed under the ordinary workflow; unfinished runner readiness is not their prerequisite.

An empty index means no multi-session or review-batch work is known to be outstanding. Retain initiatives with three or more working tasks as `Awaiting owner acceptance` after implementation; remove their plan and row only after explicit acceptance under `AGENTS.md` §8. Review batches also require confirmation that no further tasks remain. Git history retains the completed record.
