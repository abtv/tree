import { EditorStore, type ClipboardValue, type Clock, type EditorServices } from '../../application/editor-store'
import { allIds, createServices, freshIds } from '../../application/test/editor-store-arbitraries'
import { requireNode, serializeState, type Document, type Location } from '../../domain/document'
import type { ClipboardWritePayload } from '../../shared/ipc'
import { extractClipboardLinks } from '../../infrastructure/main/clipboard'

export interface RealStoreOptions {
  document?: Document
  location?: Location
  selectedRowTop?: number
  services?: Partial<EditorServices>
  clock?: Clock
}

/** A real application store with the same in-memory load/save fakes as the command properties. */
export async function createRealStoreHarness(options: RealStoreOptions = {}) {
  const document = options.document ?? { roots: [{ id: 'node', text: 'hello', children: [] }] }
  const location = options.location ?? { currentParentId: null, selectedNodeId: document.roots[0]!.id }
  const clipboard: { current: ClipboardValue; written: ClipboardWritePayload | undefined } = {
    current: { kind: 'text', text: '' },
    written: undefined,
  }
  const attachments = new Map<string, Uint8Array>()
  const usedIds = new Set(allIds(document))
  const nextId = freshIds('generated-')
  const services = createServices(
    serializeState(document, location, {
      expandedIds: new Set(),
      ...(options.selectedRowTop === undefined ? {} : { selectedRowTop: options.selectedRowTop }),
    }),
    () => clipboard.current,
  )
  const store = new EditorStore(
    {
      ...services,
      writeClipboard: async (payload) => {
        clipboard.written = payload
        clipboard.current = {
          kind: 'text',
          text: payload.text,
          links: extractClipboardLinks(payload.html, payload.text),
        }
      },
      writeAttachment: async (id, bytes) => {
        attachments.set(id, bytes.slice())
      },
      cleanupAttachments: async (ids) => {
        for (const id of attachments.keys()) if (!ids.includes(id)) attachments.delete(id)
      },
      ...options.services,
    },
    () => {
      let id = nextId()
      while (usedIds.has(id)) id = nextId()
      usedIds.add(id)
      return id
    },
    options.clock,
  )
  await store.initialize()
  const snapshot = () => {
    const state = store.getSnapshot()
    if (state.status !== 'ready') throw new Error(`Expected ready store, received ${state.status}`)
    return state
  }
  return {
    store,
    clipboard,
    attachments,
    saves: services.saves,
    snapshot,
    node: (id: string = snapshot().location.selectedNodeId) => requireNode(snapshot().document, id).node,
  }
}
