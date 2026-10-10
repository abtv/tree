# Vim Navigation and Replace Corrections

## Authorization and Boundaries

On 2026-10-10 the Product Owner authorized implementing the five confirmed
decisions in `product-structure.md`, then completing PS-11. No persistence,
domain model, or architecture boundary changes are authorized. The previous
VC-1 to VC-3 corrections are complete.

## Tasks

| ID | Outcome and expected files | Acceptance evidence | Tier | Status |
| --- | --- | --- | --- | --- |
| NR-1 | First-nonblank text destinations for G/gg, H/M/L and Ctrl+d/u in Tree and Agenda; renderer keyboard, viewport and Agenda adapters, focused tests, Vim navigation/image and Agenda E2E, PRODUCT §§20.2.9 and 23.4 and VIM_CONFORMANCE | Indented text, text with image, empty/image-only nodes, same-node and counted destinations; one focus publication; real-renderer caret screenshots; check and affected E2E; independent review and verification | Moderate Risk | Done |
| NR-2 | Clamped Visual Node motion preserves caret and range; vim-node-visual-commands, focused and hook tests, image-caret E2E, PRODUCT §20.2.23 and matrix | Both boundaries, counted j/k and gg/G, text/image caret and saved return; failing regression, inspected screenshot, check and affected E2E; review and verifier | Moderate Risk | Done |
| NR-3 | Replace continues through word selection and Agenda row clicks; edit-session, pointer and Agenda adapters, focused tests, text-editing/Agenda E2E, PRODUCT §§20.2.5–6 and 23.4, matrix | Double-click with empty/pending buffer, plain/rich input, selection preserved until typing, one selected-word replacement then continued overwrite, Escape/Undo; editable/read-only/editable Agenda path without read-only edits; check and affected E2E, screenshots, review and verifier | Moderate Risk | Done |

## Decisions and Gaps

All five behavior choices are confirmed. Selected-word replacement means the
first typed sequence replaces the selected range once, then overwrite continues
at its resulting caret. This applies PRODUCT §§20.2.5–6's visible-selection
principle to the approved word selection; it introduces no command or mode.
Successful Visual Node movement and mutations retain their existing rules.
Navigation controls, outside clicks, right-click and drag rules stay within their
recorded scope; preserving Replace across Agenda row clicks does not authorize
preserving it across arbitrary blur.

## Resume

Next task: PS-11 in `product-structure.md`; its migration must not restore
superseded matrix rules. All runtime corrections are complete.
Remove this correction plan after the Product Owner confirms no further tasks
remain. Four task commits maximum in one session includes PS-11; plan creation
lands with NR-1.

NR-1 completed: Tree's keyboard adapter resolves the existing application
boundary target and selects its first non-whitespace text position once; the
separate G image guess is removed. Tree viewport and Agenda adapters apply the
same destination rule. Image-only nodes retain their sole image character.
No persistence or process boundary changed, no disk operations or retained state
were added, and the existing target lookup cost is unchanged apart from scanning
the destination's leading whitespace. The new bounded property guard verifies
that text destinations never activate an image or reuse an old return position.

Validation: npm run check passed all 3259 tests, coverage, governance, static
checks and build with the previously recorded temporary single-worker condition;
the setting was restored. All 127 affected Electron cases passed through composed
evidence: 124 broader-suite passes and corrected reruns of three cases whose
assertions expected superseded image destinations or misread a contenteditable
selection/viewport target. No runtime or baseline change was needed for those
reruns. The text-before-image renderer screenshot was inspected; existing
affected light/dark baselines passed. Independent review and product verification
reported no meaningful issues. No unresolved validation failures remain.

The history report flags repeated Vim/Agenda fixes, but the existing single
caret authority is retained and G's extra image guess is removed; no additional
structural initiative is indicated. AGENTS §12 ends this session after resolving
the broader-suite failures. Continue NR-2, then NR-3 and PS-11; no new permission
is required for those already authorized tasks.

NR-2 completed: Tree whole-node Visual motions now return before updating range,
Visual memory, focus or image synchronization when the destination is the active
endpoint. Clamped j/k (including counts), gg/G and repeated motions preserve text
carets, image carets and saved text return positions. Successful movement and
mutations retain their existing rules; Agenda already had the equivalent guard.
PRODUCT §20.2.23 and the conformance matrix record the correction. No additional
product decision, persistence change, write, sync or retained state was added;
the guard reduces work on clamped motions.

Validation passed: 3269 unit tests and coverage/static/governance/build checks
under the same temporary single-worker condition as NR-1 (configuration restored),
and all 154 affected Electron cases through the broader run and focused reruns.
The Visual Node range and Normal image-caret screenshots were inspected. The
initial default-parallel natural-date timing failure and existing pointer-drag
selection failure passed on their respective serial/focused reruns without a
runtime or threshold change. Independent review and product verification found
no meaningful issues. No unresolved validation failure remains.

The fix-history report again flags repeated Vim/Agenda fixes. This correction
uses the existing caret authority and avoids a needless focus publication in its
existing Visual owner; no additional structural initiative is indicated. Continue
NR-3 in a new session, then PS-11.

NR-3 completed: double-clicked words retain their visible selection and Replace
mode with empty or pending buffers in plain and rich text, within or across
nodes. The first character replaces the selected range once, then overwrite
continues. Agenda row clicks commit the old buffer once and resume Replace on
the focused editable occurrence, retaining the mode through read-only rows
without editing them. Non-click keyboard navigation/application commands and
outside/window focus loss retain their existing Normal-mode exit boundary.
Pre-click and post-click edits remain separate for Undo. PRODUCT §§20.2.6 and
23.4 and the matrix's representative evidence inventory record these rules.
No additional product decision or persistence/process boundary change was made.

Validation passed: `npm run check` with 3295 unit tests and coverage/static/
governance/build checks; all 227 distinct affected Electron cases through the
expanded run and focused command/startup reruns; four focused performance cases.
Three synthetic word-selection and Agenda focus screenshots were inspected.
The initial timing failure, absent new baselines, overlapping-run interference,
and one isolated Electron startup timeout were resolved without weakening tests
or budgets. Independent review found a read-only keyboard exit gap, which was
reproduced and corrected; final review and product verification found no
meaningful issues. No unresolved validation failure remains.

The new repeated Replace-click performance guard verifies paint latency, bounded
mounted rows and zero saves on a large Agenda. No new disk writes/syncs, retained
collections or unbounded document traversal were added. The fix-history report
flags repeated Vim/Agenda corrections; NR-3 uses the existing session and mode
authorities, so no additional structural initiative is indicated. Stop this
session under AGENTS §12 after the validation surprises. Suggested next prompt:
`Continue PS-11.` Keep this correction plan until the Product Owner confirms no
further tasks remain.
