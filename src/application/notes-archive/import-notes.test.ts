import { describe, expect, it } from 'vitest'
import { serializeState, type TreeNode } from '../../domain/document'
import { buildZip, memoryFile, passThroughInflater, type ZipBuildEntry } from '../test/zip-builder'
import { ARCHIVE_LIMITS, NotesArchiveError } from './archive-policy'
import type { NotesArchiveProgress } from './export-notes'
import {
  conflictingImageMessage,
  countNodes,
  invalidDocumentMessage,
  invalidImageMessage,
  prepareNotesImport,
  prepareNotesFromSource,
  summarizeStoredNotes,
  type ImportImageStore,
} from './import-notes'
import { NO_DOCUMENT_MESSAGE, damagedEntryMessage } from './zip-reader'

function headWithImages(ids: string[]) {
  const roots: TreeNode[] = [
    { id: 'root', text: 'Root', children: [{ id: 'child', text: 'Child', children: [] }] },
    ...ids.map((id, index) => ({
      id: `node-${index}`,
      text: `Image ${index}`,
      attachment: { id, mimeType: 'image/png' as const },
      children: [],
    })),
  ]
  return serializeState({ roots }, { currentParentId: null, selectedNodeId: 'child' }, { expandedIds: ['root'] })
}

const json = (value: unknown) => new TextEncoder().encode(JSON.stringify(value))
const documentEntry = (value: unknown): ZipBuildEntry => ({ name: 'document.json', data: json(value), method: 8 })
const image = (id: string, ...data: number[]): ZipBuildEntry => ({
  name: `attachments/${id}.png`,
  data: new Uint8Array(data),
})

function memoryStore(initial: Record<string, unknown> = {}) {
  const stored = new Map<string, unknown>(Object.entries(initial))
  const events: string[] = []
  const store: ImportImageStore & { stored: Map<string, unknown>; events: string[] } = {
    stored,
    events,
    async readImage(id) {
      return stored.get(id)
    },
    async writeImage(id, bytes) {
      events.push(`write ${id}`)
      stored.set(id, bytes)
    },
    async removeImages(ids) {
      events.push(`remove ${ids.join(',')}`)
      for (const id of ids) stored.delete(id)
    },
  }
  return store
}

// The fake decoder accepts any bytes except a leading zero.
const validateImage = async (bytes: Uint8Array) => {
  if (bytes[0] === 0) throw new Error('Attachment data is not a valid PNG image.')
}

function prepare(archive: Uint8Array, images = memoryStore(), progress: NotesArchiveProgress[] = []) {
  return prepareNotesImport(memoryFile(archive), {
    createInflater: passThroughInflater,
    validateImage,
    images,
    onProgress: (value) => progress.push(value),
  })
}

async function rejection(promise: Promise<unknown>): Promise<string> {
  const error = await promise.then(
    () => undefined,
    (reason: unknown) => reason,
  )

  expect(error).toBeInstanceOf(NotesArchiveError)

  return (error as Error).message
}

// @requirement PRODUCT.md §24.4
describe('notes archive import preparation', () => {
  it('applies document, image, count and aggregate limits to a folder byte source before committing', async () => {
    const bytes = json(headWithImages(['a', 'b']))
    const source = { readDocument: async () => bytes, readImage: async () => new Uint8Array([1, 2]) }
    const prepareSource = (limits: Partial<typeof ARCHIVE_LIMITS>, images = memoryStore()) =>
      prepareNotesFromSource(
        source,
        {
          createInflater: passThroughInflater,
          validateImage,
          images,
        },
        { ...ARCHIVE_LIMITS, ...limits },
      )

    await expect(prepareSource({ documentBytes: bytes.length - 1 })).rejects.toThrow('document.json is larger')
    await expect(prepareSource({ entries: 2 })).rejects.toThrow('more images')
    await expect(prepareSource({ imageBytes: 1 })).rejects.toThrow('attachments/a.png')

    const images = memoryStore()

    await expect(prepareSource({ archiveBytes: bytes.length + 3 }, images)).rejects.toThrow('attachments/b.png')
    expect(images.events).toEqual(['write a', 'remove a'])
    // Exact limits are accepted, including the document entry in the entry count.
    await expect(
      prepareSource({ documentBytes: bytes.length, imageBytes: 2, archiveBytes: bytes.length + 4, entries: 3 }),
    ).resolves.toMatchObject({ imageCount: 2 })
  })

  it('validates the document and stores referenced images without replacing the head', async () => {
    const head = headWithImages(['c', 'a', 'missing', 'b', 'a'])
    const images = memoryStore({ b: new Uint8Array([2, 2]) })
    const progress: NotesArchiveProgress[] = []
    const prepared = await prepare(
      buildZip([image('c', 3), documentEntry(head), image('a', 1), image('b', 2, 2), image('unreferenced', 9)]),
      images,
      progress,
    )

    expect(prepared.head).toEqual(head)
    expect(prepared).toMatchObject({ nodeCount: 7, imageCount: 3, missingImageCount: 1, stagedIds: ['a', 'c'] })
    // An equal stored image is kept as it is.
    expect(images.events).toEqual(['write a', 'write c'])
    expect([...images.stored.keys()].sort()).toEqual(['a', 'b', 'c'])
    expect(progress).toEqual([
      { imagesDone: 0, imageCount: 4 },
      { imagesDone: 1, imageCount: 4 },
      { imagesDone: 2, imageCount: 4 },
      { imagesDone: 3, imageCount: 4 },
      { imagesDone: 4, imageCount: 4 },
    ])
  })

  it('accepts a document without images and runs without optional callbacks', async () => {
    const head = headWithImages([])
    const prepared = await prepareNotesImport(memoryFile(buildZip([documentEntry(head)])), {
      createInflater: passThroughInflater,
      validateImage,
      images: memoryStore(),
    })

    expect(prepared).toMatchObject({ nodeCount: 2, imageCount: 0, missingImageCount: 0, stagedIds: [] })
  })

  it('rejects an archive without a valid document', async () => {
    expect(await rejection(prepare(buildZip([image('a', 1)])))).toBe(NO_DOCUMENT_MESSAGE)

    const invalid = (data: Uint8Array) => prepare(buildZip([{ name: 'document.json', data }]))

    expect(await rejection(invalid(new Uint8Array([0x7b, 0xff, 0x7d])))).toBe(
      invalidDocumentMessage('The text is not valid UTF-8.'),
    )
    expect(await rejection(invalid(new TextEncoder().encode('{"version":')))).toBe(
      invalidDocumentMessage('The text is not valid JSON.'),
    )
    // A byte-order mark is not part of a saved document.
    expect(await rejection(invalid(new Uint8Array([0xef, 0xbb, 0xbf, ...json(headWithImages([]))])))).toBe(
      invalidDocumentMessage('The text is not valid JSON.'),
    )
    expect(await rejection(prepare(buildZip([documentEntry(null)])))).toBe(
      invalidDocumentMessage('The saved document has an unsupported format.'),
    )
    expect(await rejection(prepare(buildZip([documentEntry({ ...headWithImages([]), version: 99 })])))).toBe(
      invalidDocumentMessage('The saved document has an unsupported format.'),
    )

    const lost = { ...headWithImages([]), location: { currentParentId: null, selectedNodeId: 'nowhere' } }

    expect(await rejection(prepare(buildZip([documentEntry(lost)])))).toBe(
      invalidDocumentMessage('The saved document location does not match its tree.'),
    )
  })

  it('removes the images it wrote when a later image is unusable', async () => {
    const images = memoryStore({ keep: new Uint8Array([5]) })

    const archive = buildZip([documentEntry(headWithImages(['a', 'b', 'keep'])), image('a', 1), image('b', 0)])

    expect(await rejection(prepare(archive, images))).toBe(
      invalidImageMessage('attachments/b.png', 'Attachment data is not a valid PNG image.'),
    )
    expect(images.events).toEqual(['write a', 'remove a'])
    expect([...images.stored.keys()]).toEqual(['keep'])
  })

  it('never replaces a stored image with different bytes', async () => {
    // A shorter stored prefix and equal values in another array type are different images.
    for (const stored of [new Uint8Array([1, 2]), new Uint8Array([1]), new Int8Array([1, 4]), 'not bytes']) {
      const images = memoryStore({ b: stored })

      const archive = buildZip([documentEntry(headWithImages(['a', 'b'])), image('a', 1), image('b', 1, 4)])

      expect(await rejection(prepare(archive, images))).toBe(conflictingImageMessage('attachments/b.png'))
      expect(images.stored.get('b')).toBe(stored)
      expect(images.stored.has('a')).toBe(false)
    }
  })

  it('removes written images when an entry is damaged or storage fails', async () => {
    const images = memoryStore()

    const damaged = buildZip([documentEntry(headWithImages(['a', 'b'])), image('a', 1), { ...image('b', 1), crc32: 1 }])

    expect(await rejection(prepare(damaged, images))).toBe(damagedEntryMessage('attachments/b.png'))
    expect(images.events).toEqual(['write a', 'remove a'])

    const full = memoryStore()
    full.writeImage = async () => {
      throw new Error('QuotaExceededError')
    }

    const archive = buildZip([documentEntry(headWithImages(['a'])), image('a', 1)])

    await expect(prepare(archive, full)).rejects.toThrow('QuotaExceededError')
    // The image may have been written before the failure, so it is removed too.
    expect(full.events).toEqual(['remove a'])
  })

  it('removes nothing when it fails before writing an image', async () => {
    const images = memoryStore()

    const archive = buildZip([documentEntry(headWithImages(['a'])), image('a', 0)])
    await rejection(prepare(archive, images))

    expect(images.events).toEqual([])
  })

  it('states document, image and conflict problems in the wording of PRODUCT §24.4', () => {
    expect(invalidDocumentMessage('The text is not valid JSON.')).toBe(
      'document.json does not contain valid Tree notes. The text is not valid JSON.',
    )
    expect(invalidImageMessage('attachments/a1.png', 'Attachment is too large.')).toBe(
      '“attachments/a1.png” is not a usable image. Attachment is too large.',
    )
    expect(conflictingImageMessage('attachments/a1.png')).toBe(
      '“attachments/a1.png” differs from an image that is already stored with the same ID.',
    )
  })

  it('keeps the original failure when removing written images fails', async () => {
    const images = memoryStore()
    images.removeImages = async () => {
      throw new Error('removal failed')
    }

    const archive = buildZip([documentEntry(headWithImages(['a', 'b'])), image('a', 1), image('b', 0)])

    expect(await rejection(prepare(archive, images))).toBe(
      invalidImageMessage('attachments/b.png', 'Attachment data is not a valid PNG image.'),
    )
  })
})

// @requirement PRODUCT.md §24.4
describe('stored notes summary', () => {
  it('counts nodes and referenced images, or reports missing and invalid notes', () => {
    expect(summarizeStoredNotes(headWithImages(['a', 'b', 'a']))).toEqual({ nodeCount: 5, imageCount: 2 })
    expect(summarizeStoredNotes(undefined)).toBe('none')
    expect(summarizeStoredNotes(null)).toBe('invalid')
    expect(summarizeStoredNotes({ invalid: true })).toBe('invalid')
    expect(countNodes({ roots: [{ id: 'a', text: '', children: [{ id: 'b', text: '', children: [] }] }] })).toBe(2)
  })
})
