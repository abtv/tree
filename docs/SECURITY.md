# Security Policy

Tree is currently distributed as a website at <https://tree-editor.github.io>.
The browser version is the current distribution focus; the macOS Electron application
remains in development and is not yet packaged for distribution. This policy covers
the published website and the source on `main`, including the desktop implementation.

## Reporting a vulnerability

Report suspected vulnerabilities privately to the repository owner rather than
opening a public issue. Identify whether the issue affects the hosted website,
publication pipeline or desktop application, and include reproduction steps with
synthetic data. Do not include secrets or personal document content.

## Security model

Both versions keep documents and attachments locally and share editor and domain
logic. Neither has a cloud document service or sends telemetry. Their security
boundaries and update mechanisms differ:

| Boundary | Website | macOS desktop |
| --- | --- | --- |
| Execution | Browser sandbox and origin isolation | Sandboxed Electron renderer with validated preload/IPC access to the main process |
| Document storage | IndexedDB in the browser profile for the site's origin | Local document and attachment files managed by the main process |
| Permissions | Browser-controlled clipboard and platform capabilities | Main-process capabilities; renderer permission requests are denied |
| Distribution | HTTPS resources from the verified GitHub Pages publication | Packaged, signed and notarized application required before shipment |

Local storage does not protect against malicious code running with access to that
storage. In the browser, application code served from the trusted origin can read
the document; publication integrity is therefore part of document confidentiality.
Neither version provides application-level encryption at rest or protection from
a compromised operating system or browser profile.

## Browser runtime and storage

The website is a static package. It needs no application server, Node.js process
or Electron installation on the user's computer. GitHub Pages serves application
resources; it does not receive the IndexedDB document. Browser integration is
implemented in `src/web/services.ts`.

* **Origin and profile isolation.** Documents, images and preferences belong to the
  site's origin in the current browser profile. Localhost, the hosted website,
  other browsers and other profiles have separate storage. There is no automatic
  transfer or synchronization. Reserve the hosting origin for trusted Tree code:
  different URL paths on the same origin do not isolate IndexedDB data.
* **Content security policy.** The production build adds a meta CSP allowing
  same-origin scripts, workers, fonts and connections, inline styles, and local
  attachment images. It blocks inline scripts, child frames, blob-URL and other
  cross-origin workers, objects, base URL changes and form submissions
  (`scripts/web/build.mts`). Browser startup also rejects execution inside a frame.
  The meta policy is not an HTTP `frame-ancestors` control. A meta policy does not
  apply inside a worker: the packaged archive worker is same-origin code from the
  verified publication, makes no network requests and evaluates no received code
  ([ADR 0022](decisions/0022-notes-archive-format-and-worker.md)).
* **Notes export.** **Export Notes…** reads the stored document and referenced
  images in a module worker and hands the archive to the browser as a download.
  Nothing is uploaded. The downloaded archive is unencrypted: anyone who can read
  that file can read the notes, and copying it to a synchronized folder sends it
  to that service.
* **Folder backup.** In Chromium, an explicit picker grants a directory handle,
  saved under `backup-folder` in the existing preferences store. Startup queries
  permission without prompting; only a Resume click requests it again. The
  same-origin backup worker reads IndexedDB and writes missing images before
  replacing `document.json`; it never deletes files. Stopping forgets the handle
  and terminates the worker. The page meta CSP does not apply inside worker
  scripts: the packaged backup worker makes no network requests and evaluates no
  received code. Folder contents are unencrypted; choosing a synchronized folder
  lets that service transfer them. Use one folder for one profile on one computer;
  concurrent writers or external folder edits are unsupported.
* **Folder restore.** **Restore from Folder…** and the Restore choice of an
  occupied backup folder treat the folder as hostile, read only the document and
  referenced images, and use the import validation, staging and explicit
  replacement confirmation. The menu command requests read access only and never
  writes to the folder.
* **Notes import.** **Import Notes…** treats the chosen file as hostile input. A
  module worker reads it in slices through its own central-directory parser
  (`src/application/notes-archive/zip-reader.ts`); fflate only inflates Deflate
  data. Before any payload is read, the parser requires the end record at the end
  of the file and rejects ZIP64, encryption, comments, extra fields, split
  archives, unknown methods, names other than `document.json` and
  `attachments/<id>.png` (so no traversal, absolute, nested, directory or
  case-colliding names), sizes above the limits of PRODUCT §24.2, and entries
  outside the file or overlapping each other or the central directory. Reading an
  entry checks that its local header repeats the central record, feeds Deflate
  data in 16 KiB slices, stops at the declared size and requires that size and the
  CRC-32 to match, so a Deflate bomb allocates at most its declared, limited size.
  The document must pass the same validation as loading; each referenced image
  passes the PNG byte, structure and dimension limits and the browser decoder, one
  image at a time. Names and `document.json` keep a byte-order mark, so it rejects
  them. Import never overwrites a stored image, replaces the stored head in one
  transaction only after the user confirms, and removes the images it staged on
  cancel or failure; a journal written with each image lets the next start remove
  those of a closed tab, so repeated abandoned imports cannot fill the storage
  quota. The page suspends its own saves before the worker
  replaces the head, so no older document is saved over it.
* **Untrusted content.** Shared rendering escapes node text and link attributes;
  domain normalization accepts only HTTP(S) link destinations. Clipboard HTML is
  reduced to text and link ranges rather than inserted as arbitrary markup.
  Stored documents are validated when loaded; invalid stored data is not replaced
  with a new sample document.
  Both entry points install the shared `src/renderer/external-drop.ts` window-capture
  guard before initialization: native drops and `insertFromDrop` edits are rejected
  before browser insertion, including outside the editor. Tree's internal node
  movement uses pointer events and does not pass through this native drop path.
* **Clipboard and attachments.** Browser permission and user-activation rules
  govern clipboard APIs. Native paste uses the event's clipboard data. PNG input
  passes shared byte, structure and decoded-dimension limits, then the browser
  decoder before storage. These checks do not bound memory allocated internally
  by the browser while reading the clipboard.
* **Writer ownership.** A Web Lock permits one editing tab at a time. IndexedDB
  transactions preserve the last committed value when a write aborts. This is a
  consistency control, not a barrier against malicious same-origin code.

The package uses a same-origin Service Worker for offline application files and
updates (PRODUCT §24.7). Installation verifies each file against the build's digest;
this detects incomplete or mixed deployments, not a malicious publisher. Cached app
files and their update requests contain no notes. A complete version waits for safe
activation, and cache cleanup touches only Tree's scope-specific application caches.
The package has no recovery generations. It has a web app manifest and requests
persistent storage once per page load (PRODUCT §24.1).
Persistent storage, when granted, protects only against eviction under storage
pressure. Clearing site data, deleting the profile or, without persistent
storage, browser storage eviction can remove notes; force termination can
lose uncommitted work. Browser storage is not a backup; an exported archive kept
outside the browser profile is; Chromium folder backup provides another copy,
subject to its reported permission and write status. Current compatibility and
save limitations are owned by [Browser version](../src/web/README.md) and
[the browser requirements](PRODUCT.md#14-browser-static-hosting-checkpoint).

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
asset extensions exclude HTML/SVG. Root files other than `index.html` and
`.nojekyll` are limited to four exact installable-app names (manifest and three
PNG icons); HTML may reference only those root names and current assets. No
archive extraction is used.

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

Both repositories use active main-branch rulesets blocking force pushes and
deletion, plus repository secret scanning and push protection. These controls
reduce history-rewrite and credential-leak risks; they do not require review of
ordinary commits or make a compromised writer harmless. A stolen target publisher
token can still corrupt retained assets or provenance and block later publication.
Signature failures must stop publication; recovery must restore authenticated
files without bypassing verification.

## Desktop runtime

The Electron renderer is treated as untrusted with respect to the main process.
It has no direct Node.js or filesystem access. Its capabilities cross a narrow,
validated preload/IPC surface. The structural boundaries are owned by
`docs/ARCHITECTURE.md` §4, §7, and §15–§17.

* **Renderer isolation.** The window runs with context isolation enabled, Node integration disabled, and the sandbox enabled (`src/electron/main/index.ts`).
* **Restricted navigation.** Packaged builds always load and trust the packaged renderer document; only unpackaged builds may use `ELECTRON_RENDERER_URL`. App-wide web-contents guards restrict main-frame, subframe, and redirected navigation to that resolved document, deny webviews, and route only validated external HTTP(S) URLs to the system browser (`src/electron/main/window.ts`, `src/electron/main/index.ts`).
* **Trusted callers and validated payloads.** Every IPC call must originate from the resolved application renderer, and arguments are validated at runtime before any filesystem, clipboard, or application operation (`src/electron/main/ipc-handlers.ts`, `src/electron/main/ipc-security.ts`).
* **Denied renderer permissions and egress.** The renderer session denies permission requests, permission checks, and device permissions. Its network filter allows only `devtools:`, `blob:` and `data:` URLs and requests to the resolved renderer origin; it allows no `file:` URL. External links still go to the operating system browser through `shell.openExternal` (`src/electron/main/window.ts`, `src/electron/main/index.ts`).
* **Renderer origin without file access.** The packaged renderer loads from `app://tree/index.html`, served by a main-process handler that returns only known asset types inside the built renderer directory (`src/electron/main/renderer-protocol.ts`). Renderer code therefore cannot read documents, attachments or other local files through URLs; it reaches them only through validated IPC.
* **Validated persistence input.** The save boundary validates untrusted persisted state, including document depth, filesystem-safe attachment identifiers, and HTTP(S)-only link destinations, without rebuilding the document (`src/domain/document.ts`, `src/electron/main/ipc-security.ts`).
* **Bounded attachments.** Attachment writes accept only PNG data within the shared byte, structure and decoded-dimension limits, and the image must decode through the platform decoder before bytes are stored (`src/electron/main/ipc-security.ts`, `src/electron/main/png-decoder.ts`).
* **Bounded clipboard image reads.** PNG clipboard blobs exceeding the attachment byte limit are rejected before `arrayBuffer()` copies their bytes into application memory (`src/infrastructure/main/clipboard.ts`). This does not bound memory allocated internally by Electron or macOS while obtaining the clipboard blob.
* **Notes export and import paths.** The renderer's notes export and import requests take no arguments. Only the native save and open panels in the main process choose files, the renderer receives file names and counts but no path it could send back, and Show in Finder reveals only a Replaced Notes folder that the main process created (`src/electron/main/notes-archive-controller.ts`, `src/electron/main/ipc-handlers.ts`). The archive worker validates archives as the browser does, and the platform decoder must accept each imported image before it is staged. The confirmation displays names and folder text as React text, never HTML. Navigation and renderer loss cancel prepared imports, including an import retained during Export Current Notes First; a replacement already committing must finish.
* **Content security policy.** The production renderer loads a restrictive CSP that still permits the application's own scripts, styles, and attachment object URLs, and denies child frames, workers, and media. Chromium ignores `frame-ancestors` when the policy is delivered by a meta element.

Attachment limits and PNG chunk rules are owned by the implementing modules and
`docs/ARCHITECTURE.md`. Shared domain code remains independent of React, Electron,
Node, filesystem and DOM APIs; ESLint enforces the import boundaries.

## Network egress and content disclosure

The website downloads its application resources over HTTPS from GitHub Pages.
The desktop application runs from local resources and does not run a network
service. Neither version uploads documents or attachments or sends telemetry.
Local storage still permits disclosure through user-invoked features:

* **Open an external hyperlink.** The website opens the destination in another
  browser context; Electron hands the HTTP(S) URL to the operating system through
  `src/electron/main/index.ts`. The URL may itself contain document content.
* **Clipboard use.** Copying makes selected content available to other applications
  through the system clipboard. Browser clipboard access is subject to browser
  permissions; Electron accesses it through validated IPC.
* **Search with Google (desktop).** `src/electron/main/editor-context-menu.ts` sends
  selected text as a Google search query through the system browser.
* **macOS Look Up (desktop).** The native context menu passes selected text to the
  macOS lookup service, which may consult network sources depending on OS settings.

**Accepted risk: renderer-initiated external URLs (desktop).** The main process opens
every HTTP(S) URL that the renderer passes to `window.open`. It does not check that a
user action caused the request, and it asks for no confirmation
(`src/electron/main/window.ts`). JavaScript running in a compromised renderer could
therefore put document content into a URL and open it in the system browser. The
Product Owner accepted this risk on 2026-10-19: the security review found no
renderer-injection path, and the renderer cannot read local files except through
validated IPC. A destination allowlist would not reduce the risk, because the renderer
controls the document's link destinations. A native confirmation before each external
link would close this channel but add a step to every link. Reconsider that
confirmation if a renderer-injection path is found or the renderer starts to display
untrusted markup.

The editor disables spellchecking in `src/renderer/NodeInput.tsx`, and the main
process calls `setSpellCheckerEnabled(false)` on the renderer session
(`src/electron/main/window.ts`). With the spellchecker off, Electron on Windows and Linux does not download Hunspell dictionaries
from its Google-hosted CDN. Browser-provided translation and similar services follow the
user's browser settings.

## Desktop distribution hardening before shipment

The repository does not yet package the application: `npm run build` produces unpackaged build
output, not a distributable application. Before a build is handed to anyone, the distribution must:

* Disable the `RunAsNode`, `EnableNodeOptionsEnvironmentVariable`, and
  `EnableNodeCliInspectArguments` Electron fuses, as well as any adjacent `EnableRunAsNode` fuse
  controls.
* Enable `OnlyLoadAppFromAsar` and ASAR archive integrity validation.
* Disable the `GrantFileProtocolExtraPrivileges` fuse. The renderer no longer loads from `file://`,
  so the extra `file:` privileges only widen what a compromised renderer could reach.
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

Runtime and publication checks are mapped below. Repository settings, account
security and future desktop signing requirements also need operational verification;
local tests do not establish those controls.

| Control | Focused tests | Real-boundary tests |
| --- | --- | --- |
| Browser package and CSP presence | `scripts/web/build.mts` build policy | `e2e/web/package.spec.mts` against the built package; this checks CSP presence and the worker directive, not every directive's enforcement |
| Browser notes export | `src/application/notes-archive/export-notes.test.ts`, `src/infrastructure/archive/*.test.ts`, `src/web/archive/*.test.ts`, ESLint fflate import restrictions | `e2e/web/export.spec.mts` against development and built packages |
| Browser notes import of hostile archives | `src/application/notes-archive/zip-reader.test.ts` and `import-notes.test.ts` (malformed-archive corpus), `src/web/archive/import-job.test.ts` (real Deflate, Deflate bomb, seeded fuzzing), round-trip property | `e2e/web/import.spec.mts` against development and built packages |
| Browser storage ownership and failed writes | Shared document validation tests | `e2e/web/storage.spec.mts` |
| Browser clipboard and images | `src/web/paste.test.ts`, shared clipboard and PNG validation tests | `e2e/web/paste.spec.mts`, `e2e/web/compatibility.spec.mts` |
| Signed publication and publisher permissions | `scripts/web-release/*.test.mts` | Source release, target signature/package and hosted-byte checks; target `rejection_probe` rejects a corrupted isolated copy without deployment |
| Renderer isolation | `src/electron/main/window.test.ts` | every `e2e/electron/*.spec.ts` launch |
| Restricted navigation and external links | `src/electron/main/window.test.ts` | `e2e/electron/csp.spec.ts`, `e2e/electron/hyperlink.spec.ts` |
| Renderer session permissions and network egress | `src/electron/main/window.test.ts` | `e2e/electron/csp.spec.ts`, `e2e/electron/hyperlink.spec.ts` |
| Renderer origin and local-file reads | `src/electron/main/renderer-protocol.test.ts`, `src/electron/main/window.test.ts` | `e2e/electron/csp.spec.ts` |
| Trusted IPC callers and payload validation | `src/electron/main/ipc-security.test.ts`, `src/electron/main/ipc-handlers.test.ts` | `e2e/electron/attachment-validation.spec.ts` |
| Desktop notes export and import paths and hostile archives | `src/electron/main/ipc-handlers.test.ts` (argument-free notes requests), `src/electron/main/notes-archive-controller.test.ts`, `src/infrastructure/main/notes-archive/desktop-import-job.test.ts` | `e2e/electron/notes-archive-boundary.spec.ts`, `notes-import.spec.ts`, `notes-import-dialog.spec.ts` |
| Persisted-state validation on save | `src/domain/document.test.ts`, `src/electron/main/ipc-security.test.ts` | `e2e/electron/persistence.spec.ts`, `e2e/electron/persistence-reliability.spec.ts` |
| Attachment validation and decoding | `src/electron/main/ipc-security.test.ts`, `src/electron/main/png-decoder.test.ts` | `e2e/electron/attachment-validation.spec.ts` |
| Content security policy | production build plugin | `e2e/electron/csp.spec.ts` |
| Domain and layer import boundaries | `eslint.config.mjs` import restrictions | lint step of `npm run check` |

The browser suite is separate from Electron: `npm run test:web:built` exercises
the generated static package, and source publication runs that suite in Chromium.
The release gate and real deployment acceptance checks are described in
[Browser publication](../deployment/github-pages/README.md#failures-and-ordering).

`npm run check:full` runs the shared unit/contract checks and Electron end-to-end
and performance suites, followed by `npm audit`. It does not include the browser
suite. A registry connectivity failure must be reported rather than treated as a
clean audit. Between runs, a workflow audits dependencies every eight hours at high severity
or above and Dependabot proposes updates; `docs/DEVELOPMENT.md` describes both.
