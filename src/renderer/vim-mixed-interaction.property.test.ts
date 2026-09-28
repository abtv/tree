// @vitest-environment jsdom

import type { KeyboardEvent } from 'react'
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { EditorStore, type EditorServices } from '../application/editor-store'
import { requireNode, type Document, type TreeNode } from '../domain/document'
import { createEditorKeyDownHandler } from './editor-input-handlers'
import { setNormalCaret } from './editor-dom'
import { focusCaretTransition, pointerCaretTransition, type VimCaretState } from './vim-caret-transition'
import type { VimKeyboardState } from './vim-keyboard-types'
import { createVimKeyboardDouble } from './test/vim-keyboard-double'

type Event =
  | { kind: 'motion'; key: 'h' | 'l' | 'j' | 'k' | '0' | '$'; count: number }
  | { kind: 'delete'; count: number }
  | { kind: 'replace-character'; count: number; character: 'Z' | 'q' }
  | { kind: 'focus'; index: number; position: number }
  | { kind: 'interrupt'; count: number }
  | { kind: 'history'; direction: 'undo' | 'redo'; shortcut: boolean }

type Spec = { text: string; image: boolean }

interface Expected {
  texts: string[]
  index: number
  cursor: number
  image: boolean
  returned: number | undefined
  past: string[][]
  future: string[][]
}

const maximum = (spec: Spec, text: string): number => (spec.image ? text.length : Math.max(0, text.length - 1))

function expectedStep(state: Expected, specs: readonly Spec[], event: Event): void {
  const spec = specs[state.index]!
  const text = state.texts[state.index]!
  const length = text.length
  if (event.kind === 'focus') {
    state.index = event.index % specs.length
    state.cursor = Math.min(event.position, maximum(specs[state.index]!, state.texts[state.index]!))
    state.image = specs[state.index]!.image && state.cursor === state.texts[state.index]!.length
    state.returned = undefined
    return
  }
  if (event.kind === 'interrupt') return
  if (event.kind === 'history') {
    const source = event.direction === 'undo' ? state.past : state.future
    const target = event.direction === 'undo' ? state.future : state.past
    const prior = source.pop()
    if (prior === undefined) return
    const outgoing = [...state.texts]
    target.push(outgoing)
    state.texts = prior
    // Undo and redo select the change and put the caret at its start, then the ordinary focus
    // transition clamps that offset and decides whether the node's image becomes the active caret.
    const changed = prior.findIndex((value, index) => value !== outgoing[index])
    if (changed < 0) {
      state.cursor = 0
      state.image = specs[state.index]!.image && state.texts[state.index]!.length === 0
      state.returned = undefined
      return
    }
    state.index = changed
    const restored = prior[changed]!
    let offset = 0
    while (
      offset < restored.length &&
      offset < outgoing[changed]!.length &&
      restored[offset] === outgoing[changed]![offset]
    )
      offset += 1
    state.image = specs[changed]!.image && offset >= restored.length
    state.cursor = state.image ? restored.length : Math.min(offset, Math.max(0, restored.length - 1))
    state.returned = undefined
    return
  }
  if (event.kind === 'replace-character') {
    if (state.cursor + event.count > length) return
    const replacement = event.character.repeat(event.count)
    const next = text.slice(0, state.cursor) + replacement + text.slice(state.cursor + event.count)
    if (next !== text) {
      state.past.push([...state.texts])
      state.future = []
      state.texts[state.index] = next
    }
    state.cursor += event.count - 1
    state.image = false
    state.returned = undefined
    return
  }
  if (event.kind === 'delete') {
    const end = Math.min(length, state.cursor + event.count)
    if (end > state.cursor) {
      state.past.push([...state.texts])
      state.future = []
      state.texts[state.index] = text.slice(0, state.cursor) + text.slice(end)
      state.cursor = Math.min(state.cursor, maximum(spec, state.texts[state.index]!))
      state.image = spec.image && state.cursor === state.texts[state.index]!.length
      state.returned =
        state.image && state.texts[state.index]!.length > 0 ? state.texts[state.index]!.length - 1 : undefined
    }
    return
  }
  const { key, count } = event
  if (key === '0' || key === '$') {
    state.cursor = key === '0' ? 0 : Math.max(0, length - 1)
    state.image = spec.image && state.cursor === length
    state.returned = undefined
    return
  }
  if (key === 'h') {
    if (state.image && length > 0) {
      state.cursor = Math.max(0, (state.returned ?? length - 1) - count + 1)
      state.image = false
      state.returned = undefined
    } else state.cursor = Math.max(0, state.cursor - count)
    return
  }
  if (key === 'l') {
    const old = state.cursor
    state.cursor = Math.min(maximum(spec, text), old + count)
    if (spec.image && !state.image && state.cursor === length && length > 0)
      state.returned = Math.min(length - 1, old + count - 1)
    state.image = spec.image && state.cursor === length
    return
  }
  let navigationCursor = state.cursor
  for (let step = 0; step < count; step += 1) {
    const current = specs[state.index]!
    const currentLength = state.texts[state.index]!.length
    if (step === 0 && key === 'j' && current.image && !state.image && state.cursor < currentLength) {
      state.returned = state.cursor
      state.cursor = currentLength
      state.image = true
      navigationCursor = currentLength
      continue
    }
    if (step === 0 && key === 'k' && current.image && state.image && currentLength > 0) {
      state.cursor = state.returned ?? currentLength - 1
      state.image = false
      state.returned = undefined
      navigationCursor = state.cursor
      continue
    }
    const nextIndex = state.index + (key === 'j' ? 1 : -1)
    if (nextIndex < 0 || nextIndex >= specs.length) break
    const requested = step === 0 ? (key === 'j' && state.image ? 0 : state.cursor) : navigationCursor
    if (step === 0 && key === 'j' && state.image) navigationCursor = 0
    state.index = nextIndex
    const destination = specs[nextIndex]!
    const destinationLength = state.texts[nextIndex]!.length
    state.image = destination.image && (key === 'k' || requested >= destinationLength)
    state.cursor = state.image ? destinationLength : Math.min(requested, Math.max(0, destinationLength - 1))
    state.returned =
      state.image && key === 'k' && destinationLength > 0 ? Math.min(requested, destinationLength - 1) : undefined
  }
}

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

const eventArbitrary: fc.Arbitrary<Event> = fc.oneof(
  {
    weight: 5,
    arbitrary: fc.record({
      kind: fc.constant('motion' as const),
      key: fc.constantFrom<'h' | 'l' | 'j' | 'k'>('h', 'l', 'j', 'k'),
      count: fc.integer({ min: 1, max: 12 }),
    }),
  },
  {
    weight: 1,
    arbitrary: fc.record({
      kind: fc.constant('motion' as const),
      key: fc.constantFrom<'0' | '$'>('0', '$'),
      count: fc.constant(1),
    }),
  },
  { weight: 2, arbitrary: fc.record({ kind: fc.constant('delete' as const), count: fc.integer({ min: 1, max: 8 }) }) },
  {
    weight: 2,
    arbitrary: fc.record({
      kind: fc.constant('replace-character' as const),
      count: fc.integer({ min: 1, max: 6 }),
      character: fc.constantFrom<'Z' | 'q'>('Z', 'q'),
    }),
  },
  { weight: 2, arbitrary: fc.record({ kind: fc.constant('focus' as const), index: fc.nat(8), position: fc.nat(12) }) },
  {
    weight: 1,
    arbitrary: fc.record({ kind: fc.constant('interrupt' as const), count: fc.integer({ min: 1, max: 9 }) }),
  },
  {
    weight: 2,
    arbitrary: fc.record({
      kind: fc.constant('history' as const),
      direction: fc.constantFrom<'undo' | 'redo'>('undo', 'redo'),
      shortcut: fc.boolean(),
    }),
  },
)

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

  it('matches the model after every event with a fixed, replayable seed', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.record({ text: fc.string({ maxLength: 5 }), image: fc.boolean() }), { minLength: 1, maxLength: 4 }),
        fc.nat(6),
        fc.nat(8),
        fc.array(eventArbitrary, { minLength: 1, maxLength: 22 }),
        assertSequence,
      ),
      { seed: 711_207, numRuns: 80, endOnFailure: true },
    )
  })
})
