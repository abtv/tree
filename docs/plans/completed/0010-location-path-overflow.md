# Constrain the Location Path

```text
Status: Completed
Created: 2026-09-11
Completed: 2026-09-11
```

## Goal

Prevent long breadcrumb segment text from breaking the layout and causing horizontal scrolling, as shown in the Product Owner's screenshot.

## Current State

The location toolbar renders one segment per ancestor. Segment labels had no width constraint or ellipsis, and the toolbar did not clip, so a long ancestor made the whole page wider and introduced a horizontal scrollbar. The main heading was already wrapping, so the current parent's full text remained visible.

## Product Requirement

Added to `docs/PRODUCT.md` §2.2:

- the location toolbar is confined to a single line;
- when space is limited, shorter segments are preserved and longer segments are truncated first;
- a truncated segment ends with an ellipsis, and its full text remains available as a tooltip;
- the toolbar never causes the window to scroll horizontally, regardless of path depth or segment length.

## Proposed Approach

- Make the toolbar `overflow: hidden` and `white-space: nowrap`.
- Let segments shrink (`flex: 0 1 auto; min-width: 0`) while the root glyph and separators keep their size (`flex: 0 0 auto`).
- Weight each segment's `flex-shrink` by its text length so long segments absorb the truncation and short ones are preserved.
- Apply `overflow: hidden; text-overflow: ellipsis; white-space: nowrap` to ancestor links and the current-parent label.
- Add a `title` with the full text to ancestor links and the current-parent label.

## Affected Modules

- `src/renderer/App.tsx`: `location-current` class, `title` attributes, per-segment `flexShrink`.
- `src/renderer/styles.css`: toolbar clipping and segment truncation.
- `e2e/location-path.spec.ts`: new coverage.
- `docs/PRODUCT.md` §2.2.

## Data Model and Persistence Changes

None. Presentation only.

## Testing Strategy

End-to-end: with a short root, a long ancestor, and a long current parent, assert the short segment is not truncated while the long segments are, the toolbar content does not overflow, the page does not scroll horizontally, the current segment stays visible, the full text is available as `title`, and the main heading still shows the full text.

## Risks and Open Questions

- **Discoverability.** The full ancestor text is only visible via tooltip; this matches file-explorer behavior and was accepted.
- **Accessibility.** Clickable ancestor segments remain buttons; the title provides the untruncated text.

## Completion Notes

Implemented and validated. `npm run check:full` passes: type checking, linting, 93 unit/component tests, build, 41 end-to-end tests, and 5 performance scenarios.