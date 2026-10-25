import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { createEmojiHistoryStore } from './emoji-history'

it('loads absent/corrupt preferences safely and persists the latest queued normalized history', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'tree-emoji-history-'))
  const path = join(directory, 'emoji-history.json')
  const store = createEmojiHistoryStore(path)
  try {
    expect(await store.load()).toEqual([])
    await writeFile(path, '{broken')
    expect(await store.load()).toEqual([])

    await Promise.all([store.save(['cat', 'cat', 'unknown']), store.save(['rocket', 'cat'])])

    expect(await createEmojiHistoryStore(path).load()).toEqual(['rocket', 'cat'])
    expect(JSON.parse(await readFile(path, 'utf8'))).toEqual(['rocket', 'cat'])
    await expect(readFile(`${path}.tmp`)).rejects.toThrow()

    const blocked = createEmojiHistoryStore(join(path, 'child.json'))
    await expect(blocked.save(['cat'])).rejects.toThrow()
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
