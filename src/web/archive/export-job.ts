import { exportFailureMessage } from '../../application/notes-archive/archive-messages'
import { exportNotesArchive, type NotesArchiveSource } from '../../application/notes-archive/export-notes'
import { createZipWriter } from '../../infrastructure/archive/zip-writer'
import type { ArchiveWorkerPost } from '../workers/archive-protocol'

// Small chunks (headers, descriptors, deflate blocks) are combined to limit messages and Blob parts.
export const CHUNK_FLUSH_BYTES = 1024 * 1024

/** Runs one export inside the archive worker and reports it through `post`. */
export async function runExportJob(source: NotesArchiveSource, post: ArchiveWorkerPost): Promise<void> {
  let pending: Uint8Array[] = []
  let pendingBytes = 0
  const send = (chunk: Uint8Array) => {
    const owned = chunk.byteOffset === 0 && chunk.byteLength === chunk.buffer.byteLength ? chunk : chunk.slice()
    const buffer = owned.buffer as ArrayBuffer
    post({ type: 'chunk', chunk: buffer }, [buffer])
  }
  const flush = () => {
    if (pendingBytes === 0) return
    const combined = new Uint8Array(pendingBytes)
    let offset = 0
    for (const part of pending) {
      combined.set(part, offset)
      offset += part.byteLength
    }
    pending = []
    pendingBytes = 0
    send(combined)
  }
  const writer = createZipWriter((chunk) => {
    if (chunk.byteLength >= CHUNK_FLUSH_BYTES) {
      flush()
      send(chunk)
      return
    }
    pending.push(chunk.slice())
    pendingBytes += chunk.byteLength
    if (pendingBytes >= CHUNK_FLUSH_BYTES) flush()
  })
  let reportedPercent = -1
  try {
    const summary = await exportNotesArchive(source, writer, ({ imagesDone, imageCount }) => {
      const percent = imageCount === 0 ? 100 : Math.floor((imagesDone * 100) / imageCount)
      if (percent === reportedPercent) return
      reportedPercent = percent
      post({ type: 'progress', imagesDone, imageCount })
    })
    flush()
    post({ type: 'done', summary })
  } catch (error) {
    post({ type: 'error', message: exportFailureMessage(error) })
  }
}
