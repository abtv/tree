# Browser Tree: research and proposed delivery plan

Status: D1–D5 accepted; static package and Chrome-only automatic publication files prepared and locally reviewed. First signed GitHub execution remains pending owner setup/push. P1 remains partial: frozen-writer, physical-input, Safari, real-editor scale and the full support matrix remain unverified. Remaining full-parity implementation is not authorized by the bounded publication task.
Research date: 2026-10-17.
Secure-publication hardening (owner, 2026-10-17): implement independent attestation
of the manifest committing to every published file; authenticate retained assets;
pin publication Actions and separate verification from Pages/OIDC write jobs.
Source main, approved workflow code and GitHub/Sigstore are trusted. A compromised
target-only Contents-write App must not forge provenance or alter executable
verification code. Target workflow uses source tools at an independently resolved
immutable source main SHA, never target scripts. App Workflows write remains denied.
The owner will manually update the target repository and GitHub settings. Do not
edit or push that checkout, source main, or publish. Anonymous API reliability is
deferred. This review batch includes findings1–5 and the deliberate in-progress
source run behavior; #5 is deferred, the other security findings are in scope.
Validation is High Risk for security boundaries; real signed CI/deployment
acceptance remains pending owner setup and push, separate from local validation.

| Review item | Implementation state |
| --- | --- |
| 1. Independent package authenticity | Source OIDC job attests a complete manifest; target verifies detached Sigstore proof and every size/hash using independently sourced trusted code |
| 2. Unverified retained files | Source authenticates previous manifest/bytes before merging; cumulative bounds precede downloads; whole-tree transfer and exact target checks exclude extras |
| 3. Mutable Action tags | Publication-reachable source and target Actions use verified full SHAs; target Dependabot configuration supplied |
| 4. Deployment privileges | Read-only target verification/hosted checks are separate from Pages/OIDC write deployment with no checkout or repository scripts |
| 5. Anonymous source API reliability | Deferred by owner; no cross-repository reading credential added |

Acceptance remains pending: owner replaces target workflow using
`deployment/github-pages/`, confirms App permissions/secrets, and pushes intended
source commits. The transfer probes workflow-write denial in a temporary branch;
target `workflow_dispatch` with `rejection_probe` checks a real authenticated
baseline and corrupted local copy without deployment. Do not call this operational
or claim publisher-token protection is verified through GitHub before those pass.
Docker and automatic settings setup were removed at owner request. No source or
target push, App setup or deployment was performed by this hardening task.

Automatic-publication task (owner, 2026-10-17): implement publication after source
main pushes and all applicable checks pass. Chrome is sufficient for this current
release gate; do not start Safari or the remaining full-parity initiative.
This supersedes earlier publication-preparation holds only for this bounded task.
Use accepted D5: short-lived target-only App, verified package handoff and trusted
target Pages Actions. Preserve the separate source media site. Do not push the
existing local source commits on the owner's behalf; activate when the owner pushes.
Source/target API reads work and target admin access is reported. There are no
publication secrets yet. The owner must create/install the App and put its private
key directly into the source environment secret before an actual automated run.
Pipeline and one-time setup are in `deployment/github-pages/README.md`.

Static-hosting task (owner, 2026-10-17): prepare the accepted browser version for
the permanent address with a static build and hosting files, verify the generated
package in Chrome, and commit. Preserve the accepted editor, compact menu, themes,
Agenda and Vim. Do not start the rest of the initiative, configure Docker, add
sync/accounts/export/import, delete existing browser notes or publish. This narrow
authorization supersedes the earlier implementation hold only for this task.
The owner has been told that localhost and the permanent origin have separate
storage and existing notes do not transfer automatically; repeat this explanation
before any later publication. Safari, physical input and scale gates remain open.
Static-hosting result: `npm run build:web` produces `out/web/` with HTML, hashed
JavaScript/CSS/font assets and `.nojekyll`. `npm run test:web:built` passed the
editor, theme, menu and storage checks in isolated Chrome 155 against the generated
files, including full browser restart and write-failure paths. Accepted UI and
the browser adapter/database are unchanged. Hosting and update instructions are
in `src/web/README.md`; no deployment workflow or publication was added.
Types, unit coverage, serial fast performance guards, desktop build, scoped lint
and formatting, docs and requirement coverage pass. Full `npm run check` remains
blocked by the unrelated untracked Docker verifier's lint/format errors;
`check:opencode` also exposes the previously documented `dev:web` workflow's
missing allow rule. These files/permissions were not changed. This is a prepared
Chrome-checked package, not a passed full browser release gate.
Next task: await explicit owner direction. Do not automatically resume P2–P8 or
publish; retain all existing Safari, physical-input, scale and release gates.

Local implementation checkpoint (owner, 2026-10-17): after reviewing the browser
editor, theme, compact menu and storage corrections, the owner explicitly asked
to preserve the working code in ordinary project files and commit it. The scope
is `src/web/`, named local run/check commands and supporting documentation.
Preserve the localhost origin/database so the existing browser document remains
accessible. Synchronization, export/import, Docker setup and publication are
excluded. This checkpoint does not authorize full P2–P8 delivery or waive remaining
browser parity, scale and release validation. Reuse prior valid prototype evidence
and check the tracked entry point after relocation.
Checkpoint result: source and isolated Chrome checks are preserved in
`src/web/`, with `npm run dev:web` and `npm run test:web`. Browser
smoke, theme, menu and storage checks pass from the relocated source; types and
desktop build also pass. Whole-project lint/format checks remain blocked by the
unrelated untracked `scripts/browser-container/verify.mjs` from suspended Docker
work. Preserve those files; the owner canceled its image build, which must not
be retried. This checkpoint is complete; wait for owner direction before selecting
another implementation task or publication.
Continuation scope: the owner installed Chrome and requested Chrome-only verification, without Safari. On 2026-10-17 the owner requested continued Chrome technical verification and plan updates, and will check Safari manually later. Temporary Chrome probes and plan updates remain authorized. This changes the current verification scope, not the future browser support or release gates. No Safari/WebKit execution is needed for this continuation. Manual Safari evidence does not by itself establish the recurring automated Safari release gate proposed in P6.
Authorization (owner, 2026-10-17): accept the five recommendations D1–D5; perform technical verification with temporary prototypes and tests; update this plan from the results; agree any new constraints with the owner. Disposable experiments under `.scratch/browser-feasibility/` are authorized. Full application implementation, repository-settings changes, push, and publication remain unauthorized. P0 requirements/ADR finalization and P2–P8 require later authorization. The accepted recommendations retain their explicit unresolved details and do not accept unspecified parity exceptions.

## 1. Outcome and fixed boundaries

The browser and desktop applications are equal ways to use Tree permanently. The browser application must retain the editor, Tree and Agenda, ordinary editing, the full existing Vim behavior, images, links, completion, navigation, history, preferences, appearance, and large-document responsiveness. Trying Tree without installation is one use case, not the product definition. Maximize shared code; do not build a separate simplified editor.

The owner's requirements for the future implementation are:

* Support desktop Safari on macOS and Google Chrome on macOS, Windows, and Linux. Mobile browsers are outside scope. Exact supported release ranges remain decision D4.
* Keep the name Tree. Keep the source repository in place. Serve the application at `https://tree-editor.github.io` from the separate organization repository `tree-editor/tree-editor.github.io`.
* The accepted browser exceptions are the machine-global `Cmd+0` shortcut and Always on Top. No other parity exception is accepted by this plan.
* Store documents and images locally in the browser. No accounts, synchronization, telemetry, document uploads, error reporting uploads, or usage-event collection. Application-file and update requests are allowed. GitHub Pages infrastructure IP logs are accepted. Other sites must not read or modify Tree data.
* Export and import are later work and are excluded, including backup-download controls disguised as error recovery. Desktop-to-browser data transfer is not part of this initiative.
* A genuinely empty store starts with a small editable sample. Reading errors, invalid data, unsupported formats, and failed migration never mean empty and never cause replacement with the sample.
* Provide reliable autosave, a request for persistent storage, and understandable storage errors. Clearing site data or deleting the browser profile destroys local data. The browser may refuse persistent storage. Do not promise permanent retention or recovery after all local copies disappear.
* Only one tab may edit the document. A second tab explains the restriction. Separate browser profiles and different browsers have separate local documents; no implicit synchronization is promised.
* After the full initial package is stored, Service Worker offline startup must work, including reopening after browser restart, while the required local data remains. If Service Worker is unavailable, the online editor still works when the required local storage is available.
* Updates do not force an open editor to reload or damage documents. Incomplete update downloads leave the previous working application usable.
* A push to the actual source default branch starts automated publication only after required checks for that same source commit pass. A failed check, build, transfer, or deployment must preserve the last successful publication.
* Respect enterprise policy. Do not request extensions, flags, policy changes, or alternative APIs to bypass an administrator's denial.

These are planning inputs, not a claim that the current application implements them. Current sources remain [Product](../docs/PRODUCT.md), [Architecture](../docs/ARCHITECTURE.md), [Security](../docs/SECURITY.md), [Development](../docs/DEVELOPMENT.md), and [Vim conformance](../docs/VIM_CONFORMANCE.md). Update their owning sections only in an authorized requirements/implementation task. Do not add an Accepted ADR for these proposals now.

## 2. Evidence and limits of this research

### Repository and hosting facts

The inspected source snapshot was `384387c8a03c47760b734e3cab14e6fe137d7545`. The worktree was clean, the local branch was `main`, tracking `origin/main` and ahead by six commits. There was no `WORKING_PLAN.md`; the plan index was empty. Read-only GitHub API requests independently confirmed the source repository as public `abtv/tree`, with default branch `main`. The mention of `master` does not match the current configuration.

Read-only GitHub API inspection confirmed that the target repository exists, is public, has default branch `main`, and currently contains `README.md`. Its Pages configuration is `legacy`, publishing `/` from `main`, with HTTPS enforcement. An HTTPS HEAD request returned 200, with `Cache-Control: max-age=600` and no CSP or frame-denial response header in that response. This is a dated observation, not a promise about future headers. No settings were changed.

The source repository already publishes synthetic demo video and README images at `https://abtv.github.io/tree/` through [.github/workflows/demo.yml](../.github/workflows/demo.yml). It is a separate origin and a separate deployment. Preserve that workflow's destination and output; do not reuse it as the browser release gate. The source repository's Pages mode is already `workflow`.

Inspection commands included `git status --short --branch`, `git remote -v`, `git log -1`, `gh repo view --json nameWithOwner,defaultBranchRef,isPrivate`, read-only `gh api repos/...`, and `curl -I https://tree-editor.github.io`. No deployment rights or credentials were exercised. API visibility and reported repository permissions do not prove that a future GitHub App or CI job has the necessary runtime access.

### Capability status

| Capability | Evidence or limitation |
| --- | --- |
| Repository reading, external primary-source research | Successfully used in this session |
| GitHub repository and Pages configuration inspection | Read-only API operations succeeded for both repositories |
| Independent planning | Configured Planner completed a read-only pass under [Agent Roles](../docs/AGENT_ROLES.md) |
| Documentation editing and Minimal Risk validation | Required for this research deliverable; no application tests needed for plan-only changes |
| Browser application, measurements, native keyboard trials | No browser build exists; none executed. Feasibility claims below are proposals or external evidence, not measured Tree results |
| Chrome on all target OSes, real Safari automation, persistent ordinary browser profiles | Not verified in this session. P1 must establish access before claiming coverage |
| Cross-repository publishing identity, target Actions execution, hosted application verification | Not configured or exercised; later owner setup and explicit publication authorization required |

## 3. Current Electron dependencies and sharing strategy

The domain already excludes Electron, DOM, React, and filesystem dependencies. The application uses an injected `EditorServices` contract in [editor-store-types.ts](../src/application/editor-store-types.ts). This is a good starting point, but changing only the service factory is insufficient.

| Current owner | Dependency and required browser treatment |
| --- | --- |
| [renderer/main.tsx](../src/renderer/main.tsx), [renderer/lifecycle.ts](../src/renderer/lifecycle.ts) | Hardwired Electron services, preference bootstrap, quit request/acknowledgment. Add separate browser composition and lifecycle; share editor mounting |
| [shared/ipc.ts](../src/shared/ipc.ts), [preload/index.ts](../src/electron/preload/index.ts) | Explicit desktop API for persistence, attachments, clipboard, preferences, native context menu and quit. Retain the Electron boundary; extract platform-neutral value contracts rather than emulate IPC in a browser global |
| [electron-services.ts](../src/infrastructure/renderer/electron-services.ts), [AttachmentPreview.tsx](../src/renderer/AttachmentPreview.tsx) | Preview imports an Electron-named singleton byte cache directly. Inject attachment reading/cache ownership and retain bounded caching and object-URL cleanup |
| [App.tsx](../src/renderer/App.tsx), [use-command-panel.ts](../src/renderer/use-command-panel.ts), [editor-input-handlers.ts](../src/renderer/editor-input-handlers.ts), [node-input-pointer-handlers.ts](../src/renderer/node-input-pointer-handlers.ts) | Direct `window.treeApi` calls for preferences, quit and context menus. Route through a narrow platform interface; capabilities must have explicit product dispositions |
| [file-services.ts](../src/infrastructure/main/file-services.ts), [quit-handshake.ts](../src/electron/main/quit-handshake.ts) | Serialized filesystem work, durable replacement, retained generations and controlled shutdown. Browser storage must implement the same safety intent with transactions; filesystem rename/fsync and guaranteed quit waiting cannot simply be copied |
| [clipboard.ts](../src/infrastructure/main/clipboard.ts), [ipc-security.ts](../src/electron/main/ipc-security.ts), [png-decoder.ts](../src/electron/main/png-decoder.ts) | Electron clipboard and PNG decoding/validation. Share pure validation, link extraction and size rules; add browser event/API adapters and browser decoding, without importing Node `Buffer` or Electron |
| [application-menu.ts](../src/electron/main/application-menu.ts), [editor-context-menu.ts](../src/electron/main/editor-context-menu.ts), [window.ts](../src/electron/main/window.ts) | Native menus, Look Up, Google search, external links, geometry, appearance and window pinning. See D2/D3; no silent omissions |
| [electron.vite.config.ts](../electron.vite.config.ts), [renderer/index.html](../src/renderer/index.html), [styles.css](../src/renderer/styles.css) | Desktop build and CSP, worker prohibition, font asset, draggable title area and macOS presentation. Add a separate browser Vite entry/config and platform styling; preserve common layout and editing code |

Recommendation: one domain, application store, command registry, Vim command/session/caret owners, Tree/Agenda components, completion logic and principal styles. Separate Electron and browser composition roots and infrastructure. Keep platform access injected and outside business rules. Reuse React, TypeScript and Vite. A framework migration, editor replacement, CRDT, server, account system, or separate browser product is unnecessary.

Do not add a parallel Vim engine, duplicate editor state, or scattered platform checks in key handlers. Move generic types currently named after IPC to an appropriate shared/application owner. Narrow ports for storage, attachments, clipboard, preferences, lifecycle and links are justified; a general dependency-injection framework is not. These boundary changes require an approved architectural direction before implementation.

## 4. Parity inventory and input risks

The inventory covers the current product, including Agenda, not only the default Tree screen. The implementation task must map every applicable Product section and existing integration owner to browser coverage.

| Area | Intended browser result | Evidence still needed |
| --- | --- | --- |
| Tree structure and editing | Same identity, ordering, split/delete/move, zoom, folds, breadcrumbs, history, selection and scroll restoration | Shared rule/property coverage plus browser DOM/input integration |
| Vim | Same Normal/Insert/Replace, character/node Visual, motions, counts, operators, text objects, surround, registers, puts, repeat, folds and undo sessions | Real keys, caret/selection direction, composition, rich text, image caret, Tab, command panel and cross-view transitions |
| Agenda | Same projection, dates, focused days, mirrors, navigation, structural restrictions, drag/move, editing and completion | Current Agenda regression owners adapted to browser launch |
| Images and links | Same validation, paste precedence, decoding, preview, errors and retention across history/recovery | Trusted paste, browser image decoder, external opening disposition D3 |
| Preferences and visual UX | Vim toggle, command history and automatic/light/dark appearance retained locally; same focus and status behavior | Initial render, theme changes, zoom, font loading, platform font metrics, visible geometry and screenshots |
| Platform UI | Equivalent reachable commands, native text affordances where available | D2/D3; native menus and window management cannot be assumed available to a page |
| Save and recovery | Local autosave, recoverable generations, honest failure states | D1 and real lifecycle/storage failure tests |
| Global shortcut and pin | Accepted exceptions | Do not register a browser substitute globally or require installation/fullscreen |

### Shortcut audit

Current renderer application shortcuts mostly test `metaKey` directly. They do not yet define a Windows/Linux command modifier. Recommend Command on macOS and Control on Windows/Linux for application commands, preserving literal Control for existing Vim Control commands. Never globally rewrite every Meta test to Meta-or-Control: this would make application bindings collide with Vim and native text handling.

Inventory and test these groups in both Tree and Agenda, all editing modes and adjacent overlays:

* Ordinary keys, punctuation, `Escape`, `Enter`, Backspace, Tab/Shift+Tab, arrows, Home/End/Page keys, counts, operators, `:`, `.`, `p/P`, `gv`, folds and structural commands.
* Literal Vim `Ctrl+D`, `Ctrl+U`, `Ctrl+R`, `Ctrl+O`; command-panel/completion `Ctrl+N` and `Ctrl+P`. Chrome and Safari may assign competing actions; actual delivery and cancellation must be tested.
* Application Cmd/Control combinations for Agenda (`P`), command panel (`Shift+P`), enter/leave (`.`/`,`), fold (`E`), completion/strike actions (`Enter`/`Y`), delete (Backspace), undo/redo, select all and clipboard.
* Browser/window commands such as Cmd+Q, Cmd/Control+W, reload, address-bar focus, browser history/back, printing, preferences, zoom and developer tools. `preventDefault()` is useful only when the browser dispatches a cancelable event to the page. A DOM-dispatched synthetic event cannot prove that a physical shortcut reaches Tree.
* macOS non-Latin layout, Windows/Linux AltGraph and dead keys, IME composition and native word/line movement. Preserve OS text-editing behavior in standard/Insert modes and suspend Vim assembly during composition.

This is a risk list, not a list of confirmed inaccessible keys. P1 must produce a browser/OS/key/mode table marking verified, conflict, proposed equivalent and owner decision. Do not label unexplored conflicts as accepted exceptions. Preserve native focus traversal outside an editor. Do not capture browser shortcuts globally when focus is in browser chrome or outside Tree.

Keyboard Lock is not a baseline solution: Chrome documents its fullscreen requirement, and it does not supply a cross-browser ordinary-tab guarantee. Do not require fullscreen, a browser extension, PWA installation or enterprise-policy relaxation to obtain Vim parity. [Chrome Keyboard Lock documentation](https://developer.chrome.com/docs/capabilities/web-apis/keyboard-lock).

### Clipboard

Use trusted `copy`, `cut` and `paste` events for ordinary shortcuts and native menu actions. Translate text/HTML links/PNG into the existing application commands; preserve image precedence and all attachment limits from Product. Never render clipboard HTML directly or fetch remote images referenced by it. Copy/cut must not silently become plain-text-only when the current contract preserves links.

Vim yanks need asynchronous clipboard writes because `y` is not a native Copy command. Start privileged access inside the original user gesture; prepare image payloads with a promise-backed `ClipboardItem` where supported instead of awaiting storage and then losing activation. Verify real Safari prompts, permission denial, unfocused page behavior, missing images, and write failures. Native Paste remains the alternative entry path when a script-triggered read is denied; explain the action without changing the document prematurely. Safari's activation and paste authorization rules are documented by [WebKit Async Clipboard](https://webkit.org/blog/10855/async-clipboard-api/) and the [User Activation API](https://webkit.org/blog/13862/the-user-activation-api/).

The local Vim register is independent of the system clipboard. Existing Product §20.2.22 already specifies external clipboard failure without reverting `dd` or losing the register. Reuse that rule; do not remove external yanks or redefine them as local-only. The current system clipboard contract is text/HTML or an image, not serialization of a whole Tree subtree; subtree/forest registers remain local. Any newly discovered failure to meet an ordinary clipboard operation requires a concrete proposal and owner decision. The [Clipboard specification](https://www.w3.org/TR/clipboard-apis/) is a baseline; implementation-specific support must be tested.

## 5. Local storage, reliability and isolation

### Proposed backend and save contract

Recommend IndexedDB for the browser document, retained recovery generations, image Blobs, preferences and format metadata. It works independently of Service Worker and supports transactional updates across object stores. Avoid localStorage for document snapshots: it is synchronous and lacks the needed multi-record transactions. OPFS would still need recovery/metadata coordination and adds lifecycle complexity; do not choose it merely to imitate desktop files.

Keep the domain document and stable node identities unchanged. The physical database layout is an architectural decision, not determined by the choice of IndexedDB. P1 compares complete snapshots with an incremental recovery journal/checkpoint or structurally shared records on existing scale fixtures before fixing the layout. Recommend the simplest layout that meets the same responsiveness and retention goals. Do not ship full-document serialization on each input event if measurements show stalls or excessive writes; do not silently introduce a normalized domain model to fix that cost.

Required transaction rules for either layout:

1. Acquire writer ownership before initializing, loading into an editable session, recovering/promoting a generation, migrating, or writing preferences that participate in the session.
2. Validate untrusted persisted state, format versions and attachment identifiers. Distinguish absent records from stored invalid/null values. Read candidates newest first; recover a valid older generation only under the agreed recovery contract, preserving evidence of failure.
3. Initialize the sample and initialization metadata atomically only after a successful empty-store read. An abort must leave no misleading initialized-empty marker. Existing metadata, orphan records, read errors or an unsupported schema require recovery/error handling, not sample creation. A deliberately blank saved document remains blank.
4. Capture an immutable revision for each save. Resolve success and advance the saved watermark only on transaction `complete`, not individual request success. Edits during a save stay pending and are included in a later transaction. Avoid unrelated `await` calls while an IndexedDB transaction is active.
5. Commit the document/generation pointer and any new required image records atomically where practical. If images are staged first, commit their bytes before publishing references and collect abandoned staged images later. A failed insertion never publishes a broken reference as success.
6. Abort/quota/serialization/connection errors preserve the previous committed document. Retain unsaved in-memory work, surface errors, and apply the agreed retry/lock policy. Never claim that the last saved copy is safe after observed deletion or an unreadable store.
7. Keep image references from the current document, runtime undo/redo, retained recovery generations and in-flight saves. Delete only unreachable attachments after successful persistence; cleanup failure is distinct from save failure. Keep Blob and object-URL lifetimes bounded.
8. Request `durability: 'strict'` for irreplaceable records where supported and measure its cost. Treat it as a browser durability hint, not hardware backup or a guarantee against data loss. See the [IndexedDB transaction specification](https://www.w3.org/TR/IndexedDB/#transaction-concept) and [Chrome durability explanation](https://developer.chrome.com/blog/indexeddb-durability-mode-now-defaults-to-relaxed).

The desktop autosave policy and controlled quit are recorded in Product §16. Browser timers can be throttled, tabs discarded, and the process terminated without a final callback. Lifecycle flush is additional protection, not the persistence design. D1 proposes short, bounded-while-active batching of recovery writes, plus coarser validated recovery checkpoints if needed for scale, and explicit saved/pending/error state. The exact interval, bytes written and draft representation require P1 measurements and approval; no number here is an unmeasured durability promise.

Include DOM-buffered Replace, Insert/composition text, pending cut/paste and attachment work in the assessment. Persisting a draft must not split Vim undo sessions, synthesize Escape, or claim an uncommitted composition is a completed document command. Define and test restart treatment of any durable draft explicitly. There is no browser API that guarantees arbitrary asynchronous work finishes at close. [Chrome Page Lifecycle](https://developer.chrome.com/docs/web-platform/page-lifecycle-api) and [HTML beforeunload](https://html.spec.whatwg.org/dev/browsing-the-web.html) explain these limits.

### Storage permission and truthful UX

Call `navigator.storage.persisted()` and request `persist()` at an appropriate user-visible startup/interaction point. A false result or rejected request leaves the usable editor available when storage works, with understandable retention information. Do not repeatedly prompt or infer persistence from successful writes. Use `estimate()` for approximate usage/headroom, not a capacity guarantee or reliable disk-full precheck.

Distinguish storage access blocked, quota exhausted, read corruption, unsupported schema, connection/version change, persistence request denied and unavailable offline package. Do not offer "clear all data" as routine troubleshooting. Where data cannot be safely loaded, explain and preserve it; where persistence is unavailable, do not silently run an apparently saved editor backed only by memory.

WebKit describes quota, storage pressure, inactivity eviction and heuristic persistence grants in [Updates to Storage Policy](https://webkit.org/blog/14403/updates-to-storage-policy/). Its earlier [tracking-prevention policy](https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/) describes inactivity in days of Safari use; do not turn that historical rule into a universal calendar-time guarantee or claim that this app is exempt. The [Storage Standard](https://storage.spec.whatwg.org/) defines persistent storage behavior; explicit user clearing and profile deletion remain outside its protection. Persistent permission, cache readiness and verified saved revision are separate facts.

Private/ephemeral sessions may permit writes while clearing them at session end. There is no reliable universal private-mode detector; explain browser-local lifetime and do not claim detection. Complete eviction and a genuinely fresh profile can be indistinguishable after all local metadata is gone; the sample rule applies to observed genuine emptiness, not an invented ability to identify historical loss.

### One editing tab

Recommend an exclusive Web Lock with a stable, version-independent name for the local Tree document. Use `ifAvailable` to show the second-tab explanation promptly. Do not steal the lock, transfer it after a heartbeat timeout, or treat BroadcastChannel/localStorage notification as mutual exclusion. Web Locks explicitly warns that `steal` breaks the prior holder's exclusion assumptions. [Web Locks specification](https://www.w3.org/TR/web-locks/).

Keep the lock for the editing session. Every delayed save, clipboard result, attachment completion and migration must belong to the current session token. Before releasing ownership, make the old UI non-editable and drain or invalidate its queued operations. On `pagehide`, freeze/discard, BFCache `pageshow` and reconnect, verify ownership and reload current committed state before allowing more edits; a resumed stale page must not overwrite the new writer. Do not automatically relinquish a background tab just because its heartbeat stopped.

The blocked tab can retry after the first editor closes. It does not display a second editable document or offer forced takeover. Test simultaneous first launches, duplicate tabs, refresh, crash, suspended writer, BFCache return, stale async image writes and mixed application versions. If Web Locks is unexpectedly blocked in a supported configuration, fail safely and raise the supported-behavior decision; an unreviewed lease fallback must not weaken the one-editor requirement. P1 must establish whether this is a real supported-environment issue before proposing a new exception.

### Origin isolation and network privacy

The security boundary is the exact HTTPS origin, not the URL path or repository. IndexedDB is keyed by origin/storage partition. `tree-editor.github.io` is separate from `abtv.github.io`, other GitHub users' sites and the owner's personal domain. However, future organization project sites at `https://tree-editor.github.io/other-project/` would share Tree's origin and could access its storage. Reserve this origin for trusted Tree code; path names and a Service Worker scope do not create storage isolation. GitHub describes project-site URL placement in [What is GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages); the [Storage Standard](https://storage.spec.whatwg.org/) defines storage keys.

All executable code served at the origin, its dependencies and the release identity are trusted with local data. Same-origin script compromise and privileged browser extensions/OS administration are outside isolation from other websites; do not promise protection against the host browser itself. The application must not provide cross-origin storage RPC, wildcard message handling, document APIs or upload endpoints.

Keep assets, font and emoji catalog in the application package; no CDN runtime dependencies, analytics, error SDK, CSP reporting endpoint, remote image loads or network search completion. Allow only known app/update resource requests, with no document-derived query/body/path/header. Validate the network contract using real requests and synthetic secret markers; a CSP allowing `'self'` does not prevent accidental document text in same-origin URLs.

Use a browser-specific restrictive CSP with only the worker sources the app actually needs. Keep attachment previews on local Blobs, text escaped, clipboard/link inputs validated, and executable SVG/HTML excluded. The existing desktop policy forbids workers and cannot simply be copied. On GitHub Pages, do not assume custom response headers can be configured: the currently observed response lacks them. A meta CSP cannot enforce `frame-ancestors`; protect startup by refusing to open storage or mount the editor inside a frame, test hostile embedding, and use response frame denial if hosting actually supports it. Meta policies also do not automatically secure the Service Worker response. Review the worker's independent import/fetch behavior. [CSP specification, meta delivery](https://www.w3.org/TR/CSP3/#meta-element).

D3 covers external links, Google search, native Look Up and spellcheck. Google documents that Enhanced spellcheck sends typed text to Google, while Basic does not; a page cannot select a guaranteed local browser engine. Proposed controls include `spellcheck=false`, disabling automatic text assistance where supported, and `translate=no`; these do not control extensions or explicit browser actions. [Chrome spellcheck documentation](https://support.google.com/chrome/answer/12027911?hl=en).

## 6. Offline startup and safe updates

Use a separate Service Worker that owns application files only; it is not the document-saving owner. Keep document storage initialization independent of registration, Cache API writes and offline readiness. A denied or failed Service Worker install produces an understandable offline-unavailable state while the online editor continues when data storage works.

Recommended release lifecycle:

1. Build a versioned package with a source SHA/build identifier, content-hashed assets and a complete asset manifest. Include HTML, all editor/Agenda chunks, font, emoji data, styles, icons and offline entry resources, including assets not visited during first use.
2. Install into a new cache namespace. Reject installation if any required resource fails, is a 404 fallback, has the wrong version/type or fails integrity validation. Cache API writes are not a multi-resource transaction; only a verified complete package becomes eligible to activate. Never overwrite the active cache with a partly downloaded release.
3. Report offline readiness only after the complete package and registration/control state are confirmed. A first successful online render is insufficient. The first offline restart must work without requiring an online refresh. Any initial `clients.claim()` behavior must be deliberately limited and tested; it must not replace an existing editor's version.
4. Keep an update waiting while the old release has clients. No automatic `skipWaiting`, no forced reload on `controllerchange`. Recommend applying the next version after all old application tabs close; a future "update now" control is not necessary to meet this scope. If such a control is proposed, it must wait for pending edits/operations and obtain an explicit product decision.
5. Serve navigation and subsequent assets consistently from the client's complete release. For online-only clients without Service Worker, eagerly load all executable modules, styles, font and static data before declaring the editor ready; do not leave an unvisited Agenda, preview or completion module dependent on a future fetch of a retired chunk. This permits long editing sessions without inventing an expiry deadline. Preserve prior hashed server assets for startup/update overlap as well. CDN cache skew must not mix a new HTML/worker with absent chunks. Copying a new site over the old without retaining the previous bundle is unsafe. Test an open online-only editor after the server retires its old assets, exercising previously unvisited functions.
6. Remove obsolete application caches only after their clients no longer need them and a new complete release is active. Never delete document databases as cache cleanup. Limit retained packages and monitor quota headroom; do not keep every release forever.

This follows the waiting/activation model in [Chrome Service Worker lifecycle](https://developer.chrome.com/docs/workbox/service-worker-lifecycle) and the install failure semantics in the [Service Worker specification](https://w3c.github.io/ServiceWorker/). It does not imply choosing Workbox or a Vite PWA plugin. Recommend a small explicit worker and generated manifest initially; new dependencies need their own justified decision.

Storage-format compatibility is a separate update boundary. Use explicit application/database format versions; gate migration with writer ownership. Prefer backward-compatible/additive changes. A migration must preserve a last usable generation and complete transactionally or leave the old schema intact. Old tabs close database connections on `versionchange`, disable writing and explain what happened. A `blocked` upgrade must not delete the database or wait behind an editable second tab indefinitely.

An older cached application encountering a future format must stop safely rather than interpret it as corruption, open a sample, or promote an older recovery generation over newer data. A hosting rollback is not permission to downgrade a database destructively. Test old/new application coexistence, interrupted migration and rollback compatibility before release. No new public reset/recovery feature is implied.

Offline acceptance includes normal browser quit/restart with retained profile, first-ever offline launch after completed initial loading, reload, previously unvisited functionality, images, and app/update interruption. Network emulation in an already running page alone does not prove this. Cache eviction or explicit clearing can remove offline capability even if documents survive; report the distinction honestly.

## 7. Large-document performance

Reuse the current synthetic workload generators and scenarios from [perf/](../perf), including Tree typing/startup, wide-list navigation/expansion, counted Vim operations, node Visual commands, Agenda wide/deep/mixed dense/sparse data, completion, state/history, attachments and typing during save. Existing fixtures include large document and wide-sibling scales; the scenario definitions and budgets stay with their owning tests. Browser shipping scope retains those workloads.

Measure the following in visible branded Chrome and real Safari on controlled machines:

* Input-to-command and input-to-paint latency, caret/selection correctness, long tasks, view opening, scroll/windowed mounted-row bounds and startup/recovery time.
* Save request/transaction/commit latency, total records and bytes written, strict-durability overhead, write amplification from checkpoints/generations and time until the latest captured revision is durable.
* Main-thread serialization and structured-clone cost. An asynchronous IndexedDB method does not prove serialization leaves input responsive. Moving work to a dedicated worker also incurs cloning/transfer cost; measure before adding this process boundary.
* Heap/native memory where observable, document/history retention, image decode peaks, Blob copies, object URL/cache bounds and repeated edit/save/undo/cleanup cycles. Do not require Chrome-only memory/CDP APIs as Safari acceptance evidence.
* Peak quota usage during image insertion, generation rotation, update precaching and migrations. Cache and document stores share origin resources. A failed app update must not evict or delete document generations in an attempt to make room.

Retain current responsiveness goals and use current applicable test ceilings as an initial gate. Record same-machine desktop/browser comparisons and per-engine measurements; do not lower Safari or browser requirements to make a failing benchmark pass. If a workload misses the goal, investigate sharing/layout/storage costs and discuss a material tradeoff with the owner. CI machine noise and unsupported measurement APIs are evidence limitations, not permission to reduce the scale.

All state/persistence work includes the assessment in Product §22: writes/syncs or transaction equivalents, interactive CPU, memory growth and an automated scale guard. Prefer incremental invalidation, existing virtualization, immutable state sharing and bounded caches. A browser version is not complete if it merely passes small example documents.

## 8. Verification and CI

### Existing CI

* [ci.yml](../.github/workflows/ci.yml): push to `main` and pull requests; Ubuntu `npm run check` (static/governance checks, coverage, serial timing guards and desktop production build).
* [e2e.yml](../.github/workflows/e2e.yml): push to `main`, pull requests and manual; real Electron in six macOS shards, with aggregate `Electron E2E` status.
* [audit.yml](../.github/workflows/audit.yml): push to `main`, daily and manual dependency audit. This is separate from the check workflow.
* [performance.yml](../.github/workflows/performance.yml): scheduled/manual macOS performance; not a per-push release gate today. Property soak, mutation and shared-E2E memory have their own workflows.
* [demo.yml](../.github/workflows/demo.yml): publishes media after generation, without waiting for CI/Electron checks. It cannot satisfy the application publication requirement as written.

### Required future browser coverage

| Layer | Purpose and real-boundary requirements |
| --- | --- |
| Shared unit/property/component | Domain, history, structural transforms, serialization, command rules, Vim state and parser safety; keep one rule matrix |
| Adapter contracts | Transaction success/abort/watermarks, runtime input validation, generation/image retention, preference errors, session fencing and format compatibility; mocks complement real browser tests |
| Branded Chrome browser E2E | `channel: 'chrome'` on macOS, Windows and Linux, production browser build, isolated persistent profiles; clipboard/OS integration tested separately from synthetic fixtures |
| Playwright WebKit | Early engine regression signal for contenteditable, Selection, layout and storage; useful in PRs but never reported as Safari coverage |
| Real Safari | Apple Safari through `safaridriver`/WebDriver, plus actual shortcut/clipboard/lifecycle checks in an isolated ordinary profile when automation does not exercise them |
| Browser persistence/offline/security | Real IndexedDB and SW, failure injection at test/server boundaries, separate-origin attacks, allowed-network assertions and production artifact startup |
| Desktop regression | Existing full Electron functional suite for high-risk shared changes; focused/full performance selection according to affected costs |

Playwright explicitly distinguishes its patched WebKit from branded Safari and supports branded Chrome channels. See [Playwright browsers](https://playwright.dev/docs/browsers). Apple documents [SafariDriver setup](https://developer.apple.com/documentation/safari-developer-tools/macos-enabling-webdriver) and [WebDriver isolation](https://developer.apple.com/documentation/safari-developer-tools/webdriver): automation windows isolate browsing data and restrict ordinary manual interaction. A new WebDriver session is not evidence of persistence in an ordinary Safari profile across full browser restart.

P1 must verify Safari automation on the selected macOS runner, installed Safari version, remote-automation permission, profile/restart support and native keyboard/clipboard access. Enabling remote automation on an owner's machine may need their action; do not silently change it now. A Selenium/WebDriver client is a proposed development dependency requiring approval. An isolated preauthorized macOS runner is the preferred recurring solution if hosted runners cannot exercise the required boundary. Do not skip Safari while still claiming an automatically validated release.

Required failure/lifecycle cases include:

* Empty store/sample creation race; successful reopening of edited sample and deliberately empty document; read denial, malformed/latest-corrupt data, recoverable older generation, unsupported future version and no valid generation, without destructive initialization.
* Quota/transaction abort; save A while edit B arrives; failure retry and locked state; cleanup failure separate from save; attachment write before document publication; retained-history/recovery images; draft/Replace/composition and delayed paste across close.
* Two tabs racing for writer; blocked-tab explanation/retry; background/frozen/crashed writer; BFCache return and stale delayed callbacks; migration/versionchange while another tab remains open.
* Persistent request grant/denial/error; storage blocked at startup or revoked while editing; private/ephemeral session messaging; no fake in-memory saving.
* Service Worker absent/denied with online editing; complete initial offline startup after browser restart; partial first package; interrupted update; missing/corrupt asset; offline unvisited module; old editor during new deployment; cache/database quota contention; failed migration and rollback.
* Real text/HTML/image copy/cut/paste and Vim yanks; permission cancellation/denial; native context menu, browser focus/zoom and reserved shortcuts; light/dark screenshot inspection, caret geometry, font loading and flash-free startup.
* Another origin attempting IndexedDB access, cross-window messages and embedding; malicious clipboard/links; no remote document/usage/error traffic during success and failure. Hosted assets may be public through CORS without exposing IndexedDB; do not confuse the two.

Enterprise policies can block clipboard, JavaScript, storage, workers, persistence grants or URLs, or clear data at exit. Google documents [clipboard policy](https://chromeenterprise.google/policies/clipboard-allowed-for-urls/) and [data clearing at exit](https://support.google.com/chrome/a/answer/10686330?hl=en). Test representative denials, provide precise explanations, retain online operation when only Service Worker is unavailable, and never encourage a bypass. Policies outside Tree's control remain documented environment limits, with no automatic authorization to remove a feature.

No browser scripts or runners exist today. Proposed future workflow names include `build:web`, `test:web`, `test:web:safari` and `test:perf:web`; these are placeholders to define in P1/P2/P6, not commands that can currently be run. For implementation, apply High Risk validation under Development §9: `npm run check`, full local `npm run test:e2e`, and `npm run audit`, plus the new actual-browser boundaries and relevant performance suite. Reviewer and separate product verifier are required for shared-state/platform/persistence changes. Add inspected real-browser screenshots, while preserving required Electron evidence for common pixel changes.

## 9. Publication between repositories

Recommendation: build and validate in `abtv/tree`; hand a verified static package to `tree-editor/tree-editor.github.io`; deploy from a trusted workflow in the target repository using Pages Actions. Keep source/history in the source repository. Switch target Pages from branch publishing to Actions only in the explicitly authorized setup/release task.

Preferred trust and artifact flow:

1. A source push to `main` fixes source SHA S. Check out S explicitly for every required job. Build the browser package once; browser integration tests run against that package, with digest and S recorded. Desktop checks also correspond to S.
2. A stable release gate waits for standard CI, aggregate Electron E2E, required browser/real-Safari jobs, focused release-scale guards and the agreed security audit. Missing, skipped, canceled, timed-out or failed required jobs fail closed. Scheduled mutation/soak and full performance remain separate unless explicitly added; they are not falsely reported as checks of S.
3. Prefer reusable workflows with explicit dependencies in one release pipeline over an unqualified `workflow_run` listener. Existing CI jobs may be made reusable without dropping PR coverage. If separate-run aggregation is retained, match workflow identity, event, branch, SHA and attempt explicitly; success of one workflow is insufficient. Privileged jobs never consume untrusted PR code/artifacts. [GitHub workflow events](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows).
4. Only after the gate passes, a short-lived GitHub App installation token writes the static package under a dedicated target directory and a provenance manifest to target `main`, preserving its trusted workflow and README. Scope the App to target Contents write and Metadata read, without workflow administration; validate the publisher's path allowlist. The generated commit records source repository/S, source run and artifact digest. It contains no source rebuild instructions or user data. Target Git history stays append-only.
5. A target push by that App triggers the trusted target workflow. It verifies provenance, package contents/digest and the required source results for S, then uploads the already tested directory with `upload-pages-artifact` and deploys it with `deploy-pages`. Do not execute code from the transferred directory or rebuild from a moving source branch. The publishing identity is trusted to deliver the bytes it records; a digest alone does not authenticate an untrusted sender.
6. Serialize the target deployment through a single concurrency group. Recheck source-head/provenance and target candidate before switching publication so an older delayed run cannot replace a newer release. Prefer skipping superseded source candidates. Cancel superseded preparation, but do not depend on cancellation of an in-flight deployment for correctness.
7. Transfer, verification or deployment failure leaves the active Pages release unchanged. Preserve the last good release artifact and required older assets; do not clear the site first or allow legacy branch publishing to expose an unverified candidate. After success, verify hosted app/update resources and record the deployed S in CI metadata. A post-deploy defect needs a compatible forward fix or verified rollback; do not pretend pre-deploy checks can prevent every defect.

The App requires one-time creation/installation and protected secret setup by the owner; those operations are not authorized now. The source job's normal `GITHUB_TOKEN` is repository-scoped and cannot be assumed to write the other repository. An App-triggered push can start a target workflow, whereas a normal `GITHUB_TOKEN` push generally cannot. See [GitHub token scope](https://docs.github.com/en/actions/tutorials/authenticate-with-github_token), [workflow triggering](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow), and [GitHub App authentication](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/making-authenticated-api-requests-with-a-github-app-in-a-github-actions-workflow).

An alternative is target dispatch plus artifact download, but cross-repository artifact access needs separately authorized credentials, not a public URL assumption; see [download-artifact cross-repository permissions](https://github.com/actions/download-artifact). A fine-grained PAT restricted to the target is simpler to create but is tied to a person and requires explicit expiry/rotation management. Prefer the App's short-lived tokens and narrower installation boundary; owner decision D5 covers the operational obligation.

Target deploy permissions are `contents: read`, `pages: write`, `id-token: write` with a trusted `github-pages` environment and branch restrictions. Source tests never receive publication secrets; only the gated publishing job does. Pin third-party Actions appropriately and review transferred-file paths/symlinks and archive contents. These follow [custom Pages workflow requirements](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).

Automatic successful publication does not mean automatic replacement of an open editor. Server deployment and browser Service Worker activation remain separate mechanisms. No public preview or staging editor may share production Tree storage accidentally. Local and separate-origin test deployments use only synthetic data.

## 10. Accepted recommendations and reserved details

The owner accepted recommendations D1–D5 on 2026-10-17 and authorized P1 experiments only. The recommendation column below records that accepted direction; the alternatives and explicit unresolved details remain decision boundaries. In particular, D2 is not blanket acceptance of undiscovered shortcut or platform exceptions. No minor requirement gaps were resolved on the owner's behalf. Accepted constraints in §1 need no renewed approval.

| ID | Recommendation and material tradeoff | Alternative / decision boundary |
| --- | --- | --- |
| D1: Browser save and close contract | Short batched recovery writes during active editing, explicit pending/saved/error state, lifecycle flush as additional protection, optional browser warning while unsaved. Confirmed transactions are the recovery boundary; no guaranteed final close flush. Preserve Vim session semantics and define pending draft recovery after P1 evidence | Keeping desktop triggers retains a larger unsaved window and still cannot guarantee close flush. No browser implementation may claim desktop-controlled shutdown. Choose the product contract before P3/P4 |
| D2: Platform and shortcut equivalence | Keep literal Vim Control keys; use platform command modifiers for application actions. Cmd+Q belongs to the browser; Tree `quit` flushes and explains that the tab can be closed. Browser controls window geometry. Keep theme/Vim/view commands reachable inside Tree; propose the closest browser context-menu behavior | Native application menus, Look Up, exact window geometry restoration and tab closure are additional gaps beyond the two accepted exceptions. P1 verifies actual conflicts, then present each failed requirement/equivalent before accepting a deviation; do not approve unspecified future exceptions in bulk |
| D3: Local-only privacy versus native helpers | No Tree-triggered Google search or network-capable Look Up; disable browser spellcheck/text assistance where controllable. Keep HTTP(S) links only on explicit user action, with `noopener`/`noreferrer`, no automatic preview or document referrer | A stricter option also disables external opening. Preserving helpers would require an explicit narrow user-initiated disclosure exception, inconsistent with treating all current desktop helpers as automatically allowed. Basic versus Enhanced spellcheck cannot be selected reliably by Tree. Decide before browser UI requirements |
| D4: Browser support lifetime | Current and previous stable release families for Chrome and Safari on their supported desktop OSes, with version evidence in CI; Safari release family is distinct from a patch update | Current stable only reduces compatibility work; broader/enterprise-pinned versions increase regression and API-support obligations. Record minimum tested versions when P1 establishes actual availability; do not invent an OS matrix from “desktop” alone |
| D5: Architecture and release authority | Shared editor with narrow adapters; IndexedDB/Blob storage and Web Locks; dedicated app-only SW; exact physical storage layout after P1; GitHub App handoff to target Actions | Direction accepted; physical layout remains open. App creation/secrets, a Safari test-client dependency or dedicated runner require explicit later setup. Acceptance does not authorize implementation, installation of a maintained dependency, or publication |

If literal keys prove unavailable, clipboard/image behavior cannot be preserved, Web Locks is denied, or measurements invalidate the storage proposal, bring the concrete new finding and closest behavior back to the owner. Do not treat an unanswered capability probe or platform documentation as owner approval to reduce requirements. Additional questions are conditional on those findings, not speculative decisions to ask now.

## 11. Proposed tasks and acceptance gates

P1 alone is authorized for temporary technical verification. It remains incomplete; the partial findings below are not a shipping acceptance result. Other tasks remain `Planned`; accepting D1–D5 does not authorize full implementation. This plan update is independently deliverable with Minimal Risk documentation validation.

| Task | Outcome, expected files and dependencies | Acceptance evidence and validation | Status |
| --- | --- | --- | --- |
| P0 | Record decisions D1–D5, outstanding parity gaps and implementation authorization/budget here. Then update relevant Product/Architecture/Security requirements and accepted ADRs under `docs/decisions/` | Owner decisions explicitly distinguished from recommendations; documentation checks. Requirements preparation alone is Minimal Risk | Planned |
| P1 | Authorized temporary capability and scale experiments in `.scratch/browser-feasibility/`; update this plan without changing shipping source, dependencies, settings or publication. P0 decision recording is satisfied by owner acceptance; requirements/ADR finalization is deferred | Real Chrome target matrix and SafariDriver preflight; ordinary-profile restart, trusted keys/clipboard, persistence/SW policy trials; save/clone/latency/bytes/memory measurements on existing large workloads. Partial probes below do not satisfy every gate. Resolve storage ADR before P3 | In progress: Chrome/macOS storage/quota, ownership/lifecycle, update/recovery, images, headless clipboard and CSP worker denial have passing evidence. Frozen-writer verification blocked; native input/OS clipboard, real-editor scale and full feasibility gates unverified. Owner will check Safari manually later |
| P2 | Shared platform ports and composition: `src/application/editor-store-types.ts`, `src/shared/ipc.ts`, `src/renderer/main.tsx`, `App.tsx`, command-panel/input/lifecycle owners, attachment cache, existing Electron services; proposed browser entry and Vite config. Depends on P0 and P1 architecture findings | Desktop behavior unchanged; browser bundle contains no Electron/Node runtime imports, no editor fork; port contracts, full Electron functional validation and relevant shared-rendering/performance evidence. High Risk; independent reviewer | Planned |
| P3 | Browser data safety: proposed `src/infrastructure/browser/` IndexedDB/generation/attachment/preference/session modules, initial sample fixture, application persistence seam and tests. Depends on approved physical-layout ADR, P2 and D1 | Atomic saves/sample, valid recovery, safe quota/abort, draft semantics, image reachability, one writer across race/crash/BFCache and schema versions; real browser persistence/restart tests plus scale guards. High Risk; reviewer and separate product verifier | Planned |
| P4 | Complete browser interaction parity: shared input/command owners plus browser clipboard/lifecycle/link/context-menu adapters, OS labels and platform styles. Depends on P2/P3 and approved D2/D3 dispositions | All current product capabilities mapped, full Vim including system yanks, Tree/Agenda/normal editing and real clipboard/keyboard matrix; inspected browser/Electron visual states. High Risk; reviewer and separate product verifier | Planned |
| P5 | Offline and updates: proposed worker, generated asset manifest, version/cache owners, browser build and integration specs; schema compatibility co-owned with P3. Depends on P3/P4 | Full initial offline browser restart, denied SW online operation, interrupted install/update, active old editor, asset/CDN skew, cache quota and migration/rollback tests; bounded storage/performance. High Risk; reviewer and separate product verifier | Planned |
| P6 | CI and reviewable publication preparation: `package.json`, test configs, proposed browser/Safari CI jobs and stable release gate in `.github/workflows/`, gated transfer tooling, deployment/operations documentation; target workflow proposed for `tree-editor/tree-editor.github.io` only after explicit target-edit authorization | Same-SHA/artifact checks, wrong SHA/digest/origin, missing/canceled job, transfer failure, races and old-release preservation exercised with synthetic fixtures. Real Chrome/Safari gate executes; secrets absent from PR jobs. No publication yet. High Risk when executable toolchain/security changes; independent review | Planned |
| P7 | Explicitly authorized hosting setup and first publication: target Pages Actions mode, App installation/secrets/environment and verified package, then actual-origin acceptance. Depends on P6 passing, owner setup and publication approval | HTTPS-origin storage/network/security, offline ordinary browser restart, update failure retaining prior package, successful unattended same-SHA deployment and failure preserving deployed version. Test only synthetic documents. High Risk; reviewer/product verifier, selected release performance and full functional boundary checks | Planned |
| P8 | Final owner acceptance and closure. Depends on P7 and all parity decisions satisfied | Keep plan/index `Awaiting owner acceptance` after delivery. On acceptance of the unchanged delivered commit, move lasting knowledge to its owners and retire this plan/index entry. Do not archive a validation log | Planned |

The substantive working-task count is seven (P1–P7); administrative preparation/acceptance/retirement are not used to avoid the final acceptance rule. Split P3/P4 further if necessary for reviewable logical commits, updating the count and budget. Never combine unrelated changes merely to meet a task count.

Suggested planning allowance, not an accepted execution budget: P0 plus P1–P7, up to two failed recovery attempts per unchanged blocker, at most four initiative task commits per primary session under repository policy, and a separate closure task allowance. P1 should refine implementation effort and runner cost from actual evidence before the remaining implementation is authorized. Do not promise a calendar estimate without the shortcut, storage and Safari results.

## 12. Owner involvement and continuation

Expected decision/setup/acceptance rounds:

| Round | Concrete owner action | Timing and capability status |
| --- | --- | --- |
| Initial decisions | D1–D5 accepted; temporary P1 prototypes/tests and plan update authorized | Completed 2026-10-17. Full implementation and publication withheld; implementation budget remains unapproved |
| P1 capability decision | Owner installed Chrome and chose Chrome-only verification. Safari remains deferred; later supply target runners before claiming the full matrix | Chrome/macOS runtime verified. No Safari action needed for current scope. No settings changed; future runner setup remains subject to authorization |
| Publication setup/approval | Create/install the chosen App or approved alternative, authorize protected secret/settings changes and first publication; approve target-repository edits | Required for P7, grouped after P6 produces reviewable artifacts. No credentials are requested during research |
| Final acceptance | Assess the delivered commit and result against agreed parity, privacy, offline and reliability criteria | One planned final acceptance round after implementation; separate from pre-commit verification |

The partial P1 findings below refine the native-browser verification obligation. Other unknowns are Safari CI automation, usable Windows/Linux runners, physical storage layout performance and App secret permissions; report newly required owner checks promptly.

### P1 findings (2026-10-17; partial, synthetic probes)

Source snapshot: `fceee5f`, initially clean. No shipping source, package metadata, CI, target repository, browser settings or ordinary profiles changed. Temporary probes and browser downloads are retained in `.scratch/browser-feasibility/` for unfinished P1. Exact commands/results and limitations are in its `evidence.md`; this is temporary continuation evidence, not a permanent validation archive.

* `/usr/bin/safaridriver --version` reports Safari 26.6.2. An actual WebDriver session request returned HTTP 500, `session not created`, requiring “Allow remote automation” in Safari Settings. Installed Safari is not verified Safari automation. Do not enable the setting silently or substitute Playwright WebKit for Safari.
* Branded Chrome launch failed because `/Applications/Google Chrome.app` is absent. Windows/Linux and previous stable browser families remain unavailable/unverified. Downloaded Playwright Chromium 153.0.8010.12 and WebKit 26.6 into the scratch directory; no project dependency added. These are engine probes, not the D4 support matrix.
* In headless Chromium, real IndexedDB strict-durability transactions passed explicit assertions: an aborted update preserved both the previous revision and Blob bytes. Web Locks rejected an `ifAvailable` request while a lock was held and allowed reacquisition after release. This is a same-page API probe, not cross-tab/crash/BFCache session-fencing verification.
* Chromium installed a tiny app-only Service Worker and reloaded its cached page with the context offline. No ordinary-profile browser restart, interrupted update, complete Tree package, SW-denial policy or hosted-origin test was performed.
* Playwright WebKit failed the combined storage probe with `UnknownError: Error preparing Blob/File data to be stored in object store`. The first run stalled; a bounded follow-up exposed this error. The cause is unresolved: do not infer that real Safari cannot store Blobs, weaken image parity, or choose a replacement backend.

  The subsequent isolated probe passed string insert/read and aborted string replacement, then failed at the first Blob insert with the same error (exit 1). Blob read and aborted replacement were therefore not reached. Further equivalent retries have no new evidence; next investigate the test-engine environment and compare on an owner-approved real Safari runner.

Single-run Chromium wide-tree measurements (shape reproduced from `perf/fixtures.ts` `wideSeed`, not the full editor):

| Child nodes | Logical JSON bytes | JSON serialization | Snapshot enqueue / transaction complete | Checkpoint enqueue / complete | Five individual delta transactions |
| --- | --- | --- | --- | --- | --- |
| 10,000 | 487,832 | 0.4 ms | 1.2 / 1.7 ms | 0.9 / 1.3 ms | 0–0.2 ms each |
| 100,000 | 5,077,832 | 3.8 ms | 12.3 / 15.9 ms | 11.7 / 15.2 ms | 0.1–0.2 ms each |

Enqueue measures synchronous `put` work; completion is elapsed since transaction creation. Logical JSON bytes are not physical disk writes. The delta probe stores a changed node and head only; it has no validated replay, checkpoint rotation, recovery or attachment reachability implementation. These measurements justify further comparison, not selection of a physical layout, autosave interval, worker or responsiveness budget. Strict durability is an API hint; no crash/power-loss durability claim was tested. No editor input-to-paint, visible-browser timing, desktop baseline, retained-history memory or full Agenda/deep workload measurement exists yet.

Shortcut/clipboard disposition remains explicit: literal Vim Control keys, application Cmd/Control actions, browser-reserved commands, native context menus, IME/dead keys/AltGraph and trusted text/HTML/image operations are **unverified on every target browser/OS**. No failed key has been accepted as a new exception. Persistent-storage grant behavior, quota pressure and policy denial also remain unverified (`persisted()` returned false in the disposable Chromium context; `persist()` was not requested).

Owner involvement is now at least one capability/setup decision before Safari verification, plus one grouped native-browser verification round before P1 acceptance if no runner can exercise physical keys, clipboard prompts and ordinary-profile restart. That round blocks dependent P3–P5 acceptance: use isolated synthetic data; verify literal Vim keys reach the page, trusted clipboard operations retain text/HTML/images or expose honest denial, and completed offline installation survives browser quit/restart. Automation used here cannot establish those results. This adds verification access work, not a relaxed product constraint. Publication setup and final acceptance rounds remain separate.

### Chrome-only continuation results

Starting snapshot `ae784d7`, clean worktree. `node .scratch/browser-feasibility/probe.mjs chrome` launched installed Google Chrome **155.0.8059.85** on macOS and passed explicit assertions for document/Blob transaction rollback, same-page lock exclusion/reacquisition, Service Worker readiness and offline reload. This supersedes the earlier local Chrome-unavailable finding; no Safari/WebKit probe was rerun.

`node .scratch/browser-feasibility/chrome-lifecycle.mjs` exited 0 with assertions passing for:

* Two real tabs in one isolated persistent profile: the second tab could not acquire the writer lock while the first held it, and acquired it after the first closed.
* Closing the automated Chrome process, relaunching with the same scratch-owned profile, and navigating offline to the cached test page. The server also refused network connections during reopening.
* Reading the committed document revision and exact Blob bytes after restart; the reopened page was controlled by its retained Service Worker.

Single-run branded Chrome measurements on the same wide-tree probe shape:

| Child nodes | Logical JSON bytes | JSON serialization | Snapshot enqueue / transaction complete | Checkpoint enqueue / complete | Five individual delta transactions |
| --- | --- | --- | --- | --- | --- |
| 10,000 | 487,832 | 0.6 ms | 1.2 / 1.8 ms | 1.2 / 1.7 ms | 0–0.3 ms each |
| 100,000 | 5,077,832 | 4.8 ms | 13.2 / 17.0 ms | 12.7 / 16.5 ms | 0–0.2 ms each |

These are headless localhost mechanism probes, not a browser Tree implementation, an editor performance comparison or a physical layout decision. Logical bytes are not disk writes; delta replay/rotation remains unimplemented. Persistent-profile process restart provides stronger evidence than the earlier context reload, but does not establish ordinary interactive-profile or browser UI behavior. Graceful tab/process closure is not crash, freeze or BFCache testing. Real image decoding, trusted clipboard/native keys, interrupted updates/migrations, storage pressure/policy denial and previous-version/Windows/Linux coverage remain unverified. The cached package contains only a test page, not Tree's assets. No new product constraint or parity exception was accepted. Safari's automation blocker and WebKit's Blob failure remain unresolved, outside this continuation's execution scope.

### Chrome recovery and failed-update continuation

Starting snapshot `8164211`, clean worktree. `node .scratch/browser-feasibility/chrome-recovery.mjs` exited 0 in branded Chrome **155.0.8059.85**, headless on macOS, with a new isolated context and synthetic localhost data. Earlier unchanged Chrome locking and persistent-profile restart results were reused. No Safari/WebKit execution, shipping changes or maintained tooling were needed.

The temporary comparison layout stores a checkpoint, a revision head and ordered text-replacement deltas. On both 10,000 and 100,000 child-node shapes from `wideSeed`, explicit assertions verified:

* Twenty committed deltas reconstruct the complete expected document, including unchanged node identity/order/content.
* Aborting checkpoint rotation after the final IDB request succeeds rolls back the new checkpoint/head and journal deletions; the previous journal still reconstructs the expected document.
* Successful rotation reconstructs the same document, removes compacted deltas and preserves the previous checkpoint unchanged.
* A missing middle delta and unsupported format are rejected by the experimental recovery function. Neither case is treated as empty or initializes a sample. This is a toy function check, not production recovery or migration wiring.

Final-run measurements (single samples, no editor mounted):

| Child nodes | Explicit structured clone | Checkpoint enqueue / complete | IDB read-all | Replay including clone | Rotation enqueue / complete | Maximum of 20 delta enqueue / complete |
| --- | --- | --- | --- | --- | --- | --- |
| 10,000 | 2.2 ms | 1.2 / 2.0 ms | 1.9 ms | 3.3 ms | 1.5 / 2.4 ms | 0.1 / 0.3 ms |
| 100,000 | 26.4 ms | 11.5 / 15.1 ms | 17.6 ms | 28.5 ms | 14.1 / 25.0 ms | 0.1 / 0.2 ms |

Enqueue is synchronous; complete is elapsed from transaction creation, not additional time. Read-all includes delivery of cloned records. These timings expose whole-document CPU costs that must be evaluated against real input responsiveness before choosing a layout or worker boundary. They do not select an autosave interval, prove bounded latency/memory, measure physical writes or cover deep/Agenda workloads. The probe retains one old checkpoint; arbitrary structural operations, validated fallback from a corrupt checkpoint, attachment reachability/GC, concurrency with incoming edits and production replay are not implemented.

`navigator.storage.persist()` resolved `false`, as did `persisted()`, without preventing IDB operations in this disposable context. This verifies an actual refusal result, not grant behavior, enterprise policy, quota exhaustion or a user-facing denial flow. The reported storage estimate was 2,174,976 usage bytes; it is an origin estimate, not a disk-write counter.

A real Service Worker cached test package v1 (page plus asset). A v2 worker then attempted installation while its required asset returned HTTP 503. Assertions verified that the candidate became `redundant`, the open page remained v1, and v1 page/asset still loaded after switching the browser offline and making the server refuse connections. This tests failed installation with a server error; it does not cover process interruption during download, cache cleanup, successful waiting-worker activation, mixed deployment assets, quota contention, schema migration or a full Tree package.

No new constraint or parity exception was accepted. P1 remains partial. The owner explicitly plans manual Safari verification later; do not request Safari setup or run Safari/WebKit as part of the current Chrome continuation. Preserve the existing native-key/clipboard and support-matrix gates.

### Chrome retention, concurrent-save and waiting-update continuation

Starting snapshot `c110954`, clean worktree. `node .scratch/browser-feasibility/chrome-retention-update.mjs` exited 0 in branded Chrome **155.0.8059.85**, headless on macOS, with an isolated context and synthetic localhost data. Chrome initially failed to launch inside the Codex sandbox; the supported outside-sandbox invocation then ran all assertions successfully. Earlier unchanged probes were reused. No Safari/WebKit execution or shipping changes occurred.

Real IndexedDB transactions and reads verified these experimental mechanisms:

* A deliberately malformed newest generation selected the older valid generation without overwriting the head or corrupt record. Missing attachment bytes also disqualified a generation. An all-invalid store was rejected rather than treated as empty; an unsupported newest format was rejected rather than silently downgraded.
* Cleanup retained images referenced by either retained generation or an explicit synthetic undo reference. Aborting after a deletion request succeeded preserved its Blob. Successful cleanup removed the unreferenced Blob and retained exact bytes for both referenced images.
* Edit B was introduced in save A's request-success callback, before A's transaction completed. A's revision acknowledgment left B pending. An aborted B save preserved committed A and the pending revision; a subsequent transaction committed B.

The fallback validator checks only toy text/format/attachment fields. It does not implement Tree validation, user-facing recovery/promotion policy, journal fallback, migration, or recovery after actual corruption/crash. The cleanup experiment marks a small explicit reference set, reads it before opening its deletion transaction, and has no concurrent reference changes; it does not prove safe production GC, undo-history integration, image decoding, stale async write fencing, or bounded memory. The save experiment models revision acknowledgments; it does not exercise a mounted editor, autosave scheduling, real close/termination, or input responsiveness. No production schema or policy was selected.

A real Service Worker cached a two-resource v2 package and remained waiting while two v1 tabs were open. Reloading one tab offline still returned v1 page and asset. Closing only one client left v2 waiting. After closing the final v1 client, v2 activated and a new tab loaded v2 page and asset with both browser networking disabled and server connections refused. There was no `skipWaiting` or forced page reload.

The v2 activation handler deliberately threw and caught a JavaScript error before deleting old caches. Activation still completed, the worker reported that failure, and both v1/v2 caches remained. This verifies the experimental handler's error path and continued package usability, not an actual CacheStorage deletion rejection, storage-pressure/quota condition, process interruption, or safe bounded cache retention. The package contains no Tree assets and no schema transition. Worker restart/retry of cleanup remains untested.

No new constraint, recovery policy or parity exception was accepted. P1 remains partial; full support-matrix, native input/clipboard, real-editor scale and lifecycle gates remain open. The deliverable is a plan update with Minimal Risk documentation checks; scratch mechanisms remain disposable continuation evidence.

### Chrome ownership, database upgrade and interrupted-update continuation

Starting snapshot `6269e1a`, clean worktree. Both temporary commands exited 0 with explicit assertions in branded Chrome **155.0.8059.85**, headless on macOS:

* `node .scratch/browser-feasibility/chrome-ownership-upgrade.mjs`
* `node .scratch/browser-feasibility/chrome-interrupted-update.mjs`

Both ran outside the Codex sandbox through the supported approval mechanism. Data was synthetic, localhost contexts/profiles were isolated under scratch, and browser/server teardown completed. Earlier unchanged probes were reused. No shipping code, dependencies, settings, Safari/WebKit execution or publication changed.

The ownership/upgrade experiment verified:

* With one tab holding the stable writer lock, a second tab's `ifAvailable` request failed. Aborting sample initialization after its metadata request succeeded left all three toy stores empty, including document and Blob records.
* After release, two tabs requested that same lock concurrently. One initialized the empty data stores and the other loaded the committed sample. Text and Blob bytes agreed; a later initialization attempt did not replace the sample. A stored null initialization marker was rejected and preserved without creating a document.
* A delayed image completion retained the old session token. The old session was explicitly invalidated before releasing its lock. After the other tab acquired ownership and committed its document, the delayed callback opened zero write transactions, created no Blob and preserved the new writer's text.
* A deliberately retained old database connection received `versionchange` and the experimental editable flag became false. The upgrade emitted `blocked` until that connection closed. Aborting an upgrade after a data-write request succeeded preserved both v1 schema and exact prior text; the added store disappeared. A subsequent additive upgrade succeeded after the reopened old connection disabled editing and closed automatically. An explicit v1 open then failed with `VersionError`.

These are toy adapters and explicit cooperative lifecycle handling, not Tree integration. Empty-store initialization uses pre-created schema stores, not a simultaneous first-ever schema creation race. Session invalidation was commanded by the driver, not triggered by crash, freeze, BFCache or actual lock revocation. It guards a callback before transaction creation; it does not prove safe draining of already-started writes, real decoding/clipboard completions or enforcement by Web Locks alone. The migration is a synthetic additive store change; `blocked` is observed, but no production timeout, UI, migration or recovery policy was selected.

The interrupted-update experiment used a new persistent scratch profile and real network responses. A v2 worker cached its page, then remained `installing` while its required asset response was held unfinished. The entire automated Chrome process closed at that point. With browser networking disabled and the server refusing connections, reopening the same profile loaded the v1 page and exact v1 asset under the v1 worker. This extends the earlier HTTP-error probe to actual shutdown during an incomplete download; shutdown was graceful, not a crash or power loss.

Re-enabling the server/network and requesting the same v2 update succeeded. It waited behind the v1 client and activated after that client closed. Its first cleanup attempt deliberately recorded a marker and threw before deletion. Both complete caches remained and v2 worked. After another whole-browser restart offline, a distinct worker lifetime retried cleanup from the retained marker, removed only the obsolete v1 package cache and served v2 page/asset. Exact synthetic document Blob bytes in a separate IDB database and a separate unrelated cache entry survived. This tests an injected error and a toy retry mechanism, not an actual CacheStorage rejection, quota pressure, production cache ownership, manifest integrity, deployed assets or a full Tree package.

No new constraint, parity exception, schema or migration policy was accepted. The deliverable remains a plan update with Minimal Risk documentation checks. P1 remains partial; native input/clipboard, real-editor scale, actual crash/suspension and the full support matrix still need evidence.

### Chrome renderer crash, BFCache return and freeze limitation

Starting snapshot `884a5b3`, clean worktree. Temporary localhost experiments used branded Chrome **155.0.8059.85** on macOS outside the Codex sandbox through the supported approval mechanism. All records were synthetic. No shipping source, dependencies, installed browser settings, Safari/WebKit execution or publication changed.

The renderer-crash phase of `node .scratch/browser-feasibility/chrome-crash-freeze.mjs` passed its assertions. After a writer committed text and Blob bytes and a second tab failed to obtain its lock, `Page.crash` produced an actual Playwright renderer-crash event. The surviving tab acquired the same writer lock, read the exact committed text and image bytes, and completed a successor save. The command subsequently exited 1 in its freeze phase; that exit does not invalidate the earlier distinct crash assertions or count as a complete lifecycle-probe pass. No in-flight transaction, browser-process crash, power loss or full editor recovery was tested.

`node .scratch/browser-feasibility/chrome-bfcache.mjs` exited 0 with all assertions passing, headless. The disposable launch omitted Playwright's `--disable-back-forward-cache` default argument; it did not enable an experimental browser feature, alter installed settings or bypass enterprise policy. The first page released its lock, invalidated its session and closed IDB on actual `pagehide`. Another tab acquired ownership and saved new text. Navigating Back restored the original JavaScript lifetime and produced this observed sequence: initial `pageshow.persisted=false`, `pagehide.persisted=true`, `freeze`, `resume`, then `pageshow.persisted=true`.

On that actual BFCache return, the toy `pageshow` handler attempted reacquisition and left the restored page non-editable with no loaded text while the other tab still owned the lock. After that owner released it, an explicit retry acquired a new session token and read the other tab's exact committed text before enabling editing. Completing an image operation captured before navigation then returned `stale rejected`, opened zero new write transactions and left its Blob absent, even though the restored page now owned a new session. A further second-writer attempt remained excluded. This is explicit toy lifecycle wiring, not Tree integration, automatic retry UI, arbitrary in-flight write draining or proof that every history return uses BFCache.

Explicit frozen-writer verification remains **blocked**, separate from the observed BFCache freeze/resume events. `Page.setWebLifecycleState` returned successfully but did not deliver `freeze`: the document stayed `visible` and its interval continued advancing. Bounded follow-ups tried headed Chrome, removed Playwright's forced-focus emulation for the target tab, and tested an unlocked control. None exercised an actual frozen state. The command family exited 1 at its assertion in each case. Do not infer either frozen-writer safety or a Web Locks defect from these no-op transitions, and do not replace them with manually dispatched lifecycle callbacks. Exact variants and diagnostics are retained in scratch evidence. Further equivalent retries are exhausted; resume this branch only with new evidence about the automation/runtime limitation or a runner that demonstrates an actual freeze.

Inspection found the BFCache-disabling argument and forced-focus override in installed Playwright's `lib/coreBundle.js`. The experimental method and event interpretation were checked against the official [Page protocol](https://chromedevtools.github.io/devtools-protocol/tot/Page/), [Chrome lifecycle guidance](https://developer.chrome.com/docs/web-platform/page-lifecycle-api) and [BFCache guidance](https://web.dev/articles/bfcache), accessed 2026-10-17. These references informed the probes; they do not establish local runtime capability.

The plan update is a Minimal Risk documentation deliverable. Crash handover and actual BFCache/session-fencing mechanisms have passing evidence; frozen-writer verification and full P1 remain incomplete. No new policy, schema, parity exception or requirement was selected. Scratch is retained for continuation.

### Chrome PNG decoding and virtual-clipboard continuation

Starting snapshot `2d91ba5`, clean worktree. Both temporary commands exited 0 with all explicit assertions passing in branded Chrome **155.0.8059.85**, headless on macOS, outside the Codex sandbox:

* `node .scratch/browser-feasibility/chrome-images.mjs`
* `node .scratch/browser-feasibility/chrome-clipboard.mjs`

Existing installed esbuild bundled the current PNG guards and clipboard helpers in memory for these localhost experiments; no generated bundle was written to shipping source. Existing synthetic PNG fixtures were reused. Node printed a module-type warning when loading the TypeScript fixture helper; no package metadata was changed. No shipping code, dependency, installed browser setting, Safari/WebKit execution or publication changed.

The image experiment verified:

* `createImageBitmap` decoded the valid red and transparent fixtures, with asserted dimensions and canvas pixels. A structurally valid PNG with an invalid compressed stream reached the decoder and was rejected.
* The existing attachment validator rejected bad CRC, truncation, non-PNG content, excessive width and excessive pixel count before decoder invocation. A payload over the byte limit also never invoked the decoder. A separate toy early-Blob-size check rejected before `arrayBuffer()`; that check mirrors the existing clipboard rule and is not an actual oversized clipboard transfer.
* A transparent PNG Blob retained all 71 original bytes after an IDB write/read and decoded to the same pixels. A Blob URL loaded through `Image.decode()` at its natural dimensions; after revocation a new image could not load that URL. This does not measure long-running object-URL/cache memory or a mounted inline/preview UI.

The probe deliberately applies structural/size validation before separately awaiting browser decoding. The existing desktop decoder callback is synchronous; passing a Promise into that callback would not implement browser validation safely. No production asynchronous adapter, extraction boundary, performance budget or renderer-decoding policy was chosen. No full PNG-format matrix, near-limit decode allocation, concurrent real-editor input, browser restart or complete attachment lifecycle was tested by this probe; earlier storage mechanisms remain separate evidence.

Clipboard testing used headless Chrome's virtual clipboard. Official Chromium [headless startup](https://raw.githubusercontent.com/chromium/chromium/main/chrome/browser/headless/chrome_browser_main_extra_parts_headless.cc) and [clipboard implementation](https://raw.githubusercontent.com/chromium/chromium/main/components/headless/clipboard/headless_clipboard.cc), accessed 2026-10-17, identify this as platform-independent. Two separate headless processes retained different synthetic clipboard values in the runtime test. No headed clipboard operation or personal clipboard read was performed. This isolation is also why these results do not establish interoperability with the macOS clipboard or another native application.

In an isolated context with no permission override, the initial permission states were read `prompt` and write `granted`. Playwright-driven `Meta+C`, `Meta+X` and `Meta+V` invoked Chrome's default edit commands and produced browser-trusted clipboard events. Text and HTML hyperlink representations survived copy and cut; copy preserved the source and cut removed it. A trusted click with active user activation called `navigator.clipboard.write` immediately with a promise-backed PNG that resolved later, alongside text and HTML. The write succeeded, and a subsequent trusted paste event exposed all three representations, including the PNG file. The temporary paste handler captured data and prevented insertion; it did not mount Tree or render clipboard HTML.

After explicit permission grants, Async Clipboard reads returned text/HTML/PNG. The current shared clipboard helper selected the image representation; the PNG decoded to the exact red pixel, and hyperlink extraction preserved the expected URL range. The returned PNG had 87 bytes rather than the fixture's 70; assertions checked decoded pixels rather than assuming byte-preserving clipboard transport. Browser [clipboard documentation](https://developer.chrome.com/docs/web-platform/unsanitized-html-async-clipboard), accessed 2026-10-17, also describes PNG re-encoding. These granted reads are API evidence only.

In a separate context with an explicit denied permission override, both `readText()` and `writeText()` rejected with `NotAllowedError`; the earlier synthetic payload remained unchanged. This is a real browser rejection under a test override, not a clicked denial prompt, enterprise policy, unfocused-page behavior, Tree error UI, failed-cut preservation or Vim register/deletion integration. Browser-trusted events generated by Playwright do not prove physical shortcut delivery or ordinary-window browser-chrome behavior. The native-input, prompt and OS-interoperability gates remain open, with no new parity exception.

The plan/index deliverable is Minimal Risk documentation. Earlier passing mechanisms were reused, frozen-writer verification remains blocked, and P1 remains partial. Scratch is retained for continuation. No production schema, new constraint or product policy was selected.

### Chrome quota failure and CSP-denied Service Worker

Starting snapshot `2d42394`, clean worktree. `node .scratch/browser-feasibility/chrome-quota-offline-denial.mjs` completed with exit 0 and explicit assertions passing in branded Chrome **155.0.8059.85**, headless on macOS, outside the Codex sandbox. Data and contexts were isolated and synthetic; no shipping source, dependencies, installed settings, Safari/WebKit execution or publication changed.

The experiment saved a toy document and image Blob, then applied a temporary `Storage.overrideQuotaForOrigin` of 256 KiB to its localhost origin. The first run did not reach a quota failure: a 2 MiB write succeeded, so its expected-failure assertion failed and the script exited 1. Read-only investigation found Chromium's cached approved-space allowance in its [IDB bucket implementation](https://raw.githubusercontent.com/chromium/chromium/main/content/browser/indexed_db/instance/bucket_context.h), accessed 2026-10-17. A bounded follow-up waited 31 seconds after applying the lower quota, beyond the source's stated cache lifetime. This explains the follow-up design; it does not prove that caching was the only cause of the first result.

In that follow-up, the browser reported the active quota override and 73,728 usage bytes before the write. All three IDB requests for document, Blob and random padding reported success, then the transaction aborted with **`QuotaExceededError`** at commit. Reads retained the exact old document revision/text and Blob bytes, and the new padding record was absent. The toy revision-acknowledgment model kept revision 2 pending and acknowledged revision 1. After removing the override and confirming `overrideActive=false`, retrying the captured document/Blob/padding committed revision 2 and advanced its acknowledgment. The override was also removed in teardown when the context remained available.

This is actual browser quota enforcement under a scoped test quota, not a fabricated exception. It does not prove real disk-full behavior, natural storage pressure/eviction, aggregate Service Worker cache contention, a production autosave scheduler, real editor failure UI, crash durability or a selected schema. It reinforces the distinction between request success and transaction completion; production acknowledgment still needs integration evidence. The random padding is a temporary failure trigger, not a proposed storage format.

A separate fresh context loaded an online toy textarea editor with a localhost response CSP of `worker-src 'none'`. Chrome rejected actual `navigator.serviceWorker.register()` with `SecurityError`; no worker script request reached the server, there were zero registrations and no controlling worker. Independent IDB initialization completed, an automated input edit saved revision 2 and its Blob, and an online reload retained the edited text/image while worker registration was again denied.

The installed Playwright `serviceWorkers: 'block'` option was deliberately not used: inspection showed it replaces `register()` with a stub. The measured CSP rejection is browser-enforced under a controlled response policy. It is not enterprise-policy denial, complete absence of the API, offline availability, a mounted Tree entry point or proof that every permission-denied environment leaves storage usable. No browser policy was relaxed, and no offline readiness was claimed.

The final tracked deliverable remains a Minimal Risk plan/index update. Earlier unchanged probe evidence is reused. P1 remains partial, frozen-writer verification remains blocked, and no product policy, schema, parity exception or new constraint was selected. This completes the fourth initiative task commit in this primary session; continue in a fresh session under the repository session limit. Retain scratch for unfinished P1.

Exact next task (fresh session): continue P1 Chrome-only technical verification with a temporary shared-editor feasibility harness. First inspect the existing composition and direct Electron dependencies in `src/renderer/main.tsx`, `src/renderer/App.tsx`, `src/application/editor-store-types.ts` and attachment/clipboard infrastructure. Attempt to mount the existing Tree/Agenda renderer through an isolated scratch entry and disposable adapters using the installed build tools, with synthetic fixture data only. Keep every prototype file under `.scratch/browser-feasibility/` and bundle in memory or into that scratch directory; do not edit shipping modules or create a maintained browser entry. Establish which real-editor input-to-paint, save-overlap, startup and memory scenarios from `perf/` can be exercised, and record measured/unsupported paths separately. Do not choose a production schema or conceal Electron dependencies with a shipping change. Raise a new material constraint before proceeding if the prototype cannot preserve the authorized parity intent. Keep the frozen-writer branch blocked unless new evidence or a capable runner becomes available. Physical keys/OS clipboard/prompts and Windows/Linux/previous-version coverage remain outstanding; Safari awaits the owner's later manual evidence. Do not start P0 finalization or P2–P8, add dependencies, alter installed browser settings or publish.

Next-session prompt:

> Continue P1 Chrome-only technical verification in plans/browser-tree.md with the temporary shared-editor feasibility harness described in its exact next task. The owner accepted D1–D5, authorized disposable prototypes/tests and plan updates, and will check Safari manually later. Reuse passing storage/quota, ownership/lifecycle, update, PNG, virtual-clipboard and CSP worker-denial evidence. Frozen-writer verification is blocked; equivalent retries need new evidence. Physical keys/OS clipboard/prompts, real-editor scale and the full support matrix remain unverified. Keep prototype files/build output in scratch and shipping source unchanged. Full implementation, dependencies/settings changes and publication remain withheld; agree new material constraints with the owner. Do not run Safari/WebKit in this continuation.
