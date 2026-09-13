# Renderer Owns Standard Editing Commands

Status: Accepted
Date: 2026-09-13

## Context

On macOS, Electron delivers the standard editing commands — Undo, Redo, Cut, Copy, Paste, Select All, and Delete — through the application menu. This application intentionally installs a minimal menu containing only Quit Tree. As a result, macOS does not route those commands to the renderer, and the native `copy`, `cut`, and `paste` DOM events never fire.

The end-to-end suite drives input through Playwright's DevTools-based key injection, which bypasses the application menu and still triggers Chromium's native editing behavior. Tests that rely on that native behavior therefore pass while the running product silently does nothing. This divergence hid two real defects: `Cmd+C` did not copy a plain-text selection, and `Cmd+V` did not paste clipboard text into a plain-text node.

## Decision

The renderer owns every standard editing command. The editor keydown handler intercepts the shortcut, calls `preventDefault`, and performs the operation through the editor store and the infrastructure clipboard service. The application must not rely on native menu routing or on native `copy`, `cut`, or `paste` DOM events.

A clipboard DOM handler may remain as a secondary path for events that arrive without a keydown, such as a context-menu paste, but it is not the primary route and must not be the only route.

## Consequences

- The application menu stays minimal; no native Edit menu is required.
- Every future editing command must be intercepted in the renderer rather than delegated to the platform.
- End-to-end tests for these shortcuts must suppress or disable the native browser behavior and assert that the application still performs the action. A passing test that relies on the native default does not prove that the product works.
- The Playwright harness cannot be treated as a faithful representation of macOS menu routing.