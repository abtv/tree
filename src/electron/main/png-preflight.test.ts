import { expect, it, vi } from 'vitest'
import { onePixelPng, pngIhdr, pngWith } from './png-test-utils'
import { validateAttachmentBytes } from '../../shared/png-validation'

it.each([0, 1, 2, 3, 4, 5, 6, 7])('rejects a corrupt PNG signature byte %i before decoding', (index) => {
  const bytes = Uint8Array.from(onePixelPng)
  bytes[index] = bytes[index]! ^ 1
  const decode = vi.fn(() => true)

  expect(() => validateAttachmentBytes(bytes, decode)).toThrow('not a valid PNG')
  expect(decode).not.toHaveBeenCalled()
})

it.each([
  ['zero width', pngIhdr(0, 1)],
  ['zero height', pngIhdr(1, 0)],
  ['invalid depth', pngIhdr(1, 1, 3)],
  ['invalid color type', pngIhdr(1, 1, 8, 1)],
  ['invalid compression', pngIhdr(1, 1).map((value, index) => (index === 10 ? 1 : value))],
  ['invalid filter', pngIhdr(1, 1).map((value, index) => (index === 11 ? 1 : value))],
  ['invalid interlace', pngIhdr(1, 1).map((value, index) => (index === 12 ? 2 : value))],
] as const)('rejects %s before invoking the image decoder', (_name, header) => {
  const bytes = pngWith([
    ['IHDR', [...header]],
    ['IDAT', [1, 2, 3]],
    ['IEND', []],
  ])
  const decode = vi.fn(() => true)

  expect(() => validateAttachmentBytes(bytes, decode)).toThrow('not a valid PNG')
  expect(decode).not.toHaveBeenCalled()
})
