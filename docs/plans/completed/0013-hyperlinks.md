Status: Completed
Created: 2026-09-12
Completed: 2026-09-12

# Hyperlinks

## Goal

Allow valid HTTP and HTTPS URLs pasted with Cmd+V to remain visible as the URL while rendering as clickable, browser-style links.

## Scope

- Store inline link ranges with node text and persist them.
- Treat invalid pasted URLs as ordinary text.
- Keep link text equal to its URL; existing links are not editable.
- Remove an entire link when Backspace is pressed at its end.
- Visibly select hyperlink ranges through Cmd+A and preserve them through Cmd+X and Cmd+V.
- Render links with theme-aware browser-style colors and underlines.
- Open links through the system default hyperlink application, with HTTP(S)-only validation at the Electron boundary.

## Implementation

- Extend the domain node and persisted document format with validated link ranges.
- Add domain operations for URL detection, link-aware paste/split/edit, and whole-link deletion.
- Replace editable textareas with a content-editable presentation that renders non-editable anchors for link ranges.
- Add an Electron window-open policy that delegates only HTTP(S) URLs externally and denies other schemes.

## Testing

- Unit-test URL validation, link range transforms, persistence, paste, split, and whole-link deletion.
- Component-test rendering, paste, click behavior, and Backspace removal.
- Test Electron URL policy at the platform boundary.
- Test rich clipboard transfer between nodes, including partial selections and multiline content.

## Documentation

- Update `docs/PRODUCT.md` clipboard and editing requirements.
- Update `docs/ARCHITECTURE.md` document model and external-link boundary.
