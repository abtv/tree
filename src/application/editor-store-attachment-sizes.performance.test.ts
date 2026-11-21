import { expect, it, vi } from 'vitest'
import { EditorStore, type EditorServices } from './editor-store'
import type { Document, TreeNode } from '../domain/document'

const IMAGES = 1_000
const TEXT_NODES_PER_IMAGE = 20

/** 1,000 image nodes, each followed by 20 text rows, with or without a stored size. */
function documentWithImages(sized: boolean): Document {
  const roots: TreeNode[] = []
  for (let index = 0; index < IMAGES; index += 1) {
    roots.push({
      id: `image-node-${index}`,
      text: `Image ${index}`,
      attachment: { id: `image-${index}`, mimeType: 'image/png', ...(sized ? { width: 640, height: 480 } : {}) },
      children: Array.from({ length: TEXT_NODES_PER_IMAGE }, (_, child) => ({
        id: `text-${index}-${child}`,
        text: `Row ${child} below image ${index}`,
        children: [],
      })),
    })
  }
  return { roots }
}

function servicesFor(document: Document, readAttachmentDimensions?: EditorServices['readAttachmentDimensions']) {
  const save = vi.fn(async () => undefined)
  const services: EditorServices = {
    // A JSON round trip gives the parser the plain objects a file holds.
    load: async () =>
      JSON.parse(
        JSON.stringify({
          version: 6,
          document,
          location: { currentParentId: null, selectedNodeId: 'image-node-0' },
          view: { expandedIds: [] },
        }),
      ) as unknown,
    save,
    readClipboard: async () => ({ kind: 'text', text: '' }),
    writeAttachment: async () => undefined,
    cleanupAttachments: async () => undefined,
    ...(readAttachmentDimensions === undefined ? {} : { readAttachmentDimensions }),
  }
  return { services, save }
}

function lastAttachment(store: EditorStore) {
  const state = store.getSnapshot()
  return state.status === 'ready' ? state.document.roots[IMAGES - 1]!.attachment : undefined
}

// @requirement PRODUCT.md §17
it('loads 1,000 stored image sizes within the budget of a load without them', async () => {
  const measure = async (sized: boolean): Promise<number> => {
    const { services } = servicesFor(documentWithImages(sized))
    const store = new EditorStore(services, () => 'unused')
    const start = performance.now()
    await store.initialize()
    return performance.now() - start
  }
  await measure(true)

  const unsized = await measure(false)
  const sized = await measure(true)

  expect(sized).toBeLessThan(Math.max(unsized * 1.5, unsized + 20))
})

// @requirement PRODUCT.md §17
it('backfills 1,000 images in ten header batches and one publication, without a save', async () => {
  const read = vi.fn<NonNullable<EditorServices['readAttachmentDimensions']>>(async (ids) =>
    ids.map(() => ({ width: 640, height: 480 })),
  )
  const { services, save } = servicesFor(documentWithImages(false), read)
  const store = new EditorStore(services, () => 'unused')
  const publications = vi.fn()
  const start = performance.now()

  await store.initialize()
  const started = performance.now()
  store.subscribe(publications)
  await vi.waitFor(() => expect(lastAttachment(store)).toMatchObject({ width: 640, height: 480 }), { interval: 1 })
  const finished = performance.now()

  // Measured on an M-series Mac: about 43 ms to load and 5 ms to backfill.
  expect(started - start).toBeLessThan(200)
  expect(finished - started).toBeLessThan(50)
  expect(read).toHaveBeenCalledTimes(10)
  expect(publications).toHaveBeenCalledOnce()
  expect(save).not.toHaveBeenCalled()
})
