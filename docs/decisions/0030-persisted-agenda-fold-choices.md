# Persisted Agenda Fold Choices

Status: Accepted
Date: 2026-11-21

## Context

[ADR 0020](0020-agenda-derived-projection-and-runtime-view-state.md) kept all Agenda state out of the persisted schema: selection, folds and reveals scheduled no saves, and persisting Agenda presentation was rejected. Since commit `3df7a55` (2026-11-16), `docs/PRODUCT.md` §23.5 requires explicit timeline fold choices to be remembered across reopening and application restart, independently of Tree expansion, document content and Undo history, under the pending-save policy of §16.1. The implementation followed without a record that amends ADR 0020; this ADR is that record.

## Decision

Explicit fold choices of the timeline are persisted; all other Agenda state stays as ADR 0020 decided.

* `AgendaFoldMemory` (`src/application/agenda-fold-memory.ts`) keeps the remembered choices outside the ready snapshot's Agenda state. It records only an explicit fold or toggle in the timeline presentation that changes a remembered choice. Search reveals, live-editing reveals and focused-day folds stay runtime state.
* A recorded change marks a pending change through the ordinary save scheduler. It does not enter Undo history.
* The document stores the choices in the optional `view.agendaFolds` field as calendar `days` and Monday `overdueWeeks`, not as application row keys. The schema version is unchanged: older files load with no remembered folds, and an older build may drop the field under the existing unsupported-downgrade policy. The same view travels through desktop files, browser storage and notes archives.

Selection, reveals, Agenda presentation and the derived projection remain unpersisted, and the rest of ADR 0020 stands.

## Consequences

* One optional view field and one pending-change trigger are added; no IPC channel, storage identity, dependency or schema version.
* A fold change costs one save through the existing pending-save batching, like a selection change; the stored size grows with the number of remembered days and weeks.
* Validation and parsing of the field are described in `docs/ARCHITECTURE.md` §13.
