# Security Policy

## Reporting a vulnerability

This is a local macOS desktop application. It reads and writes local document and attachment files and does not run a network service. If you believe you have found a security issue, report it privately to the repository owner rather than opening a public issue, and do not include secrets or personal document content. There are no released versions yet; the policy applies to the current `main` branch.

## Security model

The Electron renderer is treated as untrusted with respect to the main process. The process boundary is the primary security control: the renderer has no direct Node.js or filesystem access, and every capability it needs crosses a narrow, validated preload/IPC surface. The structural boundaries are owned by `docs/ARCHITECTURE.md` §4, §7, and §15–§17.

The main controls are:

* **Renderer isolation.** The window runs with context isolation enabled, Node integration disabled, and the sandbox enabled (`src/electron/main/index.ts`).
* **Restricted navigation.** Packaged builds always load and trust the packaged renderer document; only unpackaged builds may use `ELECTRON_RENDERER_URL`. App-wide web-contents guards restrict main-frame, subframe, and redirected navigation to that resolved document, deny webviews, and route only validated external HTTP(S) URLs to the system browser (`src/electron/main/window.ts`, `src/electron/main/index.ts`).
* **Trusted callers and validated payloads.** Every IPC call must originate from the resolved application renderer, and arguments are validated at runtime before any filesystem, clipboard, or application operation (`src/electron/main/ipc-handlers.ts`, `src/electron/main/ipc-security.ts`).
* **Denied renderer permissions and egress.** The renderer session denies permission requests, permission checks, and device permissions. Its network filter allows only local schemes and, for an unpackaged development renderer, requests to that renderer's own origin. External links still go to the operating system browser through `shell.openExternal` (`src/electron/main/window.ts`, `src/electron/main/index.ts`).
* **Validated persistence input.** The save boundary validates untrusted persisted state, including document depth, filesystem-safe attachment identifiers, and HTTP(S)-only link destinations, without rebuilding the document (`src/domain/document.ts`, `src/electron/main/ipc-security.ts`).
* **Bounded attachments.** Attachment writes accept only validated PNG data within a bounded payload size and with bounded decoded dimensions (maximum 32767 pixels per side and 64 megapixels total), and the image must decode through the platform decoder before bytes are stored (`src/electron/main/ipc-security.ts`, `src/electron/main/png-decoder.ts`).
* **Bounded clipboard image reads.** PNG clipboard blobs exceeding the attachment byte limit are rejected before `arrayBuffer()` copies their bytes into application memory (`src/infrastructure/main/clipboard.ts`). This does not bound memory allocated internally by Electron or macOS while obtaining the clipboard blob.
* **Content security policy.** The production renderer loads a restrictive CSP that still permits the application's own scripts, styles, and attachment object URLs, and denies child frames, workers, and media. (Chromium ignores `frame-ancestors` when the policy is delivered by a meta element.)
* **Domain purity.** The domain does not depend on Electron, Node, the filesystem, or the DOM, and dependencies point toward it (`docs/ARCHITECTURE.md` §4, §18). ESLint enforces the import boundaries (`eslint.config.mjs`).

Transient security considerations, such as the attachment byte limit and the PNG chunk rules, are owned by the implementing modules and `docs/ARCHITECTURE.md`, not restated here.

## Network egress and content disclosure

Tree makes no network requests of its own, sends no telemetry, and stores documents and attachments
only on the local machine; it has no cloud document service. Content can still be disclosed to a
third party when the user explicitly invokes these features:

* **Open an external hyperlink.** `src/electron/main/index.ts` hands the HTTP(S) URL to the operating
  system's default hyperlink application, typically a browser. The URL may itself contain document
  content. This implements the link-opening behavior in `docs/PRODUCT.md` §12.
* **Search with Google.** `src/electron/main/editor-context-menu.ts` sends the selected text as a Google
  search query through the system browser. This is the user-invoked menu item specified in
  `docs/PRODUCT.md` §13.2.
* **macOS Look Up.** `src/electron/main/editor-context-menu.ts` passes selected text to the macOS lookup
  service. Depending on the user's macOS settings, that service may consult network sources. This is
  the native Look Up item specified in `docs/PRODUCT.md` §13.2.

The editor enables spellchecking in `src/renderer/NodeInput.tsx`. On macOS, the operating system's
spellchecker downloads no dictionaries. A future Windows or Linux build must disable Electron's
Hunspell dictionary download before shipping, because Electron may otherwise download dictionaries
from a Google-hosted CDN on first use.

## Browser publication

The browser's static package is published separately from the desktop application.
Source tests receive no publication secrets. Only a successful main-push release
gate can obtain a short-lived App token scoped to Contents write on
`tree-editor/tree-editor.github.io`, without Workflows, Actions, Pages or
administration write permissions. GitHub's separate Workflows permission protects
the owner-installed workflow from that token. The workflow obtains verifier code
from trusted source main at an independently resolved immutable SHA, not from
publisher-controlled target scripts or metadata.

The publisher permission probe first proves ordinary Contents API writes on its
temporary branch, then requires a recognized permission-denial response for a
workflow write with the same token and branch. An unrelated or ambiguous API
failure cannot establish that permission boundary and stops publication.

A separate gated source job uses OIDC/Sigstore to attest the exact manifest bytes.
The manifest commits to every current and retained file's size and SHA256. Old
assets are admitted only after verifying their previous detached attestation and
bytes; target-provided unsigned hashes never become signing inputs. Cumulative
bounds apply before fetching retained assets. The target independently verifies
the signature's repository, workflow, main ref, source digest and hosted runner,
plus current source run/attempt/gate and every package byte. The publisher replaces
the whole site tree, and the verifier rejects all unlisted files. Approved static
asset extensions exclude HTML/SVG. No archive extraction is used.

Read-only verification uploads the authenticated artifact. A separate job with
Pages/OIDC write executes only SHA-pinned Actions and protected inline head checks;
it has no checkout or repository script execution. Publication-reachable Actions
are SHA-pinned, with Dependabot updates in both repositories. Neither repository
stores browser notes. Source main maintainers, target workflow administrators,
GitHub-hosted runners, GitHub and Sigstore remain trust roots; compromise of those
roots is outside the target-only publisher-token protection.

The App private key belongs only in the source `web-publication` environment
secret. Repository/workflow maintainers and dependency install scripts are trusted;
do not give untrusted code access to that environment. Protect main and review
workflow changes as appropriate. Manual setup must not weaken existing environment
protection. GitHub Pages serves application resources and may log IP addresses;
it does not receive the browser's IndexedDB document. Operational setup and
failure handling are in [Browser publication](../deployment/github-pages/README.md).

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
| Renderer isolation | `src/electron/main/window.test.ts` | every `e2e/electron/*.spec.ts` launch |
| Restricted navigation and external links | `src/electron/main/window.test.ts` | `e2e/electron/csp.spec.ts`, `e2e/electron/hyperlink.spec.ts` |
| Renderer session permissions and network egress | `src/electron/main/window.test.ts` | `e2e/electron/csp.spec.ts`, `e2e/electron/hyperlink.spec.ts` |
| Trusted IPC callers and payload validation | `src/electron/main/ipc-security.test.ts`, `src/electron/main/ipc-handlers.test.ts` | `e2e/electron/attachment-validation.spec.ts` |
| Persisted-state validation on save | `src/domain/document.test.ts`, `src/electron/main/ipc-security.test.ts` | `e2e/electron/persistence.spec.ts`, `e2e/electron/persistence-reliability.spec.ts` |
| Attachment validation and decoding | `src/electron/main/ipc-security.test.ts`, `src/electron/main/png-decoder.test.ts` | `e2e/electron/attachment-validation.spec.ts` |
| Content security policy | production build plugin | `e2e/electron/csp.spec.ts` |
| Domain and layer import boundaries | `eslint.config.mjs` import restrictions | lint step of `npm run check` |

`npm run check:full` runs the unit, contract, end-to-end, and performance suites. `npm audit` runs as the final step of `npm run check:full`; a registry connectivity failure must be reported rather than treated as a clean audit. Between runs, a daily workflow audits dependencies at high severity or above and Dependabot proposes updates; `docs/DEVELOPMENT.md` describes both.
