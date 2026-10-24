import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { emptyMenuCommands, type MenuCommandSource } from '../application/menu-commands'
import {
  availableCommands,
  matchCommands,
  normalizeCommandHistory,
  rememberCommand,
  type ApplicationCommand,
  type CommandAppearance,
} from '../application/command-registry'
import type { EditorStore } from '../application/editor-store'
import type { VimMode } from './vim-editing'
import type { VimCommandState } from './vim-command-state'
import { clearPending } from './vim-command-state'
import { moveSuggestionIndex } from './completion-controller'
import { getCaret } from './editor-dom'
import { APPLE_SHORTCUTS, type ShortcutProfile } from './shortcut-profile'

export function useCommandPanel(options: {
  store: EditorStore
  vimEnabled: boolean
  vimAvailable?: boolean
  alwaysOnTopAvailable?: boolean
  vimMode: VimMode
  commandState: VimCommandState
  alwaysOnTop: boolean
  setAlwaysOnTop(value: boolean): void
  applyVimEnabled(value: boolean): Promise<void>
  beforeViewChange(): void
  beforeOpen?: () => void
  shortcuts?: ShortcutProfile
  menuCommands?: MenuCommandSource | undefined
}) {
  const { store, vimEnabled, vimMode, commandState, alwaysOnTop, setAlwaysOnTop, applyVimEnabled, beforeViewChange } =
    options
  const shortcuts = options.shortcuts ?? APPLE_SHORTCUTS
  const beforeOpen = options.beforeOpen
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
  const restore = useRef<() => void>(() => undefined)
  const inputRef = useRef<HTMLInputElement>(null)
  const bindInput = useCallback((element: HTMLInputElement | null): void => {
    inputRef.current = element
  }, [])
  const running = useRef(false)
  const snapshot = store.getSnapshot()
  const view: 'agenda' | 'tree' = snapshot.status === 'ready' && snapshot.agenda !== undefined ? 'agenda' : 'tree'
  const commands = useMemo(
    () =>
      [...availableCommands({ vim: vimAvailable, alwaysOnTop: alwaysOnTopAvailable }), ...menuEntries].sort((a, b) =>
        a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
      ),
    [vimAvailable, alwaysOnTopAvailable, menuEntries],
  )
  const matches = useMemo(() => matchCommands(input, history, commands), [input, history, commands])
  useEffect(() => {
    if (message === undefined) return
    const timer = window.setTimeout(() => setMessage(undefined), 2000)
    return () => window.clearTimeout(timer)
  }, [message])
  useEffect(() => {
    void window.treeApi
      .getAppearance()
      .then(setAppearance)
      .catch((error: unknown) => store.reportError(error))
    void window.treeApi
      .getCommandHistory()
      .then((value) => setHistory(normalizeCommandHistory(value)))
      .catch((error: unknown) => store.reportError(error))
    return window.treeApi.onAppearanceChanged?.(setAppearance)
  }, [store])

  const close = useCallback(() => {
    setOpen(false)
    restore.current()
  }, [])

  const run = useCallback(
    async (command: ApplicationCommand | undefined) => {
      if (running.current) return
      if (command?.enabled === false) return
      if (menuEntries.includes(command!)) {
        const current = menuCommands.getSnapshot().find((entry) => entry.name === command?.name)
        if (current === undefined || current.enabled === false) return
        command = current
      }
      close()
      if (command === undefined) {
        setMessage(`Not a command: ${input.trim()}`)
        return
      }
      running.current = true
      try {
        await command.run(
          {
            quit: () => window.treeApi.quit(),
            setVimEnabled: applyVimEnabled,
            showAgenda: async () => {
              if (view === 'agenda') return
              beforeViewChange()
              const active = document.activeElement
              store.openAgenda(
                active instanceof HTMLElement && active.matches('.node-input') ? getCaret(active) : undefined,
              )
            },
            showTree: async () => {
              if (view === 'tree') return
              beforeViewChange()
              store.closeAgenda()
            },
            setAlwaysOnTop: async (value) => {
              await window.treeApi.setAlwaysOnTop(value)
              setAlwaysOnTop(value)
            },
            setAppearance: async (value) => {
              await window.treeApi.setAppearance(value)
              setAppearance(value)
            },
          },
          { alwaysOnTop, appearance, vimEnabled, view },
        )
        if (command.name !== 'quit') {
          const next = rememberCommand(history, command.name)
          setHistory(next)
          await window.treeApi.setCommandHistory(next)
        }
      } catch (error) {
        store.reportError(error)
      } finally {
        running.current = false
      }
    },
    [
      close,
      input,
      alwaysOnTop,
      appearance,
      history,
      store,
      setAlwaysOnTop,
      applyVimEnabled,
      vimEnabled,
      view,
      beforeViewChange,
      menuCommands,
      menuEntries,
    ],
  )

  useEffect(() => {
    const keydown = (event: KeyboardEvent): void => {
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
        !(target instanceof Element && target.closest('.search-input-line'))
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
      const active = document.activeElement
      const selection = window.getSelection()
      const endpoints =
        selection?.anchorNode && selection.focusNode
          ? {
              anchor: selection.anchorNode,
              anchorOffset: selection.anchorOffset,
              focus: selection.focusNode,
              focusOffset: selection.focusOffset,
            }
          : undefined
      const start = active instanceof HTMLTextAreaElement ? active.selectionStart : undefined
      const end = active instanceof HTMLTextAreaElement ? active.selectionEnd : undefined
      const direction = active instanceof HTMLTextAreaElement ? active.selectionDirection : undefined
      restore.current = () => {
        if (!(active instanceof HTMLElement) || !active.isConnected) return
        active.focus({ preventScroll: true })
        if (active instanceof HTMLTextAreaElement && start !== undefined && end !== undefined)
          active.setSelectionRange(start, end, direction)
        else if (endpoints?.anchor.isConnected && endpoints.focus.isConnected) {
          selection?.setBaseAndExtent(endpoints.anchor, endpoints.anchorOffset, endpoints.focus, endpoints.focusOffset)
        }
      }
      setInput('')
      setSelected(0)
      setOpen(true)
    }
    document.addEventListener('keydown', keydown, true)
    return () => document.removeEventListener('keydown', keydown, true)
  }, [
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
      close()
    }
    window.addEventListener('blur', close)
    document.addEventListener('pointerdown', outside, true)
    inputRef.current?.addEventListener('blur', focusout)
    const inputElement = inputRef.current
    return () => {
      window.removeEventListener('blur', close)
      document.removeEventListener('pointerdown', outside, true)
      inputElement?.removeEventListener('blur', focusout)
    }
  }, [open, close])

  return {
    open,
    input,
    selected,
    message,
    bindInput,
    matches,
    total: commands.length,
    context: { alwaysOnTop, appearance, vimEnabled, view },
    changeInput: (value: string) => {
      setInput(value)
      setSelected(0)
    },
    run: (command: ApplicationCommand) => {
      void run(command)
    },
  }
}
