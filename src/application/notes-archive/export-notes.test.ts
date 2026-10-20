import { describe, expect, it } from 'vitest'
import { serializeState, type PersistedEditorState, type TreeNode } from '../../domain/document'
import { ARCHIVE_LIMITS, ArchiveBudget, attachmentEntryName, NotesArchiveError } from './archive-policy'
import {
  ARCHIVE_TOO_LARGE_MESSAGE,
  DOCUMENT_TOO_LARGE_MESSAGE,
  exportNotesArchive,
  INVALID_NOTES_MESSAGE,
  NO_NOTES_MESSAGE,
  TOO_MANY_IMAGES_MESSAGE,
  type NotesArchiveProgress,
  type NotesArchiveWriter,
} from './export-notes'

type Entry = { kind: 'deflated' | 'stored'; name: string; bytes: Uint8Array }

// Counts each entry as its payload plus the fixed ZIP overheads the budget assumes.
function recordingWriter() {
  const entries: Entry[] = []
  let bytesWritten = 0
  let finished = false
  const writer: NotesArchiveWriter = {
    get bytesWritten() {
      return bytesWritten
    },
    addDeflated(name, bytes) {
      entries.push({ kind: 'deflated', name, bytes })
      bytesWritten += 30 + name.length + bytes.byteLength + 16
    },
    addStored(name, bytes) {
      entries.push({ kind: 'stored', name, bytes })
      bytesWritten += 30 + name.length + bytes.byteLength + 16
    },
    finish() {
      finished = true
      for (const entry of entries) bytesWritten += 46 + entry.name.length
      bytesWritten += 22
    },
  }
  return { writer, entries, isFinished: () => finished }
}

function stateWithImages(ids: string[]): PersistedEditorState {
  const roots: TreeNode[] = [
    { id: 'root', text: 'Root', children: [] },
    ...ids.map((id, index) => ({
      id: `node-${index}`,
      text: `Image ${index}`,
      attachment: { id, mimeType: 'image/png' as const },
      children: [],
    })),
  ]
  return serializeState({ roots }, { currentParentId: null, selectedNodeId: 'root' }, { expandedIds: [] })
}

const png = (size: number, fill = 1) => new Uint8Array(size).fill(fill)

function source(head: unknown, images: Record<string, unknown>) {
  const reads: string[] = []
  return {
    reads,
    readHead: async () => head,
    readImage: async (id: string) => {
      reads.push(id)
      return images[id]
    },
  }
}

// @requirement PRODUCT.md §24.3
describe('notes archive export', () => {
  it('writes the compact head first, then referenced images sorted by id', async () => {
    const head = stateWithImages(['b-image', 'a-image', 'b-image'])
    const { writer, entries, isFinished } = recordingWriter()
    const progress: NotesArchiveProgress[] = []
    const summary = await exportNotesArchive(
      source(head, { 'a-image': png(3, 7), 'b-image': png(4, 9), unreferenced: png(2) }),
      writer,
      (value) => progress.push(value),
    )

    expect(entries.map(({ kind, name }) => [kind, name])).toEqual([
      ['deflated', 'document.json'],
      ['stored', 'attachments/a-image.png'],
      ['stored', 'attachments/b-image.png'],
    ])
    expect(new TextDecoder().decode(entries[0]!.bytes)).toBe(JSON.stringify(head))
    expect(entries[1]!.bytes).toEqual(png(3, 7))
    expect(entries[2]!.bytes).toEqual(png(4, 9))
    expect(isFinished()).toBe(true)
    expect(summary).toEqual({ imageCount: 2, missingImageCount: 0, archiveBytes: writer.bytesWritten })
    expect(progress).toEqual([
      { imagesDone: 0, imageCount: 2 },
      { imagesDone: 1, imageCount: 2 },
      { imagesDone: 2, imageCount: 2 },
    ])
  })

  it('exports a document without images as a single entry', async () => {
    const { writer, entries } = recordingWriter()
    const summary = await exportNotesArchive(source(stateWithImages([]), {}), writer)
    expect(entries.map((entry) => entry.name)).toEqual(['document.json'])
    expect(summary.imageCount).toBe(0)
  })

  it('skips and counts referenced images that are missing or unusable', async () => {
    const head = stateWithImages(['empty', 'missing', 'not-bytes', 'oversized', 'present'])
    const { writer, entries } = recordingWriter()
    const summary = await exportNotesArchive(
      source(head, {
        empty: new Uint8Array(0),
        'not-bytes': [1, 2, 3],
        oversized: png(ARCHIVE_LIMITS.imageBytes + 1),
        present: png(ARCHIVE_LIMITS.imageBytes),
      }),
      writer,
    )
    expect(entries.map((entry) => entry.name)).toEqual(['document.json', 'attachments/present.png'])
    expect(summary).toMatchObject({ imageCount: 1, missingImageCount: 4 })
  })

  it.each([
    ['a missing head', undefined, NO_NOTES_MESSAGE],
    ['an invalid head', { invalid: 'preserve this evidence' }, INVALID_NOTES_MESSAGE],
    ['an unsupported schema version', { ...stateWithImages(['ok']), version: 99 }, INVALID_NOTES_MESSAGE],
  ])('refuses %s before writing anything', async (_label, head, message) => {
    const { writer, entries, isFinished } = recordingWriter()
    const images = source(head, {})
    await expect(exportNotesArchive(images, writer)).rejects.toEqual(new NotesArchiveError(message))
    expect(entries).toEqual([])
    expect(images.reads).toEqual([])
    expect(isFinished()).toBe(false)
  })

  it('refuses a document with more images than archive entries allow', async () => {
    const limits = { ...ARCHIVE_LIMITS, entries: 3 }
    const fits = recordingWriter()
    await exportNotesArchive(
      source(stateWithImages(['a', 'b']), { a: png(1), b: png(1) }),
      fits.writer,
      undefined,
      limits,
    )
    expect(fits.entries).toHaveLength(3)

    const { writer, entries } = recordingWriter()
    await expect(
      exportNotesArchive(source(stateWithImages(['a', 'b', 'c']), {}), writer, undefined, limits),
    ).rejects.toThrow(TOO_MANY_IMAGES_MESSAGE)
    expect(entries).toEqual([])
  })

  it('refuses a document above the document limit before writing it', async () => {
    const head = stateWithImages([])
    const size = new TextEncoder().encode(JSON.stringify(head)).byteLength
    const exact = recordingWriter()
    await exportNotesArchive(source(head, {}), exact.writer, undefined, { ...ARCHIVE_LIMITS, documentBytes: size })
    expect(exact.entries).toHaveLength(1)

    const { writer, entries } = recordingWriter()
    await expect(
      exportNotesArchive(source(head, {}), writer, undefined, { ...ARCHIVE_LIMITS, documentBytes: size - 1 }),
    ).rejects.toThrow(DOCUMENT_TOO_LARGE_MESSAGE)
    expect(entries).toEqual([])
  })

  it('counts the document size in UTF-8 bytes', async () => {
    const head = serializeState(
      { roots: [{ id: 'root', text: 'äöü 🌳', children: [] }] },
      { currentParentId: null, selectedNodeId: 'root' },
    )
    const json = JSON.stringify(head)
    const { writer } = recordingWriter()
    await expect(
      exportNotesArchive(source(head, {}), writer, undefined, { ...ARCHIVE_LIMITS, documentBytes: json.length }),
    ).rejects.toThrow(DOCUMENT_TOO_LARGE_MESSAGE)
  })

  it('refuses the image that would make the finished archive exceed its limit', async () => {
    const head = stateWithImages(['a', 'b'])
    const images = { a: png(100), b: png(100) }
    const complete = recordingWriter()
    await exportNotesArchive(source(head, images), complete.writer)
    const finishedBytes = complete.writer.bytesWritten

    const exact = recordingWriter()
    await exportNotesArchive(source(head, images), exact.writer, undefined, {
      ...ARCHIVE_LIMITS,
      archiveBytes: finishedBytes,
    })
    expect(exact.writer.bytesWritten).toBe(finishedBytes)

    const { writer, entries, isFinished } = recordingWriter()
    await expect(
      exportNotesArchive(source(head, images), writer, undefined, {
        ...ARCHIVE_LIMITS,
        archiveBytes: finishedBytes - 1,
      }),
    ).rejects.toThrow(ARCHIVE_TOO_LARGE_MESSAGE)
    expect(entries.map((entry) => entry.name)).toEqual(['document.json', 'attachments/a.png'])
    expect(isFinished()).toBe(false)
  })
})

// @requirement PRODUCT.md §24.3
describe('notes archive refusal wording', () => {
  it('matches the product messages exactly', () => {
    expect([
      NO_NOTES_MESSAGE,
      INVALID_NOTES_MESSAGE,
      TOO_MANY_IMAGES_MESSAGE,
      DOCUMENT_TOO_LARGE_MESSAGE,
      ARCHIVE_TOO_LARGE_MESSAGE,
    ]).toEqual([
      'There are no saved notes to export.',
      'The saved notes are invalid, so they cannot be exported.',
      'Your notes have too many images to export as one archive.',
      'Your notes are too large to export as one archive.',
      'Your notes and images are too large to export as one archive.',
    ])
    expect(new NotesArchiveError('x').name).toBe('NotesArchiveError')
  })
})

// @requirement PRODUCT.md §24.2
describe('notes archive policy', () => {
  it('names attachment entries after their id and rejects unsafe ids', () => {
    expect(attachmentEntryName('Image_1-a')).toBe('attachments/Image_1-a.png')
    for (const id of ['', '../x', 'a/b', 'a.png', 'a\\b', 'ä']) {
      expect(() => attachmentEntryName(id)).toThrow('Attachment IDs may contain only')
    }
  })

  it('accounts for headers, descriptors and the central directory of every entry', () => {
    // document.json (13 bytes) with 10 payload bytes: 30+13+10+16, then 46+13 and 22 at the end.
    const exactly = 30 + 13 + 10 + 16 + 46 + 13 + 22
    expect(new ArchiveBudget({ ...ARCHIVE_LIMITS, archiveBytes: exactly }).fits(0, 'document.json', 10)).toBe(true)
    expect(new ArchiveBudget({ ...ARCHIVE_LIMITS, archiveBytes: exactly - 1 }).fits(0, 'document.json', 10)).toBe(false)

    // The second entry also pays for the first entry's central header.
    const written = 30 + 13 + 10 + 16
    const second = 30 + 5 + 4 + 16 + 46 + 13 + 46 + 5 + 22
    const tight = new ArchiveBudget({ ...ARCHIVE_LIMITS, archiveBytes: written + second - 1 })
    tight.add('document.json')
    expect(tight.fits(written, 'a.png', 4)).toBe(false)
    const roomy = new ArchiveBudget({ ...ARCHIVE_LIMITS, archiveBytes: written + second })
    roomy.add('document.json')
    expect(roomy.fits(written, 'a.png', 4)).toBe(true)
  })

  it('limits the entry count', () => {
    const budget = new ArchiveBudget({ ...ARCHIVE_LIMITS, entries: 2 })
    expect(budget.fits(0, 'a', 0)).toBe(true)
    budget.add('a')
    expect(budget.fits(0, 'b', 0)).toBe(true)
    budget.add('b')
    expect(budget.fits(0, 'c', 0)).toBe(false)
  })

  it('keeps archives within ZIP32 and the shared attachment limit', () => {
    expect(ARCHIVE_LIMITS.entries).toBe(65_535)
    expect(ARCHIVE_LIMITS.archiveBytes).toBe(2_147_483_647)
    expect(ARCHIVE_LIMITS.documentBytes).toBe(268_435_456)
    expect(ARCHIVE_LIMITS.imageBytes).toBe(26_214_400)
  })
})
