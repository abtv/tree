import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { openSync, closeSync, truncateSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { deflateSync } from 'fflate'
import { afterEach, describe, expect, it } from 'vitest'
import { serializeState, type TreeNode } from '../../../domain/document'
import { exportNotesArchive } from '../../../application/notes-archive/export-notes'
import { buildZip } from '../../../application/test/zip-builder'
import {
  ENCRYPTED_ARCHIVE_MESSAGE,
  NOT_AN_ARCHIVE_MESSAGE,
  damagedEntryMessage,
} from '../../../application/notes-archive/zip-reader'
import { onePixelPng, transparentPng } from '../../../electron/main/png-test-utils'
import { createZipWriter } from '../../archive/zip-writer'
import { concat } from '../../archive/zip-test-utils'
import type { ArchiveWorkerChannel, ArchiveWorkerMessage, ArchiveWorkerReply } from './archive-worker-protocol'
import { descriptorArchiveFile, runDesktopImport } from './desktop-import-job'

const directories: string[] = []

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'tree-desktop-import-'))
  directories.push(directory)
  return directory
}

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

async function browserArchive(head: unknown, images: Record<string, Uint8Array>): Promise<Uint8Array> {
  const chunks: Uint8Array[] = []
  await exportNotesArchive(
    { readHead: async () => head, readImage: async (id) => images[id] },
    createZipWriter((chunk) => chunks.push(chunk.slice())),
  )
  return concat(chunks)
}

interface Setup {
  readonly archive: Uint8Array
  /** Files of the current notes in the snapshot that main takes after staging. */
  readonly current?: Record<string, string>
  readonly decodable?: (bytes: Uint8Array) => boolean
}

async function runImport({ archive, current = {}, decodable = () => true }: Setup) {
  const directory = await temporaryDirectory()
  const archivePath = join(directory, 'Tree Notes 2026-10-20.zip')
  await writeFile(archivePath, archive)
  const staging = join(directory, 'staging')
  await mkdir(join(staging, 'attachments'), { recursive: true })
  const snapshot = join(directory, 'snapshot')
  await mkdir(snapshot)
  for (const [name, contents] of Object.entries(current)) await writeFile(join(snapshot, name), contents)
  const messages: ArchiveWorkerMessage[] = []
  const decoded: Uint8Array[] = []
  const channel: ArchiveWorkerChannel = {
    post: (message) => messages.push(structuredClone(message)),
    async request(message) {
      messages.push(structuredClone(message))
      let reply: ArchiveWorkerReply
      if (message.type === 'validate-image') {
        // A request carries exactly the image's bytes, not a larger buffer it views.
        expect(message.bytes.byteLength).toBe(message.bytes.buffer.byteLength)

        decoded.push(message.bytes)
        reply = { type: 'image-validated', decodable: decodable(message.bytes) }
      } else if (message.type === 'staged') {
        reply = { type: 'count', snapshotDirectory: snapshot }
      } else {
        throw new Error(`Unexpected request ${message.type}`)
      }
      return reply
    },
  }
  await runDesktopImport({ type: 'import', archivePath, stagingDirectory: staging }, channel)
  return { messages, decoded, staging, archivePath }
}

const finalMessage = (messages: ArchiveWorkerMessage[]) => messages.at(-1)

// @requirement PRODUCT.md §24.4
describe('desktop import job', () => {
  it('stages a browser-written archive and reports both note counts', async () => {
    const incoming = headWithImages(['a', 'b', 'missing'], 'Imported')
    const archive = await browserArchive(incoming, { a: onePixelPng, b: transparentPng })
    const current = JSON.stringify(headWithImages(['old']))

    const { messages, decoded, staging } = await runImport({ archive, current: { 'document.json': current } })

    expect(finalMessage(messages)).toEqual({
      type: 'prepared',
      fileBytes: archive.byteLength,
      incoming: { nodeCount: 4, imageCount: 2, missingImageCount: 1 },
      current: { nodeCount: 2, imageCount: 1 },
    })
    expect(decoded).toEqual([onePixelPng, transparentPng])
    expect(messages.filter((message) => message.type === 'staged')).toHaveLength(1)
    expect(JSON.parse(await readFile(join(staging, 'document.json'), 'utf8'))).toEqual(incoming)
    expect((await readdir(join(staging, 'attachments'))).sort()).toEqual(['a.png', 'b.png'])
    expect(new Uint8Array(await readFile(join(staging, 'attachments', 'a.png')))).toEqual(onePixelPng)
  })

  it('reports missing and unopenable current notes', async () => {
    const archive = await browserArchive(headWithImages([]), {})
    for (const [current, expected] of [
      [{}, 'none'],
      [{ 'document.json': '{' }, 'invalid'],
    ] as const) {
      const { messages } = await runImport({ archive, current })

      expect(finalMessage(messages)).toMatchObject({ type: 'prepared', current: expected })
    }
  })

  it('rejects an image that the platform decoder refuses, before staging the document', async () => {
    const archive = await browserArchive(headWithImages(['a']), { a: onePixelPng })

    const { messages, staging } = await runImport({ archive, decodable: () => false })

    expect(finalMessage(messages)).toEqual({
      type: 'error',
      message: '“attachments/a.png” is not a usable image. Attachment data is not a decodable PNG image.',
    })
    expect(await readdir(staging)).toEqual(['attachments'])
  })

  it('rejects an image with an invalid PNG structure without asking the main process to decode it', async () => {
    const archive = await browserArchive(headWithImages(['a']), { a: new Uint8Array([1, 2, 3]) })

    const { messages, decoded } = await runImport({ archive })

    expect(finalMessage(messages)).toEqual({
      type: 'error',
      message: '“attachments/a.png” is not a usable image. Attachment data is not a valid PNG image.',
    })
    expect(decoded).toEqual([])
  })

  it('rejects hostile and unsupported archives with the browser reasons', async () => {
    const document = new TextEncoder().encode(JSON.stringify(headWithImages([])))
    const bomb = new Uint8Array(8 * 1024 * 1024)
    const newer = new TextEncoder().encode(JSON.stringify({ ...headWithImages([]), version: 99 }))
    for (const [archive, message] of [
      [new Uint8Array(30), NOT_AN_ARCHIVE_MESSAGE],
      [buildZip([{ name: 'document.json', data: document, flags: 0x0001 }]), ENCRYPTED_ARCHIVE_MESSAGE],
      [
        buildZip([{ name: 'document.json', method: 8, data: deflateSync(bomb), crc32: 0, size: 1000 }]),
        damagedEntryMessage('document.json'),
      ],
      [
        buildZip([{ name: 'document.json', data: newer }]),
        'document.json does not contain valid Tree notes. The saved document has an unsupported format.',
      ],
    ] as const) {
      const { messages, staging } = await runImport({ archive })

      expect(finalMessage(messages)).toEqual({ type: 'error', message })
      expect(await readdir(staging)).toEqual(['attachments'])
    }
  })

  it('reports an archive that cannot be opened', async () => {
    const directory = await temporaryDirectory()
    const messages: ArchiveWorkerMessage[] = []

    await runDesktopImport(
      { type: 'import', archivePath: join(directory, 'gone.zip'), stagingDirectory: directory },
      { post: (message) => messages.push(message), request: async () => ({ type: 'pinned' }) },
    )

    expect(messages).toEqual([
      { type: 'error', message: expect.stringMatching(/^The archive could not be imported: ENOENT/) },
    ])
  })

  it('reads exact ranges and detects a file that shrinks while it is read', async () => {
    const directory = await temporaryDirectory()
    const path = join(directory, 'archive.zip')
    await writeFile(path, new Uint8Array([1, 2, 3, 4, 5, 6]))
    const descriptor = openSync(path, 'r')
    try {
      const file = descriptorArchiveFile(descriptor)

      expect(file.size).toBe(6)
      expect(await file.read(2, 3)).toEqual(new Uint8Array([3, 4, 5]))

      truncateSync(path, 4)

      await expect(file.read(2, 3)).rejects.toThrow('The file changed while it was being read.')
    } finally {
      closeSync(descriptor)
    }
  })
})
