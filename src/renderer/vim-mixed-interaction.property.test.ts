// @vitest-environment jsdom

import type { KeyboardEvent } from 'react'
import fc from 'fast-check'
import { propertyRuns } from '../test/property-runs'
import { describe, expect, it } from 'vitest'
import { EditorStore, type EditorServices } from '../application/editor-store'
import { requireNode, type Document, type TreeNode } from '../domain/document'
import { createEditorKeyDownHandler } from './editor-input-handlers'
import { setNormalCaret } from './editor-dom'
import { focusCaretTransition, pointerCaretTransition, type VimCaretState } from './vim-caret-transition'
import type { VimKeyboardState } from './vim-keyboard-types'
import { createVimKeyboardDouble } from './test/vim-keyboard-double'
import {
  expectedStep,
  maximum,
  sequenceEventArbitrary as eventArbitrary,
  type SequenceEvent as Event,
  type SequenceExpected as Expected,
  type SequenceSpec as Spec,
} from './test/vim-sequence-model'

async function assertSequence(
  specs: Spec[],
  startIndex: number,
  startPosition: number,
  events: Event[],
): Promise<void> {
  const nodes: TreeNode[] = specs.map((spec, index) => ({
    id: `n${index}`,
    text: spec.text,
    ...(spec.image ? { attachment: { id: `a${index}`, mimeType: 'image/png' as const } } : {}),
    children: [],
  }))
  const initialIndex = startIndex % specs.length
  const initialCursor = Math.min(startPosition, maximum(specs[initialIndex]!, specs[initialIndex]!.text))
  const documentTree: Document = { roots: nodes }
  const services: EditorServices = {
    load: async () => ({
      version: 1,
      document: documentTree,
      location: { currentParentId: null, selectedNodeId: nodes[initialIndex]!.id },
    }),
    save: async () => undefined,
    readClipboard: async () => ({ kind: 'text', text: '' }),
    writeAttachment: async () => undefined,
    cleanupAttachments: async () => undefined,
  }
  const clock = { setTimeout: () => 0, clearTimeout: () => undefined }
  const store = new EditorStore(services, () => 'unused', clock)
  await store.initialize()
  const inputs = nodes.map((node) => {
    const row = document.createElement('div')
    row.className = 'node-row'
    row.dataset.hasAttachment = String(node.attachment !== undefined)
    const input = document.createElement('textarea')
    input.value = node.text
    row.append(input)
    document.body.append(row)
    return input
  })
  let caret: VimCaretState = {
    cursor: initialCursor,
    imageActive: specs[initialIndex]!.image && initialCursor === specs[initialIndex]!.text.length,
  }
  const initialSnapshot = store.getSnapshot()
  let focusToken = initialSnapshot.status === 'ready' ? initialSnapshot.focus.token : 0
  let mode: VimKeyboardState['mode'] = 'normal'
  const selectedIndex = (): number => {
    const state = store.getSnapshot()
    if (state.status !== 'ready') throw new Error('Store did not initialize')
    return nodes.findIndex((node) => node.id === state.location.selectedNodeId)
  }
  const paint = (): void => {
    const index = selectedIndex()
    for (const [position, input] of inputs.entries())
      input.classList.toggle('node-input-image-caret', position === index && caret.imageActive)
    setNormalCaret(inputs[index]!, caret.cursor)
    inputs[index]!.focus()
  }
  const syncFocus = (): void => {
    const state = store.getSnapshot()
    if (state.status !== 'ready') return
    for (const [index, input] of inputs.entries()) {
      const current = requireNode(state.document, nodes[index]!.id).node.text
      if (input.value !== current) input.value = current
    }
    if (state.focus.token === focusToken) return
    focusToken = state.focus.token
    const index = selectedIndex()
    caret = focusCaretTransition(caret, state.focus.cursor, inputs[index]!.value.length, specs[index]!.image, true)
    paint()
  }
  store.subscribe(syncFocus)
  const vim: VimKeyboardState = {
    ...createVimKeyboardDouble('node').vim,
    mode,
    imageTextCursor: { current: undefined },
    getCaretState: () => caret,
    applyCaretState: (_nodeId, next) => {
      caret = next
      vim.imageTextCursor.current = next.imageTextReturnCursor
      paint()
    },
    syncImageCaretToFocus: syncFocus,
    setMode: (next) => {
      mode = next
      vim.mode = next
    },
    setImageCaret: (_nodeId, active) => {
      caret = { ...caret, imageActive: active }
      paint()
    },
    scheduleCaret: (input, position) => setNormalCaret(input, position),
  }
  const expected: Expected = {
    texts: specs.map((spec) => spec.text),
    index: initialIndex,
    cursor: initialCursor,
    image: caret.imageActive,
    returned: undefined,
    past: [],
    future: [],
  }
  paint()
  const press = (key: string, metaKey = false, ctrlKey = false, shiftKey = false): void => {
    const state = store.getSnapshot()
    if (state.status !== 'ready') throw new Error('Store did not initialize')
    const index = selectedIndex()
    const node = requireNode(state.document, nodes[index]!.id).node
    const handler = createEditorKeyDownHandler({
      store,
      node,
      isComposing: () => false,
      setSelectAllNodeId: () => undefined,
      onPreviewAttachment: () => undefined,
      shiftFocusedNode: () => undefined,
      vim,
    })
    handler({
      currentTarget: inputs[index]!,
      key,
      metaKey,
      ctrlKey,
      shiftKey,
      altKey: false,
      preventDefault: () => undefined,
    } as unknown as KeyboardEvent<HTMLElement>)
  }
  try {
    for (const [step, event] of events.entries()) {
      expectedStep(expected, specs, event)
      if (event.kind === 'focus') {
        const index = event.index % specs.length
        store.selectNode(nodes[index]!.id, Math.min(event.position, maximum(specs[index]!, expected.texts[index]!)))
        caret = pointerCaretTransition(caret, event.position, expected.texts[index]!.length, specs[index]!.image)
        vim.imageTextCursor.current = caret.imageTextReturnCursor
        paint()
        vim.commandState.pending = undefined
      } else if (event.kind === 'history') {
        if (event.shortcut) press('z', true, false, event.direction === 'redo')
        else if (event.direction === 'undo') press('u')
        else press('r', false, true)
      } else if (event.kind === 'interrupt') {
        press(String(event.count))
        press('Escape')
      } else if (event.kind === 'replace-character') {
        if (event.count > 1) for (const digit of String(event.count)) press(digit)
        press('r')
        press(event.character)
      } else {
        if (event.count > 1) for (const digit of String(event.count)) press(digit)
        press(event.kind === 'delete' ? 'x' : event.key)
      }
      const state = store.getSnapshot()
      if (state.status !== 'ready') throw new Error('Store left ready state')
      const context = `step ${step}: ${JSON.stringify(event)}`
      expect(
        state.document.roots.map((node) => node.text),
        `${context} texts`,
      ).toEqual(expected.texts)
      expect(selectedIndex(), `${context} selected node`).toBe(expected.index)
      expect(document.activeElement, `${context} focus`).toBe(inputs[expected.index])
      expect(mode, `${context} mode`).toBe('normal')
      expect(vim.commandState.pending, `${context} pending`).toBeUndefined()
      expect(caret.cursor, `${context} cursor`).toBe(expected.cursor)
      expect(caret.imageActive, `${context} image`).toBe(expected.image)
      expect(caret.imageTextReturnCursor, `${context} return`).toBe(expected.returned)
      expect(inputs[expected.index]!.selectionStart, `${context} DOM cursor`).toBe(expected.cursor)
    }
  } finally {
    for (const input of inputs) input.parentElement?.remove()
  }
}

describe('mixed Vim event sequences against an independent model', () => {
  // Found by seed 711207, path "20": a second undo consumed a duplicate history entry.
  it('undoes each of two separate Vim replacements exactly once', async () => {
    await assertSequence(
      [
        { text: 'ab', image: false },
        { text: 'cd', image: true },
      ],
      0,
      1,
      [
        { kind: 'replace-character', count: 1, character: 'q' },
        { kind: 'focus', index: 1, position: 1 },
        { kind: 'replace-character', count: 1, character: 'Z' },
        { kind: 'history', direction: 'undo', shortcut: true },
        { kind: 'history', direction: 'undo', shortcut: true },
      ],
    )
  })

  it('keeps a deterministic cross-node image, edit, interruption, and history trace', async () => {
    await assertSequence(
      [
        { text: 'abc', image: true },
        { text: '', image: true },
        { text: 'xy', image: false },
      ],
      0,
      1,
      [
        { kind: 'motion', key: 'j', count: 2 },
        { kind: 'motion', key: 'k', count: 2 },
        { kind: 'interrupt', count: 4 },
        { kind: 'focus', index: 0, position: 2 },
        { kind: 'delete', count: 1 },
        { kind: 'history', direction: 'undo', shortcut: false },
        { kind: 'history', direction: 'redo', shortcut: true },
        { kind: 'replace-character', count: 1, character: 'Z' },
        { kind: 'history', direction: 'undo', shortcut: true },
        { kind: 'delete', count: 1 },
        { kind: 'history', direction: 'redo', shortcut: false },
      ],
    )
  })

  it('matches the model after every event', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.record({ text: fc.string({ maxLength: 5 }), image: fc.boolean() }), { minLength: 1, maxLength: 4 }),
        fc.nat(6),
        fc.nat(8),
        fc.array(eventArbitrary, { minLength: 1, maxLength: 22 }),
        assertSequence,
      ),
      { numRuns: propertyRuns(80), endOnFailure: true },
    )
  })
})
