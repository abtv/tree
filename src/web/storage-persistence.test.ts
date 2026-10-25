import { describe, expect, it, vi } from 'vitest'
import { requestPersistentStorage, storageProtectionText } from './storage-persistence'

describe('persistent storage request', () => {
  it('does not ask again when storage is already persistent', async () => {
    const persist = vi.fn(async () => true)

    await expect(requestPersistentStorage({ persisted: async () => true, persist })).resolves.toBe('protected')
    expect(persist).not.toHaveBeenCalled()
  })

  it('asks exactly once and reports the browser decision', async () => {
    const granted = vi.fn(async () => true)

    await expect(requestPersistentStorage({ persisted: async () => false, persist: granted })).resolves.toBe(
      'protected',
    )
    expect(granted).toHaveBeenCalledTimes(1)

    const denied = vi.fn(async () => false)

    await expect(requestPersistentStorage({ persisted: async () => false, persist: denied })).resolves.toBe(
      'unprotected',
    )
    expect(denied).toHaveBeenCalledTimes(1)
  })

  it('treats a missing API as unavailable and a missing request as unprotected', async () => {
    await expect(requestPersistentStorage(undefined)).resolves.toBe('unavailable')
    await expect(requestPersistentStorage({})).resolves.toBe('unavailable')
    await expect(requestPersistentStorage({ persisted: async () => false })).resolves.toBe('unprotected')
  })

  it('absorbs rejected and throwing calls', async () => {
    await expect(
      requestPersistentStorage({
        persisted: async () => {
          throw new Error('blocked')
        },
      }),
    ).resolves.toBe('unavailable')
    await expect(
      requestPersistentStorage({ persisted: async () => false, persist: () => Promise.reject(new Error('denied')) }),
    ).resolves.toBe('unprotected')
    await expect(
      requestPersistentStorage({
        persisted: async () => false,
        persist: () => {
          throw new Error('denied')
        },
      }),
    ).resolves.toBe('unprotected')
  })

  it('shows status text only when the browser reports protection', () => {
    expect(storageProtectionText('protected')).toBe('Storage is protected from automatic clearing.')
    expect(storageProtectionText('unprotected')).toBe('Storage is not protected from automatic clearing.')
    expect(storageProtectionText('unavailable')).toBeUndefined()
  })
})
