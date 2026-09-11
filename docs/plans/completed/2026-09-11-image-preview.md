# Inline Image Sizing and Image Preview

```text
Status: Completed
Created: 2026-09-11
Completed: 2026-09-11
```

## Goal

Implement the new image presentation requirements in `docs/PRODUCT.md` §17.1:

- constrain inline attachments to a 200×200 CSS-pixel box, preserving aspect ratio and never enlarging;
- open a modal image preview by clicking the inline image or pressing `Cmd+Enter` when the focused node or editable current parent has an image;
- fit the preview image within the window without enlarging beyond its natural size;
- close the preview with a visible button or `Esc`, restoring the previously focused element.

This is a presentation and UI-interaction change. It does not change the domain model, persistence schema, or attachment storage.

## Current State

- `src/renderer/App.tsx` renders attachments with an `AttachmentImage` component that loads bytes through `readAttachment` and creates an object URL. Images are not interactive.
- `src/renderer/styles.css` constrains `.attachment-image` to `max-width: min(100%, 640px)` and `max-height: 480px`.
- The node input key handler in `App.tsx` does not handle `Cmd+Enter`.
- `src/renderer/App.test.tsx` does not cover attachments; `e2e/clipboard.spec.ts` covers attachment creation and persistence.

## Scope and Constraints

In scope:

- inline attachment sizing;
- clickable inline images;
- `Cmd+Enter` handling;
- a modal preview overlay component with close button and `Esc`;
- focus restoration;
- component and end-to-end tests;
- documentation updates.

Out of scope:

- changes to the attachment data model, storage format, or IPC;
- image editing, zooming, panning, or a separate Electron window;
- image decoding or resizing of stored files (attachments keep their original bytes).

Constraints:

- The preview is transient UI state and belongs in the renderer; no business rules may move into components.
- The original attachment bytes must remain unchanged; sizing is display-only.
- `Cmd+Enter` must not interfere with the existing `Enter` (sibling creation) behavior.

## Proposed Approach

### Inline sizing

Update `.attachment-image` to `max-width: 200px; max-height: 200px` with automatic dimensions so the aspect ratio is preserved and smaller images are not enlarged. This applies both to nodes and to the editable current parent.

### Clicking to preview

Render the inline image inside an accessible control (for example, a `button` with `aria-label="Open image preview"`) that opens the preview. The image remains an attachment of its node and is not independently draggable.

### Preview state and component

Add a small piece of renderer state in `App` holding the attachment id currently being previewed. Render an `ImagePreview` component when set:

- loads bytes through the existing `readAttachment` and creates an object URL;
- renders a `role="dialog" aria-modal="true"` overlay;
- constrains the image with `max-width`/`max-height` relative to the viewport and `width/height: auto`, so it never exceeds natural size;
- includes a visible close button (`aria-label="Close image preview"`);
- closes on `Esc` via a window key listener;
- focuses the close button on open and restores the previously focused element on close.

### Cmd+Enter

Pass the rendered node into the key handler so `Cmd+Enter` can read `node.attachment`. When an attachment exists, prevent the default and open the preview; otherwise do nothing. This covers both node inputs and the current-parent input.

## Affected Modules

- `src/renderer/App.tsx`: preview state, click handling, `Cmd+Enter`, `ImagePreview` component.
- `src/renderer/styles.css`: inline sizing, clickable image control, preview overlay, dark-mode/`focus-visible` states.
- `src/renderer/App.test.tsx`: component tests for preview open/close, `Cmd+Enter`, and no-op without an image.
- `e2e/clipboard.spec.ts` or a new `e2e/preview.spec.ts`: end-to-end sizing and preview behavior.
- `docs/PRODUCT.md`: already updated.

## Data Model and Persistence Changes

None. Attachments keep their original bytes and file layout.

## Testing Strategy

Component tests (jsdom):

- `Cmd+Enter` on a node with an image opens the preview dialog;
- `Cmd+Enter` on a node without an image does nothing;
- the close button closes the preview;
- `Esc` closes the preview.

End-to-end tests (real Electron):

- an inserted image renders with a bounding box no larger than 200×200 and preserves its aspect ratio;
- clicking the image opens the preview;
- the preview closes with the close button and with `Esc`;
- `Cmd+Enter` opens the preview;
- the preview does not enlarge a small image beyond its natural size.

Because jsdom does not implement `URL.createObjectURL` and jsdom image layout is not meaningful, sizing is asserted end-to-end where real layout applies.

## Documentation Changes

- `docs/PRODUCT.md` (done).
- `e2e` coverage noted in this plan; no architecture document change is required because this stays within the existing renderer UI boundary.

## Risks and Open Questions

- **Focus restoration.** Restoring focus to the node input after closing is required; the unmount cleanup must run while the input is still mounted.
- **Drag interaction.** Wrapping the image in a button may reduce drag initiation from the image area; the node row remains draggable from its text and blank areas.
- **`Esc` vs. other shortcuts.** The preview key listener must only be active while the preview is open.
- **Aspect ratio in tests.** Assertions should compare rendered width/height ratios rather than exact pixels to avoid brittleness across displays.

## Completion Notes

Delivered:

- inline attachments constrained to 200×200 CSS pixels, aspect ratio preserved, never enlarged;
- clickable inline images and `Cmd+Enter` opening a modal preview for the selected node or editable current parent;
- preview fitted to the window without enlargement, with a close button and `Esc`, and focus restoration to the previously focused element;
- 5 new component tests and 6 new end-to-end tests (`e2e/preview.spec.ts`).

`npm run check:full` passes: type checking, linting, 12 component tests, build, and 28 end-to-end tests.

No application change was needed beyond the renderer UI; the data model, persistence, and IPC are unchanged.
