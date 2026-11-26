import { activeAgendaOccurrence, focusedAgendaDay } from '../application/agenda-state'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { flushSync } from 'react-dom'
import type { CommandServices } from '../application/command-registry'
import type { TextMatch } from '../domain/text-search'
import { EditorStore } from '../application/editor-store'
import { displayedNodes, locateNode, nodePath, requireNode, type TreeNode } from '../domain/document'
import { COLLAPSED_EXPANSION_STATE, isNodeExpanded } from '../application/expansion-state'
import { OPERATION_ERROR_PREFIX, SAVE_ERROR_PREFIX, SAVE_LOCKED_MESSAGE } from '../domain/product-messages'
import { AttachmentImage, ImagePreview } from './AttachmentPreview'
import type { AttachmentImageCache } from '../infrastructure/renderer/attachment-image-cache'
import { attachmentImageCache } from '../infrastructure/renderer/electron-services'
import type { VimFoldCommand } from './vim-keyboard-types'
import { AlwaysOnTopToggle } from './AlwaysOnTopToggle'
import { LocationBar } from './LocationBar'
import { AgendaLocationBar } from './AgendaLocationBar'
import { AgendaView } from './AgendaView'
import { AgendaSearchText } from './AgendaSearchText'
import { CompletionPopup } from './CompletionPopup'
import { CommandPanel } from './CommandPanel'
import { GlobalSearchPopup } from './GlobalSearchPopup'
import { useCommandPanel } from './use-command-panel'
import { agendaDecorations, localToday, treeDecorations } from './date-decorations'
import { createAgendaKeyDownHandler } from './agenda-row-keyboard'
import { agendaStatusMessage } from './agenda-labels'
import type { CaretMark } from './agenda-row-caret'
import { cancelVimLeader, clearCommandAssembly, type VimLeaderCommand } from './vim-command-state'
import { useVimLeaderRouting } from './vim-leader-keys'
import { VimHelpView, type VimHelpSearchCommand } from './VimHelpView'
import { prepareVimCommand } from './vim-session-finish'
import { breadcrumbDropTargets } from '../application/drop-targets'
import { NodeInput } from './NodeInput'
import { SearchPrompt } from './SearchPrompt'
import { findPromptComposition } from './editor-composition'
import { createBlankPressFocus } from './blank-press-focus'
import { SearchCount } from './SearchCount'
import { useLocalSearch } from './use-local-search'
import { NodeList } from './NodeList'
import type { DropTarget } from '../application/drop-targets'
import { QuitWithoutSavingPrompt } from './QuitWithoutSavingPrompt'
import { useNodeInputBindings } from './use-node-input-bindings'
import { SCROLL_VIEWPORT_CLASS } from './scroll-viewport'
import { useScrollRestoration } from './use-scroll-restoration'
import { useLeftCommandKey } from './use-left-command-key'
import type { VimMode } from './vim-editing'
import type { EditorServices } from '../application/editor-store-types'
import { shortcutProfile, type ShortcutPlatform } from './shortcut-profile'
import type { DesktopDataOperations } from '../application/notes-archive/desktop-data-operations'
import { DesktopDataActivity } from './DataActivityPanel'
import { usePopupNavigation } from './use-popup-navigation'
import { useLineNumbers } from './use-line-numbers'
import { BooleanPreference, type EditingPreferences } from './editing-preferences'
import { UpdateStatus } from './UpdateStatus'
import { useActiveLineHighlight } from './use-active-line-highlight'
import { captureFocusRestoration, getCaret } from './editor-dom'
import { useAgendaRepeat } from './use-agenda-repeat'
import { StatusBar } from './StatusBar'

export type EditorFindCommand = import('../shared/ipc').FindMenuCommand | 'restore-editor'

interface AppProps {
  startupPreferences?: EditingPreferences
  onQuitDialogChange?: () => void
  platformStatus?: React.ReactNode
  dismissTransientStatus?: () => void
  showAbout?: () => void
  registerSearchCommands?: (run: (command: EditorFindCommand) => void) => () => void
  registerViewCommands?: (commands: Pick<CommandServices, 'showAgenda' | 'showTree'>) => () => void
  menuCommands?: import('../application/menu-commands').MenuCommandSource
  store: EditorStore
  /** The saved Vim editing preference, read before the first render so no frame shows the wrong mode. */
  initialVimEnabled?: boolean
  initialLineNumbers?: boolean
  /** Platforms that do not offer Vim also omit its command-panel entry. */
  vimAvailable?: boolean
  /** Whether the host can float its window above other applications. */
  alwaysOnTopAvailable?: boolean
  /** Enable native rich editing only in text-entry modes in the browser adapter. */
  deferRichEditing?: boolean
  capturePasteClipboard?: (data: DataTransfer) => EditorServices['readClipboard']
  /** The platform whose primary-modifier convention shortcuts follow (`docs/ARCHITECTURE.md` §8). */
  shortcutPlatform?: ShortcutPlatform
  /** Decoded attachment images; the browser adapter supplies a smaller memory budget. */
  attachmentImages?: AttachmentImageCache
  dataOperations?: DesktopDataOperations
}

export function App({
  platformStatus,
  dismissTransientStatus,
  showAbout,
  registerSearchCommands,
  store,
  initialVimEnabled = false,
  startupPreferences,
  initialLineNumbers = false,
  vimAvailable = true,
  alwaysOnTopAvailable = true,
  deferRichEditing = false,
  capturePasteClipboard,
  shortcutPlatform = 'apple',
  attachmentImages = attachmentImageCache,
  dataOperations,
  menuCommands,
  registerViewCommands,
  onQuitDialogChange,
}: AppProps): React.JSX.Element {
  const shortcuts = shortcutProfile(shortcutPlatform)
  const { lineNumbers, applyLineNumbers } = useLineNumbers(initialLineNumbers, store)
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
  const agendaToday = state.status === 'ready' ? state.agenda?.today : undefined
  const treeToday = localToday()
  const search = useSyncExternalStore(store.search.subscribe, store.search.session.getSnapshot)
  const searchResult = useSyncExternalStore(store.search.subscribe, store.search.getResult)
  const searchQuery = search.visible ? (search.draft ?? search.confirmed) : ''
  useEffect(() => () => store.disposeSearch(), [store])
  const [previewAttachmentId, setPreviewAttachmentId] = useState<string>()
  const updateBlocked =
    previewAttachmentId !== undefined || (state.status === 'ready' && state.quitWithoutSavingPrompt === true)
  useEffect(() => {
    void window.treeApi.setAppUpdateBlocked?.(updateBlocked).catch((error: unknown) => store.reportError(error))
  }, [store, updateBlocked])
  const [breadcrumbTarget, setBreadcrumbTarget] = useState<string | null>()
  const readyDocument = state.status === 'ready' ? state.document : undefined
  const readyParentId = state.status === 'ready' ? state.location.currentParentId : null
  const breadcrumbTargets = useMemo(
    () => (readyDocument === undefined ? undefined : breadcrumbDropTargets(readyDocument, readyParentId)),
    [readyDocument, readyParentId],
  )
  const [imageCaretNodeId, setImageCaretNodeId] = useState<string>()
  const [preferences] = useState(
    () =>
      startupPreferences ?? {
        vim: new BooleanPreference(initialVimEnabled),
        alwaysOnTop: new BooleanPreference(false),
      },
  )
  const alwaysOnTop = useSyncExternalStore(preferences.alwaysOnTop.subscribe, preferences.alwaysOnTop.getSnapshot)
  const setAlwaysOnTop = preferences.alwaysOnTop.set
  const vimEnabled = useSyncExternalStore(preferences.vim.subscribe, preferences.vim.getSnapshot)
  const appliedVim = useRef(vimEnabled)
  usePopupNavigation(vimEnabled)
  const [vimMode, setVimMode] = useState<VimMode>(vimEnabled ? 'normal' : 'insert')
  const [vimHelpOpen, setVimHelpOpen] = useState(false)
  const [vimHelpStatusTarget, setVimHelpStatusTarget] = useState<HTMLDivElement | null>(null)
  const vimHelpSearchCommands = useRef<((command: VimHelpSearchCommand) => void) | undefined>(undefined)
  const returnFromVimHelp = useRef<(() => void) | undefined>(undefined)
  const closeVimHelp = useCallback((): void => setVimHelpOpen(false), [])
  useLayoutEffect(() => {
    if (vimHelpOpen) return
    const restore = returnFromVimHelp.current
    returnFromVimHelp.current = undefined
    restore?.()
  }, [vimHelpOpen])
  const restoreNotesBeforeViewChange = useCallback((): void => {
    // Agenda captures the live Tree caret. Release the inert notes and restore that caret first.
    if (vimHelpOpen) flushSync(closeVimHelp)
  }, [closeVimHelp, vimHelpOpen])
  const richEditingEnabled = !deferRichEditing || !vimEnabled || vimMode === 'insert' || vimMode === 'replace'
  const [nodeVisualSelection, setNodeVisualSelection] = useState<{ anchorId: string; focusId: string }>()
  const leftCommandKeyPressed = useLeftCommandKey(shortcuts)
  useLayoutEffect(() => {
    if (startupPreferences) return
    const pin = preferences.alwaysOnTop.observe(
      window.treeApi.getAlwaysOnTop,
      window.treeApi.onAlwaysOnTopChanged,
      (error) => store.reportError(error),
    )
    const stopVim = window.treeApi.onVimEnabledChanged?.(preferences.vim.set)
    return () => {
      pin.dispose()
      stopVim?.()
    }
  }, [preferences, startupPreferences, store])
  const agenda = state.status === 'ready' ? state.agenda : undefined
  const statusMessage = agendaStatusMessage(agenda)
  const focus =
    state.status === 'ready' &&
    (agenda === undefined || activeAgendaOccurrence(agenda)?.nodeId === state.location.selectedNodeId)
      ? state.focus
      : undefined
  const selectedNodeId = state.status === 'ready' ? state.location.selectedNodeId : undefined
  const persistenceLocked = state.status === 'ready' && state.persistenceLocked === true
  const isExpanded = useCallback(
    (nodeId: string): boolean =>
      state.status === 'ready' && isNodeExpanded(state.expansion ?? COLLAPSED_EXPANSION_STATE, nodeId),
    [state],
  )
  const selectedImage =
    state.status === 'ready' && vimMode === 'normal'
      ? locateNode(state.document, state.location.selectedNodeId)?.node
      : undefined
  const activeImageId =
    selectedImage?.attachment && (selectedImage.id === imageCaretNodeId || !selectedImage.text)
      ? selectedImage.id
      : undefined
  const isImageCaretActive = useCallback((node: TreeNode): boolean => node.id === activeImageId, [activeImageId])
  const toggleAlwaysOnTop = useCallback((): void => {
    const nextValue = !alwaysOnTop
    setAlwaysOnTop(nextValue)
    void window.treeApi.setAlwaysOnTop(nextValue).catch((error: unknown) => {
      setAlwaysOnTop(!nextValue)
      store.reportError(error)
    })
  }, [alwaysOnTop, setAlwaysOnTop, store])
  const applyFoldCommand = useCallback(
    (command: VimFoldCommand, nodeId: string): void => store.applyFold(command, nodeId),
    [store],
  )
  const {
    bindings: nodeInputBindings,
    dragFreeze,
    setVimEditing,
    isEditorComposing,
    vimTextCommandState,
    completionPopup,
    acceptCompletion,
    restoreSearchFocus,
    readSearchCaret,
  } = useNodeInputBindings({
    store,
    selectedNodeId,
    focus,
    onPreviewAttachment: setPreviewAttachmentId,
    capturePasteClipboard,
    persistenceLocked,
    vimEnabled,
    vimMode,
    setVimMode,
    setImageCaretNodeId,
    nodeVisualSelection,
    setNodeVisualSelection,
    onFoldCommand: applyFoldCommand,
    shortcuts,
  })
  const routeVimLeaderKey = useVimLeaderRouting(vimTextCommandState)
  const applyVimEnabled = useCallback(
    async (nextValue: boolean): Promise<void> => {
      preferences.vim.set(nextValue)
      // The editing mode already changed for this session; a failed write only loses the saved choice.
      await window.treeApi.setVimEnabled(nextValue)
    },
    [preferences],
  )
  const beforeViewChange = useCallback(() => {
    const active = document.activeElement
    prepareVimCommand(
      vimTextCommandState,
      'view-change',
      active instanceof HTMLElement && active.matches('.node-input') ? active : undefined,
    )
  }, [vimTextCommandState])
  const switchAgendaView = (): void => {
    const current = store.getSnapshot()
    if (current.status !== 'ready' || updateBlocked) return
    restoreNotesBeforeViewChange()
    beforeViewChange()
    store.search.interruptNavigation()
    if (current.agenda !== undefined) store.closeAgenda()
    else {
      const active = document.activeElement
      store.openAgenda(active instanceof HTMLElement && active.matches('.node-input') ? getCaret(active) : undefined)
    }
  }
  useAgendaRepeat({ shortcuts, blocked: updateBlocked || vimHelpOpen, switchView: switchAgendaView })
  const searchAction = useRef<(command: EditorFindCommand) => void>(() => undefined)
  const {
    bindInput: bindCommandInput,
    cycleAppearance,
    ...commandPanel
  } = useCommandPanel({
    blocked: vimHelpOpen,
    beforeMenuViewChange: restoreNotesBeforeViewChange,
    showAbout,
    searchCommand: (command) => {
      window.setTimeout(() => searchAction.current(command), 0)
    },
    menuCommands: menuCommands ?? dataOperations?.menuCommands,
    vimAvailable,
    alwaysOnTopAvailable,
    shortcuts,
    store,
    vimEnabled,
    vimMode,
    commandState: vimTextCommandState.commandState,
    isEditorComposing,
    alwaysOnTop,
    setAlwaysOnTop,
    applyVimEnabled,
    lineNumbers,
    applyLineNumbers,
    beforeOpen: () => {
      dataOperations?.dismissTransientStatus()
      dismissTransientStatus?.()
      store.search.interruptNavigation()
      const active = document.activeElement
      // The Find panel unmounts under the command panel, so its focus returns to the editor at the last match
      // first, as Find's own restoration places it, and closing the command panel restores that editor.
      const findFocused = active instanceof Element && active.closest('.local-search-panel') !== null
      const drafting = store.search.session.getSnapshot().draft !== undefined
      if (drafting) store.search.cancelDraft()
      if (drafting || findFocused) restoreSearchFocus()
    },
    beforeViewChange,
  })
  const searchCaret = useRef<(() => number | undefined) | undefined>(undefined)
  const toggleAgendaFold = useRef<(() => void) | null>(null)
  const activeLineRoot = useRef<HTMLElement | null>(null)
  const blankPress = useMemo(() => createBlankPressFocus(), [])
  const refreshActiveLine = useActiveLineHighlight(activeLineRoot)
  const openGlobalSearch = useRef<(() => void) | undefined>(undefined)
  const readAgendaCaret = useCallback(() => {
    const synthetic = searchCaret.current?.()
    if (synthetic !== undefined) return synthetic
    const current = store.getSnapshot()
    // An inactive editor has not consumed this arrival; Find uses the published target.
    return current.status === 'ready' && current.agenda?.activity.kind === 'inactive'
      ? current.focus.cursor
      : readSearchCaret()
  }, [store, readSearchCaret])
  const localSearch = useLocalSearch({
    vimEnabled,
    completionOpen: completionPopup !== undefined,
    store,
    shortcuts,
    blocked: commandPanel.open || previewAttachmentId !== undefined || vimHelpOpen,
    readAgendaCaret,
    readEditorCaret: readSearchCaret,
    restoreEditor: restoreSearchFocus,
    beforeOpen: () => {
      const active = document.activeElement
      prepareVimCommand(
        vimTextCommandState,
        'search-open',
        active instanceof HTMLElement && active.matches('.node-input') ? active : undefined,
      )
    },
    beforeJump: () => {
      const active = document.activeElement
      prepareVimCommand(
        vimTextCommandState,
        'search-jump',
        active instanceof HTMLElement && active.matches('.node-input') ? active : undefined,
      )
    },
  })
  useEffect(() => {
    return store.search.onJump(() => {
      const mode = vimTextCommandState.mode
      if (mode === 'visual' || mode === 'visual-node' || mode === 'replace') {
        setNodeVisualSelection(undefined)
        vimTextCommandState.setMode('normal')
      }
    })
  }, [store, vimTextCommandState, setNodeVisualSelection])
  useLayoutEffect(() => {
    searchAction.current = (command) => {
      if (command === 'all') openGlobalSearch.current?.()
      else if (vimHelpOpen) vimHelpSearchCommands.current?.(command)
      else if (command === 'find') localSearch.open()
      else if (command === 'restore-editor') restoreSearchFocus()
      else localSearch.navigate(command === 'next' ? 1 : -1)
    }
  }, [localSearch, restoreSearchFocus, vimHelpOpen])
  useEffect(() => window.treeApi.onFindMenuCommand?.((command) => searchAction.current(command)), [])
  useEffect(() => registerSearchCommands?.((command) => searchAction.current(command)), [registerSearchCommands])
  useLayoutEffect(
    () => registerViewCommands?.(commandPanel.menuViewCommands),
    [registerViewCommands, commandPanel.menuViewCommands],
  )
  useLayoutEffect(() => {
    const apply = (): void => {
      const nextValue = preferences.vim.getSnapshot()
      if (appliedVim.current === nextValue) return
      appliedVim.current = nextValue
      // Disabling Vim hides visible search as Escape does; folds that a text click left to search stay open
      // (§20.2.31). A focused `/` prompt unmounts with it, so the editor takes focus back first.
      if (!nextValue && store.search.session.getSnapshot().visible) {
        const active = document.activeElement
        const prompted = active instanceof Element && active.closest('.search-input-line') !== null
        store.hideSearch()
        if (prompted) searchAction.current('restore-editor')
      }
      setVimEditing(nextValue)
    }
    const remove = preferences.vim.subscribe(apply)
    apply()
    return remove
  }, [preferences, setVimEditing, store])
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
      if (hidesSelection && search.draft === undefined && document.activeElement instanceof HTMLElement)
        document.activeElement.blur()
      store.toggleExpansion(node.id)
      if (
        nodeVisualSelection !== undefined &&
        (isHiddenByCollapse(nodeVisualSelection.anchorId) || isHiddenByCollapse(nodeVisualSelection.focusId))
      ) {
        setNodeVisualSelection(undefined)
        setVimMode('normal')
      }
    },
    [store, nodeVisualSelection, setNodeVisualSelection, setVimMode, search.draft],
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
  const recordImageSize = useCallback(
    (attachmentId: string, width: number, height: number) =>
      store.recordAttachmentDimensions(attachmentId, width, height),
    [store],
  )
  const renderInput = useCallback(
    (node: TreeNode, label: string, match?: TextMatch): React.JSX.Element => (
      <>
        <NodeInput
          imageCaretActive={isImageCaretActive(node)}
          imageOnly={node.text.length === 0 && node.attachment !== undefined}
          node={node}
          label={label}
          decorations={treeDecorations(node, treeToday)}
          searchQuery={searchQuery}
          currentMatch={match}
          richEditingEnabled={richEditingEnabled}
          {...nodeInputBindings(node)}
        />
        {node.attachment === undefined ? null : (
          <AttachmentImage
            attachmentId={node.attachment.id}
            width={node.attachment.width}
            height={node.attachment.height}
            recognitionComplete={node.attachment.searchText !== undefined}
            imageCaretActive={isImageCaretActive(node)}
            images={attachmentImages}
            onOpen={setPreviewAttachmentId}
            onNaturalSize={recordImageSize}
          />
        )}
      </>
    ),
    [
      attachmentImages,
      isImageCaretActive,
      nodeInputBindings,
      recordImageSize,
      richEditingEnabled,
      searchQuery,
      treeToday,
    ],
  )
  const renderAgendaAttachment = useCallback(
    (node: TreeNode, editable: boolean): React.JSX.Element | null =>
      node.attachment === undefined ? null : (
        <AttachmentImage
          attachmentId={node.attachment.id}
          width={node.attachment.width}
          height={node.attachment.height}
          recognitionComplete={node.attachment.searchText !== undefined}
          imageCaretActive={editable && isImageCaretActive(node)}
          images={attachmentImages}
          onOpen={setPreviewAttachmentId}
          onNaturalSize={recordImageSize}
        />
      ),
    [attachmentImages, isImageCaretActive, recordImageSize],
  )

  const renderAgendaInput = useCallback(
    (node: TreeNode, day: number): React.JSX.Element => (
      <>
        <NodeInput
          node={node}
          label={`Agenda node ${node.id}`}
          imageOnly={node.text.length === 0 && node.attachment !== undefined}
          imageCaretActive={isImageCaretActive(node)}
          decorations={agendaDecorations(node, day, agendaToday)}
          searchQuery={searchQuery}
          currentMatch={
            searchResult?.destination?.nodeId === node.id && searchResult.destination.day === day
              ? searchResult.destination
              : undefined
          }
          richEditingEnabled={richEditingEnabled}
          {...nodeInputBindings(node)}
        />
      </>
    ),
    [agendaToday, isImageCaretActive, nodeInputBindings, richEditingEnabled, searchQuery, searchResult],
  )
  const renderAgendaText = useCallback(
    (node: TreeNode, day: number, marks: readonly CaretMark[], context: boolean): React.JSX.Element => (
      <AgendaSearchText
        node={node}
        day={day}
        today={agendaToday}
        marks={marks}
        context={context}
        query={searchQuery}
        currentMatch={
          searchResult?.destination?.nodeId === node.id && searchResult.destination.day === day
            ? searchResult.destination
            : undefined
        }
        onClick={nodeInputBindings(node).onClick}
      />
    ),
    [agendaToday, nodeInputBindings, searchQuery, searchResult],
  )

  const commandList = commandPanel.open ? (
    <CommandPanel
      matches={commandPanel.matches}
      selected={commandPanel.selected}
      context={commandPanel.context}
      run={commandPanel.run}
      shortcuts={shortcuts}
    />
  ) : null
  const commandInput = (
    <label className="command-input-line">
      {vimEnabled ? <span>:</span> : null}
      <input
        ref={bindCommandInput}
        placeholder={vimEnabled ? undefined : 'Run Command'}
        value={commandPanel.input}
        onChange={(event) => commandPanel.changeInput(event.target.value)}
        aria-label="Command"
        role="combobox"
        aria-expanded="true"
        aria-controls="command-panel"
        aria-autocomplete="list"
        autoComplete="off"
        spellCheck={false}
        aria-activedescendant={
          commandPanel.matches[commandPanel.selected] === undefined
            ? undefined
            : `command-${commandPanel.matches[commandPanel.selected]?.name}`
        }
      />
    </label>
  )

  if (state.status === 'loading')
    return (
      <main className="app-shell">
        <p>Loading document…</p>
      </main>
    )
  const operationError =
    state.operationError === undefined ? null : (
      <span className="save-error" role="alert">
        {OPERATION_ERROR_PREFIX} {state.operationError}
      </span>
    )
  if (state.status === 'error') {
    return (
      <div className="tree-app">
        <main className="app-shell error-state" role="alert">
          <h1>Tree could not open this document</h1>
          <p>{state.message}</p>
          <p>
            {state.notesRecoveryRequired
              ? 'Restart Tree to complete the notes import.'
              : 'The existing data was left unchanged.'}
          </p>
        </main>
        {commandList}
        <StatusBar>
          <div className="status-notifications">
            {operationError}
            {dataOperations === undefined ? null : <DesktopDataActivity operations={dataOperations} />}
            {platformStatus}
          </div>
          <div className="status-controls">
            {commandPanel.open ? commandInput : commandPanel.message}
            {commandPanel.open ? (
              <span className="command-count">
                {commandPanel.matches.length} of {commandPanel.total}
              </span>
            ) : null}
          </div>
        </StatusBar>
      </div>
    )
  }

  const currentParent =
    state.location.currentParentId === null
      ? undefined
      : requireNode(state.document, state.location.currentParentId).node
  const nodes = displayedNodes(state.document, state.location.currentParentId)
  const path = state.location.currentParentId === null ? [] : nodePath(state.document, state.location.currentParentId)
  const topLevel = state.location.currentParentId === null

  const dispatchLeaderCommand = (command: VimLeaderCommand | 'consumed', fromHelp = false): void => {
    if (command === 'toggle-agenda') {
      switchAgendaView()
      return
    }
    if (fromHelp) {
      // A reference row is not a note. Never send document-changing commands to the hidden editor.
      if (command === 'toggle-mark' || command === 'toggle-star' || command === 'import-notes') return
    } else store.search.interruptNavigation()
    if (command === 'global-search') openGlobalSearch.current?.()
    else if (command === 'toggle-mark') store.toggleMarkNode()
    else if (command === 'toggle-star') store.toggleStarNode()
    else if (command === 'show-about') showAbout?.()
    else if (command === 'show-vim-help') {
      if (updateBlocked) return
      if (fromHelp) closeVimHelp()
      else {
        returnFromVimHelp.current = captureFocusRestoration(document.activeElement, 'native')
        setVimHelpOpen(true)
      }
    } else if (command === 'export-notes' || command === 'import-notes') {
      if (!updateBlocked) void commandPanel.runFileCommand(command)
    } else if (command === 'toggle-always-on-top') {
      if (alwaysOnTopAvailable && !updateBlocked) toggleAlwaysOnTop()
    } else if (command === 'toggle-fold') {
      prepareVimCommand(vimTextCommandState, 'command')
      const current = store.getSnapshot()
      if (current.status === 'ready') {
        if (current.agenda === undefined) store.applyFold('toggle', current.location.selectedNodeId)
        else toggleAgendaFold.current?.()
      }
    } else if (command === 'cycle-appearance') cycleAppearance()
  }

  return (
    <main
      ref={activeLineRoot}
      className={`tree-app vim-state-${vimMode}${leftCommandKeyPressed ? ' left-command-down' : ''}`}
      onMouseDown={(event) => blankPress.press(event.nativeEvent)}
      onContextMenu={() => blankPress.contextMenu()}
      onMouseUp={() => blankPress.settle()}
      onBlurCapture={() => cancelVimLeader(vimTextCommandState.commandState)}
      onPointerDownCapture={() => cancelVimLeader(vimTextCommandState.commandState)}
      onKeyDownCapture={(event) => {
        blankPress.settle()
        if (vimHelpOpen) {
          const target = event.target
          if (!(target instanceof Element) || target.closest('dialog, [role="dialog"]')) return
          if (
            event.key.toLowerCase() === 'p' &&
            shortcuts.isPrimary(event) &&
            !shortcuts.hasNonPrimaryCtrl(event) &&
            !event.shiftKey &&
            !event.altKey &&
            !event.nativeEvent.isComposing
          ) {
            event.preventDefault()
            event.stopPropagation()
            switchAgendaView()
          } else if (event.key === 'Escape' && !target.closest('.vim-help-view, .vim-search-line')) {
            event.preventDefault()
            event.stopPropagation()
            closeVimHelp()
          }
          return
        }
        if (!vimEnabled || isEditorComposing(event.target)) return
        const command = routeVimLeaderKey(event)
        if (command !== undefined) dispatchLeaderCommand(command)
      }}
      onKeyDown={(event) => {
        if (vimHelpOpen) return
        const target = event.target
        if (
          !(target instanceof Element) ||
          target.closest('.node-input, .agenda-list, .command-input-line, .search-controls, dialog, [role="dialog"]')
        )
          return
        if (agenda !== undefined) {
          createAgendaKeyDownHandler({ store, vim: vimEnabled ? vimTextCommandState : undefined, shortcuts })(event)
        } else if (shortcuts.isPrimary(event) && !event.shiftKey && !event.altKey && event.key.toLowerCase() === 'p') {
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
      {vimHelpOpen ? (
        <VimHelpView
          showFloatOnTop={alwaysOnTopAvailable}
          lineNumbers={lineNumbers}
          shortcuts={shortcuts}
          statusTarget={vimHelpStatusTarget}
          searchCommandsRef={vimHelpSearchCommands}
          routeLeader={routeVimLeaderKey}
          onLeaderCommand={(command) => dispatchLeaderCommand(command, true)}
          onClose={closeVimHelp}
        />
      ) : agenda !== undefined ? (
        <AgendaLocationBar agenda={agenda} />
      ) : (
        <LocationBar
          path={path}
          currentParentId={state.location.currentParentId}
          onNavigate={navigateToAncestor}
          dropParentId={breadcrumbTarget}
        />
      )}
      <GlobalSearchPopup
        openRef={openGlobalSearch}
        store={store}
        shortcuts={shortcuts}
        blocked={commandPanel.open || state.quitWithoutSavingPrompt === true}
        isEditorComposing={(target) => isEditorComposing(target) || findPromptComposition.owns(target)}
        beforeOpen={() => {
          if (vimHelpOpen) {
            vimHelpSearchCommands.current?.('prepare-global-search')
            return
          }
          prepareVimCommand(vimTextCommandState, 'focus-borrow')
          store.search.interruptNavigation()
          if (store.search.session.getSnapshot().draft !== undefined) {
            store.search.cancelDraft()
            restoreSearchFocus()
          }
        }}
        beforeVisit={() => {
          restoreNotesBeforeViewChange()
          beforeViewChange()
        }}
      />
      <div className={SCROLL_VIEWPORT_CLASS} inert={vimHelpOpen}>
        <section
          onClick={(event) => {
            if (
              event.button === 0 &&
              search.visible &&
              event.target instanceof Element &&
              event.target.closest('.node-input, .agenda-text')
            )
              store.hideSearchAtPointer()
          }}
          className={
            agenda !== undefined
              ? `editor-shell agenda-shell${focusedAgendaDay(agenda) === undefined ? '' : ' agenda-shell-focused'}`
              : topLevel
                ? 'editor-shell editor-shell-top-level'
                : 'editor-shell'
          }
        >
          {agenda !== undefined ? (
            <AgendaView
              lineNumbers={lineNumbers}
              searchCaretRef={searchCaret}
              toggleFoldRef={toggleAgendaFold}
              refreshActiveLine={refreshActiveLine}
              store={store}
              agenda={agenda}
              document={state.document}
              vim={vimEnabled ? vimTextCommandState : undefined}
              shortcuts={shortcuts}
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
                  data-starred={currentParent.starred}
                  data-marked={currentParent.marked}
                  data-color-depth={path.length - 1}
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
                    decorations={treeDecorations(currentParent, treeToday)}
                    searchQuery={searchQuery}
                    currentMatch={
                      searchResult?.destination?.nodeId === currentParent.id ? searchResult.destination : undefined
                    }
                    richEditingEnabled={richEditingEnabled}
                    {...nodeInputBindings(currentParent)}
                  />
                  {currentParent.attachment === undefined ? null : (
                    <AttachmentImage
                      attachmentId={currentParent.attachment.id}
                      width={currentParent.attachment.width}
                      height={currentParent.attachment.height}
                      recognitionComplete={currentParent.attachment.searchText !== undefined}
                      imageCaretActive={isImageCaretActive(currentParent)}
                      images={attachmentImages}
                      onOpen={setPreviewAttachmentId}
                      onNaturalSize={recordImageSize}
                    />
                  )}
                </section>
              )}
              <NodeList
                lineNumbers={lineNumbers}
                colorDepthOffset={path.length}
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
                currentMatch={searchResult?.destination}
                structuralVersion={state.structuralVersion}
              />
            </>
          )}
        </section>
      </div>
      <CompletionPopup presentation={completionPopup} accept={acceptCompletion} />
      {commandList}
      {!vimHelpOpen && search.visible && !commandPanel.open && !vimEnabled ? (
        <section className="local-search-panel" aria-label="Find in current view" data-editor-focus-borrow>
          <SearchPrompt
            store={store}
            snapshot={search}
            restoreEditor={restoreSearchFocus}
            shortcuts={shortcuts}
            navigate={localSearch.navigate}
            beginEditing={() => localSearch.open(false)}
          />
          <SearchCount
            pending={search.pending}
            label={
              search.count?.capped
                ? '100+'
                : searchResult?.ordinal === undefined
                  ? `${search.count?.total ?? 0}`
                  : `${searchResult.ordinal} / ${search.count?.total ?? 0}`
            }
          />
          <div className="search-controls" data-editor-focus-borrow>
            <button
              type="button"
              aria-label="Previous match"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => localSearch.navigate(-1)}
            >
              ↑
              <span aria-hidden="true" className="search-tooltip">
                Previous match
              </span>
            </button>
            <button
              type="button"
              aria-label="Next match"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => localSearch.navigate(1)}
            >
              ↓
              <span aria-hidden="true" className="search-tooltip">
                Next match
              </span>
            </button>
            <button
              type="button"
              aria-label="Close search"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                store.hideSearch()
                restoreSearchFocus()
              }}
            >
              ×
              <span aria-hidden="true" className="search-tooltip">
                Close search
              </span>
            </button>
          </div>
        </section>
      ) : null}
      <StatusBar>
        <div className="status-notifications">
          {state.saveError === undefined ? null : (
            <span className="save-error" role="status">
              {SAVE_ERROR_PREFIX} {state.saveError}
            </span>
          )}
          {operationError}
          {persistenceLocked ? (
            <span className="save-error persistence-locked" role="alert">
              {SAVE_LOCKED_MESSAGE}
            </span>
          ) : null}
          {dataOperations === undefined ? null : <DesktopDataActivity operations={dataOperations} />}
          {platformStatus}
        </div>
        <div className="status-controls" ref={vimHelpOpen ? setVimHelpStatusTarget : undefined}>
          {!vimHelpOpen && vimEnabled && search.visible && !commandPanel.open ? (
            <div className="vim-search-line" aria-label="Find in current view" data-editor-focus-borrow>
              {search.draft !== undefined ? (
                <SearchPrompt
                  store={store}
                  snapshot={search}
                  restoreEditor={restoreSearchFocus}
                  shortcuts={shortcuts}
                  navigate={localSearch.navigate}
                  vim
                />
              ) : (
                <span>/{search.confirmed}</span>
              )}
              <SearchCount
                pending={search.pending}
                label={
                  search.count?.capped
                    ? '100+'
                    : searchResult?.ordinal === undefined
                      ? `${search.count?.total ?? 0}`
                      : `${searchResult.ordinal} / ${search.count?.total ?? 0}`
                }
              />
            </div>
          ) : null}
          {commandPanel.open ? (
            commandInput
          ) : commandPanel.message !== undefined ? (
            <span className="command-error" role="status">
              {commandPanel.message}
            </span>
          ) : null}
          {commandPanel.open ? (
            <span className="command-count">
              {commandPanel.matches.length} of {commandPanel.total}
            </span>
          ) : statusMessage !== undefined && !vimHelpOpen ? (
            <span className={`status-bar-message${search.visible ? ' search-status-message' : ''}`} role="status">
              {statusMessage}
            </span>
          ) : (
            <UpdateStatus hidden={commandPanel.message !== undefined} />
          )}
          {vimEnabled && !vimHelpOpen ? (
            <div className={`vim-mode vim-mode-${vimMode}`} aria-label="Vim mode">
              {vimMode === 'visual-node' ? 'VISUAL NODE' : vimMode.toUpperCase()}
            </div>
          ) : null}
          <AlwaysOnTopToggle alwaysOnTop={alwaysOnTop} onToggle={toggleAlwaysOnTop} />
        </div>
      </StatusBar>
      {state.quitWithoutSavingPrompt === true ? (
        <QuitWithoutSavingPrompt
          onCancel={dismissQuitWithoutSaving}
          onQuit={quitWithoutSaving}
          onChange={onQuitDialogChange}
        />
      ) : null}
      {previewAttachmentId === undefined ? null : (
        <ImagePreview
          key={previewAttachmentId}
          attachmentId={previewAttachmentId}
          images={attachmentImages}
          vimEnabled={vimEnabled}
          shortcuts={shortcuts}
          onClose={() => setPreviewAttachmentId(undefined)}
        />
      )}
    </main>
  )
}
