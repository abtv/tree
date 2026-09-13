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
        hasPendingDocumentChanges: () => false,
        onSaveCaptured: vi.fn(),
        onDocumentSaved: vi.fn(),
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
        hasPendingDocumentChanges: () => false,
        onSaveCaptured: vi.fn(),
        onDocumentSaved: vi.fn(),
        onResult: vi.fn(),
      },
    )

    coordinator.requestSave()
    await vi.waitFor(() => expect(releaseSave).toBeDefined())
    coordinator.requestAttachmentCleanup()
    releaseSave?.()
    await coordinator.flush()

    expect(save).toHaveBeenCalledTimes(1)
    expect(cleanupAttachments).toHaveBeenCalledTimes(1)
    expect(cleanupAttachments).toHaveBeenLastCalledWith(['attachment'])
  })

  it('runs cleanup after the save that persists the new references', async () => {
    const order: string[] = []
    const save = vi.fn(async () => {
      order.push('save')
    })
    const cleanupAttachments = vi.fn(async () => {
      order.push('cleanup')
    })
    const coordinator = new PersistenceCoordinator(
      { save, cleanupAttachments },
      {
        currentState: () => state,
        referencedAttachmentIds: () => [],
        hasPendingDocumentChanges: () => false,
        onSaveCaptured: vi.fn(),
        onDocumentSaved: vi.fn(),
        onResult: vi.fn(),
      },
    )

    coordinator.requestSave()
    coordinator.requestAttachmentCleanup()
    await coordinator.flush()

    expect(order).toEqual(['save', 'cleanup'])
  })

  it('defers cleanup while document changes are pending until a save runs', async () => {
    const save = vi.fn(async () => undefined)
    const cleanupAttachments = vi.fn(async () => undefined)
    let pending = true
    const coordinator = new PersistenceCoordinator(
      { save, cleanupAttachments },
      {
        currentState: () => state,
        referencedAttachmentIds: () => [],
        hasPendingDocumentChanges: () => pending,
        onSaveCaptured: vi.fn(),
        onDocumentSaved: vi.fn(),
        onResult: vi.fn(),
      },
    )

    coordinator.requestAttachmentCleanup()
    await coordinator.flush()
    expect(cleanupAttachments).not.toHaveBeenCalled()

    pending = false
    coordinator.requestSave()
    await coordinator.flush()
    expect(cleanupAttachments).toHaveBeenCalledOnce()
  })

  it('retains a failed save through cleanup until a document save succeeds', async () => {
    const failure = new Error('disk full')
    const onResult = vi.fn()
    const save = vi.fn(async (): Promise<void> => Promise.reject(failure))
    const cleanupAttachments = vi.fn(async () => undefined)
    const coordinator = new PersistenceCoordinator(
      { save, cleanupAttachments },
      {
        currentState: () => state,
        referencedAttachmentIds: () => [],
        hasPendingDocumentChanges: () => false,
        onSaveCaptured: vi.fn(),
        onDocumentSaved: vi.fn(),
        onResult,
      },
    )

    coordinator.requestSave()
    await expect(coordinator.flush()).rejects.toThrow('disk full')
    expect(cleanupAttachments).not.toHaveBeenCalled()

    coordinator.requestAttachmentCleanup()
    await expect(coordinator.flush()).rejects.toThrow('disk full')
    expect(onResult).toHaveBeenLastCalledWith(failure)
    expect(save).toHaveBeenCalledOnce()

    save.mockResolvedValue(undefined)
    coordinator.requestSave()
    await expect(coordinator.flush()).resolves.toBeUndefined()
    expect(onResult).toHaveBeenLastCalledWith(undefined)
  })

  it('retains cleanup after a save failure so it runs after the next successful save', async () => {
    const failure = new Error('disk full')
    const save = vi.fn(async (): Promise<void> => Promise.reject(failure))
    const cleanupAttachments = vi.fn(async () => undefined)
    const coordinator = new PersistenceCoordinator(
      { save, cleanupAttachments },
      {
        currentState: () => state,
        referencedAttachmentIds: () => [],
        hasPendingDocumentChanges: () => false,
        onSaveCaptured: vi.fn(),
        onDocumentSaved: vi.fn(),
        onResult: vi.fn(),
      },
    )

    coordinator.requestSave()
    coordinator.requestAttachmentCleanup()
    await expect(coordinator.flush()).rejects.toThrow('disk full')
    expect(cleanupAttachments).not.toHaveBeenCalled()

    save.mockResolvedValue(undefined)
    coordinator.requestSave()
    await expect(coordinator.flush()).resolves.toBeUndefined()
    expect(cleanupAttachments).toHaveBeenCalledOnce()
  })

  it('does not acknowledge a document save for cleanup-only work', async () => {
    const save = vi.fn(async () => undefined)
    const cleanupAttachments = vi.fn(async () => undefined)
    const onSaveCaptured = vi.fn()
    const onDocumentSaved = vi.fn()
    const coordinator = new PersistenceCoordinator(
      { save, cleanupAttachments },
      {
        currentState: () => state,
        referencedAttachmentIds: () => [],
        hasPendingDocumentChanges: () => false,
        onSaveCaptured,
        onDocumentSaved,
        onResult: vi.fn(),
      },
    )

    coordinator.requestAttachmentCleanup()
    await coordinator.flush()

    expect(cleanupAttachments).toHaveBeenCalledOnce()
    expect(save).not.toHaveBeenCalled()
    expect(onSaveCaptured).not.toHaveBeenCalled()
    expect(onDocumentSaved).not.toHaveBeenCalled()
  })

  it('acknowledges the document save even when the following cleanup fails', async () => {
    const save = vi.fn(async () => undefined)
    const cleanupAttachments = vi.fn(async () => {
      throw new Error('cleanup failed')
    })
    const onSaveCaptured = vi.fn()
    const onDocumentSaved = vi.fn()
    const onResult = vi.fn()
    const coordinator = new PersistenceCoordinator(
      { save, cleanupAttachments },
      {
        currentState: () => state,
        referencedAttachmentIds: () => [],
        hasPendingDocumentChanges: () => false,
        onSaveCaptured,
        onDocumentSaved,
        onResult,
      },
    )

    coordinator.requestSave()
    coordinator.requestAttachmentCleanup()
    await expect(coordinator.flush()).rejects.toThrow('cleanup failed')

    expect(onSaveCaptured).toHaveBeenCalledOnce()
    expect(onDocumentSaved).toHaveBeenCalledOnce()
    expect(onResult).toHaveBeenLastCalledWith(expect.objectContaining({ message: 'cleanup failed' }))
  })

  it('clears a cleanup failure after cleanup succeeds without an unnecessary save', async () => {
    const save = vi.fn(async () => undefined)
    const cleanupAttachments = vi.fn(async () => undefined).mockRejectedValueOnce(new Error('cleanup failed'))
    const onResult = vi.fn()
    const coordinator = new PersistenceCoordinator(
      { save, cleanupAttachments },
      {
        currentState: () => state,
        referencedAttachmentIds: () => [],
        hasPendingDocumentChanges: () => false,
        onSaveCaptured: vi.fn(),
        onDocumentSaved: vi.fn(),
        onResult,
      },
    )

    coordinator.requestAttachmentCleanup()
    await expect(coordinator.flush()).rejects.toThrow('cleanup failed')
    coordinator.requestAttachmentCleanup()
    await expect(coordinator.flush()).resolves.toBeUndefined()
    expect(save).not.toHaveBeenCalled()
    expect(onResult).toHaveBeenLastCalledWith(undefined)
  })
})
