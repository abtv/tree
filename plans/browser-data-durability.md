# Browser Data Durability

Status: **Approved — ready** (initiative-wide approval for tasks A, B1, B2, C1 and C2).

## Objective

Make the browser version's notes durable for the Product Owner, who uses it in Google Chrome on macOS while waiting for an Apple developer account, and who will keep supporting the browser version later:

1. an installable app and a persistent-storage request;
2. manual ZIP export and import in every supported browser;
3. automatic backup to a user-chosen folder, with restore, in Chromium-based browsers.

## Scope

In scope: web app manifest and icons; one `navigator.storage.persist()` request per page load; export and import of one ZIP in the Electron data-directory layout; Web Workers for archive and backup work; File System Access folder backup and restore; menu controls and status; documentation; tests, including browser performance scenarios.

Out of scope: service worker or offline support (declined by the Product Owner), Electron changes, cloud sync, scheduled exports, merge import, ZIP64, folder backup in Safari and Firefox, deleting files from the backup folder, exporting preferences, any publication, push or release to `https://tree-editor.github.io`.

`docs/OPEN_QUESTIONS.md` PD-004 (export and backup) stays as recorded; only the Product Owner changes its status.

## Authorization

- Approval covers the whole initiative (tasks A, B1, B2, C1, C2) with the owner decisions below, recorded on 2026-10-20. Selected coding tool: Codex (explicitly authorized by the owner for continuation on 2026-10-20, superseding Claude Code).
- The Product Owner approved the delegated decision area below.
- Reserved for the Product Owner: a new npm script that needs permission-configuration edits (`opencode.json`, `.codex/rules/*`, `.claude/settings.json`); changing the archive layout; scope expansion; publication.
- Agents must not edit `.claude/settings.json`. If Chrome cannot start in the Claude Code sandbox, report the blocker and the owner's supported action.

### Owner decisions (2026-10-20)

| ID | Decision |
| --- | --- |
| O-Q0 | `fflate` is pinned to exactly `0.8.3`: OSV lists GHSA-px8p-9vwx-vf98 / CVE-2026-45820 (infinite loop in `unzipSync` on crafted ZIP64 data) for earlier 0.8.x versions. Import reads the ZIP central directory with an own parser; it never uses fflate `Unzip`, `unzipSync` or the async APIs. Same-origin workers require CSP `worker-src 'self'`. The publication allowlist gains exact names for the manifest and icons. |
| O-Q1 | Controls: a "Data" block in the existing ellipsis menu (`#tree-menu`) with "Export Notes…", "Import Notes…", and, in Chromium only, "Back Up to Folder…" (becomes "Stop Backing Up") and "Restore from Folder…". Two muted status lines at the menu footer: storage protection, and backup state. A small attention dot on the ellipsis button only when the backup failed or needs permission. No shortcuts, no command-panel entries, no startup prompts. |
| O-Q2a | Import and restore show a confirmation dialog with Cancel as the default button: file or folder name, size, node and image counts of the incoming data versus the current notes, and an "Export Current Notes First" button. No stored safety copy of the replaced head. |
| O-Q2b | A referenced image missing from an archive or folder does not reject it: import proceeds and the dialog shows the missing count. Export and backup skip a referenced image missing from IndexedDB, count it and report the count. This matches PRODUCT §16.1 and §17.1 (a document opens with a missing image file and shows the image error). |
| O-Q2c | Archives re-packed by Finder or a CLI (extra folder level, `__MACOSX`, `.DS_Store`, directory entries) are rejected; the message tells the user to import the original exported file. |
| O-Q3a | Choosing a backup folder that already contains `document.json` never overwrites silently: the user chooses "Restore from This Folder", "Replace Backup with Current Notes" or "Choose Another Folder". |
| O-Q3b | Restore from a folder is available only through the menu command; no prompt on an empty start. |
| O-Q3c | The backup trails saved notes by at most N seconds. The agent chooses N from measurements between 5 and 30 seconds (start at 10, trailing-edge coalescing) and records it in PRODUCT §24.5. |
| O-Q4 | The Product Owner exports the icons from `assets/icons/tree-icon-source.png`, cropped to the tile with transparent corners, as `src/web/public/icon-512.png` (512×512), `icon-192.png` (192×192) and `apple-touch-icon.png` (180×180). Agents do not generate icons. |
| O-Q5 | Delegated area (Procedures §5): wording, dialog layout, status text, progress and cancel behavior, and edge states of export, import, backup and restore, within the O-Q1 controls; plus tuning values (backup interval within O-Q3c, archive limits) chosen from measurements. Principles: (1) durability first — never replace or hide notes without an explicit confirmation that names the effect; fail closed and leave current notes unchanged; (2) privacy — nothing leaves the machine except to a file or folder the user chose, no network; (3) responsiveness — no main-thread work proportional to document or image size; (4) minimal surface — only the listed controls; (5) HIG wording (PRODUCT §1.3: Title Case, ellipsis before a dialog or picker, safe default for destructive dialogs); (6) strict input handling; (7) browser storage identity unchanged. Boundary: no new capabilities, no format changes, no Electron changes, no service worker, no change to existing behavior. Record each delegated choice in this plan and in `docs/PRODUCT.md`. |

## Sources of truth

`docs/PRODUCT.md` §1.1, §1.3, §1.4, §16, §17, §20.4, §20.5, §20.7, §22; `docs/ARCHITECTURE.md` §2, §13, §14; `docs/SECURITY.md` (browser runtime and storage, browser publication, network egress); `docs/DEVELOPMENT.md` §9, §11, §12, §13, §15; `src/web/AGENTS.md`; `e2e/web/AGENTS.md`; `perf/AGENTS.md`; `docs/decisions/0006-exact-dependency-pinning.md`.

## Current behavior and boundaries

- `src/web/services.ts`: IndexedDB `tree-browser-prototype` version 1; `document/head` holds the full persisted state; `blobs` maps attachment id to PNG bytes; `preferences` holds `vim`, `appearance`, `commands`. Writes use `durability: 'strict'`. Web Lock `tree-browser-prototype-writer` allows one editing tab. The browser clock shortens the idle autosave to 300 ms, so saves can occur about three times per second while typing. `cleanupAttachments` is a no-op: image bytes are never deleted. An invalid stored head is not replaced.
- `src/web/main.tsx` and `src/web/index.html`: menu controls (`#tree-menu` popover) are plain DOM outside React; status text is `#prototype-save-status`, problems `#prototype-problem`.
- Build and hosting: `scripts/web/build.mts` (Vite, `base './'`, meta CSP with `worker-src 'none'`), `scripts/web/server.mts` (dev, port 5174), `scripts/web/static-server.mts` (preview, port 5175; its MIME map lacks `.webmanifest`), release tooling in `scripts/web-release/` (`policy.mts` `allowedPath` accepts only `index.html`, `.nojekyll` and `assets/*.{js,css,ttf,otf,woff,woff2}`; `package.mts` `inspectPackage` and `verifyPackage` require HTML references under `./assets/`).
- Electron layout to mirror: `document.json` plus `attachments/<id>.png` (`src/infrastructure/main/file-services.ts`). Validators to reuse: `validateAttachmentBytes`, `isPng`, `MAX_ATTACHMENT_BYTES` (25 MiB) and the dimension and pixel caps in `src/electron/main/ipc-security.ts`; `isValidAttachmentId` (no length cap); `validatePersistedState` and `parsePersistedState` (import must prove both succeed).
- Web E2E: `e2e/web/*.spec.mjs`, headless, serial, 90 s timeout; the CI `Browser Chrome` job has an 8-minute limit. The scheduled Performance workflow runs only the Electron suite within 5 minutes. Browser perf precedent: `perf/comparisons/safari-electron.mjs`.
- Documents that currently state "no export/import/persistent-storage request" and must change: `docs/PRODUCT.md` §1.4, `docs/SECURITY.md`, `src/web/README.md`, `deployment/github-pages/README.md`.

## Design decisions

| ID | Decision | Reason |
| --- | --- | --- |
| D1 | No IndexedDB version bump; new keys only in `preferences` (backup folder handle under `backup-folder`). | PRODUCT §1.4 and `src/web/AGENTS.md` keep the storage identity; a version bump breaks older open tabs. Clearing site data also deletes the handle, so restore always starts with a new picker call. |
| D2 | Pure rules and the ZIP central-directory parser live in `src/application/notes-archive/` (no fflate import; inflate is an injected function). Backup sequencing lives in `src/application/folder-backup.ts`. Adapters (IndexedDB, workers, File System Access, DOM, fflate writer and inflate) live in `src/web/`. | AGENTS.md §7; Node unit tests; mutation testing of the hostile-input parser. New `src/application` files also make the release gate require the demo suite. |
| D3 | Write with fflate `Zip` (`document.json` deflated first, PNG entries stored with `ZipPassThrough`, sorted by id). Read with the own parser plus fflate `Inflate`. | fflate `Zip` writes sizes only in data descriptors and `Unzip` finds entry ends by scanning for signatures, which stored PNG bytes can contain by chance (inference from fflate 0.8.3 source; B1's first test proves or disproves it). Async APIs spawn blob workers that the CSP blocks. |
| D4 | Export download is a Blob plus an anchor in every browser. | One code path, testable through Playwright download events. A streaming save picker is a later optimization only if B1 measurements show memory trouble. |
| D5 | Import commit order: validate everything, stage image blobs without overwriting existing ids, then one IndexedDB transaction replaces `document/head`, then retire the editing session and reload. | A failure leaves current notes untouched. |
| D6 | One short-lived worker per archive operation; one long-lived backup worker. Permission query and request stay on the main thread. Messages carry no document. | Main thread does no work proportional to data size; user activation exists only on the main thread. |
| D7 | Backup invariants: one write in flight; trailing-edge coalescing with a minimum interval; images before document; the document is written only after every referenced available image exists in the folder; never deletes; one run at startup. | Consistency of the folder at every moment. |
| D8 | Test seam without production hooks: an `addInitScript` replaces `window.showDirectoryPicker` with a function that returns an OPFS directory; the worker, IndexedDB handle storage and `createWritable` stay real. | Playwright cannot operate the native picker. |
| D9 | `document.json` is compact JSON. | PRODUCT §22.1 (minimize bytes written); Electron accepts any valid JSON. |
| D10 | Two new ADRs with the next free numbers: the archive ADR (archive format, fflate dependency, reader strategy, worker CSP) in B1; the folder-backup ADR (backup architecture) in C1. | AGENTS.md §6; DEVELOPMENT §15. |
| D11 | No new npm script. Browser perf scenarios run as a second Playwright project in `perf.config.ts` (`npm run test:perf -- --project=web` after `npm run build:web`); the scheduled Performance workflow stays on the Electron project. Decide after a 30-minute spike in B1; the fallback (a new npm script) is reserved for the Product Owner. | New scripts require permission-configuration edits. |

## Tasks

| ID | Outcome | Depends on | Status |
| --- | --- | --- | --- |
| A | Installable app (manifest, icons, publication allowlist, `theme-color`) and one `persist()` request; storage-protection status line. | Icon files from the Product Owner (O-Q4) | Blocked on icons |
| B1 | ZIP archive core, `fflate@0.8.3`, export worker, "Export Notes…", Data menu block, CSP `worker-src 'self'`, archive ADR, export perf scenario. | — | Done |
| B2 | Import: central-directory reader, hostile-archive hardening, confirmation, replace and reload, recovery from an invalid stored head. | B1 | Done |
| C1 | Chromium folder backup: picker, handle storage, backup worker, status and attention dot, permission handling, folder-backup ADR, backup perf scenario. | B1 | Done |
| C2 | "Restore from Folder…" through B2's pipeline with a folder source. | B2, C1 | Ready |

Working-task count: 5. The final owner acceptance rule (AGENTS.md §8) applies: after all five tasks the initiative stays `Awaiting owner acceptance` until the Product Owner accepts the delivered result.

### Common validation block (every task)

- **Tier:** High Risk (`docs/DEVELOPMENT.md` §9): persistence and attachment boundaries, worker process boundary, security controls (CSP, publication allowlist, hostile input), new dependency (B1).
- **Development loop:** `npm test -- <paths>`, `npm run typecheck`, `npm run lint`, `npm run test:web -- <spec>`, `npm run test:web:built -- <spec>` (real meta CSP), `npm run format:check:changed`.
- **Gate before each task commit:** `npm run check`; `npm run audit` (mandatory in B1); full `npm run test:web:built`; `npm run test:mutation -- --mutate <changed src/application files>` with survivors reviewed; `npm run validation:snapshot`.
- **Electron E2E:** run `npm run test:e2e` once on the clean starting commit as a baseline. Reuse it for a task whose diff touches no file imported by `src/electron/**` or `src/renderer/**` and no Electron dependency; the reviewer checks this from `git diff --name-only`. Rerun otherwise.
- **Container run `npm run test:web:chromium`:** after B1's lockfile change it requires the owner's `make setup`; report and continue.
- **Electron performance suite:** not needed (no Electron path changes); record this reason in the task evidence.
- **Roles:** independent Reviewer for every task; separate Product Verifier for B1, B2, C1, C2 (A when its status line is added).
- **Documentation:** `docs/PRODUCT.md` new `## 24. Browser Data Safety` (24.1 Installation and Storage Protection, 24.2 Notes Archive, 24.3 Export, 24.4 Import, 24.5 Automatic Folder Backup, 24.6 Restore from Folder) and §1.4; `docs/ARCHITECTURE.md` (browser data safety with PRODUCT §22.1 assessments); `docs/SECURITY.md`; `src/web/README.md`; `deployment/github-pages/README.md`; `docs/DEVELOPMENT.md` where commands change. Numeric limits appear only in PRODUCT. Respect `npm run check:docs` block and section size limits. Add each new leaf section to `BOUNDARY_SECTIONS` in `scripts/check-requirement-coverage.mts` with an `@requirement PRODUCT.md §24.x` marker (E2E marker under `e2e/web/` for boundary sections).
- **Visual evidence:** Chrome screenshots of the Data menu block (light, dark, 390 px wide), each dialog, the status lines and the attention dot; inspect each image. HIG check per PRODUCT §1.3.
- **Specs:** each new `e2e/web` spec starts with `// @editing-modes: independent`, uses isolated contexts from `fixtures.mjs`, and keeps the total added E2E time near 90 s.

### Task A — installable app and persistent-storage request

- **Files:** `src/web/index.html`; `src/web/public/manifest.webmanifest` and the three owner-supplied PNGs (flat names); `src/web/storage-persistence.ts` and test; `src/web/main.tsx`; `src/web/appearance.ts`; `scripts/web-release/policy.mts`, `package.mts`, `release.test.mts`; `scripts/web/static-server.mts` (`.webmanifest` MIME); `scripts/web/manifest.test.mts`; `e2e/web/installability.spec.mjs`, `e2e/web/package.spec.mjs`; `assets/icons/README.md`; docs; `scripts/check-requirement-coverage.mts`; this plan.
- **Constraints:** manifest `name` and `short_name` "Tree", `id`, `start_url` and `scope` at the origin root, `display` `standalone`, icons 192 and 512 (`purpose: any`), `theme_color` and `background_color` `#fbf8f1`; `<meta name="theme-color">` for light (`#fbf8f1`) and dark (`#3f3f3f`) with `prefers-color-scheme`, updated when the Appearance choice changes (report the unavoidable light launch flash in dark mode). Allowlist exact root names only; still no HTML, SVG or directories; these files are current-only. `persist()`: once per load after the editor is ready, only when `navigator.storage?.persisted()` is not true; ignore the result and errors; never block startup. Storage-protection status line in the menu footer (O-Q1). No service worker, no IndexedDB change.
- **Tests:** unit for `storage-persistence.ts` (skip when persisted, one call otherwise, missing API, rejection, throw); manifest contract (members, icon files, PNG dimensions from IHDR, flat names); release tests (new files pass; HTML, SVG, nested and unlisted names fail); E2E dev and built (manifest and icons fetched; CDP `Page.getAppManifest` without errors; `Page.getInstallabilityErrors` recorded, only manifest-field errors fail; `persist` stub called once and not when persisted; rejecting stub causes no page error; `theme-color` follows Appearance); built CSP otherwise unchanged.
- **PRODUCT §22 assessment:** one `persisted()` read and at most one `persist()` call per page load; no writes, no interactive CPU, no memory growth.
- **Acceptance:** tests pass in `npm run test:web` and `npm run test:web:built`; `npm run build:web` output equals the expected file set; release tooling accepts it; the reviewer confirms the allowlist stays an exact-name list.

### Task B1 — ZIP archive core and export

- **Files:** `package.json` and `package-lock.json` (`"fflate": "0.8.3"` in `dependencies`); `src/web/storage-schema.ts` (database constants, `openDatabase`, read helper extracted from `services.ts` without behavior change); `src/application/notes-archive/` (entry-name policy, limit constants, export planning, ports) with unit and property tests; `src/web/archive/zip-writer.ts` (fflate, `Uint8Array` only, Node-importable); `src/web/workers/archive.worker.ts` and its protocol module; `src/web/data-menu.ts` (flush, worker, Blob, anchor download, progress and cancel); `src/web/index.html`, `src/web/styles.css`; `scripts/web/build.mts` (`worker-src 'self'`, worker bundling); `e2e/web/export.spec.mjs`, `e2e/web/data-helpers.mjs`; `e2e/web/package.spec.mjs`; `src/infrastructure/main/notes-archive-compat.test.ts` (extract an exported archive and load it with `createFileServices`); perf scenario (D11); the archive ADR under `docs/decisions/` and its index row; docs; `scripts/check-requirement-coverage.mts`.
- **Constraints:** first step is a deterministic test that embeds each ZIP signature in a stored entry and round-trips it through fflate `Unzip`, kept as a regression test of D3. Export source is the IndexedDB head after `store.flushPersistence()`, validated with `validatePersistedState` (invalid head: refuse). Archive content is exactly `document.json` then referenced `attachments/<id>.png` sorted by id; no directory entries or other files. One module owns limits (entry count within ZIP32, document bytes, 25 MiB per image, total bytes); export refuses before producing a download when a limit would be exceeded and suggests the folder backup on Chromium. Missing images per O-Q2b. The worker holds at most one image and posts transferred `ArrayBuffer` chunks; the main thread only appends chunks to a Blob and clicks an anchor. Disabled in the locked save-failure state (PRODUCT §16.2) and while another export runs. Use `ReadableStream` reader loops and APIs available in Safari 16 and Firefox 114. Ban fflate async APIs and `unzipSync` in production code (ESLint `no-restricted-imports` if cheap). Install with `npm install --save-exact fflate@0.8.3` after the owner approves the command; verify with `npm run audit`.
- **Tests:** unit and property with real fflate (entry order and names, deflate versus stored, limit refusal, round trip through `unzipSync` as a test-only oracle, Electron compatibility, random documents and attachment sets); worker protocol contract; E2E (seed notes and images, export, parse the download, compare with the IndexedDB head and blobs; a worker is created; cancel leaves no download; invalid head refused; typing works during a large export).
- **Perf:** large profile (target 100,000 nodes and a few hundred images): main-thread long tasks and total blocking time, worker wall time, peak heap, output size; results through `perf/results.ts`; not part of the release gate.
- **Acceptance:** tests above; full Chrome suite; audit clean; Electron-compatibility test passes; perf record in task evidence; Reviewer and Product Verifier report no meaningful issues.

### Task B1 results (2026-10-20)

- Delivered as specified; ADR 0022 records the format, fflate constraints, reader strategy and worker CSP. PRODUCT §24, §24.2 and §24.3 own the behavior and limits. §24.1 is intentionally absent until Task A adds it before §24.2.
- D3 proven: `src/web/archive/zip-writer.test.ts` shows fflate `Unzip` misreads stored entries containing the local-header, data-descriptor or central-directory signature; central-directory reading is exact.
- D11 adopted: `perf.config.ts` has projects `electron` and `web`; `npm run test:perf` builds both targets; `check:full`, `make perf-electron` and the Performance workflow select `--project=electron`. No new npm script.
- Delegated choices (O-Q5): non-modal activity panel at the lower right above the status bar with Cancel or OK; success closes after six seconds; missing-image and failure results stay until OK; file name `Tree Notes YYYY-MM-DD.zip`; export disabled while locked or running; stored values that are not usable PNG byte arrays count as missing; limits 65,535 entries, 256 MiB document, 25 MiB image, 2,147,483,647-byte archive. PRODUCT §24.3 records the wording.
- Review corrections: while the §16.2 save-failure banner is visible, the panel moves to the upper right below the menu button so both stay visible (an open menu can cover it until closed); `AsyncCompress` and `fflate/*` subpath imports added to the ESLint ban; a real-writer test pins `ArchiveBudget` to fflate's actual output size; E2E covers a crashing worker and Cancel while a worker sends chunks.
- Observation for a later task (not scheduled): Escape does not dismiss the activity panel; its buttons are reachable with Tab from the menu button.
- Deferred to C1: the over-limit export messages must add the folder-backup suggestion on Chromium once "Back Up to Folder…" exists.
- For B2: reuse `ARCHIVE_LIMITS`, `attachmentEntryName`, `DOCUMENT_ENTRY_NAME` and `NotesArchiveError` from `src/application/notes-archive/archive-policy.ts`; the worker protocol in `src/web/workers/archive-protocol.ts` and the panel in `src/web/data-menu.ts` extend to import; `e2e/web/data-helpers.mjs` has IndexedDB, seeding and archive-reading helpers; the dev server needs no further `optimizeDeps` change for fflate `Inflate`.
- Measured: large profile (100,000 nodes, 300 images, 259 MiB archive) exported in 0.9 s with no main-thread long task and 1.6 MiB main-thread heap growth.
- Sandbox note: in Claude Code, `npm run test:web*` and `npm run test:mutation` need execution outside the sandbox, because the sandbox forbids binding local ports.

### Task B2 — import

- **Files:** `src/application/notes-archive/` (import state machine, central-directory parser, rules) with corpus, property and fuzz tests; `src/web/archive/zip-inflate.ts`; `src/web/workers/archive.worker.ts`; `src/web/data-menu.ts` (file input, confirmation dialog per O-Q2a, progress, errors); `src/web/services.ts` (after commit, later `save` or `write` calls fail with the existing inactive-session error); `src/web/index.html`, `src/web/styles.css`; `e2e/web/import.spec.mjs`; docs (PRODUCT §24.4, SECURITY hostile-archive threat model); `scripts/check-requirement-coverage.mts`.
- **Security invariants (the Reviewer traces each):**
  1. One end-of-central-directory record within the last 64 KiB plus 22 bytes; reject multi-disk, ZIP64 sentinels or extra fields, a comment past the end, a central directory outside the file, a count mismatch, or a count above the limit.
  2. Per central record before reading payload: signature; no encryption; method 0 or 8; strict UTF-8 name equal to `document.json` or `attachments/<id>.png` with `isValidAttachmentId` and an id length cap; reject other names (O-Q2c), directory entries, exact and case-insensitive duplicates; sizes within limits; offsets inside the file and before the central directory; no overlapping entries; compressed total at most the file size.
  3. Limits apply to bytes actually produced; inflation stops at the cap; declared size and CRC32 must match; a running total is capped.
  4. The local header repeats the central name and method.
  5. `document.json` first: size cap, `JSON.parse`, `validatePersistedState` and `parsePersistedState`, then referenced ids via `collectAttachmentIds`; unreferenced entries are skipped; missing referenced images per O-Q2b.
  6. Each referenced image passes `validateAttachmentBytes(bytes, decode)` with `createImageBitmap`; one image in memory at a time.
  7. Never overwrite an existing blob: equal bytes are skipped, different bytes reject the archive; newly written ids are removed on failure.
  8. Commit is one transaction that puts `document/head`, after `store.flushPersistence()` with an inert modal; then retire the session and `location.reload()`.
  9. Import works when the stored head is invalid (recovery path) and is disabled in the locked save-failure state.
  10. Every failure leaves current notes byte-identical and names the first violation; cancel before commit terminates the worker and removes staged blobs.
- **Tests:** unit corpus of synthetic archives (zip bomb, size lies, many entries, traversal and absolute names, backslashes, NUL, mixed case, nested directories, directory entries, duplicates, encrypted, unsupported method, ZIP64 markers, truncation, missing end record, offsets past the end, overlap, local-header mismatch, CRC mismatch, huge comment, invalid UTF-8, invalid document JSON, schema, version or depth, bad or oversize image, missing referenced image, conflicting blob, Finder artifacts); property (export then import is identity; name classifier); seeded fuzz with a time bound; E2E (export in context A, import in context B with `setInputFiles`, confirm, reload, compare text, ids, expansion, location and image bytes; cancel leaves data unchanged; two hostile archives rejected with the head unchanged; injected `IDBObjectStore.prototype.put` failure leaves the head unchanged and staged blobs removed; recovery from an invalid head; real `filechooser` path once).
- **PRODUCT §22 assessment:** streamed file read in the worker, no main-thread parsing, batched transactions; record measured import time and peak memory.
- **Acceptance:** tests above; mutation run on the new `src/application` files with survivors reviewed; Reviewer (security focus) and Product Verifier clean.

### Task B2 results (2026-10-20)

- Delivered as specified. PRODUCT §24.4 owns the behavior, accepted archive form and messages; SECURITY records the hostile-archive model; ARCHITECTURE records the import flow and its §22.1 assessment. No ADR: ADR 0022 already decided the reader strategy.
- Reader: `src/application/notes-archive/zip-reader.ts` (own central-directory parser, local-header check, 16 KiB Deflate slices, size and CRC-32 checks); `import-notes.ts` (document validation, staging, rollback); `crc32.ts`; test-only `src/application/test/zip-builder.ts`. Web: `src/web/archive/zip-inflate.ts`, `import-job.ts`, `src/web/attachment-validation.ts` (shared with `services.ts`), worker and `data-menu.ts`.
- Delegated choices (O-Q5): the end record must be the last 22 bytes (any comment or trailing bytes reject the archive); extra fields, entry comments and version needed above 2.0 reject it; the image ID cap is 251 characters (the 255-byte file-name limit of the desktop data directory); the worker writes each image with a journal key `import-staged:<id>` in `preferences` (a new preferences key, within D1); the head replacement ends the journal in the same transaction; cancel and failure remove every journaled image, and the next start removes those of a closed tab (review finding); names and `document.json` keep a byte-order mark and are therefore rejected; the dialog's current-note counts are read when the archive check ends; the dialog title is "Replace Current Notes?", buttons Export Current Notes First (leading edge), Replace Notes, and Cancel (default, rightmost); Export Current Notes First keeps the dialog open and reports in it, and is hidden without valid current notes; no message after the reload. PRODUCT §24.4 records the wording.
- Commit safety: the page flushes, then suspends its own writes (`DataSession.suspendWrites`) before the worker replaces the head, because a later autosave (for example from scrolling) would otherwise write the previous document over the import. A failed commit resumes writes; a worker that stops during the commit causes a reload instead.
- Review corrections: the native `<dialog>` carries an explicit `role="dialog"`, because the editor's global key handlers (Vim command panel) leave keys only to `[role="dialog"]` targets; the staged-image journal above; BOM rejection; counts read at the end. Accepted as recorded rules or residual risk: a stored non-PNG value under an archive image ID rejects the archive (never overwrite); a worker that stops during the commit reloads without a message; `document.json` is allocated at its declared, limited size before inflation.
- Measured (`perf/web/import.spec.mjs`, large profile, 259 MiB archive): preparation 2.9 s, replace and reload 0.14 s, no main-thread long task, 1.4 MiB main-thread heap growth. Worker memory is bounded by the central directory, the document and one image.
- For C1: the folder source of C2 can reuse `prepareNotesImport` by adding a directory-handle `ArchiveFile`-like source; `prepareNotesImport` currently takes an `ArchiveFile`, so C2 needs either a second entry point that accepts a document and an image reader, or a folder adapter. Decide in C2.

### Task C1 — automatic folder backup (Chromium only)

- **Files:** `src/application/folder-backup.ts` (sequencer, coalescing, status model; injected clock and ports) with unit and property tests; `src/web/backup/backup-controller.ts` (feature detection, picker, handle storage, startup permission check, worker lifecycle, status and attention dot); `src/web/workers/backup.worker.ts`; `src/web/file-system-access.d.ts` (local ambient types; no `@types` package); `src/web/services.ts` (an `onSaved` notification after a successful head write); `src/web/index.html`, `src/web/styles.css`; `e2e/web/backup.spec.mjs`; `e2e/web/data-helpers.mjs` (picker stub, OPFS reader, permission stubs); perf scenario extension; the folder-backup ADR under `docs/decisions/` and its index row; docs (PRODUCT §24.5, SECURITY, README warning against using one folder from two Macs, for example through iCloud Drive).
- **Constraints:** after each successful IndexedDB save the main thread posts only a small "saved" message; the worker reads the head in one short read-only transaction, serializes it and writes. The worker lists `attachments/` once at startup into a set, writes each missing referenced image once, then writes `document.json` through `createWritable()` and `close()`; it never writes the document after an image write failed. Coalescing per D7 and O-Q3c. The worker interface has no delete operation. Permission: the main thread calls `queryPermission` before starting the worker and shows "paused" when not granted; resuming requires a click that calls `requestPermission`; never from a keystroke. The worker classifies write errors (permission, not found, quota, other). Existing `document.json` in a chosen folder per O-Q3a. Stop and Change remove the stored handle and terminate the worker; files stay. Hidden when `showDirectoryPicker` or `createWritable` is missing. `pagehide` terminates the worker without a warning (IndexedDB is the source of truth). The worker makes no network calls and accepts no code; record that the page meta CSP does not cover worker scripts in `docs/SECURITY.md`.
- **First step (probe):** in headless Chromium under the built CSP: `navigator.storage.getDirectory()`, a module worker, `createWritable` in a worker on an OPFS handle, handle storage in IndexedDB and cloning to a worker.
- **Tests:** unit and property with a fake clock and fault-injecting fake handles (at most one run in flight and the final version always written, images before document, document skipped after image failure, no delete operation, status transitions, retry, startup scan); protocol contract (the "saved" message stays below a few hundred bytes and carries no document); E2E with OPFS through the picker stub (enable, status, folder equals head and blobs with no stray temporary files; typing updates the file within the interval; a new image is written before the document; reload resumes without a picker; `queryPermission` returning `prompt` shows paused and a click resumes; removing the directory produces a visible failure; unsupported browser shows no backup controls; a non-empty folder shows the three choices; rapid saves produce one trailing write).
- **Perf:** large profile, backup off versus on, alternating repetitions: input-to-paint p50, p95 and max; long tasks and total blocking time; autosave completion time; backup lag; bytes written per minute while typing; heap. The relative comparison within one run is the guard; OPFS does not measure real disk speed, but main-thread cost does not depend on it.
- **PRODUCT §22 assessment:** main thread adds one small message per save plus status updates; worker CPU is O(document) per run and O(image) once per image; disk writes bounded by the interval; memory is the id set plus one document and one image.
- **Acceptance:** tests above; perf record with no measurable main-thread regression; Reviewer and Product Verifier clean.

### Task C2 — restore from folder (Chromium only)

C1 already delivered `folder-source.ts`, its fake-handle tests, `prepareNotesFromSource`, the worker's `restore` request, source byte counts and the shared confirmation/commit pipeline, because C1's approved existing-folder dialog needs Restore from This Folder. Reuse those instead of implementing a second pipeline. C2 still owns the standalone menu command and clean-profile/invalid-head recovery and failure E2E. Trace active-backup/source-folder races during restore; C1's restore entry is reached only with backup off or paused.

- **Files:** `src/web/archive/folder-source.ts` (reads `document.json` and referenced `attachments/<id>.png` from a read-only directory handle into the B2 pipeline) with fake-handle tests; `src/web/data-menu.ts`; `e2e/web/restore.spec.mjs`; docs (PRODUCT §24.6, README).
- **Constraints:** same validation, limits and confirmation as import (PRODUCT §20.7, O-Q2a); `showDirectoryPicker({ mode: 'read' })`; other folder content is ignored (the reject-everything-else rule applies to archives only); no startup prompt (O-Q3b).
- **Tests:** unit with fake handles (missing file, invalid document, bad image, conflicting blob); E2E (back up to OPFS, delete the IndexedDB database, reload, restore through the stubbed picker, compare; recovery from an invalid head; failure leaves notes untouched).
- **Acceptance:** tests above; Reviewer and Product Verifier clean. Move lasting knowledge into PRODUCT, ARCHITECTURE, SECURITY and README. Once A is also done, set the initiative to `Awaiting owner acceptance`; missing icons do not waive A or final acceptance.

### Task C1 results (2026-10-20)

- Delivered automatic Chromium folder backup, saved notifications, worker sequencing, persisted handle, permission queries and click-only Resume, status and attention dot, occupied-folder choices, and ADR 0023. One primary implementation session used. No dependency, permission configuration, Electron or renderer runtime changes.
- Delegated choices (O-Q5): fixed deadlines prevent ongoing typing from starving backup; runs start at least the PRODUCT §24.5 interval apart, with folder I/O adding to lag. Paused backup changes the existing control to Resume Backing Up… and offers Resume, Stop, Choose Another Folder and default Cancel. Stop forgets the handle and keeps files. Choosing another folder preserves the previous choice until the new one is confirmed; cancelling preserves it across reload. An existing-folder Restore uses the shared import validation, journal, confirmation and commit pipeline, and does not enable backup. PRODUCT §24.5 owns these behaviors and wording.
- Durability edges: images close before document replacement; startup retries empty files left by failed image writes; case-colliding image names fail before overwriting a completed image. Missing stored images are skipped and counted. No filesystem delete operation exists in the worker destination. Existing completed images remain immutable by identity; external edits and concurrent writers are unsupported.
- Measured on the large synthetic profile: p95 input-to-paint about 32 ms both off and on, no main-thread long tasks, backup lag 6.2–7.2 seconds after the final save, two compact document writes per typing sample, no image rewrites. OPFS establishes API wiring and main-thread cost, not physical disk speed or native permission persistence. The performance suite owns its numeric guards and artifacts.
- Standard checks, audit, full built-browser suite and affected final built/development backup cases pass. Scoped mutation run: 216 mutants, 211 killed, one timeout, four benign survivors (redundant stopped checks, unspecified sort order and clearing an absent timer). Independent Reviewer and Product Verifier found no meaningful issues. Electron baseline 856/856 at `857a783` remains valid: changed runtime modules are browser-only, confirmed by review.
- Linux Chromium container validation remains blocked: the dependency image matching the current lockfile is absent. The owner must run `make setup` before that separately gated stage. Do not count this stage as passed. Native folder selection and browser-restart permission behavior remain O4 in owner round 2 after C2; they are not a pre-commit gate.

## Minor gaps resolved by the planner

| Task | Gap | Choice | Principle |
| --- | --- | --- | --- |
| A | Manifest identity and scope | Name "Tree"; `id`, `start_url`, `scope` at the origin root | PRODUCT §1.3, §20.5; SECURITY reserves the origin for Tree |
| A | Colors | Light surface manifest colors; per-appearance `theme-color` following Appearance | PRODUCT §20.5 |
| A | `persist()` timing and denial | Once per load after ready; ignore denial | PRODUCT §1.1 Durability, §20.4 |
| B1 | What is exported | Flushed saved head, only referenced images | PRODUCT §16.1; ARCHITECTURE §13 |
| B1 | Over-limit or invalid data | Refuse before download with a message | PRODUCT §1.1 Durability |
| B2 | Unreferenced image entries | Ignored, never stored | ARCHITECTURE §13 |
| B2 | Import while locked or with an invalid head | Disabled when locked; allowed with an invalid head | PRODUCT §16.2; §1.1 Durability |
| C1 | Permission lost | Paused status; resume only by click | PRODUCT §20.4 |
| C1 | Folder write errors | Visible failed status; retry on the next version and periodically | PRODUCT §1.1 Durability |
| C2 | Restore behavior | Same confirmation and strictness as import | PRODUCT §20.7 |

## Verification inventory

| Task | Automated | Owner required | Capability unresolved |
| --- | --- | --- | --- |
| A | Manifest contract, release tooling, dev and built E2E, CDP manifest report, `persist` stub | O1 install and launch in Chrome on macOS | Real `persist()` grant; address-bar install icon without a service worker; installed-window shortcut routing |
| B1 | Rules, writer, Electron compatibility, worker protocol, download parse, perf | O2 real export | Safari and Firefox export; Chrome launch in the Claude Code sandbox; container image |
| B2 | Hostile corpus, property, fuzz, import and failure E2E | O3 import into a second profile | Safari and Firefox import |
| C1 | Sequencer, fake handles, OPFS E2E, perf | O4 real folder and restart permission behavior | Headless OPFS and worker `createWritable` (probe); Chrome blocked-folder rules |
| C2 | Folder source, wipe-and-restore E2E | O5 restore into a clean profile | — |

## Probes to run before the first task

- P1: `npm run test:web -- --list`, then `npm run test:web -- storage` — does Chrome start in the Claude Code sandbox? If not, report the owner's supported action.
- P2: `npm run audit` baseline (repeat after the fflate install).
- P3: `npm run test:e2e` on the clean starting commit (Electron baseline).
- P4 (in A): CDP `Page.getAppManifest` and `Page.getInstallabilityErrors` in headless Chrome.
- P5 (in C1): the C1 first-step probe.
- P6: `npm run test:web:chromium` only after the owner runs `make setup`.

## Owner involvement

- Working tasks: 5; final owner acceptance required.
- Blocking owner actions: icon files (O-Q4, blocks A only); approval of `npm install --save-exact fflate@0.8.3` (B1); optional `make setup` before container runs.
- Confirmed verification rounds: 2 plus the final acceptance round. None is a pre-commit gate.

| Round | When | Check | Owner action and expected result |
| --- | --- | --- | --- |
| 1 | After A, B1 and B2 are committed | O1 (A) | Open `npm run preview:web` (127.0.0.1:5175). Install Tree from the Chrome menu. Check name, icon, standalone window, same notes as in the tab, Cmd+Q, Cmd+W and Cmd+P behavior, dark-mode launch flash, and `await navigator.storage.persisted()` in DevTools. |
| 1 | Same | O2 (B1) | Export the real notes and keep the file; `unzip -l` shows `document.json` and `attachments/`. Do not test import on the real profile. |
| 1 | Same | O3 (B2) | In a second Chrome profile, import that file and compare notes and images; import a tampered file and see the rejection. |
| 2 | After C1 and C2 | O4 (C1) | Choose a new subfolder (for example `Documents/Tree Backup`), edit, see files and status; quit and reopen Chrome; record whether the backup resumes or asks to resume. |
| 2 | Same | O5 (C2) | In a clean profile, Restore from Folder and compare. |
| Final | After round 2 | Acceptance | Accept or reject the delivered commit set. |

Possible additional rounds: icon rework, optional Safari or Firefox checks (otherwise documented as unverified), sandbox or permission approvals for Chrome tests, rejection repairs.

## Budget

- Implementation: at most 8 primary sessions (A 1, B1 2, B2 2, C1 2, C2 1); at most four task commits per session; two recovery attempts per blocker; one review-correction pass per task (full repeat only for substantial fixes). One commit per task; a behavior-preserving refactor may land first only if it passes the same gate.
- Closure allowance: 1 session, up to 2 commits, for rejection repairs. Waiting for acceptance consumes no implementation budget.

## Risks

1. Chrome permission behavior and blocked folders (O4). 2. Installed-window shortcut routing and Quit durability (O1). 3. The publication allowlist and CSP are security controls: exact names only, no HTML or SVG. 4. Memory: 25 MiB images, large decodes, large Blob exports. 5. ZIP32 only: very large libraries cannot export; Chromium users use the folder backup. 6. A synchronized folder (iCloud Drive) sends content off the machine by the user's choice, and two Macs writing one folder conflict; document both. 7. CI budgets (8-minute Chrome job, 5-minute Performance job). 8. The initial backup of many images delays the first `document.json`; show progress. 9. Safari and Firefox remain unverified; Safari may delete script-written data after 7 days without interaction, so Safari users depend on Export.

## Next task

Probes P1 to P3 passed on 2026-10-20 (Chrome starts outside the Claude Code sandbox; audit clean; Electron E2E 856/856 at `857a783`). B1, B2 and C1 are done; Codex also verified Chrome, built CSP, OPFS worker writes and handle persistence. Then:

- if `src/web/public/icon-512.png`, `icon-192.png` and `apple-touch-icon.png` exist, take **Task A**;
- otherwise take **Task C2** and leave A blocked on the icons.

## Resume prompt

Continue the browser data durability initiative from `plans/browser-data-durability.md`. Take the next task named in its "Next task" section, state it first, and follow its files, constraints, tests and the common validation block. Do not push or publish.

## Sources

- fflate advisory: [GHSA-px8p-9vwx-vf98 / CVE-2026-45820 on OSV](https://osv.dev/vulnerability/GHSA-px8p-9vwx-vf98); [fflate v0.8.3 release](https://github.com/101arrowz/fflate/releases/tag/v0.8.3); fflate 0.8.3 `esm/index.mjs` (`Zip.add`, `Unzip.push`).
- Chrome: [Revisiting Chrome's installability criteria](https://developer.chrome.com/blog/update-install-criteria); [File System Access](https://developer.chrome.com/docs/capabilities/web-apis/file-system-access); [Persistent permissions](https://developer.chrome.com/blog/persistent-permissions-for-the-file-system-access-api).
- MDN: [createWritable](https://developer.mozilla.org/en-US/docs/Web/API/FileSystemFileHandle/createWritable); [Storage quotas and eviction criteria](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria).
