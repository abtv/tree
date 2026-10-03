// @vitest-environment jsdom

import { act, cleanup, fireEvent, renderHook } from '@testing-library/react'
import { useState, useSyncExternalStore } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EditorStore } from '../application/editor-store'
import { MAX_DOCUMENT_DEPTH_ERROR, type TreeNode } from '../domain/document'
import { createEditorStoreDouble } from './test/editor-store-double'
import { createRealStoreHarness, type RealStoreOptions } from './test/real-store-harness'
import { useNodeInputBindings } from './use-node-input-bindings'
import type { VimMode } from './vim-editing'
import { getCaret, setCaret } from './editor-dom'

beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }))

afterEach(() => {
  cleanup()
  document.body.replaceChildren()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

const node = (id: string, text: string, children: TreeNode[] = []): TreeNode => ({ id, text, children })
const image = (text = 'ab'): TreeNode => ({ ...node('node', text), attachment: { id: 'image', mimeType: 'image/png' } })

async function fixture(options: RealStoreOptions & { mode?: VimMode; vimEnabled?: boolean } = {}) {
  const harness = await createRealStoreHarness(options)
  const { store } = harness
  const preview = vi.fn()
  const hook = renderHook(() => {
    const state = useSyncExternalStore(store.subscribe, store.getSnapshot)
    const [vimMode, setVimMode] = useState<VimMode>(options.mode ?? 'normal')
    const [selection, setNodeVisualSelection] = useState<{ anchorId: string; focusId: string }>()
    const [imageCaretNodeId, setImageCaretNodeId] = useState<string>()
    const binding = useNodeInputBindings({
      store,
      selectedNodeId: state.status === 'ready' ? state.location.selectedNodeId : undefined,
      focus: state.status === 'ready' ? state.focus : undefined,
      persistenceLocked: state.status === 'ready' && state.persistenceLocked === true,
      vimEnabled: options.vimEnabled ?? true,
      vimMode,
      setVimMode,
      nodeVisualSelection: selection,
      setNodeVisualSelection,
      setImageCaretNodeId,
      onPreviewAttachment: preview,
      onFoldCommand: (command, id) => store.applyFold(command, id),
    })
    return { ...binding, vimMode, selection, imageCaretNodeId, setVimMode }
  })
  const inputs = new Map<string, HTMLTextAreaElement>()
  const input = (id = harness.snapshot().location.selectedNodeId) => {
    let element = inputs.get(id)
    if (element === undefined) {
      const current = harness.node(id)
      const row = document.createElement('div')
      row.className = 'node-row'
      row.dataset.nodeId = id
      if (current.attachment !== undefined) row.dataset.hasAttachment = 'true'
      element = document.createElement('textarea')
      element.value = current.text
      row.append(element)
      document.body.append(row)
      hook.result.current.bindings(current).inputRef(element)
      inputs.set(id, element)
    }
    return element
  }
  const bindings = (id = harness.snapshot().location.selectedNodeId) => hook.result.current.bindings(harness.node(id))
  const sync = () => {
    const find = (nodes: readonly TreeNode[], id: string): TreeNode | undefined => {
      for (const item of nodes) {
        if (item.id === id) return item
        const child = find(item.children, id)
        if (child !== undefined) return child
      }
      return undefined
    }
    for (const [id, element] of inputs) {
      // Replace holds its draft in the DOM until the session finishes.
      if (hook.result.current.vimMode !== 'replace') {
        const current = find(harness.snapshot().document.roots, id)
        if (current !== undefined && element.value !== current.text) {
          const cursor = element.selectionStart
          element.value = current.text
          element.setSelectionRange(cursor, cursor)
        }
      }
      element.classList.toggle('node-input-image-caret', hook.result.current.imageCaretNodeId === id)
    }
  }
  const press = (
    key: string,
    modifiers: { metaKey?: boolean; ctrlKey?: boolean; altKey?: boolean; shiftKey?: boolean } = {},
    id = harness.snapshot().location.selectedNodeId,
  ) => {
    const element = input(id)
    act(() =>
      bindings(id).onKeyDown({
        currentTarget: element,
        key,
        metaKey: false,
        ctrlKey: false,
        altKey: false,
        preventDefault: () => undefined,
        ...modifiers,
      } as never),
    )
    sync()
  }
  const type = (text: string, id = harness.snapshot().location.selectedNodeId) => {
    const element = input(id)
    element.value = text
    element.setSelectionRange(text.length, text.length)
    act(() => bindings(id).onTextChange({ currentTarget: element } as never))
  }
  return { ...harness, ...hook, input, bindings, press, type, sync, preview }
}

describe('useNodeInputBindings', () => {
  it('projects a native insertion position after a change command edits the text', async () => {
    const f = await fixture({ document: { roots: [image('one two')] } })
    const input = f.input()
    act(() => f.store.selectNode('node', 0))
    f.press('c')
    f.press('w')
    expect(f.node().text).toBe(' two')
    expect(f.result.current.vimMode).toBe('insert')
    expect(getCaret(input)).toBe(0)
    expect(f.result.current.imageCaretNodeId).toBeUndefined()
    f.type('X two')
    f.press('Escape')
    f.press('u')
    expect(f.node().text).toBe(' two')
    f.press('u')
    expect(f.node().text).toBe('one two')
  })

  // Found by the production-hook sequence property: replacing characters with themselves leaves the
  // text unchanged, so no render follows to project the advanced Normal caret.
  it.each([false, true])(
    'advances the caret after replacing characters with themselves, attached: %s',
    async (attached) => {
      const f = await fixture({ document: { roots: [attached ? image('qqqqq') : node('node', 'qqqqq')] } })
      f.input().setSelectionRange(0, 0)
      f.press('2')
      f.press('r')
      f.press('q')
      expect(f.node().text).toBe('qqqqq')
      expect(getCaret(f.input())).toBe(1)
      f.press('x')
      expect(f.node().text).toBe('qqqq')
      expect(getCaret(f.input())).toBe(1)
    },
  )

  it('moves the caret to the surround start when changing a pair to itself leaves the text unchanged', async () => {
    const f = await fixture({ document: { roots: [node('node', '"abc" x')] } })
    f.input().setSelectionRange(2, 2)
    for (const key of ['c', 's', '"', '"']) f.press(key)
    expect(f.node().text).toBe('"abc" x')
    expect(getCaret(f.input())).toBe(0)
    f.press('x')
    expect(f.node().text).toBe('abc" x')
  })

  it('abandons a queued focus pass after a newer same-node pointer selection', async () => {
    const tasks: (() => void)[] = []
    vi.stubGlobal('queueMicrotask', (task: () => void) => tasks.push(task))
    const f = await fixture({ document: { roots: [node('node', 'abcdef')] } })
    const input = f.input()
    act(() => f.store.selectNode('node', 1))
    expect(tasks.length).toBeGreaterThan(0)
    input.setSelectionRange(2, 5)
    act(() => f.bindings().onMouseUp({ currentTarget: input } as never))
    act(() => tasks.splice(0).forEach((task) => task()))
    expect(input.selectionStart).toBe(2)
    expect(input.selectionEnd).toBe(5)
  })

  it('keeps a newer motion after a queued focus pass on the same token', async () => {
    const tasks: (() => void)[] = []
    vi.stubGlobal('queueMicrotask', (task: () => void) => tasks.push(task))
    const f = await fixture({ document: { roots: [image('abcdef')] } })
    const input = f.input()
    act(() => f.store.selectNode('node', 1))
    f.press('j')
    f.press('k')
    f.press('l')
    act(() => tasks.splice(0).forEach((task) => task()))
    expect(getCaret(input)).toBe(2)
    f.press('x')
    expect(f.node().text).toBe('abdef')
  })

  it('keeps the native append position when Insert supersedes queued Normal focus', async () => {
    const tasks: (() => void)[] = []
    vi.stubGlobal('queueMicrotask', (task: () => void) => tasks.push(task))
    const f = await fixture({ document: { roots: [node('node', 'abcdef')] } })
    const input = f.input()
    act(() => f.store.selectNode('node', 1))
    f.press('a')
    expect(getCaret(input)).toBe(2)
    act(() => tasks.splice(0).forEach((task) => task()))
    expect(f.result.current.vimMode).toBe('insert')
    expect(getCaret(input)).toBe(2)
  })

  it.each([false, true].flatMap((attached) => ['escape', 'undo', 'redo'].map((finish) => ({ attached, finish }))))(
    'keeps the next command aligned when Replace types the existing character: %j',
    async ({ attached, finish }) => {
      const f = await fixture({ document: { roots: [attached ? image('abcd') : node('node', 'abcd')] } })
      f.input().setSelectionRange(2, 2)
      f.press('R')
      f.press('c')
      if (finish === 'escape') f.press('Escape')
      else f.press('z', { metaKey: true, shiftKey: finish === 'redo' })
      expect(f.node().text).toBe('abcd')
      expect(f.result.current.vimMode).toBe('normal')
      expect(getCaret(f.input())).toBe(2)
      f.press('x')
      expect(f.node().text).toBe('abd')
    },
  )

  it.each(
    [false, true].flatMap((attached) =>
      [0, 2, 4].flatMap((cursor) =>
        [false, true].flatMap((typed) =>
          ['escape', 'undo', 'redo'].map((finish) => ({ attached, cursor, typed, finish })),
        ),
      ),
    ),
  )('uses the resolved Replace destination for the next edit: %j', async ({ attached, cursor, typed, finish }) => {
    const f = await fixture({ document: { roots: [attached ? image('abcd') : node('node', 'abcd')] } })
    f.input().setSelectionRange(cursor, cursor)
    f.press('R')
    if (typed) f.press('X')
    if (finish === 'escape') f.press('Escape')
    else f.press('z', { metaKey: true, shiftKey: finish === 'redo' })
    const committed = typed ? 'abcd'.slice(0, cursor) + 'X' + 'abcd'.slice(cursor + 1) : 'abcd'
    const expectedText = finish === 'undo' ? 'abcd' : committed
    // A fresh Replace commit clears redo. Undo restores the edit's start; Escape and the
    // unavailable redo retreat a changed session, while an empty session keeps its position.
    const expectedCursor = Math.min(cursor, attached ? expectedText.length : expectedText.length - 1)
    expect(f.node().text).toBe(expectedText)
    expect(f.result.current.vimMode).toBe('normal')
    expect(getCaret(f.input())).toBe(expectedCursor)
    f.press('x')
    expect(f.node().text).toBe(expectedText.slice(0, expectedCursor) + expectedText.slice(expectedCursor + 1))
  })

  it.each([false, true].flatMap((typed) => ['escape', 'undo', 'redo'].map((finish) => ({ typed, finish }))))(
    'uses the image-only Replace destination for the next command: %j',
    async ({ typed, finish }) => {
      const f = await fixture({ document: { roots: [image('')] } })
      f.press('R')
      if (typed) f.press('X')
      if (finish === 'escape') f.press('Escape')
      else f.press('z', { metaKey: true, shiftKey: finish === 'redo' })
      const text = typed && finish !== 'undo' ? 'X' : ''
      expect(f.node().text).toBe(text)
      expect(f.result.current.vimMode).toBe('normal')
      expect(getCaret(f.input())).toBe(0)
      if (text === '') {
        f.press('Enter')
        expect(f.preview).toHaveBeenCalledWith('image')
      } else {
        f.press('x')
        expect(f.node().text).toBe('')
        expect(f.node().attachment?.id).toBe('image')
      }
    },
  )

  it.each(['', 'xy', 'Longer text'])(
    'projects the upward image destination from "%s" before Enter and exit',
    async (text) => {
      const upper = { ...image('Texted'), id: 'upper' }
      const lower = { ...image(text), id: 'lower', attachment: { id: 'lower-image', mimeType: 'image/png' as const } }
      const f = await fixture({
        document: { roots: [upper, lower] },
        location: { currentParentId: null, selectedNodeId: 'lower' },
      })
      f.input('upper')
      f.input('lower').focus()
      if (text !== '') f.press('j')
      f.press('k')
      expect(f.result.current.imageCaretNodeId).toBe('upper')
      expect(getCaret(f.input('upper'))).toBe(upper.text.length)
      f.press('Enter')
      expect(f.preview).toHaveBeenCalledWith('image')
      f.press('k')
      expect(f.result.current.imageCaretNodeId).toBeUndefined()
      expect(getCaret(f.input('upper'))).toBe(Math.min(text.length, upper.text.length - 1))
      f.press('j')
      expect(getCaret(f.input('upper'))).toBe(upper.text.length)
      f.press('Enter')
      expect(f.preview).toHaveBeenCalledTimes(2)
    },
  )

  it.each([
    ['H', false, 'a'],
    ['M', false, 'b'],
    ['L', false, 'c'],
    ['d', true, 'c'],
    ['u', true, 'a'],
  ] as const)('moves the viewport caret with %s, Ctrl: %s', async (key, ctrlKey, expected) => {
    const f = await fixture({
      document: { roots: [node('a', 'Alpha'), node('b', 'Beta'), node('c', 'Gamma'), node('off', 'Offscreen')] },
      location: { currentParentId: null, selectedNodeId: 'b' },
    })
    for (const [id, top] of [
      ['a', 10],
      ['b', 50],
      ['c', 90],
      ['off', -100],
    ] as const) {
      const input = f.input(id)
      vi.spyOn(input.parentElement!, 'getBoundingClientRect').mockReturnValue({ top, bottom: top + 30 } as DOMRect)
    }
    f.input('b').setSelectionRange(2, 2)
    f.press(key, { ctrlKey })
    expect(f.snapshot().location.selectedNodeId).toBe(expected)
    expect(f.snapshot().focus).toMatchObject({ nodeId: expected, cursor: 2 })
    expect(f.result.current.vimMode).toBe('normal')
  })

  it.each(['d', 'u'])('uses the visible edge when Ctrl+%s starts outside the viewport', async (key) => {
    const f = await fixture({
      document: { roots: [node('a', 'A'), node('b', 'B'), node('off', 'Off')] },
      location: { currentParentId: null, selectedNodeId: 'off' },
    })
    for (const [id, top] of [
      ['a', 10],
      ['b', 50],
      ['off', 2000],
    ] as const) {
      vi.spyOn(f.input(id).parentElement!, 'getBoundingClientRect').mockReturnValue({
        top,
        bottom: top + 30,
      } as DOMRect)
    }
    f.press(key, { ctrlKey: true })
    expect(f.snapshot().location.selectedNodeId).toBe(key === 'd' ? 'b' : 'a')
  })

  it('leaves selection unchanged when no rows intersect the viewport', async () => {
    const f = await fixture()
    vi.spyOn(f.input().parentElement!, 'getBoundingClientRect').mockReturnValue({ top: 2000, bottom: 2030 } as DOMRect)
    const before = f.snapshot().focus
    f.press('H')
    expect(f.snapshot().focus).toBe(before)
  })

  it('moves whole-node Visual endpoints to the first and last sibling and keeps their range', async () => {
    const f = await fixture({
      document: { roots: [node('a', 'a'), node('b', 'b'), node('c', 'c')] },
      location: { currentParentId: null, selectedNodeId: 'b' },
    })
    f.press('V')
    f.press('g')
    f.press('g')
    expect(f.result.current.selection).toEqual({ anchorId: 'b', focusId: 'a' })
    f.press('G')
    expect(f.result.current.selection).toEqual({ anchorId: 'b', focusId: 'c' })
    f.press('U')
    expect(f.result.current.selection).toBeUndefined()
    expect(f.snapshot().focus.nodeId).toBe('b')
  })

  it('shifts a whole-node Visual range with > and < while keeping mode, endpoints, direction, and register', async () => {
    const f = await fixture({
      document: { roots: [node('a', 'a'), node('b', 'b', [node('b1', 'b1')]), node('c', 'c'), node('d', 'd')] },
      location: { currentParentId: null, selectedNodeId: 'a' },
    })
    f.press('y')
    f.press('y')
    act(() => f.store.selectNode('c', 0))
    f.press('V')
    f.press('k')
    expect(f.result.current.selection).toEqual({ anchorId: 'c', focusId: 'b' })
    f.press('>')
    expect(f.snapshot().document.roots.map((item) => [item.id, item.children.map((child) => child.id)])).toEqual([
      ['a', ['b', 'c']],
      ['d', []],
    ])
    expect(f.result.current.vimMode).toBe('visual-node')
    expect(f.result.current.selection).toEqual({ anchorId: 'c', focusId: 'b' })
    expect(f.snapshot().location.selectedNodeId).toBe('b')
    f.press('<')
    expect(f.snapshot().document.roots.map((item) => item.id)).toEqual(['a', 'b', 'c', 'd'])
    expect(f.result.current.selection).toEqual({ anchorId: 'c', focusId: 'b' })
    act(() => f.store.undo())
    act(() => f.store.undo())
    expect(f.snapshot().document.roots.map((item) => item.id)).toEqual(['a', 'b', 'c', 'd'])
    // The register still holds the earlier `yy` of `a`: neither shift replaced it.
    f.press('Escape')
    act(() => f.store.selectNode('d', 0))
    f.press('p')
    expect(f.snapshot().document.roots.map((item) => item.text)).toEqual(['a', 'b', 'c', 'd', 'a'])
  })

  it('applies a count to whole-node Visual > and changes nothing when the full count is impossible', async () => {
    const f = await fixture({
      document: { roots: [node('a', 'a', [node('a1', 'a1')]), node('b', 'b')] },
      location: { currentParentId: null, selectedNodeId: 'b' },
    })
    f.press('V')
    const before = f.snapshot().document
    f.press('3')
    f.press('>')
    expect(f.snapshot().document).toBe(before)
    f.press('2')
    f.press('>')
    expect(f.snapshot().document.roots.map((item) => item.id)).toEqual(['a'])
    expect(f.node('a1').children.map((child) => child.id)).toEqual(['b'])
    expect(f.result.current.vimMode).toBe('visual-node')
  })

  it('deletes the node and the sibling subtrees reached by dj, d2j, and dk as one undo each', async () => {
    const f = await fixture({
      document: {
        roots: [node('a', 'a'), node('b', 'b', [node('b1', 'b1')]), node('c', 'c'), node('d', 'd'), node('e', 'e')],
      },
      location: { currentParentId: null, selectedNodeId: 'a' },
    })
    f.press('d')
    f.press('j')
    expect(f.snapshot().document.roots.map((item) => item.id)).toEqual(['c', 'd', 'e'])
    expect(f.snapshot().location.selectedNodeId).toBe('c')
    act(() => f.store.undo())
    expect(f.snapshot().document.roots.map((item) => item.id)).toEqual(['a', 'b', 'c', 'd', 'e'])
    expect(f.node('b').children.map((child) => child.id)).toEqual(['b1'])
    act(() => f.store.selectNode('b', 0))
    f.press('d')
    f.press('2')
    f.press('j')
    expect(f.snapshot().document.roots.map((item) => item.id)).toEqual(['a', 'e'])
    act(() => f.store.undo())
    act(() => f.store.selectNode('c', 0))
    f.press('d')
    f.press('k')
    expect(f.snapshot().document.roots.map((item) => item.id)).toEqual(['a', 'd', 'e'])
    // The removed forest is the register, in ascending order, with the folded descendants.
    act(() => f.store.selectNode('e', 0))
    f.press('p')
    expect(f.snapshot().document.roots.map((item) => item.text)).toEqual(['a', 'd', 'e', 'b', 'c'])
    expect(f.snapshot().document.roots[3]!.children.map((child) => child.text)).toEqual(['b1'])
  })

  it('clamps vertical operators at the first and last sibling and ignores the current-parent heading', async () => {
    const f = await fixture({
      document: { roots: [node('a', 'a', [node('a1', 'a1'), node('a2', 'a2')]), node('b', 'b')] },
      location: { currentParentId: 'a', selectedNodeId: 'a2' },
    })
    f.press('d')
    f.press('9')
    f.press('k')
    expect(f.node('a').children).toEqual([])
    act(() => f.store.undo())
    act(() => f.store.selectNode('a', 0))
    const before = f.snapshot().document
    f.press('d')
    f.press('j')
    f.press('y')
    f.press('j')
    f.press('c')
    f.press('j')
    expect(f.snapshot().document).toBe(before)
    expect(f.result.current.vimMode).toBe('normal')
    // At the last sibling, `dj` covers only that node.
    act(() => f.store.selectNode('a2', 0))
    f.press('d')
    f.press('j')
    expect(f.node('a').children.map((child) => child.id)).toEqual(['a1'])
  })

  it('yanks with yj without changing the document and replaces the range with one empty node on cj', async () => {
    const f = await fixture({
      document: { roots: [node('a', 'a'), node('b', 'b'), node('c', 'c')] },
      location: { currentParentId: null, selectedNodeId: 'a' },
    })
    const before = f.snapshot().document
    f.press('y')
    f.press('j')
    expect(f.snapshot().document).toBe(before)
    act(() => f.store.selectNode('c', 0))
    f.press('p')
    expect(f.snapshot().document.roots.map((item) => item.text)).toEqual(['a', 'b', 'c', 'a', 'b'])
    act(() => f.store.undo())
    act(() => f.store.selectNode('b', 0))
    f.press('c')
    f.press('k')
    expect(f.snapshot().document.roots.map((item) => item.text)).toEqual(['', 'c'])
    expect(f.result.current.vimMode).toBe('insert')
    expect(f.snapshot().location.selectedNodeId).toBe(f.snapshot().document.roots[0]!.id)
  })

  it('extends whole-node Visual by a count with j and k and keeps the direction', async () => {
    const f = await fixture({
      document: { roots: [node('a', 'a'), node('b', 'b'), node('c', 'c'), node('d', 'd'), node('e', 'e')] },
      location: { currentParentId: null, selectedNodeId: 'b' },
    })
    f.press('V')
    f.press('2')
    f.press('j')
    expect(f.result.current.selection).toEqual({ anchorId: 'b', focusId: 'd' })
    f.press('9')
    f.press('k')
    expect(f.result.current.selection).toEqual({ anchorId: 'b', focusId: 'a' })
    f.press('3')
    f.press('j')
    expect(f.result.current.selection).toEqual({ anchorId: 'b', focusId: 'd' })
    f.press('9')
    f.press('j')
    expect(f.result.current.selection).toEqual({ anchorId: 'b', focusId: 'e' })
    expect(f.result.current.vimMode).toBe('visual-node')
  })

  it('moves the current subtree for character Visual > and keeps the character selection', async () => {
    const f = await fixture({ document: { roots: [node('a', 'a'), node('b', 'one two')] } })
    act(() => f.store.selectNode('b', 0))
    const input = f.input('b')
    input.setSelectionRange(0, 0)
    f.press('v')
    f.press('l')
    f.press('l')
    expect(input.selectionStart).toBe(0)
    expect(input.selectionEnd).toBe(3)
    f.press('>')
    expect(f.node('a').children.map((child) => child.id)).toEqual(['b'])
    expect(f.result.current.vimMode).toBe('visual')
    expect(f.snapshot().location.selectedNodeId).toBe('b')
    expect([input.selectionStart, input.selectionEnd]).toEqual([0, 3])
    f.press('<')
    expect(f.snapshot().document.roots.map((item) => item.id)).toEqual(['a', 'b'])
    expect([input.selectionStart, input.selectionEnd]).toEqual([0, 3])
  })

  it('leaves character Visual untouched when the current node cannot move', async () => {
    const f = await fixture({ document: { roots: [node('a', 'one two')] } })
    const input = f.input('a')
    input.setSelectionRange(0, 0)
    f.press('v')
    f.press('l')
    const before = f.snapshot()
    f.press('>')
    f.press('<')
    expect(f.snapshot()).toBe(before)
    expect(f.result.current.vimMode).toBe('visual')
    expect([input.selectionStart, input.selectionEnd]).toEqual([0, 2])
  })

  it.each(['o', 'O'] as const)('repeats sibling opening with %s and captured text', async (key) => {
    const f = await fixture({ document: { roots: [node('a', 'A')] } })
    f.press(key)
    f.type('New')
    f.press('Escape')
    f.press('.')
    expect(f.snapshot().document.roots.map((item) => item.text)).toEqual(
      key === 'o' ? ['A', 'New', 'New'] : ['New', 'New', 'A'],
    )
    act(() => f.store.undo())
    expect(f.snapshot().document.roots).toHaveLength(2)
  })

  it('repeats subtree and forest puts with fresh identities and repeats structural deletion', async () => {
    const f = await fixture({ document: { roots: [node('a', 'A'), node('b', 'B'), node('c', 'C')] } })
    f.press('y')
    f.press('y')
    f.press('p')
    f.press('.')
    expect(f.snapshot().document.roots.map((item) => item.text)).toEqual(['A', 'A', 'A', 'B', 'C'])
    expect(new Set(f.snapshot().document.roots.map((item) => item.id)).size).toBe(5)
    act(() => f.store.selectNode('b', 0))
    f.press('V')
    f.press('j')
    f.press('y')
    f.press('p')
    f.press('.')
    expect(f.snapshot().document.roots.map((item) => item.text)).toEqual(['A', 'A', 'A', 'B', 'C', 'B', 'B', 'C', 'C'])
    f.press('d')
    f.press('d')
    f.press('.')
    expect(f.snapshot().document.roots).toHaveLength(7)
  })

  it('does not repeat a whole-node mutation when its sibling span is unavailable', async () => {
    const f = await fixture({ document: { roots: [node('a', 'alpha'), node('b', 'beta'), node('c', 'gamma')] } })
    f.press('V')
    f.press('j')
    f.press('U')
    expect(f.node('a').text).toBe('ALPHA')
    expect(f.node('b').text).toBe('BETA')
    act(() => f.store.selectNode('c', 0))
    const before = f.snapshot().document
    f.press('.')
    expect(f.snapshot().document).toBe(before)
  })

  it('replays a reverse Visual shift with its original span and stops at the first impossible level', async () => {
    const f = await fixture({ document: { roots: [node('a', 'A'), node('b', 'B'), node('c', 'C'), node('d', 'D')] } })
    act(() => f.store.selectNode('c', 0))
    f.press('V')
    f.press('k')
    f.press('>')
    expect(f.node('a').children.map((item) => item.id)).toEqual(['b', 'c'])
    f.press('Escape')
    f.press('u')
    act(() => f.store.selectNode('b', 0))
    const shift = vi.spyOn(f.store, 'shiftNodeVisual')
    f.press('3')
    f.press('.')
    expect(f.node('a').children.map((item) => item.id)).toEqual(['b', 'c'])
    expect(shift).toHaveBeenCalledTimes(2)
    expect(f.result.current.vimMode).toBe('normal')
    f.press('u')
    expect(f.snapshot().document.roots.map((item) => item.id)).toEqual(['a', 'b', 'c', 'd'])
  })

  it.each([true, false])('replays a clamped join span, spacing %s, and stops before a partial join', async (spaced) => {
    const f = await fixture({
      document: { roots: [node('a', ' A '), node('b', ' B '), node('c', ' C '), node('d', ' D ')] },
      location: { currentParentId: null, selectedNodeId: 'b' },
    })
    f.press('9')
    if (!spaced) f.press('g')
    f.press('J')
    f.press('u')
    act(() => f.store.selectNode('a', 0))
    f.press('3')
    f.press('.')
    expect(f.snapshot().document.roots.map((item) => item.text)).toEqual(
      spaced ? [' A B C ', ' D '] : [' A  B  C ', ' D '],
    )
    f.press('u')
    expect(f.snapshot().document.roots.map((item) => item.id)).toEqual(['a', 'b', 'c', 'd'])
  })

  it.each(['p', 'P', 'gp', 'gP'])('replays the original counted subtree %s in one history entry', async (key) => {
    const f = await fixture({ document: { roots: [node('a', 'A'), node('b', 'B')] } })
    f.press('y')
    f.press('y')
    act(() => f.store.selectNode('b', 0))
    f.press('2')
    for (const part of key) f.press(part)
    expect(f.snapshot().document.roots).toHaveLength(4)
    // Change the register without replacing the saved put.
    act(() => f.store.selectNode('b', 0))
    f.press('y')
    f.press('y')
    f.press('.')
    expect(f.snapshot().document.roots).toHaveLength(6)
    expect(f.snapshot().document.roots.filter((item) => item.text === 'A')).toHaveLength(5)
    expect(new Set(f.snapshot().document.roots.map((item) => item.id)).size).toBe(6)
    f.press('u')
    expect(f.snapshot().document.roots).toHaveLength(4)
  })

  it('replays counted dd with the original clamped span and exchanges the complete removed forest', async () => {
    const f = await fixture({ document: { roots: ['a', 'b', 'c', 'd', 'e'].map((id) => node(id, id)) } })
    f.press('2')
    f.press('d')
    f.press('d')
    f.press('3')
    f.press('.')
    expect(f.snapshot().document.roots.map((item) => item.id)).toEqual(['e'])
    f.press('u')
    expect(f.snapshot().document.roots.map((item) => item.id)).toEqual(['c', 'd', 'e'])
    f.press('p')
    expect(f.snapshot().document.roots.map((item) => item.text)).toEqual(['c', 'c', 'd', 'd', 'e'])
  })

  it('keeps a case descriptor through yank, motion, unchanged case, and a rejected join', async () => {
    const f = await fixture({ document: { roots: [node('a', 'one two'), node('b', 'THREE four')] } })
    f.press('0')
    f.press('g')
    f.press('U')
    f.press('w')
    act(() => f.store.selectNode('b', 0))
    f.press('0')
    f.press('g')
    f.press('U')
    f.press('w')
    f.press('Y')
    f.press('J')
    f.press('w')
    f.press('.')
    expect(f.node('b').text).toBe('THREE FOUR')
  })

  it.each(['p', 'P'])(
    'replays character Visual %s with captured incoming text after a register exchange',
    async (key) => {
      const f = await fixture({ document: { roots: [node('a', 'red'), node('b', 'blue'), node('c', 'grey')] } })
      f.press('0')
      f.press('Y')
      act(() => f.store.selectNode('b', 0))
      f.press('0')
      f.press('v')
      f.press('$')
      f.press('2')
      f.press(key)
      expect(f.node('b').text).toBe('redred')
      act(() => f.store.selectNode('c', 0))
      f.press('0')
      f.press('Y')
      f.press('.')
      expect(f.node('c').text).toBe('redred')
      expect(f.result.current.vimMode).toBe('normal')
      f.press('u')
      expect(f.node('c').text).toBe('grey')
    },
  )

  it('replays a character Visual shift with its original level count and keeps the caret on an image', async () => {
    const f = await fixture({ document: { roots: [node('a', 'A', [node('x', 'X')]), image('ab')] } })
    act(() => f.store.selectNode('node', 1))
    f.press('v')
    f.press('2')
    f.press('>')
    expect(f.node('x').children[0]?.id).toBe('node')
    f.press('Escape')
    f.press('u')
    act(() => f.store.selectNode('node', 0))
    f.press('$')
    f.press('l')
    f.press('.')
    expect(f.node('x').children[0]?.id).toBe('node')
    expect(f.result.current.imageCaretNodeId).toBe('node')
    expect(getCaret(f.input())).toBe(2)
  })

  it('replays a reverse Visual join span after undo and rejects multiple attachments atomically', async () => {
    const attachment = { id: 'image', mimeType: 'image/png' as const }
    const f = await fixture({
      document: {
        roots: [
          node('a', 'a'),
          node('b', 'b'),
          node('c', 'c'),
          { ...node('d', 'd'), attachment },
          { ...node('e', 'e'), attachment },
        ],
      },
      location: { currentParentId: null, selectedNodeId: 'c' },
    })
    f.press('V')
    f.press('k')
    f.press('g')
    f.press('J')
    f.press('u')
    act(() => f.store.selectNode('d', 0))
    const before = f.snapshot()
    const join = vi.spyOn(f.store, 'joinNodes')
    f.press('3')
    f.press('.')
    expect(join).toHaveBeenCalledTimes(1)
    expect(f.snapshot().document).toBe(before.document)
    expect(f.snapshot().focus).toBe(before.focus)
    expect(f.snapshot().operationError).toBe('Cannot join nodes that both have attachments')
    act(() => f.store.selectNode('a', 0))
    f.press('.')
    expect(f.node('a').text).toBe('ab')
  })

  it('keeps captured incoming node content for Visual p replay after the register exchange', async () => {
    const f = await fixture({
      document: { roots: [node('a', 'A', [node('a1', 'child')]), node('b', 'B'), node('c', 'C')] },
    })
    f.press('y')
    f.press('y')
    act(() => f.store.selectNode('b', 0))
    f.press('V')
    f.press('2')
    f.press('p')
    act(() => f.store.selectNode('c', 0))
    f.press('.')
    expect(f.snapshot().document.roots.map((item) => item.text)).toEqual(['A', 'A', 'A', 'A', 'A'])
    expect(f.snapshot().document.roots.every((item) => item.children[0]?.text === 'child')).toBe(true)
    f.press('u')
    expect(f.snapshot().document.roots.map((item) => item.text)).toEqual(['A', 'A', 'A', 'C'])
  })

  it('stops a repeated put on ancestry rejection without changing focus, register, or history', async () => {
    const f = await fixture({ document: { roots: [node('a', 'A', [node('child', 'child')]), node('b', 'B')] } })
    f.press('y')
    f.press('y')
    act(() => f.store.selectNode('b', 0))
    f.press('p')
    f.press('u')
    act(() => {
      f.store.selectNode('a', 0)
      f.store.enter()
    })
    const before = f.snapshot()
    const paste = vi.spyOn(f.store, 'pasteNodeForest')
    f.press('3')
    f.press('.')
    expect(paste).toHaveBeenCalledTimes(1)
    expect(f.snapshot().document).toBe(before.document)
    expect(f.snapshot().focus).toBe(before.focus)
    expect(f.snapshot().operationError).toBe('Cannot paste a node into one of its descendants.')
    // Returning to the root makes the same descriptor valid; the failed attempt did not replace it.
    act(() => f.store.leave())
    act(() => f.store.selectNode('b', 0))
    f.press('.')
    expect(f.snapshot().document.roots.map((item) => item.text)).toEqual(['A', 'B', 'A'])
  })

  it('stops shift replay at the depth limit with no partial iteration or new focus', async () => {
    let branch = node('deep-parent', 'deep', [node('x', 'X'), node('y', 'Y')])
    for (let level = 18; level > 0; level -= 1) branch = node(`level${level}`, 'level', [branch])
    const f = await fixture({ document: { roots: [node('a', 'A'), node('b', 'B'), branch] } })
    act(() => f.store.selectNode('b', 0))
    f.press('V')
    f.press('>')
    f.press('Escape')
    f.press('u')
    act(() => {
      f.store.selectNode('deep-parent', 0)
      f.store.enter()
      f.store.selectNode('y', 0)
    })
    const before = f.snapshot()
    const shift = vi.spyOn(f.store, 'shiftNodeVisual')
    f.press('3')
    f.press('.')
    expect(shift).toHaveBeenCalledTimes(1)
    expect(f.snapshot().document).toBe(before.document)
    expect(f.snapshot().focus).toBe(before.focus)
    expect(f.snapshot().operationError).toBe(MAX_DOCUMENT_DEPTH_ERROR)
  })

  it('replays an outward shift from the displayed location and ignores the parent heading', async () => {
    const f = await fixture({
      document: { roots: [node('parent', 'Parent', [node('a', 'A'), node('b', 'B')]), node('tail', 'Tail')] },
      location: { currentParentId: 'parent', selectedNodeId: 'a' },
    })
    f.press('V')
    f.press('j')
    f.press('<')
    f.press('Escape')
    f.press('u')
    act(() => f.store.selectNode('parent', 0))
    const before = f.snapshot()
    f.press('.')
    expect(f.snapshot()).toBe(before)
    act(() => f.store.selectNode('a', 0))
    f.press('.')
    expect(f.snapshot().location.currentParentId).toBeNull()
    expect(f.snapshot().document.roots.map((item) => item.id)).toEqual(['parent', 'a', 'b', 'tail'])
    expect(f.snapshot().location.selectedNodeId).toBe('a')
    f.press('u')
    expect(f.node('parent').children.map((item) => item.id)).toEqual(['a', 'b'])
  })

  it('replays the count and post-put destination of a captured multi-node forest', async () => {
    const f = await fixture({ document: { roots: ['a', 'b', 'c'].map((id) => node(id, id)) } })
    f.press('2')
    f.press('y')
    f.press('y')
    act(() => f.store.selectNode('c', 0))
    f.press('2')
    f.press('g')
    f.press('P')
    expect(f.snapshot().location.selectedNodeId).toBe('c')
    f.press('y')
    f.press('y')
    f.press('2')
    f.press('.')
    expect(f.snapshot().location.selectedNodeId).toBe('c')
    expect(f.snapshot().document.roots.map((item) => item.text)).toEqual([
      'a',
      'b',
      ...Array.from({ length: 6 }, () => ['a', 'b']).flat(),
      'c',
    ])
    f.press('u')
    expect(f.snapshot().document.roots).toHaveLength(11)
    f.press('u')
    expect(f.snapshot().document.roots).toHaveLength(7)
  })

  it('stops repeated child opening at the depth limit and keeps its captured text', async () => {
    let root = node('heading', 'heading')
    for (let level = 18; level > 0; level -= 1) root = node(`parent${level}`, 'parent', [root])
    const f = await fixture({
      document: { roots: [root] },
      location: { currentParentId: 'heading', selectedNodeId: 'heading' },
    })
    f.press('o')
    f.type('captured')
    f.press('Escape')
    const before = f.snapshot()
    const open = vi.spyOn(f.store, 'createChildWithText')
    f.press('3')
    f.press('.')
    expect(open).toHaveBeenCalledTimes(1)
    expect(f.snapshot().document).toBe(before.document)
    expect(f.snapshot().focus).toBe(before.focus)
    expect(f.snapshot().operationError).toBe(MAX_DOCUMENT_DEPTH_ERROR)
    f.press('u')
    act(() => f.store.selectNode('heading', 0))
    f.press('.')
    expect(f.node().text).toBe('captured')
  })

  it('joins a whole-node Visual range with J or gJ and returns to Normal mode', async () => {
    const f = await fixture({ document: { roots: [node('a', 'alpha '), node('b', ' beta'), node('c', 'gamma')] } })
    f.press('V')
    f.press('j')
    f.press('J')
    expect(f.snapshot().document.roots.map((item) => item.text)).toEqual(['alpha beta', 'gamma'])
    expect(f.result.current.vimMode).toBe('normal')
    expect(f.snapshot().location.selectedNodeId).toBe('a')
    expect(f.snapshot().focus).toMatchObject({ nodeId: 'a', cursor: 5 })
    f.press('u')
    expect(f.snapshot().document.roots.map((item) => item.text)).toEqual(['alpha ', ' beta', 'gamma'])
    // After the undo, the same range joins without touching its whitespace for gJ.
    f.press('V')
    f.press('j')
    f.press('g')
    f.press('J')
    expect(f.snapshot().document.roots.map((item) => item.text)).toEqual(['alpha  beta', 'gamma'])
    expect(f.result.current.vimMode).toBe('normal')
  })

  it('keeps whole-node Visual active when a one-node range cannot join or two attachments conflict', async () => {
    const image = { id: 'image', mimeType: 'image/png' as const }
    const f = await fixture({
      document: {
        roots: [
          { ...node('a', 'A'), attachment: image },
          { ...node('b', 'B'), attachment: image },
        ],
      },
    })
    const before = f.snapshot().document
    f.press('V')
    f.press('J')
    expect(f.result.current.vimMode).toBe('visual-node')
    f.press('j')
    f.press('J')
    expect(f.result.current.vimMode).toBe('visual-node')
    expect(f.snapshot().document).toBe(before)
    expect(f.snapshot().operationError).toBe('Cannot join nodes that both have attachments')
  })

  it('keeps whole-node Visual active when an empty register cannot replace the range', async () => {
    const f = await fixture()
    const before = f.snapshot().document
    f.press('V')
    f.press('p')
    expect(f.result.current.vimMode).toBe('visual-node')
    expect(f.snapshot().document).toBe(before)
  })

  it('uses boundary motions and folds through the real store', async () => {
    const f = await fixture({ document: { roots: [node('a', 'A', [node('child', 'Child')]), node('b', 'B')] } })
    f.press('G')
    expect(f.snapshot().location.selectedNodeId).toBe('b')
    f.press('g')
    f.press('g')
    expect(f.snapshot().location.selectedNodeId).toBe('a')
    f.press('z')
    f.press('o')
    expect(f.store.getVisibleRows().map((row) => row.node.id)).toEqual(['a', 'child', 'b'])
    f.press('z')
    f.press('c')
    expect(f.store.getVisibleRows().map((row) => row.node.id)).toEqual(['a', 'b'])
  })

  it('uses current text and caret for contenteditable input and focus', async () => {
    const f = await fixture({ document: { roots: [node('a', 'Alpha'), node('b', 'Beta')] }, mode: 'insert' })
    const input = document.createElement('div')
    input.contentEditable = 'true'
    input.tabIndex = 0
    input.textContent = 'Beta'
    document.body.append(input)
    f.bindings('b').inputRef(input)
    setCaret(input, 2)
    act(() => f.bindings('b').onFocus({ currentTarget: input } as never))
    expect(f.snapshot().focus).toMatchObject({ nodeId: 'b', cursor: 2 })
    expect(document.activeElement).toBe(input)
    expect(getCaret(input)).toBe(2)
    input.textContent = 'Beta!'
    setCaret(input, 5)
    act(() => f.bindings('b').onContentInput({ currentTarget: input } as never))
    expect(f.node('b').text).toBe('Beta!')
    expect(getCaret(input)).toBe(5)
    act(() => f.result.current.setVimMode('normal'))
    expect(getCaret(input)).toBe(4)
  })

  it('groups edits before native Cut separately from the following edit', async () => {
    const f = await fixture({ mode: 'insert' })
    f.type('helloX')
    act(() => f.bindings().onCut())
    f.type('hello')
    act(() => f.store.undo())
    expect(f.node().text).toBe('helloX')
  })

  it.each(['normal', 'insert'] as const)(
    'updates pointer image state only when mouse-up is in %s mode',
    async (mode) => {
      const f = await fixture({ document: { roots: [image()] }, mode })
      f.input().setSelectionRange(2, 2)
      act(() => f.bindings().onMouseUp({ currentTarget: f.input() } as never))
      expect(f.result.current.imageCaretNodeId).toBe(mode === 'normal' ? 'node' : undefined)
    },
  )

  it.each(['menu', 'paste'])('reports asynchronous %s failures through the store', async (path) => {
    const error = new Error('test failure')
    const f = await fixture({
      services: {
        readClipboard: async () => {
          throw error
        },
      },
    })
    await act(async () => {
      if (path === 'menu') {
        window.treeApi = {
          showEditorContextMenu: async () => {
            throw error
          },
        } as unknown as Window['treeApi']
        f.bindings().onContextMenu({
          currentTarget: f.input(),
          clientX: 1,
          clientY: 2,
          preventDefault: () => undefined,
        } as never)
      } else f.bindings().onPaste({ currentTarget: f.input(), preventDefault: () => undefined } as never)
    })
    expect(f.snapshot().operationError).toBe('test failure')
    expect(f.node().text).toBe('hello')
  })

  it('ignores context menus while persistence is locked and tolerates a missing menu API', async () => {
    const f = await fixture({
      services: {
        save: async () => {
          throw new Error('save failure')
        },
      },
    })
    window.treeApi = {} as Window['treeApi']
    act(() => f.bindings().onContextMenu({ currentTarget: f.input(), preventDefault: () => undefined } as never))
    f.type('changed')
    for (let attempt = 0; attempt < 3; attempt += 1)
      await act(async () => {
        try {
          await f.store.flushPersistence()
        } catch {
          /* Expected injected save failure. */
        }
      })
    expect(f.snapshot().persistenceLocked).toBe(true)
    const preventDefault = vi.fn()
    act(() => f.bindings().onContextMenu({ currentTarget: f.input(), preventDefault } as never))
    expect(preventDefault).not.toHaveBeenCalled()
    expect(f.bindings().disabled).toBe(true)
  })

  it('tracks whole-node Visual endpoints and routes a sibling-range yank to a later put', async () => {
    const f = await fixture({ document: { roots: [node('a', 'A'), node('b', 'B')] } })
    f.press('V')
    expect(f.result.current.selection).toEqual({ anchorId: 'a', focusId: 'a' })
    f.press('j')
    expect(f.result.current.selection).toEqual({ anchorId: 'a', focusId: 'b' })
    expect(f.snapshot().location.selectedNodeId).toBe('b')
    f.press('y')
    expect(f.result.current.vimMode).toBe('normal')
    expect(f.clipboard.content).toEqual({ kind: 'text', text: 'A\nB' })
    f.press('p')
    expect(f.snapshot().document.roots.map((item) => item.text)).toEqual(['A', 'B', 'A', 'B'])
    expect(new Set(f.snapshot().document.roots.map((item) => item.id)).size).toBe(4)
    act(() => f.store.selectNode('b', 0))
    f.press('V')
    f.press('k')
    f.press('o')
    expect(f.result.current.selection).toEqual({ anchorId: 'a', focusId: 'b' })
    f.press('c')
    expect(f.result.current.vimMode).toBe('insert')
    f.type('Changed')
    f.press('Escape')
    const changedId = f.node().id
    act(() => f.store.selectNode(f.snapshot().document.roots[1]!.id, 0))
    f.press('.')
    expect(f.snapshot().document.roots.map((item) => item.text)).toEqual(['Changed', 'Changed'])
    expect(f.snapshot().document.roots[0]!.id).toBe(changedId)
    act(() => f.store.enter())
    f.press('V')
    expect(f.result.current.vimMode).toBe('normal')
  })

  it('copies reverse whole-node Visual ranges with empty entries and excludes descendants', async () => {
    const a = node('a', 'A', [node('child', 'Excluded')])
    const b = node('b', '')
    const c = { ...node('c', ''), attachment: { id: 'image', mimeType: 'image/png' as const } }
    const d = node('d', 'D')
    const f = await fixture({
      document: { roots: [a, b, c, d] },
      location: { currentParentId: null, selectedNodeId: 'd' },
    })
    f.press('V')
    f.press('3')
    f.press('k')
    f.press('y')
    expect(f.clipboard.content).toEqual({ kind: 'text', text: 'A\n\n\nD' })
    expect(f.result.current.vimMode).toBe('normal')
  })

  it('uses text priority for one Visual node and otherwise copies its image or preserves the clipboard', async () => {
    const f = await fixture({ document: { roots: [image('Text')] } })
    f.press('j')
    f.press('V')
    f.press('y')
    expect(f.clipboard.content).toEqual({ kind: 'text', text: 'Text' })
    const imageOnly = await fixture({ document: { roots: [image('')] } })
    imageOnly.press('V')
    imageOnly.press('y')
    expect(imageOnly.clipboard.content).toEqual({ kind: 'image', attachmentId: 'image' })
    const empty = await fixture({ document: { roots: [node('empty', '')] } })
    empty.press('V')
    empty.press('y')
    expect(empty.clipboard.content).toBeUndefined()
  })

  it('does not export vertical-operator yanks or text deletes to the system clipboard', async () => {
    const f = await fixture({ document: { roots: [node('a', 'ABC'), node('b', 'B')] } })
    f.press('y')
    f.press('j')
    expect(f.clipboard.content).toBeUndefined()
    f.press('v')
    f.press('l')
    f.press('d')
    expect(f.clipboard.content).toBeUndefined()
  })

  it('resyncs the image caret after a whole-node Visual command keeps the same node selected', async () => {
    const f = await fixture({ document: { roots: [image('AB')] } })
    f.input().setSelectionRange(1, 1)
    f.press('l')
    expect(f.result.current.imageCaretNodeId).toBe('node')
    f.press('V')
    f.press('u')
    expect(f.node().text).toBe('ab')
    expect(f.snapshot().focus).toMatchObject({ nodeId: 'node', cursor: 0 })
    expect(f.result.current.vimMode).toBe('normal')
    expect(f.result.current.imageCaretNodeId).toBeUndefined()
  })

  it('resyncs the image caret after a Visual Node move clamps at the same node', async () => {
    const f = await fixture({ document: { roots: [image()] } })
    f.input().setSelectionRange(1, 1)
    f.press('l')
    f.press('V')
    f.press('j')
    expect(f.snapshot().focus).toMatchObject({ nodeId: 'node', cursor: 0 })
    expect(f.result.current.imageCaretNodeId).toBeUndefined()
  })

  it('keeps a non-final image return position across commands without a new focus intent', async () => {
    const f = await fixture({ document: { roots: [image('abcd')] } })
    f.input().setSelectionRange(1, 1)
    f.press('j')
    expect(f.result.current.imageCaretNodeId).toBe('node')
    const focus = f.snapshot().focus
    f.press('u')
    f.press('r', { ctrlKey: true })
    f.press('o', { ctrlKey: true })
    f.press('V')
    f.press('Escape')
    expect(f.snapshot().focus).toEqual(focus)
    expect(f.result.current.imageCaretNodeId).toBe('node')
    f.press('k')
    expect(f.input().selectionStart).toBe(1)
    expect(f.result.current.imageCaretNodeId).toBeUndefined()
    f.press('j')
    act(() => f.store.selectNode('node', 0))
    f.press('u')
    expect(f.result.current.imageCaretNodeId).toBeUndefined()
  })

  it('keeps an explicit image destination when a child-to-parent motion creates a focus intent', async () => {
    const parent = { ...image('Parent'), id: 'parent', children: [node('child', 'child')] }
    const f = await fixture({
      document: { roots: [parent] },
      location: { currentParentId: 'parent', selectedNodeId: 'child' },
    })
    f.press('k')
    expect(f.snapshot().location).toEqual({ currentParentId: 'parent', selectedNodeId: 'parent' })
    expect(f.snapshot().focus).toMatchObject({ nodeId: 'parent', cursor: 'child'.length })
    expect(f.result.current.imageCaretNodeId).toBe('parent')
  })

  it.each(['Escape', 'blur'])('captures opened child text for structural dot repeat after %s', async (finish) => {
    const f = await fixture({
      document: { roots: [node('a', 'A')] },
      location: { currentParentId: 'a', selectedNodeId: 'a' },
    })
    f.input('a')
    f.press('o')
    const childId = f.node().id
    expect(f.result.current.vimMode).toBe('insert')
    act(() => f.bindings('a').onBlur())
    f.type('Opened')
    if (finish === 'blur') act(() => f.bindings(childId).onBlur())
    f.press('Escape')
    f.press('.')
    expect(f.node('a').children.map((item) => item.text)).toEqual(['Opened'])
    expect(f.node(childId).children.map((item) => item.text)).toEqual(['Opened'])
    expect(f.node().id).not.toBe(childId)
  })

  it('captures a structural session from its own node when a pointer click lands on another node', async () => {
    const f = await fixture({ document: { roots: [node('a', 'A'), node('b', 'bee')] } })
    f.input('a')
    f.press('o')
    const openedId = f.node().id
    f.type('Opened', openedId)
    // The pointer mousedown on another node must not capture that node's text for the structural session.
    act(() => f.bindings('b').onMouseDown({ currentTarget: f.input('b'), button: 0 } as never))
    act(() => f.bindings(openedId).onBlur())
    f.press('Escape', {}, 'b')
    act(() => f.store.selectNode('a', 0))
    f.press('.')
    const texts = f.snapshot().document.roots.map((item) => item.text)
    expect(texts.filter((text) => text === 'Opened').length).toBe(2)
    expect(texts.filter((text) => text === 'bee').length).toBe(1)
  })

  it.each(['blur', 'pointer'])('does not record a plain Insert session finished by %s', async (finish) => {
    const f = await fixture({ document: { roots: [node('a', 'a')] } })
    f.press('i')
    f.type('aX')
    if (finish === 'blur') act(() => f.bindings().onBlur())
    else act(() => f.bindings().onMouseDown({ currentTarget: f.input(), button: 0 } as never))
    expect(f.result.current.vimMode).toBe('insert')
    f.press('Escape')
    f.press('.')
    // The interrupted session is discarded, so `.` does not insert a second X.
    expect(f.node('a').text).toBe('aX')
  })

  it('replays a completed Insert session at another node caret', async () => {
    const f = await fixture({ document: { roots: [node('a', 'a'), node('b', 'b')] } })
    f.input().setSelectionRange(0, 0)
    f.press('i')
    f.type('Xa')
    f.press('Escape')
    expect(f.node('a').text).toBe('Xa')
    f.input('b').setSelectionRange(0, 0)
    act(() => f.store.selectNode('b', 0))
    f.press('.')
    expect(f.node('a').text).toBe('Xa')
    expect(f.node('b').text).toBe('Xb')
  })

  it('replays a completed change in another node', async () => {
    const f = await fixture({ document: { roots: [node('a', 'one two'), node('b', 'three four')] } })
    f.input().setSelectionRange(0, 0)
    f.press('c')
    f.press('w')
    f.type('X two')
    f.press('Escape')
    expect(f.node('a').text).toBe('X two')
    f.input('b').setSelectionRange(0, 0)
    act(() => f.store.selectNode('b', 0))
    f.press('.')
    expect(f.node('b').text).toBe('X four')
  })

  it('replays a completed substitute in another node', async () => {
    const f = await fixture({ document: { roots: [node('a', 'abc'), node('b', 'xyz')] } })
    f.input().setSelectionRange(0, 0)
    f.press('s')
    f.type('Qbc')
    f.press('Escape')
    expect(f.node('a').text).toBe('Qbc')
    f.input('b').setSelectionRange(0, 0)
    act(() => f.store.selectNode('b', 0))
    f.press('.')
    expect(f.node('b').text).toBe('Qyz')
  })

  it('replays a completed deletion-only Insert session in another node', async () => {
    const f = await fixture({ document: { roots: [node('a', 'abcd'), node('b', 'xyz')] } })
    f.input().setSelectionRange(1, 1)
    f.press('i')
    f.type('acd')
    f.press('Escape')
    expect(f.node('a').text).toBe('acd')
    f.input('b').setSelectionRange(0, 0)
    act(() => f.store.selectNode('b', 0))
    f.press('.')
    expect(f.node('b').text).toBe('yz')
  })

  it('keeps the previous repeatable change when a blur interrupts an Insert session', async () => {
    const f = await fixture({ document: { roots: [node('a', 'abcd')] } })
    f.input().setSelectionRange(0, 0)
    f.press('x')
    expect(f.node('a').text).toBe('bcd')
    f.press('i')
    f.type('Zbcd')
    act(() => f.bindings().onBlur())
    f.press('Escape')
    f.press('.')
    // The prior `x` repeats; the interrupted insert is not recorded.
    expect(f.node('a').text).toBe('Zbc')
  })

  it('does not capture an Escape delivered to a node other than the session origin', async () => {
    const f = await fixture({ document: { roots: [node('a', 'a'), node('b', 'b')] } })
    f.input('a').setSelectionRange(0, 0)
    f.press('i', {}, 'a')
    f.type('Xa', 'a')
    // The session's own input never blurs here, so the origin-node check is the only guard.
    f.input('b').setSelectionRange(0, 0)
    f.press('Escape', {}, 'b')
    f.press('.', {}, 'b')
    expect(f.node('a').text).toBe('Xa')
    expect(f.node('b').text).toBe('b')
  })

  it('does not record a plain Insert session ended by a shutdown flush', async () => {
    const f = await fixture({ document: { roots: [node('a', 'a')] } })
    f.press('i')
    f.type('aX')
    await act(async () => {
      await f.store.flushPersistence()
    })
    f.press('Escape')
    f.press('.')
    expect(f.node('a').text).toBe('aX')
  })

  it('edits content using existing links and defaults to no links for plain text', async () => {
    const text = 'https://example.test'
    const links = [{ start: 0, end: text.length, url: text }]
    const f = await fixture({ document: { roots: [{ ...node('node', text), links }] }, mode: 'insert' })
    const input = document.createElement('div')
    input.textContent = text
    act(() => f.bindings().onContentChange({ currentTarget: input } as never))
    expect(f.node()).toMatchObject({ text, links })
    input.textContent = 'x'
    act(() => f.bindings().onContentChange({ currentTarget: input } as never))
    expect(f.node().text).toBe('x')
    expect(f.node().links ?? []).toEqual([])
  })

  it('reuses a pending link draft while its text still matches the edited node', async () => {
    const original = 'see https://example.test',
      edited = 'see https//example.test'
    const links = [{ start: 4, end: original.length, url: original.slice(4) }]
    const f = await fixture({ document: { roots: [{ ...node('node', original), links }] }, mode: 'insert' })
    const input = document.createElement('div')
    input.textContent = edited
    act(() => f.bindings().onContentInput({ currentTarget: input } as never))
    expect(f.node().text).toBe(edited)
    expect(f.node().links ?? []).toEqual([])
    input.textContent = original
    act(() => f.bindings().onContentInput({ currentTarget: input } as never))
    expect(f.node()).toMatchObject({ text: original, links })
  })

  it('uses Cmd+click to request opening the edited link', async () => {
    const f = await fixture(),
      url = 'https://example.test'
    const input = document.createElement('div')
    input.innerHTML = `<a href="${url}">${url}</a>`
    const open = vi.spyOn(window, 'open').mockImplementation(() => null),
      preventDefault = vi.fn()
    const event = (metaKey: boolean) => ({ target: input.firstChild, currentTarget: input, metaKey, preventDefault })
    f.bindings().onClick(event(false) as never)
    expect(open).not.toHaveBeenCalled()
    f.bindings().onClick(event(true) as never)
    expect(open).toHaveBeenCalledWith(url, '_blank')
    expect(preventDefault).toHaveBeenCalledTimes(2)
    f.bindings().onClick({ ...event(true), target: document.createElement('a') } as never)
    f.bindings().onClick({ ...event(true), target: input } as never)
    expect(open).toHaveBeenCalledTimes(1)
  })

  it.each(['textarea', 'contenteditable'])(
    'ends the text session only for non-collapsed %s selections',
    async (kind) => {
      const f = await fixture({ mode: 'insert' })
      const input = kind === 'textarea' ? f.input() : document.createElement('div')
      if (kind === 'contenteditable') {
        input.textContent = 'hello'
        document.body.append(input)
      }
      const select = (start: number, end: number) => {
        if (input instanceof HTMLTextAreaElement) input.setSelectionRange(start, end)
        else {
          const range = document.createRange()
          range.setStart(input.firstChild!, start)
          range.setEnd(input.firstChild!, end)
          getSelection()!.removeAllRanges()
          getSelection()!.addRange(range)
        }
        act(() => f.bindings().onSelect({ currentTarget: input } as never))
      }
      f.type('helloX')
      select(1, 1)
      f.type('helloXY')
      act(() => f.store.undo())
      expect(f.node().text).toBe('hello')
      f.type('helloX')
      select(0, 2)
      f.type('helloXY')
      act(() => f.store.undo())
      expect(f.node().text).toBe('helloX')
    },
  )

  it('opens the native editor menu with the current selection and copies that text', async () => {
    const f = await fixture(),
      showEditorContextMenu = vi.fn(async () => 'copy' as const)
    window.treeApi = { showEditorContextMenu } as unknown as Window['treeApi']
    f.input().setSelectionRange(1, 4)
    const preventDefault = vi.fn()
    await act(async () => {
      f.bindings().onContextMenu({ currentTarget: f.input(), clientX: 10, clientY: 20, preventDefault } as never)
    })
    expect(preventDefault).toHaveBeenCalledOnce()
    expect(showEditorContextMenu).toHaveBeenCalledWith({
      x: 10,
      y: 20,
      selectionText: 'ell',
      canCut: true,
      canCopy: true,
      canPaste: true,
      canSelectAll: true,
    })
    expect(f.clipboard.written).toEqual({ text: 'ell', html: 'ell' })
  })

  it.each(['native', 'menu'])('commits pending Replace before %s Paste', async (path) => {
    const f = await fixture({ document: { roots: [node('node', 'abcd')] } })
    f.clipboard.current = { kind: 'text', text: '!' }
    f.input().setSelectionRange(2, 2)
    f.press('R')
    f.press('X')
    await act(async () => {
      if (path === 'native')
        f.bindings().onPaste({ currentTarget: f.input(), preventDefault: () => undefined } as never)
      else {
        window.treeApi = { showEditorContextMenu: async () => 'paste' } as unknown as Window['treeApi']
        f.bindings().onContextMenu({
          currentTarget: f.input(),
          clientX: 1,
          clientY: 2,
          preventDefault: () => undefined,
        } as never)
      }
    })
    expect(f.node().text).toBe('abX!d')
    expect(f.result.current.vimMode).toBe('normal')
    act(() => f.store.undo())
    expect(f.node().text).toBe('abXd')
    act(() => f.store.undo())
    expect(f.node().text).toBe('abcd')
  })

  it('keeps selection through right-click commit so context-menu Cut removes it', async () => {
    const f = await fixture({ document: { roots: [node('node', 'abcd')] } })
    window.treeApi = { showEditorContextMenu: async () => 'cut' } as unknown as Window['treeApi']
    f.input().setSelectionRange(2, 2)
    f.press('R')
    f.press('X')
    f.press('a', { metaKey: true })
    expect([f.input().selectionStart, f.input().selectionEnd]).toEqual([0, 4])
    act(() =>
      f.bindings().onMouseDown({ currentTarget: f.input(), button: 2, preventDefault: () => undefined } as never),
    )
    expect([f.input().selectionStart, f.input().selectionEnd]).toEqual([0, 4])
    await act(async () => {
      f.bindings().onContextMenu({
        currentTarget: f.input(),
        clientX: 1,
        clientY: 2,
        preventDefault: () => undefined,
      } as never)
    })
    expect(f.node().text).toBe('')
    expect(f.clipboard.written?.text).toBe('abXd')
    expect(f.result.current.vimMode).toBe('normal')
  })

  it('commits a pending Replace session exactly once when the store re-enters the finish path', async () => {
    const f = await fixture({ document: { roots: [node('node', 'ab')] } })
    f.input().setSelectionRange(2, 2)
    f.press('R')
    f.press('X')
    // A real store notification can synchronously blur while the first commit is on the stack.
    const unregister = f.store.subscribe(() => f.bindings().onBlur())
    f.press('Escape')
    unregister()
    expect(f.node().text).toBe('abX')
    expect(f.result.current.vimMode).toBe('normal')
    act(() => f.store.undo())
    expect(f.node().text).toBe('ab')
    act(() => f.store.undo())
    expect(f.node().text).toBe('ab')
  })

  it('reads the register written directly by the keyboard handler through the shared owner', async () => {
    const f = await fixture({ document: { roots: [node('a', 'A'), node('b', 'B'), node('c', 'C')] } })
    f.press('y')
    f.press('y')
    f.press('V')
    f.press('j')
    f.press('d')
    expect(f.snapshot().document.roots.map((item) => item.text)).toEqual(['C'])
    f.press('p')
    expect(f.snapshot().document.roots.map((item) => item.text)).toEqual(['C', 'A', 'B'])
  })

  it('uses the keyboard subtree register to replace a whole-node Visual range', async () => {
    const f = await fixture({ document: { roots: [node('a', 'A'), node('b', 'B'), node('c', 'C')] } })
    f.press('y')
    f.press('y')
    act(() => f.store.selectNode('b', 0))
    f.press('V')
    f.press('j')
    f.press('p')
    expect(f.snapshot().document.roots.map((item) => item.text)).toEqual(['A', 'A'])
    expect(f.node().id).not.toBe('a')
    expect(f.result.current.vimMode).toBe('normal')
    f.press('.')
    expect(f.snapshot().document.roots.map((item) => item.text)).toEqual(['A', 'A'])
  })

  it('exchanges the register on whole-node Visual p, keeps it on P, and applies the count to both', async () => {
    const f = await fixture({ document: { roots: [node('a', 'A'), node('b', 'B'), node('c', 'C')] } })
    f.press('y')
    f.press('y')
    act(() => f.store.selectNode('b', 0))
    f.press('V')
    f.press('2')
    f.press('p')
    expect(f.snapshot().document.roots.map((item) => item.text)).toEqual(['A', 'A', 'A', 'C'])
    expect(f.result.current.vimMode).toBe('normal')
    // The replaced `B` is now the register, so a Normal put inserts it after the first copy.
    f.press('p')
    expect(f.snapshot().document.roots.map((item) => item.text)).toEqual(['A', 'A', 'B', 'A', 'C'])
    // Both the put and the exchange were single undoable commands.
    act(() => f.store.undo())
    expect(f.snapshot().document.roots.map((item) => item.text)).toEqual(['A', 'A', 'A', 'C'])
    act(() => f.store.undo())
    expect(f.snapshot().document.roots.map((item) => item.text)).toEqual(['A', 'B', 'C'])
  })

  it('keeps the incoming register on whole-node Visual P so it can replace repeatedly', async () => {
    const f = await fixture({ document: { roots: [node('a', 'A'), node('b', 'B'), node('c', 'C')] } })
    f.press('y')
    f.press('y')
    act(() => f.store.selectNode('b', 0))
    f.press('V')
    f.press('P')
    act(() => f.store.selectNode('c', 0))
    f.press('V')
    f.press('P')
    expect(f.snapshot().document.roots.map((item) => item.text)).toEqual(['A', 'A', 'A'])
  })

  it('repeats a counted whole-node Visual put with the same count', async () => {
    const f = await fixture({ document: { roots: [node('a', 'A'), node('b', 'B'), node('c', 'C')] } })
    f.press('y')
    f.press('y')
    act(() => f.store.selectNode('b', 0))
    f.press('V')
    f.press('2')
    f.press('P')
    expect(f.snapshot().document.roots.map((item) => item.text)).toEqual(['A', 'A', 'A', 'C'])
    f.press('.')
    expect(f.snapshot().document.roots.map((item) => item.text)).toEqual(['A', 'A', 'A', 'A', 'C'])
  })

  it('captures structural and Replace sessions from a contenteditable input', async () => {
    const f = await fixture({ document: { roots: [node('a', 'A')] } })
    f.press('o')
    const openedId = f.node().id
    const input = document.createElement('div')
    input.contentEditable = 'true'
    input.tabIndex = 0
    input.textContent = 'Opened'
    document.body.append(input)
    f.bindings(openedId).inputRef(input)
    act(() => f.bindings(openedId).onContentInput({ currentTarget: input } as never))
    setCaret(input, 6)
    const press = (key: string) =>
      act(() =>
        f.bindings().onKeyDown({
          currentTarget: input,
          key,
          metaKey: false,
          ctrlKey: false,
          altKey: false,
          preventDefault: () => undefined,
        } as never),
      )
    press('Escape')
    press('.')
    expect(f.snapshot().document.roots.map((item) => item.text)).toEqual(['A', 'Opened', 'Opened'])
    const repeatedId = f.node().id
    f.bindings(repeatedId).inputRef(input)
    setCaret(input, 0)
    press('R')
    act(() => f.bindings().onCompositionStart({ currentTarget: input } as never))
    input.textContent = 'あOpened'
    act(() => f.bindings().onContentInput({ currentTarget: input } as never))
    setCaret(input, 1)
    act(() => f.bindings().onCompositionEnd({ currentTarget: input } as never))
    press('X')
    press('Escape')
    expect(f.node().text).toBe('あXpened')
    expect(f.result.current.vimMode).toBe('normal')
  })

  it('requests the native menu for a contenteditable selection and copies its linked text', async () => {
    const url = 'https://example.test'
    const f = await fixture({
      document: { roots: [{ ...node('node', url), links: [{ start: 0, end: url.length, url }] }] },
    })
    const input = document.createElement('div')
    input.contentEditable = 'true'
    input.textContent = url
    document.body.append(input)
    const range = document.createRange()
    range.selectNodeContents(input)
    getSelection()!.removeAllRanges()
    getSelection()!.addRange(range)
    const showEditorContextMenu = vi.fn(async () => 'copy' as const)
    window.treeApi = { showEditorContextMenu } as unknown as Window['treeApi']
    await act(async () =>
      f
        .bindings()
        .onContextMenu({ currentTarget: input, clientX: 1, clientY: 2, preventDefault: () => undefined } as never),
    )
    expect(showEditorContextMenu).toHaveBeenCalledWith({
      x: 1,
      y: 2,
      selectionText: url,
      canCut: true,
      canCopy: true,
      canPaste: true,
      canSelectAll: true,
    })
    expect(f.clipboard.written).toEqual({ text: url, html: `<a href="${url}">${url}</a>` })
    act(() => f.store.createSibling('after'))
    await act(async () => f.store.paste(f.node().id, 0))
    expect(f.node()).toMatchObject({ text: url, links: [{ start: 0, end: url.length, url }] })
  })

  it.each([0, 2])('preserves the expected native pointer behavior for button %s', async (button) => {
    const f = await fixture(),
      preventDefault = vi.fn()
    act(() => f.bindings().onMouseDown({ currentTarget: f.input(), button, preventDefault } as never))
    expect(preventDefault).toHaveBeenCalledTimes(button === 2 ? 1 : 0)
  })

  it('ignores focus intents for nodes that are not registered', async () => {
    const f = await fixture({ document: { roots: [node('a', 'A'), node('b', 'B')] } })
    const input = f.input('a')
    input.focus()
    act(() => f.store.selectNode('b', 0))
    await act(async () => {})
    expect(document.activeElement).toBe(input)
    expect(f.snapshot().location.selectedNodeId).toBe('b')
  })

  it.each(['insert', 'normal'] as const)('focuses registered inputs with the %s caret', async (mode) => {
    const f = await fixture({ mode }),
      input = f.input()
    act(() => f.store.selectNode('node', 3))
    await act(async () => {})
    expect(document.activeElement).toBe(input)
    expect([input.selectionStart, input.selectionEnd]).toEqual(mode === 'normal' ? [3, 4] : [3, 3])
  })

  it('collapses the Normal caret on an attached node at its terminal image position', async () => {
    const f = await fixture({ document: { roots: [image('hello')] } }),
      input = f.input()
    act(() => f.store.selectNode('node', 5))
    expect([input.selectionStart, input.selectionEnd]).toEqual([5, 5])
    expect(f.result.current.imageCaretNodeId).toBe('node')
    act(() => f.bindings().onFocus({ currentTarget: input } as never))
    expect([input.selectionStart, input.selectionEnd]).toEqual([5, 5])
  })

  it('clears an unfinished Vim operator on blur and composition start', async () => {
    const f = await fixture(),
      before = f.snapshot().document
    f.press('d')
    act(() => f.bindings().onBlur())
    f.press('d')
    expect(f.snapshot().document).toEqual(before)
    act(() => f.bindings().onCompositionStart({ currentTarget: f.input() } as never))
    f.press('d')
    expect(f.snapshot().document).toEqual(before)
    act(() => f.bindings().onCompositionEnd({ currentTarget: f.input() } as never))
    f.press('d')
    expect(f.snapshot().document).toEqual(before)
  })

  it('overwrites and appends in Replace mode, then commits one repeatable range edit', async () => {
    const f = await fixture({ document: { roots: [node('node', 'abcd')] } })
    f.input().setSelectionRange(2, 2)
    f.press('R')
    f.press('X')
    f.press('Y')
    f.press('Z')
    expect(f.input().value).toBe('abXYZ')
    expect(f.node().text).toBe('abcd')
    f.press('Backspace')
    expect(f.input().value).toBe('abXY')
    f.press('Escape')
    expect(f.node().text).toBe('abXY')
    expect(f.result.current.vimMode).toBe('normal')
    act(() => f.store.undo())
    expect(f.node().text).toBe('abcd')
    act(() => f.store.redo())
    f.input().setSelectionRange(0, 0)
    f.press('.')
    expect(f.node().text).toBe('XYXY')
  })

  it('resumes Replace mode after native text composition', async () => {
    const f = await fixture({ document: { roots: [node('node', 'abcd')] } })
    f.input().setSelectionRange(2, 2)
    f.press('R')
    act(() => f.bindings().onCompositionStart({ currentTarget: f.input() } as never))
    f.type('abあcd')
    f.input().setSelectionRange(3, 3)
    act(() => f.bindings().onCompositionEnd({ currentTarget: f.input() } as never))
    f.press('X')
    f.press('Escape')
    expect(f.node().text).toBe('abあXd')
    expect(f.result.current.vimMode).toBe('normal')
  })

  it('keeps the native insertion end when composition consumes a typed Replace buffer', async () => {
    const f = await fixture({ document: { roots: [node('node', 'abc')] } })
    const input = f.input()
    input.setSelectionRange(3, 3)
    f.press('R')
    f.press('X')
    expect(getCaret(input)).toBe(4)
    act(() => f.bindings().onCompositionStart({ currentTarget: input } as never))
    expect(f.node().text).toBe('abcX')
    expect(f.result.current.vimMode).toBe('replace')
    expect(input.selectionStart).toBe(4)
    expect(input.selectionEnd).toBe(4)
  })

  it('registers a pending-edit finisher with the store and unregisters it on unmount', () => {
    const unregister = vi.fn()
    let finish: (() => boolean) | undefined
    const registerPendingEditFinisher = vi.fn((callback: () => boolean) => {
      finish = callback
      return unregister
    })
    const store = createEditorStoreDouble({ registerPendingEditFinisher })
    const { unmount } = renderHook(() =>
      useNodeInputBindings({ store, vimEnabled: true, onPreviewAttachment: () => undefined }),
    )
    expect(registerPendingEditFinisher).toHaveBeenCalledOnce()
    expect(finish).toBeTypeOf('function')
    unmount()
    expect(unregister).toHaveBeenCalledOnce()
  })

  it.each([false, true])('flushes a Replace session once, with typed content: %s', async (typed) => {
    const f = await fixture({ document: { roots: [node('node', 'abcd')] } })
    f.input().setSelectionRange(2, 2)
    f.press('R')
    if (typed) f.press('X')
    await act(async () => f.store.flushPersistence())
    expect(f.node().text).toBe(typed ? 'abXd' : 'abcd')
    expect(f.result.current.vimMode).toBe('normal')
    if (typed) {
      expect(f.input().value).toBe('abXd')
      expect(f.input().selectionStart).toBe(3)
    }
    if (typed) expect(f.saves.at(-1)).toMatchObject({ document: { roots: [{ text: 'abXd' }] } })
    const before = f.snapshot().document
    await act(async () => f.store.flushPersistence())
    expect(f.snapshot().document).toBe(before)
    if (typed) {
      act(() => f.store.undo())
      expect(f.node().text).toBe('abcd')
    }
  })

  it.each(['blur', 'pointer'])(
    'activates image caret when Replace commits at its terminal position through %s',
    async (path) => {
      const f = await fixture({ document: { roots: [image()] } })
      f.input().setSelectionRange(2, 2)
      f.press('R')
      f.press('X')
      act(() => {
        if (path === 'blur') f.bindings().onBlur()
        else f.bindings().onMouseDown({ currentTarget: f.input(), button: 0 } as never)
      })
      expect(f.node().text).toBe('abX')
      expect(f.result.current.imageCaretNodeId).toBe('node')
    },
  )

  it.each([
    ['foo bar', 0, ['y', 's', 'i', 'w', '"'], '"foo" bar'],
    ['say "hi" now', 5, ['d', 's', '"'], 'say hi now'],
    ['say "hi" now', 5, ['c', 's', '"', ')'], 'say (hi) now'],
    ['  foo', 3, ['y', 's', 's', ')'], '  (foo)'],
  ] as const)('applies surround commands as one undoable edit: %s', async (text, cursor, keys, expected) => {
    const f = await fixture({ document: { roots: [node('a', text)] } })
    f.input().setSelectionRange(cursor, cursor)
    for (const key of keys) f.press(key)
    expect(f.node().text).toBe(expected)
    act(() => f.store.undo())
    expect(f.node().text).toBe(text)
  })

  it('repeats surround at the new word rather than fixed offsets', async () => {
    const f = await fixture({ document: { roots: [node('a', 'one two')] } })
    f.input().setSelectionRange(0, 0)
    for (const key of ['y', 's', 'i', 'w', ']']) f.press(key)
    f.input().setSelectionRange(6, 6)
    f.press('.')
    expect(f.node().text).toBe('[one] [two]')
  })

  it.each([
    ['2', 'y', 's', 's', ')'],
    ['y', 's', 'i', 'w', 'z'],
    ['d', 's', '"'],
    ['d', 's', 'w'],
  ])('leaves text unchanged for unsupported surround sequence %j', async (...keys) => {
    const f = await fixture(),
      before = f.snapshot().document
    f.input().setSelectionRange(0, 0)
    for (const key of keys) f.press(key)
    expect(f.snapshot().document).toBe(before)
  })

  it('leaves an image-only node untouched by every surround command', async () => {
    const f = await fixture({ document: { roots: [image('')] } }),
      before = f.snapshot().document
    for (const sequence of [
      ['y', 's', 'i', 'w', ')'],
      ['y', 's', 's', ')'],
      ['d', 's', ')'],
      ['c', 's', ')', '"'],
    ]) {
      for (const key of sequence) f.press(key)
      expect(f.snapshot().document).toBe(before)
    }
    expect(f.result.current.vimMode).toBe('normal')
  })

  it('surrounds character Visual selection with S and returns to Normal mode', async () => {
    const f = await fixture({ document: { roots: [node('a', 'foo bar')] } })
    f.input().setSelectionRange(0, 0)
    f.press('v')
    f.press('l')
    f.press('l')
    f.press('S')
    f.press('z')
    expect(f.node().text).toBe('foo bar')
    expect(f.result.current.vimMode).toBe('visual')
    expect([f.input().selectionStart, f.input().selectionEnd]).toEqual([0, 3])
    f.press('S')
    f.press('}')
    expect(f.node().text).toBe('{foo} bar')
    expect(f.result.current.vimMode).toBe('normal')
  })

  it.each(['pointer', 'blur', 'enter'])(
    'clears character Visual endpoints through %s and re-anchors the next motion',
    async (path) => {
      const f = await fixture({ document: { roots: [node('a', 'Alpha')] } })
      f.input().setSelectionRange(0, 0)
      f.press('v')
      if (path === 'pointer') {
        f.input().setSelectionRange(3, 3)
        act(() => f.bindings().onMouseDown({ currentTarget: f.input(), button: 0 } as never))
      } else if (path === 'blur') {
        act(() => f.bindings().onBlur())
        f.input().setSelectionRange(0, 0)
      } else {
        f.press('.', { metaKey: true })
        expect(f.snapshot().location.currentParentId).toBe('a')
        f.input('a').setSelectionRange(0, 0)
      }
      f.press('l', {}, 'a')
      expect(f.result.current.vimMode).toBe('visual')
      expect([f.input('a').selectionStart, f.input('a').selectionEnd]).toEqual(path === 'pointer' ? [3, 5] : [0, 2])
    },
  )

  it('clears the whole-node Visual g prefix when a whole-node command exits', async () => {
    const f = await fixture({ document: { roots: [node('a', 'A'), node('b', 'B')] } })
    f.press('V')
    f.press('g')
    f.press('y')
    expect(f.result.current.selection).toBeUndefined()
    f.press('d')
    f.press('d')
    expect(f.snapshot().location.currentParentId).toBeNull()
    expect(f.snapshot().document.roots.map((item) => item.id)).toEqual(['b'])
  })

  it('keeps whole-node Visual active when a range move blurs the previous input', async () => {
    const f = await fixture({ document: { roots: [node('a', 'A'), node('b', 'B')] } })
    f.input('a')
    f.input('b')
    f.press('V')
    f.press('j')
    act(() => f.bindings('a').onBlur())
    expect(f.result.current.vimMode).toBe('visual-node')
    expect(f.result.current.selection).toEqual({ anchorId: 'a', focusId: 'b' })
    expect(f.snapshot().location.selectedNodeId).toBe('b')
  })

  it('keeps a multi-character selection when a resize notification arrives in Normal mode', async () => {
    let callback: ResizeObserverCallback | undefined
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(cb: ResizeObserverCallback) {
          callback = cb
        }
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    )
    const f = await fixture(),
      input = f.input()
    input.focus()
    const notify = () =>
      act(() => callback?.([{ target: input } as unknown as ResizeObserverEntry], {} as ResizeObserver))
    input.setSelectionRange(0, input.value.length)
    notify()
    expect([input.selectionStart, input.selectionEnd]).toEqual([0, 5])
    input.setSelectionRange(1, 1)
    notify()
    expect([input.selectionStart, input.selectionEnd]).toEqual([1, 2])
    act(() => f.result.current.setVimMode('insert'))
    input.setSelectionRange(2, 2)
    notify()
    expect([input.selectionStart, input.selectionEnd]).toEqual([2, 2])
    f.bindings().inputRef(null)
  })

  it('marks deliberate multi-character selection and clears the mark at the block caret', async () => {
    const f = await fixture(),
      input = f.input()
    input.focus()
    for (const [start, end, expected] of [
      [0, 5, true],
      [2, 2, false],
      [1, 2, false],
    ] as const) {
      act(() => {
        input.setSelectionRange(start, end)
        document.dispatchEvent(new Event('selectionchange'))
      })
      expect(input.classList.contains('node-input-text-selected')).toBe(expected)
    }
  })
})

describe('Vim editing switch', () => {
  it('switches without a focused editor using the store caret', async () => {
    const f = await fixture({ document: { roots: [image('abc')] } })
    act(() => f.store.selectNode('node', 3))
    act(() => f.result.current.setVimEditing(true))
    expect(f.result.current.vimMode).toBe('normal')
    expect(f.result.current.imageCaretNodeId).toBe('node')

    act(() => f.result.current.setVimEditing(false))

    expect(f.result.current.vimMode).toBe('insert')
    expect(f.result.current.imageCaretNodeId).toBeUndefined()
    expect(document.activeElement).toBe(document.body)
  })

  it('moves a focused image caret to the end of the text when Vim editing is disabled', async () => {
    const f = await fixture({ document: { roots: [image('ab')] } })
    const input = f.input()
    act(() => f.store.selectNode('node', 0))
    act(() => input.focus())
    f.press('$')
    f.press('l')
    expect(f.result.current.imageCaretNodeId).toBe('node')

    act(() => f.result.current.setVimEditing(false))
    f.sync()

    expect(f.result.current.vimMode).toBe('insert')
    expect(f.result.current.imageCaretNodeId).toBeUndefined()
    expect([input.selectionStart, input.selectionEnd]).toEqual([2, 2])
    expect(document.activeElement).toBe(input)
  })

  it('finishes a structural Insert session when Vim editing is disabled', async () => {
    const f = await fixture({ document: { roots: [node('node', 'abc')] } })
    const input = f.input()
    act(() => f.store.selectNode('node', 0))
    act(() => input.focus())
    f.press('o')
    expect(f.result.current.vimMode).toBe('insert')
    const opened = f.snapshot().location.selectedNodeId
    f.type('new', opened)
    act(() => f.input(opened).focus())

    act(() => f.result.current.setVimEditing(false))
    act(() => f.result.current.setVimEditing(true))
    act(() => f.store.selectNode(opened, 0))
    f.press('.', {}, opened)

    // The finished `o` session is the repeatable change, so `.` opens another sibling with its text.
    expect(f.snapshot().document.roots.map((root) => root.text)).toEqual(['abc', 'new', 'new'])
  })

  it('keeps a multi-character selection when Vim editing is enabled', async () => {
    const f = await fixture({ document: { roots: [node('node', 'abcdef')] }, mode: 'insert' })
    const input = f.input()
    act(() => f.store.selectNode('node', 0))
    act(() => input.focus())
    input.setSelectionRange(1, 4)

    act(() => f.result.current.setVimEditing(true))

    expect(f.result.current.vimMode).toBe('normal')
    expect([input.selectionStart, input.selectionEnd]).toEqual([1, 4])
  })

  it('changes only the mode while the document is still loading', () => {
    const store = new EditorStore(
      {
        load: async () => null,
        save: async () => undefined,
        readClipboard: async () => ({ kind: 'text', text: '' }),
        writeAttachment: async () => undefined,
        cleanupAttachments: async () => undefined,
      },
      () => 'node',
    )
    const hook = renderHook(() => {
      const [vimMode, setVimMode] = useState<VimMode>('normal')
      return {
        ...useNodeInputBindings({ store, onPreviewAttachment: vi.fn(), vimEnabled: true, vimMode, setVimMode }),
        vimMode,
      }
    })

    act(() => hook.result.current.setVimEditing(false))
    expect(hook.result.current.vimMode).toBe('insert')
    act(() => hook.result.current.setVimEditing(true))
    expect(hook.result.current.vimMode).toBe('normal')
  })
})

describe('drag caret freeze', () => {
  it('collapses a transient selection and restores focus and the captured caret on release', async () => {
    const f = await fixture(),
      input = f.input()
    input.focus()
    input.setSelectionRange(1, 3)
    act(() => f.result.current.dragFreeze.begin('node', 7))
    expect(document.activeElement).not.toBe(input)
    expect([input.selectionStart, input.selectionEnd]).toEqual([1, 1])
    act(() => f.result.current.dragFreeze.end(7))
    expect(document.activeElement).toBe(input)
    expect([input.selectionStart, input.selectionEnd]).toEqual([1, 1])
  })

  it('ignores other pointers and restores exactly once for its own pointer', async () => {
    const f = await fixture(),
      input = f.input()
    input.focus()
    input.setSelectionRange(2, 2)
    act(() => f.result.current.dragFreeze.begin('node', 7))
    act(() => f.result.current.dragFreeze.begin('node', 7))
    act(() => f.result.current.dragFreeze.end(8))
    expect(document.activeElement).not.toBe(input)
    act(() => f.result.current.dragFreeze.end(7))
    expect(document.activeElement).toBe(input)
    input.setSelectionRange(3, 3)
    act(() => f.result.current.dragFreeze.end(7))
    expect(input.selectionStart).toBe(3)
  })

  it.each(['unspecified', 'cancel', 'up'])('restores the caret on %s release', async (path) => {
    const f = await fixture(),
      input = f.input()
    input.focus()
    input.setSelectionRange(2, 2)
    act(() => f.result.current.dragFreeze.begin('node', 7))
    act(() => {
      if (path === 'unspecified') f.result.current.dragFreeze.end()
      else if (path === 'cancel') fireEvent.pointerCancel(window, { pointerId: 7 })
      else fireEvent.pointerUp(window, { pointerId: 7 })
    })
    expect(document.activeElement).toBe(input)
    expect(input.selectionStart).toBe(2)
  })

  it('leaves a frozen caret unrestored on unmount', async () => {
    const f = await fixture(),
      input = f.input()
    input.focus()
    act(() => f.result.current.dragFreeze.begin('node', 7))
    f.unmount()
    fireEvent.pointerUp(window, { pointerId: 7 })
    expect(document.activeElement).not.toBe(input)
  })

  it('does not touch the caret when the source is not active or is missing', async () => {
    const f = await fixture(),
      input = f.input()
    input.setSelectionRange(1, 3)
    act(() => f.result.current.dragFreeze.begin('missing', 7))
    act(() => f.result.current.dragFreeze.begin('node', 7))
    act(() => f.result.current.dragFreeze.end(7))
    expect(document.activeElement).not.toBe(input)
    expect([input.selectionStart, input.selectionEnd]).toEqual([1, 3])
  })

  it('replaces an old freeze for a new pointer and tolerates an unregistered source', async () => {
    const f = await fixture(),
      input = f.input()
    input.focus()
    act(() => f.result.current.dragFreeze.begin('node', 7))
    input.focus()
    input.setSelectionRange(3, 3)
    act(() => f.result.current.dragFreeze.begin('node', 8))
    fireEvent.pointerUp(window, { pointerId: 7 })
    expect(document.activeElement).not.toBe(input)
    act(() => f.bindings().inputRef(null))
    act(() => f.result.current.dragFreeze.end(8))
    expect(document.activeElement).not.toBe(input)
  })

  it.each(['normal', 'replace'] as const)('preserves the %s mode contract through freeze and blur', async (mode) => {
    const f = await fixture({ mode }),
      input = f.input()
    input.focus()
    act(() => f.result.current.dragFreeze.begin('node', 7))
    act(() => f.bindings().onBlur())
    act(() => f.result.current.dragFreeze.end(7))
    expect(f.result.current.vimMode).toBe('normal')
    expect(f.result.current.imageCaretNodeId).toBeUndefined()
    expect(document.activeElement).toBe(input)
  })

  it('restores a collapsed caret in a contenteditable input', async () => {
    const f = await fixture(),
      input = document.createElement('div')
    input.contentEditable = 'true'
    input.tabIndex = 0
    input.textContent = 'hello'
    document.body.append(input)
    f.bindings().inputRef(input)
    input.focus()
    const selection = getSelection()!,
      range = document.createRange()
    range.setStart(input.firstChild!, 1)
    range.setEnd(input.firstChild!, 3)
    selection.removeAllRanges()
    selection.addRange(range)
    act(() => f.result.current.dragFreeze.begin('node', 7))
    expect(document.activeElement).not.toBe(input)
    act(() => f.result.current.dragFreeze.end(7))
    expect(document.activeElement).toBe(input)
    expect(selection.isCollapsed).toBe(true)
    expect(selection.anchorOffset).toBe(1)
  })

  it('restores the caret across an attached image without rewriting the image indicator', async () => {
    const f = await fixture({ document: { roots: [image('hello')] } }),
      input = f.input()
    act(() => f.store.selectNode('node', 5))
    expect(f.result.current.imageCaretNodeId).toBe('node')
    act(() => f.result.current.dragFreeze.begin('node', 7))
    act(() => f.result.current.dragFreeze.end(7))
    expect(f.result.current.imageCaretNodeId).toBe('node')
    expect([input.selectionStart, input.selectionEnd]).toEqual([5, 5])
  })
})

describe('gv', () => {
  const siblings = (): TreeNode[] => [node('a', 'A'), node('b', 'B'), node('c', 'C'), node('d', 'D')]

  it('restores a whole-node range in both directions after Escape', async () => {
    const f = await fixture({ document: { roots: siblings() } })
    act(() => f.store.selectNode('b', 0))
    f.press('V')
    f.press('j')
    f.press('Escape')
    act(() => f.store.selectNode('d', 0))
    f.press('g')
    f.press('v')
    expect(f.result.current.vimMode).toBe('visual-node')
    expect(f.result.current.selection).toEqual({ anchorId: 'b', focusId: 'c' })
    expect(f.snapshot().location.selectedNodeId).toBe('c')
    f.press('o')
    f.press('Escape')
    act(() => f.store.selectNode('d', 0))
    f.press('g')
    f.press('v')
    expect(f.result.current.selection).toEqual({ anchorId: 'c', focusId: 'b' })
    expect(f.snapshot().location.selectedNodeId).toBe('b')
  })

  it('does nothing without a remembered selection and from a Visual mode', async () => {
    const f = await fixture({ document: { roots: siblings() } })
    f.press('g')
    f.press('v')
    expect(f.result.current.vimMode).toBe('normal')
    expect(f.result.current.selection).toBeUndefined()
    f.press('V')
    f.press('g')
    f.press('v')
    expect(f.result.current.selection).toEqual({ anchorId: 'a', focusId: 'a' })
  })

  it('selects the incoming nodes after a whole-node Visual put', async () => {
    const f = await fixture({ document: { roots: siblings() } })
    f.press('y')
    f.press('y')
    act(() => f.store.selectNode('b', 0))
    f.press('V')
    f.press('j')
    f.press('p')
    expect(f.snapshot().document.roots.map((item) => item.text)).toEqual(['A', 'A', 'D'])
    const incoming = f.snapshot().document.roots[1]!.id
    expect(incoming).not.toBe('b')
    act(() => f.store.selectNode('d', 0))
    f.press('g')
    f.press('v')
    expect(f.result.current.selection).toEqual({ anchorId: incoming, focusId: incoming })
    expect(f.snapshot().location.selectedNodeId).toBe(incoming)
  })

  it('selects the whole incoming forest for a counted put', async () => {
    const f = await fixture({ document: { roots: siblings() } })
    f.press('V')
    f.press('j')
    f.press('y')
    act(() => f.store.selectNode('d', 0))
    f.press('V')
    f.press('2')
    f.press('p')
    expect(f.snapshot().document.roots.map((item) => item.text)).toEqual(['A', 'B', 'C', 'A', 'B', 'A', 'B'])
    const ids = f
      .snapshot()
      .document.roots.slice(3)
      .map((item) => item.id)
    act(() => f.store.selectNode('a', 0))
    f.press('g')
    f.press('v')
    expect(f.result.current.selection).toEqual({ anchorId: ids[0], focusId: ids[3] })
  })

  it('keeps the moved range after a shift', async () => {
    const f = await fixture({ document: { roots: siblings() } })
    act(() => f.store.selectNode('b', 0))
    f.press('V')
    f.press('j')
    f.press('>')
    expect(f.snapshot().document.roots.map((item) => item.id)).toEqual(['a', 'd'])
    f.press('Escape')
    act(() => f.store.selectNode('d', 0))
    f.press('g')
    f.press('v')
    expect(f.result.current.selection).toEqual({ anchorId: 'b', focusId: 'c' })
    expect(f.snapshot().location.selectedNodeId).toBe('c')
  })

  it('is invalid after the range lost, replaced, or gained a node', async () => {
    const f = await fixture({ document: { roots: siblings() } })
    act(() => f.store.selectNode('b', 0))
    f.press('V')
    f.press('j')
    f.press('Escape')
    // A node inserted before the range leaves it contiguous; one inserted between its ends does not.
    act(() => f.store.selectNode('a', 0))
    f.press('o')
    f.type('M')
    f.press('Escape')
    f.press('g')
    f.press('v')
    expect(f.result.current.selection).toEqual({ anchorId: 'b', focusId: 'c' })
    f.press('Escape')
    act(() => f.store.selectNode('b', 0))
    f.press('o')
    f.type('N')
    f.press('Escape')
    expect(f.snapshot().document.roots.map((item) => item.text)).toEqual(['A', 'M', 'B', 'N', 'C', 'D'])
    f.press('g')
    f.press('v')
    expect(f.result.current.vimMode).toBe('normal')
    expect(f.result.current.selection).toBeUndefined()
    // A new Visual selection replaces the invalid memory; deleting its nodes invalidates it again.
    act(() => f.store.selectNode('c', 0))
    f.press('V')
    f.press('Escape')
    act(() => f.store.selectNode('c', 0))
    f.press('d')
    f.press('d')
    f.press('g')
    f.press('v')
    expect(f.result.current.vimMode).toBe('normal')
    f.press('u')
    f.press('g')
    f.press('v')
    expect(f.result.current.selection).toEqual({ anchorId: 'c', focusId: 'c' })
  })

  it('does nothing while a collapsed fold hides the range and restores it once expanded', async () => {
    const f = await fixture({
      document: { roots: [node('a', 'A', [node('a1', 'A1'), node('a2', 'A2')]), node('b', 'B')] },
    })
    f.press('z')
    f.press('o')
    act(() => f.store.selectNode('a1', 0))
    f.press('V')
    f.press('j')
    f.press('Escape')
    act(() => f.store.selectNode('a', 0))
    f.press('z')
    f.press('c')
    f.press('g')
    f.press('v')
    expect(f.result.current.vimMode).toBe('normal')
    f.press('z')
    f.press('o')
    f.press('g')
    f.press('v')
    expect(f.result.current.selection).toEqual({ anchorId: 'a1', focusId: 'a2' })
  })

  it('does nothing after the displayed location changed', async () => {
    const f = await fixture({ document: { roots: [node('a', 'A', [node('a1', 'A1')]), node('b', 'B')] } })
    act(() => f.store.selectNode('b', 0))
    f.press('V')
    f.press('Escape')
    act(() => f.store.selectNode('a', 0))
    act(() => f.store.enter())
    f.press('g', {}, 'a1')
    f.press('v', {}, 'a1')
    expect(f.result.current.vimMode).toBe('normal')
  })

  it('restores a character selection with its direction and live endpoints in another node', async () => {
    const f = await fixture({ document: { roots: [node('a', 'foo bar'), node('b', 'xyz')] } })
    f.input('a').setSelectionRange(0, 0)
    f.press('v')
    f.press('l')
    f.press('l')
    f.press('o')
    f.press('Escape')
    act(() => f.store.selectNode('b', 0))
    f.input('b').setSelectionRange(0, 0)
    f.press('g', {}, 'b')
    f.press('v', {}, 'b')
    expect(f.result.current.vimMode).toBe('visual')
    expect(f.snapshot().location.selectedNodeId).toBe('a')
    expect([f.input('a').selectionStart, f.input('a').selectionEnd]).toEqual([0, 3])
    // The anchor is the right end after `o`, so moving the focus right shortens the selection.
    f.press('l', {}, 'a')
    expect([f.input('a').selectionStart, f.input('a').selectionEnd]).toEqual([1, 3])
  })

  it('does nothing after the remembered character was deleted and left the node empty', async () => {
    const f = await fixture({ document: { roots: [node('a', 'x')] } })
    f.input('a').setSelectionRange(0, 0)
    f.press('v')
    f.press('d')
    expect(f.node('a').text).toBe('')
    f.press('g')
    f.press('v')
    expect(f.result.current.vimMode).toBe('normal')
  })

  it('selects the incoming text after a character Visual put and ignores a stale offset', async () => {
    const f = await fixture({ document: { roots: [node('a', 'red blue')] } })
    f.input('a').setSelectionRange(0, 0)
    f.press('v')
    f.press('l')
    f.press('l')
    f.press('y')
    f.input('a').setSelectionRange(4, 4)
    f.press('v')
    f.press('3')
    f.press('l')
    f.press('p')
    expect(f.node('a').text).toBe('red red')
    f.press('Escape')
    f.press('g')
    f.press('v')
    expect(f.result.current.vimMode).toBe('visual')
    expect([f.input('a').selectionStart, f.input('a').selectionEnd]).toEqual([4, 7])
    f.press('Escape')
    f.press('x')
    f.press('x')
    f.press('x')
    f.press('x')
    expect(f.node('a').text).toBe('red')
    f.press('g')
    f.press('v')
    expect(f.result.current.vimMode).toBe('normal')
  })
})
