import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { EditorStore } from '../application/editor-store'
import { displayedNodes, nodePath, requireNode, type TreeNode } from '../domain/document'
import { COLLAPSED_EXPANSION_STATE, isNodeExpanded } from '../application/expansion-state'
import { OPERATION_ERROR_PREFIX, SAVE_ERROR_PREFIX, SAVE_LOCKED_MESSAGE } from '../domain/product-messages'
import { AttachmentImage, ImagePreview } from './AttachmentPreview'
import type { VimFoldCommand } from './vim-keyboard-types'
import { AlwaysOnTopToggle } from './AlwaysOnTopToggle'
import { VimToggle } from './VimToggle'
import { LocationBar } from './LocationBar'
import { AgendaLocationBar } from './AgendaLocationBar'
import { AgendaView } from './AgendaView'
import { DatePopup } from './DatePopup'
import { agendaDecorations, treeDecorations } from './date-decorations'
import { richTextHtml } from './editor-dom'
import { preventReadOnlyLinkFocus } from './node-input-pointer-handlers'
import { createAgendaKeyDownHandler } from './agenda-row-keyboard'
import { agendaStatusMessage } from './agenda-labels'
import type { CaretMark } from './agenda-row-caret'
import { clearCommandAssembly } from './vim-command-state'
import { breadcrumbDropTargets } from '../application/drop-targets'
import { NodeInput } from './NodeInput'
import { NodeList } from './NodeList'
import type { DropTarget } from '../application/drop-targets'
import { QuitWithoutSavingPrompt } from './QuitWithoutSavingPrompt'
import { useNodeInputBindings } from './use-node-input-bindings'
import { SCROLL_VIEWPORT_CLASS } from './scroll-viewport'
import { useScrollRestoration } from './use-scroll-restoration'
import { useLeftCommandKey } from './use-left-command-key'
import type { VimMode } from './vim-editing'

interface AppProps {
  store: EditorStore
  /** The saved Vim editing preference, read before the first render so no frame shows the wrong mode. */
  initialVimEnabled: boolean
}

export function App({ store, initialVimEnabled }: AppProps): React.JSX.Element {
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
  const [previewAttachmentId, setPreviewAttachmentId] = useState<string>()
  const [breadcrumbTarget, setBreadcrumbTarget] = useState<string | null>()
  const readyDocument = state.status === 'ready' ? state.document : undefined
  const readyParentId = state.status === 'ready' ? state.location.currentParentId : null
  const breadcrumbTargets = useMemo(
    () => (readyDocument === undefined ? undefined : breadcrumbDropTargets(readyDocument, readyParentId)),
    [readyDocument, readyParentId],
  )
  const [imageCaretNodeId, setImageCaretNodeId] = useState<string>()
  const [alwaysOnTop, setAlwaysOnTop] = useState(false)
  const [vimEnabled, setVimEnabled] = useState(initialVimEnabled)
  const [vimMode, setVimMode] = useState<VimMode>(initialVimEnabled ? 'normal' : 'insert')
  const [nodeVisualSelection, setNodeVisualSelection] = useState<{ anchorId: string; focusId: string }>()
  const leftCommandKeyPressed = useLeftCommandKey()
  useEffect(() => {
    void window.treeApi
      .getAlwaysOnTop()
      .then(setAlwaysOnTop)
      .catch((error: unknown) => store.reportError(error))
  }, [store])
  const agenda = state.status === 'ready' ? state.agenda : undefined
  const statusMessage = agendaStatusMessage(agenda)
  const focus =
    state.status === 'ready' &&
    (agenda === undefined || agenda.activeOccurrence?.nodeId === state.location.selectedNodeId)
      ? state.focus
      : undefined
  const selectedNodeId = state.status === 'ready' ? state.location.selectedNodeId : undefined
  const persistenceLocked = state.status === 'ready' && state.persistenceLocked === true
  const isExpanded = useCallback(
    (nodeId: string): boolean =>
      state.status === 'ready' && isNodeExpanded(state.expansion ?? COLLAPSED_EXPANSION_STATE, nodeId),
    [state],
  )
  const isImageCaretActive = useCallback(
    (node: TreeNode): boolean =>
      vimMode === 'normal' &&
      node.attachment !== undefined &&
      selectedNodeId === node.id &&
      (imageCaretNodeId === node.id || node.text.length === 0),
    [imageCaretNodeId, selectedNodeId, vimMode],
  )
  const toggleAlwaysOnTop = useCallback((): void => {
    const nextValue = !alwaysOnTop
    setAlwaysOnTop(nextValue)
    void window.treeApi.setAlwaysOnTop(nextValue).catch((error: unknown) => {
      setAlwaysOnTop(!nextValue)
      store.reportError(error)
    })
  }, [alwaysOnTop, store])
  const applyFoldCommand = useCallback(
    (command: VimFoldCommand, nodeId: string): void => store.applyFold(command, nodeId),
    [store],
  )
  const {
    bindings: nodeInputBindings,
    dragFreeze,
    setVimEditing,
    vimTextCommandState,
    datePopup,
    acceptDate,
  } = useNodeInputBindings({
    store,
    selectedNodeId,
    focus,
    onPreviewAttachment: setPreviewAttachmentId,
    persistenceLocked,
    vimEnabled,
    vimMode,
    setVimMode,
    setImageCaretNodeId,
    nodeVisualSelection,
    setNodeVisualSelection,
    onFoldCommand: applyFoldCommand,
  })
  const toggleVimEnabled = useCallback((): void => {
    const nextValue = !vimEnabled
    setVimEditing(nextValue)
    setVimEnabled(nextValue)
    // The editing mode already changed for this session; a failed write only loses the saved choice.
    void window.treeApi.setVimEnabled(nextValue).catch((error: unknown) => store.reportError(error))
  }, [vimEnabled, setVimEditing, store])
  // `p` and `Esc` of a pending Agenda move are Vim commands, so standard editing cannot keep one.
  useEffect(() => {
    if (!vimEnabled) store.cancelAgendaMove()
  }, [vimEnabled, store])
  // The application menu owns its own check marks and persists the value; the renderer only follows it.
  useEffect(() => {
    const stopAlwaysOnTop = window.treeApi.onAlwaysOnTopChanged?.(setAlwaysOnTop)
    const stopVimEnabled = window.treeApi.onVimEnabledChanged?.((nextValue) => {
      setVimEditing(nextValue)
      setVimEnabled(nextValue)
    })
    return () => {
      stopAlwaysOnTop?.()
      stopVimEnabled?.()
    }
  }, [setVimEditing])
  // Called after the input bindings so the restore aligns the selected row after their initial focus.
  useScrollRestoration(store, state.status === 'ready' && agenda === undefined)
  const enterNode = useCallback(
    (node: TreeNode): void => {
      // The disclosure control's own mousedown handler calls preventDefault to avoid stealing
      // focus while dragging, which also suppresses the browser's default blur on click. Blur the
      // active input explicitly so a pending Insert or Replace session finishes before navigating.
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
      // Whole-node Visual's range is relative to the displayed level, so entering a node ends it.
      if (vimMode === 'visual-node') {
        setNodeVisualSelection(undefined)
        setVimMode('normal')
      }
      store.selectNode(node.id, 0)
      store.enter()
    },
    [store, vimMode, setNodeVisualSelection, setVimMode],
  )
  const activateNode = useCallback(
    (node: TreeNode): void => {
      store.selectNode(node.id, 0)
    },
    [store],
  )
  const moveNode = useCallback(
    (nodeId: string, target: DropTarget): void => {
      const before = store.getSnapshot()
      if (before.status !== 'ready') return
      const sourceParent = requireNode(before.document, nodeId).ancestors.at(-1)?.id ?? null
      const moved = store.moveNodeToParent(nodeId, target.parentId, target.index)
      if (moved && sourceParent !== target.parentId && vimMode === 'visual-node') {
        setNodeVisualSelection(undefined)
        setVimMode('normal')
      }
    },
    [store, vimMode, setNodeVisualSelection, setVimMode],
  )
  const onToggleExpansion = useCallback(
    (node: TreeNode): void => {
      const before = store.getSnapshot()
      const collapsing = before.status === 'ready' && isNodeExpanded(before.expansion, node.id)
      if (!collapsing) {
        store.toggleExpansion(node.id)
        return
      }
      // Only a strict descendant of the collapsing node is hidden by the collapse; the collapsing
      // node's own row stays visible, and an unrelated row's selection, caret, and focus must stay
      // untouched, so every check below runs against the state from before the collapse.
      const isHiddenByCollapse = (nodeId: string): boolean =>
        before.status === 'ready' &&
        requireNode(before.document, nodeId).ancestors.some((ancestor) => ancestor.id === node.id)
      const hidesSelection = before.status === 'ready' && isHiddenByCollapse(before.location.selectedNodeId)
      // Finish a pending edit session before it is hidden, the same way entering or leaving a node
      // does; an unrelated collapse must not blur the currently focused row.
      if (hidesSelection && document.activeElement instanceof HTMLElement) document.activeElement.blur()
      store.toggleExpansion(node.id)
      if (
        nodeVisualSelection !== undefined &&
        (isHiddenByCollapse(nodeVisualSelection.anchorId) || isHiddenByCollapse(nodeVisualSelection.focusId))
      ) {
        setNodeVisualSelection(undefined)
        setVimMode('normal')
      }
    },
    [store, nodeVisualSelection, setNodeVisualSelection, setVimMode],
  )
  const navigateToAncestor = useCallback(
    (parentId: string | null): void => {
      // A breadcrumb click changes the displayed level, so a whole-node Visual range cannot survive.
      if (vimMode === 'visual-node') {
        setNodeVisualSelection(undefined)
        setVimMode('normal')
      }
      store.navigateToAncestor(parentId)
    },
    [store, vimMode, setNodeVisualSelection, setVimMode],
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
          imageCaretActive={isImageCaretActive(node)}
          imageOnly={node.text.length === 0 && node.attachment !== undefined}
          node={node}
          label={label}
          decorations={treeDecorations(node)}
          {...nodeInputBindings(node)}
        />
        {node.attachment === undefined ? null : (
          <AttachmentImage
            attachmentId={node.attachment.id}
            imageCaretActive={isImageCaretActive(node)}
            onOpen={setPreviewAttachmentId}
          />
        )}
      </>
    ),
    [isImageCaretActive, nodeInputBindings],
  )
  const renderAgendaAttachment = useCallback(
    (node: TreeNode, editable: boolean): React.JSX.Element | null =>
      node.attachment === undefined ? null : (
        <AttachmentImage
          attachmentId={node.attachment.id}
          imageCaretActive={editable && isImageCaretActive(node)}
          onOpen={setPreviewAttachmentId}
        />
      ),
    [isImageCaretActive],
  )

  const renderAgendaInput = useCallback(
    (node: TreeNode, day: number): React.JSX.Element => (
      <>
        <NodeInput
          node={node}
          label={`Agenda node ${node.id}`}
          imageOnly={node.text.length === 0 && node.attachment !== undefined}
          imageCaretActive={isImageCaretActive(node)}
          decorations={agendaDecorations(node, day)}
          {...nodeInputBindings(node)}
        />
      </>
    ),
    [isImageCaretActive, nodeInputBindings],
  )
  const renderAgendaText = useCallback(
    (node: TreeNode, day: number, marks: readonly CaretMark[]): React.JSX.Element => (
      <span
        className={`agenda-text${node.struckThrough ? ' agenda-text-struck' : ''}`}
        onClick={nodeInputBindings(node).onClick}
        onMouseDown={preventReadOnlyLinkFocus}
        dangerouslySetInnerHTML={{
          __html: richTextHtml(node, agendaDecorations(node, day), marks),
        }}
      />
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
  const path = state.location.currentParentId === null ? [] : nodePath(state.document, state.location.currentParentId)
  const topLevel = state.location.currentParentId === null

  return (
    <main
      className={`tree-app vim-state-${vimMode}${leftCommandKeyPressed ? ' left-command-down' : ''}`}
      onKeyDown={(event) => {
        const target = event.target
        if (!(target instanceof Element) || target.closest('.node-input, .agenda-list, [role="dialog"]')) return
        if (agenda !== undefined) {
          createAgendaKeyDownHandler({ store, vim: vimEnabled ? vimTextCommandState : undefined })(event)
        } else if (event.metaKey && !event.shiftKey && !event.altKey && event.key.toLowerCase() === 'p') {
          event.preventDefault()
          clearCommandAssembly(vimTextCommandState.commandState)
          if (vimMode === 'visual-node') {
            setNodeVisualSelection(undefined)
            setVimMode('normal')
          }
          store.openAgenda()
        }
      }}
    >
      <div className="title-bar" aria-hidden="true">
        Tree
      </div>
      {agenda !== undefined ? (
        <AgendaLocationBar agenda={agenda} />
      ) : (
        <LocationBar
          path={path}
          currentParentId={state.location.currentParentId}
          onNavigate={navigateToAncestor}
          dropParentId={breadcrumbTarget}
        />
      )}
      <div className={SCROLL_VIEWPORT_CLASS}>
        <section
          className={
            agenda !== undefined
              ? `editor-shell agenda-shell${agenda.focusedDay === undefined ? '' : ' agenda-shell-focused'}`
              : topLevel
                ? 'editor-shell editor-shell-top-level'
                : 'editor-shell'
          }
        >
          {agenda !== undefined ? (
            <AgendaView
              store={store}
              agenda={agenda}
              document={state.document}
              dragFreeze={dragFreeze}
              locked={persistenceLocked}
              vim={vimEnabled ? vimTextCommandState : undefined}
              visualNodeSelection={vimMode === 'visual-node' ? nodeVisualSelection : undefined}
              renderInput={renderAgendaInput}
              renderAttachment={renderAgendaAttachment}
              renderText={renderAgendaText}
            />
          ) : (
            <>
              {currentParent === undefined ? null : (
                <section
                  aria-label="Current parent"
                  className="current-parent"
                  data-has-attachment={currentParent.attachment !== undefined}
                  onClick={(event) => {
                    if (currentParent.text.length !== 0 || currentParent.attachment === undefined) return
                    const target = event.target
                    if (
                      target instanceof Element &&
                      target.closest('.node-input, .attachment-button, a, button') !== null
                    )
                      return
                    activateNode(currentParent)
                  }}
                >
                  <NodeInput
                    imageCaretActive={isImageCaretActive(currentParent)}
                    imageOnly={currentParent.text.length === 0 && currentParent.attachment !== undefined}
                    node={currentParent}
                    label="Current parent"
                    parent
                    decorations={treeDecorations(currentParent)}
                    {...nodeInputBindings(currentParent)}
                  />
                  {currentParent.attachment === undefined ? null : (
                    <AttachmentImage
                      attachmentId={currentParent.attachment.id}
                      imageCaretActive={isImageCaretActive(currentParent)}
                      onOpen={setPreviewAttachmentId}
                    />
                  )}
                </section>
              )}
              <NodeList
                breadcrumbTargets={breadcrumbTargets}
                onBreadcrumbTarget={setBreadcrumbTarget}
                dragFreeze={dragFreeze}
                focusedNodeId={focus?.nodeId}
                isExpanded={isExpanded}
                locked={persistenceLocked}
                nodes={nodes}
                visibleRows={store.getVisibleRows()}
                onActivate={activateNode}
                visualNodeSelection={vimMode === 'visual-node' ? nodeVisualSelection : undefined}
                onEnter={enterNode}
                onDrop={moveNode}
                onToggleExpansion={onToggleExpansion}
                renderInput={renderInput}
                structuralVersion={state.structuralVersion}
              />
            </>
          )}
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
      </div>
      <DatePopup presentation={datePopup} accept={acceptDate} />
      <footer className="status-bar">
        {vimEnabled ? (
          <div className={`vim-mode vim-mode-${vimMode}`} aria-label="Vim mode">
            {vimMode === 'visual-node' ? 'VISUAL NODE' : vimMode.toUpperCase()}
          </div>
        ) : null}
        {statusMessage === undefined ? (
          <span aria-hidden="true" className="status-bar-spacer" />
        ) : (
          <span className="status-bar-message" role="status">
            {statusMessage}
          </span>
        )}
        <VimToggle vimEnabled={vimEnabled} onToggle={toggleVimEnabled} />
        <AlwaysOnTopToggle alwaysOnTop={alwaysOnTop} onToggle={toggleAlwaysOnTop} />
      </footer>
      {state.quitWithoutSavingPrompt === true ? (
        <QuitWithoutSavingPrompt onCancel={dismissQuitWithoutSaving} onQuit={quitWithoutSaving} />
      ) : null}
      {previewAttachmentId === undefined ? null : (
        <ImagePreview attachmentId={previewAttachmentId} onClose={() => setPreviewAttachmentId(undefined)} />
      )}
    </main>
  )
}
