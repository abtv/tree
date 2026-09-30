// @vitest-environment jsdom

import { act, cleanup, fireEvent, renderHook } from '@testing-library/react'
import { useState, useSyncExternalStore } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TreeNode } from '../domain/document'
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

async function fixture(options: RealStoreOptions & { mode?: VimMode } = {}) {
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

  it.each(['blur', 'pointer'])('captures a plain Insert session when %s leaves the node selected', async (finish) => {
    const f = await fixture({ document: { roots: [node('a', 'a')] } })
    f.press('i')
    f.type('aX')
    if (finish === 'blur') act(() => f.bindings().onBlur())
    else act(() => f.bindings().onMouseDown({ currentTarget: f.input(), button: 0 } as never))
    expect(f.result.current.vimMode).toBe('insert')
    f.press('Escape')
    f.press('.')
    expect(f.node('a').text).toBe('aXX')
  })

  it.each([false, true])(
    'captures Insert across a node change; replay on the original node: %s',
    async (returnToOriginal) => {
      const f = await fixture({ document: { roots: [node('a', 'a'), node('b', 'b')] } })
      f.press('i')
      f.type('aX')
      act(() => f.bindings('a').onBlur())
      act(() => f.store.selectNode('b', 0))
      f.press('Escape')
      if (returnToOriginal) act(() => f.store.selectNode('a', 1))
      f.press('.')
      expect(f.node('a').text).toBe(returnToOriginal ? 'aXX' : 'aX')
      expect(f.node('b').text).toBe('b')
    },
  )

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

  it('registers a pending-edit finisher with the store and unregisters it on unmount', () => {
    const unregister = vi.fn()
    let finish: (() => boolean) | undefined
    const registerPendingEditFinisher = vi.fn((callback: () => boolean) => {
      finish = callback
      return unregister
    })
    const store = createEditorStoreDouble({ registerPendingEditFinisher })
    const { unmount } = renderHook(() => useNodeInputBindings({ store, onPreviewAttachment: () => undefined }))
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
