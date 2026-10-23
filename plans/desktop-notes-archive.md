# Desktop Notes Export and Import

Status: Awaiting owner acceptance

## Objective

Add **Export Notes…** and **Import Notes…** to the Electron application so notes move in both directions between the browser version and the desktop application. Both use the notes archive of [PRODUCT §24.2](../docs/PRODUCT.md#242-notes-archive). Older document schema versions migrate on load; a newer schema version is rejected.

Sources of truth: [PRODUCT §16](../docs/PRODUCT.md), [§17](../docs/PRODUCT.md), [§22](../docs/PRODUCT.md), [§24](../docs/PRODUCT.md#24-browser-data-safety); [ARCHITECTURE](../docs/ARCHITECTURE.md) persistence and browser archive sections; [ADR 0008](../docs/decisions/0008-fsync-based-persistence-durability.md), [ADR 0009](../docs/decisions/0009-bounded-loss-document-generations.md), [ADR 0010](../docs/decisions/0010-bounded-save-retries-and-failure-lock.md), [ADR 0022](../docs/decisions/0022-notes-archive-format-and-worker.md).

## Authorization

The Product Owner authorized the whole initiative on 2026-10-23 in Claude Code, including decisions D1–D4 and the recorded defaults below. Initiative-wide approval covers T1–T6 and required review corrections. Closure requires final owner acceptance (six working tasks).

Out of scope: folder backup or restore on desktop, Show in Finder after export, keyboard shortcuts, command-panel entries, and browser behavior changes beyond moving shared code.

## Owner Decisions

1. Same archive format and validation as browser §24.3/§24.4, so archives move both ways. Older schema versions migrate; a newer schema version is rejected.
2. A new macOS **File** menu holds **Export Notes…** then **Import Notes…**.
3. Export uses a native save panel with the default name `Tree Notes YYYY-MM-DD.zip` (local date), saves pending edits first, runs in the background with progress, Cancel and a result. The desktop presentation is delegated (existing desktop UI and PRODUCT §1.3 HIG).
4. Import uses a native open panel and the browser confirmation **Replace Current Notes?** with **Export Current Notes First** / **Replace Notes** / **Cancel** (Cancel default, Escape cancels).
5. Replacement moves (renames, never copies) the current `document.json`, `document.json.tmp`, `document.json.bak`, every `document.<N>.json` and `attachments/` into `userData/Replaced Notes/<YYYY-MM-DD HH-MM-SS>/`, keeping the data-directory layout. Preference files in `userData/data/` stay. Tree never deletes those folders. After success the window reloads; the result shows the folder path with **Show in Finder**. An old document or generation is never opened after a replacement begins.
6. The desktop confirmation describes the moved copy instead of the browser's "cannot be undone" text.

- **D1 — Worker.** One Node `worker_threads` worker per operation, started by the main process and terminated to cancel. The worker opens the dialog-chosen path itself and does ZIP read/write, inflate/deflate, CRC, JSON validation, staging writes and current-notes counts. Main keeps dialogs, the per-image `nativeImage` decode check (one image per request), the directory commit and UI messages. No document crosses IPC; the renderer never receives a path except the replaced-folder display text. Fallback recorded in advance: if T4 shows main-thread decode long tasks over budget, validate PNG decodability in the worker (structure check plus full IDAT inflate through `node:zlib` with scanline-length verification) and report the change.
- **D2 — fflate.** Reuse pinned fflate 0.8.3 on desktop. Move `zip-writer.ts` and `createInflater` to shared `src/infrastructure/archive/` so both platforms write byte-identical archives. Keep ADR 0022's API restrictions.
- **D3 — Replacement mechanism (recorded in the desktop archive ADR).** Staging in `userData/.notes-import/<uuid>/` (durable writes, `attachments/` always created). Commit is one file-service queue operation: durably write journal `userData/.notes-import/commit.json` (staging ID, replaced-folder name); rename old document files and `attachments/` into the replaced folder; rename staged `attachments/` into `data/`; rename staged `document.json` into `data/` last; fsync directories; remove the journal; reset `nextGeneration`. Recovery before the first load rolls forward only: while staged `document.json` exists, everything document-like in `data/` is old and is moved out, then the steps resume (idempotent). Staging without a journal is swept. After commit, main makes `cleanupAttachments` a no-op and rejects `save`/`writeAttachment` until the reloaded renderer calls `load`; the renderer adapter suspends writes so no `.save-error` appears. Export snapshot: inside the queue, hard-link the current candidates into `userData/.notes-export/<uuid>/`; the worker applies the §16.1 newest-valid selection (pure function shared with `load`); referenced attachment IDs are pinned in the cleanup keep set until the export ends.
- **D4 — Edge cases.** (a) Existing replaced-folder name: append ` 2`, ` 3`, …. (b) No stored notes: create no folder; result is `Imported “…”.` only. (c) Failure during Replace Notes before the journal exists: notes unchanged, session resumes, `Import failed. Your notes could not be replaced: <reason>`; after the journal exists: roll forward only, the session stays without writes and asks for a restart, the next start completes it; if it still cannot, loading fails with `The notes import could not be completed: <reason>` and changes no files. (d) A startup that completed an interrupted replacement shows the import result once. (e) Quit during export or archive check cancels it (no file, staging removed); quit during Replace Notes waits for it.

### Recorded defaults (minor or delegated)

| # | Decision | Principle |
| --- | --- | --- |
| m1 | Export then Import order; no shortcuts or command-panel entries | §24 Data block; decision 2 |
| m2 | Export reads the newest stored version that opens | §16.1 |
| m3 | No image-conflict rule on desktop: staging is empty and all current images move away | Decision 5 |
| m4 | Save panel receives only the file name; macOS chooses the folder | §1.3 HIG |
| m5 | In-window activity panel and modal dialog as in the browser; focus returns where it was | §24.3/§24.4 parity, §17.1 |
| m6 | Write failure: `Export failed. The archive could not be saved: <reason>` | §24.3 failure pattern |
| m7 | No `Use Back Up to Folder… instead.` suffix | §24.3 makes it conditional |
| m8 | Incomplete export leaves no archive and an existing file unchanged (hidden sibling temp file, fsync, rename) | §24.3, §1.1 durability |
| m9 | Newer schema reason: `document.json does not contain valid Tree notes. The saved document has an unsupported format.` | Decision 1 |
| m10 | `.tmp` and `.bak` move with the generations | Decision 5 |
| m11 | Items disabled while the window starts; Import stays enabled when stored notes cannot be opened | §24.3/§24.4 availability |

## Repository Findings

- Platform-independent already: `src/application/notes-archive/{archive-policy,export-notes,import-notes,zip-reader,crc32}.ts` and their ports.
- `src/web/archive/zip-writer.ts` and `createInflater` in `zip-inflate.ts` are pure fflate code; `blobArchiveFile`, `export-job.ts`, `import-job.ts`, `folder-source.ts` and the workers are browser-specific.
- `src/web/data-menu.ts` mixes pure text helpers with DOM wiring.
- Load in `src/infrastructure/main/file-services.ts` promotes the newest valid candidate by mtime, so any old generation left in `data/` would be promoted; hence the journal. `nextGeneration` is cached. A save briefly has no `document.json` between renames; export needs a queue-owned snapshot.
- Preferences live in `userData/data/`; the window-bounds saver writes there at any time, so the whole `data/` directory cannot be swapped.
- Production renderer CSP is `worker-src 'none'`. `nativeImage` availability in worker threads is unverified.
- New PRODUCT sections must be added to `BOUNDARY_SECTIONS` in `scripts/check-requirement-coverage.mts`; each new E2E spec needs a first-line `// @editing-modes:` marker. E2E fixtures fail on any visible `.save-error`.
- Unrelated: `src/electron/main/AGENTS.md` cites ARCHITECTURE §7 for IPC caller validation; that reference is stale.

## Tasks

| ID | Outcome | Depends on | Status |
| --- | --- | --- | --- |
| T1 | Shared archive infrastructure and the desktop archive ADR | — | Done |
| T2 | Crash-safe replacement, recovery and export snapshot | T1 | Done |
| T3 | Desktop archive worker, main controller and IPC | T2 | Done |
| T4 | Electron performance guard for archive operations | T3 | Done |
| T5 | Export Notes… user flow | T4 | Done |
| T6 | Import Notes… user flow | T5 | Done |

`WORKING_PLAN.md` is required for T2, T3, T5 and T6.

### T1 — Shared archive infrastructure and the desktop archive ADR (refactor)

- Files: move `src/web/archive/zip-writer.ts`, `zip-writer.test.ts`, `zip-test-utils.ts` to `src/infrastructure/archive/`; split `createInflater` into `src/infrastructure/archive/zip-inflate.ts` (keep `blobArchiveFile` in `src/web/archive/`); update imports in `src/web/archive/*`, `src/web/workers/archive.worker.ts`, `src/infrastructure/main/notes-archive-compat.test.ts`; extract pure text helpers from `src/web/data-menu.ts` into `src/application/notes-archive/archive-messages.ts` (+ test) with browser wording unchanged; add the next-numbered ADR `desktop-notes-archive` in `docs/decisions/` recording D1–D3 and the security posture (paths only from native dialogs; Show in Finder only for a folder main created; renderer receives counts and display text only), update `docs/decisions/README.md`, ARCHITECTURE and `docs/SECURITY.md` path references; adjust lint layering if needed.
- Acceptance: browser behavior unchanged; nothing imports `web/archive/zip-writer`; the application-layer fflate ban still passes.
- Validation: Moderate. `npm run check`; `npm run test:web -- e2e/web/export.spec.mjs e2e/web/import.spec.mjs e2e/web/restore.spec.mjs` (outside the Claude sandbox through approval). No Electron E2E or performance run.
- Roles: primary review.

### T2 — Crash-safe replacement, recovery and export snapshot

- Files: new `src/infrastructure/main/notes-replacement.ts` (+ test, + property test); `src/infrastructure/main/file-services.ts` (+ test): `replaceNotes(stagingDir)`, `recoverInterruptedReplacement()`, `snapshotDocuments()`/`releaseSnapshot()`, `pinAttachments()`/`unpinAttachments()`, post-replace gate, `nextGeneration` reset, extracted pure candidate selection, new `FileOperationEvent` operations; `src/electron/main/index.ts` (recovery before window creation; sweep `.notes-export` and orphan staging); `docs/DEVELOPMENT.md` §9 diagnostics line; ARCHITECTURE "Desktop notes replacement" with the §22.1 assessment.
- Acceptance: injected fs fault at every step yields either the untouched old state (before the journal) or the complete new state with every old file in the replaced folder; no generation, `.tmp` or `.bak` in `data/` after commit; inode identity proves moves; preference files byte-identical; D4a/D4b; failing recovery makes `load` throw and changes nothing; snapshot stable across an interleaved save; cleanup keeps pinned IDs. E2E `e2e/electron/notes-replacement-recovery.spec.ts` (`// @editing-modes: independent`, dedicated app): seeded journal at each mid-commit stage opens the imported notes with old files in `Replaced Notes`; a corrupted imported document shows a load error and never opens the old notes.
- Validation: High Risk. `npm run check`, `npm run test:e2e`, `npm run audit`. No Electron performance run (startup adds one existence check).
- Roles: independent reviewer.

### T3 — Desktop archive worker, main controller and IPC

- Files: new `src/infrastructure/main/notes-archive/{archive-worker,archive-worker-protocol,desktop-export-job,desktop-import-job}.ts` (+ tests); new `src/electron/main/notes-archive-controller.ts` (+ test) with sheet dialogs, worker lifecycle, decode requests through `createPngDecoder(nativeImage)`, commit through `fileServices.replaceNotes`, one-shot import notice, `shell.showItemInFolder` only for the folder main recorded; `src/shared/ipc.ts` (optional `TreeApi` members; invoke channels `tree:notes-choose-export-destination`, `tree:notes-start-export`, `tree:notes-choose-import-archive`, `tree:notes-prepare-import`, `tree:notes-commit-import`, `tree:notes-cancel`, `tree:notes-take-import-notice`, `tree:notes-show-replaced-folder`, `tree:notes-set-menu-state`; events `tree:notes-menu-command`, `tree:notes-progress`; `{ok, …}` results); `src/electron/preload/index.ts`, `ipc-handlers.ts`, `ipc-security.ts` (+ tests); `bootstrap.ts`, `index.ts` (quit cancels jobs and awaits an in-flight commit); `src/infrastructure/renderer/electron-services.ts` (write suspension); `electron.vite.config.ts` only if the worker entry needs it (verify built `out/main` loads it).
- Acceptance: desktop export round-trips through `prepareNotesImport`; a browser-written archive imports through the desktop job; hostile-archive corpus reused; messages match §24.3/§24.4; cancel removes partial output and staging; IPC contract tests (names, validation, untrusted-caller rejection, results). E2E `e2e/electron/notes-archive-boundary.spec.ts` (independent; dialogs and `shell` stubbed through `app.evaluate`): file appears only when complete; cancel leaves no file and keeps an existing one; import into a second profile replaces notes after reload and creates `Replaced Notes`; quit during export, preparation and commit behaves per D4e.
- Validation: High Risk plus security. `npm run check`, `npm run test:e2e` (including `csp.spec.ts`), `npm run audit`. Performance run assigned to T4.
- Roles: independent reviewer.

### T4 — Electron performance guard

- Files: new `perf/electron/notes-archive.spec.ts`; synthetic large-profile helper in `perf/electron/fixtures.ts`; ARCHITECTURE assessment; DEVELOPMENT §12 if it lists scenarios.
- Measures: about 50k nodes and several hundred images including near-limit images; idle vs. export vs. import preparation: key-to-frame latency p50/p95, main event-loop delay, main heap growth, duration. Budgets from the measured baseline; apply the D1 fallback on failure.
- Validation: Low Risk. `npm run check`, `npm run test:perf -- perf/electron/notes-archive.spec.ts`.
- Roles: primary review.

### T5 — Export Notes… user flow

- Files: `src/electron/main/application-menu.ts` (+ test); `src/electron/main/index.ts` (menu rebuild on availability); `src/shared/ipc.ts`, preload and `ipc-handlers.ts` (+ tests): `tree:notes-set-menu-state` (validated `{canExport, canImport}`) and the `tree:notes-menu-command` event, moved here from T3 so they arrive with the menu; new `src/application/notes-archive/desktop-data-operations.ts` (+ test) behind a `DesktopNotesApi` port; new `src/renderer/DataActivityPanel.tsx` (+ test); `src/renderer/App.tsx`, `main.tsx`, `styles.css`; `docs/PRODUCT.md` §9.3 and new §25, §25.1, §25.2; `scripts/check-requirement-coverage.mts`; `@requirement` markers on T3 tests; new `e2e/electron/notes-export.spec.ts` with screenshot baselines.
- Acceptance: menu labels, order and enabled states; `clickApplicationMenuItem('File', 'Export Notes…')` with a stubbed save dialog shows progress, writes the file, shows success and closes after 6 s or OK; cancel, write failure and limit refusal; typing during export is saved; geometry shows no overlap with the §16.2 message; running/done/failed panels inspected in light and dark; HIG check recorded.
- Validation: High Risk. `npm run check`, `npm run test:e2e`, `npm run audit`, rerun `perf/electron/notes-archive.spec.ts`.
- Roles: independent reviewer, separate product verifier.
- Owner check (pre-commit, round 1): native save panel opens as a sheet with the default name; cancel does nothing; replacing an existing file is confirmed.

### T6 — Import Notes… user flow

- Files: `application-menu.ts` (+ test); `desktop-data-operations.ts` (+ test) import states; new `src/renderer/ImportConfirmationDialog.tsx` (+ test); `DataActivityPanel.tsx` (result with Show in Finder); `App.tsx`, `main.tsx`, `styles.css`; `archive-messages.ts` desktop wording; `docs/PRODUCT.md` §25.3, §25.4 and a §24 cross-reference; ARCHITECTURE desktop archive subsection; `docs/SECURITY.md`; requirement coverage list and `@requirement PRODUCT.md §25.4` markers on the T2 tests in `src/infrastructure/main/notes-replacement*.test.ts`, `file-services.test.ts` and `e2e/electron/notes-replacement-recovery.spec.ts`; new `e2e/electron/notes-import.spec.ts` (independent) and `e2e/electron/notes-import-dialog.spec.ts` (`both`).
- From the T3 review: the main controller keeps a prepared import (and refuses new operations) until it is cancelled or committed, so a renderer reload or crash during preparation or confirmation must not leave it stuck. Either the renderer calls `cancelNotesOperation` when it starts, or the main process cancels on main-frame navigation and `render-process-gone`; cover the chosen path with a test.
- Acceptance: confirmation counts, size and missing-image line; cancel and Escape leave notes unchanged and remove staging; Export Current Notes First works with the dialog open; Replace Notes reloads into the imported notes with the result panel; Show in Finder calls the stubbed `shell.showItemInFolder`; `Replaced Notes` contents and byte-identical preferences; no old generations in `data/`; one hostile archive and a newer schema rejected; a version 1 document imports and migrates; Import available in the load-error state and disabled when locked; quit during replace completes it; dialog and result panel inspected in light and dark; §20.5 reload lifecycle observed in light and dark; HIG check recorded.
- Validation: High Risk. `npm run check`, `npm run test:e2e`, `npm run audit`, rerun the T4 performance spec.
- Roles: independent reviewer, separate product verifier.
- Owner check (pre-commit, round 2): native open panel; import a real browser export; Show in Finder reveals the folder; reload flash if the agent cannot record it.
- After this commit the initiative becomes `Awaiting owner acceptance`.

## Draft PRODUCT Text

T5 adds to §9.3 after the Tree menu bullet: `* **File** holds **Export Notes…** and **Import Notes…** (§25).` and adds §25–§25.2; T6 adds §25.3–§25.4.

```markdown
## 25. Desktop Notes Export and Import

The desktop application exports and imports the notes archive of §24.2, so notes move between the desktop application and the browser version (§1.4) in both directions: an archive exported by either imports in the other.

### 25.1 Menu Commands

**Export Notes…** and **Import Notes…** are in the File menu, in that order. They have no keyboard shortcuts and no command-panel entries. Both are disabled while the window is starting, in the locked save-failure state (§16.2), and while an export or an import runs. Import Notes… stays available when the stored notes cannot be opened, so an archive can replace them.

### 25.2 Export

Export Notes… opens a save panel named `Tree Notes YYYY-MM-DD.zip` with the local date. Cancelling the panel changes nothing. After a location is chosen, Tree saves pending edits, as Quit does, and exports the newest stored version that opens (§16.1) with every referenced image. Export never changes the stored notes.

Export otherwise follows §24.3: it runs in the background while editing remains available, shows its progress, Cancel and result in a panel at the lower right, leaves out and counts missing or unusable images, and produces no file in the listed failure cases. The archive takes its name only when it is complete: Cancel, a failure or quitting leaves no archive and leaves an existing file of that name unchanged. A file that cannot be written gives `Export failed. The archive could not be saved: <reason>`.

### 25.3 Import

Import Notes… opens an open panel for ZIP files. Cancelling it changes nothing. After a file is chosen, Tree saves pending edits and checks the archive in the background with the panel and Cancel of §24.4. Tree accepts exactly the archives that §24.4 accepts and reports the same reasons; older schema versions open after migration, and notes from a newer version of Tree are rejected. Because import moves every current image away (§25.4), images already stored under the same ID cannot conflict. Quitting during the check cancels it.

The **Replace Current Notes?** dialog of §24.4 says `Your current notes have 987 nodes and 40 images. Importing replaces them and moves them to the Replaced Notes folder.` Without stored notes it says `There are no saved notes.`; with notes that cannot be opened, `The saved notes cannot be opened. Importing replaces them and moves their files to the Replaced Notes folder.` Buttons, default, Escape and Export Current Notes First behave as in §24.4; Export Current Notes First opens the save panel of §25.2. Closing the dialog returns focus to where it was.

**Replace Notes** shows `Replacing Notes…`, disables the dialog, saves pending edits, replaces the notes (§25.4) and reloads the window, which opens the imported notes. Import does not change preferences. The panel then shows `Imported “Tree Notes 2026-10-20.zip”. Your previous notes are in “~/Library/Application Support/Tree/Replaced Notes/2026-10-23 14-05-09”.` with **Show in Finder** and **OK** until OK; Show in Finder selects that folder in the Finder. Without previous notes it shows `Imported “Tree Notes 2026-10-20.zip”.` and closes after six seconds or with OK. Cancel and every failure before the replacement leave the notes unchanged and remove what the import prepared; failures show `Import failed. <reason>` until OK.

### 25.4 Replaced Notes

Replace Notes moves the current `document.json`, its retained generations, any interrupted-save and legacy backup files, and the `attachments` folder into a new folder `Replaced Notes/YYYY-MM-DD HH-MM-SS` (local time) in `~/Library/Application Support/Tree/`, keeping the data-directory layout. Files are moved, not copied. When that name exists, ` 2`, ` 3`, … is appended; nothing is moved and no folder is created when there were no stored notes. Preferences stay in place. Tree never changes or deletes a Replaced Notes folder; the user removes old ones in the Finder.

The replacement is one unit. The imported notes start without retained generations, and a replaced document or generation is never opened again after the replacement begins. If Tree stops during the replacement, the next start completes it before opening the notes and shows the result of §25.3. Quitting during the replacement waits for it. If it cannot be completed, loading fails with `The notes import could not be completed: <reason>` and changes no files.
```

## Owner Involvement

- Working tasks: 6 (final owner acceptance applies).
- Rounds: 3 confirmed — T5 pre-commit (native save panel, about 2 minutes); T6 pre-commit (native open panel, real browser archive, Show in Finder, reload flash if unrecorded, about 5 minutes); final acceptance (round trip both ways with a real browser profile and inspection of `Replaced Notes`). Additional rounds only after a rejected result.
- Unresolved capabilities: Electron E2E outside the Claude sandbox (configured, unverified); `npm run test:web` (needs approval outside the sandbox); screen recording for the flash check (unknown); native NSSavePanel/NSOpenPanel (unavailable to Playwright, hence owner checks); `npm run audit` (needs registry access).

## Budget

- At most 4 task commits per primary session; expected sessions: T1+T2, T3, T4+T5, T6.
- Recovery: 2 attempts per blocker.
- Repair allowance after a rejected acceptance: 2 commits within scope.
- Closure allowance: 1 commit.

## Next Task

Final owner acceptance of the completed desktop export/import initiative.

T6 is implemented and validated. The owner confirmed the native open-panel/Cancel, real browser archive, Finder and light/dark reload checks with “it's fine” on 2026-10-24. Independent review and separate product verification found no meaningful issues. All required automated checks passed after focused test corrections and reducing unit-suite worker concurrency; the previously owner-deferred zod audit advisory remains. Temporary acceptance evidence is in `.scratch/desktop-notes-import/validation.md`; retain it until final acceptance.

For final acceptance, confirm the complete round trip both ways with a real browser profile and inspect the previous notes in Replaced Notes. No implementation task remains. After explicit final acceptance, retire this plan and its index entry under the one-commit closure allowance. The two-commit repair allowance remains unused.

State after T5 (see ARCHITECTURE "Desktop notes replacement" and "Desktop notes archive"):

- [ADR 0024](../docs/decisions/0024-desktop-notes-archive.md) records D1–D3. The shared writer and inflater are in `src/infrastructure/archive/`; wording and failure-reason helpers in `src/application/notes-archive/archive-messages.ts`.
- The worker entry `src/infrastructure/main/notes-archive/archive-worker.ts` builds to `out/main/notes-archive-worker.js`; `createNotesArchiveController` in `src/electron/main/notes-archive-controller.ts` is wired in `index.ts` and exposed through argument-free `TreeApi` members (`chooseNotesExportDestination`, `startNotesExport`, `chooseNotesImportArchive`, `prepareNotesImport`, `commitNotesImport`, `cancelNotesOperation`, `takeNotesImportNotice`, `showReplacedNotesFolder`, `onNotesProgress`). Results are `{ok: true, …}`, `{ok: false, canceled: true}` or `{ok: false, message}`; a commit failure adds `restartRequired`. Messages carry no `Export failed.`/`Import failed.` prefix; the panels add it.
- The main process does not reload after a commit; the renderer must call `suspendNotesWrites()` (`src/infrastructure/renderer/electron-services.ts`) before `commitNotesImport`, `resumeNotesWrites()` when it fails before the journal, and reload the window when it succeeds, then call `takeNotesImportNotice` after `load`.
- `e2e/electron/notes-archive-boundary.spec.ts` drives the bridge directly; T5 and T6 add the menu, panels and their `@requirement PRODUCT.md §25…` markers on the T3 tests. The test entry's `__treeArchiveWorkers.hold` lists worker message types to hold.
- `npm run audit` fails on GHSA-mrhx-c7xc-m3w5 (`zod`), reached only through the dev dependencies `eslint-plugin-react-hooks` and `@stryker-mutator/*`. On 2026-10-23 the Product Owner chose to commit T3 anyway and handle the advisory as a separate dependency task. The T5 audit still reports that advisory but now offers a fix through `npm audit fix`; no dependency change was made. Later tasks continue to report the owner-deferred advisory until the separate task resolves it.
- T4 added `perf/electron/notes-archive.spec.ts` and `seedNotesArchiveProfile` in the performance fixtures. The guard measures key-to-frame latency, actual operation duration, main event-loop delay and sampled main JavaScript heap growth during idle, export and import preparation. It uses real workers, IPC and files; only the native panels are stubbed. The native decoder stayed within the guard, so D1's fallback was not needed. Scenario parameters, measured baseline and ceilings belong to the spec and result artifacts.
- T4 verified active preparation cancellation removes staging and leaves no archive, staging or snapshot file descriptor in the main PID (including worker threads). The check uses `lsof` on macOS and `/proc` on Linux. Main JavaScript heap measurements exclude native image allocations and worker heaps, and timer samples can miss short-lived allocations.
- T5 added the File menu, validated availability IPC and menu-command event, `DesktopDataOperations` behind a `DesktopNotesApi` port, and `DataActivityPanel`. PRODUCT §25–§25.2 and six inspected light/dark panel baselines cover export. The owner confirmed the native save-panel check with “It works” and a menu screenshot; the disabled Import Notes… item was explained as the pending T6 flow.
- Import stays disabled through `canImport: false` in the coordinator until T6 is connected. T6 must replace the interim §25 introduction and §25.1 disabled-import wording with the approved final requirements, then add §25.3/§25.4. The main window already cancels archive work and resets menu availability on main-frame navigation and renderer loss; T5's reload-cancellation test covers export, and T6 still needs import preparation/confirmation lifecycle coverage.
- Independent code review and separate product verification found no meaningful issues in T5. Required automated validation passed apart from the already owner-deferred audit advisory. No further T5 owner check remains. T6 retains its planned pre-commit native open-panel/browser-archive/Finder check, followed by initiative-wide final owner acceptance.

Next-session prompt:

> Finish acceptance of initiative `plans/desktop-notes-archive.md`. T1–T6 and both pre-commit native verification rounds are complete; final initiative acceptance remains pending.
