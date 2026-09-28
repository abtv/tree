import type { KeyboardEvent } from 'react'
import type { EditorStore, NodeVisualCommand } from '../application/editor-store'
import { cloneNode, displayedNodes, linkAtPosition, locateNode, requireNode, type TreeNode } from '../domain/document'
import { getCaret, getSelectionRange, setCaret, setNormalCaret, setSelectionRange } from './editor-dom'
import {
  calculateSurround,
  calculateTextChange,
  insertPosition,
  isTextMotion,
  isTextObjectKey,
  normalEditCursor,
  parseCount,
  repeatedFindMotion,
  textMotion,
  transformCase,
} from './vim-text-commands'
import type {
  VimFindCommand,
  VimFoldCommand,
  VimKeyboardState,
  VimStructuralChange,
  VimSurroundChange,
  VimTextChange,
} from './vim-keyboard-types'
import { surroundDelimiterKey, surroundLineRange } from './vim-surround'
import { clearCommandAssembly, clearPending, clearVisualRange, recordRepeatChange } from './vim-command-state'
import { editCaretTransition, horizontalCaretTransition } from './vim-caret-transition'
import { navigateVertically } from './vim-vertical-navigation'

/** The seven Normal-mode fold keys after the `z` prefix (`docs/PRODUCT.md` §20.2). */
const FOLD_COMMANDS: Readonly<Record<string, VimFoldCommand>> = {
  c: 'close',
  o: 'open',
  a: 'toggle',
  C: 'close-recursive',
  O: 'open-recursive',
  M: 'close-all',
  R: 'open-all',
}

/**
 * Keydowns that never form a command key by themselves: modifier and lock keys, dead or compose
 * keys, and the `Process`/`Unidentified` keydowns a native input method can emit while it consumes
 * the key. A physical keyboard fires the modifier's keydown before the key it modifies, so `zO`,
 * `rA`, `d$`, `ys{`, and `3G` arrive as a bare `Shift` keydown followed by the shifted key;
 * toggling Caps Lock mid-command and pressing a dead key before its composed character have the
 * same shape. Chromium reports an IME-consumed keydown as `Process` (keyCode 229) or
 * `Unidentified`, and it can arrive before `compositionstart` sets the composing state. Treating
 * any of them as the command key consumed the pending prefix, operator, or awaited-character
 * state, so the next key ran as an unrelated command. The Ctrl, Meta, and Alt keydowns never reach
 * here because their own events carry the matching modifier flag and the caller excludes it.
 */
function isNeutralKeydown(key: string): boolean {
  return (
    key === 'Shift' ||
    key === 'CapsLock' ||
    key === 'NumLock' ||
    key === 'ScrollLock' ||
    key === 'Fn' ||
    key === 'FnLock' ||
    key === 'AltGraph' ||
    key === 'Dead' ||
    key === 'Compose' ||
    key === 'Process' ||
    key === 'Unidentified'
  )
}

function syncImageCaretAtCursor(
  vim: VimKeyboardState,
  node: TreeNode,
  input: HTMLElement,
  cursor: number,
  textLength = node.text.length,
): void {
  const prior = vim.getCaretState(node.id, cursor, input.classList.contains('node-input-image-caret'))
  vim.applyCaretState(node.id, editCaretTransition(prior, cursor, textLength, node.attachment !== undefined))
}

export function handleVimKey(
  event: KeyboardEvent<HTMLElement>,
  store: EditorStore,
  node: TreeNode,
  vim: VimKeyboardState,
): boolean {
  const commandState = vim.commandState
  // A modifier, lock, dead-key, or IME keydown stays pending-command-neutral; it is not the command
  // key.
  if (isNeutralKeydown(event.key)) {
    event.preventDefault()
    return true
  }
  if (vim.mode === 'visual-node') {
    const handled = (): true => {
      event.preventDefault()
      return true
    }
    if (event.key === 'Escape' || event.key === 'V') {
      vim.nodeVisual.exit()
      // Whole-node Visual mode can hold only the pending `g` prefix; a prefix that survived the
      // exit would be read as a Normal-mode continuation (`d` would run `gd`).
      clearCommandAssembly(commandState)
      vim.setMode('normal')
      vim.syncImageCaretToFocus()
    } else if (event.key === 'j' || event.key === 'k') {
      vim.nodeVisual.move(event.key === 'j' ? 'down' : 'up')
    } else if (event.key === 'G') vim.nodeVisual.move('last')
    else if (event.key === 'g' && commandState.pending?.prefix !== 'g') {
      commandState.pending = { count: '', motionCount: '', prefix: 'g' }
    } else if (event.key === 'g' && commandState.pending?.prefix === 'g') {
      clearPending(commandState)
      vim.nodeVisual.move('first')
    } else if (event.key === 'o') vim.nodeVisual.swap()
    else if ('ydxcspPuU'.includes(event.key) && event.key.length === 1)
      vim.nodeVisual.command(event.key as NodeVisualCommand)
    return handled()
  }
  const input = event.currentTarget
  const cursor = getCaret(input)
  const selection = getSelectionRange(input)
  const visual = vim.mode === 'visual'
  const motionCursor = visual ? (commandState.visualFocus ?? cursor) : cursor
  const move = (target: number, allowAttachment = false): void => {
    const maximum =
      allowAttachment && !visual && node.attachment !== undefined
        ? node.text.length
        : node.text.length > 0
          ? node.text.length - 1
          : 0
    const clamped = Math.max(0, Math.min(target, maximum))
    if (visual) {
      const anchor = commandState.visualAnchor ?? cursor
      commandState.visualFocus = clamped
      setSelectionRange(input, Math.min(anchor, clamped), Math.max(anchor, clamped) + 1)
    } else {
      setNormalCaret(input, clamped)
      syncImageCaretAtCursor(vim, node, input, clamped)
    }
  }
  const handled = (): true => {
    event.preventDefault()
    return true
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
    commandState.pending = {
      count: '',
      motionCount: '',
      surround: { stage: 'delimiter', start: range.start, end: range.end },
    }
  }

  if (event.key === 'Escape') {
    clearCommandAssembly(commandState)
    vim.setMode('normal')
    setNormalCaret(input, selection.start)
    syncImageCaretAtCursor(vim, node, input, selection.start)
    return handled()
  }
  const pending = commandState.pending ?? { count: '', motionCount: '' }
  const count = parseCount(pending.count)
  const motionCount = parseCount(pending.motionCount)
  const totalCount = count * motionCount

  const surround = pending.surround
  if (surround !== undefined) {
    clearPending(commandState)
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
        commandState.pending = {
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
      clearVisualRange(commandState)
      vim.setMode('normal')
    }
    return handled()
  }

  if (pending.awaiting !== undefined) {
    const awaiting = pending.awaiting
    clearPending(commandState)
    if (event.key.length !== 1) return handled()
    if (awaiting === 'r') {
      if (!visual) applyTextChange(store, node, input, cursor, vim, { kind: 'replace', count, character: event.key })
      return handled()
    }
    const find = { kind: awaiting, character: event.key } as VimFindCommand
    commandState.lastFind = find
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
    clearPending(commandState)
    if (event.key === 'e') {
      if (pending.operator !== undefined && !visual) {
        applyOperatorMotion(pending.operator, 'ge', totalCount)
      } else {
        const range = textMotion(node.text, motionCursor, 'ge', count)
        if (range !== undefined) move(range.target)
      }
    } else if (!visual && pending.operator === undefined && pending.count === '' && event.key === 'g')
      vim.moveBoundary('parent', cursor)
    else if (!visual && pending.count === '' && event.key === 'd') {
      store.enter()
      vim.syncImageCaretToFocus()
    }
    return handled()
  }

  if (pending.prefix === 'z') {
    clearPending(commandState)
    const fold = FOLD_COMMANDS[event.key]
    if (fold !== undefined) vim.fold(fold, node.id)
    return handled()
  }

  if (pending.prefix === 'i' || pending.prefix === 'a') {
    clearPending(commandState)
    if (isTextObjectKey(event.key)) {
      const motion = pending.prefix + event.key
      if (pending.operator !== undefined && !visual) {
        applyOperatorMotion(pending.operator, motion, totalCount)
      } else if (visual) {
        const range = textMotion(node.text, motionCursor, motion, count)
        if (range !== undefined) {
          commandState.visualAnchor = range.start
          commandState.visualFocus = Math.max(range.start, range.end - 1)
          setSelectionRange(input, range.start, range.end)
        }
      }
    }
    return handled()
  }

  if (/^[1-9]$/u.test(event.key) || (event.key === '0' && (pending.count !== '' || pending.motionCount !== ''))) {
    if (pending.operator !== undefined) pending.motionCount += event.key
    else pending.count += event.key
    commandState.pending = pending
    return handled()
  }

  if (pending.operator !== undefined) {
    if (pending.operator !== 's' && event.key === pending.operator && pending.motionCount === '') {
      clearPending(commandState)
      if (pending.operator === 'd') {
        const count = parseCount(pending.count)
        if (count === 1) {
          vim.register.current = { kind: 'node', value: cloneNode(node), sourceIds: [node.id] }
          if (store.deleteSelected()) recordRepeatChange(commandState, { kind: 'structural-delete' })
        } else {
          const source = selectedSiblingForest(store, node.id, count)
          if (source !== undefined) {
            vim.register.current = { kind: 'nodes', value: source }
            let deleted = 0
            while (deleted < source.nodes.length && store.deleteSelected()) deleted += 1
            if (deleted > 0) recordRepeatChange(commandState, { kind: 'structural-delete' })
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
        commandState.pending = pending
      } else
        commandState.pending = {
          count: '',
          motionCount: '',
          surround: { stage: 'target', operation: pending.operator === 'd' ? 'delete' : 'change', count },
        }
      return handled()
    }
    if (event.key === 's' && pending.operator === 's') {
      if (pending.count !== '' || pending.motionCount !== '') {
        clearPending(commandState)
        return handled()
      }
      const range = surroundLineRange(node.text)
      commandState.pending = {
        count: '',
        motionCount: '',
        surround: { stage: 'delimiter', start: range.start, end: range.end },
      }
      return handled()
    }
    if ('fFtT'.includes(event.key)) {
      pending.awaiting = event.key as 'f' | 'F' | 't' | 'T'
      commandState.pending = pending
      return handled()
    }
    if (event.key === 'g') {
      pending.prefix = 'g'
      commandState.pending = pending
      return handled()
    }
    if (event.key === 'i' || event.key === 'a') {
      pending.prefix = event.key
      commandState.pending = pending
      return handled()
    }
    if (event.key === ';' || event.key === ',') {
      const motion = repeatedFindMotion(commandState.lastFind, event.key === ',')
      clearPending(commandState)
      if (motion !== undefined) applyOperatorMotion(pending.operator, motion, totalCount)
      return handled()
    }
    clearPending(commandState)
    if (isTextMotion(event.key)) {
      if (node.attachment !== undefined && cursor === node.text.length) return handled()
      applyOperatorMotion(pending.operator, event.key, totalCount)
    }
    return handled()
  }

  if ('fFtT'.includes(event.key)) {
    pending.awaiting = event.key as 'f' | 'F' | 't' | 'T'
    commandState.pending = pending
    return handled()
  }
  if (event.key === ';' || event.key === ',') {
    clearPending(commandState)
    const motion = repeatedFindMotion(commandState.lastFind, event.key === ',')
    if (motion !== undefined) {
      const range = textMotion(node.text, motionCursor, motion, count)
      if (range !== undefined) move(range.target)
    }
    return handled()
  }
  if (!visual && event.key === 'r') {
    pending.awaiting = 'r'
    commandState.pending = pending
    return handled()
  }
  if (!visual && (event.key === 'd' || event.key === 'y' || event.key === 'c')) {
    pending.operator = event.key
    commandState.pending = pending
    return handled()
  }
  if (visual && (event.key === 'i' || event.key === 'a')) {
    pending.prefix = event.key
    commandState.pending = pending
    return handled()
  }
  clearPending(commandState)

  if (!visual && (event.key === 'h' || event.key === 'l')) {
    const next = horizontalCaretTransition(
      vim.getCaretState(node.id, cursor, input.classList.contains('node-input-image-caret')),
      event.key === 'h' ? 'left' : 'right',
      count,
      node.text.length,
      node.attachment !== undefined,
    )
    setNormalCaret(input, next.cursor)
    vim.applyCaretState(node.id, next)
  } else if (isTextMotion(event.key)) {
    const range = textMotion(node.text, motionCursor, event.key, count)
    if (range !== undefined) move(range.target)
  } else if (!visual && (event.key === 'i' || event.key === 'a' || event.key === 'I' || event.key === 'A')) {
    if (pending.count !== '') {
      clearPending(commandState)
      return handled()
    }
    const entry = event.key
    vim.beginInsert(node.id, node.text, insertPosition(node.text, cursor, entry), { kind: 'insert', entry })
    vim.setMode('insert')
    setCaret(input, insertPosition(node.text, cursor, entry))
  } else if (!visual && event.key === 'R') {
    if (pending.count !== '') {
      clearPending(commandState)
      return handled()
    }
    vim.beginReplace(node.id, input, node.text, cursor)
    vim.setMode('replace')
    setCaret(input, cursor)
  } else if (!visual && (event.key === 'o' || event.key === 'O')) {
    if (pending.count !== '') {
      clearPending(commandState)
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
        if (headingSelected) vim.beginStructuralChildOpen()
        else vim.beginStructuralOpen('after')
        vim.setMode('insert')
      }
    } else {
      if (headingSelected) return handled()
      if (store.createSibling('before')) {
        vim.beginStructuralOpen('before')
        vim.setMode('insert')
      }
    }
  } else if (!visual && event.key === 'v') {
    commandState.visualAnchor = cursor
    commandState.visualFocus = cursor
    vim.setMode('visual')
    setSelectionRange(input, cursor, Math.min(cursor + 1, node.text.length))
  } else if (!visual && event.key === 'V') {
    if (vim.nodeVisual.enter(node.id)) {
      setSelectionRange(input, cursor, cursor)
      vim.setMode('visual-node')
    }
  } else if (!visual && (event.key === 'j' || event.key === 'k')) {
    navigateVertically({
      store,
      node,
      caret: vim.getCaretState(node.id, cursor, input.classList.contains('node-input-image-caret')),
      direction: event.key === 'j' ? 'down' : 'up',
      count,
      setCaret: (nextCursor) => setNormalCaret(input, nextCursor),
      applyCaretState: vim.applyCaretState,
    })
  } else if (visual && event.key === 'v') {
    leaveVisual(vim, node, input, selection.start, node.text.length)
  } else if (visual && event.key === 'o') {
    const anchor = commandState.visualAnchor ?? selection.start
    const focus = commandState.visualFocus ?? selection.end - 1
    commandState.visualAnchor = focus
    commandState.visualFocus = anchor
    setSelectionRange(input, Math.min(anchor, focus), Math.max(anchor, focus) + 1)
  } else if (visual && (event.key === 'd' || event.key === 'y' || event.key === 'x')) {
    if (selection.start !== selection.end) {
      vim.register.current = { kind: 'text', value: node.text.slice(selection.start, selection.end) }
    }
    if (event.key !== 'y' && selection.start !== selection.end) {
      store.replaceTextRange(node.id, selection.start, selection.end, '')
      vim.imageTextCursor.current = undefined
      recordRepeatChange(commandState, { kind: 'delete', motion: 'x', count: selection.end - selection.start })
    } else setNormalCaret(input, selection.start)
    leaveVisual(
      vim,
      node,
      input,
      selection.start,
      node.text.length - (event.key === 'y' ? 0 : selection.end - selection.start),
    )
  } else if (visual && (event.key === 'c' || event.key === 's')) {
    if (selection.start !== selection.end) {
      vim.register.current = { kind: 'text', value: node.text.slice(selection.start, selection.end) }
      const nextText = node.text.slice(0, selection.start) + node.text.slice(selection.end)
      store.replaceTextRange(node.id, selection.start, selection.end, '')
      vim.beginInsert(node.id, nextText, selection.start, {
        kind: 'change',
        motion: 'x',
        count: selection.end - selection.start,
      })
      vim.scheduleCaret(input, selection.start)
    }
    clearVisualRange(commandState)
    vim.setMode('insert')
  } else if (visual && event.key === 'S') {
    if (selection.start !== selection.end)
      commandState.pending = {
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
      vim.imageTextCursor.current = undefined
      recordRepeatChange(commandState, {
        kind: 'overwrite',
        text: register.value,
        replaced: selection.end - selection.start,
      })
      leaveVisual(
        vim,
        node,
        input,
        selection.start + Math.max(0, register.value.length - 1),
        node.text.length - (selection.end - selection.start) + register.value.length,
      )
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
      clearPending(commandState)
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
      if (pasted)
        recordRepeatChange(commandState, {
          kind: 'structural-put',
          position: event.key === 'p' ? 'after' : 'before',
          source: cloneNode(register.value),
          sourceIds: register.sourceIds ?? [],
        })
    } else if (register.kind === 'nodes') {
      let pasted = false
      for (let index = 0; index < count; index += 1)
        pasted = store.pasteNodeForest(node.id, event.key === 'p' ? 'after' : 'before', register.value) || pasted
      if (pasted)
        recordRepeatChange(commandState, {
          kind: 'structural-forest-put',
          position: event.key === 'p' ? 'after' : 'before',
          source: register.value,
        })
    } else if (register.kind === 'text' && register.value !== '') {
      applyTextChange(store, node, input, cursor, vim, {
        kind: 'paste',
        after: event.key === 'p',
        text: register.value.repeat(count),
      })
    }
  } else if (!visual && event.key === '.') {
    const last = commandState.lastChange
    if (last !== undefined) {
      if (last.kind.startsWith('structural-')) {
        for (let index = 0; index < count; index += 1) vim.repeatStructural(last as VimStructuralChange)
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
      // An Insert-session-derived change (insert/change/substitute) records the node it was
      // captured on; a session that spanned a node change with no Escape to finish it in place
      // (e.g. Enter while still in Insert mode) must not replay onto whatever node is current now.
      const originNodeId = (last as { nodeId?: string }).nodeId
      if (originNodeId !== undefined && originNodeId !== node.id) return handled()
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
    commandState.pending = { count: pending.count, motionCount: '', prefix: 'g' }
  } else if (!visual && event.key === 'z') {
    // A count before a fold command is discarded: Vim's fold keys take no count, and keeping the
    // digits pending would let the following key be read as a command continuation.
    commandState.pending = { count: pending.count, motionCount: '', prefix: 'z' }
  } else if (!visual && event.key === 'G') {
    const state = store.getSnapshot()
    if (state.status === 'ready') {
      // `G` targets the focused node's own actual sibling level, not the current parent's
      // children, except when the editable current-parent heading itself is selected.
      const nodes =
        state.location.selectedNodeId === state.location.currentParentId
          ? displayedNodes(state.document, state.location.currentParentId)
          : requireNode(state.document, state.location.selectedNodeId).siblings
      const targetIndex = pending.count === '' ? nodes.length - 1 : Math.min(nodes.length - 1, Math.max(0, count - 1))
      const target = nodes[targetIndex]
      if (target !== undefined) vim.setImageCaret(target.id, target.attachment !== undefined)
    }
    if (pending.count === '') vim.moveBoundary('last', cursor)
    else vim.moveBoundary('last', cursor, count)
  } else if (!visual && event.key === 'u') {
    if (pending.count !== '') {
      clearPending(commandState)
      return handled()
    }
    store.undo()
    vim.syncImageCaretToFocus()
  } else if (!visual && (event.key === 'H' || event.key === 'M' || event.key === 'L')) {
    if (pending.count !== '') {
      clearPending(commandState)
      return handled()
    }
    vim.moveViewport(node.id, event.key === 'H' ? 'top' : event.key === 'M' ? 'middle' : 'bottom', cursor)
  } else if (!visual && event.key === 'Enter') {
    if (pending.count !== '') {
      clearPending(commandState)
      return handled()
    }
    if (node.attachment !== undefined && cursor === node.text.length) {
      vim.setImageCaret(node.id, true)
      vim.openAttachment(node.attachment.id)
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
  recordRepeatChange(vim.commandState, change)
  return { text: result.nextText, cursor: result.cursor }
}

function selectedSiblingForest(
  store: EditorStore,
  nodeId: string,
  count: number,
): { nodes: TreeNode[]; sourceIds: string[] } | undefined {
  const state = store.getSnapshot()
  if (state.status !== 'ready') return undefined
  // Counted `dd`/`yy` operate on the node's own actual siblings, whatever depth it is displayed at.
  const located = locateNode(state.document, nodeId)
  if (located === undefined) return undefined
  const selected = located.siblings.slice(located.index, located.index + count)
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
  if (result.nextText !== node.text) vim.imageTextCursor.current = undefined
  if (!replay && (change.kind === 'change' || change.kind === 'substitute')) {
    vim.beginInsert(node.id, result.nextText, result.start, change)
    vim.setMode('insert')
    vim.scheduleCaret(input, result.start)
  } else {
    const prior = vim.getCaretState(node.id, cursor, input.classList.contains('node-input-image-caret'))
    const next = editCaretTransition(prior, result.nextCursor, result.nextText.length, node.attachment !== undefined)
    vim.scheduleCaret(input, next.cursor)
    vim.applyCaretState(node.id, next)
    if (!replay && result.nextText !== node.text) recordRepeatChange(vim.commandState, change)
  }
  return {
    text: result.nextText,
    cursor: normalEditCursor(result.nextCursor, result.nextText.length, node.attachment !== undefined),
  }
}

function leaveVisual(
  vim: VimKeyboardState,
  node: TreeNode,
  input: HTMLElement,
  cursor: number,
  textLength: number,
): void {
  clearVisualRange(vim.commandState)
  vim.setMode('normal')
  const nextCursor = normalEditCursor(cursor, textLength, node.attachment !== undefined)
  syncImageCaretAtCursor(vim, node, input, nextCursor, textLength)
  vim.scheduleCaret(input, nextCursor)
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
  vim.imageTextCursor.current = undefined
  recordRepeatChange(vim.commandState, { kind: 'case', mode, count: selection.end - selection.start })
  // Vim leaves the cursor at the start of the operated range for a Visual-mode operator,
  // independent of the selection direction and of any length change from the case transform.
  leaveVisual(
    vim,
    node,
    input,
    selection.start,
    node.text.length - (selection.end - selection.start) + replacement.length,
  )
}
