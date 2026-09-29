# Integration Test Gaps

## Objective

Close the two integration-coverage gaps identified by the 2026-09-29 test-architecture review by adding focused, deterministic tests next to their existing owners. No production behavior changes.

Source of truth for the rules these tasks follow:

* [AGENTS.md](../AGENTS.md) — §8 plans, §9 tests, §10 validation, §12 Git, §13 completion.
* [docs/DEVELOPMENT.md](../docs/DEVELOPMENT.md) — §9 risk-based validation and evidence format, §12 testing strategy.
* [docs/PRODUCT.md](../docs/PRODUCT.md) — §2.4 inline expansion, §13.1 selecting, copying, cutting, and pasting linked text.
* [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md) — §5 domain model, §13 persistence, §15 clipboard.

## Authorization state

* The Product Owner authorized this initiative and the full task list below on 2026-09-29, after reviewing the test-architecture report.
* The report identified exactly four tasks. The list is complete; there is **no unverified remainder**.
* Each task is authorized as a **test-only** change. Adding or changing production code is **not** authorized by this plan.
* Decision reserved for the Product Owner: if a task's new test fails against current production code, that is a suspected defect. Report it and stop; do not fix it under this plan.

## Scope limits

In scope: new or extended tests in `src/domain/`, `src/application/`, and `e2e/`.

Out of scope, deliberately. The review examined each of these and concluded an integration test would add no meaningful risk reduction. Do not add them:

* An in-process harness wiring the preload bridge to the main-process IPC handlers. Channel names and argument shapes are shared types, argument forwarding is asserted in `src/preload/index.test.ts`, and handler validation is asserted in `src/main/ipc-handlers.test.ts`. The only residual risk is Electron structured cloning, which such a harness cannot reproduce and which the end-to-end suite already exercises.
* Wiring a real `EditorStore` to a real `createFileServices(tmpdir)`. Both halves are already tested against the real filesystem and the real domain, and `e2e/attachment-cleanup.spec.ts` covers the composition with real files.
* Re-testing Vim structural or operator commands against the real store in jsdom. The end-to-end Vim specs already cover them, and `docs/DEVELOPMENT.md` §8 sets explicit rules for that suite's composition.
* Any test added to move a coverage number. The per-file floors in `vitest.config.ts` are regression guards, not targets.
* A new top-level `integration/` directory. Tests live next to their owner in this repository.

## Findings later sessions need

These were established by reading the repository; they are recorded so no session has to re-derive them.

### Gap A — the restore path's collapsed-location normalization is untested

`normalizeCollapsedLocation` is defined in [`src/domain/document-operations.ts`](../src/domain/document-operations.ts) and re-exported from [`src/domain/document.ts`](../src/domain/document.ts). It walks a loaded location back up to a row that is actually displayed, because inline expansion (`docs/PRODUCT.md` §2.4) is never persisted and always starts collapsed.

It has exactly two production callers:

1. `EditorStore.initialize` in [`src/application/editor-store.ts`](../src/application/editor-store.ts), immediately after `parsePersistedState` — the **restore** path.
2. `applyFoldCommand` for the `close-all` fold command in [`src/renderer/App.tsx`](../src/renderer/App.tsx) — the `zM` path.

Current coverage:

* No test file imports `normalizeCollapsedLocation` at any level.
* The `zM` caller is covered indirectly by `src/renderer/App.test.tsx` and `e2e/inline-expansion.spec.ts`, but **both start at the top level**, so only the `currentParentId === null` branch runs.
* The branch that walks back to the direct child of a **non-null** `currentParentId` has no coverage anywhere.
* The **restore** caller has no coverage at any level. `e2e/persistence.spec.ts` restores a location whose selected node is already a direct child. `e2e/inline-expansion.spec.ts` relaunches with a top-level root selected. `src/application/editor-store.test.ts` has no loaded location whose selected node is more than one level below its current parent.

Failure this permits: a user expands a node inline, selects a descendant, and quits. On the next launch the caret is asked for a row that is not rendered. Nothing would fail.

Relevant helpers: `displayedNodes(document, currentParentId)` and `isValidLocation` in the same domain module. `isValidLocation` deliberately accepts a descendant at any depth, so an unnormalized location is still "valid" and will not be rejected.

### Gap B — the clipboard rich-copy encoder and decoder are never run together

Copying linked text and pasting it back is a `docs/PRODUCT.md` §13.1 requirement implemented by a matched pair split across the process boundary:

* Encoder: `clipboardSelectionTransition` in [`src/application/editor-clipboard-transitions.ts`](../src/application/editor-clipboard-transitions.ts) builds the `html` payload, escaping `&`, `<`, `>`, and `"` and converting newlines to `<br>`. It emits an anchor only for a link fully inside the selection.
* Decoder: `extractClipboardLinks` in [`src/infrastructure/main/clipboard.ts`](../src/infrastructure/main/clipboard.ts) parses that HTML back into link ranges. It decodes HTML character references and `<br>`, and **re-derives each range's position with `text.indexOf(label, searchFrom)`** rather than using offsets the encoder already knew.
* The pasted result is then normalized by `pasteText` and `normalizeLinks` in the domain, which drop any range whose covered text is not exactly its URL.

Current coverage: `src/application/editor-clipboard-transitions.test.ts` tests the encoder alone; `src/infrastructure/main/clipboard.test.ts` tests the decoder alone against hand-written HTML. No test runs them together. The composition is covered only by two end-to-end cases in `e2e/clipboard.spec.ts` ("cuts a hyperlink…" and "copies a hyperlink…"), both using a single bare URL with no `&`, no newline, and no repeated label.

Failure this permits: any change to escaping, entity decoding, `<br>` handling, or label-position resolution on one side silently breaks copy-and-paste of linked text on the other.

### Cost context

The whole in-process suite is 73 files / 1174 tests in about 4 seconds. The end-to-end suite is 284 tests, each launching a real Electron application, and the clipboard specs additionally serialize on a cross-process system-clipboard lock. Prefer the in-process level whenever it gives equivalent confidence.

## Tasks

| ID | Outcome | Depends on | Status | Validation tier |
| --- | --- | --- | --- | --- |
| T1 | Focused tests for `normalizeCollapsedLocation` and the `EditorStore` restore path | — | Done | Low Risk |
| T2 | Serialize-and-restore round-trip property in the store property suite | T1 | Done | Low Risk |
| T3 | Real-boundary restart with an inline-expanded descendant selected | T1 | Done | Low Risk (end-to-end run required) |
| T4 | Clipboard rich-copy round-trip contract test | — | Done | High Risk (production fix separately authorized) |

**Next task: none. All four tasks are done; delete this plan once the Product Owner confirms nothing further remains.**

Tier note: every task is test-only, so the Low Risk row of `docs/DEVELOPMENT.md` §9 applies — affected type, lint, formatting, and focused test checks. If a task is ever extended to change production code under a separate authorization, it becomes High Risk (persistence, clipboard, or process boundary) and needs `npm run check:full`.

---

### T1 — Cover the restore path's collapsed-location normalization

**Goal.** Pin every branch of `normalizeCollapsedLocation` at the domain level, and pin that `EditorStore.initialize` applies it to a persisted location.

**Risk addressed.** Gap A. The non-null-`currentParentId` branch and the restore caller are uncovered.

**Files expected to change.**

* `src/domain/document.test.ts`
* `src/application/editor-store.test.ts`

**What should be tested.**

Domain level, importing `normalizeCollapsedLocation` from `./document`:

1. A location already at the displayed level is returned unchanged.
2. A location whose selected node equals `currentParentId` — the editable heading — is returned unchanged.
3. A selected node two or more levels below a **non-null** `currentParentId` returns the direct child of that current parent on the path to it.
4. A selected node below a top-level root with `currentParentId === null` returns that top-level root.

Application level, in `src/application/editor-store.test.ts` using the existing `loadedState` helper:

5. For each of cases 3 and 4, `await store.initialize()` produces a ready snapshot whose `location.selectedNodeId` is present in `displayedNodes(document, location.currentParentId)` or equals `location.currentParentId`, whose `location.currentParentId` is unchanged from the persisted value, and whose `focus.nodeId` equals the resulting `location.selectedNodeId`.

**What should NOT be tested.** Inline expansion state itself, the `zM` fold path (already covered in `src/renderer/App.test.tsx`), rendering, persisted file formats, or anything in `src/renderer/`.

**Acceptance evidence.**

* The new domain cases fail if the `parentDepth`/`directChild` walk in `normalizeCollapsedLocation` is neutered to return its input.
* The new store cases fail if the `normalizeCollapsedLocation` call is removed from `EditorStore.initialize`.
* Confirm both by temporarily reverting, observing the failure, and restoring — do not commit the temporary change.
* `npm test` passes; `npm run typecheck`, `npm run lint`, and `npm run format:check:changed` pass.

**Decision reserved.** If case 3 or 5 fails against unmodified production code, report it as a suspected defect and stop.

---

### T2 — Serialize-and-restore round-trip property

**Goal.** Add one property: after any generated command sequence, feeding the store's own serialized state into a second store's `initialize` restores an equal document and a displayed location.

**Risk addressed.** Gap A, generalized beyond the hand-written cases in T1.

**Files expected to change.**

* `src/application/editor-store.property.test.ts`

**What should be tested.**

Reuse the existing `materialize`, `firstLocation`, and `createServices` helpers in that file.

1. Extend the generated command set with a `selectDescendant` action. It must call `store.selectNode(id, 0)` for a node that is a **descendant but not a direct child** of the current `currentParentId`, when the current document offers one; otherwise it is a no-op. Without this the property is vacuous, because no existing generated command produces a deep selection — only inline expansion in the renderer does.
2. After the sequence, take the ready snapshot, build `serializeState(document, location)`, round-trip it through `JSON.parse(JSON.stringify(...))`, construct a second `EditorStore` whose `load` returns that value, and `await initialize()`.
3. Assert the second store is ready, its document deep-equals the first store's document, its `location.currentParentId` equals the persisted one, and its `location.selectedNodeId` is in `displayedNodes(document, currentParentId)` or equals `currentParentId`.

**What should NOT be tested.** Filesystem behavior, IPC, save scheduling, focus cursor offsets, or attachment cleanup.

**Acceptance evidence.**

* The property fails when `normalizeCollapsedLocation` is removed from `EditorStore.initialize`, and passes when it is restored.
* The `selectDescendant` action is demonstrably reached — add a fixed-seed regression case exercising it, in the style of the existing seeded cases in `src/renderer/vim-mixed-interaction.property.test.ts`.
* Keep the run count in line with the file's existing budget; `npm test` stays at roughly its current duration.
* `npm test`, `npm run typecheck`, `npm run lint`, and `npm run format:check:changed` pass.

**Decision reserved.** A property failure against unmodified production code is a suspected defect: report it with the failing seed and stop.

---

### T3 — Real-boundary restart with an inline-expanded descendant selected

**Goal.** Extend the existing relaunch case so the persisted caret sits on an inline-expanded descendant, with a non-null current parent.

**Risk addressed.** Gap A at the real persistence boundary. `AGENTS.md` §9 requires end-to-end coverage for behavior crossing the persistence boundary, and today's relaunch case cannot observe normalization because it selects a top-level root.

**Files expected to change.**

* `e2e/inline-expansion.spec.ts`

**What should be tested.**

Extend the existing test named `starts collapsed after relaunch while the saved document persists`, or add one adjacent case in the same describe block if extending makes it unwieldy. Use the file's existing `nestedSeed()` fixture, whose roots are `Alpha` (children `Alpha child one` with grandchild `Alpha grandchild`, and `Alpha child two`) and `Bravo`.

1. Seed, launch with `initialMode: 'normal'`, and enter `Alpha` so `currentParentId` is non-null.
2. Expand `Alpha child one` through its disclosure control, then focus the `Alpha grandchild` row and type into it, so the pending change guarantees a save.
3. Quit with `closeApp`, then assert with `readPersisted` that the persisted `location.currentParentId` is Alpha's id and `location.selectedNodeId` is the grandchild's id.
4. Relaunch and assert the current parent is still `Alpha`, only the two collapsed child rows render, and the focused row is `Alpha child one` with its caret at the start.

**What should NOT be tested.** Fold keys, drag, windowing, or appearance. Do not add a new spec file and do not add or update a screenshot baseline — this change alters no rendered styling.

**Acceptance evidence.**

* The extended case passes on macOS with a display.
* Record the focused end-to-end run using the evidence format in `docs/DEVELOPMENT.md` §9. A run that cannot launch Electron is **blocked**, not passed; say so explicitly rather than claiming the tier passed.
* `npm run typecheck` passes, including the end-to-end project.

**Decision reserved.** If the relaunched caret does not land on a displayed row, report it as a suspected defect and stop.

---

### T4 — Clipboard rich-copy round-trip contract test

**Goal.** One deterministic test that composes the copy-HTML encoder with the clipboard-HTML decoder and the domain paste, with no Electron and no system clipboard.

**Risk addressed.** Gap B.

**Files expected to change.**

* New file `src/application/clipboard-round-trip.test.ts`.

This is a test-only composition across layers. It must not cause any production module to import across those layers; keep the imports inside the test file.

**What should be tested.**

For a node with links, call `clipboardSelectionTransition`, feed the resulting `payload.html` and `payload.text` to `extractClipboardLinks`, and assert the returned ranges equal the copied ones in offset and URL. Then paste that text and those links into an empty node with `pasteText` and assert the resulting node's links match.

Cover at least:

1. A URL containing `&` in a query string.
2. Surrounding, unlinked text containing `<`, `>`, `&`, and `"`.
3. Text containing a newline, so the encoder's `<br>` and the decoder's handling of it meet.
4. A partially selected link, which must yield no anchor and no link.
5. Two distinct links in one selection, returned in text order.
6. A selection in which the same URL text appears twice but only the later occurrence is linked. This case pins the decoder's `indexOf` position assumption and is the most likely to expose a defect.

A small bounded `fast-check` property over generated text and link ranges is acceptable in addition, provided it is deterministic and keeps the suite fast. If one is added, name the file `src/application/clipboard-round-trip.property.test.ts` instead, per the naming rule in `AGENTS.md` §9.

**What should NOT be tested.** The system clipboard, IPC transport, sanitization of HTML from foreign applications (already covered in `src/infrastructure/main/clipboard.test.ts`), image clipboard payloads, or rendering.

**Acceptance evidence.**

* The test fails if either side's escaping or entity handling is changed in isolation; confirm with a temporary one-sided edit and restore it.
* `npm test` passes and stays at roughly its current duration.
* `npm run typecheck`, `npm run lint`, and `npm run format:check:changed` pass.

**Decision reserved.** If case 6 fails against unmodified production code, report it as a suspected defect with the exact input and stop. Do not adjust the assertion to match current behavior.

**Resolution.** Case 6 failed against unmodified production code, as anticipated: `extractClipboardLinks` resolved a link to the first, unlinked occurrence of a repeated label instead of the actually linked one, because `searchFrom` only advanced past a previously *found* link and not past intervening plain text. Reported to the Product Owner, who authorized a production fix outside this plan's test-only scope, landed in a separate commit together with this test. `npm run check:full` passed, including the full end-to-end and performance suites, per the High Risk clipboard tier in `docs/DEVELOPMENT.md` §9.

---

## Working rules for each task

* One task per commit, message format `test(<scope>): <summary>` per `AGENTS.md` §12. Do not add agent attribution lines.
* Update this plan's status column in the same commit as the task it describes.
* Record validation with the compact format in `docs/DEVELOPMENT.md` §9, including the `npm run validation:snapshot` digest.
* A temporary `WORKING_PLAN.md` is not required: each task is contained, has one owner, and changes only tests.
* These are test-only tasks, so an independent reviewer and a separate product verifier are not required under `AGENTS.md` §13. The primary agent still reviews the diff.
* When the last task lands and the Product Owner confirms nothing remains, delete this file and its row in [README.md](README.md) in the commit that records completion. Nothing here needs to move into `docs/`: the durable rules already live in `AGENTS.md` §9 and `docs/DEVELOPMENT.md` §12, and the tests themselves are the record.

## Resume prompt

```text
Continue the planned work.
```

`AGENTS.md` §8 and `docs/DEVELOPMENT.md` §11 carry the rest: resolving this plan from the index, reading it and the Git state first, taking its next ready task, running the stated validation, and committing the task with its status update. Each task's *Decision reserved* line carries the stop-on-suspected-defect rule. Name the initiative explicitly when another plan is active at the same time.
