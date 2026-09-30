// @vitest-environment jsdom

import { act, cleanup, renderHook } from '@testing-library/react'
import fc from 'fast-check'
import { useState, useSyncExternalStore } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { propertyRuns } from '../test/property-runs'
import type { TreeNode } from '../domain/document'
import { getCaret } from './editor-dom'
import { createRealStoreHarness } from './test/real-store-harness'
import {
  expectedStep,
  maximum,
  sequenceEventArbitrary,
  type SequenceEvent,
  type SequenceExpected,
  type SequenceSpec,
} from './test/vim-sequence-model'
import { useNodeInputBindings } from './use-node-input-bindings'
import type { VimMode } from './vim-editing'

// These sequences run the production hook against a real EditorStore. Its focus effects, deferred
// projection, and command handlers apply the caret themselves, so a competing or omitted
// projection fails here even though the handler-level fixtures paint the caret on its behalf. The
// oracle is the independent model shared with the handler-level property suite. jsdom cannot
// replace the Electron specs for native focus, real rendering, or textarea/contenteditable
// differences.

beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }))

afterEach(() => {
  cleanup()
  document.body.replaceChildren()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

interface Step {
  event: SequenceEvent
  /** Run the queued deferred work right after the event. Otherwise it stays queued until a later step. */
  flush: boolean
}

async function assertHookSequence(
  specs: SequenceSpec[],
  startIndex: number,
  startPosition: number,
  steps: Step[],
): Promise<void> {
  const tasks: (() => void)[] = []
  vi.stubGlobal('queueMicrotask', (task: () => void) => tasks.push(task))
  const nodes: TreeNode[] = specs.map((spec, index) => ({
    id: `n${index}`,
    text: spec.text,
    ...(spec.image ? { attachment: { id: `a${index}`, mimeType: 'image/png' as const } } : {}),
    children: [],
  }))
  const initialIndex = startIndex % specs.length
  const harness = await createRealStoreHarness({
    document: { roots: nodes },
    location: { currentParentId: null, selectedNodeId: nodes[initialIndex]!.id },
  })
  const { store } = harness
  const preview = vi.fn()
  const hook = renderHook(() => {
    const state = useSyncExternalStore(store.subscribe, store.getSnapshot)
    const [vimMode, setVimMode] = useState<VimMode>('normal')
    const [selection, setNodeVisualSelection] = useState<{ anchorId: string; focusId: string }>()
    const [imageCaretNodeId, setImageCaretNodeId] = useState<string>()
    const binding = useNodeInputBindings({
      store,
      selectedNodeId: state.status === 'ready' ? state.location.selectedNodeId : undefined,
      focus: state.status === 'ready' ? state.focus : undefined,
      persistenceLocked: state.status === 'ready' && state.persistenceLocked === true,
      vimMode,
      setVimMode,
      nodeVisualSelection: selection,
      setNodeVisualSelection,
      setImageCaretNodeId,
      onPreviewAttachment: preview,
      onFoldCommand: (command, id) => store.applyFold(command, id),
    })
    return { ...binding, vimMode, imageCaretNodeId }
  })
  const inputs = nodes.map((node) => {
    const row = document.createElement('div')
    row.className = 'node-row'
    row.dataset.nodeId = node.id
    if (node.attachment !== undefined) row.dataset.hasAttachment = 'true'
    const input = document.createElement('textarea')
    input.value = node.text
    row.append(input)
    document.body.append(row)
    hook.result.current.bindings(node).inputRef(input)
    return input
  })
  const currentNode = (index: number): TreeNode => harness.node(nodes[index]!.id)
  const selectedIndex = (): number => nodes.findIndex((node) => node.id === harness.snapshot().location.selectedNodeId)
  // React owns the rendered text and the image class; the hook owns the caret. The text reaches the
  // DOM when the store notifies, before the hook's effects run, as a controlled input's render does.
  const syncText = (): void => {
    const state = store.getSnapshot()
    if (state.status !== 'ready') return
    for (const [index, input] of inputs.entries()) {
      const text = currentNode(index).text
      if (input.value !== text) input.value = text
    }
  }
  store.subscribe(syncText)
  const syncView = (): void => {
    syncText()
    for (const [index, input] of inputs.entries())
      input.classList.toggle('node-input-image-caret', hook.result.current.imageCaretNodeId === nodes[index]!.id)
  }
  const flush = (): void => {
    act(() => tasks.splice(0).forEach((task) => task()))
    syncView()
  }
  const press = (key: string, modifiers: { metaKey?: boolean; ctrlKey?: boolean; shiftKey?: boolean } = {}): void => {
    const index = selectedIndex()
    act(() =>
      hook.result.current.bindings(currentNode(index)).onKeyDown({
        currentTarget: inputs[index],
        key,
        metaKey: false,
        ctrlKey: false,
        altKey: false,
        preventDefault: () => undefined,
        ...modifiers,
      } as never),
    )
    syncView()
  }

  const initialCursor = Math.min(startPosition, maximum(specs[initialIndex]!, specs[initialIndex]!.text))
  inputs[initialIndex]!.setSelectionRange(initialCursor, initialCursor)
  act(() => store.selectNode(nodes[initialIndex]!.id, initialCursor))
  flush()
  const expected: SequenceExpected = {
    texts: specs.map((spec) => spec.text),
    index: initialIndex,
    cursor: initialCursor,
    image: specs[initialIndex]!.image && initialCursor === specs[initialIndex]!.text.length,
    returned: undefined,
    past: [],
    future: [],
  }

  const assertState = (context: string): void => {
    expect(
      harness.snapshot().document.roots.map((node) => node.text),
      `${context} texts`,
    ).toEqual(expected.texts)
    expect(selectedIndex(), `${context} selected node`).toBe(expected.index)
    expect(document.activeElement, `${context} focus`).toBe(inputs[expected.index])
    expect(hook.result.current.vimMode, `${context} mode`).toBe('normal')
    expect(getCaret(inputs[expected.index]!), `${context} DOM cursor`).toBe(expected.cursor)
    expect(hook.result.current.imageCaretNodeId, `${context} image`).toBe(
      expected.image ? nodes[expected.index]!.id : undefined,
    )
  }
  // The next command reads the caret the hook resolved, so Enter is the observable probe: it opens
  // the preview exactly when the model says the image is the active character.
  const assertCommandTarget = (context: string): void => {
    const before = preview.mock.calls.length
    press('Enter')
    expect(preview.mock.calls.length - before, `${context} Enter preview`).toBe(expected.image ? 1 : 0)
    expect(
      harness.snapshot().document.roots.map((node) => node.text),
      `${context} texts after Enter`,
    ).toEqual(expected.texts)
  }

  try {
    assertState('initial')
    for (const [step, { event, flush: flushAfter }] of steps.entries()) {
      expectedStep(expected, specs, event)
      if (event.kind === 'focus') {
        const index = event.index % specs.length
        const position = Math.min(event.position, maximum(specs[index]!, expected.texts[index]!))
        if (index === selectedIndex()) {
          inputs[index]!.setSelectionRange(position, position)
          act(() =>
            hook.result.current.bindings(currentNode(index)).onMouseDown({ currentTarget: inputs[index] } as never),
          )
          act(() =>
            hook.result.current.bindings(currentNode(index)).onMouseUp({ currentTarget: inputs[index] } as never),
          )
          syncView()
        } else {
          act(() => store.selectNode(nodes[index]!.id, position))
          syncView()
        }
      } else if (event.kind === 'history') {
        if (event.shortcut) press('z', { metaKey: true, shiftKey: event.direction === 'redo' })
        else if (event.direction === 'undo') press('u')
        else press('r', { ctrlKey: true })
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
      const context = `step ${step}: ${JSON.stringify(event)}`
      assertState(context)
      if (flushAfter) {
        flush()
        assertState(`${context} after deferred work`)
        // Enter on an active image republishes the caret, which cancels queued work, so the probe
        // runs only once that work has been flushed.
        assertCommandTarget(context)
      }
    }
    // Work still queued from earlier steps must not override the final intent.
    flush()
    assertState('final deferred work')
    assertCommandTarget('final')
  } finally {
    hook.unmount()
  }
}

const stepArbitrary: fc.Arbitrary<Step> = fc.record({ event: sequenceEventArbitrary, flush: fc.boolean() })

describe('production hook sequences against an independent model', () => {
  it('keeps an upward image destination actionable while its focus work is still queued', async () => {
    await assertHookSequence(
      [
        { text: 'Texted', image: true },
        { text: 'xy', image: true },
      ],
      1,
      0,
      [
        { event: { kind: 'motion', key: 'j', count: 1 }, flush: false },
        { event: { kind: 'motion', key: 'k', count: 1 }, flush: false },
        { event: { kind: 'motion', key: 'k', count: 1 }, flush: true },
        { event: { kind: 'motion', key: 'j', count: 1 }, flush: false },
      ],
    )
  })

  it('keeps a pointer placement and a following count over queued focus work', async () => {
    await assertHookSequence(
      [
        { text: 'abcdef', image: true },
        { text: 'gh', image: false },
      ],
      0,
      1,
      [
        { event: { kind: 'focus', index: 1, position: 1 }, flush: false },
        { event: { kind: 'focus', index: 0, position: 3 }, flush: false },
        { event: { kind: 'motion', key: 'l', count: 9 }, flush: false },
        { event: { kind: 'focus', index: 0, position: 2 }, flush: true },
        { event: { kind: 'delete', count: 2 }, flush: false },
        { event: { kind: 'history', direction: 'undo', shortcut: true }, flush: true },
      ],
    )
  })

  it('matches the model after every event, with deferred work flushed at arbitrary points', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.record({ text: fc.string({ maxLength: 5 }), image: fc.boolean() }), { minLength: 1, maxLength: 4 }),
        fc.nat(6),
        fc.nat(8),
        fc.array(stepArbitrary, { minLength: 1, maxLength: 16 }),
        assertHookSequence,
      ),
      { numRuns: propertyRuns(40), endOnFailure: true },
    )
  })
})
