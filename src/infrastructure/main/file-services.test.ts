import { mkdir, mkdtemp, open, readFile, readdir, rename, rm, utimes, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createFileServices } from './file-services'

const mocks = vi.hoisted(() => ({
  readdir: vi.fn<(path: string) => Promise<string[]>>(),
}))

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  mocks.readdir.mockImplementation((path) => actual.readdir(path))
  return {
    ...actual,
    open: vi.fn(actual.open),
    readFile: vi.fn(actual.readFile),
    readdir: mocks.readdir,
    rename: vi.fn(actual.rename),
    stat: vi.fn(actual.stat),
  } as unknown as typeof import('node:fs/promises')
})

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
  mocks.readdir.mockClear()
  vi.mocked(open).mockReset()
  vi.mocked(rename).mockReset()
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

async function ageFile(path: string, seconds: number): Promise<void> {
  const when = new Date(Date.now() - seconds * 1000)
  await utimes(path, when, when)
}

async function generationFiles(directory: string): Promise<string[]> {
  const names = (await readdir(directory)).filter((name) => /^document\.\d+\.json$/.test(name))
  return names.sort((left, right) => Number(left.slice(9, -5)) - Number(right.slice(9, -5)))
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

  it('preserves each replaced document as a numbered generation', async () => {
    const { directory, services } = await servicesForTest()
    const first = stateWithoutImage('First')
    const second = stateWithoutImage('Second')
    await services.save(first)
    await services.save(second)

    expect(JSON.parse(await readFile(join(directory, 'document.1.json'), 'utf8'))).toEqual(first)
    expect(JSON.parse(await readFile(join(directory, 'document.json'), 'utf8'))).toEqual(second)

    const restarted = createFileServices(directory)
    const third = stateWithoutImage('Third')
    await restarted.save(third)
    expect(JSON.parse(await readFile(join(directory, 'document.2.json'), 'utf8'))).toEqual(second)
  })

  it('loads the newest valid generation when the primary and temporary files are damaged', async () => {
    const { directory, services } = await servicesForTest()
    const first = stateWithoutImage('First')
    const second = stateWithoutImage('Second')
    await services.save(first)
    await services.save(second)
    await writeFile(join(directory, 'document.json'), '{ damaged')
    await writeFile(join(directory, 'document.json.tmp'), '{ damaged too')

    await expect(services.load()).resolves.toEqual(first)
    expect(JSON.parse(await readFile(join(directory, 'document.json'), 'utf8'))).toEqual(first)
  })

  it('loads the highest-numbered generation when generation write times tie', async () => {
    const { directory, services } = await servicesForTest()
    const older = stateWithoutImage('Older')
    const newer = stateWithoutImage('Newer')
    await writeFile(join(directory, 'document.1.json'), JSON.stringify(older), 'utf8')
    await writeFile(join(directory, 'document.2.json'), JSON.stringify(newer), 'utf8')
    const when = new Date(Date.now() - 1_000)
    await utimes(join(directory, 'document.1.json'), when, when)
    await utimes(join(directory, 'document.2.json'), when, when)
    await writeFile(join(directory, 'document.json'), '{ damaged', 'utf8')
    mocks.readdir.mockResolvedValueOnce(['document.1.json', 'document.2.json'])

    await expect(services.load()).resolves.toEqual(newer)
    expect(JSON.parse(await readFile(join(directory, 'document.json'), 'utf8'))).toEqual(newer)
  })

  it('loads a legacy backup as a recovery candidate', async () => {
    const { directory, services } = await servicesForTest()
    const previous = stateWithoutImage('Previous')
    await writeFile(join(directory, 'document.json.bak'), JSON.stringify(previous), 'utf8')
    await writeFile(join(directory, 'document.json'), '{ damaged')

    await expect(services.load()).resolves.toEqual(previous)
    expect(JSON.parse(await readFile(join(directory, 'document.json'), 'utf8'))).toEqual(previous)
  })

  it('loads and promotes a newer interrupted save over an older primary', async () => {
    const { directory, services } = await servicesForTest()
    const committed = stateWithoutImage('Committed')
    const interrupted = stateWithoutImage('Interrupted')
    await writeFile(join(directory, 'document.json'), JSON.stringify(committed), 'utf8')
    await ageFile(join(directory, 'document.json'), 60)
    await writeFile(join(directory, 'document.json.tmp'), JSON.stringify(interrupted), 'utf8')

    await expect(services.load()).resolves.toEqual(interrupted)
    expect(JSON.parse(await readFile(join(directory, 'document.json'), 'utf8'))).toEqual(interrupted)
    await expect(readFile(join(directory, 'document.json.tmp'))).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('recovers a valid generation when the primary is structurally invalid', async () => {
    const { directory, services } = await servicesForTest()
    const recovered = stateWithoutImage('Recovered')
    await writeFile(join(directory, 'document.1.json'), JSON.stringify(recovered), 'utf8')
    await writeFile(
      join(directory, 'document.json'),
      JSON.stringify({
        version: 2,
        document: { roots: 'not an array' },
        location: { currentParentId: null, selectedNodeId: 'root' },
      }),
      'utf8',
    )

    await expect(services.load()).resolves.toEqual(recovered)
    expect(JSON.parse(await readFile(join(directory, 'document.json'), 'utf8'))).toEqual(recovered)
  })

  it('keeps referenced attachments and removes unreferenced files', async () => {
    const { services } = await servicesForTest()
    await services.writeAttachment('keep', new Uint8Array([1]))
    await services.writeAttachment('remove', new Uint8Array([2]))

    await services.cleanupAttachments(['keep'])

    expect(await services.readAttachment('keep')).toEqual(new Uint8Array([1]))
    expect(await services.readAttachment('remove')).toBeNull()
  })

  it('retains an attachment referenced only by a retained generation', async () => {
    const { directory, services } = await servicesForTest()
    const bytes = new Uint8Array([9, 9, 9])
    await services.writeAttachment('generation-image', bytes)
    await services.save(stateWithImage('generation-image'))
    await services.save(stateWithoutImage())

    const generation = JSON.parse(await readFile(join(directory, 'document.1.json'), 'utf8')) as {
      document: { roots: { attachment?: { id: string } }[] }
    }
    expect(generation.document.roots[0]?.attachment?.id).toBe('generation-image')

    await services.cleanupAttachments([])

    expect(await services.readAttachment('generation-image')).toEqual(bytes)
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

  it('releases an attachment after pruning removes the generation that referenced it', async () => {
    const { directory, services } = await servicesForTest()
    await services.writeAttachment('rotated', new Uint8Array([3]))
    for (let index = 1; index <= 22; index += 1) {
      const path = join(directory, `document.${index}.json`)
      await writeFile(path, JSON.stringify(index === 1 ? stateWithImage('rotated') : stateWithoutImage()), 'utf8')
      await ageFile(path, index === 1 ? 60 : index === 2 ? 50 : 0)
    }

    await services.cleanupAttachments([])
    expect(await services.readAttachment('rotated')).not.toBeNull()

    await writeFile(join(directory, 'document.json'), JSON.stringify(stateWithoutImage('Primary')), 'utf8')
    await services.save(stateWithoutImage('Prune trigger'))
    await services.cleanupAttachments([])

    expect(await services.readAttachment('rotated')).toBeNull()
    await expect(readFile(join(directory, 'document.1.json'))).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('keeps the retention cap of young generations during pruning', async () => {
    const { directory, services } = await servicesForTest()
    for (let index = 1; index <= 22; index += 1) {
      const path = join(directory, `document.${index}.json`)
      await writeFile(path, JSON.stringify(stateWithoutImage(`State ${index}`)), 'utf8')
      await ageFile(path, 23 - index)
    }
    await writeFile(join(directory, 'document.json'), JSON.stringify(stateWithoutImage('Primary')), 'utf8')

    await services.save(stateWithoutImage('Final'))

    expect(await generationFiles(directory)).toEqual(
      Array.from({ length: 20 }, (_, index) => `document.${index + 4}.json`),
    )
  })

  it('prunes only generations older than the retained safety generation', async () => {
    const { directory, services } = await servicesForTest()
    for (let index = 1; index <= 26; index += 1) {
      await writeFile(
        join(directory, `document.${index}.json`),
        JSON.stringify(stateWithoutImage(`State ${index}`)),
        'utf8',
      )
    }
    for (let index = 1; index <= 26; index += 1) {
      await ageFile(join(directory, `document.${index}.json`), index <= 5 ? 46 - index : 27 - index)
    }
    await writeFile(join(directory, 'document.json'), JSON.stringify(stateWithoutImage('Primary')), 'utf8')

    await services.save(stateWithoutImage('Final'))

    expect(await generationFiles(directory)).toEqual(
      Array.from({ length: 23 }, (_, index) => `document.${index + 5}.json`),
    )
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

  it.each([null, { version: 999 }])(
    'leaves every file unchanged when a recovery candidate is invalid: %j',
    async (candidate) => {
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
    },
  )

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

  it('opens a recovery document whose referenced attachment is missing', async () => {
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

  it('rejects unsafe attachment IDs on read and write', async () => {
    const { services } = await servicesForTest()
    await services.writeAttachment('present', new Uint8Array([1]))

    await expect(services.writeAttachment('bad/id', new Uint8Array([1]))).rejects.toThrow('Attachment IDs')
    await expect(services.readAttachment('bad/id')).rejects.toThrow('Attachment IDs')
  })
})

describe('attachment durability', () => {
  it('flushes attachment bytes and the attachments directory before reporting success', async () => {
    const { directory, services } = await servicesForTest()
    const real = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
    const events: string[] = []
    const bytes = new Uint8Array([1, 2, 3])
    vi.mocked(open).mockImplementation(async (path, flags) => {
      const handle = await real.open(path, flags)
      return {
        async writeFile(contents: string | Uint8Array) {
          events.push('write')
          if (typeof contents === 'string') await handle.writeFile(contents, 'utf8')
          else await handle.writeFile(contents)
        },
        async sync() {
          events.push(flags === 'r' ? 'sync-directory' : 'sync-file')
          await handle.sync()
        },
        async close() {
          events.push(flags === 'r' ? 'close-directory' : 'close-file')
          await handle.close()
        },
      } as unknown as Awaited<ReturnType<typeof open>>
    })

    await services.writeAttachment('durable', bytes)

    expect(events).toEqual(['write', 'sync-file', 'close-file', 'sync-directory', 'close-directory'])
    expect(new Uint8Array(await readFile(join(directory, 'attachments', 'durable.png')))).toEqual(bytes)
  })

  it('propagates a file flush failure instead of reporting success', async () => {
    const { services } = await servicesForTest()
    vi.mocked(open).mockImplementationOnce(
      async () =>
        ({
          async writeFile() {},
          async sync() {
            throw new Error('attachment flush failed')
          },
          async close() {},
        }) as unknown as Awaited<ReturnType<typeof open>>,
    )

    await expect(services.writeAttachment('unflushed', new Uint8Array([1]))).rejects.toThrow('attachment flush failed')
    expect(open).toHaveBeenCalledTimes(1)
  })

  it('propagates a directory flush failure instead of reporting success', async () => {
    const { services } = await servicesForTest()
    const real = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
    let opens = 0
    vi.mocked(open).mockImplementation(async (path, flags) => {
      opens += 1
      const handle = await real.open(path, flags)
      return {
        async writeFile(contents: string | Uint8Array) {
          if (typeof contents === 'string') await handle.writeFile(contents, 'utf8')
          else await handle.writeFile(contents)
        },
        async sync() {
          if (flags === 'r') throw new Error('directory flush failed')
          await handle.sync()
        },
        async close() {
          await handle.close()
        },
      } as unknown as Awaited<ReturnType<typeof open>>
    })

    await expect(services.writeAttachment('unflushed-entry', new Uint8Array([1]))).rejects.toThrow(
      'directory flush failed',
    )
    expect(opens).toBe(2)
  })
})

describe('save interruption recovery', () => {
  it('keeps the committed document when the temporary write is interrupted after real bytes land', async () => {
    const { directory, services } = await servicesForTest()
    const previous = stateWithoutImage('Previous')
    const next = stateWithoutImage('Next')
    await services.save(previous)

    vi.mocked(open).mockImplementationOnce(async (path) => {
      return {
        async writeFile(contents: string) {
          await writeFile(path, contents.slice(0, 24), 'utf8')
          throw new Error('simulated interruption during temporary write')
        },
        async sync() {},
        async close() {},
      } as unknown as Awaited<ReturnType<typeof open>>
    })

    await expect(services.save(next)).rejects.toThrow('simulated interruption during temporary write')

    const temporary = await readFile(join(directory, 'document.json.tmp'), 'utf8')
    expect(() => JSON.parse(temporary)).toThrow()

    const restarted = createFileServices(directory)
    await expect(restarted.load()).resolves.toEqual(previous)
  })

  it('recovers the newer interrupted save when the generation rotation is interrupted', async () => {
    const { directory, services } = await servicesForTest()
    const previous = stateWithoutImage('Previous')
    const next = stateWithoutImage('Next')
    await services.save(previous)

    vi.mocked(rename).mockImplementationOnce(async () => {
      throw new Error('simulated interruption during generation rotation')
    })

    await expect(services.save(next)).rejects.toThrow('simulated interruption during generation rotation')

    const temporaryPath = join(directory, 'document.json.tmp')
    expect(await readFile(temporaryPath, 'utf8')).toBe(JSON.stringify(next, null, 2))

    const restarted = createFileServices(directory)
    await expect(restarted.load()).resolves.toEqual(next)
    expect(JSON.parse(await readFile(join(directory, 'document.json'), 'utf8'))).toEqual(next)
    await expect(readFile(temporaryPath)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('recovers the next document when the replacement rename is interrupted after the generation is preserved', async () => {
    const { directory, services } = await servicesForTest()
    const previous = stateWithoutImage('Previous')
    const next = stateWithoutImage('Next')
    await services.save(previous)

    const real = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
    let renames = 0
    vi.mocked(rename).mockImplementation(async (from, to) => {
      renames += 1
      if (renames === 2) throw new Error('simulated interruption during replacement rename')
      await real.rename(from, to)
    })

    await expect(services.save(next)).rejects.toThrow('simulated interruption during replacement rename')

    const generation = JSON.parse(await readFile(join(directory, 'document.1.json'), 'utf8'))
    expect(generation).toEqual(previous)
    await expect(readFile(join(directory, 'document.json'))).rejects.toMatchObject({ code: 'ENOENT' })

    const restarted = createFileServices(directory)
    await expect(restarted.load()).resolves.toEqual(next)
    expect(await readFile(join(directory, 'document.json'), 'utf8')).toBe(JSON.stringify(next, null, 2))
  })

  it.each([true, false])(
    'recovers the interrupted replacement after a failed rename (committed document exists: %s)',
    async (withPrimary) => {
      const { directory, services } = await servicesForTest()
      const previous = stateWithoutImage('Previous')
      const next = stateWithoutImage('Next')
      if (withPrimary) await services.save(previous)

      vi.mocked(rename).mockImplementationOnce(async () => {
        throw new Error('simulated interruption during replacement rename')
      })

      await expect(services.save(next)).rejects.toThrow('simulated interruption during replacement rename')

      const restarted = createFileServices(directory)
      await expect(restarted.load()).resolves.toEqual(next)
      expect(JSON.parse(await readFile(join(directory, 'document.json'), 'utf8'))).toEqual(next)
    },
  )

  it('saves normally again after an interrupted generation rotation', async () => {
    const { directory, services } = await servicesForTest()
    const previous = stateWithoutImage('Previous')
    await services.save(previous)
    vi.mocked(rename).mockImplementationOnce(async () => {
      throw new Error('simulated interruption during generation rotation')
    })
    await expect(services.save(stateWithoutImage('Next'))).rejects.toThrow(
      'simulated interruption during generation rotation',
    )

    const final = stateWithoutImage('Final')
    await services.save(final)

    const restarted = createFileServices(directory)
    await expect(restarted.load()).resolves.toEqual(final)
    await expect(readFile(join(directory, 'document.json.tmp'))).rejects.toMatchObject({ code: 'ENOENT' })
  })
})
