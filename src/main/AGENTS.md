# Main Process AGENTS.md

Layer-specific rules for `src/main/`, `src/preload/`, and `src/infrastructure/main/`. The root `AGENTS.md` still applies.

## Rules

* Treat every IPC payload as untrusted. Validate with the domain validators before any filesystem, clipboard, shell, or application operation, and restrict callers to the configured renderer (`docs/ARCHITECTURE.md` §7).
* Keep the secure window configuration: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, and the production content security policy.
* Serialize persistence and attachment work through the file-service operation queue; cleanup runs after the save that persists the new referenced set.
* Attachment writes accept only validated PNG data within the byte limit, with dimensions and pixel count within the decoded-image budget, and are decoded before storage.
* Keep Electron and Node APIs in this layer; never leak them into the domain or renderer.

## Tests

* Run `npx vitest run src/main src/preload src/infrastructure/main`.
* Every changed IPC channel needs a focused contract test for names, arguments, return values, and error propagation, plus a real Electron end-to-end test.
