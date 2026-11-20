# Marked Nodes in Schema Version 6

Status: Accepted
Date: 2026-11-20

## Context

The owner requested a per-node mark that lists the node in Agenda under Today, and approved storing it in the document, a new schema version, and copying marks with nodes. Existing readers reconstruct only known node fields, so accepting marks under schema 5 would let an older build silently remove them.

The owner chose a mark without a date: a marked node belongs to Today on every day until the mark is removed. A mark bound to the day it was set was the alternative; it would behave like a date in the text and move to Overdue.

## Decision

Follow ADR 0018's content-field compatibility policy, as ADR 0027 did for stars: write schema 6 with optional `marked: true`; omit the field on unmarked nodes. Accept versions 1–6 and reject malformed mark fields at both shared validation boundaries. Older documents without the field load unmarked. No separate migration write is needed.

A toggle changes one real node through the existing immutable domain, undo history and delayed persistence path. Copies retain marks.

The mark stores no date. The Agenda projection receives the Today that Agenda captured when it opened and treats a marked node as a direct match of that day. Per-node date summaries record only the presence of a mark, so they do not depend on the calendar and stay cached across days.

## Consequences

Older builds reject schema 6 rather than silently dropping marks; downgrade remains unsupported. Normal saves, archives, recovery generations and failure locks retain the same owners. The additional stored state is one optional boolean per marked node.

A projection is valid only for the Today it was built for; the Agenda rows cache rebuilds it when Today changes. A date-bound mark would need a stored day and a migration from this format.
