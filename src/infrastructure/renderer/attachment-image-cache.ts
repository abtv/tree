export interface RetainedAttachmentImage {
  width: number
  height: number
  /** Encoded bytes retained instead of the source PNG, if different. */
  encodedByteLength?: number
  /** Releases retained image resources. */
  release(): void
}

export interface DecodedAttachmentImage extends RetainedAttachmentImage {
  url: string
}

export interface AttachmentImageCache<Image extends RetainedAttachmentImage = DecodedAttachmentImage> {
  /** Returns an already decoded image without waiting; it does not change the eviction order. */
  peek(id: string): Image | undefined
  get(id: string): Promise<Image | null>
  /**
   * Drops an entry that failed to display, so the next request reads it again. Returns false if the
   * entry was replaced or evicted: a failure to display the released entry does not show that the
   * attachment itself is unusable.
   */
  discard(id: string, image: Image): boolean
  clear(): void
}

// Encoded bytes plus four bytes per decoded pixel.
function retainedBytes(bytes: Uint8Array, image: RetainedAttachmentImage): number {
  return (image.encodedByteLength ?? bytes.byteLength) + image.width * image.height * 4
}

export function createAttachmentImageCache<Image extends RetainedAttachmentImage>(
  readAttachment: (id: string) => Promise<Uint8Array | null>,
  decodeImage: (bytes: Uint8Array) => Promise<Image>,
  maxBytes: number,
): AttachmentImageCache<Image> {
  const entries = new Map<string, { image: Image; bytes: number }>()
  const pending = new Map<string, Promise<Image | null>>()
  let totalBytes = 0
  let generation = 0

  const remove = (id: string): void => {
    const entry = entries.get(id)
    if (entry === undefined) return
    entries.delete(id)
    totalBytes -= entry.bytes
    entry.image.release()
  }

  const retain = (id: string, image: Image, bytes: number): void => {
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
    discard(id, image) {
      if (entries.get(id)?.image !== image) return false
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
