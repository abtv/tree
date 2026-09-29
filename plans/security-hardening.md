# Security Hardening Review

## Source and authority

Follow-up fixes from a Product Owner-requested security review of the whole repository
(2026-09-29), performed from an Electron and React security perspective with enterprise use as the
target. The review was performed in conversation and is not otherwise recorded in the repository;
its complete findings are reproduced below, so no task depends on that conversation.

The Product Owner authorized this plan and authorized implementing all eight tasks it lists. The
three tasks not yet completed remain `Ready`; nothing further needs to be authorized before starting
one. That authorization covers these tasks only — it is not authorization for work this plan does
not list.

The Product Owner stated the security goals the review used as acceptance criteria:

* the application must not track the user or send telemetry, and must not start doing so;
* the user owns the data; documents stay on the local machine and are never sent to a cloud service;
* protecting the document file itself is the operating system's responsibility, so file permissions,
  disk encryption, and local file access control are deliberately out of scope;
* the concern is leaks and unsound security boundaries, not dependency vulnerabilities
  (`npm audit` is clean and was not part of this review).

Scope limits:

* No task changes the data model, the persistence format, the technology stack, or any architectural
  boundary. SEC3 tightens what an existing validator accepts; it does not change what the
  application itself writes.
* No task adds a packaging or distribution toolchain. SEC8 only records the requirements; choosing
  the toolchain is a `AGENTS.md` §6 decision reserved for the Product Owner (see D4).
* No task adds a test purely to raise coverage (`AGENTS.md` §9). Each new test pins a specific
  control that is currently unenforced.
* The review found no issue in the domain or application layers, and no task changes them except
  SEC3's persisted-state leaf validation and shared attachment-ID rule.

Sources of truth: [`docs/SECURITY.md`](../docs/SECURITY.md) (security model and verification map);
[`docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md) §16 (Electron integration), §17 (process
boundaries); [`docs/PRODUCT.md`](../docs/PRODUCT.md) §13.2 (editable-node context menu, around lines
624-648), §12 (clipboard), §17 (images and attachments);
[`docs/DEVELOPMENT.md`](../docs/DEVELOPMENT.md) §9 (validation tiers);
[`src/main/AGENTS.md`](../src/main/AGENTS.md).

## State

The review began from a clean worktree at `c8a9834`. SEC1 through SEC5 are complete and validated;
SEC6 is the next ready task.

The review read every file under `src/`, the Electron entry and window configuration, the whole
preload and IPC surface, the persistence and clipboard infrastructure, the renderer's HTML-producing
code, the content security policy plugin in `electron.vite.config.ts`, and the end-to-end security
suites. It confirmed the following controls are correctly implemented and adequately tested; do not
re-audit or "improve" them as part of these tasks:

* Renderer isolation: `contextIsolation`, `sandbox`, and no `nodeIntegration`
  (`src/main/window.ts:13`), asserted by `src/main/window.test.ts` and every end-to-end launch.
* Every IPC channel checks the sender frame against the configured renderer and validates its
  arguments before touching the filesystem, the clipboard, or the application
  (`src/main/ipc-handlers.ts`). There is no unvalidated channel.
* Attachment paths are confined to the attachments directory by the same character rule applied
  twice, at the IPC boundary (`src/main/ipc-security.ts:63`) and again when the path is built
  (`src/infrastructure/main/file-services.ts:246`). Directory traversal is not reachable.
* PNG validation is genuinely structural, not a signature check: chunk framing, per-chunk CRC32,
  `IHDR` field validity, a non-empty `IDAT`, `IEND` ordering and termination, a decoded-size budget
  applied before decoding, and finally a real decode through the platform decoder
  (`src/main/ipc-security.ts`, `src/main/png-decoder.ts`).
* Hyperlink destinations are restricted to `http:` and `https:` at every point a link is produced,
  because `normalizeLinks` applies `isHttpUrl` unconditionally (`src/domain/document-links.ts:14`)
  and every link-producing operation routes through it. A `javascript:` or `file:` destination
  cannot enter the document from a paste, an edit, or a saved file.
* The one `dangerouslySetInnerHTML` (`src/renderer/NodeInput.tsx:131`) is fed by `richTextHtml`,
  which escapes `&`, `<`, `>`, and `"` for both the text and the `href`, inside a double-quoted
  attribute (`src/renderer/editor-dom.ts`). There is no other HTML sink, and no `eval`,
  `new Function`, or `innerHTML` anywhere in `src/`.
* `setWindowOpenHandler` denies every window open and forwards only `http(s)` URLs with a non-empty
  host to the system browser (`src/main/index.ts:84`, `src/main/window.ts:38`), so even a link that
  somehow carried another scheme could not be opened.
* There is no network code anywhere in `src/`: no `fetch`, `XMLHttpRequest`, `WebSocket`,
  `node:http`, `node:https`, and no analytics or crash-reporting dependency. The application has two
  runtime dependencies, `react` and `react-dom`.
* The test-only IPC control surface `globalThis.__treeIpc` exists solely in `e2e/electron-entry.cjs`
  and is absent from `src/`, so it cannot ship.
* Persistence is atomic and durable (temporary file, `fsync`, rename, directory `fsync`), and the
  window-state stores validate their JSON and fail closed to defaults
  (`src/infrastructure/main/window-state.ts`).

## Decisions

* **D1 — the environment variable gate must key on `app.isPackaged`, not on a new variable
  (decided; the Product Owner may override).** SEC1 makes the development renderer URL a
  development-only input. Introducing a second environment variable to control the first would
  re-create the same problem, and a build-time constant would be invisible to the end-to-end suite,
  which runs the built output through `e2e/electron-entry.cjs` with `app.isPackaged === false`.
  Keying on `app.isPackaged` keeps development and the end-to-end suite working unchanged while
  removing the input from every shipped build. Resolve the URL once in a pure helper so it is unit
  testable; do not read `process.env` in more than one place.
* **D2 — the egress guard must be active in the end-to-end suite (decided).** SEC2 blocks network
  requests from the renderer session. It must not be gated on `app.isPackaged`, because
  `app.isPackaged` is false under the end-to-end suite and the control would then never be verified
  at the real boundary. Derive the allowed origins from the renderer URL that SEC1 already resolved:
  local schemes are always allowed, and the development origin is allowed only when that resolved
  URL is the development one. The guard applies to the renderer's own session and therefore does not
  affect `shell.openExternal`, which hands the URL to the operating system's browser, nor the macOS
  spellchecker, which is an operating-system service.
* **D3 — context-menu label truncation is a product change (decided; the Product Owner may
  override).** SEC6 bounds the selection text a menu request may carry. The bound is visible in the
  `Look Up` menu label, so `docs/PRODUCT.md` §13.2 must state it (`AGENTS.md` §5). Truncating a long
  label with an ellipsis matches what macOS itself does for its native Look Up item, so the change
  makes the menu more native, not less. State the numeric bound only in `docs/PRODUCT.md`;
  `npm run check:docs` rejects restated product quantities elsewhere.
* **D4 — the distribution toolchain is reserved for the Product Owner.** The repository has no
  packaging configuration today, so the application is not yet distributable and the hardening in F8
  cannot be implemented. SEC8 records the requirements as a checklist in `docs/SECURITY.md` and
  stops there. Do not add `electron-builder`, Electron Forge, `@electron/fuses`, `@electron/notarize`
  or any other packaging dependency as part of this plan; that is a technology-stack change under
  `AGENTS.md` §6 and needs the Product Owner first.
* **D5 — main-process error text is deliberately left alone (decided).** See "Observations that are
  deliberately not tasks".

## Findings reproduced from the review

### F1 defect (SEC1) — a packaged build still trusts `ELECTRON_RENDERER_URL`

`src/main/index.ts` reads `process.env['ELECTRON_RENDERER_URL']` in three places (`:79`, `:98`,
`:121`) with no guard on whether the build is packaged. That one value decides three separate things
at once:

* which page the window loads (`:98`, `window.loadURL(rendererUrl)`);
* which URL the navigation guard treats as the application document (`:80`, through
  `isAllowedRendererUrl`);
* which URL every IPC handler accepts as a trusted caller (`:121` into `registerIpcHandlers`, used by
  `requireTrustedRenderer` in `src/main/ipc-handlers.ts:53`).

So a local process that controls the application's environment — a login item, a `launchctl setenv`
entry, a modified launch agent, or any wrapper that spawns the application — can point a shipped,
signed Tree at an arbitrary remote page, and that page is simultaneously exempt from the navigation
restriction and accepted as the trusted renderer. The content security policy does not help: it is a
`<meta>` element injected into the packaged `index.html` by the build plugin
(`electron.vite.config.ts`), so a remote page simply has no policy and an unrestricted `connect-src`.

Context isolation and the sandbox still hold, so the page is limited to the preload API — but that
API is `window.treeApi`, which is enough to read the entire document (`load`), overwrite it (`save`),
read and write the system clipboard (`readClipboard`, `writeClipboard`), and read and write
attachment files. Combined with unrestricted outbound requests, that is complete document and
clipboard exfiltration from a trusted application. This is the most serious finding in the review.

`src/main/window.test.ts` covers `isAllowedRendererUrl` and `isAllowedExternalUrl` but nothing covers
how the renderer URL is chosen, because no function makes that choice — the expression is inlined at
all three call sites.

### F2 gap (SEC2) — nothing denies session permissions or outbound requests

The window uses the default session, and the application never calls
`session.setPermissionRequestHandler`, `setPermissionCheckHandler`, or `setDevicePermissionHandler`.
Electron's built-in defaults therefore apply to requests such as media capture, geolocation,
notifications, and clipboard read. The application needs none of them, and with the current content
security policy the practical risk is low — but the default is "Electron decides", not "denied", and
an enterprise reviewer reads an unset handler as an unmade decision.

Separately, the Product Owner's strongest stated property — this application does not phone home —
is currently true only because nobody wrote any network code. Nothing enforces it. A
`webRequest.onBeforeRequest` filter on the renderer session that allows only the local schemes the
application actually uses turns that property from a convention into a control that the end-to-end
suite can assert, and it makes any future accidental egress fail loudly during development instead
of silently shipping.

### F3 defect (SEC3) — the save boundary accepts leaf values the load path rejects

`docs/SECURITY.md` states that the save boundary validates the untrusted persisted state.
`validatePersistedState` (`src/domain/document-serialization.ts:25`) does validate structure, node
identity, uniqueness, depth, and location reachability, and it calls `parseAttachment` and
`parseLinks` for every node. But both leaf validators are weaker than the rules the rest of the
application maintains:

* `parseAttachment` (`:200`) requires a non-empty string `id` and `mimeType === 'image/png'`, and
  nothing else. It does not apply the `[A-Za-z0-9_-]+` rule that both `src/main/ipc-security.ts:63`
  and `src/infrastructure/main/file-services.ts:246` enforce.
* `parseLinks` (`:180`) validates each link's shape and then calls `normalizeLinks`, which *filters*
  invalid entries rather than rejecting them. `validatePersistedState` discards that filtered result
  and returns the caller's original object (`:55`, `return value as unknown as PersistedEditorState`),
  which `fileServices.save` then serializes verbatim.

The consequence is a persistent, self-inflicted failure state reachable from a compromised renderer.
An attachment identifier containing `../` or a path separator passes the save boundary and is written
to `document.json`. It also passes `parsePersistedState` on the next launch, so the document loads.
The renderer then calls `readAttachment` and `cleanupAttachments` with that identifier, both of which
the IPC boundary correctly refuses — so the image never renders and, worse, every attachment cleanup
throws, meaning orphaned attachment files are never reclaimed and the user sees a recurring
`Operation failed:` message that restarting does not clear. A non-`http(s)` link destination is
written to disk the same way and silently dropped on the next load, leaving the file inconsistent
with what the application will read back.

The path confinement itself holds — this is not a traversal. The defect is that the boundary that
claims to validate persisted state lets through values that every other layer refuses, and the
resulting file is unrepairable from inside the application.

Existing tests pin the current, weaker behavior only for a completely malformed attachment
(`src/domain/document.test.ts:512`, `:548`); nothing covers an attachment identifier with an invalid
character or a link with a non-`http(s)` destination reaching `save`.

### F4 gap (SEC4) — the navigation guard covers only the main frame

`window.webContents.on('will-navigate', …)` (`src/main/index.ts:80`) fires for main-frame navigation
only. Electron also exposes `will-frame-navigate` for navigation started in any frame, and
`will-attach-webview` for `<webview>` creation. Neither is handled. The handlers are also attached to
the one window that `createMainWindow` builds, rather than in an `app.on('web-contents-created', …)`
hook, so any web contents created another way would start unguarded.

Both gaps are currently unreachable: `webviewTag` defaults to false, the content security policy's
`default-src 'self'` covers frames, and the application creates exactly one window. But the guard's
correctness then depends on three separate facts staying true, and F1 shows that the policy is absent
whenever the renderer URL is not the packaged document. The policy is also missing directives for
capabilities the application never uses — frames, workers, and media — which currently fall back to
`default-src` rather than being explicitly denied.

`e2e/csp.spec.ts` asserts the policy string and main-frame navigation blocking; nothing covers a
subframe.

### F5 defect (SEC5) — unbounded backtracking over clipboard HTML in the main process

`extractClipboardLinks` (`src/infrastructure/main/clipboard.ts:37`) runs

```text
/<a\b[^>]*\bhref\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a\s*>/gi
```

over the entire HTML flavor of the system clipboard, with no length bound, on the main process's
event loop. The `[^>]*\bhref` prefix backtracks across the whole remaining input at every `<a`
position that is not followed by a `>`, so input of the shape `<a <a <a …` costs quadratic time. A
crafted clipboard payload of a few megabytes — which any web page can place on the clipboard — stalls
the main process, and the main process is what services every IPC call, so the whole application
freezes with no error.

The number of extracted links is also unbounded. Neither the payload size nor the link count is
capped anywhere between the system clipboard and this function.

`src/infrastructure/main/clipboard.test.ts:49-72` covers only small ASCII inputs.

### F6 gap (SEC6) — the context-menu request carries unbounded and non-finite values

`validateEditorContextMenuRequest` (`src/main/ipc-security.ts:36`) checks `typeof value.x === 'number'`
and `typeof value.y === 'number'`, which accept `NaN`, `Infinity`, and `-Infinity`, and it accepts a
`selectionText` of any length. Those values reach native code directly:

* `x` and `y` go to `Menu.popup` (`src/main/editor-context-menu.ts:48`);
* `selectionText` is interpolated into the `Look Up “…”` menu label (`:28`) and, for the Google
  search item, into a URL handed to `shell.openExternal` (`:36`).

A compromised renderer can therefore build a native menu with a multi-megabyte label or hand the
operating system's browser a URL of unbounded length. Neither is a memory-safety problem, but both
are untrusted values crossing into native APIs without a bound, which is exactly what the other
validators in this file exist to prevent. `e2e/context-menu.spec.ts` exercises the normal flow only.

### F7 gap (SEC7) — the three ways content can leave the machine are undocumented

`docs/SECURITY.md` describes the application as local and network-free, which is true of the
application's own code, but it does not enumerate the paths by which a user's content can reach a
third party. There are three, and an enterprise reviewer will ask for exactly this list:

* `shell.openExternal` for a Cmd+clicked or `Enter`-opened hyperlink
  (`src/main/index.ts:86`) — the URL, which is document content, goes to the operating system's
  default browser.
* The `Search with Google` context-menu item (`src/main/editor-context-menu.ts:36`) sends the
  selected text to `google.com` as a query string. This is a documented product feature
  (`docs/PRODUCT.md` §13.2) and is user-initiated, but it is the one place where document text
  itself leaves the machine, and nothing in the security documentation says so.
* `webContents.showDefinitionForSelection()` (`:30`), the macOS Look Up item, hands the selected text
  to the operating system's lookup services, which may consult network sources depending on the
  user's own macOS settings.

A fourth, latent path: `spellCheck: true` (`src/renderer/NodeInput.tsx:102`) with Electron's
spellchecker enabled by default. On macOS this uses the operating system's spellchecker and downloads
nothing, so it is not a live issue for this application. On Windows and Linux, Electron downloads
Hunspell dictionaries from a Google-hosted CDN on first use. If the application is ever built for
another platform, that becomes a silent outbound request from a product that promises none. The
review verified the macOS behavior and is recording the cross-platform hazard so a future port does
not reintroduce it unknowingly.

### F8 gap (SEC8) — no distribution hardening requirements are recorded

The repository has no packaging configuration: `npm run build` produces `out/` for `electron-vite`
and nothing produces a `.app`. So the application is not yet distributable, and none of the following
can be implemented today — but all of it must be settled before a build is handed to anyone, and
none of it is written down.

With Electron's default fuse configuration, a signed and notarized `Tree.app` is also a general
purpose Node.js interpreter: `ELECTRON_RUN_AS_NODE=1` makes the bundled Electron binary execute
arbitrary script, and `NODE_OPTIONS=--require …` injects code into the main process before any of the
application's own code runs. On macOS this is a well-known primitive for borrowing a signed
application's identity and its privacy permissions, and it defeats every renderer-side control in
this repository because it never starts the renderer at all. The mitigations are the `@electron/fuses`
flags, archive integrity, the hardened runtime, and a minimal entitlement set.

See D4: recording the requirement is in scope for this plan; implementing it is not.

### Observations that are deliberately not tasks

* **Main-process error messages reach the renderer verbatim.** `ipcMain.handle` rejections carry the
  main process's message — including absolute paths under the user's home directory, from Node's
  `ENOENT` and `EACCES` errors — to a renderer the security model treats as untrusted, and
  `persistence-coordinator.ts` shows them after `SAVE_ERROR_PREFIX`. The review decided against
  changing this (D5): the paths describe the user's own machine and the user's own data directory, a
  renderer able to read them can already read the whole document through `load`, and the concrete
  message is what lets the user and the end-to-end suite diagnose a real save failure. Genericizing
  it would remove diagnostics from the product to hide information from an attacker who already has
  the data. Do not "fix" this.
* **The renderer can read the system clipboard without a user gesture.** `tree:read-clipboard` is
  available to the renderer at any time. This is inherent to implementing paste in a renderer that
  owns the editing commands (ADR 0003) and is not separable from the product.
* **`quitWithoutSaving` lets the renderer discard unsaved changes.** It is the documented product
  behavior behind the quit-without-saving prompt (`docs/PRODUCT.md` §16.2); a compromised renderer
  causing data loss is strictly less capable than one calling `save` with whatever it likes.
* **`validatePersistedState` does not bound document size.** A compromised renderer could write a
  very large `document.json` and consume disk. The application has no size budget to enforce against,
  inventing one would be a product decision, and the outcome is bounded by the user's own disk.
  Do not add a limit without asking the Product Owner.
* **Attachment files are read and written through paths that could be symbolic links.** Reaching
  that requires write access to the application's data directory, which the Product Owner explicitly
  placed with the operating system. Out of scope by instruction.
* **The content security policy is absent in development**, because the plugin runs with
  `apply: 'build'`. That is the correct trade-off for the Vite dev server, and SEC1 removes the case
  where a packaged build could run without the policy.

## Tasks

| ID | Outcome and acceptance evidence | Files expected to change | Tier | Status |
| --- | --- | --- | --- | --- |
| SEC1 | Ignore `ELECTRON_RENDERER_URL` unless the build is unpackaged, per F1 and D1. Add one exported pure helper to `src/main/window.ts` that takes the packaged flag, the environment value, and the packaged document URL and returns the renderer URL plus whether it is the development one; call it once in `src/main/index.ts` and use its result for `loadURL`/`loadFile`, the navigation guard, and the trusted-caller URL. Acceptance: unit tests that a packaged build returns the packaged document URL and reports "not development" even when the environment variable is set to a remote URL, that an unpackaged build honors it, and that an unpackaged build without it returns the packaged document URL; `src/main/index.ts` reads `process.env['ELECTRON_RENDERER_URL']` exactly once; the end-to-end suite passes unchanged. Update `docs/SECURITY.md` ("Restricted navigation" and "Trusted callers") and `docs/ARCHITECTURE.md` §16. | `src/main/window.ts`, `src/main/window.test.ts`, `src/main/index.ts`, `docs/SECURITY.md`, `docs/ARCHITECTURE.md` | High | Done |
| SEC2 | Deny every session permission request and every non-local renderer network request, per F2 and D2. Add one exported function to `src/main/window.ts` that takes a session-like object and the resolved renderer URL from SEC1 and installs: a permission request handler, a permission check handler, and a device permission handler that all deny; and a `webRequest.onBeforeRequest` filter that cancels any request whose URL is not `file:`, `devtools:`, `blob:`, or `data:`, and not same-origin with the renderer URL when that URL is the development one. Call it from `registerReadyServices` in `src/main/index.ts`. Acceptance: unit tests for each handler denying and for the filter allowing local schemes, allowing the development origin only in development, and cancelling `https:`; a new end-to-end assertion that a renderer-initiated request to an external HTTPS origin fails while the application still loads and edits normally; `e2e/hyperlink.spec.ts` still passes, proving `shell.openExternal` is unaffected. Update `docs/SECURITY.md` (new control plus its row in the verification map) and `docs/ARCHITECTURE.md` §16. | `src/main/window.ts`, `src/main/window.test.ts`, `src/main/index.ts`, `e2e/csp.spec.ts`, `docs/SECURITY.md`, `docs/ARCHITECTURE.md` | High | Done |
| SEC3 | Make the save boundary reject the leaf values the rest of the application refuses, per F3. In `src/domain/document-serialization.ts`, apply the shared attachment-identifier character rule in `parseAttachment` and make `parseLinks` throw on a destination that is not `http`/`https` instead of letting `normalizeLinks` filter it. Keep the character rule in one place so `src/main/ipc-security.ts` and `src/infrastructure/main/file-services.ts` cannot drift from it. Acceptance: defect-first unit tests that fail before the change — `validatePersistedState` accepting an attachment identifier containing a path separator, and accepting a `javascript:` link destination — and pass after it; a test that an identifier of the shape the application actually generates is still accepted; a property test that generated safe attachment identifiers pass persisted-state validation; a contract test that `tree:save` rejects both payloads; an end-to-end assertion that a document written with such an identifier is refused at the save boundary rather than producing a document whose attachments can never be cleaned up. No `docs/PRODUCT.md` change: this rejects states the application never produces. | `src/domain/document-serialization.ts`, `src/domain/document-serialization.test.ts`, `src/domain/document.property.test.ts`, `src/main/ipc-security.ts`, `src/main/ipc-security.test.ts`, `src/main/ipc-handlers.test.ts`, `src/infrastructure/main/file-services.ts`, `e2e/persistence.spec.ts`, `docs/SECURITY.md`, `docs/ARCHITECTURE.md` | High | Done |
| SEC4 | Close the navigation-guard gaps in F4. Install the navigation and window-open guards from `app.on('web-contents-created', …)` so they apply to any web contents, handle `will-frame-navigate` with the same rule as `will-navigate`, deny `will-attach-webview`, and block redirects to any URL other than the resolved renderer document. Add `frame-src 'none'`, `child-src 'none'`, `worker-src 'none'`, `media-src 'none'`, and `frame-ancestors 'none'` to the policy in `electron.vite.config.ts`. Acceptance: unit tests for the shared guard applied to a frame navigation, redirect, and webview attach; an extension of `e2e/csp.spec.ts` asserting the new directives are present, that an iframe cannot navigate to an external origin, and that the existing no-violations check still passes on reload. Update `docs/SECURITY.md`. | `src/main/window.ts`, `src/main/window.test.ts`, `src/main/index.ts`, `electron.vite.config.ts`, `e2e/csp.spec.ts`, `docs/SECURITY.md`, `docs/ARCHITECTURE.md` | High | Done |
| SEC5 | Bound the clipboard HTML that `extractClipboardLinks` parses, per F5, and bound the number of links it returns. Prefer removing the backtracking prefix over relying on the bound alone. Acceptance: a test that an adversarial input of the `<a <a <a …` shape returns promptly and yields no links — assert on completion within a generous deterministic budget, not on a tight timing threshold; a test that an oversized HTML flavor is ignored and the paste still delivers its plain text through Electron; a test that the link count is capped; every existing case in `src/infrastructure/main/clipboard.test.ts` and `e2e/clipboard.spec.ts` passes unchanged, including hyperlink-preserving copy and paste. No `docs/PRODUCT.md` change: the bounds are not reachable by pasting from an ordinary application. | `src/infrastructure/main/clipboard.ts`, `src/infrastructure/main/clipboard.test.ts`, `e2e/clipboard.spec.ts`, `e2e/fixtures.ts` | High | Done |
| SEC6 | Bound the editor context-menu request, per F6 and D3. In `validateEditorContextMenuRequest`, require finite coordinates and reject or truncate `selectionText` beyond a stated bound; if truncating, the `Look Up` label ends with an ellipsis and the Google query uses the same bounded text. State the bound in `docs/PRODUCT.md` §13.2 only. Acceptance: unit tests rejecting `NaN` and `Infinity` coordinates and covering the bounded selection text; an end-to-end assertion that the menu still opens with its documented items for an ordinary selection. | `src/main/ipc-security.ts`, `src/main/ipc-security.test.ts`, `src/main/editor-context-menu.ts`, `src/main/editor-context-menu.test.ts`, `docs/PRODUCT.md`, `e2e/context-menu.spec.ts` | High | Ready |
| SEC7 | Document the application's network egress, per F7. Add a section to `docs/SECURITY.md` that states the application performs no network requests of its own, sends no telemetry, and stores documents only on the local machine; then enumerate the three user-initiated paths by which content can reach a third party (external link opening, the Google search menu item, macOS Look Up), naming the file and the product requirement for each. Add the spellchecker note: the macOS spellchecker downloads nothing, and a future Windows or Linux build must disable the Hunspell dictionary download before shipping. Acceptance: `npm run check:docs` passes, each stated path is traceable to the named source file, and no product quantity is restated outside `docs/PRODUCT.md`. No source change. | `docs/SECURITY.md` | Minimal | Ready |
| SEC8 | Record the distribution hardening requirements, per F8 and D4. Add a section to `docs/SECURITY.md` stating that the application is not yet packaged and listing what a distributable build must satisfy before it is handed to anyone: the `RunAsNode`, `EnableNodeOptionsEnvironmentVariable`, `EnableNodeCliInspectArguments`, and `EnableRunAsNode`-adjacent fuses disabled; `OnlyLoadAppFromAsar` and archive integrity validation enabled; the macOS hardened runtime with no `allow-unsigned-executable-memory`, `allow-dyld-environment-variables`, or `disable-library-validation` entitlement; code signing and notarization; and a note that these defend against a vector that bypasses every renderer-side control in this repository. State explicitly that the toolchain is not chosen and is reserved for the Product Owner. Acceptance: `npm run check:docs` passes; no packaging dependency, script, or configuration file is added. | `docs/SECURITY.md` | Minimal | Ready |

Dependencies: SEC2 consumes the resolved renderer URL that SEC1 introduces, so SEC1 must land first.
SEC1, SEC2, and SEC4 all touch `src/main/window.ts`, `src/main/window.test.ts`, and
`src/main/index.ts`; take them in the order SEC1, SEC2, SEC4 and land each before starting the next.
SEC3, SEC5, SEC6, SEC7, and SEC8 are independent of everything else and of each other. The
recommended order is SEC1, SEC2, SEC3, SEC4, SEC5, SEC6, SEC7, SEC8 — highest risk first. One
logical task per commit (`AGENTS.md` §12).

Per `AGENTS.md` §13, SEC1 through SEC6 are High Risk changes at a process, IPC, persistence, or
clipboard boundary and each additionally requires an independent reviewer. SEC6 changes user-visible
menu text and therefore also needs product verification of the context-menu flow; the primary agent
may perform it, because the flow is contained within one interaction state. SEC1 through SEC5 change
no user-visible behavior when the application is used normally — that is part of their acceptance
evidence — so the primary agent verifies only that the affected flows still work. SEC7 and SEC8 are
documentation-only and need neither role. No task is rendering-sensitive, so the visual-regression
workflow in `AGENTS.md` §9 does not apply; do not generate or update screenshot baselines.

Validation: SEC1 through SEC6 are High Risk and require `npm run check:full` plus the security
boundary checks named in `docs/DEVELOPMENT.md` §9 (IPC validation, renderer navigation restrictions,
attachment validation, and the production content security policy). SEC7 and SEC8 are Minimal Risk:
`npm run format:check:changed` and `npm run check:docs`. Record every result with the evidence format
in `docs/DEVELOPMENT.md` §9 and `npm run validation:snapshot`. A blocked end-to-end or performance
suite must be reported as blocked, not as passed.

## Next task

SEC6 — bound editor context-menu coordinates and selection text, following F6.

Implementation notes for SEC6, so the task does not depend on this plan's authoring session:

* Require finite `x`/`y` values and truncate overlong `selectionText` to a bounded prefix that ends
  with an ellipsis in the native `Look Up` label.
* Use that same truncated text for the Google search query. Set the character limit as an internal
  constant and state the numeric value only in `docs/PRODUCT.md` §13.2 (D3).
* Add unit tests for `NaN`, `Infinity`, and selection truncation; add an Electron assertion that the
  ordinary-selection menu still opens with its documented items.
* Validation is High Risk (`docs/DEVELOPMENT.md` §9): `npm run check:full`.
* Commit as `fix(main): bound context menu requests`, together with this plan's status update for
  SEC6 (`AGENTS.md` §12).

All eight tasks are authorized, with three remaining `Ready`, so a session may continue to the next
one in the recommended order after committing the previous task, while context stays manageable
(`AGENTS.md` §12). A reasonable split is SEC1 and SEC2 in one session, SEC3 and SEC4 in the next,
then SEC5 through SEC8; judge by remaining context rather than by that split. Mark each task `Done`
in the same commit that lands it, and leave the plan and any `WORKING_PLAN.md` in place if a session
stops before committing.

Resume prompt: "Continue the security hardening review in `plans/security-hardening.md`. Read
`AGENTS.md`, that plan, `docs/SECURITY.md`, and `docs/DEVELOPMENT.md` §9, then implement its next
Ready task in the recommended order, commit it together with the plan status update, and continue to
the following task if context allows."
