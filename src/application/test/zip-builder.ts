// Test-only ZIP construction for the notes archive reader. It writes exactly the fields it is
// given, so a test can produce any malformed archive without an archive library.
import { crc32 } from '../notes-archive/crc32'
import type { ArchiveFile, CreateInflater } from '../notes-archive/zip-reader'

export interface ZipBuildEntry {
  readonly name: string | Uint8Array
  /** The bytes as they appear in the archive. */
  readonly data: Uint8Array
  readonly method?: number
  readonly flags?: number
  /** The uncompressed size; defaults to the data length. */
  readonly size?: number
  readonly compressedSize?: number
  readonly crc32?: number
  readonly versionNeeded?: number
  readonly diskStart?: number
  readonly centralExtra?: Uint8Array
  readonly comment?: Uint8Array
  readonly localName?: string | Uint8Array
  readonly localMethod?: number
  readonly localFlags?: number
  readonly localExtra?: Uint8Array
  readonly localCrc32?: number
  readonly localSize?: number
  /** Writes the local header at another entry's offset. */
  readonly localHeaderOffset?: number
  /** Appends a 16-byte data descriptor after the data. */
  readonly descriptor?: boolean
}

export interface ZipBuildOptions {
  readonly comment?: Uint8Array
  readonly entryCount?: number
  readonly diskEntryCount?: number
  readonly disk?: number
  readonly directoryDisk?: number
  readonly directoryOffset?: number
  readonly directoryBytes?: number
  /** Bytes between the central directory and the end record. */
  readonly beforeEnd?: Uint8Array
  /** Bytes after the declared comment. */
  readonly trailing?: Uint8Array
  /** The order of the central records, as indexes into the entries; defaults to entry order. */
  readonly centralOrder?: readonly number[]
}

const encode = (name: string | Uint8Array) => (typeof name === 'string' ? new TextEncoder().encode(name) : name)

class Bytes {
  private readonly parts: Uint8Array[] = []
  length = 0
  u16(value: number) {
    this.raw(new Uint8Array([value & 0xff, (value >>> 8) & 0xff]))
  }
  u32(value: number) {
    this.raw(new Uint8Array([value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff]))
  }
  raw(bytes: Uint8Array) {
    this.parts.push(bytes)
    this.length += bytes.byteLength
  }
  join(): Uint8Array {
    const joined = new Uint8Array(this.length)
    let offset = 0
    for (const part of this.parts) {
      joined.set(part, offset)
      offset += part.byteLength
    }
    return joined
  }
}

export function buildZip(entries: readonly ZipBuildEntry[], options: ZipBuildOptions = {}): Uint8Array {
  const out = new Bytes()
  const offsets: number[] = []
  for (const entry of entries) {
    offsets.push(out.length)
    const crc = entry.crc32 ?? crc32(entry.data)
    const localName = encode(entry.localName ?? entry.name)
    const localExtra = entry.localExtra ?? new Uint8Array(0)
    const flags = entry.localFlags ?? entry.flags ?? 0
    const deferred = (flags & 0x0008) !== 0
    out.u32(0x04034b50)
    out.u16(entry.versionNeeded ?? 20)
    out.u16(flags)
    out.u16(entry.localMethod ?? entry.method ?? 0)
    out.u32(0)
    out.u32(deferred ? 0 : (entry.localCrc32 ?? crc))
    out.u32(deferred ? 0 : (entry.compressedSize ?? entry.data.byteLength))
    out.u32(deferred ? 0 : (entry.localSize ?? entry.size ?? entry.data.byteLength))
    out.u16(localName.byteLength)
    out.u16(localExtra.byteLength)
    out.raw(localName)
    out.raw(localExtra)
    out.raw(entry.data)
    if (entry.descriptor) {
      out.u32(0x08074b50)
      out.u32(crc)
      out.u32(entry.data.byteLength)
      out.u32(entry.size ?? entry.data.byteLength)
    }
  }
  const directoryOffset = out.length
  for (const index of options.centralOrder ?? entries.keys()) {
    const entry = entries[index]!
    const name = encode(entry.name)
    const extra = entry.centralExtra ?? new Uint8Array(0)
    const comment = entry.comment ?? new Uint8Array(0)
    out.u32(0x02014b50)
    out.u16(20)
    out.u16(entry.versionNeeded ?? 20)
    out.u16(entry.flags ?? 0)
    out.u16(entry.method ?? 0)
    out.u32(0)
    out.u32(entry.crc32 ?? crc32(entry.data))
    out.u32(entry.compressedSize ?? entry.data.byteLength)
    out.u32(entry.size ?? entry.data.byteLength)
    out.u16(name.byteLength)
    out.u16(extra.byteLength)
    out.u16(comment.byteLength)
    out.u16(entry.diskStart ?? 0)
    out.u16(0)
    out.u32(0)
    out.u32(entry.localHeaderOffset ?? offsets[index]!)
    out.raw(name)
    out.raw(extra)
    out.raw(comment)
  }
  const directoryBytes = out.length - directoryOffset
  if (options.beforeEnd) out.raw(options.beforeEnd)
  const comment = options.comment ?? new Uint8Array(0)
  out.u32(0x06054b50)
  out.u16(options.disk ?? 0)
  out.u16(options.directoryDisk ?? 0)
  out.u16(options.diskEntryCount ?? options.entryCount ?? entries.length)
  out.u16(options.entryCount ?? entries.length)
  out.u32(options.directoryBytes ?? directoryBytes)
  out.u32(options.directoryOffset ?? directoryOffset)
  out.u16(comment.byteLength)
  out.raw(comment)
  if (options.trailing) out.raw(options.trailing)
  return out.join()
}

/** An archive file in memory that fails any read outside the file, as a truncated file would. */
export function memoryFile(bytes: Uint8Array): ArchiveFile & { readonly reads: number } {
  let reads = 0
  return {
    size: bytes.byteLength,
    get reads() {
      return reads
    },
    async read(offset, length) {
      reads += 1
      if (offset < 0 || length < 0 || offset + length > bytes.byteLength) throw new Error('Read outside the file.')
      return bytes.slice(offset, offset + length)
    },
  }
}

/** Treats Deflate data as already inflated, so stored test bytes exercise the Deflate path. */
export const passThroughInflater: CreateInflater = (onData) => ({
  push(chunk) {
    onData(chunk.slice())
  },
})
