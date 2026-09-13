import { describe, expect, it, vi } from 'vitest'
import { PersistenceCoordinator } from './persistence-coordinator'

const state = {
  document: { roots: [{ id: 'root', text: '', children: [] }] },
  location: { currentParentId: null, selectedNodeId: 'root' },
}

describe('PersistenceCoordinator', () => {
  it('waits for a save queued as the preceding persistence batch finishes', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const save = vi
      .fn(async (): Promise<void> => undefined)
      .mockImplementationOnce(async () => undefined)
      .mockImplementationOnce(async () => gate)
    let requestedAgain = false
    const coordinator = new PersistenceCoordinator(
      { save, cleanupAttachments: async () => undefined },
      {
        currentState: () => state,
        referencedAttachmentIds: () => [],
        onResult: () => {
          if (requestedAgain) return
          requestedAgain = true
          queueMicrotask(() => coordinator.requestSave())
        },
      },
    )
    coordinator.requestSave()
    let flushed = false
    const flush = coordinator.flush().then(() => {
      flushed = true
    })
    try {
      await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(2))
      expect(flushed).toBe(false)
    } finally {
      release()
      await flush
    }
  })

  it('serializes saves and coalesces a cleanup request received during a save', async () => {
    let releaseSave: (() => void) | undefined
    const save = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          releaseSave = resolve
        }),
    )
    const cleanupAttachments = vi.fn(async () => undefined)
    const coordinator = new PersistenceCoordinator(
      { save, cleanupAttachments },
      {
        currentState: () => state,
        referencedAttachmentIds: () => ['attachment'],
        onResult: vi.fn(),
      },
    )

    coordinator.requestSave()
    await vi.waitFor(() => expect(releaseSave).toBeDefined())
    coordinator.requestAttachmentCleanup()
    releaseSave?.()
    await coordinator.flush()

    expect(save).toHaveBeenCalledTimes(1)
    expect(cleanupAttachments).toHaveBeenCalledTimes(2)
    expect(cleanupAttachments).toHaveBeenLastCalledWith(['attachment'])
  })

  it('retains a failed save through cleanup until a document save succeeds', async () => {
    const failure = new Error('disk full')
    const onResult = vi.fn()
    const save = vi.fn(async (): Promise<void> => Promise.reject(failure))
    const coordinator = new PersistenceCoordinator(
      { save, cleanupAttachments: vi.fn(async () => undefined) },
      { currentState: () => state, referencedAttachmentIds: () => [], onResult },
    )

    coordinator.requestSave()
    await expect(coordinator.flush()).rejects.toThrow('disk full')

    coordinator.requestAttachmentCleanup()
    await expect(coordinator.flush()).rejects.toThrow('disk full')
    expect(onResult).toHaveBeenLastCalledWith(failure)
    expect(save).toHaveBeenCalledOnce()

    save.mockResolvedValue(undefined)
    coordinator.requestSave()
    await expect(coordinator.flush()).resolves.toBeUndefined()
    expect(onResult).toHaveBeenLastCalledWith(undefined)
  })

  it('clears a cleanup failure after cleanup succeeds without an unnecessary save', async () => {
    const save = vi.fn(async () => undefined)
    const cleanupAttachments = vi.fn(async () => undefined).mockRejectedValueOnce(new Error('cleanup failed'))
    const onResult = vi.fn()
    const coordinator = new PersistenceCoordinator(
      { save, cleanupAttachments },
      { currentState: () => state, referencedAttachmentIds: () => [], onResult },
    )

    coordinator.requestSave()
    await expect(coordinator.flush()).rejects.toThrow('cleanup failed')
    coordinator.requestAttachmentCleanup()
    await expect(coordinator.flush()).resolves.toBeUndefined()
    expect(save).toHaveBeenCalledOnce()
    expect(onResult).toHaveBeenLastCalledWith(undefined)
  })
})
