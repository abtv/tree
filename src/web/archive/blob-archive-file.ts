import type { ArchiveFile } from '../../application/notes-archive/zip-reader'

/** Reads a chosen file in slices, so only the requested range is in memory. */
export function blobArchiveFile(blob: Blob): ArchiveFile {
  return {
    size: blob.size,
    async read(offset, length) {
      const bytes = new Uint8Array(await blob.slice(offset, offset + length).arrayBuffer())
      if (bytes.byteLength !== length) throw new Error('The file changed while it was being read.')
      return bytes
    },
  }
}
