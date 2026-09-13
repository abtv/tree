import { inflateSync } from 'node:zlib'

export const onePixelPng = Uint8Array.from([
  137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0, 31, 21, 196, 137,
  0, 0, 0, 13, 73, 68, 65, 84, 120, 156, 99, 248, 207, 192, 240, 31, 0, 5, 0, 1, 255, 137, 153, 61, 29, 0, 0, 0, 0, 73,
  69, 78, 68, 174, 66, 96, 130,
])

export const transparentPng = Uint8Array.from([
  137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 2, 0, 0, 0, 1, 8, 6, 0, 0, 0, 244, 34, 127,
  138, 0, 0, 0, 14, 73, 68, 65, 84, 120, 156, 99, 248, 207, 192, 192, 0, 194, 0, 11, 253, 1, 255, 253, 244, 187, 247, 0,
  0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130,
])

const signature = [137, 80, 78, 71, 13, 10, 26, 10]

const crcTable = (() => {
  const table = new Uint32Array(256)
  for (let index = 0; index < 256; index += 1) {
    let value = index
    for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
    table[index] = value >>> 0
  }
  return table
})()

function crc32(bytes: number[]): number {
  let crc = 0xffffffff
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff]! ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

export function chunk(type: string, data: number[]): number[] {
  const typeBytes = [...Buffer.from(type, 'ascii')]
  const length = [(data.length >>> 24) & 255, (data.length >>> 16) & 255, (data.length >>> 8) & 255, data.length & 255]
  const crc = crc32([...typeBytes, ...data])
  return [...length, ...typeBytes, ...data, (crc >>> 24) & 255, (crc >>> 16) & 255, (crc >>> 8) & 255, crc & 255]
}

export function pngWith(chunks: Array<[string, number[]]>): Uint8Array {
  return Uint8Array.from([...signature, ...chunks.flatMap(([type, data]) => chunk(type, data))])
}

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
