import { afterEach, describe, expect, it, vi } from 'vitest'
import { startFolderBackup, type BackupState } from './folder-backup'

const head = (text = 'First') => ({
  version: 4,
  document: { roots: [{ id: 'a', text, attachment: { id: 'image', mimeType: 'image/png' }, children: [] }] },
  location: { currentParentId: null, selectedNodeId: 'a' },
  view: { expandedIds: [] },
})

export function setup() {
  vi.useFakeTimers()
  let value: unknown = head()
  const events: string[] = []
  const states: BackupState[] = []
  const source = {
    readHead: vi.fn(async () => value),
    readImage: vi.fn(async (): Promise<unknown> => new Uint8Array([1])),
  }
  const destination = {
    listImages: vi.fn(async () => new Set<string>()),
    writeImage: vi.fn(async (name: string, _bytes: Uint8Array) => {
      void _bytes
      events.push(name)
    }),
    writeDocument: vi.fn(async (text: string) => {
      events.push(text)
    }),
  }
  const backup = startFolderBackup(
    source,
    destination,
    {
      now: () => Date.now(),
      setTimeout: (callback, delay) => {
        if (!Number.isFinite(delay)) throw new Error('A backup deadline must be finite.')
        return setTimeout(callback, delay)
      },
      clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
    },
    (state) => states.push(state),
  )
  return {
    source,
    destination,
    events,
    states,
    backup,
    setHead: (next: unknown) => {
      value = next
    },
  }
}

afterEach(() => vi.useRealTimers())

describe('folder backup', () => {
  it('reports startup activity and stays idle after a successful backup without another save', async () => {
    const run = setup()
    await vi.advanceTimersByTimeAsync(0)
    expect(run.states).toEqual([{ state: 'writing' }, { state: 'saved', missingImages: 0 }])
    await vi.advanceTimersByTimeAsync(60_000)
    expect(run.destination.writeDocument).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('cancels a pending startup or saved-version deadline on stop', async () => {
    const startup = setup()
    expect(vi.getTimerCount()).toBe(1)
    startup.backup.stop()
    expect(vi.getTimerCount()).toBe(0)
    await vi.advanceTimersByTimeAsync(20_000)
    expect(startup.source.readHead).not.toHaveBeenCalled()
    const saved = setup()
    await vi.advanceTimersByTimeAsync(0)
    saved.backup.saved()
    expect(vi.getTimerCount()).toBe(1)
    saved.backup.stop()
    expect(vi.getTimerCount()).toBe(0)
    await vi.advanceTimersByTimeAsync(20_000)
    expect(saved.destination.writeDocument).toHaveBeenCalledTimes(1)
  })

  it.each([false, true])(
    'does not publish completion or retry after stopping during document I/O (failure: %s)',
    async (failure) => {
      const run = setup()
      let finish!: () => void
      run.destination.writeDocument.mockImplementationOnce(
        () =>
          new Promise<void>((resolve, reject) => {
            finish = () => (failure ? reject(new Error('stopped write')) : resolve())
          }),
      )
      await vi.advanceTimersByTimeAsync(0)
      run.backup.stop()
      finish()
      await vi.advanceTimersByTimeAsync(30_000)
      expect(run.states).toEqual([{ state: 'writing' }])
      expect(run.destination.writeDocument).toHaveBeenCalledTimes(1)
      expect(vi.getTimerCount()).toBe(0)
    },
  )

  it('scans once, closes images before the document, and never rewrites known images', async () => {
    const run = setup()
    await vi.advanceTimersByTimeAsync(0)
    expect(run.events).toEqual(['image.png', JSON.stringify(head())])
    run.backup.saved()
    await vi.advanceTimersByTimeAsync(10_000)
    expect(run.destination.listImages).toHaveBeenCalledTimes(1)
    expect(run.destination.writeImage).toHaveBeenCalledTimes(1)
    expect(run.destination.writeDocument).toHaveBeenCalledTimes(2)
    expect(run.states.at(-1)).toEqual({ state: 'saved', missingImages: 0 })
    expect(Object.keys(run.destination).sort()).toEqual(['listImages', 'writeDocument', 'writeImage'])
  })

  it('does not overwrite an image already present in the initial scan', async () => {
    const run = setup()
    run.destination.listImages.mockResolvedValue(new Set(['image.png']))
    await vi.advanceTimersByTimeAsync(0)
    expect(run.source.readImage).not.toHaveBeenCalled()
    expect(run.destination.writeImage).not.toHaveBeenCalled()
  })

  it('refuses a case-colliding image name before replacing files on a case-insensitive filesystem', async () => {
    const run = setup()
    run.destination.listImages.mockResolvedValue(new Set(['IMAGE.png']))
    await vi.advanceTimersByTimeAsync(0)
    expect(run.destination.writeImage).not.toHaveBeenCalled()
    expect(run.destination.writeDocument).not.toHaveBeenCalled()
    expect(run.states.at(-1)).toMatchObject({
      state: 'failed',
      error: expect.objectContaining({ message: expect.stringContaining('differs only in letter case') }),
    })
  })

  it('also refuses collisions between two new images in the same saved document', async () => {
    const run = setup()
    const value = head()
    run.setHead({
      ...value,
      document: {
        roots: [
          ...value.document.roots,
          { id: 'b', text: 'Other image', attachment: { id: 'IMAGE', mimeType: 'image/png' }, children: [] },
        ],
      },
    })
    await vi.advanceTimersByTimeAsync(0)
    expect(run.destination.writeImage).toHaveBeenCalledTimes(1)
    expect(run.destination.writeDocument).not.toHaveBeenCalled()
    expect(run.states.at(-1)?.state).toBe('failed')
  })

  it('keeps a fixed deadline during continuous saves and copies the final version', async () => {
    const run = setup()
    await vi.advanceTimersByTimeAsync(0)
    for (let index = 0; index < 10; index += 1) {
      run.setHead(head(String(index)))
      run.backup.saved()
      await vi.advanceTimersByTimeAsync(999)
    }
    expect(run.destination.writeDocument).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(10)
    expect(run.events.at(-1)).toBe(JSON.stringify(head('9')))
  })

  it('never overlaps runs and retains a save received during I/O', async () => {
    const run = setup()
    let finish!: () => void
    run.destination.writeDocument.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve
        }),
    )
    await vi.advanceTimersByTimeAsync(0)
    run.setHead(head('Latest'))
    run.backup.saved()
    await vi.advanceTimersByTimeAsync(30_000)
    expect(run.source.readHead).toHaveBeenCalledTimes(1)
    finish()
    await vi.advanceTimersByTimeAsync(1)
    expect(run.events.at(-1)).toBe(JSON.stringify(head('Latest')))
    expect(run.destination.writeDocument).toHaveBeenCalledTimes(2)
  })

  it('retries a failed image without writing a document that references it', async () => {
    const run = setup()
    const error = new Error('disk full')
    run.destination.writeImage.mockRejectedValueOnce(error)
    await vi.advanceTimersByTimeAsync(0)
    expect(run.destination.writeDocument).not.toHaveBeenCalled()
    expect(run.states.at(-1)).toEqual({ state: 'failed', error })
    await vi.advanceTimersByTimeAsync(10_000)
    expect(run.destination.writeImage).toHaveBeenCalledTimes(2)
    expect(run.events.at(-1)).toBe(JSON.stringify(head()))
  })

  it.each([undefined, new Uint8Array(0)])(
    'reports absent or empty images, rejects invalid heads and retries failed I/O (%s)',
    async (missing) => {
      const run = setup()
      run.destination.listImages.mockRejectedValueOnce(new Error('scan'))
      await vi.advanceTimersByTimeAsync(0)
      expect(run.destination.writeDocument).not.toHaveBeenCalled()
      run.setHead({ version: 999 })
      await vi.advanceTimersByTimeAsync(10_000)
      expect(run.destination.writeDocument).not.toHaveBeenCalled()
      run.setHead(head())
      run.source.readImage.mockResolvedValue(missing)
      run.destination.writeDocument.mockRejectedValueOnce(new Error('close'))
      await vi.advanceTimersByTimeAsync(10_000)
      expect(run.states.at(-1)?.state).toBe('failed')
      await vi.advanceTimersByTimeAsync(10_000)
      expect(run.states.at(-1)).toEqual({ state: 'saved', missingImages: 1 })
    },
  )

  it.each(['head', 'image'] as const)(
    'does not continue filesystem work after stopping during a %s operation',
    async (operation) => {
      const run = setup()
      let finish!: () => void
      if (operation === 'head') {
        run.source.readHead.mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              finish = () => resolve(head())
            }),
        )
      } else {
        run.destination.writeImage.mockImplementationOnce(
          () =>
            new Promise<void>((resolve) => {
              finish = resolve
            }),
        )
      }
      await vi.advanceTimersByTimeAsync(0)
      run.backup.stop()
      finish()
      await vi.advanceTimersByTimeAsync(30_000)
      expect(run.destination.writeImage).toHaveBeenCalledTimes(operation === 'head' ? 0 : 1)
      expect(run.destination.writeDocument).not.toHaveBeenCalled()
      expect(run.states).toEqual([{ state: 'writing' }])
    },
  )

  it('stops timers and does not write the document when stopped during an image read', async () => {
    const run = setup()
    let finish!: (value: unknown) => void
    run.source.readImage.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    await vi.advanceTimersByTimeAsync(0)
    run.backup.stop()
    finish(new Uint8Array([1]))
    await vi.advanceTimersByTimeAsync(30_000)
    expect(run.destination.writeImage).not.toHaveBeenCalled()
    expect(run.destination.writeDocument).not.toHaveBeenCalled()
    run.backup.saved()
    await vi.advanceTimersByTimeAsync(30_000)
    expect(run.source.readHead).toHaveBeenCalledTimes(1)
  })
})
