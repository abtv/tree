# Browser version

This directory preserves the owner-reviewed browser implementation. It shares
Tree's editor, application store and styles with the desktop app. It supports
local development and a static hosting package. This does not publish a site or
claim full production browser parity.

Browser runtime source and unit tests live here. Build and server tools live in
`scripts/web/`; Chrome E2E specs live in `e2e/web/`. Shared editor layers remain
alongside this directory under `src/`, and Electron entry points live in
`src/electron/`.

## Static hosting package

```sh
npm run build:web
```

The complete package is `out/web/`: `index.html`, hashed JavaScript, CSS and font
assets, `.nojekyll`, and the installable-app files copied from `src/web/public/`
(`manifest.webmanifest`, `icon-192.png`, `icon-512.png`, `apple-touch-icon.png`).
Publication accepts only these exact root names. Upload **the contents** of this directory to the hosting
root. No Node.js process, Vite server, API or application server is needed on the
host or the user's computer. Use HTTPS: IndexedDB, Web Locks and clipboard paths
depend on browser capabilities and secure contexts. Opening `index.html` with
`file://` is unsupported. Assets use relative paths; there is no server-side router
or rewrite requirement. Keep old hashed assets available during an update, upload
new assets first and replace `index.html` last (or use an atomic deployment).

The destination is `https://tree-editor.github.io`, from the separate
`tree-editor/tree-editor.github.io` repository. Source pushes to main use the
[automatic publication pipeline](../../deployment/github-pages/README.md) after
one-time access setup. Local build/check commands do not publish. The source
repository's existing demo Pages workflow remains a separate destination.

Before publication, explain the storage boundary: the local development origin
and `https://tree-editor.github.io` have separate browser storage. Existing localhost
notes stay there and **do not move automatically**. The same applies to different
browsers and profiles. There is no migration, synchronization or account in this
package. **Export Notes…** writes a copy that can be kept outside the browser, and
**Import Notes…** on another origin or profile replaces its notes with that copy.
Never clear the old site's data to install or update it.
Reserve the destination origin for trusted Tree code; other paths on that origin
share its storage.

For a local check of the generated files only:

```sh
npm run preview:web
```

Open <http://127.0.0.1:5175/>. This is a testing convenience, not a requirement for
using the hosted site. It uses a separate origin from the development server.
The build includes a meta CSP; framed startup is rejected by the existing adapter.
The preview serves files directly without Vite transforms or a development client.
Chrome can install the preview or hosted site as **Tree** from its menu; see
[installation and storage protection](../../docs/PRODUCT.md#241-installation-and-storage-protection).
No Service Worker, offline package or recovery generations are added. Existing
storage and save limitations below still apply.

## Local development

From the repository root, after installing the existing project dependencies:

```sh
npm run dev:web
```

Open <http://127.0.0.1:5174/>. Keep this origin unchanged to continue using the
same browser-local document. The database name remains `tree-browser-prototype`;
moving source files does not migrate, clear or upload the stored document.
Another browser, profile, hostname or port has separate storage.

The ellipsis button opens Tree, Agenda, Vim Editing, appearance and Data controls.
The menu also shows local save status and whether the browser granted persistent
storage. Only one tab may edit at a time.

**Export Notes…** in the Data block downloads one ZIP archive with the saved
document and its referenced images, in the layout of the desktop data directory.
A module worker writes the archive, so editing continues meanwhile. The archive
format, limits and messages are defined in
[the browser data-safety requirements](../../docs/PRODUCT.md#24-browser-data-safety).
Keep exported archives somewhere other than the browser profile so they survive
clearing site data.

**Import Notes…** replaces the notes in this browser with an exported archive,
after a confirmation that compares both. It accepts only archives as Tree exports
them; one that the Finder re-packed is rejected, so keep the original file.
**Export Current Notes First** in the confirmation keeps a copy of the notes that
will be replaced. Import also replaces stored notes that can no longer be opened.

In Chromium-based browsers, **Back Up to Folder…** copies saved notes and images
to a chosen folder in the desktop data-directory layout. It runs in a worker;
the menu footer reports success, permission needs or failure. **Stop Backing Up**
forgets the folder choice and leaves its files intact. An existing `document.json`
requires an explicit choice to replace the backup, restore its notes through the
import confirmation, or choose another folder. Restore does not enable backup.
**Restore from Folder…** reads a backup folder, for example after site data was
cleared, and replaces the notes after the same confirmation as import.
Permission is checked without prompting at startup; a paused backup requires a
**Resume Backing Up…** click. In Chrome on macOS, a natively chosen folder kept its
write permission across a full browser restart and backup resumed without a click
(owner check, 2026-10-22). Other browsers and platforms may ask for Resume.

Use a separate backup folder for each profile and computer. Two Macs writing the
same folder, including through iCloud Drive, can overwrite each other's notes.
Choosing a synchronized folder lets that service copy the unencrypted notes.
Tree never deletes backup files or sends them over the network. Files left in a
backup folder can accumulate as images are removed from notes. Do not edit an
active backup folder externally. See PRODUCT §24.5 for timing and failure rules.

Apple devices use Cmd shortcuts. Other platforms use Ctrl, with Alt for Option
and Home/End for line boundaries. The command panel shows the matching labels.
See [keyboard mappings and exceptions](../../docs/PRODUCT.md#15-keyboard-modifiers-outside-apple-platforms).
Real-keyboard delivery of browser-reserved shortcuts on Linux and Windows remains
unverified; Chromium automation checks application handling and default prevention.

Both shortcut profiles passed the macOS Chrome and Linux arm64 Chromium checks.
Chrome assigns Ctrl+N to a new window; if it does not reach a suggestion popup,
use the arrow keys. Actual Windows AltGr input remains unverified. These limits
are recorded with the mapping in the linked requirements.

On iPhones and iPads, Vim controls are hidden and standard editing is enforced;
see [the browser requirements](../../docs/PRODUCT.md#14-browser-static-hosting-checkpoint).

Committed edits autosave after a short idle interval. Pending Vim Replace text
remains marked unsaved until committed. Closing with pending work warns and
starts a flush; cancel closing to allow it to finish. Repeated write failures
lock document editing. A failed transaction preserves the previous saved head;
the current unsaved work remains in the open tab. Invalid stored documents are
not replaced with a sample.

Tree's Quit command saves pending edits and then requests window closure without
a successful-save dialog. If the browser refuses scripted closure, close the
saved page with the browser's own controls. A failed save keeps the editor open.

Data stays in the browser unless the user exports it or chooses a backup folder. There is no device
synchronization. Clearing site data or deleting the profile removes the
notes stored in the browser. This version has no offline
package or recovery generations. It requests persistent storage once per page
load, which only reduces eviction under storage pressure. Browser/OS force
termination can lose uncommitted work. Full Safari and Dock-app compatibility
remains unverified; native Safari clipboard interaction still needs verification.

## Browser checks

Chrome E2E specs live in `e2e/web/` and use Playwright Test through
`playwright.web.config.ts`. Electron tests live beside them in `e2e/electron/`
and use the separate `playwright.config.ts`.
Both targets use Playwright assertions, fixtures, traces and reports. On macOS
the suite uses the installed Google Chrome; no downloaded Playwright browser is
required. Google Chrome has no Linux arm64 build, so on Linux the suite uses
Playwright's Chromium in new headless mode; install it with
`npx playwright install --with-deps chromium`. CI runs the suite on Linux arm64.
The suite requires headless mode so its clipboard checks use the browser's
virtual clipboard rather than the machine clipboard.
In Codex, browser launch uses the normal outside-sandbox approval mechanism.

`test:web` starts and stops the local development server automatically, or reuses
an existing server at the documented development URL outside CI. Tests use
isolated contexts and fixture-owned synthetic profiles, never the ordinary
browser profile. Persistent profiles are removed after their contexts close.

The tracked Codex rules in `.codex/rules/tests.rules` allow `npm run test:web:built`,
`npm run test:web` (including check selection), `npm run dev:web`, and
`npm run preview:web` outside the sandbox. They trust this repository's named
scripts, including builds, Chrome launches, and local servers; review script
changes before running them. Restart Codex with the project configuration trusted
to load the rules. A rule match alone does not prove that the running session has
loaded them. The rules match command arguments, not the current directory, so use
these allowances only in a trusted checkout.

```sh
npm run test:web
npm run test:web -- theme
npm run test:web -- menu
npm run test:web -- storage
npm run test:web -- quit
npm run test:web -- compatibility
npm run test:web:built
```

`test:web:built` builds the static package through its npm pre-hook, starts the
loopback preview server, runs the same specs plus static-package assertions, and
closes the server. A pre-existing preview server is not reused. Local builds and
tests do not publish. `TREE_WEB_URL` can select an externally managed server;
when set, Playwright does not start or stop that server.

Arguments after `--` are standard Playwright Test arguments. A name such as
`menu` selects matching spec paths; `--grep` selects test titles and `--list`
previews selection. Omitting a selection runs the complete Chrome suite.
The static-package test is skipped against the development server.

Screenshots, failure traces and test artifacts are written to `test-results/web/`.
The HTML report is `playwright-report/web/`; view it with
`npx playwright show-report playwright-report/web`. CI retains failure artifacts.

The compatibility check covers multiline sizing, decorated text editing and undo,
save/reload, and the image-copy activation contract with missing-data and
permission failures. It also checks PNG copying through headless Chrome's virtual
clipboard. It does not access the machine clipboard or establish native Safari
clipboard behavior.

The storage spec covers full browser restart, writer handover, aborted writes,
retries, dirty-close warnings, buffered editing, Insert undo grouping and invalid
stored data. Generated reports and synthetic profiles remain ignored runner
artifacts. The server binds only to the local loopback address.

The export spec parses each downloaded archive and compares it with IndexedDB. It
covers pending-edit flushing, missing and unreferenced images, cancellation,
refusal of an invalid stored document, typing during a large export and the
locked save-failure state. It cancels deterministically by holding the worker
script request with `page.route`, without a production test hook.

The import spec exports in one context and imports through the real file chooser
in another, then compares the reloaded head and images. It covers the
confirmation, Export Current Notes First, cancel and Escape, a Finder-re-packed
and a damaged archive, a failed head write in the worker (injected by prefixing
the worker script through `page.route`) and replacing an invalid stored document.

### Browser archive performance

`npm run test:perf -- --project=web` measures **Export Notes…** and
**Import Notes…** on a large synthetic profile in the built package
(`perf/web/export.spec.mts`, `perf/web/import.spec.mts`). The script rebuilds
both targets first. It records main-thread long tasks, total blocking time,
duration, main-thread heap growth and archive size through `perf/results.ts`. It runs locally in visible Chrome and is not part of the
scheduled Performance workflow or the release gate.

`npm run test:perf -- --project=web backup.spec.mts` compares alternating
backup-off/on typing with a large synthetic profile. It records input-to-paint
latency, main-thread long tasks and heap, autosave transaction completion, backup
lag and bytes written per minute. The relative comparison is the regression
guard. OPFS uses real writable handles and workers but does not measure the speed
or durability of a physical backup disk.

### Local Safari performance comparisons

Run `npm run test:perf:safari` on macOS to compare real Safari with Electron.
The single runner in `perf/comparisons/safari-electron.mts` exercises typing in a large Tree,
Agenda opening/navigation/scrolling, and typing while an automatic save is pending.
It builds both versions, starts an ephemeral loopback server and SafariDriver on
port 7056, and runs the same scenarios serially in visible Safari and Electron.
Enable Safari remote automation before the first run (`safaridriver --enable`);
the runner does not change that system setting. This named local command is
allowed by the agent configurations and runs outside the sandbox in Codex.
Do not interact with the test windows while it runs.
Safari uses isolated WebDriver sessions and a fresh origin; Electron uses
synthetic profiles under `.scratch/safari-perf/`.

For functional Safari smoke checks without performance measurements, use
`npm run test:safari`; see [Development Guide](../../docs/DEVELOPMENT.md#shared-agent-instructions).

Results are written to `test-results/safari-perf-results.json`. They measure the
time from a captured input/keyboard event to two animation frames, using the same
renderer clock in both engines. They exclude automation-command round trips.
The native drivers have different input cadence, so these measurements compare
individual response latency rather than typing throughput. Scroll samples use
programmatic scrolling; they do not measure trackpad gestures.

The save scenario delays each adapter's save promise, asserts it remains pending
across the next native keystroke, and checks that the real save persists typed
words. It is a slow-save responsiveness proxy, not a storage-throughput benchmark.
The browser runner instruments the existing exposed prototype store's service
object; the Electron runner uses the existing test-owned IPC wrapper. Neither
adds production hooks. Safari and Electron retain their different storage
implementations and save policies. These are diagnostic measurements without
timing thresholds, separate from the ordinary Electron suite and CI. Repeat
samples help expose noise; they do not establish identical browser/desktop
rendering or startup costs. For a shorter run, use
`npm run test:perf:safari -- --repetitions=1`; the default is three repetitions of
each scenario in each application.
