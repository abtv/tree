import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'
import { createFileServices } from './file-services'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

async function servicesForTest() {
  const directory = await mkdtemp(join(tmpdir(), 'tree-file-services-'))
  temporaryDirectories.push(directory)
  return { directory, services: createFileServices(directory) }
}

describe('file services', () => {
  it('saves and loads a versioned state without absolute attachment paths', async () => {
    const { directory, services } = await servicesForTest()
    const state = {
      version: 1 as const,
      document: {
        roots: [{ id: 'root', text: '', attachment: { id: 'image', mimeType: 'image/png' as const }, children: [] }],
      },
      location: { currentParentId: null, selectedNodeId: 'root' },
    }

    await services.save(state)

    expect(await services.load()).toEqual(state)
    expect(await readFile(join(directory, 'document.json'), 'utf8')).not.toContain(directory)
  })

  it('keeps referenced attachments and removes unreferenced files', async () => {
    const { services } = await servicesForTest()
    await services.writeAttachment('keep', new Uint8Array([1]))
    await services.writeAttachment('remove', new Uint8Array([2]))

    await services.cleanupAttachments(['keep'])

    expect(await services.readAttachment('keep')).toEqual(new Uint8Array([1]))
    expect(await services.readAttachment('remove')).toBeNull()
  })

  it('returns null when no document has been saved yet', async () => {
    const { services } = await servicesForTest()
    expect(await services.load()).toBeNull()
  })

  it('propagates malformed document data instead of hiding it', async () => {
    const { directory, services } = await servicesForTest()
    await writeFile(join(directory, 'document.json'), '{ not valid json', 'utf8')

    await expect(services.load()).rejects.toThrow()
  })

  it('recovers a durable temporary document after an interrupted replacement', async () => {
    const { directory, services } = await servicesForTest()
    const state = {
      version: 1 as const,
      document: { roots: [{ id: 'recovered', text: 'Recovered', children: [] }] },
      location: { currentParentId: null, selectedNodeId: 'recovered' },
    }
    await writeFile(join(directory, 'document.json.tmp'), JSON.stringify(state), 'utf8')

    expect(await services.load()).toEqual(state)
    expect(await readFile(join(directory, 'document.json'), 'utf8')).toContain('Recovered')
  })

  it('recovers the previous document when the primary file is damaged', async () => {
    const { directory, services } = await servicesForTest()
    const previous = {
      version: 1 as const,
      document: { roots: [{ id: 'previous', text: 'Previous', children: [] }] },
      location: { currentParentId: null, selectedNodeId: 'previous' },
    }
    const current = { ...previous, document: { roots: [{ ...previous.document.roots[0]!, text: 'Current' }] } }

    await services.save(previous)
    await services.save(current)
    await writeFile(join(directory, 'document.json'), '{ damaged', 'utf8')

    expect(await services.load()).toEqual(previous)
  })

  it('serializes concurrent document saves without losing the temporary file', async () => {
    const { services } = await servicesForTest()
    const states = Array.from({ length: 20 }, (_, index) => ({
      version: 1 as const,
      document: { roots: [{ id: `root-${index}`, text: `State ${index}`, children: [] }] },
      location: { currentParentId: null, selectedNodeId: `root-${index}` },
    }))

    await expect(Promise.all(states.map((state) => services.save(state)))).resolves.toHaveLength(states.length)
    await expect(services.load()).resolves.toEqual(expect.objectContaining({ version: 1 }))
  })

  it('reports attachment presence and rejects unsafe attachment IDs', async () => {
    const { services } = await servicesForTest()
    await services.writeAttachment('present', new Uint8Array([1]))

    expect(await services.hasAttachment('present')).toBe(true)
    expect(await services.hasAttachment('missing')).toBe(false)

    await expect(services.writeAttachment('bad/id', new Uint8Array([1]))).rejects.toThrow('Attachment IDs')
    await expect(services.readAttachment('bad/id')).rejects.toThrow('Attachment IDs')
  })
})
