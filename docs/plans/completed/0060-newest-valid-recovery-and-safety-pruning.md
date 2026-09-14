# Newest Valid Recovery and Safety-Bounded Pruning

Status: Completed
Created: 2026-09-14
Completed: 2026-09-14

## Goal

Fix three persistence defects in `src/infrastructure/main/file-services.ts` that contradict the approved recovery and retention behavior in `docs/PRODUCT.md` §16 and `docs/ARCHITECTURE.md` §13:

1. Load always tries the primary first, so an older primary is returned even when a newer, valid interrupted save exists. `docs/PRODUCT.md` §16 requires the newest stored document that can be parsed and validated.
2. The primary bypasses domain validation inside the recovery loop, so a syntactically valid but structurally invalid primary fails later application validation instead of letting the loader consider an older valid generation.
3. Pruning keeps the fixed cap plus the safety generation but deletes generations newer than the safety generation when the cap boundary falls before it. `docs/ARCHITECTURE.md` §13 says pruning deletes only generations older than the safety generation.

## Approved behavior

* `docs/PRODUCT.md` §16: on load, the newest stored document that can be parsed and validated becomes the document, whether it is the primary file, a retained generation, or an interrupted save. Unreadable or invalid candidates are skipped while older candidates are considered, and the loaded candidate becomes the primary file.
* `docs/PRODUCT.md` §16: a primary file containing JSON `null` is invalid stored data, not a first launch; loading shows an error and preserves the stored document files.
* `docs/PRODUCT.md` §16: at least one generation written more than 30 seconds ago is always retained, together with generations written after it.
* `docs/ARCHITECTURE.md` §13: pruning deletes only generations older than the safety generation and is best-effort.
* `docs/ARCHITECTURE.md` §13: a missing attachment file must not reject a candidate.

## Defects reproduced

* Primary-first candidate ordering: with an older primary and a newer valid `document.json.tmp`, `load` returns the primary and leaves the newer interrupted save unopened.
* Unvalidated primary: with a structurally invalid primary and a valid `document.1.json`, `load` returns the invalid primary, and the renderer's later `parsePersistedState` fails without the valid generation being considered.
* Over-eager pruning: with 26 retained generations where generation 5 is the newest older than the safety window and generations 6-26 are newer, pruning deletes generations 6 and 7 because they fall outside the 20-generation cap even though they are newer than the retained safety generation.

## Design

### Load

* Candidate discovery includes the primary, the temporary file, and every retained generation (including the legacy `document.json.bak`), each with its write time. Generations are listed as today.
* Candidates are ordered newest first by write time. Equal write times keep the committed primary first, then the temporary file, then generations by descending sequence number with the legacy backup last, so ordering is deterministic.
* Every candidate passes domain validation before promotion. Validation is a single traversal that does not rebuild the document. A candidate that fails JSON parsing or validation is left untouched and the next candidate is considered; the loaded candidate is renamed over the primary.
* The primary is no longer special-cased for validation, but a primary containing JSON `null` is still rejected as unsupported at the file boundary before candidate ordering, preserving the stored files instead of recovering around invalid data.
* If stored files exist but none validates, the first non-missing error is thrown without changing files. If no stored files exist, `null` is returned for first launch.

### Pruning

* Retain the newest fixed-cap generations, extended to include the newest generation older than the safety window and every generation newer than it. Pruning deletes only generations strictly older than that safety generation.
* Deletion remains best-effort, and pruning still runs inside the serialized file-service queue.

## Scope

* `src/infrastructure/main/file-services.ts` and `src/infrastructure/main/file-services.test.ts`.
* New end-to-end regressions in `e2e/persistence-reliability.spec.ts`.
* `docs/ARCHITECTURE.md` §13 recovery wording that says a syntactically readable primary continues through ordinary application validation.
* No product behavior change, no document schema change, no IPC change, no save-path change.

## Performance assessment

Required by `docs/PRODUCT.md` §22.1:

* Disk operations: load adds two `stat` calls, one for the primary and one for the temporary file, and at most one extra JSON `readFile` for the primary when it is not the first validated candidate. Normal operation still reads and promotes only the primary. No write, rename, or sync is added to the save path.
* CPU on interactive paths: load performs one bounded validation traversal of the promoted candidate in the main process. Validation does not rebuild the document tree, and the renderer's existing parse and migration remain unchanged, so startup work grows by one `O(document)` traversal once per launch. Candidate ordering is `O(generations log generations)` with at most 21 generations.
* Memory: candidate metadata and the cached JSON values are bounded by the retention cap; validation allocates only traversal state.
* The existing startup performance scenarios (`fresh`, `wide-10000`, `wide-30000`, `large-10000`) already measure launch and renderer readiness with fixed ceilings and serve as the guard.

## Validation

* Record the three failing behaviors before the fix: the newest-candidate regression, the invalid-primary regression, and the pruning regression.
* Add unit coverage for newest-by-write-time ordering, primary validation with generation fallback, the preserved `null` primary rejection, and pruning that keeps every generation newer than the safety generation.
* Add Electron coverage for opening a newer interrupted save over an older primary and recovering a generation from a structurally invalid primary.
* Run `npm run check:full`.
* Regenerate `docs/plans/README.md` with `npm run plan:index`, mark this plan Completed, and move the file to `docs/plans/completed/` without copying.

## Results

### Implementation

* `load` lists the primary, the temporary file, and every retained generation together with their write times, orders them newest first, and validates each candidate with the domain validator before renaming it over the primary. Equal write times keep the primary first, then the temporary file, then the highest-numbered generation first, with the legacy backup last.
* The primary is validated like every other candidate, so an invalid primary no longer blocks recovery from an older valid generation. A primary containing JSON `null` is still rejected as unsupported at the file boundary before candidate ordering.
* Pruning retains the newest fixed cap extended through the newest generation older than the safety window, so it deletes only generations strictly older than that safety generation.

### Tests

* Unit coverage in `file-services.test.ts`: a newer interrupted save is loaded and promoted over an older primary; a structurally invalid primary falls back to a valid generation; pruning keeps every generation newer than the safety generation and deletes only older ones; the interrupted-rotation and failed-rename tests now assert that the newer temporary file is recovered.
* Electron coverage in `persistence-reliability.spec.ts`: `loads a newer interrupted save over an older committed primary` and `recovers a valid generation when the primary fails domain validation`.
* Defect-first: the three new regressions failed against the previous implementation and pass after the fix; the previous primary-first interruption expectations were corrected to the approved newest-candidate behavior.

### Performance

* Startup scenarios passed with the existing ceilings: `fresh` launch max 850.42 ms, `wide-30000` launch max 801.07 ms and renderer max 358.4 ms, and `large-10000` launch max 931.95 ms.
* Load adds at most two `stat` calls and one document validation traversal per launch; validation does not rebuild the document tree, candidate data is bounded by the retention cap, and the save path is unchanged.

### Validation

* `npm run check:full` passed on macOS with a display: type checking, linting, Prettier, documentation governance, 488 unit/component/property tests with coverage (94.98% statements, 88.68% branches, 95.35% functions, 97.2% lines), production build, dependency audit, 109 Electron E2E tests, and 14 performance tests. No required test was skipped and no validation failure remains.
