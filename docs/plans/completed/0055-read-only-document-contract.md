# Read-Only Document Contract

Status: Completed
Created: 2026-09-14
Completed: 2026-09-14

## Goal

Make the public domain document types read-only so the immutability invariant that history, the path-copying operations, and the derived caches depend on is enforced by the compiler. No runtime behavior changes.

## Context

The third quality-review finding: `src/domain/document.ts` exposes mutable nodes and arrays, and the store returns its snapshot directly, so a caller can mutate a live document without any type error. History retains document snapshots by reference, and the node index and attachment summary caches are keyed by document identity, so an accidental mutation would silently corrupt history, caches, and persisted state. The review found no existing mutation defect; this change is preventative.

## Proposed Changes

1. Mark the public model read-only in `src/domain/document.ts`:
   * `LinkRange`, `AttachmentReference`, and `Location` fields are `readonly`.
   * `TreeNode` fields and `children` are `readonly`; `links` is a `readonly LinkRange[]`.
   * `Document.roots` is a `readonly TreeNode[]`.
   * `LocatedNode` and `PersistedEditorState` fields are `readonly`.
2. Replace the internal mutation of freshly built nodes with construction from discriminated spreads:
   * Add a private `contentReplacement` helper that builds a node with new text and links without mutating.
   * Remove the `setLinks` mutation helper.
   * Give `cloneNode` and the persisted-state builder internal mutable build types, which are returned as read-only trees.
3. Adjust callers that used mutable signatures to accept or return read-only values: `displayedNodes`, `nodePath`, `buildNodeIndex`, the store's clipboard/conflict helpers, the renderer props (`NodeList`, `NodeInput`, `App`), and editor DOM helpers.
4. Update test fixtures that build documents by mutation to construct read-only trees instead. Keep the existing immutability assertions and property tests.

## Performance Assessment

Required by `docs/PRODUCT.md` §22.1:

* Disk: no change.
* CPU: type-only change; no runtime code path changes. Spread-based node construction performs the same work as the previous in-place construction.
* Memory: no change. The internal mutable types exist only during construction and are not retained.

## Tests

* Existing domain, application, renderer, Electron, and performance suites must stay green; property tests already compare operations against full-traversal reference implementations and assert input immutability.
* Add a compile-time guard in `document.test.ts` using `@ts-expect-error` on attempts to push to `Document.roots` and `TreeNode.children`, so the read-only contract stays enforced by `npm run typecheck`.
* Update documentation if the architecture text needs the read-only contract spelled out.

## Validation and Completion

* Run focused domain, application, renderer tests and `npm run typecheck`, then `npm run check:full` before committing.
* Record the results here, set `Status: Completed`, add the completion date, and move this same file to `docs/plans/completed/` without changing its filename.
* Commit as `refactor(domain): enforce read-only document types` with the `Plan: 0055` footer.

## Results

### Implementation

* The public model is read-only: `LinkRange`, `AttachmentReference`, `Location`, `TreeNode`, `Document`, `LocatedNode`, and `PersistedEditorState` fields and collections cannot be reassigned, and `TreeNode.links` and `Document.roots` are read-only collections.
* Internal construction uses a private `BuildNode` type for `cloneNode` and the persisted-state builder, and a private `contentReplacement` helper now builds text, link, and attachment changes from spreads instead of mutating freshly built nodes. The `setLinks` mutation helper is removed.
* Callers were adjusted to read-only signatures: `displayedNodes`, `nodePath`, `editNodeContent`, `pasteText`, `pasteMultilineText`, `normalizeLinks`, `insertLinks`, `linksForLine`, `splitLinks`, the store's clipboard helpers and `editContent`, the clipboard payload type, and the renderer `NodeList`, `NodeInput`, `App`, and `LocationBar` props.
* Test fixtures that built documents by mutation now construct read-only trees, and the existing input-immutability property test is unchanged and passes.
* `docs/ARCHITECTURE.md` §5 records the read-only contract for the public model.

### Compile-time guard

`document.test.ts` adds a test with `@ts-expect-error` on attempts to push to `Document.roots` and `TreeNode.children` and to assign `TreeNode.text`. `npm run typecheck` fails if the read-only contract is relaxed or the directive becomes unused.

### Implementation finding

The property tests caught one regression during the refactor before commit: `pasteMultilineText` initially left the image on the original node because an explicit `undefined` attachment argument triggered the helper's default parameter. Passing the attachment explicitly fixed it, and the multiline image-movement tests pass again.

### Validation

`npm run check:full` passed: type checking, linting, formatting, documentation governance, 447 unit/component/property tests with coverage (96.57% statements, 90.05% branches, 96.69% functions, 98.54% lines), production build, dependency audit with zero vulnerabilities, 98 Electron E2E tests, and 12 performance tests. No required tests were skipped and no validation failures remain.
