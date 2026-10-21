export interface DecodedAttachmentImage {
  url: string
  width: number
  height: number
  /** Revokes the URL and drops the decoded pixels. */
  release(): void
}

export interface AttachmentImageCache {
  /** Returns an already decoded image without waiting; it does not change the eviction order. */
  peek(id: string): DecodedAttachmentImage | undefined
  get(id: string): Promise<DecodedAttachmentImage | null>
  /**
   * Drops the entry for a URL that failed to display, so the next request reads it again. Returns false
   * when the URL is no longer cached: it was evicted or replaced, which revoked it, so the failure does
   * not show that the image itself is unusable.
   */
  discard(id: string, url: string): boolean
  clear(): void
}

// Encoded bytes plus four bytes per decoded pixel.
function retainedBytes(bytes: Uint8Array, image: DecodedAttachmentImage): number {
  return bytes.byteLength + image.width * image.height * 4
}

export function createAttachmentImageCache(
  readAttachment: (id: string) => Promise<Uint8Array | null>,
  decodeImage: (bytes: Uint8Array) => Promise<DecodedAttachmentImage>,
  maxBytes: number,
): AttachmentImageCache {
  const entries = new Map<string, { image: DecodedAttachmentImage; bytes: number }>()
  const pending = new Map<string, Promise<DecodedAttachmentImage | null>>()
  let totalBytes = 0
  let generation = 0

  const remove = (id: string): void => {
    const entry = entries.get(id)
    if (entry === undefined) return
    entries.delete(id)
    totalBytes -= entry.bytes
    entry.image.release()
  }

  const retain = (id: string, image: DecodedAttachmentImage, bytes: number): void => {
    remove(id)
    entries.set(id, { image, bytes })
    totalBytes += bytes
    while (totalBytes > maxBytes && entries.size > 1) remove(entries.keys().next().value!)
  }

  return {
    peek(id) {
      return entries.get(id)?.image
    },
    get(id) {
      const cached = entries.get(id)
      if (cached !== undefined) {
        entries.delete(id)
        entries.set(id, cached)
        return Promise.resolve(cached.image)
      }
      const inFlight = pending.get(id)
      if (inFlight !== undefined) return inFlight

      const requestGeneration = generation
      const request = readAttachment(id)
        .then(async (bytes) => {
          if (bytes === null) return null
          const image = await decodeImage(bytes)
          // An image decoded after `clear` stays with its caller; only tests clear the cache.
          if (requestGeneration === generation) retain(id, image, retainedBytes(bytes, image))
          return image
        })
        .finally(() => {
          if (pending.get(id) === request) pending.delete(id)
        })
      pending.set(id, request)
      return request
    },
    discard(id, url) {
      if (entries.get(id)?.image.url !== url) return false
      remove(id)
      return true
    },
    clear() {
      generation += 1
      for (const id of [...entries.keys()]) remove(id)
      pending.clear()
    },
  }
}

/** Decodes PNG bytes off the main thread and keeps them decoded for every image that shows the URL. */
export async function decodeAttachmentImage(bytes: Uint8Array): Promise<DecodedAttachmentImage> {
  const url = URL.createObjectURL(new Blob([Uint8Array.from(bytes).buffer], { type: 'image/png' }))
  // While this element is referenced, the URL stays in the document's list of available images, so a
  // newly mounted <img> with the same URL is complete in its first render instead of decoding again.
  const image = new Image()
  image.src = url
  try {
    await image.decode()
  } catch (error) {
    URL.revokeObjectURL(url)
    throw error
  }
  return {
    url,
    width: image.naturalWidth,
    height: image.naturalHeight,
    release() {
      image.removeAttribute('src')
      URL.revokeObjectURL(url)
    },
  }
}
