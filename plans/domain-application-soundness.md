# Domain and Application Soundness Review

## Source and authority

Follow-up fixes from a Product Owner-requested soundness review of `src/domain` and `src/application`
(2026-09-29). The review was performed in conversation and is not otherwise recorded in the
repository; its complete findings are reproduced in this plan, so no task depends on that
conversation.

The Product Owner authorized working on the two defects (S1, S2) and asked that the supporting test
gaps be included as well (S3, S4).

Scope limits:

* This plan covers only `src/domain` and `src/application`. The renderer was explicitly out of scope
  for the review; touch renderer files only where a task's acceptance evidence requires it.
* S3 and S4 exist because a specific risk is unguarded, not to raise a coverage percentage.
  `AGENTS.md` §9 forbids adding tests solely for coverage; do not widen them into a coverage sweep.
* No task authorizes changing the persistence format, the depth limit itself, or the hyperlink data
  model.

Sources of truth: `docs/PRODUCT.md` §2.3 (maximum depth), §11 (hyperlinks, around line 592),
`docs/ARCHITECTURE.md` §11 (around line 130, the link-text invariant),
`docs/DEVELOPMENT.md` §9 (validation tiers), `src/domain/AGENTS.md` (the domain owns the depth
invariant).

## State

Baseline measured on `fdaa52e` with
`npx vitest run --coverage --coverage.include='src/domain/**' --coverage.include='src/application/**'`:

| Area | % Stmts | % Branch | % Funcs | % Lines |
| --- | --- | --- | --- | --- |
| `src/application` | 93.42 | 87.30 | 97.22 | 96.97 |
| `src/domain` | 96.49 | 86.70 | 97.24 | 97.67 |

Coverage is not the problem; both defects below sit inside covered files. The worktree was clean at
the end of the review session. S1 (High Risk) is complete and committed with its implementation,
tests, property guard, and end-to-end scenario. S2 is complete and committed with its defect-first
regression tests, widened property guard, save/reload round-trip test, focused E2E coverage, and the
`docs/PRODUCT.md` §13 paste rule it makes explicit. S3 is complete and committed with direct
`EditorStore` unit coverage for `createSibling` and `moveSelectionBoundary`, including the
persistence-locked early return and the boundary/count clamping. S4 is complete and committed with a
shared conformance table pinning both validators to the same accept/reject decision, coverage of the
previously untested `parsePersistedState` rejection paths, and an explicit expectation for the
intended link-normalization difference.

## Decisions

* **D1 — paste inside a hyperlink (resolved by the Product Owner, 2026-09-29).** A paste that lands
  strictly inside an existing link must mirror what typing already does: recompute the URL from the
  new covered text, keep the range as a link when that text is still a valid HTTP(S) URL, and drop
  the link otherwise. Example: pasting `x` into `https://example.com` at offset 16 yields
  `https://examplex.com` and stays a link with the new URL; pasting `XYZ` at offset 5 yields
  `httpsXYZ://example.com` and becomes plain text. This is the behavior
  `reconcileLinkTextEdit` (`src/domain/document-links.ts:37`) already implements for typed edits.
* **D2 — over-depth paste rejects wholly (derived from `docs/PRODUCT.md` §2.3, not reserved).** §2.3
  requires that an action which would create a node deeper than `MAX_DOCUMENT_DEPTH` leave the
  document, selection, focus, undo/redo history, and persisted state unchanged. A subtree or forest
  paste is therefore rejected in full when *any* resulting node would exceed that depth; it is never
  partially applied or truncated.
* No further decision is reserved for the Product Owner. Raise a new question only if
  implementation reveals one.

## Findings reproduced from the review

### S1 defect — subtree paste can exceed the depth limit and lock the editor

Depth is enforced in only three places: `src/domain/document-operations.ts:336`
(`createFirstChild`) and `src/application/editor-command-transitions.ts:88` and `:105`. Neither
`pasteSubtreeTransition` (`src/application/editor-command-transitions.ts:43`) nor
`pasteNodeForestTransition` (`src/application/editor-node-visual-transitions.ts:34`) checks depth,
and neither `insertSubtreeSibling` nor `replaceSiblingRange` does either.

Reproduced in the review: build a document already at `MAX_DOCUMENT_DEPTH`, then
`insertSubtreeSibling(document, deepestId, 'after', twoLevelSubtree, createId)` succeeds and yields a
document one level past the limit. `serializeState` then throws `MAX_DOCUMENT_DEPTH_ERROR` on
every save, from inside `src/application/persistence-coordinator.ts:82`, so it is caught as a save
failure. After `SAVE_MAX_CONSECUTIVE_FAILURES` (3) the store sets `persistenceLocked`, and
`EditorStore.undo()` (`src/application/editor-store.ts:648`) returns early when locked — so the user
cannot undo the paste that caused it. The only exit is quit-without-saving, discarding everything
since the last successful save.

Reachable from Vim `yy`/`dd` then `p`/`P` (including counted puts, which loop over
`store.pasteSubtree` in `src/renderer/vim-keyboard-handler.ts:568`) and from node-visual-mode paste.

### S2 defect — pasting inside a hyperlink breaks the link-text invariant

`docs/ARCHITECTURE.md` (around line 130) and `docs/PRODUCT.md` (around line 592) require a link's
`url` to equal the text the range covers. `insertLinks` (`src/domain/document-links.ts:120`) calls
`normalizeLinks` with `requireMatchingText = false` against a synthetic run of spaces, so it never
rechecks that. For a link spanning the paste position, `start` stays put while `end` shifts by the
inserted length (lines 124-125), stretching the link over the pasted text:

```text
"https://example.com" with link {0,19}, paste "XYZ" at offset 5
  -> text "httpsXYZ://example.com", link {0,22,url:"https://example.com"}
  -> covered text != url
  -> saved to disk as-is; on load normalizeLinks(requireMatchingText=true) drops it
```

So the stretched link renders and is clickable against the stale URL, is persisted, and then
silently disappears on the next launch. A property probe over `pasteText`, `pasteMultilineText`,
`splitNode`, `removeTextRange`, `deleteLink`, and `replaceLinkedTextRanges` found violations from
`pasteText` only — `insertLinks` is the single offender.

### S3 gap — three public `EditorStore` command methods have no unit coverage

`createSibling` (`src/application/editor-store.ts:389`), `moveSelectionBoundary` (`:311`), and
`pasteSubtree` (`:466`) are never called by any test under `src/application`. They are live paths:
`src/renderer/vim-keyboard-handler.ts:444,452,568` and
`src/renderer/use-node-input-bindings.ts:305,692` — Vim `o`/`O`, `p`/`P`, and the `gg`/`G`/count
boundary motions. Renderer tests use the typed store double
(`src/renderer/test/editor-store-double.ts`, added in `fdaa52e`), which is correct for renderer
isolation but removed the incidental coverage at this seam. This is why S1 was invisible to the unit
suite.

### S4 gap — only one of the two persisted-state validators is exercised

`validatePersistedState` (the main-process IPC guard, `src/main/ipc-security.ts:27`) and
`parsePersistedState` (the renderer load parser, `src/application/editor-store.ts:163`) must agree
about which persisted states are acceptable. Every `parsePersistedState` rejection path is untested
(`src/domain/document-serialization.ts:90,95,100,104`) while its `validatePersistedState`
counterparts are covered. They already differ benignly: `validatePersistedState` discards
`normalizeLinks`' result, so it accepts denormalized links a compromised renderer could send. That is
currently harmless because load-side normalization cleans up, but nothing pins the two together.

### Observations that are deliberately not tasks

* The link-shifting callbacks in `deleteLink` (`document-operations.ts:189`), `removeTextRange`
  (`:215`), and child-link cloning (`:322`) are unexecuted by any test. Their behavior was verified
  correct during the review, and S2's widened property test exercises them for free. Do not add
  dedicated tests for these lines.
* After `persistenceLocked` is set, `EditorSaveScheduler.changesPending` stays `true` forever, so
  `runCleanup`'s `hasPendingDocumentChanges()` guard defers attachment cleanup indefinitely. No data
  risk; left alone on purpose.

## Tasks

| ID | Outcome and acceptance evidence | Files expected to change | Tier | Status |
| --- | --- | --- | --- | --- |
| S1 | Enforce `MAX_DOCUMENT_DEPTH` on subtree and node-forest paste per D2. Acceptance: a defect-first regression test that fails before the fix by reproducing the over-depth document described above; after the fix an over-depth `p`/`P` and an over-depth node-visual paste leave document, selection, focus, and history unchanged, show `MAX_DOCUMENT_DEPTH_ERROR` as an operation error, and the document still saves; a property test asserting no operation produces a node past `MAX_DOCUMENT_DEPTH`; an E2E scenario asserting the persisted file is byte-for-byte unchanged and no `.save-error` appears. | `src/domain/document-operations.ts` (depth/height helper), `src/domain/document.ts` (re-export), `src/application/editor-command-transitions.ts`, `src/application/editor-node-visual-transitions.ts`, `src/application/editor-store.ts`, their tests, `src/domain/document.property.test.ts`, `e2e/persistence.spec.ts`, `docs/PRODUCT.md` §2.3 | High | Done |
| S2 | Make `insertLinks` preserve the link-text invariant per D1. Acceptance: a defect-first regression test that fails before the fix on the `"XYZ"`-at-offset-5 case; a widened property test asserting `text.slice(link.start, link.end) === link.url` for `pasteText`, `pasteMultilineText`, `splitNode`, `removeTextRange`, `deleteLink`, and `replaceLinkedTextRanges`; a serialize/parse round-trip test showing a pasted-into link survives or is absent consistently before and after reload; the valid-URL-after-paste case from D1 stays a link with the recomputed URL. | `src/domain/document-links.ts`, `src/domain/document-links.test.ts`, `src/domain/document.test.ts`, `src/domain/document.property.test.ts`, `src/domain/document-links.property.test.ts`, `e2e/hyperlink.spec.ts` if the flow needs it, `docs/PRODUCT.md` §11 if D1 needs stating | Moderate | Done |
| S3 | Give `createSibling` and `moveSelectionBoundary` direct `EditorStore` unit coverage, including the persistence-locked early return and the boundary/count clamping. `pasteSubtree` is covered by S1, so cover only what S1 left. Acceptance: each method is exercised through the real `EditorStore` (not the renderer double) and asserts the resulting document, location, and focus. | `src/application/editor-store.test.ts` | Low | Done |
| S4 | Add one shared conformance test pinning `validatePersistedState` and `parsePersistedState` to the same accept/reject decision over a table of malformed states, covering the currently untested `parsePersistedState` rejection paths. Record the intended link-normalization difference as an explicit expectation rather than removing it. | `src/domain/document-serialization.test.ts` or `src/domain/document.test.ts` | Low | Done |

Dependencies: S1, S2, S3, and S4 are complete, and no further task remains. Per `AGENTS.md` §8 and
`docs/DEVELOPMENT.md` §11, this plan and its index entry are removed once the Product Owner confirms
no further tasks remain.

Per `AGENTS.md` §13, S1 additionally requires an independent reviewer and a separate product
verifier (High Risk, persistence boundary, changed user-visible behavior). S2 needs product
verification of the hyperlink paste flow by the primary agent; add a separate verifier only if the
change grows beyond `document-links.ts`. If S2 alters which ranges render as links, the
visual-regression workflow in `AGENTS.md` §9 applies — reuse `e2e/hyperlink.spec.ts-snapshots`
rather than regenerating baselines without inspection. S3 and S4 are contained internal test
changes and need neither role.

## Next task

None. All four tasks have landed. The conformance test now pins the shared accept/reject decision,
covers the previously untested `parsePersistedState` rejection paths, and records the intended
link-normalization difference (`validatePersistedState` preserves denormalized links;
`parsePersistedState` normalizes them away) as an explicit expectation in
`src/domain/document-serialization.test.ts`.

The only remaining action is retirement: when the Product Owner confirms no further tasks remain,
remove this plan and its `plans/README.md` row in the commit that records completion.

Retirement prompt: "The domain and application soundness review is complete. Confirm no further
tasks remain, then remove `plans/domain-application-soundness.md` and its `plans/README.md` row."
