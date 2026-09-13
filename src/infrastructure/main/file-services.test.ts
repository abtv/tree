import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it, vi } from 'vitest'
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

  it.each([false, true])(
    'rejects a null primary without changing files (with recovery files: %s)',
    async (withRecovery) => {
      const { directory, services } = await servicesForTest()
      const files = new Map([[join(directory, 'document.json'), 'null']])
      if (withRecovery) {
        const state = JSON.stringify({
          version: 1,
          document: { roots: [{ id: 'root', text: 'Preserve me', children: [] }] },
          location: { currentParentId: null, selectedNodeId: 'root' },
        })
        files.set(join(directory, 'document.json.tmp'), state)
        files.set(join(directory, 'document.json.bak'), state)
      }
      for (const [path, bytes] of files) await writeFile(path, bytes)

      await expect(services.load()).rejects.toThrow('The saved document has an unsupported format.')

      for (const [path, bytes] of files) expect(await readFile(path, 'utf8')).toBe(bytes)
    },
  )

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

  it.each([
    null,
    { version: 999 },
    {
      version: 1,
      document: {
        roots: [{ id: 'root', text: '', children: [], attachment: { id: 'missing', mimeType: 'image/png' } }],
      },
      location: { currentParentId: null, selectedNodeId: 'root' },
    },
  ])('leaves every file unchanged when a recovery candidate is invalid: %j', async (candidate) => {
    const { directory, services } = await servicesForTest()
    const primary = '{ damaged'
    const temporary = JSON.stringify(candidate)
    const backup = '{ also damaged'
    await writeFile(join(directory, 'document.json'), primary)
    await writeFile(join(directory, 'document.json.tmp'), temporary)
    await writeFile(join(directory, 'document.json.bak'), backup)

    await expect(services.load()).rejects.toThrow()

    expect(await readFile(join(directory, 'document.json'), 'utf8')).toBe(primary)
    expect(await readFile(join(directory, 'document.json.tmp'), 'utf8')).toBe(temporary)
    expect(await readFile(join(directory, 'document.json.bak'), 'utf8')).toBe(backup)
  })

  it('skips an unsupported temporary document and recovers a valid backup', async () => {
    const { directory, services } = await servicesForTest()
    const backup = {
      version: 1,
      document: { roots: [{ id: 'root', text: 'Recovered', children: [] }] },
      location: { currentParentId: null, selectedNodeId: 'root' },
    }
    await writeFile(join(directory, 'document.json'), '{ damaged')
    await writeFile(join(directory, 'document.json.tmp'), '{"version":999}')
    await writeFile(join(directory, 'document.json.bak'), JSON.stringify(backup))

    await expect(services.load()).resolves.toEqual(backup)
    expect(JSON.parse(await readFile(join(directory, 'document.json'), 'utf8'))).toEqual(backup)
    expect(await readFile(join(directory, 'document.json.tmp'), 'utf8')).toBe('{"version":999}')
  })

  it('does not treat a recovery document with a missing image as an empty first launch', async () => {
    const { directory, services } = await servicesForTest()
    const candidate = {
      version: 1,
      document: {
        roots: [{ id: 'root', text: '', children: [], attachment: { id: 'image', mimeType: 'image/png' } }],
      },
      location: { currentParentId: null, selectedNodeId: 'root' },
    }
    const bytes = JSON.stringify(candidate)
    await writeFile(join(directory, 'document.json.tmp'), bytes)

    await expect(services.load()).rejects.toThrow('Attachment image is missing from local storage.')
    expect(await readFile(join(directory, 'document.json.tmp'), 'utf8')).toBe(bytes)
    await expect(readFile(join(directory, 'document.json'))).rejects.toMatchObject({ code: 'ENOENT' })

    await services.writeAttachment('image', new Uint8Array([1]))
    await expect(services.load()).resolves.toEqual(candidate)
    expect(await readFile(join(directory, 'document.json'), 'utf8')).toBe(bytes)
  })

  it('serializes attachment writes and cleanup so overlapping cleanup cannot report ENOENT', async () => {
    const { services } = await servicesForTest()
    await services.writeAttachment('remove', new Uint8Array([1]))

    await expect(Promise.all([services.cleanupAttachments([]), services.cleanupAttachments([])])).resolves.toEqual([
      undefined,
      undefined,
    ])
  })

  it('logs operation names, paths, and failures', async () => {
    const events: Array<{ operation: string; paths: string[]; phase: string; error?: string }> = []
    const directory = await mkdtemp(join(tmpdir(), 'tree-file-services-'))
    temporaryDirectories.push(directory)
    const services = createFileServices(directory, (event) => events.push(event))

    await services.save({
      version: 1,
      document: { roots: [{ id: 'root', text: '', children: [] }] },
      location: { currentParentId: null, selectedNodeId: 'root' },
    })
    await expect(services.readAttachment('missing')).resolves.toBeNull()
    await expect(services.writeAttachment('bad/id', new Uint8Array())).rejects.toThrow('Attachment IDs')

    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ operation: 'save', phase: 'start', paths: expect.arrayContaining([directory]) }),
        expect.objectContaining({ operation: 'save', phase: 'success' }),
        expect.objectContaining({ operation: 'readAttachment', phase: 'success' }),
        expect.objectContaining({ operation: 'writeAttachment', phase: 'failure', error: expect.any(String) }),
      ]),
    )
  })

  it('keeps successful persistence logs quiet unless debugging is enabled', async () => {
    const { services } = await servicesForTest()
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined)
    const previousDebug = process.env['TREE_PERSISTENCE_DEBUG']
    delete process.env['TREE_PERSISTENCE_DEBUG']

    await services.save({
      version: 1,
      document: { roots: [{ id: 'root', text: '', children: [] }] },
      location: { currentParentId: null, selectedNodeId: 'root' },
    })
    expect(info).not.toHaveBeenCalled()

    process.env['TREE_PERSISTENCE_DEBUG'] = '1'
    await services.cleanupAttachments([])
    expect(info).toHaveBeenCalledWith(expect.stringContaining('[persistence] cleanupAttachments start'))

    if (previousDebug === undefined) delete process.env['TREE_PERSISTENCE_DEBUG']
    else process.env['TREE_PERSISTENCE_DEBUG'] = previousDebug
    info.mockRestore()
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
