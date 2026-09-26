import type { KeyboardEvent } from 'react'
import type { EditorStore, NodeVisualCommand } from '../application/editor-store'
import { cloneNode, displayedNodes, linkAtPosition, type TreeNode } from '../domain/document'
import { getCaret, getSelectionRange, setCaret, setNormalCaret, setSelectionRange } from './editor-dom'
import {
  calculateSurround,
  calculateTextChange,
  insertPosition,
  isTextMotion,
  isTextObjectKey,
  parseCount,
  repeatedFindMotion,
  textMotion,
  transformCase,
} from './vim-text-commands'
import type {
  VimFindCommand,
  VimKeyboardState,
  VimStructuralChange,
  VimSurroundChange,
  VimTextChange,
} from './vim-keyboard-types'
import { surroundDelimiterKey, surroundLineRange } from './vim-surround'
import { moveCharacterCursor } from './vim-editing'

export function handleVimKey(
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
  if (!visual) vim.setImageCaret?.(node.id, node.attachment !== undefined && cursor === node.text.length)
  const motionCursor = visual ? (vim.visualFocus.current ?? cursor) : cursor
  const move = (target: number, allowAttachment = false): void => {
    const maximum =
      allowAttachment && !visual && node.attachment !== undefined
        ? node.text.length
        : node.text.length > 0
          ? node.text.length - 1
          : 0
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
  const operatorChangeKind = (operator: 'd' | 'y' | 'c'): 'delete' | 'yank' | 'change' =>
    operator === 'd' ? 'delete' : operator === 'c' ? 'change' : 'yank'
  /** Finish a `d`, `y`, `c`, or `ys` operator once its motion is known. */
  const applyOperatorMotion = (operator: 'd' | 'y' | 'c' | 's', motion: string, motionTotal: number): void => {
    if (operator !== 's') {
      applyTextChange(store, node, input, cursor, vim, {
        kind: operatorChangeKind(operator),
        motion,
        count: motionTotal,
      })
      return
    }
    const range = textMotion(node.text, cursor, motion, motionTotal)
    if (range === undefined) return
    vim.pending.current = {
      count: '',
      motionCount: '',
      surround: { stage: 'delimiter', start: range.start, end: range.end },
    }
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

  const surround = pending.surround
  if (surround !== undefined) {
    clearPending()
    if (event.key.length !== 1) return handled()
    if (surround.stage === 'target') {
      if (surroundDelimiterKey(event.key) === undefined) return handled()
      if (surround.operation === 'delete')
        applySurround(store, node, input, node.text, cursor, vim, {
          kind: 'surround-delete',
          target: event.key,
          count: surround.count,
        })
      else
        vim.pending.current = {
          count: '',
          motionCount: '',
          surround: { stage: 'replacement', target: event.key, count: surround.count },
        }
      return handled()
    }
    if (surround.stage === 'replacement') {
      applySurround(store, node, input, node.text, cursor, vim, {
        kind: 'surround-change',
        target: surround.target,
        delimiter: event.key,
        count: surround.count,
      })
      return handled()
    }
    const applied = applySurround(store, node, input, node.text, surround.start, vim, {
      kind: 'surround-add',
      motion: 'x',
      count: surround.end - surround.start,
      delimiter: event.key,
    })
    // A failed Visual surround keeps the selection so the delimiter can be retyped, matching how
    // a failed Visual put remains in Visual mode.
    if (surround.fromVisual === true && applied !== undefined) {
      vim.visualAnchor.current = undefined
      vim.visualFocus.current = undefined
      vim.setMode('normal')
    }
    return handled()
  }

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
      applyOperatorMotion(pending.operator, motion, totalCount)
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
        applyOperatorMotion(pending.operator, 'ge', totalCount)
      } else {
        const range = textMotion(node.text, motionCursor, 'ge', count)
        if (range !== undefined) move(range.target)
      }
    } else if (!visual && pending.operator === undefined && pending.count === '' && event.key === 'g')
      vim.moveBoundary('parent', cursor)
    else if (!visual && pending.count === '' && event.key === 'd') store.enter()
    return handled()
  }

  if (pending.prefix === 'i' || pending.prefix === 'a') {
    clearPending()
    if (isTextObjectKey(event.key)) {
      const motion = pending.prefix + event.key
      if (pending.operator !== undefined && !visual) {
        applyOperatorMotion(pending.operator, motion, totalCount)
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
    if (pending.operator !== 's' && event.key === pending.operator && pending.motionCount === '') {
      clearPending()
      if (pending.operator === 'd') {
        const count = parseCount(pending.count)
        if (count === 1) {
          vim.register.current = { kind: 'node', value: cloneNode(node), sourceIds: [node.id] }
          if (store.deleteSelected() && vim.lastChange !== undefined)
            vim.lastChange.current = { kind: 'structural-delete' }
        } else {
          const source = selectedSiblingForest(store, node.id, count)
          if (source !== undefined) {
            vim.register.current = { kind: 'nodes', value: source }
            let deleted = 0
            while (deleted < source.nodes.length && store.deleteSelected()) deleted += 1
            if (deleted > 0 && vim.lastChange !== undefined) vim.lastChange.current = { kind: 'structural-delete' }
          }
        }
      } else if (pending.operator === 'y') {
        const count = parseCount(pending.count)
        if (count === 1) vim.register.current = { kind: 'node', value: cloneNode(node), sourceIds: [node.id] }
        else {
          const source = selectedSiblingForest(store, node.id, count)
          if (source !== undefined) vim.register.current = { kind: 'nodes', value: source }
        }
      } else applyTextChange(store, node, input, cursor, vim, { kind: 'change', motion: 'all', count: 1 })
      return handled()
    }
    if (event.key === 's' && pending.operator !== 's') {
      if (pending.operator === 'y') {
        pending.operator = 's'
        vim.pending.current = pending
      } else
        vim.pending.current = {
          count: '',
          motionCount: '',
          surround: { stage: 'target', operation: pending.operator === 'd' ? 'delete' : 'change', count },
        }
      return handled()
    }
    if (event.key === 's' && pending.operator === 's') {
      if (pending.count !== '' || pending.motionCount !== '') {
        clearPending()
        return handled()
      }
      const range = surroundLineRange(node.text)
      vim.pending.current = {
        count: '',
        motionCount: '',
        surround: { stage: 'delimiter', start: range.start, end: range.end },
      }
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
      if (motion !== undefined) applyOperatorMotion(pending.operator, motion, totalCount)
      return handled()
    }
    clearPending()
    if (isTextMotion(event.key)) {
      if (node.attachment !== undefined && cursor === node.text.length) return handled()
      applyOperatorMotion(pending.operator, event.key, totalCount)
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

  if (!visual && (event.key === 'h' || event.key === 'l')) {
    const next = moveCharacterCursor(
      cursor,
      event.key === 'h' ? 'left' : 'right',
      node.text.length,
      node.attachment !== undefined,
      count,
    )
    vim.setImageCaret?.(node.id, node.attachment !== undefined && next === node.text.length)
    move(next, true)
  } else if (isTextMotion(event.key)) {
    const range = textMotion(node.text, motionCursor, event.key, count)
    if (range !== undefined) move(range.target)
  } else if (!visual && (event.key === 'i' || event.key === 'a' || event.key === 'I' || event.key === 'A')) {
    if (pending.count !== '') {
      clearPending()
      return handled()
    }
    const entry = event.key
    vim.beginInsert?.(node.id, node.text, insertPosition(node.text, cursor, entry), { kind: 'insert', entry })
    vim.setMode('insert')
    setCaret(input, insertPosition(node.text, cursor, entry))
  } else if (!visual && event.key === 'R') {
    if (pending.count !== '') {
      clearPending()
      return handled()
    }
    vim.beginReplace?.(node.id, input, node.text, cursor)
    vim.setMode('replace')
    setCaret(input, cursor)
  } else if (!visual && (event.key === 'o' || event.key === 'O')) {
    if (pending.count !== '') {
      clearPending()
      return handled()
    }
    const state = store.getSnapshot()
    const headingSelected =
      state.status === 'ready' &&
      state.location.currentParentId === node.id &&
      state.location.selectedNodeId === node.id
    if (event.key === 'o') {
      const created = headingSelected ? store.createChild() : store.createSibling('after')
      if (created) {
        if (headingSelected) vim.beginStructuralChildOpen?.()
        else vim.beginStructuralOpen?.('after')
        vim.setMode('insert')
      }
    } else {
      if (headingSelected) return handled()
      if (store.createSibling('before')) {
        vim.beginStructuralOpen?.('before')
        vim.setMode('insert')
      }
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
    const direction = event.key === 'j' ? 'down' : 'up'
    let navigationCursor = cursor
    let remainingCount = count
    if (event.key === 'j' && node.attachment !== undefined && cursor < node.text.length) {
      navigationCursor = node.text.length
      setNormalCaret(input, navigationCursor)
      vim.setImageCaret?.(node.id, true)
      remainingCount -= 1
    } else if (
      event.key === 'k' &&
      node.attachment !== undefined &&
      cursor === node.text.length &&
      node.text.length > 0
    ) {
      navigationCursor = node.text.length - 1
      setNormalCaret(input, navigationCursor)
      vim.setImageCaret?.(node.id, false)
      remainingCount -= 1
    }
    for (let index = 0; index < remainingCount; index += 1) {
      if (count > 1) {
        const state = store.getSnapshot()
        if (
          state.status === 'ready' &&
          state.document !== undefined &&
          state.location.selectedNodeId !== state.location.currentParentId
        ) {
          const visibleNodes = displayedNodes(state.document, state.location.currentParentId)
          const selectedIndex = visibleNodes.findIndex((candidate) => candidate.id === state.location.selectedNodeId)
          const atBoundary =
            (direction === 'down' && selectedIndex === visibleNodes.length - 1) ||
            (direction === 'up' && selectedIndex === 0 && state.location.currentParentId === null)
          if (atBoundary) break
        }
      }
      store.moveSelection(direction, navigationCursor)
    }
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
  } else if (visual && event.key === 'S') {
    if (selection.start !== selection.end)
      vim.pending.current = {
        count: '',
        motionCount: '',
        surround: { stage: 'delimiter', start: selection.start, end: selection.end, fromVisual: true },
      }
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
    if (pending.count !== '') {
      clearPending()
      return handled()
    }
    applyTextChange(store, node, input, cursor, vim, { kind: 'change', motion: 'all', count: 1 })
  } else if (!visual && event.key === '~') {
    applyTextChange(store, node, input, cursor, vim, { kind: 'case', mode: 'toggle', count })
  } else if (!visual && (event.key === 'p' || event.key === 'P')) {
    const register = vim.register.current
    if (register.kind === 'node') {
      let pasted = false
      for (let index = 0; index < count; index += 1)
        pasted =
          store.pasteSubtree(node.id, event.key === 'p' ? 'after' : 'before', register.value, register.sourceIds) ||
          pasted
      if (pasted && vim.lastChange !== undefined)
        vim.lastChange.current = {
          kind: 'structural-put',
          position: event.key === 'p' ? 'after' : 'before',
          source: cloneNode(register.value),
          sourceIds: register.sourceIds ?? [],
        }
    } else if (register.kind === 'nodes') {
      let pasted = false
      for (let index = 0; index < count; index += 1)
        pasted = store.pasteNodeForest(node.id, event.key === 'p' ? 'after' : 'before', register.value) || pasted
      if (pasted && vim.lastChange !== undefined)
        vim.lastChange.current = {
          kind: 'structural-forest-put',
          position: event.key === 'p' ? 'after' : 'before',
          source: register.value,
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
      if (last.kind.startsWith('surround-')) {
        let text = node.text
        let position = cursor
        for (let index = 0; index < count; index += 1) {
          const result = applySurround(store, node, input, text, position, vim, last as VimSurroundChange)
          if (result === undefined) break
          text = result.text
          position = result.cursor
        }
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
    const state = store.getSnapshot()
    if (state.status === 'ready') {
      const nodes = displayedNodes(state.document, state.location.currentParentId)
      const targetIndex = pending.count === '' ? nodes.length - 1 : Math.min(nodes.length - 1, Math.max(0, count - 1))
      const target = nodes[targetIndex]
      if (target !== undefined) vim.setImageCaret?.(target.id, target.attachment !== undefined)
    }
    if (pending.count === '') vim.moveBoundary('last', cursor)
    else vim.moveBoundary('last', cursor, count)
  } else if (!visual && event.key === 'u') {
    if (pending.count !== '') {
      clearPending()
      return handled()
    }
    store.undo()
  } else if (!visual && (event.key === 'H' || event.key === 'M' || event.key === 'L')) {
    if (pending.count !== '') {
      clearPending()
      return handled()
    }
    vim.moveViewport(node.id, event.key === 'H' ? 'top' : event.key === 'M' ? 'middle' : 'bottom', cursor)
  } else if (!visual && event.key === 'Enter') {
    if (pending.count !== '') {
      clearPending()
      return handled()
    }
    if (node.attachment !== undefined && cursor === node.text.length) {
      vim.setImageCaret?.(node.id, true)
      vim.openAttachment?.(node.attachment.id)
    } else {
      const link = linkAtPosition(node.links, cursor)
      if (link !== undefined) window.open(link.url, '_blank')
    }
  } else return false
  return handled()
}

/**
 * Apply a surround command as one edit so it is a single undoable change and links inside the
 * surrounded range keep their offsets. Returns false when the command matched nothing.
 */
function applySurround(
  store: EditorStore,
  node: TreeNode,
  input: HTMLElement,
  text: string,
  cursor: number,
  vim: VimKeyboardState,
  change: VimSurroundChange,
): { text: string; cursor: number } | undefined {
  const result = calculateSurround(text, cursor, change)
  if (result === undefined) return undefined
  store.replaceTextRanges(node.id, result.edits)
  vim.scheduleCaret(input, result.cursor)
  if (vim.lastChange !== undefined) vim.lastChange.current = change
  return { text: result.nextText, cursor: result.cursor }
}

function selectedSiblingForest(
  store: EditorStore,
  nodeId: string,
  count: number,
): { nodes: TreeNode[]; sourceIds: string[] } | undefined {
  const state = store.getSnapshot()
  if (state.status !== 'ready') return undefined
  const nodes = displayedNodes(state.document, state.location.currentParentId)
  const index = nodes.findIndex((candidate) => candidate.id === nodeId)
  if (index < 0) return undefined
  const selected = nodes.slice(index, index + count)
  if (selected.length === 0) return undefined
  return { nodes: selected.map(cloneNode), sourceIds: selected.map((candidate) => candidate.id) }
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
  const result = calculateTextChange(node.text, cursor, change, replay)
  if (result === undefined) return undefined
  if (result.registerText !== undefined) vim.register.current = { kind: 'text', value: result.registerText }
  if (result.kind === 'yank') return undefined
  if (replay && result.nextText === node.text) return undefined
  if (result.nextText !== node.text) store.replaceTextRange(node.id, result.start, result.end, result.inserted)
  if (!replay && (change.kind === 'change' || change.kind === 'substitute')) {
    vim.beginInsert?.(node.id, result.nextText, result.start, change)
    vim.setMode('insert')
    vim.scheduleCaret(input, result.start)
  } else {
    vim.scheduleCaret(input, Math.min(result.nextCursor, Math.max(0, result.nextText.length - 1)))
    if (!replay && result.nextText !== node.text && vim.lastChange !== undefined) vim.lastChange.current = change
  }
  return { text: result.nextText, cursor: Math.min(result.nextCursor, Math.max(0, result.nextText.length - 1)) }
}

function leaveVisual(vim: VimKeyboardState, input: HTMLElement, cursor: number): void {
  vim.visualAnchor.current = undefined
  vim.visualFocus.current = undefined
  vim.setMode('normal')
  vim.scheduleCaret(input, cursor)
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
