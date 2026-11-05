import { afterEach, expect, it, vi } from 'vitest'
import { validatePngAttachment } from './attachment-validation'
import { onePixelPng } from '../shared/png-test-utils'

afterEach(() => vi.unstubAllGlobals())

it('decodes PNG bytes as a PNG Blob and releases the bitmap', async () => {
  const close = vi.fn()
  const decode = vi.fn<(blob: Blob) => Promise<{ close: () => void }>>(async () => ({ close }))
  vi.stubGlobal('createImageBitmap', decode)

  await validatePngAttachment(onePixelPng)

  expect(decode).toHaveBeenCalledOnce()
  const blob = decode.mock.calls[0]![0]
  expect(blob.type).toBe('image/png')
  expect(new Uint8Array(await blob.arrayBuffer())).toEqual(onePixelPng)
  expect(close).toHaveBeenCalledOnce()
})

it('rejects invalid structure before allocating a bitmap and propagates decode failure', async () => {
  const failure = new Error('decoder rejected the PNG')
  const decode = vi.fn().mockRejectedValue(failure)
  vi.stubGlobal('createImageBitmap', decode)

  await expect(validatePngAttachment(new Uint8Array([1]))).rejects.toThrow('not a valid PNG')
  expect(decode).not.toHaveBeenCalled()
  await expect(validatePngAttachment(onePixelPng)).rejects.toBe(failure)
})
