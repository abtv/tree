import { describe, expect, it } from 'vitest'
import { serializeState } from '../../domain/document'
import { ARCHIVE_LIMITS } from '../../application/notes-archive/archive-policy'
import { ARCHIVE_TOO_LARGE_MESSAGE, exportNotesArchive } from '../../application/notes-archive/export-notes'
import { createZipWriter } from './zip-writer'
import { concat, listCentralEntries, readArchive, readArchiveStreaming, sameBytes } from './zip-test-utils'

function writeArchive(entries: { name: string; bytes: Uint8Array; deflate?: boolean }[]) {
  const chunks: Uint8Array[] = []
  const writer = createZipWriter((chunk) => chunks.push(chunk.slice()))
  for (const { name, bytes, deflate } of entries) {
    if (deflate) writer.addDeflated(name, bytes)
    else writer.addStored(name, bytes)
  }

  writer.finish()
  const archive = concat(chunks)

  expect(writer.bytesWritten).toBe(archive.byteLength)

  return archive
}

const signatures = {
  'local file header': [0x50, 0x4b, 0x03, 0x04],
  'data descriptor': [0x50, 0x4b, 0x07, 0x08],
  'central directory header': [0x50, 0x4b, 0x01, 0x02],
  'end of central directory': [0x50, 0x4b, 0x05, 0x06],
}

// A stored payload that contains a ZIP signature followed by plausible header fields.
function payloadWith(signature: number[]): Uint8Array {
  const bytes = new Uint8Array(160)
  for (let index = 0; index < bytes.length; index += 1) bytes[index] = (index * 37 + 11) & 0xff
  bytes.set(signature, 48)
  return bytes
}

describe('ZIP writer', () => {
  it('writes deflated and stored entries in order with data descriptors', () => {
    const document = new TextEncoder().encode(JSON.stringify({ text: 'a'.repeat(5000) }))
    const image = payloadWith([1, 2, 3, 4])
    const archive = writeArchive([
      { name: 'document.json', bytes: document, deflate: true },
      { name: 'attachments/a.png', bytes: image },
    ])
    const entries = listCentralEntries(archive)

    expect(entries.map(({ name, method }) => [name, method])).toEqual([
      ['document.json', 8],
      ['attachments/a.png', 0],
    ])
    expect(entries.every((entry) => (entry.flags & 0x8) !== 0)).toBe(true)
    expect(entries[0]!.compressedSize).toBeLessThan(document.byteLength)
    expect(entries[1]!.compressedSize).toBe(image.byteLength)
    expect([...readArchive(archive)]).toEqual([
      ['document.json', document],
      ['attachments/a.png', image],
    ])
  })

  it('streams a large deflated entry in several chunks', () => {
    // About 2.5 MiB of document-like JSON, fed to the deflater in three slices.
    const document = new TextEncoder().encode(
      JSON.stringify(Array.from({ length: 70_000 }, (_, index) => ({ id: `n${index}`, text: `Note ${index}` }))),
    )

    expect(document.byteLength).toBeGreaterThan(2 * 1024 * 1024)

    const chunks: Uint8Array[] = []
    const writer = createZipWriter((chunk) => chunks.push(chunk.slice()))

    writer.addDeflated('document.json', document)
    writer.finish()

    // Header, one output block per slice, descriptor and central directory.
    expect(chunks.length).toBeGreaterThan(4)
    expect(sameBytes(readArchive(concat(chunks)).get('document.json'), document)).toBe(true)
  })

  // The application budget assumes fflate's header, descriptor and directory sizes; a dependency
  // upgrade that changes them must fail here rather than let an archive exceed its limit.
  it('lets the export budget predict the real archive size exactly', async () => {
    const head = serializeState(
      {
        roots: [
          { id: 'a', text: 'A', attachment: { id: 'image-a', mimeType: 'image/png' }, children: [] },
          { id: 'b', text: 'B', attachment: { id: 'image-b', mimeType: 'image/png' }, children: [] },
        ],
      },
      { currentParentId: null, selectedNodeId: 'a' },
    )
    const source = { readHead: async () => head, readImage: async () => payloadWith([1, 2, 3, 4]) }
    const exportWith = async (archiveBytes: number) => {
      const chunks: Uint8Array[] = []

      const summary = await exportNotesArchive(
        source,
        createZipWriter((chunk) => chunks.push(chunk.slice())),
        undefined,
        { ...ARCHIVE_LIMITS, archiveBytes },
      )

      expect(concat(chunks).byteLength).toBe(summary.archiveBytes)

      return summary
    }

    const { archiveBytes } = await exportWith(ARCHIVE_LIMITS.archiveBytes)

    expect((await exportWith(archiveBytes)).imageCount).toBe(2)
    await expect(exportWith(archiveBytes - 1)).rejects.toThrow(ARCHIVE_TOO_LARGE_MESSAGE)
  })

  it('writes an empty deflated entry', () => {
    const archive = writeArchive([{ name: 'document.json', bytes: new Uint8Array(0), deflate: true }])

    expect(readArchive(archive).get('document.json')).toEqual(new Uint8Array(0))
  })

  // ADR 0022, D3: fflate's Zip records entry sizes only in data descriptors, and its streaming
  // Unzip finds the end of such an entry by scanning for signatures. A stored image can contain
  // those bytes by chance, so archives are read through the central directory instead.
  describe.each(Object.entries(signatures))('a stored entry containing a %s signature', (label, signature) => {
    const document = new TextEncoder().encode('{"version":4}')
    const image = payloadWith(signature)
    const next = payloadWith([9, 9, 9, 9])
    const archive = writeArchive([
      { name: 'document.json', bytes: document, deflate: true },
      { name: 'attachments/a.png', bytes: image },
      { name: 'attachments/b.png', bytes: next },
    ])
    const expected = [
      ['document.json', document],
      ['attachments/a.png', image],
      ['attachments/b.png', next],
    ]

    it('round-trips through the central directory', () => {
      expect([...readArchive(archive)]).toEqual(expected)
    })

    const misread = label !== 'end of central directory'
    it(`${misread ? 'is misread' : 'is read correctly'} by forward scanning`, () => {
      let streamed: unknown
      try {
        streamed = [...readArchiveStreaming(archive)]
      } catch (error) {
        streamed = error
      }

      if (misread) expect(streamed).not.toEqual(expected)
      else expect(streamed).toEqual(expected)
    })
  })
})
