import { useState, useSyncExternalStore } from 'react'
import { EditorStore } from '../application/editor-store'
import { displayedNodes, nodePath, requireNode } from '../domain/document'
import { OPERATION_ERROR_PREFIX, SAVE_ERROR_PREFIX } from '../domain/product-messages'
import { AttachmentImage, ImagePreview } from './AttachmentPreview'
import { LocationBar } from './LocationBar'
import { NodeInput } from './NodeInput'
import { NodeList } from './NodeList'
import { useNodeInputBindings } from './use-node-input-bindings'

interface AppProps {
  store: EditorStore
}

export function App({ store }: AppProps): React.JSX.Element {
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
  const [previewAttachmentId, setPreviewAttachmentId] = useState<string>()
  const focus = state.status === 'ready' ? state.focus : undefined
  const nodeInputBindings = useNodeInputBindings({
    store,
    selectedNodeId: state.status === 'ready' ? state.location.selectedNodeId : undefined,
    focus,
    onPreviewAttachment: setPreviewAttachmentId,
  })

  if (state.status === 'loading')
    return (
      <main className="app-shell">
        <p>Loading document…</p>
      </main>
    )
  if (state.status === 'error') {
    return (
      <main className="app-shell error-state" role="alert">
        <h1>Tree could not open this document</h1>
        <p>{state.message}</p>
        <p>The existing data was left unchanged.</p>
      </main>
    )
  }

  const currentParent =
    state.location.currentParentId === null
      ? undefined
      : requireNode(state.document, state.location.currentParentId).node
  const nodes = displayedNodes(state.document, state.location.currentParentId)
  const input = (node: (typeof nodes)[number], label: string, parent = false): React.JSX.Element => (
    <NodeInput node={node} label={label} parent={parent} {...nodeInputBindings(node)} />
  )

  const path = state.location.currentParentId === null ? [] : nodePath(state.document, state.location.currentParentId)

  return (
    <main className="tree-app">
      <LocationBar
        path={path}
        currentParentId={state.location.currentParentId}
        onNavigate={(parentId) => store.navigateToAncestor(parentId)}
      />
      <section className="editor-shell">
        {currentParent === undefined ? null : (
          <section className="current-parent" aria-label="Current parent">
            {input(currentParent, 'Current parent', true)}
            {currentParent.attachment === undefined ? null : (
              <AttachmentImage attachmentId={currentParent.attachment.id} onOpen={setPreviewAttachmentId} />
            )}
          </section>
        )}
        <NodeList
          nodes={nodes}
          onEnter={(node) => {
            store.selectNode(node.id, 0)
            store.enter()
          }}
          onMove={(nodeId, insertionIndex) => store.moveNodeTo(nodeId, insertionIndex)}
          renderInput={(node, label) => (
            <>
              {input(node, label)}
              {node.attachment === undefined ? null : (
                <AttachmentImage attachmentId={node.attachment.id} onOpen={setPreviewAttachmentId} />
              )}
            </>
          )}
        />
        {state.saveError === undefined ? null : (
          <p className="save-error" role="status">
            {SAVE_ERROR_PREFIX} {state.saveError}
          </p>
        )}
        {state.operationError === undefined ? null : (
          <p className="save-error" role="alert">
            {OPERATION_ERROR_PREFIX} {state.operationError}
          </p>
        )}
      </section>
      {previewAttachmentId === undefined ? null : (
        <ImagePreview attachmentId={previewAttachmentId} onClose={() => setPreviewAttachmentId(undefined)} />
      )}
    </main>
  )
}
