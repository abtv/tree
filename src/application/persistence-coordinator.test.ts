import { describe, expect, it, vi } from 'vitest'
import { PersistenceCoordinator } from './persistence-coordinator'

const state = {
  document: { roots: [{ id: 'root', text: '', children: [] }] },
  location: { currentParentId: null, selectedNodeId: 'root' },
}

describe('PersistenceCoordinator', () => {
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

  it('surfaces a failed operation and clears it after a later successful cleanup', async () => {
    const failure = new Error('disk full')
    const onResult = vi.fn()
    const coordinator = new PersistenceCoordinator(
      { save: vi.fn(async () => Promise.reject(failure)), cleanupAttachments: vi.fn(async () => undefined) },
      { currentState: () => state, referencedAttachmentIds: () => [], onResult },
    )

    coordinator.requestSave()
    await expect(coordinator.flush()).rejects.toThrow('disk full')

    coordinator.requestAttachmentCleanup()
    await expect(coordinator.flush()).resolves.toBeUndefined()
    expect(onResult).toHaveBeenLastCalledWith(undefined)
  })
})
