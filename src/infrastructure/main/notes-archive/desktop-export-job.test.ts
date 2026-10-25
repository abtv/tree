import { mkdir, mkdtemp, readFile, readdir, rm, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { serializeState, type TreeNode } from '../../../domain/document'
import { exportNotesArchive } from '../../../application/notes-archive/export-notes'
import { prepareNotesImport } from '../../../application/notes-archive/import-notes'
import { memoryFile } from '../../../application/test/zip-builder'
import { onePixelPng } from '../../../electron/main/png-test-utils'
import { createInflater } from '../../archive/zip-inflate'
import { createZipWriter } from '../../archive/zip-writer'
import { concat } from '../../archive/zip-test-utils'
import { createFileServices } from '../file-services'
import type { ArchiveWorkerChannel, ArchiveWorkerMessage, ArchiveWorkerReply } from './archive-worker-protocol'
import { runDesktopExport } from './desktop-export-job'

const directories: string[] = []

afterEach(async () => {
  vi.useRealTimers()
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'tree-desktop-export-'))
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

/** Answers requests as the main process does and records every message in order. */
function recordingChannel(): ArchiveWorkerChannel & { messages: ArchiveWorkerMessage[] } {
  const messages: ArchiveWorkerMessage[] = []
  return {
    messages,
    post(message) {
      // Every message must survive structured cloning to the main process.
      messages.push(structuredClone(message))
    },
    async request(message) {
      messages.push(structuredClone(message))
      const reply: ArchiveWorkerReply = { type: 'pinned' }
      return reply
    },
  }
}

async function savedNotes(head: ReturnType<typeof headWithImages>, images: Record<string, Uint8Array>) {
  const userData = await temporaryDirectory()
  const data = join(userData, 'data')
  const services = createFileServices(data, () => {}, { userDataDirectory: userData })
  await services.load()
  for (const [id, bytes] of Object.entries(images)) await services.writeAttachment(id, bytes)
  await services.save(head)
  return { userData, data, services, snapshot: await services.snapshotDocuments() }
}

// @requirement PRODUCT.md §24.3
describe('desktop export job', () => {
  it('writes the snapshot head and available images as the archive the browser writes', async () => {
    // ZIP headers include wall-clock timestamps; both exports must use the same instant.
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-14T12:00:00Z'))
    const head = headWithImages(['a', 'missing'], 'Exported')
    const { userData, data, snapshot } = await savedNotes(head, { a: onePixelPng })
    const temporaryPath = join(userData, '.archive.tmp')
    const channel = recordingChannel()

    await runDesktopExport(
      { type: 'export', snapshotDirectory: snapshot, attachmentsDirectory: join(data, 'attachments'), temporaryPath },
      channel,
    )

    const archive = new Uint8Array(await readFile(temporaryPath))

    expect(channel.messages[0]).toEqual({ type: 'pin', ids: expect.arrayContaining(['a', 'missing']) })
    expect(channel.messages.at(-1)).toEqual({
      type: 'written',
      summary: { imageCount: 1, missingImageCount: 1, archiveBytes: archive.byteLength },
    })
    expect(channel.messages.filter((message) => message.type === 'progress')).toEqual([
      { type: 'progress', imagesDone: 0, imageCount: 2 },
      { type: 'progress', imagesDone: 1, imageCount: 2 },
      { type: 'progress', imagesDone: 2, imageCount: 2 },
    ])

    const browserChunks: Uint8Array[] = []

    await exportNotesArchive(
      { readHead: async () => head, readImage: async (id) => (id === 'a' ? onePixelPng : undefined) },
      createZipWriter((chunk) => browserChunks.push(chunk.slice())),
    )

    expect(archive).toEqual(concat(browserChunks))

    const images = new Map<string, Uint8Array>()
    const prepared = await prepareNotesImport(memoryFile(archive), {
      createInflater,
      validateImage: async () => {},
      images: {
        readImage: async (id) => images.get(id),
        writeImage: async (id, bytes) => void images.set(id, bytes),
        removeImages: async () => {},
      },
    })

    expect(prepared.head).toEqual(head)
    expect(images.get('a')).toEqual(onePixelPng)
  })

  it('exports the newest stored version that opens', async () => {
    const snapshot = await temporaryDirectory()
    const older = headWithImages([], 'Older generation')

    await writeFile(join(snapshot, 'document.3.json'), JSON.stringify(older))
    await utimes(join(snapshot, 'document.3.json'), 1_000, 1_000)
    await writeFile(join(snapshot, 'document.json'), '{"version":1,"document":')
    const temporaryPath = join(snapshot, '.archive.tmp')
    const channel = recordingChannel()

    await runDesktopExport(
      { type: 'export', snapshotDirectory: snapshot, attachmentsDirectory: join(snapshot, 'none'), temporaryPath },
      channel,
    )

    expect(channel.messages.at(-1)).toMatchObject({ type: 'written' })

    const prepared = await prepareNotesImport(memoryFile(new Uint8Array(await readFile(temporaryPath))), {
      createInflater,
      validateImage: async () => {},
      images: { readImage: async () => undefined, writeImage: async () => {}, removeImages: async () => {} },
    })

    expect(prepared.head).toEqual(older)
  })

  it('refuses missing or invalid notes before creating a file or pinning images', async () => {
    for (const [files, message] of [
      [{}, 'There are no saved notes to export.'],
      [{ 'document.json': '{"version":1}' }, 'The saved notes are invalid, so they cannot be exported.'],
      [{ 'document.json': '{' }, 'The saved notes are invalid, so they cannot be exported.'],
    ] as const) {
      const snapshot = await temporaryDirectory()
      for (const [name, contents] of Object.entries(files)) await writeFile(join(snapshot, name), contents)
      const temporaryPath = join(snapshot, '.archive.tmp')
      const channel = recordingChannel()

      await runDesktopExport(
        { type: 'export', snapshotDirectory: snapshot, attachmentsDirectory: snapshot, temporaryPath },
        channel,
      )

      expect(channel.messages).toEqual([{ type: 'error', message }])
      expect(await readdir(snapshot)).toEqual(Object.keys(files))
    }
  })

  it('reports a file that cannot be written as an archive that could not be saved', async () => {
    const { userData, data, snapshot } = await savedNotes(headWithImages([]), {})
    const channel = recordingChannel()

    await runDesktopExport(
      {
        type: 'export',
        snapshotDirectory: snapshot,
        attachmentsDirectory: join(data, 'attachments'),
        temporaryPath: join(userData, 'missing-folder', '.archive.tmp'),
      },
      channel,
    )

    expect(channel.messages.at(-1)).toEqual({
      type: 'error',
      message: expect.stringMatching(/^The archive could not be saved: ENOENT/),
    })
  })

  it('never overwrites an existing temporary file', async () => {
    const { userData, data, snapshot } = await savedNotes(headWithImages([]), {})
    const temporaryPath = join(userData, '.archive.tmp')

    await writeFile(temporaryPath, 'someone else')
    const channel = recordingChannel()

    await runDesktopExport(
      { type: 'export', snapshotDirectory: snapshot, attachmentsDirectory: join(data, 'attachments'), temporaryPath },
      channel,
    )

    expect(channel.messages.at(-1)).toEqual({
      type: 'error',
      message: expect.stringMatching(/^The archive could not be saved: EEXIST/),
    })
    expect(await readFile(temporaryPath, 'utf8')).toBe('someone else')
  })

  it('reports an image that cannot be read as notes that could not be read', async () => {
    const { userData, data, snapshot } = await savedNotes(headWithImages(['a']), {})

    await mkdir(join(data, 'attachments', 'a.png'))
    const channel = recordingChannel()

    await runDesktopExport(
      {
        type: 'export',
        snapshotDirectory: snapshot,
        attachmentsDirectory: join(data, 'attachments'),
        temporaryPath: join(userData, '.archive.tmp'),
      },
      channel,
    )

    expect(channel.messages.at(-1)).toEqual({
      type: 'error',
      message: expect.stringMatching(/^The notes could not be read: EISDIR/),
    })
  })
})
