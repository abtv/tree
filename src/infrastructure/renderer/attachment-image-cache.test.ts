import { describe, expect, it, vi } from 'vitest'
import { createAttachmentImageCache, type DecodedAttachmentImage } from './attachment-image-cache'

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

// Decodes every image to a fixed pixel size and records which URLs were released.
function fakeDecoder(
  width = 1,
  height = 1,
): {
  decode: (encoded: Uint8Array) => Promise<DecodedAttachmentImage>
  released: string[]
} {
  const released: string[] = []
  let next = 0
  return {
    released,
    decode: vi.fn(async () => {
      next += 1
      const url = `blob:${next}`
      return { url, width, height, release: () => released.push(url) }
    }),
  }
}

describe('attachment image cache', () => {
  it('reads and decodes once and serves later requests from the cache', async () => {
    const read = vi.fn(async () => bytes(4))
    const decoder = fakeDecoder()
    const cache = createAttachmentImageCache(read, decoder.decode, 64)

    const first = await cache.get('image')
    const second = await cache.get('image')

    expect(second).toBe(first)
    expect(cache.peek('image')).toBe(first)
    expect(read).toHaveBeenCalledTimes(1)
    expect(read).toHaveBeenCalledWith('image')
    expect(decoder.decode).toHaveBeenCalledTimes(1)
  })

  it('has nothing to peek at before an image finishes decoding', async () => {
    const pending = deferred<Uint8Array | null>()
    const cache = createAttachmentImageCache(() => pending.promise, fakeDecoder().decode, 64)

    const request = cache.get('image')
    expect(cache.peek('image')).toBeUndefined()
    pending.resolve(bytes(4))
    await request
    expect(cache.peek('image')).toBeDefined()
  })

  it('deduplicates concurrent requests for the same id', async () => {
    const pending = deferred<Uint8Array | null>()
    const read = vi.fn(() => pending.promise)
    const decoder = fakeDecoder()
    const cache = createAttachmentImageCache(read, decoder.decode, 64)

    const first = cache.get('image')
    const second = cache.get('image')
    pending.resolve(bytes(3))

    expect(await second).toBe(await first)
    expect(read).toHaveBeenCalledTimes(1)
    expect(decoder.decode).toHaveBeenCalledTimes(1)
  })

  it('counts decoded pixels toward the budget and releases evicted images', async () => {
    // Each entry retains 4 encoded bytes plus 2×2 pixels × 4 bytes = 20 bytes.
    const read = vi.fn(async () => bytes(4))
    const decoder = fakeDecoder(2, 2)
    const cache = createAttachmentImageCache(read, decoder.decode, 40)

    const a = await cache.get('a')
    const b = await cache.get('b')
    await cache.get('a')
    await cache.get('c')

    expect(decoder.released).toEqual([b!.url])
    expect(cache.peek('a')).toBe(a)
    expect(cache.peek('b')).toBeUndefined()
    read.mockClear()
    await cache.get('b')
    expect(read).toHaveBeenCalledTimes(1)
  })

  it('stays within its budget however many images are requested', async () => {
    const decoder = fakeDecoder(10, 10)
    const cache = createAttachmentImageCache(async () => bytes(100), decoder.decode, 5_000)

    for (let index = 0; index < 1_000; index += 1) await cache.get(`image-${index}`)

    // 500 bytes per image: the newest ten fit; every other decoded image has been released.
    expect(decoder.released).toHaveLength(990)
    expect(cache.peek('image-989')).toBeUndefined()
    expect(cache.peek('image-990')).toBeDefined()
    expect(cache.peek('image-999')).toBeDefined()
  })

  it('retains a single image larger than the budget', async () => {
    const read = vi.fn(async () => bytes(8))
    const decoder = fakeDecoder(100, 100)
    const cache = createAttachmentImageCache(read, decoder.decode, 4)

    await cache.get('image')
    await cache.get('image')

    expect(read).toHaveBeenCalledTimes(1)
    expect(decoder.released).toEqual([])
  })

  it('does not cache missing attachments', async () => {
    const read = vi.fn(async () => null)
    const decoder = fakeDecoder()
    const cache = createAttachmentImageCache(read, decoder.decode, 64)

    await expect(cache.get('image')).resolves.toBeNull()
    await expect(cache.get('image')).resolves.toBeNull()

    expect(read).toHaveBeenCalledTimes(2)
    expect(decoder.decode).not.toHaveBeenCalled()
  })

  it('does not cache failed reads or failed decodes', async () => {
    const read = vi
      .fn<(id: string) => Promise<Uint8Array | null>>()
      .mockRejectedValueOnce(new Error('read failed'))
      .mockResolvedValue(bytes(4))
    const decode = vi
      .fn<(encoded: Uint8Array) => Promise<DecodedAttachmentImage>>()
      .mockRejectedValueOnce(new Error('decode failed'))
      .mockResolvedValue({ url: 'blob:ok', width: 1, height: 1, release: () => undefined })
    const cache = createAttachmentImageCache(read, decode, 64)

    await expect(cache.get('image')).rejects.toThrow('read failed')
    await expect(cache.get('image')).rejects.toThrow('decode failed')
    await expect(cache.get('image')).resolves.toMatchObject({ url: 'blob:ok' })
    expect(read).toHaveBeenCalledTimes(3)
  })

  it('releases a discarded image and reads it again on the next request', async () => {
    const read = vi.fn(async () => bytes(4))
    const decoder = fakeDecoder()
    const cache = createAttachmentImageCache(read, decoder.decode, 64)

    const image = await cache.get('image')
    expect(cache.discard('image', image!.url)).toBe(true)

    expect(decoder.released).toEqual([image!.url])
    expect(cache.peek('image')).toBeUndefined()
    await cache.get('image')
    expect(read).toHaveBeenCalledTimes(2)
  })

  it('ignores a discard for a URL that is no longer cached', async () => {
    const decoder = fakeDecoder()
    const cache = createAttachmentImageCache(async () => bytes(4), decoder.decode, 64)

    const stale = await cache.get('image')
    cache.discard('image', stale!.url)
    const fresh = await cache.get('image')

    expect(cache.discard('image', stale!.url)).toBe(false)
    expect(cache.peek('image')).toBe(fresh)
    expect(decoder.released).toEqual([stale!.url])
  })

  it('releases every image on clear', async () => {
    const read = vi.fn(async () => bytes(4))
    const decoder = fakeDecoder()
    const cache = createAttachmentImageCache(read, decoder.decode, 64)

    const a = await cache.get('a')
    const b = await cache.get('b')
    cache.clear()
    await cache.get('a')

    expect(decoder.released).toEqual([a!.url, b!.url])
    expect(read).toHaveBeenCalledTimes(3)
  })

  it('does not retain an image that resolves after clear', async () => {
    const pending = deferred<Uint8Array | null>()
    const read = vi.fn(() => pending.promise)
    const cache = createAttachmentImageCache(read, fakeDecoder().decode, 64)

    const first = cache.get('image')
    cache.clear()
    pending.resolve(bytes(4))
    await first

    expect(cache.peek('image')).toBeUndefined()
  })
})
