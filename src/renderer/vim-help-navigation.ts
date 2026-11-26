import type { KeyboardEvent } from 'react'
import type { EditorStore } from '../application/editor-store'
import { requireNode, type TreeNode } from '../domain/document'
import { handleRowTextKey } from './agenda-row-text-keys'
import type { RowCaret } from './agenda-row-caret'
import { visualLineCursor, visualTextGeometry } from './editor-dom'
import { appendVimCount, clearPending } from './vim-command-state'
import { firstNonWhitespace } from './vim-editing'
import { horizontalNavigation } from './vim-horizontal-navigation'
import { FOLD_COMMANDS, isNeutralKeydown } from './vim-keyboard-handler'
import type { VimViewportMotion } from './vim-keyboard-types'
import type { VimTextCommandState } from './vim-session-finish'
import { isTextMotion, parseCount, textMotion } from './vim-text-commands'
import { navigateVertically } from './vim-vertical-navigation'
import { viewportMotionTarget } from './vim-viewport-motion'
import type { ShortcutProfile } from './shortcut-profile'

const VIEWPORT_KEYS: Readonly<Record<string, VimViewportMotion>> = {
  H: 'top',
  M: 'middle',
  L: 'bottom',
  PageDown: 'half-down',
  PageUp: 'half-up',
}

interface KeyboardContext {
  event: KeyboardEvent<HTMLElement>
  store: EditorStore
  node: TreeNode
  caret: RowCaret
  vim: VimTextCommandState
  shortcuts: ShortcutProfile
  viewport: HTMLElement
  rowElement(id: string): HTMLElement | null
  place(caret: RowCaret): void
  copy(text: string): void
  openFind(): void
}

// Help uses the Tree motion algorithms and the same text commands as non-editable Agenda rows.
// It never dispatches a document edit or passes a key to the editable Tree handler.
export function navigateVimHelp({
  event,
  store,
  node,
  caret,
  vim,
  shortcuts,
  viewport,
  rowElement,
  place,
  copy,
  openFind,
}: KeyboardContext): void {
  const { key } = event
  if (isNeutralKeydown(key) || event.nativeEvent.isComposing || key === 'Tab') return
  const state = store.getSnapshot()
  if (state.status !== 'ready') return
  const commands = vim.commandState
  const pending = commands.pending
  const count = parseCount(pending?.count ?? '')
  const heading = state.location.currentParentId
  const rows = store.getVisibleRows().map(({ node }) => node)
  const displayed = heading === null ? rows : [requireNode(state.document, heading).node, ...rows]
  const normal = vim.mode === 'normal'
  const vertical = ['j', 'k', 'J', 'K', 'ArrowDown', 'ArrowUp'].includes(key)
  const viewportMotion = VIEWPORT_KEYS[key]
  const position = (id: string, cursor: number): void => place({ key: id, anchor: cursor, focus: cursor })
  const visit = (): void => {
    if (node.children.length > 0 && node.id !== heading) store.enter()
  }
  const viewportMove = (motion: Parameters<typeof viewportMotionTarget>[3]): void => {
    const bounds = viewport.getBoundingClientRect()
    const viewRows = rows.flatMap((row) => {
      const element = rowElement(row.id)
      if (element === null) return []
      const { top, bottom } = element.getBoundingClientRect()
      return [{ nodeId: row.id, top, bottom }]
    })
    const target = viewportMotionTarget(viewRows, bounds, node.id, motion, count)
    if (target !== undefined) position(target, firstNonWhitespace(requireNode(state.document, target).node.text))
  }

  if (event.altKey || (event.metaKey && !shortcuts.isPrimary(event))) return
  if (shortcuts.isPrimary(event) || event.ctrlKey) {
    const lower = key.toLowerCase()
    if (shortcuts.isPrimary(event) && lower === 'c' && document.getSelection()?.isCollapsed === false) return
    if (normal && event.ctrlKey && !event.metaKey && ['d', 'u', 'o'].includes(lower)) {
      event.preventDefault()
      clearPending(commands)
      if (pending !== undefined || event.shiftKey) return
      if (lower === 'o') store.leave()
      else viewportMove(lower === 'd' ? 'half-down' : 'half-up')
    } else if (shortcuts.isPrimary(event) && !event.shiftKey && ['.', ',', 'e'].includes(lower)) {
      event.preventDefault()
      clearPending(commands)
      vim.setMode('normal')
      if (lower === '.') visit()
      else if (lower === ',') store.leave()
      else store.applyFold('toggle', node.id)
    } else if (handleRowTextKey({ event, vim, shortcuts, text: node.text, caret, setCaret: place, copy })) {
      event.preventDefault()
    } else if (['v', 'x', 'z', 'backspace', 'enter', 'p'].includes(lower)) {
      // Do not give editing shortcuts or the primary-modifier Print shortcut to the browser.
      event.preventDefault()
      clearPending(commands)
    }
    return
  }

  event.preventDefault()
  if (key !== 'n' && key !== 'N') store.search.interruptNavigation()
  if (!vertical) commands.verticalGoal = undefined
  const textKey = (visualLine?: (offset: number, direction: 'up' | 'down', steps: number) => number): boolean =>
    handleRowTextKey({ event, vim, shortcuts, text: node.text, caret, setCaret: place, copy, visualLine })
  if (pending?.awaiting !== undefined) {
    textKey()
    return
  }
  if (pending?.prefix === 'z') {
    clearPending(commands)
    const fold = FOLD_COMMANDS[key]
    if (fold !== undefined) store.applyFold(fold, node.id)
    return
  }
  if (pending?.prefix === 'g') {
    if (key === 'e' && textKey()) return
    clearPending(commands)
    if (key === 'g') {
      const target = pending.count === '' ? displayed[0] : rows[Math.min(rows.length, count) - 1]
      if (target !== undefined) position(target.id, firstNonWhitespace(target.text))
    } else if (key === 'd') visit()
    return
  }
  if (appendVimCount(commands, key, 'agenda-row')) return
  if (pending?.operator !== undefined) {
    clearPending(commands)
    if (pending.operator !== 'y') return
    if (key === 'y') copy(node.text)
    else if (isTextMotion(key)) {
      const range = textMotion(node.text, caret.focus, key, count)
      if (range !== undefined && range.end > range.start) copy(node.text.slice(range.start, range.end))
    }
    return
  }
  if (key === '/') {
    vim.setMode('normal')
    openFind()
  } else if (key === 'n' || key === 'N') {
    clearPending(commands)
    vim.setMode('normal')
    store.search.navigate(store.searchOrigin(caret.focus), key === 'n' ? 1 : -1, count)
  } else if (key === 'g' || (normal && key === 'z')) {
    commands.pending = { prefix: key, count: key === 'z' ? '' : (pending?.count ?? ''), motionCount: '' }
  } else if (normal && ['d', 'c', 'y'].includes(key)) {
    commands.pending = { operator: key as 'd' | 'c' | 'y', count: pending?.count ?? '', motionCount: '' }
  } else if (normal && key === 'Y') {
    clearPending(commands)
    copy(node.text.slice(caret.focus))
  } else if (normal && (viewportMotion !== undefined || ['G', 'Enter', 'Home', 'End'].includes(key))) {
    clearPending(commands)
    if (viewportMotion !== undefined) viewportMove(viewportMotion)
    else if (key === 'G') {
      const target = pending?.count ? rows[Math.min(rows.length, count) - 1] : displayed.at(-1)
      if (target !== undefined) position(target.id, firstNonWhitespace(target.text))
    } else if (key === 'Enter') visit()
    else if (key === 'Home' || key === 'End') {
      const range = textMotion(node.text, caret.focus, key === 'Home' ? '0' : '$', 1)
      if (range !== undefined) position(node.id, range.target)
    }
  } else if (normal && ['h', 'l', 'ArrowLeft', 'ArrowRight'].includes(key)) {
    clearPending(commands)
    const left = key === 'h' || key === 'ArrowLeft'
    const target = horizontalNavigation({
      node,
      caret: { cursor: caret.focus, imageActive: false },
      direction: left ? 'left' : 'right',
      count,
      adjacent: (row) => displayed[displayed.findIndex(({ id }) => id === row.id) + (left ? -1 : 1)],
    })
    position(target.node.id, target.caret.cursor)
  } else if (vertical) {
    const direction = key.toLowerCase() === 'k' || key === 'ArrowUp' ? 'up' : 'down'
    const distances = new Map<string, ReturnType<typeof visualTextGeometry>>()
    const geometry = (id: string): ReturnType<typeof visualTextGeometry> | undefined => {
      const previous = distances.get(id)
      if (previous !== undefined) return previous
      const row = rowElement(id)
      if (row === null) return undefined
      const measured = visualTextGeometry(row)
      distances.set(id, measured)
      return measured
    }
    const width = viewport.clientWidth
    const previous = commands.verticalGoal
    const left =
      previous?.nodeId === node.id && previous.cursor === caret.focus && previous.viewportWidth === width
        ? previous.left
        : (geometry(node.id)?.position(caret.focus).left ?? 0)
    const line = (row: TreeNode, offset: number, entering = false): number | undefined => {
      const measured = geometry(row.id)
      return measured === undefined
        ? undefined
        : visualLineCursor(row.text, measured.position, offset, direction, left, entering)
    }
    const rememberColumn = (id: string, cursor: number): void => {
      const latest = store.getSnapshot()
      if (latest.status !== 'ready') return
      commands.verticalGoal = {
        nodeId: id,
        cursor,
        left,
        viewportWidth: width,
        focusToken: latest.focus.token,
        text: requireNode(latest.document, id).node.text,
      }
    }
    try {
      if (normal) {
        clearPending(commands)
        navigateVertically({
          store,
          node,
          caret: { cursor: caret.focus, imageActive: false },
          direction,
          count: count * (key === 'J' || key === 'K' ? 10 : 1),
          textLineCursor: line,
          applyCaretState: (id, next) => {
            rememberColumn(id, next.cursor)
            position(id, next.cursor)
          },
        })
      } else {
        textKey((offset, _direction, steps) => {
          while (steps-- > 0) {
            const next = line(node, offset)
            if (next === undefined) break
            offset = next
          }
          rememberColumn(node.id, offset)
          return offset
        })
      }
    } finally {
      for (const measured of distances.values()) measured.dispose()
    }
  } else if (!textKey()) clearPending(commands)
}
