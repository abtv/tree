import { afterEach, expect, it, vi } from 'vitest'
import { validateAttachmentBytes } from './png-validation'
import { onePixelPng } from './png-test-utils'

// Keep the conversion-budget test small; production-size typed-array checks live in png-validation.test.ts.
vi.mock('./attachment-limits', async () => {
  const { onePixelPng } = await import('./png-test-utils')
  return { MAX_ATTACHMENT_BYTES: onePixelPng.byteLength }
})

afterEach(() => vi.restoreAllMocks())

it.each(['array', 'serialized Buffer'] as const)(
  'accepts an exact-limit %s and refuses an oversized one before allocating a byte array',
  (kind) => {
    const wrap = (data: number[]) => (kind === 'array' ? data : { type: 'Buffer', data })
    const decode = vi.fn(() => true)

    expect(validateAttachmentBytes(wrap([...onePixelPng]), decode)).toEqual(onePixelPng)
    expect(decode).toHaveBeenCalledOnce()

    const convert = vi.spyOn(Uint8Array, 'from')

    expect(() => validateAttachmentBytes(wrap([...onePixelPng, 0]), decode)).toThrow('Attachment data is invalid.')
    expect(convert).not.toHaveBeenCalled()
    expect(decode).toHaveBeenCalledOnce()
  },
)
