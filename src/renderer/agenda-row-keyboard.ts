import type { KeyboardEvent } from 'react'
import { focusedAgendaDay } from '../application/agenda-state'
import type { EditorStore } from '../application/editor-store'
import { appendVimCount, clearCommandAssembly, clearPending } from './vim-command-state'
import type { VimTextCommandState } from './vim-session-finish'
import { viewportBounds, viewportScrollEdges, viewportScroller } from './scroll-viewport'
import { contextViewport, viewportMotionTarget } from './vim-viewport-motion'
import { getCaret, visualLineCursor } from './editor-dom'
import { measureAgendaRow, type AgendaTextGeometry } from './agenda-text-geometry'
import type { AgendaRow } from '../application/agenda-rows'
import { handleRowTextKey, rowCaretMode } from './agenda-row-text-keys'
import { arrivalCaret, clampCaret, type RowCaret } from './agenda-row-caret'
import { requireNode } from '../domain/document'
import { agendaRowLabel } from './agenda-labels'
import { firstNonWhitespace } from './vim-editing'
import { focusCaretTransition, verticalCaretTransition, type VimCaretState } from './vim-caret-transition'
import { horizontalNavigation } from './vim-horizontal-navigation'
import { parseCount } from './vim-text-commands'
import { APPLE_SHORTCUTS, isMappedPrimaryKey, isVimCtrlKey, type ShortcutProfile } from './shortcut-profile'

/** The text and caret of the selected row when it has no editor, owned by the Agenda view. */
export interface AgendaRowText {
  textOf: (row: AgendaRow) => string
  /** A row with an editor keeps its text commands in the editor; focus on its padding stays inert. */
  hasEditor: (row: AgendaRow) => boolean
  caret: () => RowCaret
  setCaret: (caret: RowCaret, revealLine?: boolean) => void
  copy: (text: string) => void
}

interface Dependencies {
  store: EditorStore
  vim?: VimTextCommandState | undefined
  beforeSelect?: ((preserveViewport: boolean) => void) | undefined
  rowText?: AgendaRowText | undefined
  /** The platform's primary-modifier profile; Apple conventions when absent. */
  shortcuts?: ShortcutProfile | undefined
  measureRow?: typeof measureAgendaRow
}

/** Navigation over occurrence keys; Tree text and structural handlers never see these keys. */
export function createAgendaKeyDownHandler({
  store,
  vim,
  beforeSelect,
  rowText,
  shortcuts = APPLE_SHORTCUTS,
  measureRow = measureAgendaRow,
}: Dependencies): (event: KeyboardEvent<HTMLElement>) => void {
  return (event) => {
    if (event.nativeEvent?.isComposing || ['Shift', 'Control', 'Meta', 'Alt'].includes(event.key)) return
    // Meta is only ever the primary modifier (Cmd); where it is not, the combination has no command.
    if (event.metaKey && !shortcuts.isPrimary(event)) return
    const state = store.getSnapshot()
    if (state.status !== 'ready' || state.agenda === undefined) return
    const rows = store.getAgendaRows()
    const index = rows.findIndex((row) => row.key === state.agenda!.selectedKey)
    const row = rows[index]
    if (row === undefined) return
    const countDigit = /^[1-9]$/u.test(event.key) || (event.key === '0' && !!vim?.commandState.pending?.count)
    const verticalKey = ['j', 'k', 'J', 'K', 'ArrowDown', 'ArrowUp'].includes(event.key)
    if (vim !== undefined && !verticalKey && !countDigit) vim.commandState.verticalGoal = undefined
    if (!countDigit && event.key !== 'n' && event.key !== 'N') store.search.interruptNavigation()
    const finishClickReplace = (): void => {
      if (vim?.mode === 'replace') vim.setMode('normal')
    }
    const textOf = (candidate: AgendaRow): string =>
      candidate.kind === 'node'
        ? requireNode(state.document, candidate.nodeId).node.text
        : agendaRowLabel(
            candidate,
            state.agenda!.today,
            candidate.kind === 'day' && focusedAgendaDay(state.agenda) !== undefined,
          )
    const hasImage = (candidate: AgendaRow): boolean =>
      candidate.kind === 'node' &&
      candidate.role === 'match' &&
      requireNode(state.document, candidate.nodeId).node.attachment !== undefined
    const sourceCursor = (): number =>
      event.currentTarget?.classList.contains('node-input')
        ? getCaret(event.currentTarget)
        : clampCaret(
            rowText?.caret() ?? {
              key: row.key,
              anchor: state.agenda!.selectionCursor ?? 0,
              focus: state.agenda!.selectionCursor ?? 0,
            },
            textOf(row),
            rowCaretMode(vim),
          ).focus
    const select = (target: number, preserveViewport = false, cursor = sourceCursor(), explicit = false): void => {
      const destination = rows[Math.max(0, Math.min(rows.length - 1, target))]!
      if (destination.key === row.key && !explicit) return
      if (destination.key === row.key && rowText !== undefined && !rowText.hasEditor(destination)) {
        rowText.setCaret(
          clampCaret({ key: destination.key, anchor: cursor, focus: cursor }, textOf(destination), rowCaretMode(vim)),
        )
        return
      }
      beforeSelect?.(preserveViewport)
      store.applyAgenda({
        kind: 'select',
        key: destination.key,
        cursor,
      })
    }
    const vertical = (direction: 'up' | 'down', count: number): void => {
      if (vim?.mode !== 'normal') {
        select(index + (direction === 'down' ? count : -count))
        return
      }
      let current = row
      let position = index
      let navigationCursor = sourceCursor()
      let caret: VimCaretState =
        current.kind === 'node' && current.role === 'match' && vim.getCaretState !== undefined
          ? vim.getCaretState(
              current.nodeId,
              navigationCursor,
              event.currentTarget?.classList.contains('node-input-image-caret') ?? false,
            )
          : { cursor: navigationCursor, imageActive: false }
      let measuredKey: string | undefined
      let measuredRow: AgendaTextGeometry | undefined
      const geometry = (candidate: AgendaRow): AgendaTextGeometry | undefined => {
        if (measuredKey !== candidate.key) {
          // Counted motion visits rows in one direction; old DOM mirrors must not accumulate.
          measuredRow?.dispose()
          measuredRow = undefined
          measuredKey = candidate.key
          measuredRow = measureRow(
            candidate,
            textOf(candidate),
            focusedAgendaDay(state.agenda) !== undefined,
            candidate.kind === 'node' ? requireNode(state.document, candidate.nodeId).node : undefined,
            state.agenda!.today,
          )
        }
        return measuredRow
      }
      const viewportWidth = document.documentElement.clientWidth
      const previousGoal = vim.commandState.verticalGoal
      let preferredLeft =
        previousGoal?.agendaKey === row.key &&
        previousGoal.cursor === caret.cursor &&
        previousGoal.text === textOf(row) &&
        previousGoal.viewportWidth === viewportWidth &&
        previousGoal.focusToken === state.focus.token
          ? previousGoal.left
          : (geometry(row)?.position(caret.cursor).left ?? 0)
      const publishCaret = (candidate: AgendaRow, next: VimCaretState, fromFocus = false): void => {
        if (candidate.kind === 'node' && candidate.role === 'match' && (rowText?.hasEditor(candidate) ?? true))
          vim.applyCaretState?.(candidate.nodeId, next, fromFocus)
        else rowText?.setCaret({ key: candidate.key, anchor: next.cursor, focus: next.cursor }, true)
        const snapshot = store.getSnapshot()
        if (snapshot.status !== 'ready') return
        vim.commandState.verticalGoal = {
          nodeId: candidate.kind === 'node' ? candidate.nodeId : snapshot.location.selectedNodeId,
          agendaKey: candidate.key,
          cursor: next.cursor,
          left: preferredLeft,
          viewportWidth,
          text: textOf(candidate),
          focusToken: snapshot.focus.token,
        }
      }
      try {
        for (let stepIndex = 0; stepIndex < count; stepIndex += 1) {
          if (!caret.imageActive) {
            const measured = geometry(current)
            const lineCursor =
              measured === undefined
                ? undefined
                : visualLineCursor(textOf(current), measured.position, caret.cursor, direction, preferredLeft)
            if (lineCursor !== undefined) {
              caret = { cursor: lineCursor, imageActive: false }
              navigationCursor = lineCursor
              publishCaret(current, caret)
              continue
            }
          }
          const nextIndex = Math.max(0, Math.min(rows.length - 1, position + (direction === 'down' ? 1 : -1)))
          const step = verticalCaretTransition(
            caret,
            direction,
            textOf(current).length,
            current.key === row.key && hasImage(current),
            nextIndex !== position,
          )
          if (!step.crossNode) {
            if (step.caret === caret) break
            caret = step.caret
            navigationCursor = caret.cursor
            publishCaret(current, caret)
            continue
          }
          const cursor = stepIndex === 0 ? step.focusCursor : navigationCursor
          const leftImage = caret.imageActive
          if (stepIndex === 0 && direction === 'down' && caret.imageActive) navigationCursor = 0
          current = rows[nextIndex]!
          position = nextIndex
          caret = focusCaretTransition(
            caret,
            cursor,
            textOf(current).length,
            hasImage(current),
            true,
            direction === 'up' && hasImage(current),
          )
          if (textOf(current).length > 0 && !(leftImage && stepIndex > 0 && direction === 'down')) {
            if (direction === 'down' && leftImage) preferredLeft = 0
            const measured = geometry(current)
            const entering =
              measured === undefined
                ? undefined
                : visualLineCursor(textOf(current), measured.position, caret.cursor, direction, preferredLeft, true)
            if (entering !== undefined)
              caret = caret.imageActive
                ? { ...caret, imageTextReturnCursor: entering }
                : { cursor: entering, imageActive: false }
          }
          if (leftImage && !caret.imageActive)
            preferredLeft = geometry(current)?.position(caret.cursor).left ?? preferredLeft
          beforeSelect?.(false)
          store.applyAgenda({ kind: 'select', key: current.key, cursor: caret.cursor, revealLine: true })
          publishCaret(current, caret, true)
        }
      } finally {
        measuredRow?.dispose()
      }
      if (current.kind === 'node' && current.role === 'match' && (rowText?.hasEditor(current) ?? true))
        vim.revealVerticalCaret?.()
    }
    const horizontal = (direction: 'left' | 'right', count: number): void => {
      let position = index
      const item = (candidate: AgendaRow) => ({
        row: candidate,
        text: textOf(candidate),
        attachment:
          hasImage(candidate) && candidate.kind === 'node'
            ? requireNode(state.document, candidate.nodeId).node.attachment
            : undefined,
      })
      const cursor = sourceCursor()
      const caret =
        row.kind === 'node' && row.role === 'match'
          ? vim?.getCaretState?.(
              row.nodeId,
              cursor,
              event.currentTarget?.classList.contains('node-input-image-caret') ?? false,
            )
          : undefined
      const next = horizontalNavigation({
        node: item(row),
        caret: caret ?? { cursor, imageActive: hasImage(row) && cursor === textOf(row).length },
        direction,
        count,
        adjacent: () => {
          position += direction === 'left' ? -1 : 1
          const candidate = rows[position]
          return candidate === undefined ? undefined : item(candidate)
        },
      })
      const destination = next.node.row
      const crossed = destination.key !== row.key
      if (crossed) {
        beforeSelect?.(false)
        store.applyAgenda({ kind: 'select', key: destination.key, cursor: next.caret.cursor })
      }
      if (destination.kind === 'node' && destination.role === 'match') {
        vim?.applyCaretState?.(destination.nodeId, next.caret, crossed)
      } else {
        if (row.kind === 'node' && row.role === 'match')
          vim?.applyCaretState?.(row.nodeId, { cursor, imageActive: false }, false, 'preserve-selection')
        rowText?.setCaret({ key: destination.key, anchor: next.caret.cursor, focus: next.caret.cursor })
      }
    }
    const viewportMotion = (motion: 'top' | 'middle' | 'bottom' | 'half-down' | 'half-up', count: number): void => {
      const bounds = viewportBounds()
      const mounted = [...document.querySelectorAll<HTMLElement>('.agenda-row')]
        .map((element) => {
          const rect = element.getBoundingClientRect()
          return { nodeId: element.dataset.agendaKey, top: rect.top, bottom: rect.bottom }
        })
        .sort((left, right) => left.top - right.top)
      const lineMotion = motion === 'top' || motion === 'middle' || motion === 'bottom'
      const inner = lineMotion ? contextViewport(bounds, viewportScrollEdges()) : bounds
      const choice = mounted.some((candidate) => candidate.top >= inner.top && candidate.bottom <= inner.bottom)
        ? inner
        : bounds
      const key = viewportMotionTarget(mounted, choice, row.key, motion, count)
      if (key !== undefined) {
        const destination = rows.find((candidate) => candidate.key === key)!
        select(
          rows.findIndex((candidate) => candidate.key === key),
          lineMotion,
          firstNonWhitespace(textOf(destination)),
          true,
        )
      }
    }
    if (
      vim?.mode === 'normal' &&
      event.ctrlKey &&
      !event.metaKey &&
      !event.altKey &&
      ['a', 'x'].includes(event.key.toLowerCase()) &&
      !rowText?.hasEditor(row)
    ) {
      event.preventDefault()
      clearPending(vim.commandState)
      return
    }
    const rowTextKey = (): boolean =>
      rowText !== undefined &&
      !rowText.hasEditor(row) &&
      handleRowTextKey({
        event,
        vim,
        text: rowText.textOf(row),
        caret: rowText.caret(),
        setCaret: rowText.setCaret,
        copy: rowText.copy,
        shortcuts,
      })
    // Ctrl+D/U/O/R stay Vim commands where Ctrl is the primary modifier; the app has no such Cmd shortcut.
    const vimCtrl = event.ctrlKey && !event.metaKey && !event.altKey && isVimCtrlKey(event.key)
    if (shortcuts.isPrimary(event) && !vimCtrl) {
      if (rowTextKey()) {
        event.preventDefault()
        if (vim !== undefined) clearCommandAssembly(vim.commandState)
      } else if (event.key.toLowerCase() === 'p' && !event.shiftKey && !event.altKey) {
        event.preventDefault()
        if (vim !== undefined) clearCommandAssembly(vim.commandState)
        finishClickReplace()
        store.closeAgenda()
      } else if (event.key === '.') {
        event.preventDefault()
        if (vim !== undefined) clearCommandAssembly(vim.commandState)
        finishClickReplace()
        if (row.kind === 'node') {
          store.closeAgenda()
          store.selectNode(row.nodeId, 0)
          store.enter()
        } else if (row.kind === 'day') {
          beforeSelect?.(false)
          // The row key survives the change of presentation, but its text does not.
          rowText?.setCaret(arrivalCaret(row.key))
          store.applyAgenda({ kind: 'focus-day', key: row.key, scrollTop: viewportScroller()?.scrollTop ?? 0 })
        }
      } else if (event.key === ',') {
        event.preventDefault()
        if (vim !== undefined) clearCommandAssembly(vim.commandState)
        if (focusedAgendaDay(state.agenda) !== undefined) finishClickReplace()
        beforeSelect?.(true)
        rowText?.setCaret(arrivalCaret(row.key))
        store.applyAgenda({ kind: 'return-timeline', key: row.key })
      } else if (event.key.toLowerCase() === 'e' && !event.shiftKey && !event.altKey) {
        event.preventDefault()
        if (vim !== undefined) clearCommandAssembly(vim.commandState)
        beforeSelect?.(false)
        store.applyAgenda({ kind: 'toggle-fold', key: row.key })
      } else if (event.key.toLowerCase() === 'z') {
        event.preventDefault()
        if (vim !== undefined) clearCommandAssembly(vim.commandState)
        finishClickReplace()
        if (event.shiftKey) store.redo()
        else store.undo()
      } else if (['backspace', 'enter', ',', 'x', 'v', 'e'].includes(event.key.toLowerCase())) {
        event.preventDefault()
        if (vim !== undefined) clearCommandAssembly(vim.commandState)
      } else if (
        shortcuts.platform === 'other' &&
        vim !== undefined &&
        vim.mode !== 'insert' &&
        !isMappedPrimaryKey(event.key)
      ) {
        // Unmapped Ctrl combinations stay blocked in the non-Insert Vim modes (PRODUCT §1.5).
        event.preventDefault()
        clearCommandAssembly(vim.commandState)
      }
      return
    }
    event.preventDefault()
    if (event.key === 'Escape') {
      if (vim?.mode === 'normal' && store.search.session.getSnapshot().visible) store.hideSearch()
      if (rowText !== undefined && vim?.mode === 'visual') {
        // Leaving Visual keeps its active endpoint, as in Tree.
        const caret = rowText.caret()
        rowText.setCaret({ ...caret, anchor: caret.focus, focus: caret.focus })
      }
      if (vim !== undefined) {
        clearCommandAssembly(vim.commandState)
        vim.setMode('normal')
      }
      return
    }
    const pending = vim?.commandState.pending
    const count =
      verticalKey && vim?.mode === 'normal'
        ? parseCount(pending?.count ?? '')
        : Math.min(rows.length, Math.max(1, Number(pending?.count || '1')))
    const normal = vim?.mode === 'normal'
    // Counts and the `g` prefix also serve the text motions of a Visual selection over a row's text.
    const textMode = normal || vim?.mode === 'visual'
    // The character after `f`, `F`, `t`, `T` or `r` is data, never a count or a prefix.
    if (pending?.awaiting !== undefined && rowTextKey()) return
    if (
      normal &&
      !event.ctrlKey &&
      !event.altKey &&
      pending?.operator === undefined &&
      pending?.prefix === undefined &&
      ['/', 'n', 'N'].includes(event.key)
    ) {
      const origin =
        row.kind === 'node'
          ? { nodeId: row.nodeId, day: row.day, offset: sourceCursor() }
          : { beforeDay: row.day, offset: 0 }
      clearCommandAssembly(vim.commandState)
      if (event.key === '/') store.search.begin(origin)
      else store.search.navigate(origin, event.key === 'n' ? 1 : -1, Math.max(1, Number(pending?.count || '1')))
      return
    }
    if (textMode && !event.ctrlKey && !event.altKey && appendVimCount(vim.commandState, event.key, 'agenda-row')) return
    if (textMode && !event.ctrlKey && !event.altKey && event.key === 'g' && pending?.prefix === undefined) {
      vim.commandState.pending = { count: pending?.count ?? '', motionCount: '', prefix: 'g' }
      return
    }
    if (normal && !event.ctrlKey && !event.altKey && event.key === 'z' && pending?.prefix === undefined) {
      vim.commandState.pending = { count: '', motionCount: '', prefix: 'z' }
      return
    }
    if (normal && !event.ctrlKey && !event.altKey && pending?.prefix === undefined) {
      if (event.key === 'd') {
        if (pending?.operator === 'd') {
          clearPending(vim.commandState)
        } else vim.commandState.pending = { count: pending?.count ?? '', motionCount: '', operator: 'd' }
        return
      }
      // Consume unsupported operator sequences as one command; their j/k suffix is not navigation.
      if (pending?.operator !== undefined) {
        clearPending(vim.commandState)
        return
      }
      if (event.key === 'c' || event.key === 'y') {
        vim.commandState.pending = { count: pending?.count ?? '', motionCount: '', operator: event.key }
        return
      }
      // Read-only row text never accepts a put.
      if ((event.key === 'p' || event.key === 'P') && pending?.operator === undefined) {
        clearPending(vim.commandState)
        return
      }
    }
    if (
      normal &&
      !event.ctrlKey &&
      !event.altKey &&
      pending?.prefix === undefined &&
      pending?.operator === undefined &&
      pending?.awaiting === undefined &&
      (event.key === 'h' || event.key === 'l') &&
      (rowText === undefined || !rowText.hasEditor(row) || event.currentTarget?.classList.contains('node-input'))
    ) {
      clearPending(vim.commandState)
      horizontal(event.key === 'h' ? 'left' : 'right', parseCount(pending?.count ?? ''))
      return
    }
    if (rowTextKey()) return
    if (vim !== undefined) clearPending(vim.commandState)
    if (event.altKey) return
    if (normal && !event.ctrlKey && pending?.prefix === 'z') {
      beforeSelect?.(false)
      const operations = {
        c: 'close',
        o: 'open',
        a: 'toggle',
        C: 'close-recursive',
        O: 'open-recursive',
        M: 'close-all',
        R: 'open-all',
      } as const
      const operation = operations[event.key as keyof typeof operations]
      if (operation !== undefined) store.applyAgenda({ kind: 'fold', key: row.key, operation })
      return
    }
    if (event.ctrlKey) {
      if (!normal || pending?.prefix !== undefined) return
      if (event.key === 'o') {
        beforeSelect?.(true)
        rowText?.setCaret(arrivalCaret(row.key))
        store.applyAgenda({ kind: 'return-timeline', key: row.key })
        return
      }
      if (event.key === 'r') {
        store.redo()
        return
      }
      if (!['d', 'u'].includes(event.key)) return
      viewportMotion(event.key === 'd' ? 'half-down' : 'half-up', count)
      return
    }
    if (normal && event.key === 'd' && pending?.prefix === 'g') {
      if (row.kind === 'day') {
        beforeSelect?.(false)
        rowText?.setCaret(arrivalCaret(row.key))
        store.applyAgenda({ kind: 'focus-day', key: row.key, scrollTop: viewportScroller()?.scrollTop ?? 0 })
      } else if (row.kind === 'node') {
        store.closeAgenda()
        store.selectNode(row.nodeId, 0)
        store.enter()
      }
    } else if (normal && event.key === 'u' && pending?.prefix === undefined) store.undo()
    else if (event.key === 'ArrowDown' || (normal && ['j', 'J'].includes(event.key) && pending?.prefix === undefined)) {
      finishClickReplace()
      vertical('down', count * (event.key === 'J' ? 10 : 1))
    } else if (event.key === 'ArrowUp' || (normal && ['k', 'K'].includes(event.key) && pending?.prefix === undefined)) {
      finishClickReplace()
      vertical('up', count * (event.key === 'K' ? 10 : 1))
    } else if (normal && event.key === 'g' && pending?.prefix === 'g') {
      const target = Math.min(rows.length - 1, count - 1)
      select(target, false, firstNonWhitespace(textOf(rows[target]!)), true)
    } else if (normal && event.key === 'G' && pending?.prefix === undefined) {
      const target = Math.max(0, Math.min(rows.length - 1, pending?.count ? count - 1 : rows.length - 1))
      select(target, false, firstNonWhitespace(textOf(rows[target]!)), true)
    } else if (normal && ['H', 'M', 'L'].includes(event.key) && pending?.prefix === undefined) {
      viewportMotion(event.key === 'H' ? 'top' : event.key === 'M' ? 'middle' : 'bottom', count)
    }
  }
}
