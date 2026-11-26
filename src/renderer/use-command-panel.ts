import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { emptyMenuCommands, type MenuCommandSource } from '../application/menu-commands'
import {
  availableCommands,
  matchCommands,
  nextAppearance,
  normalizeCommandHistory,
  rememberCommand,
  type ApplicationCommand,
  type CommandAppearance,
} from '../application/command-registry'
import type { EditorStore } from '../application/editor-store'
import type { VimMode } from './vim-editing'
import type { VimCommandState } from './vim-command-state'
import { clearPending, hasLiveVimLeader } from './vim-command-state'
import { moveSuggestionIndex } from './completion-controller'
import { captureFocusRestoration, getCaret } from './editor-dom'
import { APPLE_SHORTCUTS, type ShortcutProfile } from './shortcut-profile'

export function useCommandPanel(options: {
  blocked?: boolean
  showAbout?: (() => void) | undefined
  searchCommand?: (command: 'find' | 'next' | 'previous' | 'all') => void
  store: EditorStore
  vimEnabled: boolean
  vimAvailable?: boolean
  alwaysOnTopAvailable?: boolean
  vimMode: VimMode
  commandState: VimCommandState
  isEditorComposing(target: EventTarget | null): boolean
  alwaysOnTop: boolean
  setAlwaysOnTop(value: boolean): void
  applyVimEnabled(value: boolean): Promise<void>
  lineNumbers: boolean
  applyLineNumbers(value: boolean): Promise<void>
  beforeViewChange(): void
  beforeMenuViewChange?: () => void
  beforeOpen?: () => void
  shortcuts?: ShortcutProfile
  menuCommands?: MenuCommandSource | undefined
}) {
  const { store, vimEnabled, vimMode, commandState, alwaysOnTop, setAlwaysOnTop, applyVimEnabled, beforeViewChange } =
    options
  const shortcuts = options.shortcuts ?? APPLE_SHORTCUTS
  const blocked = options.blocked ?? false
  const { lineNumbers, applyLineNumbers } = options
  const beforeOpen = options.beforeOpen
  const beforeMenuViewChange = options.beforeMenuViewChange
  const { isEditorComposing } = options
  const searchCommand = options.searchCommand
  const showAbout = options.showAbout
  const menuCommands = options.menuCommands ?? emptyMenuCommands
  const menuEntries = useSyncExternalStore(menuCommands.subscribe, menuCommands.getSnapshot)
  const [open, setOpen] = useState(false)
  const vimAvailable = options.vimAvailable ?? true
  const alwaysOnTopAvailable = options.alwaysOnTopAvailable ?? true
  const [input, setInput] = useState('')
  const [selected, setSelected] = useState(0)
  const [message, setMessage] = useState<string>()
  const [history, setHistory] = useState<string[]>([])
  const [appearance, setAppearance] = useState<CommandAppearance>('system')
  const appearanceRevision = useRef(0)
  const appearanceCycle = useRef(Promise.resolve())
  const restore = useRef<() => void>(() => undefined)
  const inputRef = useRef<HTMLInputElement>(null)
  const bindInput = useCallback((element: HTMLInputElement | null): void => {
    inputRef.current = element
  }, [])
  const runningFromPanel = useRef(false)
  const snapshot = store.getSnapshot()
  const starTarget = store.starTarget
  const starred = starTarget?.starred === true
  const marked = starTarget?.marked === true
  const canStar = starTarget !== undefined
  const imageToTextAvailable = store.imageToTextAvailable === true
  const view: 'agenda' | 'tree' = snapshot.status === 'ready' && snapshot.agenda !== undefined ? 'agenda' : 'tree'
  const commands = useMemo(
    () =>
      [
        ...availableCommands({
          vim: vimAvailable,
          alwaysOnTop: alwaysOnTopAvailable,
          imageToText: imageToTextAvailable,
        }).map((command) =>
          command.name === 'toggle-star-node' || command.name === 'toggle-mark-node'
            ? { ...command, enabled: canStar }
            : command,
        ),
        ...menuEntries,
      ].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)),
    [vimAvailable, alwaysOnTopAvailable, imageToTextAvailable, menuEntries, canStar],
  )
  const matches = useMemo(() => matchCommands(input, history, commands), [input, history, commands])
  useEffect(() => {
    if (message === undefined) return
    const timer = window.setTimeout(() => setMessage(undefined), 2000)
    return () => window.clearTimeout(timer)
  }, [message])
  const observeAppearance = useCallback((value: CommandAppearance): void => {
    appearanceRevision.current++
    setAppearance(value)
  }, [])
  useEffect(() => {
    const revision = appearanceRevision.current
    const unsubscribe = window.treeApi.onAppearanceChanged?.(observeAppearance)
    void window.treeApi
      .getAppearance()
      .then((value) => {
        if (appearanceRevision.current === revision) setAppearance(value)
      })
      .catch((error: unknown) => store.reportError(error))
    void window.treeApi
      .getCommandHistory()
      .then((value) => setHistory(normalizeCommandHistory(value)))
      .catch((error: unknown) => store.reportError(error))
    return unsubscribe
  }, [observeAppearance, store])

  const close = useCallback(() => {
    setOpen(false)
    restore.current()
  }, [])

  const applyAppearance = useCallback(
    async (value: CommandAppearance): Promise<void> => {
      const revision = appearanceRevision.current
      await window.treeApi.setAppearance(value)
      // The adapter's change notification can be followed by a newer menu choice before this reply.
      if (appearanceRevision.current === revision) observeAppearance(value)
    },
    [observeAppearance],
  )

  const cycleAppearance = useCallback((): void => {
    // Read the latest choice, including native menu changes. Consecutive mappings must each
    // advance from the last completed write, not from a render or a stale preference read.
    appearanceCycle.current = appearanceCycle.current
      .then(async () => {
        const revision = appearanceRevision.current
        const appearance = await window.treeApi.getAppearance()
        if (appearanceRevision.current === revision) await applyAppearance(nextAppearance(appearance))
      })
      .catch((error: unknown) => store.reportError(error))
  }, [applyAppearance, store])

  const showAgenda = useCallback(async () => {
    if (view === 'agenda') return
    beforeViewChange()
    const active = document.activeElement
    store.openAgenda(active instanceof HTMLElement && active.matches('.node-input') ? getCaret(active) : undefined)
  }, [view, beforeViewChange, store])
  const showTree = useCallback(async () => {
    if (view === 'tree') return
    beforeViewChange()
    store.closeAgenda()
  }, [view, beforeViewChange, store])

  const menuViewCommands = useMemo(() => {
    const runViewCommand = async (command: () => Promise<void>): Promise<void> => {
      if (document.querySelector('dialog[open], [role="dialog"][aria-modal="true"]') !== null) return
      if (open) close()
      beforeMenuViewChange?.()
      await command()
    }
    return {
      showAgenda: () => runViewCommand(showAgenda),
      showTree: () => runViewCommand(showTree),
    }
  }, [open, close, beforeMenuViewChange, showAgenda, showTree])

  const run = useCallback(
    async (command: ApplicationCommand | undefined, source: 'panel' | 'leader' = 'panel') => {
      const fromPanel = source === 'panel'
      if (fromPanel && runningFromPanel.current) return
      if (command?.enabled === false) return
      if (command !== undefined && menuEntries.includes(command)) {
        const current = menuCommands.getSnapshot().find((entry) => entry.name === command?.name)
        if (current === undefined || current.enabled === false || current.description !== command?.description) return
        command = current
      }
      if (fromPanel) close()
      if (command === undefined) {
        if (fromPanel) setMessage(`Not a command: ${input.trim()}`)
        return
      }
      if (fromPanel) runningFromPanel.current = true
      try {
        await command.run(
          {
            toggleStarNode: async () => {
              store.toggleStarNode()
            },
            toggleMarkNode: async () => {
              store.toggleMarkNode()
            },
            reindexAllImages: async () => store.reindexAllImages(),
            showAbout: async () => {
              showAbout?.()
            },
            find: async () => searchCommand?.('find'),
            findNext: async () => searchCommand?.('next'),
            findPrevious: async () => searchCommand?.('previous'),
            searchAllNodes: async () => searchCommand?.('all'),
            quit: () => window.treeApi.quit(),
            setVimEnabled: applyVimEnabled,
            setLineNumbers: applyLineNumbers,
            showAgenda,
            showTree,
            setAlwaysOnTop: async (value) => {
              await window.treeApi.setAlwaysOnTop(value)
              setAlwaysOnTop(value)
            },
            setAppearance: applyAppearance,
          },
          { alwaysOnTop, appearance, vimEnabled, lineNumbers, view, starred, marked },
        )
        if (fromPanel && command.name !== 'quit') {
          const next = rememberCommand(history, command.name)
          setHistory(next)
          await window.treeApi.setCommandHistory(next)
        }
      } catch (error) {
        store.reportError(error)
      } finally {
        if (fromPanel) runningFromPanel.current = false
      }
    },
    [
      close,
      starred,
      marked,
      searchCommand,
      showAbout,
      input,
      alwaysOnTop,
      appearance,
      history,
      store,
      setAlwaysOnTop,
      applyVimEnabled,
      applyLineNumbers,
      applyAppearance,
      lineNumbers,
      vimEnabled,
      view,
      showAgenda,
      showTree,
      menuCommands,
      menuEntries,
    ],
  )

  useEffect(() => {
    const keydown = (event: KeyboardEvent): void => {
      if (blocked) return
      if (event.target instanceof Element && event.target.closest('dialog[open]')) return
      if (message !== undefined) setMessage(undefined)
      if (open) {
        if (event.key === 'Escape' || (event.key === 'Backspace' && input === '')) {
          event.preventDefault()
          event.stopImmediatePropagation()
          close()
        } else if (event.key === 'Enter') {
          event.preventDefault()
          event.stopImmediatePropagation()
          void run(matches[selected])
        } else if (
          event.key === 'ArrowDown' ||
          event.key === 'ArrowUp' ||
          (event.ctrlKey && (event.key === 'n' || event.key === 'p'))
        ) {
          event.preventDefault()
          event.stopImmediatePropagation()
          const direction = event.key === 'ArrowDown' || event.key === 'n' ? 1 : -1
          setSelected((value) => moveSuggestionIndex(value, direction, matches.length))
        }
        return
      }
      const target = event.target
      const shortcut =
        event.key.toLowerCase() === 'p' &&
        event.shiftKey &&
        shortcuts.isPrimary(event) &&
        !shortcuts.hasNonPrimaryCtrl(event) &&
        !event.altKey
      const colon =
        event.key === ':' &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        vimEnabled &&
        vimMode === 'normal' &&
        !isEditorComposing(target) &&
        !(target instanceof Element && target.closest('.search-input-line')) &&
        // This listener runs before the Leader handler, which discards an unmatched continuation.
        !hasLiveVimLeader(commandState, event.timeStamp)
      if (
        (!shortcut && !colon) ||
        event.isComposing ||
        store.getSnapshot().status === 'loading' ||
        !(target instanceof Element) ||
        target.closest('[role="dialog"]')
      )
        return
      event.preventDefault()
      event.stopImmediatePropagation()
      clearPending(commandState)
      beforeOpen?.()
      restore.current = captureFocusRestoration(document.activeElement, 'native')
      setInput('')
      setSelected(0)
      setOpen(true)
    }
    document.addEventListener('keydown', keydown, true)
    return () => document.removeEventListener('keydown', keydown, true)
  }, [
    blocked,
    open,
    input,
    selected,
    matches,
    run,
    close,
    message,
    vimEnabled,
    vimMode,
    commandState,
    isEditorComposing,
    store,
    shortcuts,
    beforeOpen,
  ])

  useEffect(() => {
    if (!open) return
    inputRef.current?.focus({ preventScroll: true })
    const outside = (event: PointerEvent): void => {
      if (event.target instanceof Element && event.target.closest('.command-panel, .command-input-line')) return
      event.preventDefault()
      event.stopImmediatePropagation()
      if (event.button === 0) {
        // Only suppress this gesture's click. A canceled drag must not consume a later click.
        const gesture = new AbortController()
        const cancel = (): void => gesture.abort()
        document.addEventListener('pointerdown', cancel, { capture: true, once: true, signal: gesture.signal })
        document.addEventListener('pointercancel', cancel, { capture: true, once: true, signal: gesture.signal })
        window.addEventListener('blur', cancel, { once: true, signal: gesture.signal })
        document.addEventListener(
          'click',
          (click) => {
            click.preventDefault()
            click.stopImmediatePropagation()
            cancel()
          },
          { capture: true, once: true, signal: gesture.signal },
        )
      }
      close()
    }
    const focusout = (event: FocusEvent): void => {
      if (event.relatedTarget instanceof Element && event.relatedTarget.closest('.command-panel, .command-input-line'))
        return
      // Switching to another application blurs the input too; the panel stays open and regains focus on return.
      if (!document.hasFocus()) return
      close()
    }
    document.addEventListener('pointerdown', outside, true)
    inputRef.current?.addEventListener('blur', focusout)
    const inputElement = inputRef.current
    return () => {
      document.removeEventListener('pointerdown', outside, true)
      inputElement?.removeEventListener('blur', focusout)
    }
  }, [open, close])

  return {
    cycleAppearance,
    menuViewCommands,
    showAgenda,
    showTree,
    open,
    input,
    selected,
    message,
    bindInput,
    matches,
    total: commands.length,
    context: { alwaysOnTop, appearance, vimEnabled, lineNumbers, view, starred, marked },
    runFileCommand: (name: 'export-notes' | 'import-notes'): Promise<void> => {
      // The browser picker must be opened on the same trusted key event, without deferring.
      return run(
        menuCommands.getSnapshot().find((entry) => entry.name === name),
        'leader',
      )
    },
    changeInput: (value: string) => {
      setInput(value)
      setSelected(0)
    },
    run: (command: ApplicationCommand) => {
      void run(command)
    },
  }
}
