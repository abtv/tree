# Browser version

This directory preserves the owner-reviewed browser implementation. It shares
Tree's editor, application store and styles with the desktop app. It supports
local development and a static hosting package. This does not publish a site or
claim full production browser parity.

## Static hosting package

```sh
npm run build:web
```

The complete package is `out/web/`: `index.html`, hashed JavaScript, CSS and font
assets, and `.nojekyll`. Upload **the contents** of this directory to the hosting
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
browsers and profiles. There is no migration, synchronization, account, export or
import in this package. Never clear the old site's data to install or update it.
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
No Service Worker, offline package, recovery generations or persistent-storage
request is added. Existing storage and save limitations below still apply.

## Local development

From the repository root, after installing the existing project dependencies:

```sh
npm run dev:web
```

Open <http://127.0.0.1:5174/>. Keep this origin unchanged to continue using the
same browser-local document. The database name remains `tree-browser-prototype`;
moving source files does not migrate, clear or upload the stored document.
Another browser, profile, hostname or port has separate storage.

The ellipsis button opens Tree, Agenda, Vim Editing and appearance controls.
The menu also shows local save status. Only one tab may edit at a time.
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

Data stays in the browser. There is no device synchronization, export or import.
Clearing site data or deleting the profile removes it. This version has no offline
package, recovery generations or persistent-storage request. Browser/OS force
termination can lose uncommitted work. Full Safari and Dock-app compatibility
remains unverified; native Safari clipboard interaction still needs verification.

## Browser checks

For `test:web`, run the development server first. Checks use isolated Chrome
contexts or fresh disk profiles
under `.scratch/web-prototype/`; they do not use the ordinary browser profile.
Google Chrome must be installed. In Codex, browser launch uses the normal
outside-sandbox approval mechanism.

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

`test:web:built` builds the static package, starts an ephemeral loopback file server,
runs the editor, theme, menu, storage, quit and compatibility checks against those
files in isolated Chrome, and closes the server. It does not open the ordinary
browser profile.

The compatibility check covers multiline sizing, decorated text editing and undo,
save/reload, and the image-copy activation contract with missing-data and
permission failures. It also checks PNG copying through headless Chrome's virtual
clipboard. It does not access the machine clipboard or establish native Safari
clipboard behavior.

The storage check covers full browser restart, writer handover, aborted writes,
retries, dirty-close warnings, buffered editing, Insert undo grouping and invalid
stored data. Screenshots and synthetic browser profiles remain ignored scratch
artifacts. The server binds only to the local loopback address.

### Local Safari performance comparisons

Run `npm run test:perf:safari` on macOS to compare real Safari with Electron.
The single runner in `scripts/safari-perf.mjs` exercises typing in a large Tree,
Agenda opening/navigation/scrolling, and typing while an automatic save is pending.
It builds both versions, starts an ephemeral loopback server and SafariDriver on
port 7056, and runs the same scenarios serially in visible Safari and Electron.
Enable Safari remote automation before the first run (`safaridriver --enable`);
the runner does not change that system setting. This optional local command is
not added to agent permission allowlists: use the normal approval mechanism,
outside the sandbox in Codex. Do not interact with the test windows while it runs.
Safari uses isolated WebDriver sessions and a fresh origin; Electron uses
synthetic profiles under `.scratch/safari-perf/`.

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
