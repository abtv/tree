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

The planned destination is `https://tree-editor.github.io`, from the separate
`tree-editor/tree-editor.github.io` repository. This task does not transfer files,
change repository settings, enable deployment automation or publish anything.
The source repository's existing demo Pages workflow is a separate destination.

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

Committed edits autosave after a short idle interval. Pending Vim Replace text
remains marked unsaved until committed. Closing with pending work warns and
starts a flush; cancel closing to allow it to finish. Repeated write failures
lock document editing. A failed transaction preserves the previous saved head;
the current unsaved work remains in the open tab. Invalid stored documents are
not replaced with a sample.

Data stays in the browser. There is no device synchronization, export or import.
Clearing site data or deleting the profile removes it. This version has no offline
package, recovery generations or persistent-storage request. Browser/OS force
termination can lose uncommitted work. Safari remains unverified; clipboard and
image paths are not covered by the initial editor smoke test.

## Browser checks

For `test:web`, run the development server first. Checks use isolated Chrome
contexts or fresh disk profiles
under `.scratch/web-prototype/`; they do not use the ordinary browser profile.
Google Chrome must be installed. In Codex, browser launch uses the normal
outside-sandbox approval mechanism.

```sh
npm run test:web
npm run test:web -- theme
npm run test:web -- menu
npm run test:web -- storage
npm run test:web:built
```

`test:web:built` builds the static package, starts an ephemeral loopback file server,
runs the editor, theme, menu and storage checks against those files in isolated
Chrome, and closes the server. It does not open the ordinary browser profile.

The storage check covers full browser restart, writer handover, aborted writes,
retries, dirty-close warnings, buffered editing, Insert undo grouping and invalid
stored data. Screenshots and synthetic browser profiles remain ignored scratch
artifacts. The server binds only to the local loopback address.
