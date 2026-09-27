# Single Owner for Renderer Interaction State

Status: Accepted
Date: 2026-09-27

## Context

Renderer interaction state — the Normal-mode caret target, the caret's DOM selection, the Vim register and pending
Insert or Replace session, the pending command with the last repeatable change, character find, and character Visual
endpoints, the structural Insert session, the drag caret-freeze record, and the pending hyperlink-draft check — was
re-derived and re-written at each call site. Callers computed the same fact from scratch or kept a parallel copy, so a
new path could silently omit one update and leave state inconsistent with what was rendered.

Classifying every `fix` commit in the repository by theme found four recurring clusters with that single design cause:
Vim caret, image, and session state (17 fixes); node drag against caret and selection (9); selection and caret
styling (8); and hyperlink caret and selection (9). Seven of the styling fixes are named "match" or "align" and exist
only to make two duplicated values agree. Overall line coverage was 95.58% while those defects were being introduced,
and the weakest per-file coverage sat exactly where state stayed inside the React hook, so test volume was not the
constraint — ownership was. The caret transition pattern established in `vim-caret-transition.ts` had already shown
that extracting a fact into a pure renderer-local module with explicit transitions removes the class of defect.

## Decision

Renderer-local interaction state that spans commands or events has exactly one owner: a pure renderer-local module
that is free of React, DOM, Electron, filesystem, and store dependencies and exposes transitions over one state
object. `use-node-input-bindings.ts` holds one instance of each owner and is the single place that projects that state
into React, the DOM, and the store. `vim-keyboard-handler.ts`, `editor-input-handlers.ts`, and the input bindings are
adapters: they act only through owner transitions, including owner-backed access-time handles where a handler needs
direct field access, and they must not keep a parallel copy of a fact or resynchronize it at each call site. Pointer
and drag paths ask the caret authority to suspend or restore the caret instead of writing caret state themselves.

## Consequences

- New behavior that touches this state is added as an owner transition with a focused test; the hook only projects the
  result. A genuine defect found while extracting is reproduced and fixed defect-first rather than preserved.
- Per-file coverage floors in `vitest.config.ts` guard the extracted owners and the projection point as regression
  guards set just below measured coverage.
- Owners keep bounded state that does not grow across edits, with transitions bounded by the active node text or the
  captured register payload and no disk writes, so the performance assessment in `docs/ARCHITECTURE.md` §21 continues
  to apply.
- The pattern governs renderer-local UI state only. Application and domain ownership, persistence, process
  boundaries, and product behavior are unchanged, and changing them still needs Product Owner approval.
