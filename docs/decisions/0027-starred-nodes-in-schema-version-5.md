# Starred Nodes in Schema Version 5

Status: Accepted
Date: 2026-11-16

## Context

The owner requested persistent per-node stars and explicitly approved copying stars with nodes. Existing readers reconstruct only known node fields, so accepting stars under schema 4 would let an older build silently remove them.

## Decision

Follow ADR 0018's content-field compatibility policy: write schema 5 with optional `starred: true`; omit the field on unstarred nodes. Accept versions 1–5 and reject malformed star fields at both shared validation boundaries. Older documents without the field load unstarred. No separate migration write is needed.

A toggle changes one real node through the existing immutable domain, undo history and delayed persistence path. Copies retain stars. Search derives its empty-query list from document stars and existing recent history without a new storage channel.

## Consequences

Older builds reject schema 5 rather than silently dropping stars; downgrade remains unsupported. Normal saves, archives, recovery generations and failure locks retain the same owners. The additional stored state is one optional boolean per starred node.
