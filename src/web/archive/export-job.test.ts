import { describe, expect, it } from 'vitest'
import { serializeState, type TreeNode } from '../../domain/document'
import { INVALID_NOTES_MESSAGE } from '../../application/notes-archive/export-notes'
import { concat, readArchive, sameBytes } from '../../infrastructure/archive/zip-test-utils'
import type { ArchiveWorkerMessage } from '../workers/archive-protocol'
import { CHUNK_FLUSH_BYTES, runExportJob } from './export-job'

function headWithImages(ids: string[]) {
  const roots: TreeNode[] = [
    { id: 'root', text: 'Root', children: [] },
    ...ids.map((id) => ({
      id: `node-${id}`,
      text: id,
      attachment: { id, mimeType: 'image/png' as const },
      children: [],
    })),
  ]
  return serializeState({ roots }, { currentParentId: null, selectedNodeId: 'root' })
}

async function run(head: unknown, images: Record<string, unknown>, failImage?: string) {
  const posts: { message: ArchiveWorkerMessage; transfer: Transferable[] }[] = []
  await runExportJob(
    {
      readHead: async () => head,
      readImage: async (id) => {
        if (id === failImage) throw new Error('The read was aborted.')
        return images[id]
      },
    },
    (message, transfer = []) => {
      // Every message must survive structured cloning into the page.
      structuredClone(message)
      posts.push({ message, transfer })
    },
  )
  return posts
}

const chunksOf = (posts: Awaited<ReturnType<typeof run>>) =>
  posts.flatMap(({ message }) => (message.type === 'chunk' ? [new Uint8Array(message.chunk)] : []))

describe('archive worker export job', () => {
  it('streams the archive as transferred chunks, then reports a summary', async () => {
    const head = headWithImages(['a', 'b'])
    const a = new Uint8Array([1, 2, 3])
    const b = new Uint8Array([4, 5])
    const posts = await run(head, { a, b })

    for (const { message, transfer } of posts) {
      if (message.type === 'chunk') expect(transfer).toEqual([message.chunk])
      else expect(transfer).toEqual([])
    }
    // Headers, descriptors and small entries are combined into one chunk.
    expect(posts.map(({ message }) => message.type)).toEqual(['progress', 'progress', 'progress', 'chunk', 'done'])
    const archive = concat(chunksOf(posts))
    expect([...readArchive(archive)]).toEqual([
      ['document.json', new TextEncoder().encode(JSON.stringify(head))],
      ['attachments/a.png', a],
      ['attachments/b.png', b],
    ])
    expect(posts.at(-1)!.message).toEqual({
      type: 'done',
      summary: { imageCount: 2, missingImageCount: 0, archiveBytes: archive.byteLength },
    })
  })

  it('transfers a large image buffer without copying it', async () => {
    const image = new Uint8Array(CHUNK_FLUSH_BYTES + 10).fill(3)
    const posts = await run(headWithImages(['big']), { big: image })
    const chunks = posts.filter(({ message }) => message.type === 'chunk')
    expect(chunks.some(({ message }) => message.type === 'chunk' && message.chunk === image.buffer)).toBe(true)
    expect(sameBytes(readArchive(concat(chunksOf(posts))).get('attachments/big.png'), image)).toBe(true)
  })

  it('copies a chunk that views part of a larger buffer before transferring it', async () => {
    const backing = new Uint8Array(CHUNK_FLUSH_BYTES * 2).fill(5)
    const image = backing.subarray(1, CHUNK_FLUSH_BYTES + 2)
    const posts = await run(headWithImages(['view']), { view: image })
    for (const { message } of posts) if (message.type === 'chunk') expect(message.chunk).not.toBe(backing.buffer)
    expect(sameBytes(readArchive(concat(chunksOf(posts))).get('attachments/view.png'), image)).toBe(true)
  })

  it('reports progress at most once per percent', async () => {
    const ids = Array.from({ length: 250 }, (_, index) => `i${String(index).padStart(3, '0')}`)
    const posts = await run(headWithImages(ids), Object.fromEntries(ids.map((id) => [id, new Uint8Array([1])])))
    const progress = posts.flatMap(({ message }) => (message.type === 'progress' ? [message] : []))
    expect(progress.length).toBe(101)
    expect(progress[0]).toEqual({ type: 'progress', imagesDone: 0, imageCount: 250 })
    expect(progress.at(-1)).toEqual({ type: 'progress', imagesDone: 250, imageCount: 250 })
  })

  it('reports a refused export without producing archive bytes', async () => {
    const posts = await run({ invalid: true }, {})
    expect(posts).toEqual([{ message: { type: 'error', message: INVALID_NOTES_MESSAGE }, transfer: [] }])
  })

  it('reports an unexpected storage failure with its cause', async () => {
    const posts = await run(headWithImages(['a', 'b']), { a: new Uint8Array([1]) }, 'b')
    expect(posts.at(-1)!.message).toEqual({
      type: 'error',
      message: 'The notes could not be read: The read was aborted.',
    })
    expect(posts.some(({ message }) => message.type === 'done')).toBe(false)
  })
})
