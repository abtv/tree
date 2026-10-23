# Desktop Notes Archive: Worker Thread, Shared Archive Code and Crash-Safe Replacement

Status: Accepted
Date: 2026-10-23

## Context

The Product Owner wants notes to move in both directions between the browser version and the desktop application through the notes archive of [ADR 0022](0022-notes-archive-format-and-worker.md) and `docs/PRODUCT.md` §24.2. The desktop application stores notes in `userData/data/`: `document.json`, an interrupted-save `document.json.tmp`, retained generations `document.<N>.json`, a legacy `document.json.bak`, and `attachments/<id>.png` ([ADR 0008](0008-fsync-based-persistence-durability.md), [ADR 0009](0009-bounded-loss-document-generations.md)). Preference files share that directory and can be written at any time. Loading promotes the newest valid candidate among the primary, the temporary file and every generation, so an old generation left beside imported notes could reopen the replaced notes. On macOS the Electron main thread routes input to the renderer; archive work there would stall typing (`docs/PRODUCT.md` §1.1, §22). The production renderer CSP has `worker-src 'none'`.

The Product Owner approved these decisions on 2026-10-23, together with the owner-facing behavior: replaced notes move, never copied, to `userData/Replaced Notes/<YYYY-MM-DD HH-MM-SS>/` and Tree never deletes that folder.

## Decision

1. **Worker thread.** Each desktop export or import runs in a new Node `worker_threads` worker started by the main process; cancelling terminates it. The worker opens the path that the native dialog returned and performs ZIP reading and writing, Deflate and Inflate, CRC checks, JSON validation, staging writes and note counts. The main process keeps the dialogs, the per-image PNG decode check through `nativeImage` (one image per request), the commit and the user-visible messages. No document crosses IPC. If the decode check on the main thread exceeds the performance budget, the worker validates decodability itself through a PNG structure check and a full IDAT inflate with scanline-length verification, and the change is reported.
2. **Shared archive code.** fflate 0.8.3 remains the single ZIP implementation and becomes a runtime dependency of the desktop main-process bundle as well. The writer and inflater move from `src/web/archive/` to `src/infrastructure/archive/`, so both platforms write byte-identical archives with one implementation; progress, result and confirmation wording moves to `src/application/notes-archive/archive-messages.ts`. ADR 0022's restrictions on fflate APIs and its own central-directory reader stay unchanged.
3. **Crash-safe replacement.** Import stages the validated `document.json` and every referenced image with durable writes in `userData/.notes-import/<id>/`, which always contains `attachments/`. The commit is one operation in the file-service queue, so no save or attachment cleanup interleaves:
   1. durably write the journal `userData/.notes-import/commit.json` naming the staging directory and the replaced-notes folder;
   2. rename the current document files (primary, temporary, legacy backup and every generation) and `attachments/` into the replaced-notes folder;
   3. rename the staged `attachments/` into `data/`;
   4. rename the staged `document.json` into `data/` last;
   5. flush the directories and remove the journal; reset the cached generation number.

   Recovery runs before the first load and only rolls forward: while the journal exists and the staged `document.json` is present, every document file in `data/` is old and is moved out, then the remaining steps resume. The steps are idempotent. A staging directory without a journal is removed. If recovery cannot finish, loading fails and changes no files. After a commit the main process rejects saves and attachment writes and makes cleanup a no-op until the reloaded renderer loads, and the renderer suspends its writes.
4. **Export snapshot.** Export takes its source inside the file-service queue by hard-linking the current document candidates into `userData/.notes-export/<id>/`; saves only rename files, so the links stay stable. The worker applies the same newest-valid selection as loading. The referenced attachment IDs stay in the cleanup keep set until the export ends. The archive is written to a hidden sibling file, flushed and then renamed, so an incomplete export leaves no archive.
5. **Boundary.** File paths come only from native dialogs in the main process. Show in Finder accepts only the replaced-notes folder that the main process created. The renderer receives counts and display text, never document content.

## Consequences

- Editing stays responsive during desktop archive work; a performance guard measures typing latency, main event-loop delay and heap growth during export and import preparation.
- Old notes cannot reappear after an import, and an interrupted import completes on the next start instead of mixing two sets of notes.
- Replacing notes needs no copy and no extra disk space, because the old files move within one volume. Replaced-notes folders accumulate until the user removes them.
- An uncaught failure in the worker ends only that worker; a worker cannot isolate a native crash the way a separate process would.
- Desktop and browser share one ZIP writer and inflater; a change to either affects both platforms and is tested once.
