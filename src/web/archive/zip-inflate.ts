import { Inflate } from 'fflate'
import type { ArchiveFile, CreateInflater } from '../../application/notes-archive/zip-reader'

/**
 * Raw Deflate decoding through fflate's synchronous `Inflate` stream. fflate copies each produced
 * chunk, so the reader may keep it. No async fflate API is used (ADR 0022).
 */
export const createInflater: CreateInflater = (onData) => {
  const inflate = new Inflate((chunk) => onData(chunk))
  return { push: (chunk, final) => inflate.push(chunk, final) }
}

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
