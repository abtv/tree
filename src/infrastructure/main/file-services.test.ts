import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createFileServices } from './file-services'

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  return {
    ...actual,
    readFile: vi.fn(actual.readFile),
    stat: vi.fn(actual.stat),
  } as typeof import('node:fs/promises')
})

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

async function servicesForTest() {
  const directory = await mkdtemp(join(tmpdir(), 'tree-file-services-'))
  temporaryDirectories.push(directory)
  return { directory, services: createFileServices(directory) }
}

function stateWithImage(id: string) {
  return {
    version: 2 as const,
    document: {
      roots: [{ id: 'root', text: '', attachment: { id, mimeType: 'image/png' as const }, children: [] }],
    },
    location: { currentParentId: null, selectedNodeId: 'root' },
  }
}

function stateWithoutImage(text = 'Plain') {
  return {
    version: 2 as const,
    document: { roots: [{ id: 'root', text, children: [] }] },
    location: { currentParentId: null, selectedNodeId: 'root' },
  }
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

  it('retains an attachment referenced only by the recovery backup', async () => {
    const { directory, services } = await servicesForTest()
    const bytes = new Uint8Array([9, 9, 9])
    await services.writeAttachment('backup-image', bytes)
    await services.save(stateWithImage('backup-image'))
    await services.save(stateWithoutImage())

    const backup = JSON.parse(await readFile(join(directory, 'document.json.bak'), 'utf8')) as {
      document: { roots: { attachment?: { id: string } }[] }
    }
    expect(backup.document.roots[0]?.attachment?.id).toBe('backup-image')

    await services.cleanupAttachments([])

    expect(await services.readAttachment('backup-image')).toEqual(bytes)
  })

  it('retains an attachment referenced only by the temporary recovery document', async () => {
    const { directory, services } = await servicesForTest()
    const bytes = new Uint8Array([7, 7])
    await services.writeAttachment('temporary-image', bytes)
    await writeFile(join(directory, 'document.json.tmp'), JSON.stringify(stateWithImage('temporary-image')), 'utf8')

    await services.cleanupAttachments([])

    expect(await services.readAttachment('temporary-image')).toEqual(bytes)
  })

  it('retains an attachment referenced by both the caller and a recovery document', async () => {
    const { directory, services } = await servicesForTest()
    const bytes = new Uint8Array([5])
    await services.writeAttachment('shared', bytes)
    await writeFile(join(directory, 'document.json.tmp'), JSON.stringify(stateWithImage('shared')), 'utf8')
    await writeFile(join(directory, 'document.json.bak'), JSON.stringify(stateWithImage('shared')), 'utf8')

    await services.cleanupAttachments(['shared'])

    expect(await services.readAttachment('shared')).toEqual(bytes)
  })

  it('deletes an attachment referenced by neither the caller nor a recovery document', async () => {
    const { services } = await servicesForTest()
    await services.writeAttachment('orphan', new Uint8Array([1]))

    await services.cleanupAttachments([])

    expect(await services.readAttachment('orphan')).toBeNull()
  })

  it('releases an attachment after save rotation removes the backup reference', async () => {
    const { services } = await servicesForTest()
    await services.writeAttachment('rotated', new Uint8Array([3]))
    await services.save(stateWithImage('rotated'))
    await services.save(stateWithoutImage())

    await services.cleanupAttachments([])
    expect(await services.readAttachment('rotated')).not.toBeNull()

    await services.save(stateWithoutImage('Second'))
    await services.cleanupAttachments([])
    expect(await services.readAttachment('rotated')).toBeNull()
  })

  it('ignores absent, malformed, and unsupported recovery documents without rewriting them', async () => {
    const { directory, services } = await servicesForTest()
    await services.writeAttachment('ignored', new Uint8Array([4]))
    const malformed = '{ not valid json'
    const unsupported = '{"version":999}'
    await writeFile(join(directory, 'document.json.tmp'), malformed, 'utf8')
    await writeFile(join(directory, 'document.json.bak'), unsupported, 'utf8')

    await services.cleanupAttachments([])

    expect(await services.readAttachment('ignored')).toBeNull()
    expect(await readFile(join(directory, 'document.json.tmp'), 'utf8')).toBe(malformed)
    expect(await readFile(join(directory, 'document.json.bak'), 'utf8')).toBe(unsupported)
  })

  it('aborts cleanup before deleting anything when a recovery document cannot be read', async () => {
    const { directory, services } = await servicesForTest()
    const bytes = new Uint8Array([6])
    await services.writeAttachment('untouched', bytes)
    await mkdir(join(directory, 'document.json.bak'))

    await expect(services.cleanupAttachments([])).rejects.toThrow()

    expect(await services.readAttachment('untouched')).toEqual(bytes)
  })

  it('reads one JSON recovery candidate per path and never reads attachment contents during cleanup', async () => {
    const { directory, services } = await servicesForTest()
    await services.writeAttachment('backup-image', new Uint8Array([1]))
    const roots = Array.from({ length: 200 }, (_, rootIndex) => ({
      id: `r${rootIndex}`,
      text: `Root ${rootIndex}`,
      children: Array.from({ length: 50 }, (_, childIndex) => ({
        id: `r${rootIndex}c${childIndex}`,
        text: 'Node',
        attachment: {
          id: rootIndex === 0 && childIndex === 0 ? 'backup-image' : `image-${rootIndex}-${childIndex}`,
          mimeType: 'image/png' as const,
        },
        children: [],
      })),
    }))
    await writeFile(
      join(directory, 'document.json.bak'),
      JSON.stringify({
        version: 2,
        document: { roots },
        location: { currentParentId: null, selectedNodeId: 'r0' },
      }),
      'utf8',
    )
    vi.mocked(readFile).mockClear()

    await services.cleanupAttachments([])

    const paths = vi.mocked(readFile).mock.calls.map(([path]) => String(path))
    expect(paths).toEqual([join(directory, 'document.json.tmp'), join(directory, 'document.json.bak')])
    expect(paths.some((path) => path.includes('attachments'))).toBe(false)
    expect(await services.readAttachment('backup-image')).toEqual(new Uint8Array([1]))
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

  it('checks attachment existence using metadata without reading contents', async () => {
    const { services } = await servicesForTest()
    await services.writeAttachment('present', new Uint8Array([1, 2, 3]))

    vi.mocked(stat).mockClear()
    vi.mocked(readFile).mockClear()

    await expect(services.hasAttachment('present')).resolves.toBe(true)
    await expect(services.hasAttachment('missing')).resolves.toBe(false)

    expect(stat).toHaveBeenCalled()
    expect(readFile).not.toHaveBeenCalled()
  })
})
