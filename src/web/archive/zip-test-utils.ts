// Test-only ZIP inspection. Production code never reads archives with fflate (ADR 0022).
import { Unzip, UnzipInflate, UnzipPassThrough, unzipSync } from 'fflate'

export interface CentralEntry {
  readonly name: string
  readonly method: number
  readonly flags: number
  readonly compressedSize: number
  readonly size: number
  readonly localHeaderOffset: number
}

const view = (bytes: Uint8Array) => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)

/** Lists central-directory entries in archive order; assumes a well-formed archive without a comment. */
export function listCentralEntries(bytes: Uint8Array): CentralEntry[] {
  const data = view(bytes)
  const end = bytes.byteLength - 22
  if (data.getUint32(end, true) !== 0x06054b50) throw new Error('Missing end of central directory record')
  const count = data.getUint16(end + 10, true)
  let offset = data.getUint32(end + 16, true)
  const entries: CentralEntry[] = []
  for (let index = 0; index < count; index += 1) {
    if (data.getUint32(offset, true) !== 0x02014b50) throw new Error('Invalid central directory header')
    const nameLength = data.getUint16(offset + 28, true)
    const extraLength = data.getUint16(offset + 30, true)
    const commentLength = data.getUint16(offset + 32, true)
    entries.push({
      flags: data.getUint16(offset + 8, true),
      method: data.getUint16(offset + 10, true),
      compressedSize: data.getUint32(offset + 20, true),
      size: data.getUint32(offset + 24, true),
      localHeaderOffset: data.getUint32(offset + 42, true),
      name: new TextDecoder().decode(bytes.subarray(offset + 46, offset + 46 + nameLength)),
    })
    offset += 46 + nameLength + extraLength + commentLength
  }
  return entries
}

/** Reads every entry through the central directory, as the import reader will. */
export function readArchive(bytes: Uint8Array): Map<string, Uint8Array> {
  return new Map(Object.entries(unzipSync(bytes)))
}

/** Reads every entry through fflate's forward-scanning streaming reader. */
export function readArchiveStreaming(bytes: Uint8Array): Map<string, Uint8Array> {
  const entries = new Map<string, Uint8Array>()
  const unzip = new Unzip((file) => {
    const parts: Uint8Array[] = []
    file.ondata = (error, chunk, final) => {
      if (error) throw error
      parts.push(chunk)
      if (final) {
        const joined = new Uint8Array(parts.reduce((total, part) => total + part.byteLength, 0))
        let offset = 0
        for (const part of parts) {
          joined.set(part, offset)
          offset += part.byteLength
        }
        entries.set(file.name, joined)
      }
    }
    file.start()
  })
  unzip.register(UnzipPassThrough)
  unzip.register(UnzipInflate)
  unzip.push(bytes, true)
  return entries
}

/** Compares large byte arrays faster than a deep equality matcher. */
export function sameBytes(left: Uint8Array | undefined, right: Uint8Array): boolean {
  if (left === undefined || left.byteLength !== right.byteLength) return false
  for (let index = 0; index < right.byteLength; index += 1) if (left[index] !== right[index]) return false
  return true
}

export function concat(chunks: readonly Uint8Array[]): Uint8Array {
  const joined = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.byteLength, 0))
  let offset = 0
  for (const chunk of chunks) {
    joined.set(chunk, offset)
    offset += chunk.byteLength
  }
  return joined
}
