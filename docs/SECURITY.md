# Security Policy

## Reporting a vulnerability

This is a local macOS desktop application. It reads and writes local document and attachment files and does not run a network service. If you believe you have found a security issue, report it privately to the repository owner rather than opening a public issue, and do not include secrets or personal document content. There are no released versions yet; the policy applies to the current `main` branch.

## Security model

The Electron renderer is treated as untrusted with respect to the main process. The process boundary is the primary security control: the renderer has no direct Node.js or filesystem access, and every capability it needs crosses a narrow, validated preload/IPC surface. The structural boundaries are owned by `docs/ARCHITECTURE.md` §4, §7, and §15–§17.

The main controls are:

* **Renderer isolation.** The window runs with context isolation enabled, Node integration disabled, and the sandbox enabled (`src/main/index.ts`).
* **Restricted navigation.** Packaged builds always load and trust the packaged renderer document; only unpackaged builds may use `ELECTRON_RENDERER_URL`. App-wide web-contents guards restrict main-frame, subframe, and redirected navigation to that resolved document, deny webviews, and route only validated external HTTP(S) URLs to the system browser (`src/main/window.ts`, `src/main/index.ts`).
* **Trusted callers and validated payloads.** Every IPC call must originate from the resolved application renderer, and arguments are validated at runtime before any filesystem, clipboard, or application operation (`src/main/ipc-handlers.ts`, `src/main/ipc-security.ts`).
* **Denied renderer permissions and egress.** The renderer session denies permission requests, permission checks, and device permissions. Its network filter allows only local schemes and, for an unpackaged development renderer, requests to that renderer's own origin. External links still go to the operating system browser through `shell.openExternal` (`src/main/window.ts`, `src/main/index.ts`).
* **Validated persistence input.** The save boundary validates untrusted persisted state, including document depth, filesystem-safe attachment identifiers, and HTTP(S)-only link destinations, without rebuilding the document (`src/domain/document.ts`, `src/main/ipc-security.ts`).
* **Bounded attachments.** Attachment writes accept only validated PNG data within a bounded payload size and with bounded decoded dimensions (maximum 32767 pixels per side and 64 megapixels total), and the image must decode through the platform decoder before bytes are stored (`src/main/ipc-security.ts`, `src/main/png-decoder.ts`).
* **Content security policy.** The production renderer loads a restrictive CSP that still permits the application's own scripts, styles, and attachment object URLs, and denies child frames, workers, and media. (Chromium ignores `frame-ancestors` when the policy is delivered by a meta element.)
* **Domain purity.** The domain does not depend on Electron, Node, the filesystem, or the DOM, and dependencies point toward it (`docs/ARCHITECTURE.md` §4, §18). ESLint enforces the import boundaries (`eslint.config.mjs`).

Transient security considerations, such as the attachment byte limit and the PNG chunk rules, are owned by the implementing modules and `docs/ARCHITECTURE.md`, not restated here.

## Network egress and content disclosure

Tree makes no network requests of its own, sends no telemetry, and stores documents and attachments
only on the local machine; it has no cloud document service. Content can still be disclosed to a
third party when the user explicitly invokes these features:

* **Open an external hyperlink.** `src/main/index.ts` hands the HTTP(S) URL to the operating
  system's default hyperlink application, typically a browser. The URL may itself contain document
  content. This implements the link-opening behavior in `docs/PRODUCT.md` §12.
* **Search with Google.** `src/main/editor-context-menu.ts` sends the selected text as a Google
  search query through the system browser. This is the user-invoked menu item specified in
  `docs/PRODUCT.md` §13.2.
* **macOS Look Up.** `src/main/editor-context-menu.ts` passes selected text to the macOS lookup
  service. Depending on the user's macOS settings, that service may consult network sources. This is
  the native Look Up item specified in `docs/PRODUCT.md` §13.2.

The editor enables spellchecking in `src/renderer/NodeInput.tsx`. On macOS, the operating system's
spellchecker downloads no dictionaries. A future Windows or Linux build must disable Electron's
Hunspell dictionary download before shipping, because Electron may otherwise download dictionaries
from a Google-hosted CDN on first use.

## Distribution hardening before shipment

The repository does not yet package the application: `npm run build` produces unpackaged build
output, not a distributable application. Before a build is handed to anyone, the distribution must:

* Disable the `RunAsNode`, `EnableNodeOptionsEnvironmentVariable`, and
  `EnableNodeCliInspectArguments` Electron fuses, as well as any adjacent `EnableRunAsNode` fuse
  controls.
* Enable `OnlyLoadAppFromAsar` and ASAR archive integrity validation.
* Sign and notarize the macOS application with the hardened runtime. Keep entitlements minimal and
  do not grant `allow-unsigned-executable-memory`, `allow-dyld-environment-variables`, or
  `disable-library-validation`.

These controls protect against using the bundled, signed Electron binary to run arbitrary Node.js
code or inject code into the main process with `NODE_OPTIONS`, which would bypass every renderer-side
control documented here. The packaging toolchain has not been chosen; selecting it is reserved for
the Product Owner.

## Agent execution threat model

This section covers the development agents that modify or validate the repository. It is separate from the application's runtime security model above. Agents can execute repository-controlled scripts, so the repository and its dependencies are treated as trusted inputs for normal development. A malicious repository change could otherwise use an allowed build or test command to act with the agent process's host privileges.

Autonomous runs should use a dedicated workspace with the least credentials possible. Do not expose production credentials, personal documents, SSH keys, signing keys, or other unrelated sensitive data to an agent session. Keep network access disabled for roles that do not need it, and treat a network-enabled agent or package-install command as a privileged operation requiring explicit review.

The protections differ by tool:

| Tool and role | Mechanically enforced boundary | Prompt-only boundary |
| --- | --- | --- |
| Codex primary | `workspace-write`, approval-on-request, and configured network access; the sandbox limits filesystem scope but does not restrict individual shell commands | repository workflow, command safety, and role behavior |
| Codex planner/reviewer | read-only sandbox; no shell access | role behavior and no-web policy |
| Codex product verifier | project-scoped `workspace-write` with network disabled; the sandbox does not restrict which command runs | documented test/build/lint command list and no-edits rule |
| Claude Code primary and subagents | project permission settings allow only the listed routine commands without an approval prompt; there is no OS sandbox or command allowlist for the granted `Bash` tool | shared role behavior, no-edits rules for read-only roles, and restrictions beyond the configured permission patterns |
| OpenCode primary | per-command allow/deny rules, denied external directories, and denied task types in `opencode.json`; these are consent guardrails, not an OS sandbox | shared role behavior and the trusted-repository assumption |
| OpenCode reviewer | edit, shell, web, and external-directory access denied by configuration | none for those denied capabilities; shared role behavior still applies |

These boundaries reduce accidental access and unsafe tool use; they do not make execution of malicious repository code safe. The primary agent remains responsible for reviewing the repository, validation commands, and generated changes before commit.

## Verification

Every control above has an automated check. The verification map:

| Control | Focused tests | Real-boundary tests |
| --- | --- | --- |
| Renderer isolation | `src/main/window.test.ts` | every `e2e/*.spec.ts` launch |
| Restricted navigation and external links | `src/main/window.test.ts` | `e2e/csp.spec.ts`, `e2e/hyperlink.spec.ts` |
| Renderer session permissions and network egress | `src/main/window.test.ts` | `e2e/csp.spec.ts`, `e2e/hyperlink.spec.ts` |
| Trusted IPC callers and payload validation | `src/main/ipc-security.test.ts`, `src/main/ipc-handlers.test.ts` | `e2e/attachment-validation.spec.ts` |
| Persisted-state validation on save | `src/domain/document.test.ts`, `src/main/ipc-security.test.ts` | `e2e/persistence.spec.ts`, `e2e/persistence-reliability.spec.ts` |
| Attachment validation and decoding | `src/main/ipc-security.test.ts`, `src/main/png-decoder.test.ts` | `e2e/attachment-validation.spec.ts` |
| Content security policy | production build plugin | `e2e/csp.spec.ts` |
| Domain and layer import boundaries | `eslint.config.mjs` import restrictions | lint step of `npm run check` |

`npm run check:full` runs the unit, contract, end-to-end, and performance suites. `npm audit` runs as the final step of `npm run check`; a registry connectivity failure must be reported rather than treated as a clean audit.
