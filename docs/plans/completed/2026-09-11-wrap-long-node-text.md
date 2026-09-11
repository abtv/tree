# Wrap Long Node Text

```text
Status: Completed
Created: 2026-09-11
Completed: 2026-09-11
```

## Goal

Show the whole text of a node instead of clipping it to one line. Node text wraps across visual lines and grows the node's height, matching the reading behavior of Workflowy.

## Current State

Node text and the current-parent heading were rendered as single-line `<input>` elements, so long text scrolled horizontally and appeared cut off, as shown in the Product Owner's screenshot.

## Product Requirement

Added to `docs/PRODUCT.md` §2.1:

- node text wraps and the whole text is always shown; a node grows in height to fit its text;
- wrapping is visual only: a node's text contains no line breaks, and `Enter` still creates a sibling;
- long unbroken strings are broken so text never overflows horizontally;
- the bullet stays aligned with the first line, the attached image stays beneath the full text, and the current-parent heading wraps the same way.

## Proposed Approach

- Replace the node/current-parent `<input>` with a controlled auto-growing `<textarea>`.
- CSS: `display: block; resize: none; overflow: hidden; field-sizing: content; overflow-wrap: anywhere`, with `rows={1}` as a base.
- No change to the domain: `selectionStart`/`selectionEnd`, split, paste, and undo all continue to work unchanged; the text has no embedded newlines.
- `Enter`, `↑`, `↓`, `Cmd+.`, `Cmd+,`, `Cmd+Backspace`, and `Backspace` behavior are unchanged.

## Affected Modules

- `src/renderer/App.tsx`: node and parent fields are now `<textarea>`.
- `src/renderer/styles.css`: wrapping and auto-growth.
- `e2e/**`: selectors no longer assume `input`; casts use `HTMLTextAreaElement`.
- `src/renderer/App.test.tsx`: casts updated.
- `e2e/text-wrapping.spec.ts`: new wrapping coverage.
- `docs/PRODUCT.md` §2.1.

## Data Model and Persistence Changes

None. Wrapping is presentation-only; the persisted text is unchanged and still contains no line breaks.

## Testing Strategy

- End-to-end: a long spaced string wraps with no horizontal overflow and grows beyond one line; a long unbroken string breaks; the current-parent heading wraps; wrapped text still creates a sibling on `Enter`.
- Existing unit, component, and end-to-end suites confirm that editing, navigation, splitting, paste, undo/redo, deletion, and persistence still work with the textarea.

## Risks and Open Questions

- **Auto-growth mechanism.** Relies on CSS `field-sizing: content`, supported by the bundled Chromium. Verified end-to-end by asserting the rendered height.
- **`Enter` semantics.** Kept as sibling creation; no in-node newlines were introduced.
- **Harness flake.** The temporary `userData` directory teardown now retries to tolerate a slow Electron shutdown.

## Completion Notes

Implemented and validated. `npm run check:full` passes: type checking, linting, 93 unit/component tests, build, and 40 end-to-end tests (4 new in `e2e/text-wrapping.spec.ts`).