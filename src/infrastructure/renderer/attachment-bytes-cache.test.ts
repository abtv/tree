import { describe, expect, it, vi } from 'vitest'
import { createAttachmentBytesCache } from './attachment-bytes-cache'

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void; reject: (error: unknown) => void } {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve
    reject = promiseReject
  })
  return { promise, resolve, reject }
}

const bytes = (length: number): Uint8Array => new Uint8Array(length)

describe('attachment bytes cache', () => {
  it('returns bytes once and serves later reads from the cache', async () => {
    const read = vi.fn(async () => bytes(4))
    const cache = createAttachmentBytesCache(read, 64)

    await expect(cache.get('image')).resolves.toEqual(bytes(4))
    await expect(cache.get('image')).resolves.toEqual(bytes(4))

    expect(read).toHaveBeenCalledTimes(1)
    expect(read).toHaveBeenCalledWith('image')
  })

  it('deduplicates concurrent reads for the same id', async () => {
    const pending = deferred<Uint8Array | null>()
    const read = vi.fn(() => pending.promise)
    const cache = createAttachmentBytesCache(read, 64)

    const first = cache.get('image')
    const second = cache.get('image')
    expect(read).toHaveBeenCalledTimes(1)

    pending.resolve(bytes(3))
    await expect(first).resolves.toEqual(bytes(3))
    await expect(second).resolves.toEqual(bytes(3))
    expect(read).toHaveBeenCalledTimes(1)
  })

  it('evicts the least-recently-used entry when the byte budget is exceeded', async () => {
    const read = vi.fn(async () => bytes(3))
    const cache = createAttachmentBytesCache(read, 6)

    await cache.get('a')
    await cache.get('b')
    await cache.get('a')
    await cache.get('c')

    read.mockClear()
    await cache.get('a')
    expect(read).not.toHaveBeenCalled()
    await cache.get('b')
    expect(read).toHaveBeenCalledTimes(1)
  })

  it('retains a single entry larger than the budget', async () => {
    const read = vi.fn(async () => bytes(8))
    const cache = createAttachmentBytesCache(read, 4)

    await expect(cache.get('image')).resolves.toEqual(bytes(8))
    await expect(cache.get('image')).resolves.toEqual(bytes(8))

    expect(read).toHaveBeenCalledTimes(1)
  })

  it('does not cache missing attachments', async () => {
    const read = vi.fn(async () => null)
    const cache = createAttachmentBytesCache(read, 64)

    await expect(cache.get('image')).resolves.toBeNull()
    await expect(cache.get('image')).resolves.toBeNull()

    expect(read).toHaveBeenCalledTimes(2)
  })

  it('does not cache failed reads', async () => {
    const read = vi.fn(async () => {
      throw new Error('read failed')
    })
    const cache = createAttachmentBytesCache(read, 64)

    await expect(cache.get('image')).rejects.toThrow('read failed')
    await expect(cache.get('image')).rejects.toThrow('read failed')

    expect(read).toHaveBeenCalledTimes(2)
  })

  it('drops cached entries on clear', async () => {
    const read = vi.fn(async () => bytes(4))
    const cache = createAttachmentBytesCache(read, 64)

    await cache.get('image')
    cache.clear()
    await cache.get('image')

    expect(read).toHaveBeenCalledTimes(2)
  })

  it('does not retain a read that resolves after clear', async () => {
    const pending = deferred<Uint8Array | null>()
    const read = vi.fn(() => pending.promise)
    const cache = createAttachmentBytesCache(read, 64)

    const first = cache.get('image')
    cache.clear()
    pending.resolve(bytes(4))
    await first

    await cache.get('image')
    expect(read).toHaveBeenCalledTimes(2)
  })
})
