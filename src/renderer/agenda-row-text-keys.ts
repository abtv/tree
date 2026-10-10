import type { VimTextCommandState } from './editor-input-handlers'
import { clearPending } from './vim-command-state'
import { moveWordBackward, moveWordEnd } from './vim-editing'
import type { VimFindCommand } from './vim-keyboard-types'
import { copyRange, clampCaret, maxOffset, selectionRange, type RowCaret, type RowCaretMode } from './agenda-row-caret'
import { isTextMotion, parseCount, repeatedFindMotion, textMotion } from './vim-text-commands'

export interface RowTextKeyContext {
  event: { key: string; shiftKey: boolean; altKey: boolean; ctrlKey: boolean; metaKey: boolean }
  vim: VimTextCommandState | undefined
  text: string
  caret: RowCaret
  setCaret: (caret: RowCaret) => void
  /** Writes plain text to the system clipboard. */
  copy: (text: string) => void
}

export function rowCaretMode(vim: VimTextCommandState | undefined): RowCaretMode {
  if (vim === undefined) return 'insert'
  if (vim.mode === 'normal') return 'normal'
  if (vim.mode === 'visual') return 'visual'
  return vim.mode === 'visual-node' ? 'hidden' : 'insert'
}

/**
 * Caret motion, selection and copy over the text of an Agenda row without an editor
 * (`docs/PRODUCT.md` §23.4). It never changes the document: every other key stays inert there.
 * Returns whether the key was consumed; the caller prevents the default action either way.
 */
export function handleRowTextKey(context: RowTextKeyContext): boolean {
  const { event, vim, text, setCaret, copy } = context
  const mode = rowCaretMode(vim)
  if (mode === 'hidden' || event.ctrlKey) return false
  const length = text.length
  const caret = clampCaret(context.caret, length, mode)
  const key = event.key
  const place = (anchor: number, focus: number): void => {
    const maximum = maxOffset(length, mode)
    setCaret({
      key: caret.key,
      anchor: Math.max(0, Math.min(anchor, maximum)),
      focus: Math.max(0, Math.min(focus, maximum)),
    })
  }
  const vimText = mode === 'normal' || mode === 'visual'
  if (event.metaKey) {
    if (event.altKey) return false
    const lower = key.toLowerCase()
    if (lower === 'c' && !event.shiftKey) {
      const range = copyRange(caret, length, mode)
      if (range.end > range.start) copy(text.slice(range.start, range.end))
      return true
    }
    if (lower === 'a' && !event.shiftKey) {
      if (length === 0) return true
      if (vimText) {
        vim?.setMode('visual')
        place(0, length - 1)
      } else place(0, length)
      return true
    }
    if (!vimText && (key === 'ArrowLeft' || key === 'ArrowRight')) {
      const target = key === 'ArrowLeft' ? 0 : length
      place(event.shiftKey ? caret.anchor : target, target)
      return true
    }
    return false
  }
  if (!vimText) return handleThinKey(context, caret, place)
  if (event.altKey) return false
  const commandState = vim!.commandState
  const pending = commandState.pending
  const visual = mode === 'visual'
  const move = (target: number): void => {
    if (visual) place(caret.anchor, target)
    else place(target, target)
  }
  const motion = (name: string, count: number): void => {
    const range = textMotion(text, caret.focus, name, count)
    if (range !== undefined) move(range.target)
  }
  if (pending?.awaiting !== undefined) {
    const awaiting = pending.awaiting
    clearPending(commandState)
    if (key.length === 1 && awaiting !== 'r') {
      const find = { kind: awaiting, character: key } as VimFindCommand
      commandState.lastFind = find
      motion(awaiting + key, parseCount(pending.count))
    }
    return true
  }
  if (pending?.prefix === 'g') {
    if (key !== 'e') return false
    clearPending(commandState)
    motion('ge', parseCount(pending.count))
    return true
  }
  if (pending !== undefined && (pending.prefix !== undefined || pending.operator !== undefined)) return false
  if ('fFtT'.includes(key) && key.length === 1) {
    commandState.pending = { count: pending?.count ?? '', motionCount: '', awaiting: key as 'f' | 'F' | 't' | 'T' }
    return true
  }
  if (key === 'r' && !visual) {
    commandState.pending = { count: pending?.count ?? '', motionCount: '', awaiting: 'r' }
    return true
  }
  const count = parseCount(pending?.count ?? '')
  if (key === ';' || key === ',') {
    clearPending(commandState)
    const repeated = repeatedFindMotion(commandState.lastFind, key === ',')
    if (repeated !== undefined) motion(repeated, count)
    return true
  }
  if (isTextMotion(key)) {
    clearPending(commandState)
    motion(key, count)
    return true
  }
  if (key === 'v') {
    clearPending(commandState)
    if (visual) {
      vim!.setMode('normal')
      place(caret.focus, caret.focus)
    } else {
      vim!.setMode('visual')
      place(caret.focus, caret.focus)
    }
    return true
  }
  if (visual && key === 'o') {
    clearPending(commandState)
    place(caret.focus, caret.anchor)
    return true
  }
  if (visual && key === 'y') {
    clearPending(commandState)
    const range = selectionRange(caret, length, mode)
    if (range.end > range.start) {
      const yanked = text.slice(range.start, range.end)
      if (vim!.register !== undefined) vim!.register.current = { kind: 'text', value: yanked }
      copy(yanked)
    }
    vim!.setMode('normal')
    place(range.start, range.start)
    return true
  }
  return false
}

function handleThinKey(
  context: RowTextKeyContext,
  caret: RowCaret,
  place: (anchor: number, focus: number) => void,
): boolean {
  const { event, text } = context
  const key = event.key
  const length = text.length
  const start = Math.min(caret.anchor, caret.focus)
  const end = Math.max(caret.anchor, caret.focus)
  const extend = (focus: number): void => place(event.shiftKey ? caret.anchor : focus, focus)
  if (key === 'Home' || key === 'End') {
    extend(key === 'Home' ? 0 : length)
    return true
  }
  if (key !== 'ArrowLeft' && key !== 'ArrowRight') return false
  const left = key === 'ArrowLeft'
  if (event.altKey) {
    extend(left ? moveWordBackward(text, caret.focus) : Math.min(length, moveWordEnd(text, caret.focus) + 1))
    return true
  }
  if (!event.shiftKey && start !== end) {
    place(left ? start : end, left ? start : end)
    return true
  }
  extend(adjacentBoundary(text, caret.focus, left ? -1 : 1))
  return true
}

/** The next caret position by user-perceived character, so an emoji or a combined letter is one step. */
export function adjacentBoundary(text: string, offset: number, direction: -1 | 1): number {
  const boundaries = [0]
  for (const { index, segment } of new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text))
    boundaries.push(index + segment.length)
  if (direction === 1) return boundaries.find((boundary) => boundary > offset) ?? text.length
  return boundaries.findLast((boundary) => boundary < offset) ?? 0
}
