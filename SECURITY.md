# Security Policy

## Reporting a vulnerability

This is a local macOS desktop application. It reads and writes local document and attachment files and does not run a network service. If you believe you have found a security issue, report it privately to the repository owner rather than opening a public issue, and do not include secrets or personal document content. There are no released versions yet; the policy applies to the current `main` branch.

## Security model

The Electron renderer is treated as untrusted with respect to the main process. The process boundary is the primary security control: the renderer has no direct Node.js or filesystem access, and every capability it needs crosses a narrow, validated preload/IPC surface. The structural boundaries are owned by `docs/ARCHITECTURE.md` §4, §7, and §15–§17.

The main controls are:

* **Renderer isolation.** The window runs with context isolation enabled, Node integration disabled, and the sandbox enabled (`src/main/index.ts`).
* **Restricted navigation.** The renderer may navigate only to the packaged renderer document or the configured development URL; external URLs open only through the validated HTTP(S) shell path (`src/main/window.ts`, `src/main/index.ts`).
* **Trusted callers and validated payloads.** Every IPC call must originate from the configured renderer, and arguments are validated at runtime before any filesystem, clipboard, or application operation (`src/main/ipc-handlers.ts`, `src/main/ipc-security.ts`).
* **Validated persistence input.** The save boundary validates the untrusted persisted state, including the depth invariant, without rebuilding the document (`src/domain/document.ts`, `src/main/ipc-security.ts`).
* **Bounded attachments.** Attachment writes accept only validated PNG data within a bounded payload size and with bounded decoded dimensions (maximum 32767 pixels per side and 64 megapixels total), and the image must decode through the platform decoder before bytes are stored (`src/main/ipc-security.ts`, `src/main/png-decoder.ts`).
* **Content security policy.** The production renderer loads a restrictive CSP that still permits the application's own scripts, styles, and attachment object URLs.
* **Domain purity.** The domain does not depend on Electron, Node, the filesystem, or the DOM, and dependencies point toward it (`docs/ARCHITECTURE.md` §4, §18). ESLint enforces the import boundaries (`eslint.config.mjs`).

Transient security considerations, such as the attachment byte limit and the PNG chunk rules, are owned by the implementing modules and `docs/ARCHITECTURE.md`, not restated here.

## Verification

Every control above has an automated check. The verification map:

| Control | Focused tests | Real-boundary tests |
| --- | --- | --- |
| Renderer isolation | `src/main/window.test.ts` | every `e2e/*.spec.ts` launch |
| Restricted navigation and external links | `src/main/window.test.ts` | `e2e/csp.spec.ts`, `e2e/hyperlink.spec.ts` |
| Trusted IPC callers and payload validation | `src/main/ipc-security.test.ts`, `src/main/ipc-handlers.test.ts` | `e2e/attachment-validation.spec.ts` |
| Persisted-state validation on save | `src/domain/document.test.ts`, `src/main/ipc-security.test.ts` | `e2e/persistence.spec.ts`, `e2e/persistence-reliability.spec.ts` |
| Attachment validation and decoding | `src/main/ipc-security.test.ts`, `src/main/png-decoder.test.ts` | `e2e/attachment-validation.spec.ts` |
| Content security policy | production build plugin | `e2e/csp.spec.ts` |
| Domain and layer import boundaries | `eslint.config.mjs` import restrictions | lint step of `npm run check` |

`npm run check:full` runs the unit, contract, end-to-end, and performance suites. `npm audit` runs as the final step of `npm run check`; a registry connectivity failure must be reported rather than treated as a clean audit.
