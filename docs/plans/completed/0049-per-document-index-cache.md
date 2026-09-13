Status: Completed
Created: 2026-09-13
Completed: 2026-09-13

# Per-document node index cache

## Goal

Replace the single-entry, module-level node-index memo with a weak map keyed by document identity so that alternating between documents does not evict each other's index and force a full O(n) rebuild.

## Current behavior

`src/domain/document.ts` keeps `cachedIndexDocument` and `cachedIndexInfo` module globals holding only the most recently indexed document. `indexInfoFor` returns the memo on an identity hit and otherwise rebuilds the whole index, replacing the previous entry. `shareIndex` transfers the cached index only when the source document is the one currently in the memo. Any caller that alternates between two documents loses the first document's index every time and pays a full rebuild on the next lookup.

## Proposed changes

In `src/domain/document.ts`:

1. Replace the two module globals with a `WeakMap<Document, IndexInfo>`.
2. `indexInfoFor` reads from and writes to the weak map on identity.
3. `shareIndex(from, to)` copies `indexInfoFor(from)` into the weak map for `to`.

The memo stays transparent: documents are immutable and node ids unique, so an identity hit can never return an index for a different topology. Entries are weakly held and released with their document.

## Affected modules

- `src/domain/document.ts`
- `src/domain/document.test.ts`
- `docs/ARCHITECTURE.md`

## Performance assessment

Required by `docs/PRODUCT.md` §22.1.

- **Disk:** no change.
- **CPU:** a warm lookup no longer rebuilds when another document was indexed in between. The cold-build cost for a genuinely new document is unchanged.
- **Memory:** indices are weakly held and bounded by the live document plus any history snapshots; each entry is released with its document. Previously exactly one entry was retained; now one entry exists per live document object and is reclaimed by the garbage collector.
- **Scaling:** lookup and render cost is independent of how many other documents have been seen.

## Automated performance guards

- **Unit:** an interleaved-lookup test with instrumented sibling arrays asserts that a warm lookup for each of two alternating documents reads exactly one sibling element; the single-entry memo rebuilds on the second visit and fails the assertion.
- **Existing:** `document.property.test.ts` compares indexed location resolution against a full-traversal reference for every operation.
- `npm run check:full` before commit.

## Testing

- New interleaved-lookup unit guard; the existing "does not reuse an index across different documents" test still passes.
- Existing domain, application, main, renderer, end-to-end, and performance suites stay green.
- `npm run check:full`.

## Documentation

- `docs/ARCHITECTURE.md` §5: the index is memoized in a weak map keyed by document identity.
- Update this plan and move it to `docs/plans/completed/` when done.

## Risks

- **Multiple simultaneous indices.** The weak map can hold more than one document's index at a time. Each is immutable and identity-keyed, so correctness is unchanged, and the entries are bounded by the number of live document objects and released with them.

## Out of scope

- Sharing one index across documents, incremental index updates, and persisting the index.
