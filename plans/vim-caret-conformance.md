# Vim Caret Conformance Follow-Ups

## Objective

Close the Vim caret deviations found while fixing the undo/redo caret, and make a deliberate
divergence from Vim visible in the conformance inventory so an accidental one stands out.

## Source

The Product Owner reported that `u` moved the caret to the beginning of the node and asked for a
check for other edit paths whose caret does not behave like Vim. That check produced the task list
below. The undo/redo fix itself is committed separately and is not part of this batch.

## Authorization

The Product Owner authorized VCC-1 on 2026-09-28: character-wise Visual `u`/`U` must leave the caret
at the start of the operated range, as Vim does. `docs/PRODUCT.md` §20.2 does not specify that caret
today and must be updated to state it. Task 2 is an internal documentation change and needs no
product decision.

The Product Owner authorizes each task individually. Keep this plan until they confirm no further
tasks remain.

## Tasks

| ID | Outcome | Status | Depends on | Validation tier |
| --- | --- | --- | --- | --- |
| VCC-1 | Character-wise Visual `u`/`U` leaves the caret at the start of the operated range | Done | — | Moderate Risk |
| VCC-2 | `docs/VIM_CONFORMANCE.md` marks rows that intentionally diverge from Vim | Planned | — | Minimal Risk |

### VCC-1 — Visual `u`/`U` caret

`src/renderer/vim-keyboard-handler.ts:831-837` (`applyVisualCase`) passes
`selection.start + Math.max(0, replacement.length - 1)` to `leaveVisual`, which leaves the caret on
the last character of the operated range. Vim leaves the cursor at the start of the range for a
Visual-mode operator, and this file's own Visual `d`/`x`/`y` branch (`:551`) already passes
`selection.start`. The two paths disagree with each other today.

Files expected to change: `src/renderer/vim-keyboard-handler.ts`,
`src/renderer/vim-keyboard-handler`'s focused tests, `docs/PRODUCT.md` §20.2 (the caret after Visual
`u`/`U` is currently unspecified), `docs/VIM_CONFORMANCE.md`, and a case in
`e2e/vim-navigation-and-visual.spec.ts` — its existing `U` coverage at `:353` is whole-node Visual,
so no test asserts the character-wise caret.

Acceptance evidence: a focused test that fails on the current caret and passes on the start-of-range
caret, plus real-Electron coverage of the character-wise path. Confirm Vim's behavior before
implementing rather than relying on the analysis above.

Nothing is reserved for the Product Owner: the caret position is decided. Confirm Vim's actual
behavior while implementing, and reproduce the current caret in a failing test first.

### VCC-2 — Mark deliberate divergences in the conformance inventory

`docs/VIM_CONFORMANCE.md` maps requirements to tests but never records whether an expected behavior
matches Vim. That is why the undo/redo caret defect survived a multi-session initiative: the
inventory, the property-test model, the reviews, and `docs/PRODUCT.md` §10 all agreed on cursor `0`,
and nothing in the repository compared that expectation against Vim. Tracing more paths would not
have found it.

Add an explicit marker to each row whose expected behavior deliberately differs from Vim, with the
reason, so an unmarked divergence is a defect rather than an invisible assumption. Candidates to
assess include whole-node commands in an outliner that has no lines, the image character, and the
structural commands that land at cursor `0`.

Files expected to change: `docs/VIM_CONFORMANCE.md`, and `docs/DEVELOPMENT.md` §8 if the marker
becomes part of the required review procedure.

## Progress

VCC-1 landed on 2026-09-28 (see git history): `applyVisualCase` leaves the caret at
`selection.start`, `docs/PRODUCT.md` §20.2 specifies it, and focused and real-Electron tests
(including inspected light/dark screenshots of the resulting block caret) cover it.

## Next task

VCC-2, the only remaining task. It is a documentation change with no product decision, but the
Product Owner authorizes each task individually, so confirm the go-ahead before starting it.

## Resume prompt

> Continue the Vim caret conformance batch in `plans/vim-caret-conformance.md`. Start VCC-2: mark
> the rows in `docs/VIM_CONFORMANCE.md` whose expected behavior intentionally diverges from Vim,
> with the reason, so an unmarked divergence reads as a defect.
