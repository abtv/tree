# Notes Archive Format, fflate and Archive Worker

Status: Accepted
Date: 2026-10-20

## Context

The browser version stores notes only in IndexedDB of one browser profile and origin. The Product Owner uses it daily and needs a copy that survives clearing site data. Export, import and a later folder backup must share one file format. The desktop application already defines a data directory: `document.json` plus `attachments/<id>.png`. Archive work is proportional to the size of the notes and images, while `docs/PRODUCT.md` §1.1 and §22 forbid noticeable pauses in editing. The production page had a content security policy with `worker-src 'none'`.

The Product Owner approved the dependency and its constraints on 2026-10-20: `fflate` pinned exactly to `0.8.3` because earlier 0.8.x releases have an infinite loop in `unzipSync` on crafted ZIP64 data (GHSA-px8p-9vwx-vf98, CVE-2026-45820); no use of fflate's `Unzip`, `unzipSync` or asynchronous APIs; a same-origin worker allowed by `worker-src 'self'`.

## Decision

1. **Format.** A notes archive is a ZIP32 file in the desktop data-directory layout: `document.json` first, as compact JSON compressed with Deflate, then each referenced image as a stored `attachments/<id>.png` entry in ascending ID order. It has no directory entries, no other files and no preferences. `docs/PRODUCT.md` §24.2 owns the layout and its limits; `src/application/notes-archive/archive-policy.ts` is the single implementation owner of those limits.
2. **Layering.** Entry names, limits, the size budget and export sequencing live in `src/application/notes-archive/` and import no archive library, so they run and are mutation-tested in Node. The fflate writer, worker, IndexedDB access and DOM code live in `src/web/`. ESLint forbids fflate in the domain and application layers.
3. **Writer.** `src/web/archive/zip-writer.ts` uses fflate's synchronous streaming `Zip` with `ZipDeflate` for the document and `ZipPassThrough` for images. fflate's asynchronous APIs start workers from blob URLs, which `worker-src 'self'` blocks; ESLint forbids them in production code together with fflate's archive readers.
4. **Reader strategy.** fflate's `Zip` writes entry sizes only in data descriptors, and fflate's streaming `Unzip` finds the end of such an entry by scanning for the local-header, data-descriptor and central-directory signatures. `src/web/archive/zip-writer.test.ts` shows that a stored image containing any of those three byte sequences is misread by that scan, while reading through the central directory returns the exact bytes. Import therefore reads archives with its own central-directory parser and inflates entries with fflate's synchronous `Inflate` stream; it never uses `Unzip` or `unzipSync` outside tests.
5. **Worker.** Each archive operation runs in a new same-origin module worker (`src/web/workers/archive.worker.ts`). The page sends only a command; the worker reads the saved head and each referenced image from IndexedDB itself, holds at most one image at a time, and posts the archive as transferred `ArrayBuffer` chunks. The page appends chunks to a `Blob` and starts the download through an anchor element, the one download path that works in every supported browser. Cancelling terminates the worker. The production CSP changes from `worker-src 'none'` to `worker-src 'self'`.

## Consequences

- Editing stays responsive during export: the main thread does constant work per chunk. `perf/web/export.spec.mts` records long tasks, blocking time and heap growth for a large synthetic profile.
- An extracted archive opens in the desktop application without conversion (`src/infrastructure/main/notes-archive-compat.test.ts`).
- ZIP32 bounds the number of images and the archive size; the limits in `docs/PRODUCT.md` §24.2 keep every offset below the signed 32-bit range. Very large libraries cannot be exported as one archive.
- The page CSP no longer blocks same-origin workers. A meta CSP does not apply inside a worker, so the worker's behavior is bounded by its packaged code: it makes no network requests and evaluates no received code (`docs/SECURITY.md`).
- `fflate` becomes a runtime dependency of the browser package only. Upgrades follow ADR 0006 and must keep the restricted APIs unused.
