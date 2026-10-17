# Browser Tree: research and proposed delivery plan

Status: Research recorded; awaiting decisions and implementation authorization.
Research date: 2026-10-17.
Authorization: investigate and write this plan only. No application implementation, experimental application code, repository-settings changes, push, or publication is authorized. Accepting an architectural recommendation or answering a question below does not authorize implementation.

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
| [shared/ipc.ts](../src/shared/ipc.ts), [preload/index.ts](../src/preload/index.ts) | Explicit desktop API for persistence, attachments, clipboard, preferences, native context menu and quit. Retain the Electron boundary; extract platform-neutral value contracts rather than emulate IPC in a browser global |
| [electron-services.ts](../src/infrastructure/renderer/electron-services.ts), [AttachmentPreview.tsx](../src/renderer/AttachmentPreview.tsx) | Preview imports an Electron-named singleton byte cache directly. Inject attachment reading/cache ownership and retain bounded caching and object-URL cleanup |
| [App.tsx](../src/renderer/App.tsx), [use-command-panel.ts](../src/renderer/use-command-panel.ts), [editor-input-handlers.ts](../src/renderer/editor-input-handlers.ts), [node-input-pointer-handlers.ts](../src/renderer/node-input-pointer-handlers.ts) | Direct `window.treeApi` calls for preferences, quit and context menus. Route through a narrow platform interface; capabilities must have explicit product dispositions |
| [file-services.ts](../src/infrastructure/main/file-services.ts), [quit-handshake.ts](../src/main/quit-handshake.ts) | Serialized filesystem work, durable replacement, retained generations and controlled shutdown. Browser storage must implement the same safety intent with transactions; filesystem rename/fsync and guaranteed quit waiting cannot simply be copied |
| [clipboard.ts](../src/infrastructure/main/clipboard.ts), [ipc-security.ts](../src/main/ipc-security.ts), [png-decoder.ts](../src/main/png-decoder.ts) | Electron clipboard and PNG decoding/validation. Share pure validation, link extraction and size rules; add browser event/API adapters and browser decoding, without importing Node `Buffer` or Electron |
| [application-menu.ts](../src/main/application-menu.ts), [editor-context-menu.ts](../src/main/editor-context-menu.ts), [window.ts](../src/main/window.ts) | Native menus, Look Up, Google search, external links, geometry, appearance and window pinning. See D2/D3; no silent omissions |
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

Reuse the current synthetic workload generators and scenarios from [perf/](../perf/), including Tree typing/startup, wide-list navigation/expansion, counted Vim operations, node Visual commands, Agenda wide/deep/mixed dense/sparse data, completion, state/history, attachments and typing during save. Existing fixtures include large document and wide-sibling scales; the scenario definitions and budgets stay with their owning tests. Browser shipping scope retains those workloads.

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

## 10. Material decisions still reserved for the owner

All entries below are proposals, not accepted exceptions. No minor requirement gaps were resolved on the owner's behalf. Accepted constraints in §1 need no renewed approval.

| ID | Recommendation and material tradeoff | Alternative / decision boundary |
| --- | --- | --- |
| D1: Browser save and close contract | Short batched recovery writes during active editing, explicit pending/saved/error state, lifecycle flush as additional protection, optional browser warning while unsaved. Confirmed transactions are the recovery boundary; no guaranteed final close flush. Preserve Vim session semantics and define pending draft recovery after P1 evidence | Keeping desktop triggers retains a larger unsaved window and still cannot guarantee close flush. No browser implementation may claim desktop-controlled shutdown. Choose the product contract before P3/P4 |
| D2: Platform and shortcut equivalence | Keep literal Vim Control keys; use platform command modifiers for application actions. Cmd+Q belongs to the browser; Tree `quit` flushes and explains that the tab can be closed. Browser controls window geometry. Keep theme/Vim/view commands reachable inside Tree; propose the closest browser context-menu behavior | Native application menus, Look Up, exact window geometry restoration and tab closure are additional gaps beyond the two accepted exceptions. P1 verifies actual conflicts, then present each failed requirement/equivalent before accepting a deviation; do not approve unspecified future exceptions in bulk |
| D3: Local-only privacy versus native helpers | No Tree-triggered Google search or network-capable Look Up; disable browser spellcheck/text assistance where controllable. Keep HTTP(S) links only on explicit user action, with `noopener`/`noreferrer`, no automatic preview or document referrer | A stricter option also disables external opening. Preserving helpers would require an explicit narrow user-initiated disclosure exception, inconsistent with treating all current desktop helpers as automatically allowed. Basic versus Enhanced spellcheck cannot be selected reliably by Tree. Decide before browser UI requirements |
| D4: Browser support lifetime | Current and previous stable release families for Chrome and Safari on their supported desktop OSes, with version evidence in CI; Safari release family is distinct from a patch update | Current stable only reduces compatibility work; broader/enterprise-pinned versions increase regression and API-support obligations. Record minimum tested versions when P1 establishes actual availability; do not invent an OS matrix from “desktop” alone |
| D5: Architecture and release authority | Shared editor with narrow adapters; IndexedDB/Blob storage and Web Locks; dedicated app-only SW; exact physical storage layout after P1; GitHub App handoff to target Actions | LocalStorage/OPFS, a separate editor, or a PAT have different durability, maintenance and operational tradeoffs. App creation/secrets, a Safari test-client dependency or dedicated runner require explicit later setup. This plan alone approves none of them |

If literal keys prove unavailable, clipboard/image behavior cannot be preserved, Web Locks is denied, or measurements invalidate the storage proposal, bring the concrete new finding and closest behavior back to the owner. Do not treat an unanswered capability probe or platform documentation as owner approval to reduce requirements. Additional questions are conditional on those findings, not speculative decisions to ask now.

## 11. Proposed tasks and acceptance gates

All tasks are `Planned`, not ready for implementation. Dependencies include the owner's implementation authorization in addition to the decisions shown. Research/documentation delivery itself is complete when this plan passes Minimal Risk checks and is committed.

| Task | Outcome, expected files and dependencies | Acceptance evidence and validation | Status |
| --- | --- | --- | --- |
| P0 | Record decisions D1–D5, outstanding parity gaps and implementation authorization/budget here. Then update relevant Product/Architecture/Security requirements and accepted ADRs under `docs/decisions/` | Owner decisions explicitly distinguished from recommendations; documentation checks. Requirements preparation alone is Minimal Risk | Planned |
| P1 | Capability and scale feasibility experiments after separate authorization: isolated `.scratch/browser-feasibility/` materials, proposed test/browser fixture owners, storage-layout comparison and shortcut disposition table. Depends on P0 scope; no shipping editor or deployment | Real Chrome target matrix and SafariDriver preflight; ordinary-profile restart, trusted keys/clipboard, persistence/SW policy trials; save/clone/latency/bytes/memory measurements on existing large workloads. Resolve storage ADR before P3. Internal disposable probes use focused checks; any shared executable tooling obeys Development §9 | Planned |
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
| Initial decisions | Discuss D1–D5 and explicitly authorize the desired next scope/budget if implementation is wanted | Required before dependent implementation; current request authorizes only this research and plan |
| Publication setup/approval | Create/install the chosen App or approved alternative, authorize protected secret/settings changes and first publication; approve target-repository edits | Required for P7, grouped after P6 produces reviewable artifacts. No credentials are requested during research |
| Final acceptance | Assess the delivered commit and result against agreed parity, privacy, offline and reliability criteria | One planned final acceptance round after implementation; separate from pre-commit verification |

One additional grouped pre-release native-browser verification round may be needed if P1 cannot automate real shortcut dispatch, clipboard prompts, Safari ordinary-profile restart or managed-browser behavior. It is not yet a mandatory manual assignment. P1 must name the exact check, blocking task, reason automation is insufficient, concrete expected result and supported owner/runner action before implementation proceeds. Other unknowns are Safari CI automation, usable Windows/Linux runners, physical storage layout performance and App secret permissions; report newly required owner checks promptly.

Exact next task: discuss the decision register and choose whether to authorize P0/P1 or a wider bounded initiative. There is no ready runtime implementation task. Ordinary “continue” may continue this plan's discussion or explicitly authorized documentation; it must not infer application implementation or publication from this plan's existence.

Next-session prompt:

> Continue the browser Tree planning initiative in plans/browser-tree.md. The owner requested technical research and a recorded plan only; implementation, experiments that create application code, target-repository changes, push and publication remain unauthorized unless later decisions recorded in the plan explicitly authorize them. Resolve the material decision register using the recorded evidence, preserve equal long-term browser/desktop use and full Vim/Agenda/large-document goals, and do not add exceptions beyond those the owner has explicitly accepted. Read the plan's current status and decisions before selecting the next step.
