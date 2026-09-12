import type { EditorServices } from '../../application/editor-store'

export function createElectronEditorServices(): EditorServices {
  return {
    load: () => window.treeApi.load(),
    save: (state) => window.treeApi.save(state),
    readClipboard: () => window.treeApi.readClipboard(),
    writeClipboard: (payload) => window.treeApi.writeClipboard?.(payload) ?? Promise.resolve(),
    writeAttachment: (id, png) => window.treeApi.writeAttachment(id, png),
    hasAttachment: (id) => window.treeApi.hasAttachment(id),
    cleanupAttachments: (referencedIds) => window.treeApi.cleanupAttachments(referencedIds),
  }
}

export function readAttachment(id: string): Promise<Uint8Array | null> {
  return window.treeApi.readAttachment(id)
}
