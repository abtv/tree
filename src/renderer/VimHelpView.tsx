import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { EditorStore } from '../application/editor-store'
import type { EditorSnapshot } from '../application/editor-store-types'
import { isNodeExpanded } from '../application/expansion-state'
import { displayedNodes, nodePath, requireNode, serializeState, type TreeNode } from '../domain/document'
import type { EditorFindCommand } from './App'
import { caretMarks, clampCaret, type RowCaret } from './agenda-row-caret'
import { caretLineRect, getSelectionEndpoints, richTextHtml } from './editor-dom'
import { LocationBar } from './LocationBar'
import { NodeList } from './NodeList'
import { SearchCount } from './SearchCount'
import { SearchPrompt } from './SearchPrompt'
import { useSearchDecorations } from './search-decorations'
import type { ShortcutProfile } from './shortcut-profile'
import { useLocalSearch } from './use-local-search'
import {
  cancelVimLeader,
  clearCommandAssembly,
  createVimCommandState,
  type VimLeaderCommand,
} from './vim-command-state'
import { navigateVimHelp } from './vim-help-navigation'
import type { VimLeaderRouter } from './vim-leader-keys'
import type { VimTextCommandState } from './vim-session-finish'

type Shortcut = readonly [keys: string, action: string]
type HelpAppLeaderCommand = Exclude<VimLeaderCommand, 'toggle-fold'>
export type VimHelpSearchCommand = Exclude<EditorFindCommand, 'all'> | 'prepare-global-search'

const isHelpRow = (target: Element): boolean => target.matches('.vim-help-node')

function helpNode(text: string, children: readonly TreeNode[] = []): TreeNode {
  return { id: `vim-help:${text}`, text, children }
}

function shortcutNodes(shortcuts: readonly Shortcut[]): TreeNode[] {
  return shortcuts.map(([keys, action]) => helpNode(`${keys} — ${action}`))
}

function buildHelpOutline(showFloatOnTop: boolean): TreeNode {
  return helpNode('Vim shortcuts', [
    helpNode('In Normal mode, Space starts a Leader command. Press each key in order.'),
    helpNode('Mark, star and import are available in your notes, not in this reference.'),
    helpNode('Leader shortcuts', [
      helpNode(
        'Space h — Help',
        shortcutNodes([
          ['Space h a', 'About Tree'],
          ['Space h h', 'Open or close Vim shortcuts'],
        ]),
      ),
      ...shortcutNodes([
        ['Space Space', 'Search all nodes'],
        ['Space m', 'Toggle mark'],
        ['Space s', 'Toggle star'],
        ['Space p', 'Switch between Tree and Agenda'],
        ['Space e', 'Collapse or expand'],
      ]),
      helpNode(
        'Space f — File',
        shortcutNodes([
          ['Space f e', 'Export notes'],
          ['Space f i', 'Import notes'],
        ]),
      ),
      helpNode(
        'Space t — Toggle',
        shortcutNodes([
          ['Space t m', 'Toggle mark'],
          ['Space t s', 'Toggle star'],
          ['Space t t', 'Cycle appearance'],
          ...(showFloatOnTop ? ([['Space t f', 'Float on Top']] as const) : []),
        ]),
      ),
    ]),
  ])
}

export function VimHelpView({
  showFloatOnTop,
  lineNumbers,
  shortcuts,
  statusTarget,
  searchCommandsRef,
  routeLeader,
  onLeaderCommand,
  onClose,
}: {
  showFloatOnTop: boolean
  lineNumbers: boolean
  shortcuts: ShortcutProfile
  statusTarget: HTMLElement | null
  searchCommandsRef: RefObject<((command: VimHelpSearchCommand) => void) | undefined>
  routeLeader: VimLeaderRouter
  onLeaderCommand(command: HelpAppLeaderCommand): void
  onClose: () => void
}): React.JSX.Element {
  const [store] = useState(() => {
    const root = buildHelpOutline(showFloatOnTop)
    const expandedIds: string[] = []
    const expand = (node: TreeNode): void => {
      if (node.children.length === 0) return
      expandedIds.push(node.id)
      node.children.forEach(expand)
    }
    expand(root)
    return new EditorStore(
      {
        readOnly: true,
        load: async () =>
          serializeState({ roots: [root] }, { currentParentId: root.id, selectedNodeId: root.id }, { expandedIds }),
        save: async () => undefined,
        cleanupAttachments: async () => undefined,
        writeAttachment: async () => undefined,
        readClipboard: async () => ({ kind: 'text', text: '' }),
      },
      () => 'vim-help',
    )
  })
  const initializing = useRef(false)
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot)
  useEffect(() => {
    if (!initializing.current) {
      initializing.current = true
      void store.initialize()
    }
    return () => store.disposeSearch()
  }, [store])
  if (state.status !== 'ready') {
    return (
      <div className="location-bar">
        <button type="button" className="location-link" onClick={onClose}>
          Back to notes
        </button>
        {state.status === 'error' ? <span role="alert">{state.message}</span> : null}
      </div>
    )
  }

  return (
    <ReadyVimHelpView
      store={store}
      state={state}
      lineNumbers={lineNumbers}
      shortcuts={shortcuts}
      statusTarget={statusTarget}
      searchCommandsRef={searchCommandsRef}
      routeLeader={routeLeader}
      onLeaderCommand={onLeaderCommand}
      onClose={onClose}
    />
  )
}

function ReadyVimHelpView({
  store,
  state,
  lineNumbers,
  shortcuts,
  statusTarget,
  searchCommandsRef,
  routeLeader,
  onLeaderCommand,
  onClose,
}: {
  store: EditorStore
  state: Extract<EditorSnapshot, { status: 'ready' }>
  lineNumbers: boolean
  shortcuts: ShortcutProfile
  statusTarget: HTMLElement | null
  searchCommandsRef: RefObject<((command: VimHelpSearchCommand) => void) | undefined>
  routeLeader: VimLeaderRouter
  onLeaderCommand(command: HelpAppLeaderCommand): void
  onClose: () => void
}): React.JSX.Element {
  const { currentParentId, selectedNodeId } = state.location
  const path = currentParentId === null ? [] : nodePath(state.document, currentParentId)
  const current = path.at(-1)
  const selected = requireNode(state.document, selectedNodeId).node
  const [mode, setMode] = useState<'normal' | 'visual'>('normal')
  const [commandState] = useState(createVimCommandState)
  const vim: VimTextCommandState = {
    mode,
    setMode: (next) => setMode(next === 'visual' ? 'visual' : 'normal'),
    commandState,
  }
  const [localCaret, setLocalCaret] = useState<{ token: number; caret: RowCaret }>()
  const caret = clampCaret(
    localCaret?.token === state.focus.token
      ? localCaret.caret
      : { key: selectedNodeId, anchor: state.focus.cursor, focus: state.focus.cursor },
    selected.text,
    mode,
  )
  const view = useRef<HTMLElement>(null)
  const lastParentId = useRef(currentParentId)
  const rowElement = useCallback(
    (id: string) => view.current?.querySelector<HTMLElement>(`[data-help-node="${CSS.escape(id)}"]`) ?? null,
    [],
  )
  const search = useSyncExternalStore(store.search.subscribe, store.search.session.getSnapshot)
  const searchResult = useSyncExternalStore(store.search.subscribe, store.search.getResult)
  const restoreRow = useCallback(() => {
    const latest = store.getSnapshot()
    if (latest.status === 'ready') rowElement(latest.location.selectedNodeId)?.focus({ preventScroll: true })
  }, [rowElement, store])
  const readCaret = (): number => caret.focus
  const resetAssembly = (): void => clearCommandAssembly(commandState)
  const { open: openFind, navigate: repeatFind } = useLocalSearch({
    store,
    shortcuts,
    blocked: false,
    readEditorCaret: readCaret,
    readAgendaCaret: readCaret,
    restoreEditor: restoreRow,
    beforeOpen: resetAssembly,
    beforeJump: () => setMode('normal'),
    vimEnabled: true,
    completionOpen: false,
  })
  useLayoutEffect(() => {
    searchCommandsRef.current = (command) => {
      if (command === 'find') openFind()
      else if (command === 'restore-editor') restoreRow()
      else if (command === 'prepare-global-search') {
        clearCommandAssembly(commandState)
        store.search.interruptNavigation()
        if (store.search.session.getSnapshot().draft !== undefined) {
          store.search.cancelDraft()
          restoreRow()
        }
      } else repeatFind(command === 'next' ? 1 : -1)
    }
    return () => {
      searchCommandsRef.current = undefined
    }
  }, [commandState, openFind, repeatFind, restoreRow, searchCommandsRef, store])

  useLayoutEffect(() => {
    const scroller = view.current
    const row = rowElement(selectedNodeId)
    if (scroller === null || row === null || search.draft !== undefined) return
    if (lastParentId.current !== currentParentId) {
      lastParentId.current = currentParentId
      scroller.scrollTop = 0
    }
    if (document.querySelector('dialog[open], [role="dialog"][aria-modal="true"]') !== null) return
    row.focus({ preventScroll: true })
    const line = caretLineRect(row, caret.focus)
    const viewport = scroller.getBoundingClientRect()
    if (line.top < viewport.top) scroller.scrollBy(0, line.top - viewport.top)
    else if (line.bottom > viewport.bottom) scroller.scrollBy(0, line.bottom - viewport.bottom)
  }, [caret.focus, currentParentId, rowElement, search.draft, selectedNodeId, state.focus.token])

  const place = (next: RowCaret): void => {
    const before = store.getSnapshot()
    if (before.status !== 'ready') return
    if (before.location.selectedNodeId !== next.key) store.selectNode(next.key, next.focus)
    const after = store.getSnapshot()
    if (after.status !== 'ready' || after.location.selectedNodeId !== next.key) return
    setLocalCaret({ token: after.focus.token, caret: next })
  }
  const goTo = (id: string | null): void => {
    resetAssembly()
    setMode('normal')
    if (id === null) onClose()
    else store.navigateToAncestor(id)
  }
  const query = search.visible ? (search.draft ?? search.confirmed) : ''
  const renderText = (node: TreeNode, parent = false): React.JSX.Element => (
    <HelpNodeText
      node={node}
      parent={parent}
      selected={node.id === selectedNodeId}
      caret={caret}
      mode={mode}
      query={query}
      currentMatch={searchResult?.destination?.nodeId === node.id ? searchResult.destination : undefined}
      onSelect={(anchor, focus) => {
        resetAssembly()
        setMode(anchor === focus ? 'normal' : 'visual')
        place({ key: node.id, anchor, focus })
      }}
    />
  )

  return (
    <>
      <LocationBar path={path} currentParentId={currentParentId} rootLabel="Back to notes (Esc)" onNavigate={goTo} />
      <section
        className={`vim-help-view vim-state-${mode}`}
        aria-label="Vim shortcuts (read only)"
        data-editor-focus-borrow
        ref={view}
        onBlurCapture={(event) => {
          if (event.relatedTarget instanceof Node && !event.currentTarget.contains(event.relatedTarget))
            cancelVimLeader(commandState)
        }}
        onPointerDownCapture={() => cancelVimLeader(commandState)}
        onKeyDown={(event) => {
          const target = event.target
          if (event.defaultPrevented || event.nativeEvent.isComposing || !(target instanceof Element)) return
          const onRow = isHelpRow(target)
          const leader = onRow ? routeLeader(event, { vim, isTarget: isHelpRow }) : undefined
          if (leader !== undefined) {
            store.search.interruptNavigation()
            if (leader === 'toggle-fold') store.applyFold('toggle', selectedNodeId)
            else if (leader !== 'consumed') onLeaderCommand(leader)
            return
          }
          if (event.key === 'Escape') {
            event.preventDefault()
            event.stopPropagation()
            if (commandState.pending !== undefined) resetAssembly()
            else if (mode === 'visual') setMode('normal')
            else if (search.visible) {
              store.hideSearch()
              restoreRow()
            } else onClose()
            return
          }
          if (!onRow) return
          navigateVimHelp({
            event,
            store,
            node: selected,
            caret,
            vim,
            shortcuts,
            viewport: event.currentTarget,
            rowElement,
            place,
            copy: (text) => {
              if (text) void window.treeApi.writeClipboardContent?.({ kind: 'text', text }).catch(() => undefined)
            },
            openFind,
          })
        }}
      >
        <div className="editor-shell">
          {current === undefined ? null : (
            <div className="current-parent" data-color-depth={path.length - 1}>
              {renderText(current, true)}
            </div>
          )}
          <NodeList
            readOnly
            lineNumbers={lineNumbers}
            nodes={displayedNodes(state.document, currentParentId)}
            colorDepthOffset={path.length}
            focusedNodeId={selectedNodeId}
            isExpanded={(id) => isNodeExpanded(state.expansion, id)}
            onToggleExpansion={(node) => {
              resetAssembly()
              store.toggleExpansion(node.id)
            }}
            onEnter={(node) => {
              resetAssembly()
              setMode('normal')
              store.selectNode(node.id, 0)
              store.enter()
            }}
            renderText={renderText}
          />
        </div>
      </section>
      {statusTarget === null
        ? null
        : createPortal(
            <>
              {search.visible ? (
                <div className="vim-search-line" aria-label="Find in Vim shortcuts">
                  {search.draft !== undefined ? (
                    <SearchPrompt
                      vim
                      allowAgenda={false}
                      store={store}
                      snapshot={search}
                      shortcuts={shortcuts}
                      restoreEditor={restoreRow}
                      navigate={repeatFind}
                    />
                  ) : (
                    <span>/{search.confirmed}</span>
                  )}
                  <SearchCount
                    pending={search.pending}
                    label={
                      searchResult?.ordinal === undefined
                        ? `${search.count?.total ?? 0}`
                        : `${searchResult.ordinal} / ${search.count?.total ?? 0}`
                    }
                  />
                </div>
              ) : null}
              <span className={`vim-mode vim-mode-${mode}`}>{mode === 'visual' ? 'VISUAL' : 'READ ONLY'}</span>
            </>,
            statusTarget,
          )}
    </>
  )
}

function HelpNodeText({
  node,
  parent,
  selected,
  caret,
  mode,
  query,
  currentMatch,
  onSelect,
}: {
  node: TreeNode
  parent: boolean
  selected: boolean
  caret: RowCaret
  mode: 'normal' | 'visual'
  query: string
  currentMatch: { start: number; end: number } | undefined
  onSelect(anchor: number, focus: number): void
}): React.JSX.Element {
  const matches = useSearchDecorations(node.text, query)
  const decorations = matches.map((match) =>
    currentMatch?.start === match.start && currentMatch.end === match.end
      ? { ...match, className: 'search-match search-match-current' }
      : match,
  )
  const Tag = parent ? 'h1' : 'span'
  return (
    <Tag
      className={`node-text vim-help-node${parent ? ' current-parent-input' : ''}`}
      data-help-node={node.id}
      tabIndex={selected ? 0 : -1}
      onClick={(event) => {
        const text = document.getSelection()
        if (text?.anchorNode === null || !event.currentTarget.contains(text?.anchorNode ?? null)) {
          onSelect(0, 0)
          return
        }
        const { anchor, focus } = getSelectionEndpoints(event.currentTarget)
        onSelect(anchor, focus)
      }}
      dangerouslySetInnerHTML={{
        __html: richTextHtml(node, decorations, selected ? caretMarks(caret, node.text, mode) : []),
      }}
    />
  )
}
