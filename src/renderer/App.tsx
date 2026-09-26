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
import { useLeftCommandKey } from './use-left-command-key'
import type { VimMode } from './vim-editing'

interface AppProps {
  store: EditorStore
}

export function App({ store }: AppProps): React.JSX.Element {
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
  const [previewAttachmentId, setPreviewAttachmentId] = useState<string>()
  const [imageCaretNodeId, setImageCaretNodeId] = useState<string>()
  const [alwaysOnTop, setAlwaysOnTop] = useState(false)
  const [vimMode, setVimMode] = useState<VimMode>('normal')
  const [nodeVisualSelection, setNodeVisualSelection] = useState<{ anchorId: string; focusId: string }>()
  const leftCommandKeyPressed = useLeftCommandKey()
  useEffect(() => {
    void window.treeApi
      .getAlwaysOnTop()
      .then(setAlwaysOnTop)
      .catch((error: unknown) => store.reportError(error))
  }, [store])
  const focus = state.status === 'ready' ? state.focus : undefined
  const selectedNodeId = state.status === 'ready' ? state.location.selectedNodeId : undefined
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
    setImageCaretNodeId,
    nodeVisualSelection,
    setNodeVisualSelection,
  })
  const enterNode = useCallback(
    (node: TreeNode): void => {
      store.selectNode(node.id, 0)
      store.enter()
    },
    [store],
  )
  const activateNode = useCallback(
    (node: TreeNode): void => {
      store.selectNode(node.id, 0)
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
        <NodeInput
          imageOnly={node.text.length === 0 && node.attachment !== undefined}
          node={node}
          label={label}
          {...nodeInputBindings(node)}
        />
        {node.attachment === undefined ? null : (
          <AttachmentImage
            attachmentId={node.attachment.id}
            imageCaretActive={
              vimMode === 'normal' &&
              selectedNodeId === node.id &&
              (imageCaretNodeId === node.id || node.text.length === 0)
            }
            onOpen={setPreviewAttachmentId}
          />
        )}
      </>
    ),
    [imageCaretNodeId, nodeInputBindings, selectedNodeId, vimMode],
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
  const path = state.location.currentParentId === null ? [] : nodePath(state.document, state.location.currentParentId)
  const topLevel = state.location.currentParentId === null

  return (
    <main className={`tree-app vim-state-${vimMode}${leftCommandKeyPressed ? ' left-command-down' : ''}`}>
      <LocationBar
        path={path}
        currentParentId={state.location.currentParentId}
        onNavigate={(parentId) => store.navigateToAncestor(parentId)}
        alwaysOnTop={alwaysOnTop}
        onToggleAlwaysOnTop={toggleAlwaysOnTop}
      />
      <section className={topLevel ? 'editor-shell editor-shell-top-level' : 'editor-shell'}>
        <div className={`vim-mode vim-mode-${vimMode}`} aria-label="Vim mode">
          {vimMode === 'visual-node' ? 'VISUAL NODE' : vimMode.toUpperCase()}
        </div>
        {currentParent === undefined ? null : (
          <section
            aria-label="Current parent"
            className="current-parent"
            data-has-attachment={currentParent.attachment !== undefined}
            onClick={(event) => {
              if (currentParent.text.length !== 0 || currentParent.attachment === undefined) return
              const target = event.target
              if (target instanceof Element && target.closest('.node-input, .attachment-button, a, button') !== null)
                return
              activateNode(currentParent)
            }}
          >
            <NodeInput
              imageOnly={currentParent.text.length === 0 && currentParent.attachment !== undefined}
              node={currentParent}
              label="Current parent"
              parent
              {...nodeInputBindings(currentParent)}
            />
            {currentParent.attachment === undefined ? null : (
              <AttachmentImage
                attachmentId={currentParent.attachment.id}
                imageCaretActive={
                  vimMode === 'normal' &&
                  selectedNodeId === currentParent.id &&
                  (imageCaretNodeId === currentParent.id || currentParent.text.length === 0)
                }
                onOpen={setPreviewAttachmentId}
              />
            )}
          </section>
        )}
        <NodeList
          focusedNodeId={focus?.nodeId}
          locked={persistenceLocked}
          nodes={nodes}
          onActivate={activateNode}
          visualNodeSelection={vimMode === 'visual-node' ? nodeVisualSelection : undefined}
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
