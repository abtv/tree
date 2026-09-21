import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { EditorStore } from '../application/editor-store'
import { displayedNodes, nodePath, requireNode, type TreeNode } from '../domain/document'
import { OPERATION_ERROR_PREFIX, SAVE_ERROR_PREFIX, SAVE_LOCKED_MESSAGE } from '../domain/product-messages'
import { AttachmentImage, ImagePreview } from './AttachmentPreview'
import { LocationBar } from './LocationBar'
import { NodeInput } from './NodeInput'
import { NodeList } from './NodeList'
import { QuitWithoutSavingPrompt } from './QuitWithoutSavingPrompt'
import { useNodeInputBindings } from './use-node-input-bindings'

interface AppProps {
  store: EditorStore
}

export function App({ store }: AppProps): React.JSX.Element {
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
  const [previewAttachmentId, setPreviewAttachmentId] = useState<string>()
  const [alwaysOnTop, setAlwaysOnTop] = useState(false)
  const [vimMode, setVimMode] = useState<'insert' | 'normal' | 'visual'>('insert')
  useEffect(() => {
    void window.treeApi
      .getAlwaysOnTop()
      .then(setAlwaysOnTop)
      .catch((error: unknown) => store.reportError(error))
  }, [store])
  const focus = state.status === 'ready' ? state.focus : undefined
  const persistenceLocked = state.status === 'ready' && state.persistenceLocked === true
  const toggleAlwaysOnTop = useCallback((): void => {
    const nextValue = !alwaysOnTop
    setAlwaysOnTop(nextValue)
    void window.treeApi.setAlwaysOnTop(nextValue).catch((error: unknown) => {
      setAlwaysOnTop(!nextValue)
      store.reportError(error)
    })
  }, [alwaysOnTop, store])
  const nodeInputBindings = useNodeInputBindings({
    store,
    selectedNodeId: state.status === 'ready' ? state.location.selectedNodeId : undefined,
    focus,
    onPreviewAttachment: setPreviewAttachmentId,
    persistenceLocked,
    vimMode,
    setVimMode,
  })
  const enterNode = useCallback(
    (node: TreeNode): void => {
      store.selectNode(node.id, 0)
      store.enter()
    },
    [store],
  )
  const moveNode = useCallback(
    (nodeId: string, insertionIndex: number): void => {
      store.moveNodeTo(nodeId, insertionIndex)
    },
    [store],
  )
  const dismissQuitWithoutSaving = useCallback((): void => {
    store.dismissQuitWithoutSavingPrompt()
  }, [store])
  const quitWithoutSaving = useCallback((): void => {
    void window.treeApi.quitWithoutSaving()
  }, [])
  const renderInput = useCallback(
    (node: TreeNode, label: string): React.JSX.Element => (
      <>
        <NodeInput node={node} label={label} {...nodeInputBindings(node)} />
        {node.attachment === undefined ? null : (
          <AttachmentImage attachmentId={node.attachment.id} onOpen={setPreviewAttachmentId} />
        )}
      </>
    ),
    [nodeInputBindings],
  )

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
  const topLevel = state.location.currentParentId === null

  return (
    <main className="tree-app">
      <LocationBar
        path={path}
        currentParentId={state.location.currentParentId}
        onNavigate={(parentId) => store.navigateToAncestor(parentId)}
        alwaysOnTop={alwaysOnTop}
        onToggleAlwaysOnTop={toggleAlwaysOnTop}
      />
      <section className={topLevel ? 'editor-shell editor-shell-top-level' : 'editor-shell'}>
        <div className={`vim-mode vim-mode-${vimMode}`} aria-label="Vim mode">
          {vimMode.toUpperCase()}
        </div>
        {currentParent === undefined ? null : (
          <section className="current-parent" aria-label="Current parent">
            {input(currentParent, 'Current parent', true)}
            {currentParent.attachment === undefined ? null : (
              <AttachmentImage attachmentId={currentParent.attachment.id} onOpen={setPreviewAttachmentId} />
            )}
          </section>
        )}
        <NodeList
          focusedNodeId={focus?.nodeId}
          locked={persistenceLocked}
          nodes={nodes}
          onEnter={enterNode}
          onMove={moveNode}
          renderInput={renderInput}
          structuralVersion={state.structuralVersion}
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
        {persistenceLocked ? (
          <p className="save-error persistence-locked" role="alert">
            {SAVE_LOCKED_MESSAGE}
          </p>
        ) : null}
      </section>
      {state.quitWithoutSavingPrompt === true ? (
        <QuitWithoutSavingPrompt onCancel={dismissQuitWithoutSaving} onQuit={quitWithoutSaving} />
      ) : null}
      {previewAttachmentId === undefined ? null : (
        <ImagePreview attachmentId={previewAttachmentId} onClose={() => setPreviewAttachmentId(undefined)} />
      )}
    </main>
  )
}
