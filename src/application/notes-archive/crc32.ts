const TABLE = (() => {
  const table = new Uint32Array(256)
  for (let index = 0; index < 256; index += 1) {
    let value = index
    for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
    table[index] = value
  }
  return table
})()

/** The CRC-32 that ZIP entries record. */
export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (let index = 0; index < bytes.byteLength; index += 1) crc = TABLE[(crc ^ bytes[index]!) & 0xff]! ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}
