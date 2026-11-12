# Visual Text-Line Numbers

Status: Awaiting owner decision on cold calculation and gutter width.

## Authorization and scope

The owner requested numbers for every visual text row, tried the small-document runtime prototype, then said: "it's ok, accept it, check it and you can save now". This authorizes finalization, validation and commits of the agreed work. Previous no-commit instructions are superseded. The earlier combined Agenda responsiveness, five explicit state models and active-line highlight are accepted and can be committed independently. This plan concerns one focused numbering feature; it does not authorize a general performance initiative or new navigation behavior.

The accepted preview shows sequential visual text-line numbers in Tree and Agenda, excluding existing headings and passive path labels. Each Agenda occurrence counts separately. Image-only nodes retain one number; an attachment does not add numbers below nonempty text. Existing numeric navigation commands and caret owners retain their semantics. The production preference, shortcut, persistence and no-document-save behavior remain governed by PRODUCT §2.1.

## Required owner decision

Exact numbering after a jump requires exact line counts for every preceding displayed node. Current estimated list heights are not text counts, and Agenda entry heights contain nontext spacing and labels. A real Electron cold probe measured 100000 nodes and 590000 visual lines in about 1.5 seconds. Its small batch cost does not prove the budget for an oversized individual node.

The recommended option is background exact counting with unresolved numbers temporarily blank, never estimated or stale. Reserve the same gutter in both preference states using a safe text-length upper bound; this may be wider than the exact result, but prevents toggling from changing wrapping and avoids circular gutter/count recalculation. This package changes main-flow behavior beyond the small preview and needs an explicit owner decision. The alternative offered is retaining the new numbering as a prototype. The question is pending; do not implement dependent production behavior until answered.

## Implementation after decision

One logical implementation task owns the renderer numbering model, bounded real-DOM measurement adapter, shared hook, Tree/Agenda presentation, requirements and tests. Expected files: new `visual-line-numbers-state.ts`, `visual-line-measurement.ts`, `use-visual-line-numbers.ts` and focused tests under `src/renderer/`; `NodeList.tsx`, `AgendaView.tsx`, `NodeRow.tsx`, `AgendaRow.tsx`, `styles.css`; replacement or removal of the obsolete application per-node numbering helper; `docs/PRODUCT.md` §2.1 and `docs/ARCHITECTURE.md` §8. Keep text measurement out of application/domain and avoid new dependencies, workers or process boundaries.

Use node IDs in Tree and occurrence keys in Agenda. Retain exact counts and a prefix-sum/unknown index for the current ordering; changing one count must not scan all rows on every caret event. A number requires a known preceding prefix and its own count. Folds, scope and document replacement invalidate the appropriate order or entries. Background batches share one bounded hidden host and preserve real typography, width, indentation, rich decorations, Unicode and trailing empty lines. Do not expose measurement elements to normal row/editor queries. Generation checks reject stale work after edits, resize, view/scope change, preference disable and unmount. Release retired contexts; do not accumulate caches of past widths, documents or scopes.

Rows render one aria-hidden multiline number element, preserving bullets, disclosure, text selection, focus, native/synthetic caret authority and current-line tint. This adds no document writes, syncs, history entries or persistence fields. Large cold calculations must yield to input; assess and guard one oversized row separately.

## Validation and completion

High Risk applies because numbering introduces scale-sensitive renderer state. Required: focused pure-index and DOM contract tests; real Electron numbering, exact late-jump prefix, edit/fold/scope/mirror/resize/toggle/selection coverage; inspected light/dark Tree and Agenda screenshots; `npm run check`, full local Electron E2E and audit under the existing development-only exception. Select performance scenarios for counting with numbers enabled, input delivery while calculating, late jump, resize, rapid view/preference switching, document replacement, bounded DOM/cache and an oversized row. Run suites serially. Whole-file mutation applies to changed application/configured pure targets; do not weaken thresholds or exclusions.

Independent code review and product verification must trace lifecycle and invalidation paths. Reuse unchanged prior evidence and rerun invalidated checks only. No extra owner review of internal details is required; raise a further material change if implementation changes the shown result or reveals another substantial tradeoff. One substantive numbering task is planned; no execution budget was specified. Exact commands, probe limitations and temporary continuation evidence remain in WORKING_PLAN.md.
