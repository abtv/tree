# Domain AGENTS.md

Layer-specific rules for `src/domain/`. The repository-wide rules in the root `AGENTS.md` still apply.

## Rules

* The domain is framework-free. Do not import React, the DOM, Electron, filesystem or browser APIs, or any application, infrastructure, main, preload, or renderer module (`docs/ARCHITECTURE.md` §4, §22).
* Never mutate an input `Document`. Operations return a new document and path-copy only the changed path, sharing every unchanged subtree by reference (`docs/ARCHITECTURE.md` §5, §11).
* Parent relationships are derived, never stored. Use the derived node index; do not add a persisted `parentId`.
* User-visible product errors are product behavior and keep their exact approved text; the owner is `docs/PRODUCT.md`.
* Enforce the maximum document depth on creation, assertion, and parsing.

## Tests

* Tests run in the Node environment. Run `npx vitest run src/domain`.
* Add or update a `*.property.test.ts` guard when a change affects tree structure, ordering, node identity, serialization, cursor or paste transforms, or undo/redo consistency.
* Assess the performance implications of state or persistence changes per `docs/PRODUCT.md` §22.1.
