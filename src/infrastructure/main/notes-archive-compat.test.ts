import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { unzipSync } from 'fflate'
import { serializeState } from '../../domain/document'
import { exportNotesArchive } from '../../application/notes-archive/export-notes'
import { onePixelPng } from '../../electron/main/png-test-utils'
import { createZipWriter } from '../../web/archive/zip-writer'
import { concat } from '../../web/archive/zip-test-utils'
import { createFileServices } from './file-services'

const directories: string[] = []

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

// @requirement PRODUCT.md §24.2
describe('notes archive compatibility with the desktop data directory', () => {
  it('loads the extracted document and images through the desktop file services', async () => {
    const head = serializeState(
      {
        roots: [
          {
            id: 'root',
            text: 'Exported from the browser',
            attachment: { id: 'image-1', mimeType: 'image/png' },
            children: [{ id: 'child', text: 'Nested ünïcödé 🌳', struckThrough: true, children: [] }],
          },
        ],
      },
      { currentParentId: null, selectedNodeId: 'child' },
      { expandedIds: ['root'], selectedRowTop: 40 },
    )
    const chunks: Uint8Array[] = []
    await exportNotesArchive(
      { readHead: async () => head, readImage: async () => onePixelPng.slice() },
      createZipWriter((chunk) => chunks.push(chunk.slice())),
    )
    const archive = concat(chunks)
    const directory = await mkdtemp(join(tmpdir(), 'tree-notes-archive-'))
    directories.push(directory)
    for (const [name, bytes] of Object.entries(unzipSync(archive))) {
      await mkdir(dirname(join(directory, name)), { recursive: true })
      await writeFile(join(directory, name), bytes)
    }

    const services = createFileServices(directory, () => {})
    expect(await services.load()).toEqual(head)
    expect(await services.readAttachment('image-1')).toEqual(onePixelPng)
  })
})
