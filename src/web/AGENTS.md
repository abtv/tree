# Browser source

The root `AGENTS.md` applies. This directory owns the browser entry, platform adapter, browser-specific styles and unit tests. Shared editor behavior stays in the shared source layers.

- Preserve the documented origin, IndexedDB identity and save policy when reorganizing source. Source/build paths do not authorize a storage migration.
- Keep build and server tools in `scripts/web/`, and browser E2E specs in `e2e/web/`.
- Keep browser platform APIs in the adapter; domain and application modules remain platform independent.
