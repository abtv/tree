# Local browser version

This directory preserves the owner-reviewed browser implementation. It shares
Tree's editor, application store and styles with the desktop app. It is a local
development version; this checkpoint does not publish a site or claim production
browser parity.

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

Run the server first. Checks use isolated Chrome contexts or fresh disk profiles
under `.scratch/web-prototype/`; they do not use the ordinary browser profile.
Google Chrome must be installed. In Codex, browser launch uses the normal
outside-sandbox approval mechanism.

```sh
npm run test:web
npm run test:web -- theme
npm run test:web -- menu
npm run test:web -- storage
```

The storage check covers full browser restart, writer handover, aborted writes,
retries, dirty-close warnings, buffered editing, Insert undo grouping and invalid
stored data. Screenshots and synthetic browser profiles remain ignored scratch
artifacts. The server binds only to the local loopback address.
