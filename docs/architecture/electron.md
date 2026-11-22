# Electron Integration and Process Boundaries

## 16. Electron Integration

Electron-specific behavior belongs outside the domain.

Electron is responsible for desktop functionality such as:

* creating and managing the application window;
* persisting and restoring the main window's size and position;
* persisting the main window's always-on-top preference and applying it through `BrowserWindow.setAlwaysOnTop`;
* persisting the Vim editing preference that the renderer reads at startup and writes when it is toggled;
* persisting the appearance choice (`system`, `light`, `dark`, `gray`, or `white`) and applying the native scheme and renderer palette;
* application activation;
* global or main-process keyboard shortcuts where required;
* integration with macOS;
* communication between the main and renderer processes;
* access to desktop APIs.

The domain must not import Electron APIs.

### 16.1 Renderer Origin, Session and Navigation Guards

The main process resolves the renderer URL once. Packaged builds always use the packaged renderer document and ignore `ELECTRON_RENDERER_URL`; unpackaged builds may use that variable for the development renderer. Window loading, navigation checks, and trusted IPC caller validation all use the same resolved URL.

The renderer uses Electron's default session. The main process denies permission requests, permission checks, and device permissions on that session, and blocks network requests except for `devtools:`, `blob:`, and `data:` URLs and the resolved renderer origin. No `file:` URL is allowed.

The packaged renderer is served from the privileged standard scheme `app://tree/` rather than from `file://`, because a `file:` document origin can read any local file the user can read. The main entry registers the scheme before the app is ready and installs its handler before the first window loads; both are defined in `src/electron/main/renderer-protocol.ts`. The handler maps a request path inside the built renderer directory to a known asset type and answers a network error for anything else, including dot or encoded-separator segments that would leave the directory. A network error, unlike an HTTP error page, makes a missing renderer document fail the window load, so the main process reports the failure and quits. That quit skips the renderer save handshake: a renderer that never loaded holds no document and cannot confirm a save. The request filter compares the renderer's scheme and host rather than its WHATWG origin, because a custom scheme's origin serializes as an opaque `null`. External HTTP(S) links are handed to the operating system through `shell.openExternal`; they do not use the renderer session.

The main process installs navigation and window-open guards for every web contents as it is created. Main-frame, subframe, and redirected navigation are restricted to the resolved renderer document, and webview attachment is denied. The production content security policy denies child frames, workers, and media. It also declares `frame-ancestors 'none'`, but Chromium ignores that directive when delivered through a meta element, so it is not an enforced control in this delivery mode.

### 16.2 About Dialog

About Tree uses `src/renderer/about-dialog.ts` in both platform entry points. One eagerly mounted HTML dialog shares the editor's renderer and palette; opening does not create a BrowserWindow or load another document. The command panel opens it locally. The native menu sends an argument-free `aboutRequested` notification; the renderer reports open state through trusted, boolean-validated `setRendererModalOpen` IPC. Navigation and renderer loss reset the main-process state. Escape, Close and a backdrop click close the dialog synchronously and restore focus and directed selection. Cmd+0 and second-instance activation surface the same main window without dismissing its dialog. The application icon is a bundled PNG.

The main process rebuilds the application menu on opening and closing. Main-window menu commands are disabled and guarded while About is open; blocked checkbox callbacks restore menu checks from the unchanged preferences. About, Quit and Appearance remain available.

Performance assessment (PRODUCT.md §22.1): the dialog has fixed DOM and listeners. It causes no document traversal and no persistence except the command history write (§13.4).

### 16.3 Window State and Preferences

Window geometry is persisted with a short debounce, so moving or resizing the window does not perform a synchronous disk write for every event. The pending geometry is flushed when the window closes.

The always-on-top preference is stored as one validated boolean in the main-process window-state directory. Toggling it performs one small write and one native window update; it does no work on document editing or navigation paths and retains no growing in-memory structure. An installation without the preference file defaults to an unpinned window.

The Vim editing preference uses the same boolean preference store (`createBooleanPreferenceStore` in `window-state.ts`) in its own file, `vim-enabled.json`, beside the document data. It is user preference, not document state, so it is not part of `document.json`, the autosave policy, or the save-failure lock; a missing or malformed file reads as disabled. The renderer requests it through `tree:get-vim-enabled` before its first render, so the editor never draws a frame in the wrong editing mode, and writes it through `tree:set-vim-enabled`, whose main-process handler accepts only a boolean. Toggling performs one small write and no document save, adds one boolean check per editor keydown, and retains no growing structure.

---

## 17. Process Boundaries

The application consists conceptually of:

```text id="2jpnm1"
Electron Main Process
        │
        │ IPC
        ▼
Renderer Process
        │
        ▼
React UI
        │
        ▼
Application
        │
        ▼
Domain
```

Electron-specific capabilities must cross the process boundary through explicit APIs rather than being accessed directly from arbitrary React components.

The renderer should not gain unrestricted access to Node.js or filesystem APIs.

The shared bottom status bar renders operation messages independently of document changes; browser controllers keep their own status owners and DOM nodes.

### 17.1 Image Recognition

Image recognition (PRODUCT.md §15.1) uses a Swift executable launched by Electron main through `execFile`, without a shell. The renderer sends only a validated attachment ID; main reads its local bytes and pipes them to the helper. Vision decoding and OCR run in that process, which returns bounded JSON text entries, including empty spacing markers. The application owns queueing and source-identity checks, and stores the result only as hidden attachment search text through the domain enrichment. No native API or filesystem dependency enters the domain. Main cancels work on renderer loss/reload and quit. The packaged helper lives in `Contents/Helpers`; development builds use `out/native`. See [ADR 0025](../decisions/0025-apple-vision-image-to-text.md).

`image-to-text-queue.ts` owns pending identities and an explicit idle/draining state with one active job. Job kinds distinguish automatic indexing and reindexing. Admission, permanent source invalidation, reindex owner transfer and nested shutdown suspension go through this owner; pending pruning never removes the active job. `EditorStore` owns native execution, metadata/history enrichment and saving, and their await and publication order.

Performance assessment (PRODUCT.md §22.1): the queue owner retains no image bytes or document snapshots and performs no writes or syncs. It traverses the document only to admit a reindex and to find the new owner of a reindex job whose node lost its image. Queue and store scale guards cover unique-image retention and sequential execution.
