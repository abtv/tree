import { fstatSync, readSync } from 'node:fs'
import { open, type FileHandle } from 'node:fs/promises'
import { join } from 'node:path'
import { importFailureMessage } from '../../../application/notes-archive/archive-messages'
import {
  prepareNotesImport,
  summarizeStoredNotes,
  type ImportImageStore,
  type NotesCounts,
} from '../../../application/notes-archive/import-notes'
import type { ArchiveFile } from '../../../application/notes-archive/zip-reader'
import { validateAttachmentBytes } from '../../../electron/main/ipc-security'
import { createInflater } from '../../archive/zip-inflate'
import { findNewestValidDocument } from '../file-services'
import type { ArchiveWorkerChannel, ArchiveWorkerTask } from './archive-worker-protocol'

type ImportTask = Extract<ArchiveWorkerTask, { type: 'import' }>

export const UNDECODABLE_IMAGE_MESSAGE = 'Attachment data is not a decodable PNG image.'

/**
 * Runs one desktop import preparation inside the archive worker (PRODUCT §25.3): validates the
 * chosen archive as the browser does, writes `document.json` and every referenced image durably into
 * the staging directory, and reports both note counts. The main process commits or discards the
 * staging directory; the worker never changes the stored notes.
 */
export async function runDesktopImport(task: ImportTask, channel: ArchiveWorkerChannel): Promise<void> {
  // FileHandles, unlike bare descriptors, are closed when the main process terminates the worker.
  let archive: FileHandle | undefined
  try {
    archive = await open(task.archivePath, 'r')
    const file = descriptorArchiveFile(archive.fd)
    let reportedPercent = -1
    const prepared = await prepareNotesImport(file, {
      createInflater,
      validateImage: async (bytes) => {
        // Structure and size checks run here; only decoding needs the platform decoder.
        validateAttachmentBytes(bytes, () => true)
        const reply = await channel.request({ type: 'validate-image', bytes: ownedBytes(bytes) })
        if (reply.type !== 'image-validated' || !reply.decodable) throw new Error(UNDECODABLE_IMAGE_MESSAGE)
      },
      images: stagingImageStore(join(task.stagingDirectory, 'attachments')),
      onProgress: ({ imagesDone, imageCount }) => {
        const percent = imageCount === 0 ? 100 : Math.floor((imagesDone * 100) / imageCount)
        if (percent === reportedPercent) return
        reportedPercent = percent
        channel.post({ type: 'progress', imagesDone, imageCount })
      },
    })
    // Written last: the commit requires it, so staging without it is never committed.
    await writeDurableFile(join(task.stagingDirectory, 'document.json'), Buffer.from(JSON.stringify(prepared.head)))
    const reply = await channel.request({ type: 'staged' })
    if (reply.type !== 'count') throw new Error('The current notes could not be counted.')
    const { nodeCount, imageCount, missingImageCount } = prepared
    channel.post({
      type: 'prepared',
      fileBytes: file.size,
      incoming: { nodeCount, imageCount, missingImageCount },
      // Counted last, so the comparison includes edits saved while the archive was checked.
      current: await countStoredNotes(reply.snapshotDirectory),
    })
  } catch (error) {
    channel.post({ type: 'error', message: importFailureMessage(error) })
  } finally {
    await archive?.close().catch(() => undefined)
  }
}

/** Reads the chosen file at positions, so only the requested range is in memory. */
export function descriptorArchiveFile(descriptor: number): ArchiveFile {
  return {
    size: fstatSync(descriptor).size,
    async read(offset, length) {
      const bytes = new Uint8Array(length)
      let done = 0
      while (done < length) {
        const read = readSync(descriptor, bytes, done, length - done, offset + done)
        if (read === 0) throw new Error('The file changed while it was being read.')
        done += read
      }
      return bytes
    },
  }
}

/** The import's own empty staging directory: nothing is stored there yet, so no image can conflict. */
function stagingImageStore(directory: string): ImportImageStore {
  return {
    readImage: async () => undefined,
    writeImage: async (id, bytes) => writeDurableFile(join(directory, `${id}.png`), bytes),
    // The main process discards the whole staging directory when the import does not finish.
    removeImages: async () => {},
  }
}

async function countStoredNotes(snapshotDirectory: string): Promise<NotesCounts | 'none' | 'invalid'> {
  const newest = await findNewestValidDocument(snapshotDirectory)
  if (newest === null) return 'none'
  if ('error' in newest) return 'invalid'
  return summarizeStoredNotes(newest.value)
}

// A message clones a view's whole buffer, so a view is copied to its own bytes first.
function ownedBytes(bytes: Uint8Array): Uint8Array {
  return bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength ? bytes : bytes.slice()
}

async function writeDurableFile(path: string, bytes: Uint8Array): Promise<void> {
  const file = await open(path, 'w')
  try {
    await file.writeFile(bytes)
    await file.sync()
  } finally {
    await file.close()
  }
}
