import { describe, expect, it } from 'vitest'
import { buildZip, memoryFile, passThroughInflater, type ZipBuildEntry } from '../test/zip-builder'
import { ARCHIVE_LIMITS, NotesArchiveError } from './archive-policy'
import { crc32 } from './crc32'
import {
  ARCHIVE_FILE_TOO_LARGE_MESSAGE,
  CONTENT_TOO_LARGE_MESSAGE,
  ENCRYPTED_ARCHIVE_MESSAGE,
  INVALID_NAME_MESSAGE,
  NO_DOCUMENT_MESSAGE,
  NOT_AN_ARCHIVE_MESSAGE,
  TOO_MANY_ENTRIES_MESSAGE,
  UNSUPPORTED_ARCHIVE_MESSAGE,
  classifyEntryName,
  damagedEntryMessage,
  duplicateEntryMessage,
  entryTooLargeMessage,
  readArchiveDirectory,
  readArchiveEntry,
  unexpectedEntryMessage,
  unsupportedMethodMessage,
  type CreateInflater,
} from './zip-reader'

const bytes = (text: string) => new TextEncoder().encode(text)
const documentEntry: ZipBuildEntry = { name: 'document.json', data: bytes('{"x":1}') }
const imageEntry = (id: string, data = new Uint8Array([1, 2, 3])): ZipBuildEntry => ({
  name: `attachments/${id}.png`,
  data,
})

function patch(archive: Uint8Array, offset: number, value: number, width: 2 | 4): Uint8Array {
  const copy = archive.slice()
  const view = new DataView(copy.buffer)
  if (width === 2) view.setUint16(offset, value, true)
  else view.setUint32(offset, value, true)
  return copy
}

const directoryOffsetOf = (archive: Uint8Array) =>
  new DataView(archive.buffer, archive.byteOffset).getUint32(archive.byteLength - 6, true)

const read = (archive: Uint8Array, limits = ARCHIVE_LIMITS) => readArchiveDirectory(memoryFile(archive), limits)

async function rejection(promise: Promise<unknown>): Promise<string> {
  const error = await promise.then(
    () => undefined,
    (reason: unknown) => reason,
  )
  expect(error).toBeInstanceOf(NotesArchiveError)
  return (error as Error).message
}

const rejected = (archive: Uint8Array, limits = ARCHIVE_LIMITS) => rejection(read(archive, limits))

// @requirement PRODUCT.md §24.4
describe('notes archive central directory', () => {
  it('lists the entries export writes, in central-directory order', async () => {
    const image = imageEntry('image-1', new Uint8Array([7, 8, 9]))
    const archive = buildZip([documentEntry, { ...image, flags: 0x0008, descriptor: true }])
    const entries = await read(archive)
    expect(
      entries.map(({ name, attachmentId, method, size, compressedSize, localHeaderOffset }) => ({
        name,
        attachmentId,
        method,
        size,
        compressedSize,
        localHeaderOffset,
      })),
    ).toEqual([
      { name: 'document.json', attachmentId: undefined, method: 0, size: 7, compressedSize: 7, localHeaderOffset: 0 },
      {
        name: 'attachments/image-1.png',
        attachmentId: 'image-1',
        method: 0,
        size: 3,
        compressedSize: 3,
        localHeaderOffset: 50,
      },
    ])
    expect(entries[1]!.crc32).toBe(crc32(new Uint8Array([7, 8, 9])))
    expect(entries[1]!.flags).toBe(0x0008)
    expect([...entries[1]!.nameBytes]).toEqual([...bytes('attachments/image-1.png')])
  })

  it('rejects files that are not complete archives', async () => {
    const archive = buildZip([documentEntry])
    expect(await rejected(new Uint8Array(21))).toBe(NOT_AN_ARCHIVE_MESSAGE)
    expect(await rejected(new Uint8Array(4096).fill(0x50))).toBe(NOT_AN_ARCHIVE_MESSAGE)
    // Truncation removes the end record.
    expect(await rejected(archive.slice(0, -1))).toBe(NOT_AN_ARCHIVE_MESSAGE)
    expect(await rejected(archive.slice(1))).toBe(NOT_AN_ARCHIVE_MESSAGE)
    // A comment length that reaches past the end of the file.
    expect(await rejected(patch(archive, archive.byteLength - 2, 10, 2))).toBe(NOT_AN_ARCHIVE_MESSAGE)
    expect(await rejected(buildZip([documentEntry], { directoryOffset: 1 }))).toBe(NOT_AN_ARCHIVE_MESSAGE)
    expect(await rejected(buildZip([documentEntry], { directoryBytes: 10 }))).toBe(NOT_AN_ARCHIVE_MESSAGE)
    expect(await rejected(buildZip([documentEntry], { beforeEnd: new Uint8Array(4) }))).toBe(NOT_AN_ARCHIVE_MESSAGE)
  })

  it('rejects comments, split archives and ZIP64 records', async () => {
    expect(await rejected(buildZip([documentEntry], { comment: bytes('note') }))).toBe(UNSUPPORTED_ARCHIVE_MESSAGE)
    // Bytes after the end record read as an undeclared comment.
    expect(await rejected(buildZip([documentEntry], { trailing: new Uint8Array([0]) }))).toBe(
      UNSUPPORTED_ARCHIVE_MESSAGE,
    )
    expect(await rejected(buildZip([documentEntry], { comment: new Uint8Array(0xffff) }))).toBe(
      UNSUPPORTED_ARCHIVE_MESSAGE,
    )
    expect(await rejected(buildZip([documentEntry], { disk: 1 }))).toBe(UNSUPPORTED_ARCHIVE_MESSAGE)
    expect(await rejected(buildZip([documentEntry], { directoryDisk: 1 }))).toBe(UNSUPPORTED_ARCHIVE_MESSAGE)
    expect(await rejected(buildZip([documentEntry, imageEntry('a')], { diskEntryCount: 1 }))).toBe(
      UNSUPPORTED_ARCHIVE_MESSAGE,
    )
    expect(await rejected(buildZip([documentEntry], { directoryOffset: 0xffffffff }))).toBe(UNSUPPORTED_ARCHIVE_MESSAGE)
    expect(await rejected(buildZip([documentEntry], { directoryBytes: 0xffffffff }))).toBe(UNSUPPORTED_ARCHIVE_MESSAGE)
    const locator = new Uint8Array(20)
    new DataView(locator.buffer).setUint32(0, 0x07064b50, true)
    expect(await rejected(buildZip([documentEntry], { beforeEnd: locator }))).toBe(UNSUPPORTED_ARCHIVE_MESSAGE)
    for (const field of [
      { compressedSize: 0xffffffff },
      { size: 0xffffffff },
      { localHeaderOffset: 0xffffffff },
      { versionNeeded: 45 },
      { centralExtra: new Uint8Array([1, 0, 0, 0]) },
      { comment: bytes('c') },
      { diskStart: 1 },
    ]) {
      expect(await rejected(buildZip([{ ...documentEntry, ...field }]))).toBe(UNSUPPORTED_ARCHIVE_MESSAGE)
    }
  })

  it('rejects archive and entry counts outside the limits', async () => {
    const limits = { ...ARCHIVE_LIMITS, entries: 2 }
    expect(await read(buildZip([documentEntry, imageEntry('a')]), limits)).toHaveLength(2)
    expect(await rejected(buildZip([documentEntry, imageEntry('a'), imageEntry('b')]), limits)).toBe(
      TOO_MANY_ENTRIES_MESSAGE,
    )
    expect(await rejected(buildZip([]))).toBe(NO_DOCUMENT_MESSAGE)
    const archive = buildZip([documentEntry])
    expect(await rejected(archive, { ...ARCHIVE_LIMITS, archiveBytes: archive.byteLength - 1 })).toBe(
      ARCHIVE_FILE_TOO_LARGE_MESSAGE,
    )
    expect(await read(archive, { ...ARCHIVE_LIMITS, archiveBytes: archive.byteLength })).toHaveLength(1)
    // The count disagrees with the records in the directory.
    expect(await rejected(buildZip([documentEntry, imageEntry('a')], { entryCount: 3 }))).toBe(NOT_AN_ARCHIVE_MESSAGE)
    expect(await rejected(buildZip([documentEntry, imageEntry('a')], { entryCount: 1 }))).toBe(NOT_AN_ARCHIVE_MESSAGE)
  })

  it('rejects damaged central records', async () => {
    const archive = buildZip([documentEntry])
    const directory = directoryOffsetOf(archive)
    expect(await rejected(patch(archive, directory, 0x02014b51, 4))).toBe(NOT_AN_ARCHIVE_MESSAGE)
    // A name length that reaches past the directory.
    expect(await rejected(patch(archive, directory + 28, 40, 2))).toBe(NOT_AN_ARCHIVE_MESSAGE)
    // Records larger than any valid record would make the directory too large to read: one record
    // may hold at most 46 + 267 bytes, the longest valid name.
    expect(await rejected(buildZip([{ ...documentEntry, centralExtra: new Uint8Array(254) }]))).toBe(
      UNSUPPORTED_ARCHIVE_MESSAGE,
    )
    expect(await rejected(buildZip([{ ...documentEntry, centralExtra: new Uint8Array(255) }]))).toBe(
      NOT_AN_ARCHIVE_MESSAGE,
    )
    // Extra-field and comment lengths that reach past the directory.
    expect(await rejected(patch(archive, directory + 30, 1000, 2))).toBe(NOT_AN_ARCHIVE_MESSAGE)
    expect(await rejected(patch(archive, directory + 32, 1000, 2))).toBe(NOT_AN_ARCHIVE_MESSAGE)
    // A name that would run into the next record and past the directory is not decoded.
    const two = buildZip([documentEntry, imageEntry('a')])
    expect(await rejected(patch(two, directoryOffsetOf(two) + 28, 200, 2))).toBe(NOT_AN_ARCHIVE_MESSAGE)
  })

  it('states each problem in the wording of PRODUCT §24.4', () => {
    expect([
      NOT_AN_ARCHIVE_MESSAGE,
      ARCHIVE_FILE_TOO_LARGE_MESSAGE,
      TOO_MANY_ENTRIES_MESSAGE,
      CONTENT_TOO_LARGE_MESSAGE,
      UNSUPPORTED_ARCHIVE_MESSAGE,
      ENCRYPTED_ARCHIVE_MESSAGE,
      INVALID_NAME_MESSAGE,
      NO_DOCUMENT_MESSAGE,
      unexpectedEntryMessage('.DS_Store'),
      duplicateEntryMessage('document.json'),
      entryTooLargeMessage('document.json'),
      unsupportedMethodMessage('document.json'),
      damagedEntryMessage('attachments/a1.png'),
    ]).toEqual([
      'The file is not a Tree notes archive, or it is damaged.',
      'The file is larger than a Tree notes archive can be.',
      'The archive has more entries than a Tree notes archive can hold.',
      'The archive contents are larger than Tree allows.',
      'The archive uses ZIP features that Tree notes archives never use, such as ZIP64 records, comments or extra fields.',
      'The archive is encrypted.',
      'The archive contains an entry name that is not valid UTF-8.',
      'The archive does not contain document.json.',
      'The archive contains “.DS_Store”, which a Tree notes archive cannot contain. Import the original file that Tree exported.',
      'The archive contains “document.json” more than once.',
      '“document.json” is larger than Tree allows.',
      '“document.json” uses a compression method that Tree does not support.',
      '“attachments/a1.png” is damaged.',
    ])
  })

  it('accepts only document.json and attachments/<id>.png names', async () => {
    const longId = 'a'.repeat(251)
    expect(classifyEntryName('document.json')).toBeNull()
    expect(classifyEntryName('attachments/abc_D-9.png')).toBe('abc_D-9')
    expect(classifyEntryName(`attachments/${longId}.png`)).toBe(longId)
    const foreign = [
      '',
      '../document.json',
      '/document.json',
      'Document.json',
      'document.json/',
      'document.json\u0000',
      'attachments/',
      'attachments/.png',
      'attachments/a.PNG',
      'attachments/a b.png',
      'attachments/x/y.png',
      'attachments\\a.png',
      'attachments/../a.png',
      `attachments/${longId}a.png`,
      'Tree Notes 2026-10-20/document.json',
      '__MACOSX/._document.json',
      '.DS_Store',
      'attachments/.DS_Store',
    ]
    for (const name of foreign) {
      expect(classifyEntryName(name), name).toBeUndefined()
      expect(await rejected(buildZip([documentEntry, { name, data: new Uint8Array(1) }]))).toBe(
        unexpectedEntryMessage(name),
      )
    }
    expect(
      await rejected(buildZip([documentEntry, { name: new Uint8Array([0x61, 0xff]), data: new Uint8Array(1) }])),
    ).toBe(INVALID_NAME_MESSAGE)
    // A byte-order mark stays part of the name.
    const marked = new Uint8Array([0xef, 0xbb, 0xbf, ...bytes('document.json')])
    expect(await rejected(buildZip([{ ...documentEntry, name: marked }]))).toBe(
      unexpectedEntryMessage('﻿document.json'),
    )
  })

  it('reports a foreign name before the other problems of its record', async () => {
    const finder = { name: '__MACOSX/._document.json', data: new Uint8Array(1), centralExtra: new Uint8Array(12) }
    expect(await rejected(buildZip([finder, documentEntry]))).toBe(unexpectedEntryMessage(finder.name))
  })

  it('shows names without control characters and shortened', () => {
    expect(unexpectedEntryMessage('a\u0000b‮c')).toContain('“a�b�c”')
    expect(unexpectedEntryMessage(`${'x'.repeat(100)}`)).toContain(`“${'x'.repeat(79)}…”`)
    expect(unexpectedEntryMessage(`${'x'.repeat(80)}`)).toContain(`“${'x'.repeat(80)}”`)
  })

  it('rejects exact and case-insensitive duplicates', async () => {
    expect(await rejected(buildZip([documentEntry, documentEntry]))).toBe(duplicateEntryMessage('document.json'))
    expect(await rejected(buildZip([documentEntry, imageEntry('Ab'), imageEntry('aB')]))).toBe(
      duplicateEntryMessage('attachments/aB.png'),
    )
  })

  it('rejects encryption and unsupported methods', async () => {
    for (const flags of [0x0001, 0x0040, 0x2000]) {
      expect(await rejected(buildZip([{ ...documentEntry, flags }]))).toBe(ENCRYPTED_ARCHIVE_MESSAGE)
    }
    expect(await read(buildZip([{ ...documentEntry, flags: 0x0806 }]))).toHaveLength(1)
    expect(await rejected(buildZip([{ ...documentEntry, method: 12 }]))).toBe(unsupportedMethodMessage('document.json'))
    expect(await read(buildZip([{ ...documentEntry, method: 8 }]))).toHaveLength(1)
  })

  it('rejects entries larger than the limits or with inconsistent sizes', async () => {
    const limits = { ...ARCHIVE_LIMITS, documentBytes: 7, imageBytes: 3, archiveBytes: 1000 }
    expect(await read(buildZip([documentEntry, imageEntry('a')]), limits)).toHaveLength(2)
    expect(await rejected(buildZip([{ ...documentEntry, data: bytes('{"x":12}') }]), limits)).toBe(
      entryTooLargeMessage('document.json'),
    )
    expect(await rejected(buildZip([documentEntry, imageEntry('a', new Uint8Array(4))]), limits)).toBe(
      entryTooLargeMessage('attachments/a.png'),
    )
    // A deflated entry may declare a size up to the limit, but not more.
    expect(await read(buildZip([{ ...documentEntry, method: 8, size: 7 }]), limits)).toHaveLength(1)
    expect(await rejected(buildZip([{ ...documentEntry, method: 8, size: 8 }]), limits)).toBe(
      entryTooLargeMessage('document.json'),
    )
    expect(await rejected(buildZip([{ ...documentEntry, size: 6 }]))).toBe(damagedEntryMessage('document.json'))
    // Deflated entries may declare more bytes in total than the file holds, but not more than the limit.
    const many = buildZip([
      documentEntry,
      ...['a', 'b', 'c'].map((id) => ({ ...imageEntry(id, new Uint8Array(1)), method: 8, size: 1000 })),
    ])
    const declared = { ...limits, imageBytes: 1000, archiveBytes: 3007 }
    expect(many.byteLength).toBeLessThan(3007)
    expect(await read(many, declared)).toHaveLength(4)
    expect(await rejected(many, { ...declared, archiveBytes: 3006 })).toBe(CONTENT_TOO_LARGE_MESSAGE)
  })

  it('rejects entries outside the file or overlapping each other', async () => {
    expect(await rejected(buildZip([documentEntry, { ...imageEntry('a'), localHeaderOffset: 0 }]))).toBe(
      NOT_AN_ARCHIVE_MESSAGE,
    )
    // The entry's data would reach into the central directory.
    expect(await rejected(buildZip([{ ...documentEntry, method: 8, compressedSize: 8 }]))).toBe(NOT_AN_ARCHIVE_MESSAGE)
    expect(await rejected(buildZip([{ ...documentEntry, localHeaderOffset: 1 }]))).toBe(NOT_AN_ARCHIVE_MESSAGE)
    // Entries may be listed in any order and may leave gaps for data descriptors.
    const reordered = buildZip([imageEntry('b'), { ...documentEntry, flags: 0x0008, descriptor: true }])
    expect((await read(reordered)).map((entry) => entry.name)).toEqual(['attachments/b.png', 'document.json'])
    // The central directory may list entries in another order than their local headers.
    const shuffled = buildZip([documentEntry, imageEntry('a'), imageEntry('b')], { centralOrder: [2, 0, 1] })
    expect((await read(shuffled)).map((entry) => entry.name)).toEqual([
      'attachments/b.png',
      'document.json',
      'attachments/a.png',
    ])
  })
})

// @requirement PRODUCT.md §24.4
describe('notes archive entries', () => {
  const entryOf = async (archive: Uint8Array, index = 0) => (await read(archive))[index]!
  const readEntry = async (archive: Uint8Array, inflater: CreateInflater = passThroughInflater, index = 0) =>
    readArchiveEntry(memoryFile(archive), await entryOf(archive, index), inflater)

  it('reads stored and deflated entries with matching sizes and CRC-32', async () => {
    const data = bytes('{"x":1}')
    expect([...(await readEntry(buildZip([documentEntry])))]).toEqual([...data])
    expect([...(await readEntry(buildZip([{ ...documentEntry, method: 8 }])))]).toEqual([...data])
    expect([...(await readEntry(buildZip([{ ...documentEntry, flags: 0x0008, descriptor: true }])))]).toEqual([...data])
    expect([...(await readEntry(buildZip([documentEntry, imageEntry('a')]), passThroughInflater, 1))]).toEqual([
      1, 2, 3,
    ])
    expect([...(await readEntry(buildZip([{ ...documentEntry, data: new Uint8Array(0) }])))]).toEqual([])
  })

  it('rejects a CRC-32 or size that does not match the produced bytes', async () => {
    const damaged = damagedEntryMessage('document.json')
    const archive = buildZip([{ ...documentEntry, crc32: 1 }])
    expect(await rejection(readEntry(archive))).toBe(damaged)
    expect(await rejection(readEntry(buildZip([{ ...documentEntry, method: 8, size: 8 }])))).toBe(damaged)
    expect(await rejection(readEntry(buildZip([{ ...documentEntry, method: 8, size: 6 }])))).toBe(damaged)
  })

  it('rejects a local header that does not repeat the central record', async () => {
    const damaged = damagedEntryMessage('document.json')
    for (const field of [
      { localName: 'document.jsoN' },
      { localName: 'document.jsonx' },
      { localName: 'attachments/a.png' },
      { localMethod: 8 },
      { localFlags: 0x0002 },
      { localExtra: new Uint8Array(4) },
      { localCrc32: 5 },
      { localSize: 8 },
    ]) {
      expect(await rejection(readEntry(buildZip([{ ...documentEntry, ...field }]))), JSON.stringify(field)).toBe(
        damaged,
      )
    }
    const archive = buildZip([documentEntry])
    expect(await rejection(readEntry(patch(archive, 0, 0x04034b51, 4)))).toBe(damaged)
    expect(await rejection(readEntry(patch(archive, 18, 8, 4)))).toBe(damaged)
    // A data descriptor leaves the local CRC-32 and sizes empty.
    expect(await readEntry(buildZip([{ ...documentEntry, flags: 0x0008 }]))).toHaveLength(7)
  })

  it('feeds Deflate data in small slices and marks only the last one final', async () => {
    const data = new Uint8Array(1024 * 1024 + 20_000).map((_, index) => index % 251)
    const pushes: { length: number; final: boolean }[] = []
    const recording: CreateInflater = (onData) => ({
      push(chunk, final) {
        pushes.push({ length: chunk.byteLength, final })
        onData(chunk.slice())
      },
    })
    const archive = buildZip([{ ...documentEntry, method: 8, data }], {})
    const result = await readArchiveEntry(memoryFile(archive), await entryOf(archive), recording)
    // A deep equality matcher walks a megabyte element by element and times out under coverage.
    expect(result.byteLength).toBe(data.byteLength)
    expect(result.every((byte, index) => byte === data[index])).toBe(true)
    expect(pushes.every((push) => push.length <= 16 * 1024)).toBe(true)
    expect(pushes.filter((push) => push.final)).toHaveLength(1)
    expect(pushes.at(-1)).toEqual({ length: (1024 * 1024 + 20_000) % (16 * 1024), final: true })
    expect(pushes).toHaveLength(64 + 2)

    // Data that ends exactly at a slice boundary still ends with one final push.
    pushes.length = 0
    const even = buildZip([{ ...documentEntry, method: 8, data: data.slice(0, 32 * 1024) }])
    await readArchiveEntry(memoryFile(even), await entryOf(even), recording)
    expect(pushes).toEqual([
      { length: 16 * 1024, final: false },
      { length: 16 * 1024, final: true },
    ])
  })

  it('rejects an entry when the decoder fails after producing every byte', async () => {
    const archive = buildZip([{ ...documentEntry, method: 8 }])
    const trailingGarbage: CreateInflater = (onData) => ({
      push(chunk) {
        onData(chunk.slice())
        throw new Error('unexpected data after the end of the stream')
      },
    })
    expect(await rejection(readArchiveEntry(memoryFile(archive), await entryOf(archive), trailingGarbage))).toBe(
      damagedEntryMessage('document.json'),
    )
  })

  it('stops inflating once the output exceeds the declared size', async () => {
    let pushes = 0
    const bomb: CreateInflater = (onData) => ({
      push() {
        pushes += 1
        onData(new Uint8Array(1024 * 1024))
      },
    })
    const archive = buildZip([{ ...documentEntry, method: 8, data: new Uint8Array(64 * 1024), size: 1024 * 1024 }])
    expect(await rejection(readArchiveEntry(memoryFile(archive), await entryOf(archive), bomb))).toBe(
      damagedEntryMessage('document.json'),
    )
    expect(pushes).toBe(2)
  })

  it('reports a Deflate failure as a damaged entry and passes archive errors through', async () => {
    const archive = buildZip([{ ...documentEntry, method: 8 }])
    const failing: CreateInflater = () => ({
      push() {
        throw new Error('invalid block type')
      },
    })
    expect(await rejection(readArchiveEntry(memoryFile(archive), await entryOf(archive), failing))).toBe(
      damagedEntryMessage('document.json'),
    )
    const refusing: CreateInflater = () => ({
      push() {
        throw new NotesArchiveError('specific')
      },
    })
    expect(await rejection(readArchiveEntry(memoryFile(archive), await entryOf(archive), refusing))).toBe('specific')
    // An empty Deflate entry still ends the stream, which a real decoder rejects.
    const finals: boolean[] = []
    const empty = buildZip([{ ...documentEntry, method: 8, data: new Uint8Array(0) }])
    const ending: CreateInflater = (onData) => ({
      push(chunk, final) {
        finals.push(final)
        onData(chunk)
      },
    })
    expect(await readArchiveEntry(memoryFile(empty), await entryOf(empty), ending)).toHaveLength(0)
    expect(finals).toEqual([true])
  })
})
