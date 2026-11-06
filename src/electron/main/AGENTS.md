# Main Process AGENTS.md

Layer-specific rules for `src/electron/main/`, `src/electron/preload/`, and `src/infrastructure/main/`. The root `AGENTS.md` still applies.

## Rules

* Treat every IPC payload as untrusted. Validate with the domain validators before any filesystem, clipboard, shell, or application operation, and restrict callers to the configured renderer (`docs/ARCHITECTURE.md` §7).
* Keep the secure window configuration: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, and the production content security policy.
* Serve the packaged renderer only through the `app://tree/` handler in `renderer-protocol.ts`; never load it from `file://` or allow `file:` requests from the renderer session.
* Serialize persistence and attachment work through the file-service operation queue; cleanup runs after the save that persists the new referenced set.
* Attachment writes accept only validated PNG data within the byte limit, with dimensions and pixel count within the decoded-image budget, and are decoded before storage.
* Keep Electron and Node APIs in this layer; never leak them into the domain or renderer.

## Tests

* Run `npm test -- src/electron/main src/electron/preload src/infrastructure/main`.
* Changed IPC behavior must retain focused contract coverage for names, arguments, return values, and error propagation, plus representative real Electron boundary coverage. Existing tests may satisfy these obligations under root procedure §9. Keep payload and rule variants in focused tests unless they exercise a distinct runtime failure.
