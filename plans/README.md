# Active Plans

This index lists work that spans multiple sessions: initiatives and review follow-up batches. The linked plan records whether the Product Owner authorized the whole scope or requires task-by-task approval. Read it before continuing its work. The workflow and plan format are in [Development Guide §11](../docs/DEVELOPMENT.md#11-multi-session-initiatives); authorization and session rules are in [AGENTS.md](../AGENTS.md).

| Plan | Status | Next task |
| --- | --- | --- |
| [Architecture document split](architecture-document-split.md) | In progress | R1: pilot rewrite of `command-panel.md` and `completion-and-tags.md`, then the owner's style checkpoint |

Deferred or paused plans remain indexed to preserve their scope and evidence, but are excluded from ready-task selection. Generic continuation does not resume them.

An empty index means no multi-session or review-batch work is known to be outstanding. Retain initiatives with three or more working tasks as `Awaiting owner acceptance` after implementation; remove their plan and row only after explicit acceptance under `AGENTS.md` §8. Review batches also require confirmation that no further tasks remain. Git history retains the completed record.
