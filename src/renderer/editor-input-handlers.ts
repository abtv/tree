import type { KeyboardEvent } from 'react'
import type { EditorStore, NodeForest, NodeVisualCommand } from '../application/editor-store'
import type { TreeNode } from '../domain/document'
import { cloneNode } from '../domain/document'
import { getCaret, getSelectionRange, selectAll, setCaret, setNormalCaret, setSelectionRange } from './editor-dom'
import type { EditorContextMenuCommand } from '../shared/ipc'
import {
  currentWordEnd,
  findCharacter,
  firstNonWhitespace,
  moveWORDBackward,
  moveWORDEnd,
  moveWORDForward,
  moveWordBackward,
  moveWordEnd,
  moveWordEndBackward,
  moveWordForward,
  textObjectRange,
  type VimMode,
  vimPastePosition,
} from './vim-editing'

export type VimTextChange =
  | {
      kind: 'delete' | 'change' | 'yank'
      motion: string
      count: number
      insertedText?: string
      insertOffset?: number
      deleteCount?: number
    }
  | { kind: 'replace'; count: number; character: string }
  | { kind: 'substitute'; count: number; insertedText?: string; insertOffset?: number; deleteCount?: number }
  | {
      kind: 'insert'
      entry: 'i' | 'a' | 'I' | 'A'
      insertedText?: string
      insertOffset?: number
      deleteCount?: number
    }
  | { kind: 'paste'; after: boolean; text: string }
  | { kind: 'overwrite'; text: string; replaced: number }
  | { kind: 'case'; mode: 'toggle' | 'lower' | 'upper'; count: number }

export type VimStructuralChange =
  | { kind: 'structural-delete' }
  | { kind: 'structural-put'; position: 'before' | 'after'; source: TreeNode; sourceIds: readonly string[] }
  | { kind: 'structural-forest-put'; position: 'before' | 'after'; source: NodeForest }
  | { kind: 'structural-open'; position: 'before' | 'after'; text: string }
  | {
      kind: 'structural-visual'
      command: Exclude<NodeVisualCommand, 'y'>
      span: number
      source?: NodeForest
      text?: string
    }

export type VimRepeatChange = VimTextChange | VimStructuralChange

export interface VimFindCommand {
  kind: 'f' | 'F' | 't' | 'T'
  character: string
}

export interface VimPendingCommand {
  count: string
  operator?: 'd' | 'y' | 'c'
  motionCount: string
  awaiting?: 'f' | 'F' | 't' | 'T' | 'r'
  prefix?: 'g' | 'i' | 'a'
}

export interface VimKeyboardState {
  mode: VimMode
  register: { current: VimRegister }
  pending: { current: VimPendingCommand | undefined }
  lastChange?: { current: VimRepeatChange | undefined }
  lastFind: { current: VimFindCommand | undefined }
  beginInsert?: (nodeId: string, baseline: string, position: number, change: VimTextChange) => void
  finishInsert?: (input: HTMLElement) => void
  beginReplace?: (nodeId: string, input: HTMLElement, baseline: string, position: number) => void
  handleReplaceKey?: (input: HTMLElement, key: string) => boolean
  finishReplace?: (input: HTMLElement) => boolean
  visualAnchor: { current: number | undefined }
  visualFocus: { current: number | undefined }
  moveBoundary: (boundary: 'first' | 'last', cursor: number) => void
  moveViewport: (nodeId: string, motion: VimViewportMotion, cursor: number) => void
  setMode: (mode: VimMode) => void
  scheduleCaret: (input: HTMLElement, cursor: number) => void
  nodeVisual?: {
    enter: (nodeId: string) => boolean
    move: (direction: 'up' | 'down' | 'first' | 'last') => void
    swap: () => void
    exit: () => void
    command: (command: NodeVisualCommand) => void
  }
  beginStructuralOpen?: (position: 'before' | 'after') => void
  repeatStructural?: (change: VimStructuralChange) => void
}

export type VimViewportMotion = 'top' | 'middle' | 'bottom' | 'half-up' | 'half-down'

export type VimRegister =
  | { kind: 'empty' }
  | { kind: 'text'; value: string }
  | { kind: 'node'; value: TreeNode; sourceIds?: readonly string[] }
  | { kind: 'nodes'; value: NodeForest }

export function executeEditorContextMenuCommand(
  command: EditorContextMenuCommand,
  store: EditorStore,
  node: TreeNode,
  input: HTMLElement,
): void {
  const selection = getSelectionRange(input)
  if (command === 'selectAll') {
    selectAll(input)
    return
  }
  if (command === 'copy' && selection.start !== selection.end) {
    void store.copy(node.id, selection.start, selection.end).catch((error: unknown) => store.reportError(error))
  } else if (command === 'cut' && selection.start !== selection.end) {
    void store.cut(node.id, selection.start, selection.end).catch((error: unknown) => store.reportError(error))
  } else if (command === 'paste') {
    void store.paste(node.id, getCaret(input)).catch((error: unknown) => store.reportError(error))
  }
}

export interface EditorKeyboardHandlerDependencies {
  store: EditorStore
  node: TreeNode
  isComposing: () => boolean
  setSelectAllNodeId: (nodeId: string | undefined) => void
  onPreviewAttachment: (attachmentId: string) => void
  vim?: VimKeyboardState
}

export function createEditorKeyDownHandler({
  store,
  node,
  isComposing,
  setSelectAllNodeId,
  onPreviewAttachment,
  vim,
}: EditorKeyboardHandlerDependencies): (event: KeyboardEvent<HTMLElement>) => void {
  return (event): void => {
    if (isComposing()) return
    const selectingAll = event.metaKey && event.key.toLowerCase() === 'a'
    const copying = event.metaKey && event.key.toLowerCase() === 'c'
    const pasting = event.metaKey && event.key.toLowerCase() === 'v'
    if (!selectingAll && !copying && !pasting) {
      setSelectAllNodeId(undefined)
      event.currentTarget.classList.remove('select-all')
    }
    const cursor = getCaret(event.currentTarget)
    if (vim !== undefined && vim.mode === 'replace' && !event.metaKey && !event.ctrlKey && !event.altKey) {
      event.preventDefault()
      if (event.key === 'Escape') {
        const changed = vim.finishReplace?.(event.currentTarget) ?? false
        vim.setMode('normal')
        setNormalCaret(event.currentTarget, Math.max(0, getCaret(event.currentTarget) - (changed ? 1 : 0)))
        store.endTextSession()
      } else vim.handleReplaceKey?.(event.currentTarget, event.key)
      return
    }
    if (
      vim !== undefined &&
      !event.metaKey &&
      !event.altKey &&
      vim.mode === 'normal' &&
      event.ctrlKey &&
      (event.key === 'd' || event.key === 'u')
    ) {
      event.preventDefault()
      vim.pending.current = undefined
      vim.moveViewport(node.id, event.key === 'd' ? 'half-down' : 'half-up', cursor)
      return
    }
    if (
      vim !== undefined &&
      !event.metaKey &&
      !event.altKey &&
      vim.mode === 'normal' &&
      event.ctrlKey &&
      event.key.toLowerCase() === 'o'
    ) {
      event.preventDefault()
      vim.pending.current = undefined
      store.leave()
      return
    }
    if (
      vim !== undefined &&
      !event.metaKey &&
      !event.altKey &&
      vim.mode === 'normal' &&
      event.ctrlKey &&
      event.key.toLowerCase() === 'r'
    ) {
      event.preventDefault()
      vim.pending.current = undefined
      store.redo()
      return
    }
    if (vim !== undefined && !event.metaKey && !event.ctrlKey && !event.altKey) {
      if (vim.mode === 'insert' && event.key === 'Escape') {
        event.preventDefault()
        vim.finishInsert?.(event.currentTarget)
        vim.pending.current = undefined
        vim.visualAnchor.current = undefined
        vim.visualFocus.current = undefined
        vim.setMode('normal')
        setNormalCaret(event.currentTarget, Math.max(0, cursor - 1))
        store.endTextSession()
        return
      }
      if (vim.mode !== 'insert') {
        if (handleVimKey(event, store, node, vim)) return
        event.preventDefault()
        return
      }
    }
    if (selectingAll) {
      event.preventDefault()
      const input = event.currentTarget
      selectAll(input)
      globalThis.queueMicrotask(() => {
        setSelectAllNodeId(node.id)
        input.classList.add('select-all')
      })
    } else if (event.metaKey && event.key.toLowerCase() === 'c') {
      const selection = getSelectionRange(event.currentTarget)
      if (selection.start !== selection.end) {
        event.preventDefault()
        void store.copy(node.id, selection.start, selection.end).catch((error: unknown) => store.reportError(error))
      }
    } else if (event.metaKey && event.key.toLowerCase() === 'v') {
      event.preventDefault()
      void store.paste(node.id, getCaret(event.currentTarget)).catch((error: unknown) => store.reportError(error))
    } else if (event.metaKey && event.key.toLowerCase() === 'x') {
      const selection = getSelectionRange(event.currentTarget)
      if (selection.start !== selection.end) {
        event.preventDefault()
        void store.cut(node.id, selection.start, selection.end).catch((error: unknown) => store.reportError(error))
      }
    } else if (event.metaKey && event.key === '.') {
      event.preventDefault()
      store.enter()
    } else if (event.metaKey && event.key === ',') {
      event.preventDefault()
      store.leave()
    } else if (event.metaKey && event.key === 'Backspace') {
      event.preventDefault()
      store.deleteSelected()
    } else if (event.metaKey && event.key.toLowerCase() === 'z') {
      event.preventDefault()
      if (event.shiftKey) store.redo()
      else store.undo()
    } else if (event.metaKey && event.key.toLowerCase() === 'q') {
      event.preventDefault()
      void window.treeApi.quit().catch((error: unknown) => store.reportError(error))
    } else if (event.metaKey && event.key === '0') event.preventDefault()
    else if (event.metaKey && event.key === 'Enter') {
      event.preventDefault()
      if (node.attachment !== undefined) {
        onPreviewAttachment(node.attachment.id)
      }
    } else if (event.key === 'Backspace' && store.deleteLink(node.id, cursor)) {
      event.preventDefault()
    } else if (event.key === 'Backspace' && node.text === '') {
      event.preventDefault()
      store.deleteEmptySelected()
    } else if (event.key === 'Enter') {
      event.preventDefault()
      store.createSiblingOrFirstChild(cursor)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      store.moveSelection('up', cursor)
    } else if (event.key === 'ArrowDown') {
      event.preventDefault()
      store.moveSelection('down', cursor)
    } else if (
      event.key === 'ArrowLeft' ||
      event.key === 'ArrowRight' ||
      event.key === 'Home' ||
      event.key === 'End' ||
      event.key === 'PageUp' ||
      event.key === 'PageDown'
    ) {
      const selection = getSelectionRange(event.currentTarget)
      const moved =
        selection.start === selection.end &&
        ((event.key === 'ArrowLeft' && store.moveHorizontal('left', cursor)) ||
          (event.key === 'ArrowRight' && store.moveHorizontal('right', cursor)))
      if (moved) event.preventDefault()
      else store.endTextSession()
    }
  }
}

function handleVimKey(
  event: KeyboardEvent<HTMLElement>,
  store: EditorStore,
  node: TreeNode,
  vim: VimKeyboardState,
): boolean {
  if (vim.mode === 'visual-node') {
    const handled = (): true => {
      event.preventDefault()
      return true
    }
    if (event.key === 'Escape' || event.key === 'V') {
      vim.nodeVisual?.exit()
      vim.setMode('normal')
    } else if (event.key === 'j' || event.key === 'k') {
      vim.nodeVisual?.move(event.key === 'j' ? 'down' : 'up')
    } else if (event.key === 'G') vim.nodeVisual?.move('last')
    else if (event.key === 'g' && vim.pending.current?.prefix !== 'g') {
      vim.pending.current = { count: '', motionCount: '', prefix: 'g' }
    } else if (event.key === 'g' && vim.pending.current?.prefix === 'g') {
      vim.pending.current = undefined
      vim.nodeVisual?.move('first')
    } else if (event.key === 'o') vim.nodeVisual?.swap()
    else if ('ydxcspPuU'.includes(event.key) && event.key.length === 1)
      vim.nodeVisual?.command(event.key as NodeVisualCommand)
    return handled()
  }
  const input = event.currentTarget
  const cursor = getCaret(input)
  const selection = getSelectionRange(input)
  const visual = vim.mode === 'visual'
  const motionCursor = visual ? (vim.visualFocus.current ?? cursor) : cursor
  const move = (target: number): void => {
    const maximum = node.text.length > 0 ? node.text.length - 1 : 0
    const clamped = Math.max(0, Math.min(target, maximum))
    if (visual) {
      const anchor = vim.visualAnchor.current ?? cursor
      vim.visualFocus.current = clamped
      setSelectionRange(input, Math.min(anchor, clamped), Math.max(anchor, clamped) + 1)
    } else setNormalCaret(input, clamped)
  }
  const handled = (): true => {
    event.preventDefault()
    return true
  }
  const clearPending = (): void => {
    vim.pending.current = undefined
  }

  if (event.key === 'Escape') {
    clearPending()
    vim.visualAnchor.current = undefined
    vim.visualFocus.current = undefined
    vim.setMode('normal')
    setNormalCaret(input, selection.start)
    return handled()
  }
  const pending = vim.pending.current ?? { count: '', motionCount: '' }
  const count = parseCount(pending.count)
  const motionCount = parseCount(pending.motionCount)
  const totalCount = count * motionCount

  if (pending.awaiting !== undefined) {
    const awaiting = pending.awaiting
    clearPending()
    if (event.key.length !== 1) return handled()
    if (awaiting === 'r') {
      if (!visual) applyTextChange(store, node, input, cursor, vim, { kind: 'replace', count, character: event.key })
      return handled()
    }
    const find = { kind: awaiting, character: event.key } as VimFindCommand
    vim.lastFind.current = find
    const motion = awaiting + event.key
    if (pending.operator !== undefined && !visual) {
      applyTextChange(store, node, input, cursor, vim, {
        kind: pending.operator === 'd' ? 'delete' : pending.operator === 'c' ? 'change' : 'yank',
        motion,
        count: totalCount,
      })
    } else {
      const range = textMotion(node.text, motionCursor, motion, count)
      if (range !== undefined) move(range.target)
    }
    return handled()
  }

  if (pending.prefix === 'g') {
    clearPending()
    if (event.key === 'e') {
      if (pending.operator !== undefined && !visual) {
        applyTextChange(store, node, input, cursor, vim, {
          kind: pending.operator === 'd' ? 'delete' : pending.operator === 'c' ? 'change' : 'yank',
          motion: 'ge',
          count: totalCount,
        })
      } else {
        const range = textMotion(node.text, motionCursor, 'ge', count)
        if (range !== undefined) move(range.target)
      }
    } else if (!visual && pending.operator === undefined && pending.count === '' && event.key === 'g')
      vim.moveBoundary('first', cursor)
    else if (!visual && pending.count === '' && event.key === 'd') store.enter()
    return handled()
  }

  if (pending.prefix === 'i' || pending.prefix === 'a') {
    clearPending()
    if (isTextObjectKey(event.key)) {
      const motion = pending.prefix + event.key
      if (pending.operator !== undefined && !visual) {
        applyTextChange(store, node, input, cursor, vim, {
          kind: pending.operator === 'd' ? 'delete' : pending.operator === 'c' ? 'change' : 'yank',
          motion,
          count: totalCount,
        })
      } else if (visual) {
        const range = textMotion(node.text, motionCursor, motion, count)
        if (range !== undefined) {
          vim.visualAnchor.current = range.start
          vim.visualFocus.current = Math.max(range.start, range.end - 1)
          setSelectionRange(input, range.start, range.end)
        }
      }
    }
    return handled()
  }

  if (/^[1-9]$/u.test(event.key) || (event.key === '0' && (pending.count !== '' || pending.motionCount !== ''))) {
    if (pending.operator !== undefined) pending.motionCount += event.key
    else pending.count += event.key
    vim.pending.current = pending
    return handled()
  }

  if (pending.operator !== undefined) {
    if (event.key === pending.operator && pending.motionCount === '' && pending.count === '') {
      clearPending()
      if (pending.operator === 'd') {
        vim.register.current = { kind: 'node', value: cloneNode(node), sourceIds: [node.id] }
        if (store.deleteSelected() && vim.lastChange !== undefined)
          vim.lastChange.current = { kind: 'structural-delete' }
      } else if (pending.operator === 'y')
        vim.register.current = { kind: 'node', value: cloneNode(node), sourceIds: [node.id] }
      else applyTextChange(store, node, input, cursor, vim, { kind: 'change', motion: 'all', count: 1 })
      return handled()
    }
    if ('fFtT'.includes(event.key)) {
      pending.awaiting = event.key as 'f' | 'F' | 't' | 'T'
      vim.pending.current = pending
      return handled()
    }
    if (event.key === 'g') {
      pending.prefix = 'g'
      vim.pending.current = pending
      return handled()
    }
    if (event.key === 'i' || event.key === 'a') {
      pending.prefix = event.key
      vim.pending.current = pending
      return handled()
    }
    if (event.key === ';' || event.key === ',') {
      const motion = repeatedFindMotion(vim.lastFind.current, event.key === ',')
      clearPending()
      if (motion !== undefined)
        applyTextChange(store, node, input, cursor, vim, {
          kind: pending.operator === 'd' ? 'delete' : pending.operator === 'c' ? 'change' : 'yank',
          motion,
          count: totalCount,
        })
      return handled()
    }
    clearPending()
    if (isTextMotion(event.key)) {
      applyTextChange(store, node, input, cursor, vim, {
        kind: pending.operator === 'd' ? 'delete' : pending.operator === 'c' ? 'change' : 'yank',
        motion: event.key,
        count: totalCount,
      })
    }
    return handled()
  }

  if ('fFtT'.includes(event.key)) {
    pending.awaiting = event.key as 'f' | 'F' | 't' | 'T'
    vim.pending.current = pending
    return handled()
  }
  if (event.key === ';' || event.key === ',') {
    clearPending()
    const motion = repeatedFindMotion(vim.lastFind.current, event.key === ',')
    if (motion !== undefined) {
      const range = textMotion(node.text, motionCursor, motion, count)
      if (range !== undefined) move(range.target)
    }
    return handled()
  }
  if (!visual && event.key === 'r') {
    pending.awaiting = 'r'
    vim.pending.current = pending
    return handled()
  }
  if (!visual && (event.key === 'd' || event.key === 'y' || event.key === 'c')) {
    pending.operator = event.key
    vim.pending.current = pending
    return handled()
  }
  if (visual && (event.key === 'i' || event.key === 'a')) {
    pending.prefix = event.key
    vim.pending.current = pending
    return handled()
  }
  clearPending()

  if (isTextMotion(event.key)) {
    const range = textMotion(node.text, motionCursor, event.key, count)
    if (range !== undefined) move(range.target)
  } else if (!visual && (event.key === 'i' || event.key === 'a' || event.key === 'I' || event.key === 'A')) {
    if (pending.count !== '') return handled()
    const entry = event.key
    vim.beginInsert?.(node.id, node.text, insertPosition(node.text, cursor, entry), { kind: 'insert', entry })
    vim.setMode('insert')
    setCaret(input, insertPosition(node.text, cursor, entry))
  } else if (!visual && event.key === 'R') {
    if (pending.count !== '') return handled()
    vim.beginReplace?.(node.id, input, node.text, cursor)
    vim.setMode('replace')
    setCaret(input, cursor)
  } else if (!visual && (event.key === 'o' || event.key === 'O')) {
    if (pending.count !== '') return handled()
    const position = event.key === 'o' ? 'after' : 'before'
    if (store.createSibling(position)) {
      vim.beginStructuralOpen?.(position)
      vim.setMode('insert')
    }
  } else if (!visual && event.key === 'v') {
    vim.visualAnchor.current = cursor
    vim.visualFocus.current = cursor
    vim.setMode('visual')
    setSelectionRange(input, cursor, Math.min(cursor + 1, node.text.length))
  } else if (!visual && event.key === 'V') {
    if (vim.nodeVisual?.enter(node.id)) {
      setSelectionRange(input, cursor, cursor)
      vim.setMode('visual-node')
    }
  } else if (!visual && (event.key === 'j' || event.key === 'k')) {
    if (pending.count !== '') return handled()
    store.moveSelection(event.key === 'j' ? 'down' : 'up', cursor)
  } else if (visual && event.key === 'v') {
    leaveVisual(vim, input, selection.start)
  } else if (visual && event.key === 'o') {
    const anchor = vim.visualAnchor.current ?? selection.start
    const focus = vim.visualFocus.current ?? selection.end - 1
    vim.visualAnchor.current = focus
    vim.visualFocus.current = anchor
    setSelectionRange(input, Math.min(anchor, focus), Math.max(anchor, focus) + 1)
  } else if (visual && (event.key === 'd' || event.key === 'y' || event.key === 'x')) {
    if (selection.start !== selection.end) {
      vim.register.current = { kind: 'text', value: node.text.slice(selection.start, selection.end) }
    }
    if (event.key !== 'y' && selection.start !== selection.end) {
      store.replaceTextRange(node.id, selection.start, selection.end, '')
      vim.scheduleCaret(input, selection.start)
      if (vim.lastChange !== undefined) {
        vim.lastChange.current = { kind: 'delete', motion: 'x', count: selection.end - selection.start }
      }
    } else setNormalCaret(input, selection.start)
    vim.visualAnchor.current = undefined
    vim.visualFocus.current = undefined
    vim.setMode('normal')
  } else if (visual && (event.key === 'c' || event.key === 's')) {
    if (selection.start !== selection.end) {
      vim.register.current = { kind: 'text', value: node.text.slice(selection.start, selection.end) }
      const nextText = node.text.slice(0, selection.start) + node.text.slice(selection.end)
      store.replaceTextRange(node.id, selection.start, selection.end, '')
      vim.beginInsert?.(node.id, nextText, selection.start, {
        kind: 'change',
        motion: 'x',
        count: selection.end - selection.start,
      })
      vim.scheduleCaret(input, selection.start)
    }
    vim.visualAnchor.current = undefined
    vim.visualFocus.current = undefined
    vim.setMode('insert')
  } else if (visual && (event.key === 'u' || event.key === 'U')) {
    applyVisualCase(store, node, input, vim, selection, event.key === 'u' ? 'lower' : 'upper')
  } else if (visual && (event.key === 'p' || event.key === 'P')) {
    const register = vim.register.current
    if (register.kind === 'text' && register.value !== '' && selection.start !== selection.end) {
      store.replaceTextRange(node.id, selection.start, selection.end, register.value)
      if (vim.lastChange !== undefined)
        vim.lastChange.current = { kind: 'overwrite', text: register.value, replaced: selection.end - selection.start }
      leaveVisual(vim, input, selection.start + Math.max(0, register.value.length - 1))
    }
  } else if (!visual && event.key === 'x') {
    applyTextChange(store, node, input, cursor, vim, { kind: 'delete', motion: 'x', count })
  } else if (!visual && event.key === 'X') {
    applyTextChange(store, node, input, cursor, vim, { kind: 'delete', motion: 'X', count })
  } else if (!visual && event.key === 's') {
    applyTextChange(store, node, input, cursor, vim, { kind: 'substitute', count })
  } else if (!visual && (event.key === 'D' || event.key === 'C')) {
    applyTextChange(store, node, input, cursor, vim, {
      kind: event.key === 'D' ? 'delete' : 'change',
      motion: '$',
      count: 1,
    })
  } else if (!visual && event.key === 'S') {
    if (pending.count !== '') return handled()
    applyTextChange(store, node, input, cursor, vim, { kind: 'change', motion: 'all', count: 1 })
  } else if (!visual && event.key === '~') {
    applyTextChange(store, node, input, cursor, vim, { kind: 'case', mode: 'toggle', count })
  } else if (!visual && (event.key === 'p' || event.key === 'P')) {
    const register = vim.register.current
    if (register.kind === 'node') {
      if (
        pending.count === '' &&
        store.pasteSubtree(node.id, event.key === 'p' ? 'after' : 'before', register.value, register.sourceIds)
      ) {
        if (vim.lastChange !== undefined)
          vim.lastChange.current = {
            kind: 'structural-put',
            position: event.key === 'p' ? 'after' : 'before',
            source: cloneNode(register.value),
            sourceIds: register.sourceIds ?? [],
          }
      }
    } else if (register.kind === 'nodes') {
      if (pending.count === '' && register.value.nodes.length > 0) {
        const result = store.pasteNodeForest(node.id, event.key === 'p' ? 'after' : 'before', register.value)
        if (result && vim.lastChange !== undefined)
          vim.lastChange.current = {
            kind: 'structural-forest-put',
            position: event.key === 'p' ? 'after' : 'before',
            source: register.value,
          }
      }
    } else if (register.kind === 'text' && register.value !== '') {
      applyTextChange(store, node, input, cursor, vim, {
        kind: 'paste',
        after: event.key === 'p',
        text: register.value.repeat(count),
      })
    }
  } else if (!visual && event.key === '.') {
    const last = vim.lastChange?.current
    if (last !== undefined) {
      if (last.kind.startsWith('structural-')) {
        for (let index = 0; index < count; index += 1) vim.repeatStructural?.(last as VimStructuralChange)
        return handled()
      }
      let text = node.text
      let position = cursor
      for (let index = 0; index < count; index += 1) {
        const result = applyTextChange(store, { ...node, text }, input, position, vim, last as VimTextChange, true)
        if (result === undefined) break
        text = result.text
        position = result.cursor
      }
    }
  } else if (!visual && event.key === 'g') {
    vim.pending.current = { count: pending.count, motionCount: '', prefix: 'g' }
  } else if (!visual && event.key === 'G') {
    if (pending.count !== '') return handled()
    vim.moveBoundary('last', cursor)
  } else if (!visual && event.key === 'u') {
    if (pending.count !== '') return handled()
    store.undo()
  } else if (!visual && (event.key === 'H' || event.key === 'M' || event.key === 'L')) {
    if (pending.count !== '') return handled()
    vim.moveViewport(node.id, event.key === 'H' ? 'top' : event.key === 'M' ? 'middle' : 'bottom', cursor)
  } else return false
  return handled()
}

function parseCount(value: string): number {
  return value === '' ? 1 : Math.max(1, Math.min(Number.MAX_SAFE_INTEGER, Number(value)))
}

function isTextMotion(key: string): boolean {
  return 'hlwWbBeE0^$'.includes(key) && key.length === 1
}

function isTextObjectKey(key: string): boolean {
  return key.length === 1 && 'wW"\'`()[]{}<>'.includes(key)
}

function insertPosition(text: string, cursor: number, entry: 'i' | 'a' | 'I' | 'A'): number {
  if (entry === 'I') return firstNonWhitespace(text)
  if (entry === 'A') return text.length
  if (entry === 'a') return Math.min(cursor + 1, text.length)
  return cursor
}

interface TextMotionResult {
  target: number
  start: number
  end: number
}

function textMotion(
  text: string,
  cursor: number,
  motion: string,
  count: number,
  changeWord = false,
): TextMotionResult | undefined {
  const length = text.length
  let target = cursor
  let start = cursor
  let end: number
  if (motion.length === 2 && (motion[0] === 'i' || motion[0] === 'a') && isTextObjectKey(motion[1]!)) {
    const range = textObjectRange(text, cursor, motion[0], motion[1]!, count)
    if (range === undefined) return undefined
    return { target: range.start, start: range.start, end: range.end }
  }
  if (motion === 'x') end = Math.min(length, cursor + count)
  else if (motion === 'X') {
    start = Math.max(0, cursor - count)
    end = cursor
    target = start
  } else if (motion === 'all') {
    start = 0
    end = length
    target = 0
  } else if (motion === '0' || motion === '^') {
    target = motion === '0' ? 0 : firstNonWhitespace(text)
    start = Math.min(cursor, target)
    end = Math.max(cursor, target)
  } else if (motion === '$') {
    target = Math.max(0, length - 1)
    end = length
  } else if (motion === 'h' || motion === 'l') {
    target = Math.max(0, Math.min(length, cursor + (motion === 'h' ? -count : count)))
    start = Math.min(cursor, target)
    end = Math.max(cursor, target)
  } else if (
    motion === 'w' ||
    motion === 'W' ||
    motion === 'b' ||
    motion === 'B' ||
    motion === 'e' ||
    motion === 'E' ||
    motion === 'ge'
  ) {
    for (let index = 0; index < count; index += 1) {
      const before = target
      if (motion === 'b') target = moveWordBackward(text, target)
      else if (motion === 'B') target = moveWORDBackward(text, target)
      else if (motion === 'e') target = moveWordEnd(text, target)
      else if (motion === 'E') target = moveWORDEnd(text, target)
      else if (motion === 'ge') target = moveWordEndBackward(text, target)
      else if (motion === 'W') target = moveWORDForward(text, target)
      else if (motion === 'w' && changeWord && /\S/u.test(text[cursor] ?? '') && index === count - 1)
        target = currentWordEnd(text, target)
      else target = moveWordForward(text, target)
      if (target === before) break
    }
    start = Math.min(cursor, target)
    end = Math.max(cursor, target)
    if (motion === 'e' || motion === 'E' || (motion === 'w' && changeWord && /\S/u.test(text[cursor] ?? '')))
      end = Math.min(length, end + 1)
  } else if (/^[fFtT]./u.test(motion)) {
    const kind = motion[0]
    const found = findCharacter(
      text,
      cursor,
      motion.slice(1),
      kind === 'f' || kind === 't' ? 'forward' : 'backward',
      count,
    )
    if (found === undefined) return undefined
    target = kind === 't' ? found - 1 : kind === 'T' ? found + 1 : found
    start = Math.min(cursor, target)
    end = Math.max(cursor, target)
    if (kind === 'f' || kind === 't') end = Math.min(length, end + 1)
  } else return undefined
  return { target, start, end }
}

function applyTextChange(
  store: EditorStore,
  node: TreeNode,
  input: HTMLElement,
  cursor: number,
  vim: VimKeyboardState,
  change: VimTextChange,
  replay = false,
): { text: string; cursor: number } | undefined {
  const text = node.text
  let start = cursor
  let end = cursor
  let inserted = ''
  let nextCursor = cursor
  if (change.kind === 'delete' || change.kind === 'change' || change.kind === 'yank') {
    const range = textMotion(text, cursor, change.motion, change.count, change.kind === 'change')
    if (range === undefined) return undefined
    start = range.start
    end = range.end
    if (change.kind === 'yank') {
      if (start !== end) vim.register.current = { kind: 'text', value: text.slice(start, end) }
      return undefined
    }
    inserted = change.insertedText ?? ''
    nextCursor = start + Math.max(0, inserted.length - 1)
  } else if (change.kind === 'replace') {
    end = cursor + change.count
    if (end > text.length || start === end) return undefined
    inserted = change.character.repeat(change.count)
    nextCursor = Math.max(cursor, end - 1)
  } else if (change.kind === 'substitute') {
    end = Math.min(text.length, cursor + change.count)
    inserted = change.insertedText ?? ''
    nextCursor = start + Math.max(0, inserted.length - 1)
  } else if (change.kind === 'insert') {
    start = insertPosition(text, cursor, change.entry)
    end = start
    inserted = change.insertedText ?? ''
    nextCursor = start + Math.max(0, inserted.length - 1)
  } else if (change.kind === 'paste') {
    start = vimPastePosition(text.length, cursor, change.after)
    end = start
    inserted = change.text
    nextCursor = start + inserted.length - 1
  } else if (change.kind === 'overwrite') {
    end = Math.min(text.length, cursor + change.replaced)
    inserted = change.text
    nextCursor = cursor + Math.max(0, inserted.length - 1)
  } else if (change.kind === 'case') {
    end = Math.min(text.length, cursor + change.count)
    if (start === end) return undefined
    inserted = transformCase(text.slice(start, end), change.mode)
    nextCursor = Math.min(text.length - 1, cursor + change.count)
  }
  if (start !== end && (change.kind === 'delete' || change.kind === 'change' || change.kind === 'substitute')) {
    vim.register.current = { kind: 'text', value: text.slice(start, end) }
  }
  if (replay && (change.kind === 'insert' || change.kind === 'change' || change.kind === 'substitute')) {
    const baseline = text.slice(0, start) + text.slice(end)
    const position = Math.max(0, Math.min(start + (change.insertOffset ?? 0), baseline.length))
    const finalText =
      baseline.slice(0, position) +
      inserted +
      baseline.slice(Math.min(baseline.length, position + (change.deleteCount ?? 0)))
    const edit = textDifference(text, finalText)
    start = edit.start
    end = edit.end
    inserted = edit.inserted
    nextCursor = position + Math.max(0, (change.insertedText ?? '').length - 1)
  }
  const nextText = text.slice(0, start) + inserted + text.slice(end)
  if (replay && nextText === text) return undefined
  if (nextText !== text) store.replaceTextRange(node.id, start, end, inserted)
  if (!replay && (change.kind === 'change' || change.kind === 'substitute')) {
    vim.beginInsert?.(node.id, nextText, start, change)
    vim.setMode('insert')
    vim.scheduleCaret(input, start)
  } else {
    vim.scheduleCaret(input, Math.min(nextCursor, Math.max(0, nextText.length - 1)))
    if (!replay && nextText !== text && vim.lastChange !== undefined) vim.lastChange.current = change
  }
  return { text: nextText, cursor: Math.min(nextCursor, Math.max(0, nextText.length - 1)) }
}

function repeatedFindMotion(find: VimFindCommand | undefined, reverse: boolean): string | undefined {
  if (find === undefined) return undefined
  const kind = reverse ? (find.kind === 'f' ? 'F' : find.kind === 'F' ? 'f' : find.kind === 't' ? 'T' : 't') : find.kind
  return kind + find.character
}

function leaveVisual(vim: VimKeyboardState, input: HTMLElement, cursor: number): void {
  vim.visualAnchor.current = undefined
  vim.visualFocus.current = undefined
  vim.setMode('normal')
  vim.scheduleCaret(input, cursor)
}

function transformCase(text: string, mode: 'toggle' | 'lower' | 'upper'): string {
  if (mode === 'lower') return text.toLocaleLowerCase()
  if (mode === 'upper') return text.toLocaleUpperCase()
  return Array.from(text, (character) =>
    character === character.toLocaleUpperCase() ? character.toLocaleLowerCase() : character.toLocaleUpperCase(),
  ).join('')
}

function applyVisualCase(
  store: EditorStore,
  node: TreeNode,
  input: HTMLElement,
  vim: VimKeyboardState,
  selection: { start: number; end: number },
  mode: 'lower' | 'upper',
): void {
  if (selection.start === selection.end) return
  const replacement = transformCase(node.text.slice(selection.start, selection.end), mode)
  store.replaceTextRange(node.id, selection.start, selection.end, replacement)
  if (vim.lastChange !== undefined)
    vim.lastChange.current = { kind: 'case', mode, count: selection.end - selection.start }
  leaveVisual(vim, input, selection.start + Math.max(0, replacement.length - 1))
}

function textDifference(before: string, after: string): { start: number; end: number; inserted: string } {
  let start = 0
  while (start < before.length && start < after.length && before[start] === after[start]) start += 1
  let suffix = 0
  while (
    suffix < before.length - start &&
    suffix < after.length - start &&
    before[before.length - 1 - suffix] === after[after.length - 1 - suffix]
  )
    suffix += 1
  return { start, end: before.length - suffix, inserted: after.slice(start, after.length - suffix) }
}
