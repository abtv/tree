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
  it('bounds progress notifications for hundreds of images while retaining the final count', async () => {
    const ids = Array.from({ length: 201 }, (_, index) => `image-${index}`)
    const images = Object.fromEntries(ids.map((id) => [id, new Uint8Array([1])]))

    const posts = await run(headWithImages(ids), images)

    const progress = posts.flatMap(({ message }) => (message.type === 'progress' ? [message] : []))
    expect(progress).toHaveLength(101)
    expect(progress.map(({ imagesDone, imageCount }) => Math.floor((imagesDone * 100) / imageCount))).toEqual(
      Array.from({ length: 101 }, (_, percent) => percent),
    )
    expect(progress.at(-1)).toEqual({ type: 'progress', imagesDone: 201, imageCount: 201 })
    expect(posts.at(-1)!.message).toMatchObject({ type: 'done', summary: { imageCount: 201, missingImageCount: 0 } })
  })

  it('flushes accumulated small image chunks without losing their order or contents', async () => {
    const images = {
      a: new Uint8Array(400_000).fill(1),
      b: new Uint8Array(400_000).fill(2),
      c: new Uint8Array(400_000).fill(3),
    }
    const head = headWithImages(Object.keys(images))

    const posts = await run(head, images)

    expect(chunksOf(posts).length).toBeGreaterThan(1)
    const entries = readArchive(concat(chunksOf(posts)))
    expect([...entries.keys()]).toEqual([
      'document.json',
      'attachments/a.png',
      'attachments/b.png',
      'attachments/c.png',
    ])
    for (const [id, image] of Object.entries(images))
      expect(sameBytes(entries.get(`attachments/${id}.png`), image)).toBe(true)
    expect(posts.at(-1)!.message).toMatchObject({ type: 'done', summary: { imageCount: 3, missingImageCount: 0 } })
  })

  it('transfers an exact one-MiB image directly and does not merge it with pending headers', async () => {
    const image = new Uint8Array(CHUNK_FLUSH_BYTES).fill(7)

    const posts = await run(headWithImages(['boundary']), { boundary: image })

    const chunks = chunksOf(posts)
    expect(chunks.some((chunk) => chunk.buffer === image.buffer)).toBe(true)
    expect(sameBytes(readArchive(concat(chunks)).get('attachments/boundary.png'), image)).toBe(true)
  })

  it('keeps the caller buffer intact when transferring a zero-offset partial view', async () => {
    const backing = new Uint8Array(CHUNK_FLUSH_BYTES + 100).fill(9)
    const image = backing.subarray(0, CHUNK_FLUSH_BYTES)
    const messages: ArchiveWorkerMessage[] = []

    await runExportJob(
      { readHead: async () => headWithImages(['view']), readImage: async () => image },
      (message, transfer = []) => messages.push(structuredClone(message, { transfer })),
    )

    expect(backing.byteLength).toBe(CHUNK_FLUSH_BYTES + 100)
    const chunks = messages.flatMap((message) => (message.type === 'chunk' ? [new Uint8Array(message.chunk)] : []))
    expect(sameBytes(readArchive(concat(chunks)).get('attachments/view.png'), image)).toBe(true)
    expect(messages.at(-1)).toMatchObject({ type: 'done' })
  })

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
