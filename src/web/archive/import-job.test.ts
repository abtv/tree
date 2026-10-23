import fc from 'fast-check'
import { deflateSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { serializeState, type TreeNode } from '../../domain/document'
import { NotesArchiveError } from '../../application/notes-archive/archive-policy'
import { crc32 } from '../../application/notes-archive/crc32'
import { exportNotesArchive } from '../../application/notes-archive/export-notes'
import { prepareNotesImport } from '../../application/notes-archive/import-notes'
import { buildZip, memoryFile } from '../../application/test/zip-builder'
import { damagedEntryMessage } from '../../application/notes-archive/zip-reader'
import { createInflater } from '../../infrastructure/archive/zip-inflate'
import { createZipWriter } from '../../infrastructure/archive/zip-writer'
import { concat } from '../../infrastructure/archive/zip-test-utils'
import type { ArchiveWorkerMessage } from '../workers/archive-protocol'
import { createImportJob, type ImportJobStorage } from './import-job'

function headWithImages(ids: string[], text = 'Root') {
  const roots: TreeNode[] = [
    { id: 'root', text, children: [] },
    ...ids.map((id) => ({
      id: `node-${id}`,
      text: id,
      attachment: { id, mimeType: 'image/png' as const },
      children: [],
    })),
  ]
  return serializeState({ roots }, { currentParentId: null, selectedNodeId: 'root' }, { expandedIds: [] })
}

async function exportArchive(head: unknown, images: Record<string, Uint8Array>): Promise<Uint8Array> {
  const chunks: Uint8Array[] = []
  await exportNotesArchive(
    { readHead: async () => head, readImage: async (id) => images[id] },
    createZipWriter((chunk) => chunks.push(chunk.slice())),
  )
  return concat(chunks)
}

type MemoryStorage = ImportJobStorage & { head: unknown; images: Map<string, unknown> }

function memoryStorage(head: unknown, images: Record<string, Uint8Array> = {}): MemoryStorage {
  const storage: MemoryStorage = {
    head,
    images: new Map<string, unknown>(Object.entries(images)),
    async readHead() {
      return storage.head
    },
    async writeHead(value: unknown) {
      storage.head = value
    },
    async readImage(id: string) {
      return storage.images.get(id)
    },
    async writeImage(id: string, bytes: Uint8Array) {
      storage.images.set(id, bytes)
    },
    async removeImages(ids: readonly string[]) {
      for (const id of ids) storage.images.delete(id)
    },
  }
  return storage
}

function job(storage: ImportJobStorage) {
  const messages: ArchiveWorkerMessage[] = []
  const importJob = createImportJob(
    storage,
    async () => {},
    (message) => {
      // Every message must survive structured cloning into the page and stay small.
      structuredClone(message)
      expect(JSON.stringify(message).length).toBeLessThan(500)
      messages.push(message)
    },
  )
  return { importJob, messages }
}

// The ZIP signatures, which a forward-scanning reader would mistake for entry boundaries.
const tricky = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x50, 0x4b, 0x07, 0x08, 0x50, 0x4b, 0x01, 0x02, 9])

// @requirement PRODUCT.md §24.4
describe('archive worker import job', () => {
  it('prepares an exported archive, reports both note counts, then replaces the head', async () => {
    const incoming = headWithImages(['a', 'b', 'missing'], 'Imported')
    const archive = await exportArchive(incoming, { a: tricky, b: new Uint8Array([2]) })
    const storage = memoryStorage(headWithImages(['b', 'old']), { b: new Uint8Array([2]), old: new Uint8Array([3]) })
    const { importJob, messages } = job(storage)

    await importJob.prepare(memoryFile(archive))
    expect(messages).toEqual([
      { type: 'progress', imagesDone: 0, imageCount: 3 },
      { type: 'progress', imagesDone: 1, imageCount: 3 },
      { type: 'progress', imagesDone: 2, imageCount: 3 },
      { type: 'progress', imagesDone: 3, imageCount: 3 },
      {
        type: 'prepared',
        incoming: { nodeCount: 4, imageCount: 2, missingImageCount: 1 },
        current: { nodeCount: 3, imageCount: 2 },
      },
    ])
    // Preparing never changes the stored head.
    expect(storage.head).toEqual(headWithImages(['b', 'old']))
    expect(storage.images.get('a')).toEqual(tricky)

    await importJob.commit()
    expect(messages.at(-1)).toEqual({ type: 'committed' })
    expect(storage.head).toEqual(incoming)
    expect([...storage.images.keys()].sort()).toEqual(['a', 'b', 'old'])
  })

  it('reports missing or invalid current notes for the confirmation', async () => {
    const archive = await exportArchive(headWithImages([]), {})
    for (const [head, current] of [
      [undefined, 'none'],
      [{ invalid: true }, 'invalid'],
    ] as const) {
      const { importJob, messages } = job(memoryStorage(head))
      await importJob.prepare(memoryFile(archive))
      expect(messages.at(-1)).toEqual({
        type: 'prepared',
        incoming: { nodeCount: 1, imageCount: 0, missingImageCount: 0 },
        current,
      })
    }
  })

  it('removes staged images and keeps the head when the commit fails', async () => {
    const storage = memoryStorage(headWithImages([]))
    storage.writeHead = async () => {
      throw new Error('The transaction was aborted.')
    }
    const { importJob, messages } = job(storage)
    await importJob.commit()
    expect(messages).toEqual([])
    await importJob.prepare(memoryFile(await exportArchive(headWithImages(['a']), { a: tricky })))
    expect(storage.images.has('a')).toBe(true)
    await importJob.commit()
    expect(messages.at(-1)).toEqual({
      type: 'error',
      message: 'Your notes could not be replaced: The transaction was aborted.',
    })
    expect(storage.images.size).toBe(0)
    expect(storage.head).toEqual(headWithImages([]))
  })

  it('reports archive problems and storage failures', async () => {
    const storage = memoryStorage(undefined)
    const { importJob, messages } = job(storage)
    await importJob.prepare(memoryFile(new Uint8Array(30)))
    expect(messages.at(-1)).toEqual({
      type: 'error',
      message: 'The file is not a Tree notes archive, or it is damaged.',
    })
    storage.readHead = async () => {
      throw new Error('Storage is unavailable.')
    }
    await importJob.prepare(memoryFile(await exportArchive(headWithImages([]), {})))
    expect(messages.at(-1)).toEqual({
      type: 'error',
      message: 'The archive could not be imported: Storage is unavailable.',
    })
  })

  // @requirement PRODUCT.md §24.6
  it('restores from a folder source, reporting its size and storage failures', async () => {
    const storage = memoryStorage(undefined)
    const { importJob, messages } = job(storage)
    const document = new TextEncoder().encode(JSON.stringify(headWithImages(['a'])))
    await importJob.prepare({
      size: document.byteLength + 1,
      readDocument: async () => document,
      readImage: async () => tricky,
    })
    expect(messages.at(-1)).toEqual({
      type: 'prepared',
      incoming: { nodeCount: 2, imageCount: 1, missingImageCount: 0 },
      current: 'none',
      sourceBytes: document.byteLength + 1,
    })
    const full = memoryStorage(undefined)
    full.writeImage = async () => {
      throw new DOMException('The quota was exceeded.', 'QuotaExceededError')
    }
    const failing = job(full)
    await failing.importJob.prepare({ readDocument: async () => document, readImage: async () => tricky })
    expect(failing.messages.at(-1)).toEqual({
      type: 'error',
      message: 'The notes could not be restored: The quota was exceeded.',
    })
  })
})

// @requirement PRODUCT.md §24.4
describe('notes archive Deflate input', () => {
  const head = new TextEncoder().encode(JSON.stringify(headWithImages([])))
  const prepare = (archive: Uint8Array) =>
    prepareNotesImport(memoryFile(archive), {
      createInflater,
      validateImage: async () => {},
      images: memoryStorage(undefined),
    })
  const deflatedDocument = (raw: Uint8Array, fields: { size?: number; data?: Uint8Array } = {}) =>
    buildZip([
      { name: 'document.json', method: 8, data: deflateSync(raw), crc32: crc32(raw), size: raw.byteLength, ...fields },
    ])

  it('inflates a document compressed by another Deflate encoder', async () => {
    expect((await prepare(deflatedDocument(head))).head).toEqual(headWithImages([]))
  })

  it('stops a Deflate bomb at its declared size', async () => {
    // 8 MiB of zeros compress to about 8 KiB; the declared size makes any output beyond 1,000 bytes fatal.
    const bomb = new Uint8Array(8 * 1024 * 1024)
    const archive = buildZip([{ name: 'document.json', method: 8, data: deflateSync(bomb), crc32: 0, size: 1000 }])
    expect(archive.byteLength).toBeLessThan(20_000)
    await expect(prepare(archive)).rejects.toThrow(damagedEntryMessage('document.json'))
  })

  it('rejects a truncated or corrupt Deflate stream', async () => {
    const compressed = deflateSync(head)
    await expect(prepare(deflatedDocument(head, { data: compressed.slice(0, -4) }))).rejects.toThrow(
      damagedEntryMessage('document.json'),
    )
    await expect(prepare(deflatedDocument(head, { data: new Uint8Array([0xff, 0xff, 0xff]) }))).rejects.toThrow(
      damagedEntryMessage('document.json'),
    )
  })

  it('rejects any mutation of an exported archive with an archive error or reads it consistently', async () => {
    const images = { a: tricky, b: new Uint8Array(300).fill(7) }
    const source = headWithImages(['a', 'b'], 'Fuzzed')
    const archive = await exportArchive(source, images)
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.tuple(fc.nat(archive.byteLength - 1), fc.integer({ min: 0, max: 255 })), {
          minLength: 1,
          maxLength: 4,
        }),
        fc.option(fc.nat(archive.byteLength), { nil: undefined }),
        async (changes, cut) => {
          const mutated = archive.slice(0, cut ?? archive.byteLength)
          for (const [offset, value] of changes) if (offset < mutated.byteLength) mutated[offset] = value
          const storage = memoryStorage(undefined)
          try {
            const prepared = await prepareNotesImport(memoryFile(mutated), {
              createInflater,
              validateImage: async () => {},
              images: storage,
            })
            // A mutation the reader accepts left the checked content intact.
            expect(prepared.head).toEqual(source)
            for (const [id, bytes] of storage.images) expect(bytes).toEqual(images[id as 'a' | 'b'])
          } catch (error) {
            expect(error).toBeInstanceOf(NotesArchiveError)
            expect(storage.images.size).toBe(0)
          }
        },
      ),
      { seed: 2610, numRuns: 400, interruptAfterTimeLimit: 4000 },
    )
  })
})
