import type { PngDecoder } from './ipc-security'

export interface NativeImageAdapter {
  createFromBuffer(buffer: Buffer): { isEmpty(): boolean }
}

export function createPngDecoder(nativeImage: NativeImageAdapter): PngDecoder {
  return (bytes) => {
    if (bytes.byteLength === 0) return false
    try {
      return !nativeImage.createFromBuffer(Buffer.from(bytes)).isEmpty()
    } catch {
      return false
    }
  }
}
