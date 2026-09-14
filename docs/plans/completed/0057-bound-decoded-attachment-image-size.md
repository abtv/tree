# Bound Decoded Attachment Image Size

Status: Completed
Created: 2026-09-14
Completed: 2026-09-14

## Goal

Close the main-process resource-exhaustion gap in attachment validation. `validateAttachmentBytes` caps encoded bytes at 25 MiB and requires a structurally valid PNG, but it accepts any nonzero declared width and height, so a small, well-compressed PNG can declare enormous dimensions and force `nativeImage.createFromBuffer` to allocate a multi-gigabyte bitmap synchronously in the main process. The Product Owner approved a decoded-size bound of 64 megapixels with a maximum of 32767 pixels per side. This plan adds that bound, proves oversized payloads are rejected before the native decoder runs, and records the performance assessment.

## Confirmed risk

This is an untested resource-exhaustion risk, not a reproduced crash. The defect is demonstrated at the validation boundary: a structurally valid PNG whose IHDR declares 30000×30000 (900 MP, ~3.6 GiB RGBA) passes `isPng` and reaches the injected decoder today. The regression test asserts the decoder is never invoked for a payload above the budget; before the fix it is invoked.

## Approved limit

* `MAX_ATTACHMENT_PIXELS = 64 * 1024 * 1024` (64 MP; decoded RGBA is bounded at ~256 MiB).
* `MAX_ATTACHMENT_DIMENSION = 32767` pixels per side.

This supersedes the plan-0046 guidance against adding an image-dimension limit as an incidental decision: the Product Owner requested the limit after that plan was completed.

## Scope

* Extend `src/main/ipc-security.ts` validation; no IPC channel, document schema, persistence format, or storage change.
* Oversized attachments are rejected with a distinct error before any decode or filesystem write. The byte cap, structural PNG checks, and decoder requirement remain unchanged.
* Update unit, IPC contract, and real Electron boundary coverage.
* Update `docs/ARCHITECTURE.md` §7, `SECURITY.md`, and the main-layer `AGENTS.md` rule to state the decoded-size bound.
* No new dependency.

## Implementation approach

1. Add the failing unit regression first: a `pngWith` payload declaring 30000×30000 with a decoder spy (`vi.fn(() => true)`) must be rejected and the spy must not be called. Add boundary cases: a side over 32767 rejected; total pixels just over 64 MP rejected; exactly 64 MP (8192×8192) and 32767×2048 accepted; zero dimensions still rejected.
2. In `ipc-security.ts`, export `MAX_ATTACHMENT_DIMENSION` and `MAX_ATTACHMENT_PIXELS`. After `isPng` succeeds and before `decode`, read the validated IHDR width and height and throw `Attachment image is too large.` when either side exceeds the dimension cap or the product exceeds the pixel cap.
3. Add the IPC contract test asserting the oversized payload rejects before `fileServices.writeAttachment` and before `decodePng`.
4. Add the Electron test in `e2e/attachment-validation.spec.ts`: send an oversized PNG through the real preload `writeAttachment`, assert rejection, and verify no attachment file is written.

## Performance assessment

Required by `docs/PRODUCT.md` §22.1:

* Disk operations: no new writes. Oversized payloads are rejected before `writeAttachment`, so they produce zero filesystem work; accepted writes are unchanged.
* CPU on interactive paths: O(1) added work per attachment write (two 32-bit reads and two comparisons) before the existing decode. Typing, navigation, and save paths are untouched.
* Memory: strictly reduced. The bound caps the decoded RGBA bitmap at ~256 MiB and prevents unbounded native allocation; the existing byte cap still bounds the encoded payload.

No separate performance suite guard is required; the change is an upper bound on work already measured by the image-insertion decode scenario. The unit and contract tests assert the decoder is not invoked above the budget.

## Validation

* Record the failing regression before the fix and the passing result after.
* Run `npx vitest run src/main src/preload src/infrastructure/main`, the isolated Electron attachment test, then `npm run check:full`.
* Regenerate `docs/plans/README.md` with `npm run plan:index`, mark this plan Completed, and move the same file to `docs/plans/completed/` without copying.
* Commit as `fix(main): bound decoded attachment image size` with the `Plan: 0057` footer.

## Results

### Implementation

* `src/main/ipc-security.ts` exports `MAX_ATTACHMENT_DIMENSION = 32767` and `MAX_ATTACHMENT_PIXELS = 64 * 1024 * 1024`. After the structural PNG check and before the injected decoder, `validateAttachmentBytes` rejects a payload whose declared width or height exceeds the side limit or whose `width × height` exceeds the pixel limit with `Attachment image is too large.` The byte cap, chunk/CRC checks, decode requirement, and ID validation are unchanged.
* `docs/ARCHITECTURE.md` §7, `SECURITY.md`, and `src/main/AGENTS.md` now state the decoded-size bound. No product requirement, IPC channel, schema, or storage format changed.

### Tests

* Reproduced before the fix: a structurally valid PNG declaring 30000×30000 (900 MP, ~3.6 GiB as RGBA) passed validation and invoked the injected decoder. The new unit regression failed against the previous code and passes after the fix; the decoder spy is never called.
* Unit coverage in `src/main/ipc-security.test.ts`: 900 MP rejected, width 32768 rejected, height 32768 rejected, 8192×8193 (one pixel row over budget) rejected, exactly 64 MP (8192×8192) accepted, and 32767×2048 accepted.
* IPC contract coverage in `src/main/ipc-handlers.test.ts`: the oversized payload rejects at `tree:write-attachment` with `decodePng` and `fileServices.writeAttachment` never called.
* Real Electron coverage in `e2e/attachment-validation.spec.ts`: an oversized PNG sent through the real preload `writeAttachment` boundary is rejected with the size message and no attachment file is written.
* The existing invalid-PNG, real-image paste/restart, read-failure, and corrupt-bytes tests remain unchanged and pass.

### Performance

* The added validation is O(1) per attachment write and runs before the existing decode. Oversized payloads now avoid the native decode entirely and produce no filesystem write, so the change strictly reduces CPU and memory for malicious input. The decoded bitmap is bounded at ~256 MiB instead of unbounded.
* The ninth performance scenario (`image-insertion-decode`) remains the guard for accepted writes and passed unchanged; no new performance guard was required.

### Validation

* `npm run check:full` passed on macOS with a display: type checking, linting, Prettier, documentation governance, 481 unit/component/property tests with coverage (95.45% statements, 89.16% branches, 95.73% functions, 97.5% lines), production build, dependency audit, 105 Electron E2E tests, and 14 performance tests. No required test was skipped and no validation failure remains.
