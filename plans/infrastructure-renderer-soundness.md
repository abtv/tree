# Infrastructure and Renderer Soundness Review

## Source and authority

Follow-up fixes from a Product Owner-requested soundness review of `src/infrastructure` and
`src/renderer` (2026-09-29). The review was performed in conversation and is not otherwise recorded
in the repository; its complete findings are reproduced below, so no task depends on that
conversation.

The Product Owner asked for the review from a production-readiness perspective, authorized this plan,
and authorized implementing all five tasks it lists. Every task is therefore `Ready`; nothing further
needs to be authorized before starting one. That authorization covers these tasks only — it is not
authorization for work this plan does not list, and the decisions in D1 and D2 remain reserved.

Scope limits:

* This plan covers only `src/infrastructure` and `src/renderer`, plus the tests and fixtures a task's
  acceptance evidence requires. `src/domain`, `src/application`, `src/main`, and `src/preload` were
  out of scope for the review; touch them only where a task explicitly says so.
* I2, I4, and I5 exist because a specific risk is unguarded, not to raise a coverage percentage.
  `AGENTS.md` §9 forbids adding tests solely for coverage; do not widen them into a coverage sweep.
* No task authorizes changing the persistence format, the document-generation retention rule, the
  clipboard channel contract, the windowing thresholds, or any user-visible behavior beyond what its
  own entry states.

Sources of truth: `docs/PRODUCT.md` §16 (save failure and retry), §21 (document generations,
recovery, attachment cleanup — around lines 746-813), §11 (hyperlinks and clipboard, around lines
594-628), §2.4 (inline expansion) and §4 (node rows, around lines 72-89);
`docs/ARCHITECTURE.md` §13 (persistence); `docs/DEVELOPMENT.md` §9 (validation tiers) and §13
(persistence testing); `src/renderer/AGENTS.md` (renderer rules).

## State

Baseline measured on `c900c56` with a clean worktree, `npx vitest run --coverage`
(73 files, 1145 tests, pass):

| Area | % Stmts | % Branch | % Funcs | % Lines |
| --- | --- | --- | --- | --- |
| `src/infrastructure/main` | 94.94 | 87.60 | 98.30 | 97.78 |
| `src/infrastructure/renderer` | 100 | 100 | 100 | 100 |
| `src/renderer` | 93.16 | 87.80 | 91.92 | 95.34 |
| All files | 94.30 | 88.33 | 94.79 | 96.76 |

Coverage is adequate in both directories and is not the reason these tasks exist. Every module in
`src/infrastructure` has a unit test, and the Electron boundary is covered by the end-to-end suite
(`e2e/persistence-reliability.spec.ts`, `e2e/shutdown-failures.spec.ts`,
`e2e/attachment-cleanup.spec.ts`, `e2e/clipboard.spec.ts`, `e2e/windowed-list.spec.ts`). The review
verified that most low per-file percentages in `src/renderer` are real-boundary paths that jsdom
cannot execute or defensive guards, not untested behavior — see "Observations that are deliberately
not tasks". I1 is a defect; I3 is an incomplete implementation of a stated product rule; I2, I4, and
I5 close named gaps the review found while tracing those paths.

At the end of the review session, no task had started and the worktree was clean. I1 and I2 are now
done; I3 is next.

## Decisions

* **D1 — clipboard label whitespace matching (reserved for the Product Owner).** I3 decodes HTML
  character references so a hyperlink label from a rich-text source can be located in the plain-text
  flavor. It deliberately does not normalize whitespace: after decoding, a label containing a
  no-break space (U+00A0) still matches only a plain-text flavor that also contains U+00A0, which is
  what Chromium produces. Making a decoded U+00A0 match an ordinary space would change which pastes
  keep their hyperlink and how the label maps onto text offsets. Do not implement that in I3. If
  implementation shows it matters, record the case and ask the Product Owner.
* **D2 — generation retention when nothing is old enough (reserved for the Product Owner).** See F4.
  `pruneGenerations` keeps only `MAX_RETAINED_GENERATIONS` when no generation is older than
  `SAFETY_WINDOW_MS`, deleting the oldest copies — the ones closest to becoming the retained safety
  generation. `docs/PRODUCT.md` §21 does not say what happens in that case, so I4 records the
  behavior in a code comment only and changes no retention decision. Any change to which generations
  survive is a product change and needs the Product Owner first.
* **D3 — no new end-to-end test for I1 (derived from `AGENTS.md` §9, not reserved).** The filesystem
  boundary I1 touches already has real-boundary and failure-path coverage in
  `e2e/persistence-reliability.spec.ts` and `e2e/shutdown-failures.spec.ts`, and the interleaving I1
  fixes cannot be forced deterministically from Playwright. The acceptance evidence is a defect-first
  contract test at the module seam plus the unchanged end-to-end suite. Do not add a timing-dependent
  end-to-end test.
* **D4 — no new end-to-end test for I3 (derived from `AGENTS.md` §9, not reserved).** The HTML
  clipboard flavor is already exercised at the real boundary by `e2e/clipboard.spec.ts:93` and `:118`
  (copy/cut a hyperlink, paste it into another node). Asserting an externally authored HTML flavor
  would need a new `writeClipboardHtml` fixture helper, which is a shared-fixture change outside this
  task's scope. Unit tests are the acceptance evidence; rerun the existing clipboard suite.

## Findings reproduced from the review

### F1 defect (I1) — `load()` is the only file operation outside the serialization queue

`createFileServices` (`src/infrastructure/main/file-services.ts:39`) serializes every operation
through `operationQueue` via `enqueue` (`:147`): `save` (`:100`), `writeAttachment` (`:104`),
`readAttachment` (`:113`), and `cleanupAttachments` (`:126`). `load` (`:55`) calls `runOperation`
directly and never joins the queue, so it can interleave with an in-flight save at any `await`.

`saveDocument` (`:176`) performs two renames: the generation rotation
`document.json` → `document.<n>.json`, then the replacement `document.json.tmp` → `document.json`. A
`load` that starts between them sees `document.json.tmp` as the newest candidate
(`listLoadCandidates`, `:274`), validates it, and promotes it to `document.json` (`:91`). The save's
own replacement rename then fails with `ENOENT`:

```text
save:  write document.json.tmp  ->  rename document.json -> document.1.json  ->  [load interleaves]
load:  newest candidate is document.json.tmp  ->  valid  ->  rename document.json.tmp -> document.json
save:  rename document.json.tmp -> document.json  ->  ENOENT  ->  save rejects
```

The document that reaches disk is correct — the promoted temporary file holds exactly the state being
saved — so this is a spurious save failure rather than data loss. The consequence is still
user-visible: `persistence-coordinator.ts` surfaces it as a save failure, and the documented
consecutive-failure limit (`docs/PRODUCT.md` §16.2, §21) puts the editor into the locked
save-failure state.

It is reachable in production. `ErrorBoundary` (`src/renderer/ErrorBoundary.tsx:29`) reloads the
renderer with `globalThis.location.reload()`, and the reloaded renderer constructs a new store whose
`initialize` calls `load` again (`src/application/editor-store.ts:147`) through
`src/main/ipc-handlers.ts:72` — in the same main-process lifetime, where a save requested before the
failure can still be in flight. `e2e/renderer-failures.spec.ts` exercises exactly that reload path.

No test drives `load` and `save` concurrently.

### F2 gap (I2) — the windowed list's height bookkeeping has no unit coverage

`NodeList.tsx:83-106` (the `ResizeObserver` callback) and `:108-118` (the window-resize handler) are
unexecuted by the unit suite: jsdom defines no `ResizeObserver`, so the effect returns at `:84`, and
no test dispatches a `resize` event. These lines are the whole of the measured-height bookkeeping
that windowing depends on — the `borderBoxSize` versus `getBoundingClientRect` fallback, the
`height > 0` guard that keeps a stale height instead of collapsing a row to zero, and clearing
`heightsRef` when and only when the window width changes.

The behavior is covered in the real renderer by `e2e/windowed-list.spec.ts` ("resizing the window
re-wraps rows and keeps navigation and focus correct", "editing a row to wrapped text grows the row
and the list height"), so this is a missing unit guard rather than untested behavior. A regression in
these rules currently surfaces only as a slow, machine-sensitive end-to-end failure. The stub pattern
needed already exists at `src/renderer/use-node-input-bindings.test.tsx:2126-2135`
(`vi.stubGlobal('ResizeObserver', TestResizeObserver)` capturing the callbacks), and
`src/renderer/NodeList.test.tsx:783-792` shows how to assert windowed spacer heights.

### F3 defect (I3) — clipboard hyperlink labels with character references lose their link

`decodeHtml` (`src/infrastructure/main/clipboard.ts:53`) decodes only `&amp;`, `&quot;`, `&#39;`,
`&lt;`, and `&gt;`. `extractClipboardLinks` (`:37`) locates each anchor's decoded label in the
plain-text flavor with `text.indexOf(label, searchFrom)` (`:45`) and drops the anchor when the label
is not found (`:46`). So a label containing any other character reference — `&nbsp;` and numeric
references such as `&#8203;` or `&#x2019;` are common when copying from Google Docs, Word, or Slack —
never matches, and the pasted text silently loses a hyperlink that `docs/PRODUCT.md` §11 (around line
622) says is preserved.

Decoding is also order-dependent: `&amp;` is replaced first, so `&amp;lt;` decodes to `<` instead of
the literal `&lt;`. A single pass over all references fixes both problems at once. Ordinary
`&amp;`-escaped URLs already decode correctly and must keep doing so.

`src/infrastructure/main/clipboard.test.ts:49-72` covers only ASCII labels: one matching anchor, one
partial selection, and two ignored anchors. Nothing covers a character reference, a multi-anchor
paste, or `&amp;` inside an `href`.

### F4 observation (I4) — the generation safety window is ignored when no generation is old enough

`pruneGenerations` (`src/infrastructure/main/file-services.ts:204`) sorts generations newest first and
finds the first one older than `SAFETY_WINDOW_MS` (`:213`). When one exists, everything newer plus
that generation is retained, which is the rule `docs/PRODUCT.md` §21 states. When none exists
(`safetyIndex < 0`), `retainedCount` falls back to `MAX_RETAINED_GENERATIONS` (`:214-215`) and the
oldest generations are deleted — the ones that would have become the retained safety generation
moments later.

This is not a live defect: reaching it requires more saves inside `SAFETY_WINDOW_MS` than
`MAX_RETAINED_GENERATIONS`, and the autosave idle interval in `src/application/save-policy.ts` is far
longer than that. The review confirmed `src/infrastructure/main/file-services.test.ts:275` ("keeps the
retention cap of young generations during pruning") pins the current behavior deliberately. The gap is
that the intent is not recorded anywhere, so a future reader cannot tell the fallback from an
oversight. See D2.

### F5 gap (I5) — the disclosure triangle's caret-preserving `onMouseDown` is never exercised

`docs/PRODUCT.md` §4 (around line 72) requires that clicking a node's disclosure triangle expands or
collapses it "without entering it, moving the text caret, or editing the node". The triangle prevents
the default caret placement in two handlers, `onMouseDown` (`src/renderer/NodeRow.tsx:101-104`) and
`onPointerDown` (`:105-108`). Only the pointer handler is exercised, by
`src/renderer/NodeList.test.tsx:316` ("does not start a drag from the disclosure triangle"); the mouse
handler is unexecuted by the whole suite. The equivalent handler on the enter control (`:85-88`) is
covered by `src/renderer/App.test.tsx:528`. Removing the triangle's `onMouseDown` body today breaks no
test.

### Observations that are deliberately not tasks

The review traced every low per-file coverage number in both directories. The following are covered
elsewhere or are intentionally unexecuted; do not add tests for them.

* `src/renderer/use-node-input-bindings.ts` (73% branch) — the uncovered branches are
  `status !== 'ready'` and `locateNode === undefined` guards plus `repeatStructural`'s
  structural-delete, subtree-put, forest-put, and open-sibling branches (`:294-319`). The structural
  dot-repeat paths are covered at the real boundary by `e2e/vim-navigation-and-visual.spec.ts`
  ("repeats dd and subtree puts with fresh IDs", "selects complete sibling subtrees with V and repeats
  their deletion", "repeats open-sibling text and rejects a subtree put into its descendant"). The
  file's lowered per-file thresholds in `vitest.config.ts` are the measured regression floors
  described in that file's comment; do not lower them and do not chase them upward.
* `src/renderer/App.tsx:251-255` (clicking the blank part of an image-only current parent) is covered
  by `e2e/attachment-validation.spec.ts:143`.
* `src/renderer/AttachmentPreview.tsx:83-85` (the attachment button's `onPointerDown`) is covered by
  the real `Open image preview` click in the end-to-end suite.
* `src/renderer/editor-input-handlers.ts` reports 56% functions only because its
  `.catch(… store.reportError)` callbacks are never rejected in tests; the surrounding statements are
  covered.
* `src/renderer/use-node-list-drag.ts:286-298` are the `setPointerCapture` and
  `releasePointerCapture` try/catch guards, and `:80-96` are non-integer and zero-height row guards.
* `src/infrastructure/renderer/attachment-bytes-cache.ts` re-adds an entry in `retain` without
  subtracting its previous size, which would double-count `totalBytes`. The review confirmed this is
  unreachable: `get` returns early for a cached id, and `pending` deduplicates concurrent reads while
  `clear`'s generation check discards a stale read. Leave it alone.
* `src/infrastructure/main/clipboard.ts:42-43` are `?? ''` defaults for regex groups that always
  match.
* Modules without a test file of their own (`LocationBar.tsx`, `NodeRow.tsx`, `NodeInput.tsx`,
  `QuitWithoutSavingPrompt.tsx`, `node-list-layout.ts`, `use-node-list-drag.ts`,
  `vim-keyboard-handler.ts`) are driven through their consumers' tests, several at 100%. They do not
  need separate files.

## Tasks

| ID | Outcome and acceptance evidence | Files expected to change | Tier | Status |
| --- | --- | --- | --- | --- |
| I1 | Serialize `load` with every other file operation per F1, by routing it through `enqueue` with its existing operation name and log paths so the logged start/success/failure shape is unchanged. Acceptance: a defect-first contract test that fails before the fix because the save rejects with `ENOENT`, and after the fix has the concurrent `load` resolve to the state being saved while the save resolves and `document.json.tmp` is gone; confirm it fails again with the fix reverted (`AGENTS.md` §9); existing `file-services` tests and the persistence end-to-end suites pass unchanged. See D3: no new end-to-end test. | `src/infrastructure/main/file-services.ts`, `src/infrastructure/main/file-services.test.ts` | High | Done |
| I2 | Add unit coverage for the windowed list's height bookkeeping per F2: a `ResizeObserver` entry with `borderBoxSize` updates the stored height and re-lays out; an entry without `borderBoxSize` falls back to `getBoundingClientRect().height`; a zero height does not overwrite a known height; a `resize` event that changes `globalThis.innerWidth` clears measured heights and re-measures, while one that leaves the width unchanged does nothing. Acceptance: each rule asserted through observable output (rendered rows and `.node-list-spacer` heights) above `WINDOWING_THRESHOLD`, following `NodeList.test.tsx:783-792` and the stub at `use-node-input-bindings.test.tsx:2126-2135`; no production file changes. | `src/renderer/NodeList.test.tsx` | Low | Done |
| I3 | Decode HTML character references in one pass per F3, covering the currently handled named references plus `&nbsp;` and decimal and hexadecimal numeric references, so `&amp;lt;` no longer double-decodes. Acceptance: defect-first tests that fail before the change for a `&nbsp;` label matching a U+00A0 plain-text flavor and for a numeric-reference label; tests pinning `&amp;lt;` to the literal `&lt;`, an `&amp;`-escaped `href` decoding to a single `&`, and a two-anchor paste keeping both links in order; existing clipboard tests and `e2e/clipboard.spec.ts` pass unchanged. Honor D1: no whitespace normalization. See D4: no new end-to-end test. | `src/infrastructure/main/clipboard.ts`, `src/infrastructure/main/clipboard.test.ts` | High | Ready |
| I4 | Record the retention fallback in F4 as a code comment next to the `safetyIndex < 0` branch, naming what it keeps, why the safety rule cannot be satisfied when no generation is old enough, and that the save cadence keeps it unreachable. Acceptance: the comment states the invariant the existing `file-services.test.ts:275` case pins; no behavior change, no test change, no `docs/PRODUCT.md` change. Honor D2: do not change which generations survive. | `src/infrastructure/main/file-services.ts` | Low | Ready |
| I5 | Cover the disclosure triangle's `onMouseDown` per F5: fire `mouseDown` on the triangle and assert the default is prevented and the document selection is cleared, mirroring the enter-control case at `App.test.tsx:528`. Acceptance: the new assertion fails when the handler body is removed; no production file changes. | `src/renderer/NodeList.test.tsx` or `src/renderer/App.test.tsx` | Low | Ready |

Dependencies: none between tasks. Each is independently implementable and independently committable,
one logical task per commit (`AGENTS.md` §12). The recommended order is I1, I2, I3, I4, I5 — highest
risk first — but a later task may be taken first if the Product Owner authorizes it. I2 and I5 both
touch `src/renderer/NodeList.test.tsx`; if both are in flight, land I2 first to avoid a conflicting
edit.

Per `AGENTS.md` §13, I1 and I3 are High Risk changes at a process, filesystem, or clipboard boundary
and additionally require an independent reviewer. I3 changes user-visible paste behavior, so it also
needs product verification of the hyperlink paste flow; the primary agent may perform it because the
flow is contained, and a separate product verifier is needed only if the change grows beyond
`clipboard.ts`. I1 is an internal serialization fix whose user-visible effect is the absence of a
spurious save failure; the primary agent verifies the save and reload flows. I2, I4, and I5 are
contained internal changes and need neither role. No task is rendering-sensitive, so the
visual-regression workflow in `AGENTS.md` §9 does not apply; do not generate or update screenshot
baselines.

None of these tasks changes product behavior beyond making a stated requirement hold, so no
`docs/PRODUCT.md` change is expected. If implementation shows otherwise, stop and ask the Product
Owner before implementing (`AGENTS.md` §5).

## Next task

I3 — decode HTML character references in clipboard hyperlink labels in
`src/infrastructure/main/clipboard.ts` and its focused tests, following F3.

Implementation notes for I1, so the task does not depend on this plan's authoring session:

* The fix is to return `enqueue('load', [documentPath, temporaryDocumentPath, dataDirectory], …)`
  instead of calling `runOperation` directly at `file-services.ts:55`, keeping the existing async body
  unchanged. `enqueue` is generic and already forwards the resolved value, and it swallows rejections
  when chaining the queue (`:153-156`), so a failed load still rejects to its caller without blocking
  later operations. A load-specific guard was considered and rejected: one serialization point for
  every operation is simpler and is what the module already documents by construction.
* `EditorStore.initialize` awaits `load`, so a queued load now waits for a pending save. That cannot
  deadlock, because every queued operation settles.
* For the defect-first test, follow the rename-interleaving pattern already in
  `src/infrastructure/main/file-services.test.ts:788-794`: take the real module with
  `vi.importActual`, count `rename` calls, and after the first one (the generation rotation) start a
  second, concurrent `services.load()` without awaiting it inside the mock — awaiting it there would
  deadlock once the fix queues it. Yield enough turns (for example a few `setImmediate` ticks) for the
  unfixed load to reach its own promotion rename before the save continues, then await the save and
  the load outside the mock. Before the fix the save rejects with `ENOENT`; after it, both resolve and
  `document.json.tmp` is absent. `afterEach` already resets the `rename` mock.
* Validation for I1 is the High Risk tier (`docs/DEVELOPMENT.md` §9): `npm run check:full`. Record
  each result with the evidence format in `docs/DEVELOPMENT.md` §9 and `npm run validation:snapshot`.
  A blocked end-to-end or performance suite must be reported as blocked, not as passed.
* Commit as `fix(infrastructure): serialize document load with the file operation queue`, together
  with this plan's status update for I1 (`AGENTS.md` §12).

All five tasks are authorized and `Ready`, so a session may continue to the next one in the
recommended order after committing the previous task, while context stays manageable
(`AGENTS.md` §12). Mark each task `Done` in the same commit that lands it, and leave the plan and any
`WORKING_PLAN.md` in place if a session stops before committing.

Resume prompt: "Continue the infrastructure and renderer soundness review in
`plans/infrastructure-renderer-soundness.md`. Read `AGENTS.md`, that plan, and `docs/DEVELOPMENT.md`
§9, then implement its next Ready task in the recommended order, commit it together with the plan
status update, and continue to the following task if context allows."
