# Agenda Derived Projection and Runtime View State

Status: Accepted
Date: 2026-10-09

## Context

The authorized Agenda initiative projects dates from the existing document. Its selection can name a day or a gap rather than a real node, and its folds must be independent of Tree expansion. The existing application store publishes one ready snapshot and coordinates document history and persistence.

## Decision

Agenda view state is an optional field of the ready editor snapshot. Pure application transitions own its origin location and cursor, scope, captured Today, selected row key, collapsed occurrence keys, and revealed days. Real-row selection updates the location and focus in the same publication. The runtime has a reconciliation seam for later document-edit behavior; the initial store-only stage preserves Agenda state unchanged there.

Rows are derived from the domain projection and timeline. One bounded cache per store compares projection identities and roles, preserving the row array across text changes that leave date membership and hierarchy unchanged. Rows contain node identities rather than document objects; the renderer can resolve live content separately. The cache is cleared on close.

Agenda state never enters the persisted schema or undo history. Save capture uses the captured Tree origin location and Tree viewport measurement while Agenda is active, even if a previously pending save runs. Agenda selection, folds, and reveals do not schedule saves. Today is supplied through an optional service and captured on open, using the local calendar date when no override exists.

React state and a second store were rejected because they would split selection ownership and publication. Persisting Agenda presentation was rejected because it would change the accepted persistence model. Derived projection is not stored in the document.

## Consequences

* There is one publication owner and no new process boundary, IPC channel, dependency, or schema version.
* Tree expansion and restart location remain independent of Agenda presentation.
* Domain summaries reuse immutable node identities. Projection work scales with dated occurrences and their ancestors; unchanged-date edits can still compare a complete projection, but do not rebuild rendered row identities.
* The no-Agenda runtime path performs no projection work. Document reconciliation and Agenda-aware Undo are added by the later initiative task before editable Agenda UI is exposed.
