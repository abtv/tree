import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { createRecentNodesStore } from './recent-nodes'
import { createFileServices } from './file-services'

it('loads empty history on missing/corrupt data and serializes atomic replacements', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'tree-recent-'))
  try {
    const path = join(directory, 'recent-nodes.json')
    const history = createRecentNodesStore(path)

    expect(await history.load()).toEqual([])
    await writeFile(path, '{invalid')
    expect(await history.load()).toEqual([])
    await Promise.all([history.save(['a', 'a']), history.save(['b', 'a'])])

    expect(await history.load()).toEqual(['b', 'a'])
    expect(JSON.parse(await readFile(path, 'utf8'))).toEqual(['b', 'a'])
    await expect(readFile(`${path}.tmp`)).rejects.toMatchObject({ code: 'ENOENT' })
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

it('queues history with note replacement, resets matching IDs and rejects stale session writes', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'tree-recent-replacement-'))
  try {
    const services = createFileServices(join(directory, 'data'), () => undefined, { userDataDirectory: directory })
    await services.load()
    const state = {
      version: 1 as const,
      document: { roots: [{ id: 'a', text: 'Original', children: [] }] },
      location: { currentParentId: null, selectedNodeId: 'a' },
    }
    await services.save(state)
    await services.saveRecentNodes!(['a'])

    expect(await services.loadRecentNodes!()).toEqual(['a'])

    const staged = await services.createStagingDirectory()
    await writeFile(join(staged, 'document.json'), JSON.stringify(state))
    await services.replaceNotes(staged)

    expect(await services.loadRecentNodes!()).toEqual([])
    await expect(services.saveRecentNodes!(['a'])).rejects.toThrow('notes were replaced')
    expect(await services.loadRecentNodes!()).toEqual([])
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
