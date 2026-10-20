import { Zip, ZipDeflate, ZipPassThrough } from 'fflate'
import type { NotesArchiveWriter } from '../../application/notes-archive/export-notes'

// Feed the deflater in slices so compressed output streams instead of arriving as one chunk.
const DEFLATE_SLICE_BYTES = 1024 * 1024

/**
 * Writes a ZIP archive through fflate's synchronous streaming `Zip`, passing each produced chunk to
 * `onChunk` in order. Entries are written one at a time; no async fflate API is used, because those
 * spawn blob-URL workers that the page's content security policy blocks (ADR 0022).
 */
export function createZipWriter(onChunk: (chunk: Uint8Array) => void): NotesArchiveWriter {
  let bytesWritten = 0
  let failure: Error | undefined
  const zip = new Zip((error, chunk) => {
    if (error) {
      failure = error
      return
    }
    bytesWritten += chunk.byteLength
    onChunk(chunk)
  })
  const check = () => {
    if (failure) throw failure
  }
  return {
    get bytesWritten() {
      return bytesWritten
    },
    addDeflated(name, bytes) {
      const entry = new ZipDeflate(name, { level: 6 })
      zip.add(entry)
      if (bytes.byteLength === 0) entry.push(bytes, true)
      for (let offset = 0; offset < bytes.byteLength; offset += DEFLATE_SLICE_BYTES) {
        const end = Math.min(offset + DEFLATE_SLICE_BYTES, bytes.byteLength)
        entry.push(bytes.subarray(offset, end), end === bytes.byteLength)
      }
      check()
    },
    addStored(name, bytes) {
      const entry = new ZipPassThrough(name)
      zip.add(entry)
      entry.push(bytes, true)
      check()
    },
    finish() {
      zip.end()
      check()
    },
  }
}
