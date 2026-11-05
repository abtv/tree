import { inflateSync } from 'node:zlib'

export { onePixelPng, transparentPng, chunk, pngWith, pngIhdr } from '../../shared/png-test-utils'

const signature = [137, 80, 78, 71, 13, 10, 26, 10]

export function decodePngWithZlib(bytes: Uint8Array): boolean {
  if (bytes.length < signature.length || !signature.every((byte, index) => bytes[index] === byte)) return false
  let offset = signature.length
  const compressed: number[] = []
  let width = 0
  let height = 0
  let bitDepth = 0
  let colorType = 0
  while (offset + 12 <= bytes.length) {
    const length = (bytes[offset]! << 24) | (bytes[offset + 1]! << 16) | (bytes[offset + 2]! << 8) | bytes[offset + 3]!
    const type = String.fromCharCode(bytes[offset + 4]!, bytes[offset + 5]!, bytes[offset + 6]!, bytes[offset + 7]!)
    const dataStart = offset + 8
    const dataEnd = dataStart + length
    if (dataEnd + 4 > bytes.length) return false
    if (type === 'IHDR') {
      width =
        (bytes[dataStart]! << 24) | (bytes[dataStart + 1]! << 16) | (bytes[dataStart + 2]! << 8) | bytes[dataStart + 3]!
      height =
        (bytes[dataStart + 4]! << 24) |
        (bytes[dataStart + 5]! << 16) |
        (bytes[dataStart + 6]! << 8) |
        bytes[dataStart + 7]!
      bitDepth = bytes[dataStart + 8]!
      colorType = bytes[dataStart + 9]!
    }
    if (type === 'IDAT') {
      for (let index = dataStart; index < dataEnd; index += 1) compressed.push(bytes[index]!)
    }
    offset = dataEnd + 4
  }
  if (width === 0 || height === 0) return false
  let inflated: Buffer
  try {
    inflated = inflateSync(Buffer.from(compressed))
  } catch {
    return false
  }
  const channels = colorType === 6 ? 4 : colorType === 4 ? 2 : colorType === 2 ? 3 : 1
  const rowBytes = Math.ceil((width * channels * bitDepth) / 8)
  return inflated.length >= height * (rowBytes + 1)
}
