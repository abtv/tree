export interface AttachmentBytesCache {
  get(id: string): Promise<Uint8Array | null>
  clear(): void
}

export function createAttachmentBytesCache(
  readAttachment: (id: string) => Promise<Uint8Array | null>,
  maxBytes: number,
): AttachmentBytesCache {
  const entries = new Map<string, Uint8Array>()
  const pending = new Map<string, Promise<Uint8Array | null>>()
  let totalBytes = 0
  let generation = 0

  const retain = (id: string, bytes: Uint8Array): void => {
    entries.delete(id)
    entries.set(id, bytes)
    totalBytes += bytes.byteLength
    while (totalBytes > maxBytes && entries.size > 1) {
      const oldestId = entries.keys().next().value!
      const oldest = entries.get(oldestId)!
      entries.delete(oldestId)
      totalBytes -= oldest.byteLength
    }
  }

  return {
    get(id) {
      const cached = entries.get(id)
      if (cached !== undefined) {
        entries.delete(id)
        entries.set(id, cached)
        return Promise.resolve(cached)
      }
      const inFlight = pending.get(id)
      if (inFlight !== undefined) return inFlight

      const requestGeneration = generation
      const request = readAttachment(id).then(
        (bytes) => {
          pending.delete(id)
          if (bytes !== null && requestGeneration === generation) retain(id, bytes)
          return bytes
        },
        (error: unknown) => {
          pending.delete(id)
          throw error
        },
      )
      pending.set(id, request)
      return request
    },
    clear() {
      generation += 1
      entries.clear()
      pending.clear()
      totalBytes = 0
    },
  }
}
