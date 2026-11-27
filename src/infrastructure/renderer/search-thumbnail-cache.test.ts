import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { onePixelPng, pngIhdr, pngWith } from '../../shared/png-test-utils'
import { decodeAttachmentImage } from './attachment-image-cache'
import { decodeSearchThumbnail, searchThumbnailCache } from './search-thumbnail-cache'

vi.mock('./attachment-image-cache', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./attachment-image-cache')>()),
  decodeAttachmentImage: vi.fn(),
}))

const original = { url: 'blob:original', width: 800, height: 240, release: vi.fn() }
const screenshot = pngWith([
  ['IHDR', pngIhdr(800, 240)],
  ['IDAT', [1]],
])
const profiled = pngWith([
  ['IHDR', pngIhdr(800, 240)],
  ['iCCP', [1]],
  ['IDAT', [1]],
])
const bitmap = (width: number, height: number) => ({ width, height, close: vi.fn() })
const drawImage = vi.fn()
const createBitmap = vi.fn()
const getContext = vi.fn()
const transfer = vi.fn()

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(decodeAttachmentImage).mockResolvedValue(original)
  vi.stubGlobal('CanvasRenderingContext2D', function Context() {})
  vi.stubGlobal('createImageBitmap', createBitmap)
  getContext.mockReturnValue({ drawImage })
  vi.stubGlobal(
    'OffscreenCanvas',
    class Canvas {
      getContext(contextId: string, options: CanvasRenderingContext2DSettings) {
        return getContext(contextId, options)
      }
      transferToImageBitmap() {
        return transfer()
      }
    },
  )
})

afterEach(() => {
  searchThumbnailCache.clear()
  vi.unstubAllGlobals()
})

describe('Search thumbnail decoding', () => {
  it.each([
    [800, 240, 240, 72],
    [800, 96, 240, 29],
    [540, 880, 59, 96],
    [1, 800, 1, 96],
  ])('fits a %i × %i PNG in the thumbnail pixel bounds', async (width, height, expectedWidth, expectedHeight) => {
    const bytes = pngWith([
      ['IHDR', pngIhdr(width, height)],
      ['IDAT', [1]],
    ])
    const reduced = bitmap(expectedWidth, expectedHeight)
    createBitmap.mockResolvedValue(reduced)

    const result = await decodeSearchThumbnail(bytes)

    expect(createBitmap).toHaveBeenCalledWith(expect.any(Blob), {
      resizeWidth: expectedWidth,
      resizeHeight: expectedHeight,
      resizeQuality: 'high',
    })
    const source = createBitmap.mock.calls[0]![0] as Blob
    expect(new Uint8Array(await source.arrayBuffer())).toEqual(bytes)
    expect(drawImage).not.toHaveBeenCalled()
    expect(transfer).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      bitmap: reduced,
      width: expectedWidth,
      height: expectedHeight,
      colorSpace: 'srgb',
      encodedByteLength: 0,
    })
    expect(reduced.close).not.toHaveBeenCalled()
    expect(decodeAttachmentImage).not.toHaveBeenCalled()

    result.release()

    expect(reduced.close).toHaveBeenCalledOnce()
  })

  it.each([
    [1, 800, 1, 96],
    [800, 1, 240, 1],
  ])(
    'resizes an unscaled %i × %i bitmap even when one of its dimensions already fits',
    async (width, height, expectedWidth, expectedHeight) => {
      const strip = pngWith([
        ['IHDR', pngIhdr(width, height)],
        ['IDAT', [1]],
      ])
      const fullSize = bitmap(width, height)
      const reduced = bitmap(expectedWidth, expectedHeight)
      const context = { drawImage, imageSmoothingQuality: 'low' }
      getContext.mockReturnValue(context)
      createBitmap.mockResolvedValue(fullSize)
      transfer.mockReturnValue(reduced)

      const result = await decodeSearchThumbnail(strip)

      expect(drawImage).toHaveBeenCalledWith(fullSize, 0, 0, expectedWidth, expectedHeight)
      expect(context.imageSmoothingQuality).toBe('high')
      expect(fullSize.close).toHaveBeenCalledOnce()
      expect(result).toMatchObject({ bitmap: reduced, width: expectedWidth, height: expectedHeight })
      expect(reduced.close).not.toHaveBeenCalled()
    },
  )

  it('uses the original path for an image exactly at the thumbnail bounds', async () => {
    const exactSize = pngWith([
      ['IHDR', pngIhdr(240, 96)],
      ['IDAT', [1]],
    ])

    const result = await decodeSearchThumbnail(exactSize)

    expect(result).toBe(original)
    expect(decodeAttachmentImage).toHaveBeenCalledWith(exactSize)
    expect(createBitmap).not.toHaveBeenCalled()
  })

  it('keeps small images and APNG animation on the original image path', async () => {
    const animated = pngWith([
      ['IHDR', pngIhdr(800, 240)],
      ['acTL', [0, 0, 0, 2, 0, 0, 0, 0]],
      ['IDAT', [1]],
    ])

    await expect(decodeSearchThumbnail(onePixelPng)).resolves.toBe(original)
    await expect(decodeSearchThumbnail(animated)).resolves.toBe(original)

    expect(decodeAttachmentImage).toHaveBeenNthCalledWith(1, onePixelPng)
    expect(decodeAttachmentImage).toHaveBeenNthCalledWith(2, animated)
    expect(createBitmap).not.toHaveBeenCalled()
  })

  it('keeps a wide-gamut presentation for a reduced PNG with an embedded profile', async () => {
    const reduced = bitmap(240, 72)
    createBitmap.mockResolvedValue(reduced)

    const result = await decodeSearchThumbnail(profiled)

    expect(result).toMatchObject({ bitmap: reduced, colorSpace: 'display-p3' })
  })

  it('requests and uses a Display P3 canvas if the profile needs a second resize', async () => {
    const fullSize = bitmap(800, 240)
    const reduced = bitmap(240, 72)
    getContext.mockReturnValue({ drawImage, getContextAttributes: () => ({ colorSpace: 'display-p3' }) })
    createBitmap.mockResolvedValue(fullSize)
    transfer.mockReturnValue(reduced)

    const result = await decodeSearchThumbnail(profiled)

    expect(getContext).toHaveBeenCalledWith('2d', { colorSpace: 'display-p3' })
    expect(drawImage).toHaveBeenCalledWith(fullSize, 0, 0, 240, 72)
    expect(result).toMatchObject({ bitmap: reduced, colorSpace: 'display-p3' })
    expect(fullSize.close).toHaveBeenCalledOnce()
    expect(decodeAttachmentImage).not.toHaveBeenCalled()
  })

  it.each(['srgb', undefined])('preserves the original profile when the canvas reports %s', async (colorSpace) => {
    const fullSize = bitmap(800, 240)
    const context =
      colorSpace === undefined ? { drawImage } : { drawImage, getContextAttributes: () => ({ colorSpace }) }
    getContext.mockReturnValue(context)
    createBitmap.mockResolvedValue(fullSize)

    const result = await decodeSearchThumbnail(profiled)

    expect(result).toBe(original)
    expect(decodeAttachmentImage).toHaveBeenCalledExactlyOnceWith(profiled)
    expect(fullSize.close).toHaveBeenCalledOnce()
    expect(drawImage).not.toHaveBeenCalled()
    expect(transfer).not.toHaveBeenCalled()
  })

  it.each(['OffscreenCanvas', 'createImageBitmap', 'CanvasRenderingContext2D'])(
    'uses the original when %s is unavailable',
    async (api) => {
      vi.stubGlobal(api, undefined)

      const result = await decodeSearchThumbnail(screenshot)

      expect(result).toBe(original)
      expect(decodeAttachmentImage).toHaveBeenCalledWith(screenshot)
      expect(createBitmap).not.toHaveBeenCalled()
    },
  )

  it('closes the bitmap and tries the original image when resizing fails', async () => {
    const fullSize = bitmap(800, 240)
    createBitmap.mockResolvedValue(fullSize)
    transfer.mockImplementationOnce(() => {
      throw new Error('Cannot transfer resized image')
    })

    await expect(decodeSearchThumbnail(screenshot)).resolves.toBe(original)

    expect(fullSize.close).toHaveBeenCalledOnce()
    expect(decodeAttachmentImage).toHaveBeenCalledWith(screenshot)
  })

  it('preserves a load error if neither decoder accepts the file', async () => {
    createBitmap.mockRejectedValueOnce(new Error('Cannot resize'))
    vi.mocked(decodeAttachmentImage).mockRejectedValueOnce(new Error('Cannot decode the original'))

    await expect(decodeSearchThumbnail(screenshot)).rejects.toThrow('Cannot decode the original')

    expect(transfer).not.toHaveBeenCalled()
  })
})

describe('Search thumbnail cache', () => {
  it('reuses decoded thumbnails up to 96 MiB and releases the least recently used beyond it', async () => {
    const bytes = pngWith([
      ['IHDR', pngIhdr(800, 320)],
      ['IDAT', [1]],
    ])
    const readAttachment = vi.fn().mockResolvedValue(bytes)
    vi.stubGlobal('window', { treeApi: { readAttachment } })
    createBitmap.mockImplementation(async () => bitmap(240, 96))
    const byteLimit = 96 * 1024 * 1024
    const capacity = Math.floor(byteLimit / (240 * 96 * 4))

    const first = await searchThumbnailCache.get('image-0')
    const second = await searchThumbnailCache.get('image-1')
    for (let i = 2; i < capacity; i += 1) await searchThumbnailCache.get(`image-${i}`)
    const reused = await searchThumbnailCache.get('image-0')

    expect(first).toMatchObject({ bitmap: { width: 240, height: 96 } })
    expect(reused).toBe(first)
    expect(readAttachment).toHaveBeenCalledTimes(capacity)

    await searchThumbnailCache.get('overflow')

    expect(searchThumbnailCache.peek('image-0')).toBe(first)
    expect(searchThumbnailCache.peek('image-1')).toBeUndefined()
    if (second === null || !('bitmap' in second)) throw new Error('Expected a reduced thumbnail')
    expect(second.bitmap.close).toHaveBeenCalledOnce()
  })
})
