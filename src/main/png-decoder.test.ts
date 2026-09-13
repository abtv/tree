import { describe, expect, it, vi } from 'vitest'
import { createPngDecoder, type NativeImageAdapter } from './png-decoder'
import { onePixelPng } from './png-test-utils'

describe('createPngDecoder', () => {
  it('rejects empty bytes without calling the platform decoder', () => {
    const createFromBuffer = vi.fn()
    const decode = createPngDecoder({ createFromBuffer })

    expect(decode(new Uint8Array())).toBe(false)
    expect(createFromBuffer).not.toHaveBeenCalled()
  })

  it('forwards the bytes and reports whether the decoded image is empty', () => {
    const createFromBuffer = vi.fn((buffer: Buffer) => ({ isEmpty: () => buffer.byteLength === 0 }))
    const decode = createPngDecoder({ createFromBuffer })

    expect(decode(onePixelPng)).toBe(true)
    expect(createFromBuffer).toHaveBeenCalledTimes(1)
    expect(createFromBuffer.mock.calls[0]![0]).toEqual(Buffer.from(onePixelPng))

    const decodeEmpty = createPngDecoder({ createFromBuffer: () => ({ isEmpty: () => true }) })
    expect(decodeEmpty(onePixelPng)).toBe(false)
  })

  it('returns false when the platform decoder throws', () => {
    const nativeImage: NativeImageAdapter = {
      createFromBuffer: () => {
        throw new Error('bad image')
      },
    }

    expect(createPngDecoder(nativeImage)(onePixelPng)).toBe(false)
  })
})
