// @vitest-environment jsdom

import { act, cleanup, renderHook } from '@testing-library/react'
import { useState } from 'react'
import type { SyntheticEvent } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { EditorStore } from '../application/editor-store'
import type { TreeNode } from '../domain/document'
import { useNodeInputBindings } from './use-node-input-bindings'
import type { VimMode } from './vim-editing'

afterEach(cleanup)

function createStore(): EditorStore {
  return {
    copy: vi.fn(async () => true),
    cut: vi.fn(async () => true),
    deleteSelected: vi.fn(),
    editContent: vi.fn(),
    editText: vi.fn(),
    endTextSession: vi.fn(),
    markNextTextEditStandalone: vi.fn(),
    paste: vi.fn(async () => {}),
    replaceTextRange: vi.fn(),
    reportError: vi.fn(),
    selectNode: vi.fn(),
  } as unknown as EditorStore
}

function renderBindings(options: {
  store: EditorStore
  selectedNodeId?: string
  focus?: { nodeId: string; cursor: number; token: number }
  vimMode?: 'insert' | 'normal' | 'replace' | 'visual' | 'visual-node'
}) {
  const onPreviewAttachment = vi.fn()
  return renderHook(() => useNodeInputBindings({ ...options, onPreviewAttachment }))
}

describe('useNodeInputBindings', () => {
  it('tracks whole-node Visual endpoints and routes a sibling-range yank to a later put', () => {
    const nodes: TreeNode[] = [
      { id: 'a', text: 'A', children: [] },
      { id: 'b', text: 'B', children: [] },
    ]
    let selectedNodeId = 'a'
    let currentParentId: string | null = null
    const store = {
      getSnapshot: () => ({
        status: 'ready',
        document: { roots: nodes },
        location: { currentParentId, selectedNodeId },
      }),
      selectNode: vi.fn((id: string) => {
        selectedNodeId = id
      }),
      applyNodeVisual: vi.fn(() => ({ nodes, sourceIds: ['a', 'b'] })),
      pasteNodeForest: vi.fn(() => true),
      endTextSession: vi.fn(),
    } as unknown as EditorStore
    const { result } = renderHook(() => {
      const [vimMode, setVimMode] = useState<VimMode>('normal')
      const [selection, setSelection] = useState<{ anchorId: string; focusId: string }>()
      const bindings = useNodeInputBindings({
        store,
        selectedNodeId,
        vimMode,
        setVimMode,
        nodeVisualSelection: selection,
        setNodeVisualSelection: setSelection,
        onPreviewAttachment: vi.fn(),
      })
      return { bindings, vimMode, selection }
    })
    const input = document.createElement('textarea')
    input.value = 'A'
    const press = (node: TreeNode, key: string): void => {
      act(() => {
        result.current.bindings(node).onKeyDown({
          currentTarget: input,
          key,
          metaKey: false,
          ctrlKey: false,
          altKey: false,
          preventDefault: vi.fn(),
        } as never)
      })
    }

    press(nodes[0]!, 'V')
    expect(result.current.vimMode).toBe('visual-node')
    expect(result.current.selection).toEqual({ anchorId: 'a', focusId: 'a' })
    press(nodes[0]!, 'j')
    expect(result.current.selection).toEqual({ anchorId: 'a', focusId: 'b' })
    press(nodes[1]!, 'y')
    expect(store.applyNodeVisual).toHaveBeenCalledWith('y', 'a', 'b', undefined)
    expect(result.current.vimMode).toBe('normal')
    press(nodes[1]!, 'p')
    expect(store.pasteNodeForest).toHaveBeenCalledWith('b', 'after', { nodes, sourceIds: ['a', 'b'] })

    press(nodes[1]!, 'V')
    press(nodes[1]!, 'k')
    press(nodes[0]!, 'o')
    expect(result.current.selection).toEqual({ anchorId: 'a', focusId: 'b' })
    press(nodes[1]!, 'c')
    expect(result.current.vimMode).toBe('insert')
    input.value = 'Changed'
    press(nodes[1]!, 'Escape')
    press(nodes[1]!, '.')
    expect(store.applyNodeVisual).toHaveBeenLastCalledWith('c', 'a', 'b', undefined, 'Changed')

    currentParentId = 'a'
    selectedNodeId = 'a'
    press(nodes[0]!, 'V')
    expect(result.current.vimMode).toBe('normal')
  })

  it('resyncs the image caret after a whole-node Visual command keeps the same node selected', () => {
    const node: TreeNode = { id: 'root', text: 'ab', attachment: { id: 'image', mimeType: 'image/png' }, children: [] }
    let selectedNodeId = 'root'
    let focus: { nodeId: string; cursor: number; token: number } = { nodeId: 'root', cursor: 0, token: 0 }
    let focusToken = 0
    const store = {
      getSnapshot: () => ({
        status: 'ready',
        document: { roots: [node] },
        location: { currentParentId: null, selectedNodeId },
        focus,
      }),
      selectNode: vi.fn((id: string, cursor: number) => {
        selectedNodeId = id
        focusToken += 1
        focus = { nodeId: id, cursor, token: focusToken }
      }),
      applyNodeVisual: vi.fn(() => {
        focusToken += 1
        focus = { nodeId: 'root', cursor: 0, token: focusToken }
        return { nodes: [node], sourceIds: ['root'] }
      }),
      endTextSession: vi.fn(),
    } as unknown as EditorStore
    const { result } = renderHook(() => {
      const [vimMode, setVimMode] = useState<VimMode>('normal')
      const [selection, setSelection] = useState<{ anchorId: string; focusId: string }>()
      const [imageCaretNodeId, setImageCaretNodeId] = useState<string>()
      const bindings = useNodeInputBindings({
        store,
        selectedNodeId,
        focus,
        vimMode,
        setVimMode,
        setImageCaretNodeId,
        nodeVisualSelection: selection,
        setNodeVisualSelection: setSelection,
        onPreviewAttachment: vi.fn(),
      })
      return { bindings, vimMode, imageCaretNodeId }
    })
    const row = document.createElement('div')
    row.className = 'node-row'
    row.dataset.hasAttachment = 'true'
    const input = document.createElement('textarea')
    input.value = 'ab'
    input.setSelectionRange(1, 1)
    row.append(input)
    const press = (key: string): void => {
      act(() => {
        result.current.bindings(node).onKeyDown({
          currentTarget: input,
          key,
          metaKey: false,
          ctrlKey: false,
          altKey: false,
          preventDefault: vi.fn(),
        } as never)
      })
    }

    press('l')
    expect(result.current.imageCaretNodeId).toBe('root')

    press('V')
    press('u')

    expect(store.applyNodeVisual).toHaveBeenCalledWith('u', 'root', 'root', undefined)
    expect(result.current.vimMode).toBe('normal')
    expect(result.current.imageCaretNodeId).toBeUndefined()
  })

  it('resyncs the image caret after a Visual Node move clamps at the same node', () => {
    const node: TreeNode = { id: 'root', text: 'ab', attachment: { id: 'image', mimeType: 'image/png' }, children: [] }
    let selectedNodeId = 'root'
    let focus: { nodeId: string; cursor: number; token: number } = { nodeId: 'root', cursor: 0, token: 0 }
    let focusToken = 0
    const store = {
      getSnapshot: () => ({
        status: 'ready',
        document: { roots: [node] },
        location: { currentParentId: null, selectedNodeId },
        focus,
      }),
      selectNode: vi.fn((id: string, cursor: number) => {
        selectedNodeId = id
        focusToken += 1
        focus = { nodeId: id, cursor, token: focusToken }
      }),
    } as unknown as EditorStore
    const { result } = renderHook(() => {
      const [vimMode, setVimMode] = useState<VimMode>('normal')
      const [selection, setSelection] = useState<{ anchorId: string; focusId: string }>()
      const [imageCaretNodeId, setImageCaretNodeId] = useState<string>()
      const bindings = useNodeInputBindings({
        store,
        selectedNodeId,
        focus,
        vimMode,
        setVimMode,
        setImageCaretNodeId,
        nodeVisualSelection: selection,
        setNodeVisualSelection: setSelection,
        onPreviewAttachment: vi.fn(),
      })
      return { bindings, vimMode, imageCaretNodeId }
    })
    const row = document.createElement('div')
    row.className = 'node-row'
    row.dataset.hasAttachment = 'true'
    const input = document.createElement('textarea')
    input.value = 'ab'
    input.setSelectionRange(1, 1)
    row.append(input)
    const press = (key: string): void => {
      act(() => {
        result.current.bindings(node).onKeyDown({
          currentTarget: input,
          key,
          metaKey: false,
          ctrlKey: false,
          altKey: false,
          preventDefault: vi.fn(),
        } as never)
      })
    }

    press('l')
    expect(result.current.imageCaretNodeId).toBe('root')

    press('V')
    press('j')

    expect(store.selectNode).toHaveBeenCalledWith('root', 0)
    expect(result.current.imageCaretNodeId).toBeUndefined()
  })

  it('captures opened child text for structural dot repeat', () => {
    const store = {
      createChild: vi.fn(() => true),
      createChildWithText: vi.fn(),
      createSibling: vi.fn(() => true),
      createSiblingWithText: vi.fn(),
      endTextSession: vi.fn(),
      getSnapshot: () => ({
        status: 'ready',
        document: { roots: [{ id: 'a', text: 'A', children: [] }] },
        location: { currentParentId: 'a', selectedNodeId: 'a' },
      }),
    } as unknown as EditorStore
    const { result } = renderHook(() => {
      const [vimMode, setVimMode] = useState<VimMode>('normal')
      const bindings = useNodeInputBindings({
        store,
        selectedNodeId: 'a',
        vimMode,
        setVimMode,
        onPreviewAttachment: vi.fn(),
      })
      return { bindings, vimMode }
    })
    const input = document.createElement('textarea')
    input.value = 'A'
    const press = (key: string): void => {
      act(() => {
        result.current.bindings({ id: 'a', text: input.value, children: [] }).onKeyDown({
          currentTarget: input,
          key,
          metaKey: false,
          ctrlKey: false,
          altKey: false,
          preventDefault: vi.fn(),
        } as never)
      })
    }
    press('o')
    expect(result.current.vimMode).toBe('insert')
    input.value = 'Opened'
    press('Escape')
    press('.')
    expect(store.createChildWithText).toHaveBeenCalledWith('Opened')
  })

  it('edits content on content change using the node links, defaulting to none', () => {
    const store = createStore()
    const { result } = renderBindings({ store, selectedNodeId: 'node' })
    const text = 'https://example.test'
    const links = [{ start: 0, end: text.length, url: text }]
    const linkedNode: TreeNode = { id: 'node', text, links, children: [] }
    const input = document.createElement('div')
    input.textContent = text

    result.current(linkedNode).onContentChange({ currentTarget: input } as unknown as SyntheticEvent<HTMLElement>)
    expect(store.editContent).toHaveBeenCalledWith('node', text, links, false)

    input.textContent = 'x'
    const plainNode: TreeNode = { id: 'node', text: 'x', children: [] }
    result.current(plainNode).onContentChange({ currentTarget: input } as unknown as SyntheticEvent<HTMLElement>)
    expect(store.editContent).toHaveBeenLastCalledWith('node', 'x', [], false)
  })

  it('uses Cmd+click to request opening the edited link', () => {
    const store = createStore()
    const { result } = renderBindings({ store, selectedNodeId: 'node' })
    const url = 'https://example.test'
    const node: TreeNode = { id: 'node', text: url, links: [{ start: 0, end: url.length, url }], children: [] }
    const input = document.createElement('div')
    input.innerHTML = `<a href="${url}">${url}</a>`
    const link = input.querySelector('a')!
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    const preventDefault = vi.fn()
    const event = (metaKey: boolean) =>
      ({ target: link, currentTarget: input, metaKey, preventDefault }) as unknown as Parameters<
        ReturnType<typeof result.current>['onClick']
      >[0]

    result.current(node).onClick(event(false))
    expect(open).not.toHaveBeenCalled()
    result.current(node).onClick(event(true))
    expect(open).toHaveBeenCalledWith(url, '_blank')
    expect(preventDefault).toHaveBeenCalledTimes(2)
    open.mockRestore()
  })

  it('ends the text session only for non-collapsed selections', () => {
    const store = createStore()
    const { result } = renderBindings({ store, selectedNodeId: 'node' })
    const bindings = result.current({ id: 'node', text: '', children: [] })

    const textarea = document.createElement('textarea') as HTMLTextAreaElement
    textarea.value = 'ab'
    textarea.setSelectionRange(0, 2)
    bindings.onSelect({ currentTarget: textarea } as unknown as SyntheticEvent<HTMLElement>)
    expect(store.endTextSession).toHaveBeenCalledTimes(1)

    textarea.setSelectionRange(1, 1)
    bindings.onSelect({ currentTarget: textarea } as unknown as SyntheticEvent<HTMLElement>)
    expect(store.endTextSession).toHaveBeenCalledTimes(1)

    const div = document.createElement('div')
    const collapsed = vi.spyOn(globalThis, 'getSelection').mockReturnValue({ isCollapsed: true } as Selection)
    bindings.onSelect({ currentTarget: div } as unknown as SyntheticEvent<HTMLElement>)
    expect(store.endTextSession).toHaveBeenCalledTimes(1)

    collapsed.mockReturnValue({ isCollapsed: false } as Selection)
    bindings.onSelect({ currentTarget: div } as unknown as SyntheticEvent<HTMLElement>)
    expect(store.endTextSession).toHaveBeenCalledTimes(2)
    collapsed.mockRestore()
  })

  it('opens the native editor menu with the current selection', async () => {
    const store = createStore()
    const showEditorContextMenu = vi.fn(async () => 'copy' as const)
    window.treeApi = { showEditorContextMenu } as unknown as Window['treeApi']
    const { result } = renderBindings({ store, selectedNodeId: 'node' })
    const bindings = result.current({ id: 'node', text: 'hello', children: [] })
    const textarea = document.createElement('textarea')
    textarea.value = 'hello'
    textarea.setSelectionRange(1, 4)
    const preventDefault = vi.fn()

    bindings.onContextMenu({ currentTarget: textarea, clientX: 10, clientY: 20, preventDefault } as never)
    await Promise.resolve()

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
    expect(store.copy).toHaveBeenCalledWith('node', 1, 4)
  })

  it('prevents a secondary-button press from changing the text selection', () => {
    const store = createStore()
    const { result } = renderBindings({ store, selectedNodeId: 'node' })
    const bindings = result.current({ id: 'node', text: 'hello', children: [] })
    const preventDefault = vi.fn()

    bindings.onMouseDown({ button: 2, preventDefault } as never)

    expect(preventDefault).toHaveBeenCalledOnce()
  })

  it('keeps the primary-button press available for normal caret and text selection', () => {
    const store = createStore()
    const { result } = renderBindings({ store, selectedNodeId: 'node' })
    const bindings = result.current({ id: 'node', text: 'hello', children: [] })
    const preventDefault = vi.fn()

    bindings.onMouseDown({ button: 0, preventDefault } as never)

    expect(preventDefault).not.toHaveBeenCalled()
  })

  it('ignores focus intents for nodes that are not registered', async () => {
    const store = createStore()
    const { result } = renderHook(() =>
      useNodeInputBindings({
        store,
        selectedNodeId: 'node',
        focus: { nodeId: 'missing', cursor: 0, token: 1 },
        onPreviewAttachment: vi.fn(),
      }),
    )
    await Promise.resolve()

    expect(result.current({ id: 'node', text: '', children: [] })).toBeDefined()
  })

  it('focuses the registered input and positions the caret for the requested node', () => {
    const store = createStore()
    const holder: { focus: { nodeId: string; cursor: number; token: number } | undefined } = { focus: undefined }
    const { result, rerender } = renderHook(() =>
      useNodeInputBindings({ store, selectedNodeId: 'node', focus: holder.focus, onPreviewAttachment: vi.fn() }),
    )
    const textarea = document.createElement('textarea')
    textarea.value = 'hello'
    document.body.append(textarea)
    result.current({ id: 'node', text: 'hello', children: [] }).inputRef(textarea)

    holder.focus = { nodeId: 'node', cursor: 3, token: 1 }
    rerender()

    expect(textarea.selectionStart).toBe(3)
  })

  it('keeps a block selection when Normal mode focuses another node', () => {
    const store = createStore()
    const holder: { focus: { nodeId: string; cursor: number; token: number } | undefined } = { focus: undefined }
    const { result, rerender } = renderHook(() =>
      useNodeInputBindings({
        store,
        selectedNodeId: 'node',
        focus: holder.focus,
        onPreviewAttachment: vi.fn(),
        vimMode: 'normal',
      }),
    )
    const textarea = document.createElement('textarea')
    textarea.value = 'hello'
    document.body.append(textarea)
    result.current({ id: 'node', text: 'hello', children: [] }).inputRef(textarea)

    holder.focus = { nodeId: 'node', cursor: 3, token: 1 }
    rerender()

    expect(textarea.selectionStart).toBe(3)
    expect(textarea.selectionEnd).toBe(4)
  })

  it('clears an unfinished Vim operator on blur and composition start', () => {
    const store = createStore()
    const { result } = renderBindings({ store, selectedNodeId: 'node', vimMode: 'normal' })
    const node: TreeNode = { id: 'node', text: 'text', children: [] }
    const input = document.createElement('textarea')
    input.value = 'text'
    const pressD = (): void => {
      result.current(node).onKeyDown({
        currentTarget: input,
        key: 'd',
        metaKey: false,
        ctrlKey: false,
        altKey: false,
        preventDefault: vi.fn(),
      } as never)
    }

    pressD()
    result.current(node).onBlur()
    pressD()
    expect(store.deleteSelected).not.toHaveBeenCalled()

    result.current(node).onCompositionStart({ currentTarget: input } as never)
    pressD()
    expect(store.deleteSelected).not.toHaveBeenCalled()
  })

  it('overwrites and appends in Replace mode, then commits one repeatable range edit', () => {
    const store = createStore()
    const node: TreeNode = { id: 'node', text: 'abcd', children: [] }
    const { result } = renderHook(() => {
      const [vimMode, setVimMode] = useState<'insert' | 'normal' | 'replace' | 'visual' | 'visual-node'>('normal')
      const bindings = useNodeInputBindings({
        store,
        selectedNodeId: 'node',
        onPreviewAttachment: vi.fn(),
        vimMode,
        setVimMode,
      })(node)
      return { bindings, vimMode }
    })
    const input = document.createElement('textarea')
    input.value = node.text
    input.setSelectionRange(2, 2)
    const press = (key: string): void => {
      act(() => {
        result.current.bindings.onKeyDown({
          currentTarget: input,
          key,
          metaKey: false,
          ctrlKey: false,
          altKey: false,
          preventDefault: vi.fn(),
        } as never)
      })
    }

    press('R')
    expect(result.current.vimMode).toBe('replace')
    press('X')
    press('Y')
    press('Z')
    expect(input.value).toBe('abXYZ')
    press('Backspace')
    expect(input.value).toBe('abXY')
    press('Escape')

    expect(result.current.vimMode).toBe('normal')
    expect(store.replaceTextRange).toHaveBeenCalledOnce()
    expect(store.replaceTextRange).toHaveBeenCalledWith('node', 2, 4, 'XY')
  })

  it('resumes Replace mode after native text composition', () => {
    const store = createStore()
    const node: TreeNode = { id: 'node', text: 'abcd', children: [] }
    const { result } = renderHook(() => {
      const [vimMode, setVimMode] = useState<'insert' | 'normal' | 'replace' | 'visual' | 'visual-node'>('normal')
      const bindings = useNodeInputBindings({
        store,
        selectedNodeId: 'node',
        onPreviewAttachment: vi.fn(),
        vimMode,
        setVimMode,
      })(node)
      return { bindings, vimMode }
    })
    const input = document.createElement('textarea')
    input.value = node.text
    input.setSelectionRange(2, 2)
    const press = (key: string): void => {
      act(() => {
        result.current.bindings.onKeyDown({
          currentTarget: input,
          key,
          metaKey: false,
          ctrlKey: false,
          altKey: false,
          preventDefault: vi.fn(),
        } as never)
      })
    }

    press('R')
    act(() => result.current.bindings.onCompositionStart({ currentTarget: input } as never))
    input.value = 'abあcd'
    input.setSelectionRange(3, 3)
    act(() => result.current.bindings.onCompositionEnd({ currentTarget: input } as never))
    press('X')
    press('Escape')

    expect(result.current.vimMode).toBe('normal')
    expect(store.replaceTextRange).toHaveBeenCalledOnce()
    expect(store.replaceTextRange).toHaveBeenCalledWith('node', 3, 4, 'X')
  })
  it('applies surround commands as one edit and repeats them with dot', () => {
    const store = {
      endTextSession: vi.fn(),
      replaceTextRanges: vi.fn(),
      getSnapshot: () => ({
        status: 'ready',
        document: { roots: [{ id: 'a', text: 'foo bar', children: [] }] },
        location: { currentParentId: null, selectedNodeId: 'a' },
      }),
    } as unknown as EditorStore
    const { result } = renderHook(() => {
      const [vimMode, setVimMode] = useState<VimMode>('normal')
      const bindings = useNodeInputBindings({
        store,
        selectedNodeId: 'a',
        vimMode,
        setVimMode,
        onPreviewAttachment: vi.fn(),
      })
      return { bindings, vimMode }
    })
    const input = document.createElement('textarea')
    document.body.append(input)
    const press = (key: string, cursor?: number): void => {
      if (cursor !== undefined) input.setSelectionRange(cursor, cursor)
      act(() => {
        result.current.bindings({ id: 'a', text: input.value, children: [] }).onKeyDown({
          currentTarget: input,
          key,
          metaKey: false,
          ctrlKey: false,
          altKey: false,
          preventDefault: vi.fn(),
        } as never)
      })
    }

    input.value = 'foo bar'
    press('y', 0)
    press('s')
    press('i')
    press('w')
    press('"')
    expect(store.replaceTextRanges).toHaveBeenLastCalledWith('a', [
      { start: 0, end: 0, inserted: '"' },
      { start: 3, end: 3, inserted: '"' },
    ])

    input.value = 'say "hi" now'
    press('d', 5)
    press('s')
    press('"')
    expect(store.replaceTextRanges).toHaveBeenLastCalledWith('a', [
      { start: 4, end: 5, inserted: '' },
      { start: 7, end: 8, inserted: '' },
    ])

    press('c', 5)
    press('s')
    press('"')
    press(')')
    expect(store.replaceTextRanges).toHaveBeenLastCalledWith('a', [
      { start: 4, end: 5, inserted: '(' },
      { start: 7, end: 8, inserted: ')' },
    ])

    input.value = '  foo'
    press('y', 3)
    press('s')
    press('s')
    press(')')
    expect(store.replaceTextRanges).toHaveBeenLastCalledWith('a', [
      { start: 2, end: 2, inserted: '(' },
      { start: 5, end: 5, inserted: ')' },
    ])

    // A repeat re-derives the range at the caret rather than replaying fixed offsets.
    input.value = 'one two'
    press('y', 0)
    press('s')
    press('i')
    press('w')
    press(']')
    press('.', 4)
    expect(store.replaceTextRanges).toHaveBeenLastCalledWith('a', [
      { start: 4, end: 4, inserted: '[' },
      { start: 7, end: 7, inserted: ']' },
    ])

    // yss takes no count, following the cc and S whole-node precedent.
    const before = (store.replaceTextRanges as ReturnType<typeof vi.fn>).mock.calls.length
    press('2', 0)
    press('y')
    press('s')
    press('s')
    press(')')
    expect((store.replaceTextRanges as ReturnType<typeof vi.fn>).mock.calls.length).toBe(before)

    // An unsupported delimiter key makes no change.
    press('y', 0)
    press('s')
    press('i')
    press('w')
    press('z')
    expect((store.replaceTextRanges as ReturnType<typeof vi.fn>).mock.calls.length).toBe(before)

    // A target with no enclosing pair makes no change.
    press('d', 0)
    press('s')
    press('"')
    expect((store.replaceTextRanges as ReturnType<typeof vi.fn>).mock.calls.length).toBe(before)

    // `dsw` must not be read as "delete surrounding word".
    press('d', 0)
    press('s')
    press('w')
    expect((store.replaceTextRanges as ReturnType<typeof vi.fn>).mock.calls.length).toBe(before)
    input.remove()
  })

  it('leaves an image-only node untouched by every surround command', () => {
    const store = {
      endTextSession: vi.fn(),
      replaceTextRanges: vi.fn(),
      getSnapshot: () => ({
        status: 'ready',
        document: { roots: [{ id: 'a', text: '', children: [] }] },
        location: { currentParentId: null, selectedNodeId: 'a' },
      }),
    } as unknown as EditorStore
    const { result } = renderHook(() => {
      const [vimMode, setVimMode] = useState<VimMode>('normal')
      const bindings = useNodeInputBindings({
        store,
        selectedNodeId: 'a',
        vimMode,
        setVimMode,
        onPreviewAttachment: vi.fn(),
      })
      return { bindings, vimMode }
    })
    const imageOnly: TreeNode = {
      id: 'a',
      text: '',
      attachment: { id: 'attachment-1', mimeType: 'image/png' },
      children: [],
    }
    const input = document.createElement('textarea')
    document.body.append(input)
    input.value = ''
    const press = (key: string): void => {
      act(() => {
        result.current.bindings(imageOnly).onKeyDown({
          currentTarget: input,
          key,
          metaKey: false,
          ctrlKey: false,
          altKey: false,
          preventDefault: vi.fn(),
        } as never)
      })
    }

    for (const sequence of [
      ['y', 's', 'i', 'w', ')'],
      ['y', 's', 's', ')'],
      ['d', 's', ')'],
      ['c', 's', ')', '"'],
    ]) {
      for (const key of sequence) press(key)
      expect(store.replaceTextRanges).not.toHaveBeenCalled()
    }
    expect(result.current.vimMode).toBe('normal')
    input.remove()
  })

  it('surrounds a character-wise Visual selection with S and returns to Normal mode', () => {
    const store = {
      endTextSession: vi.fn(),
      replaceTextRanges: vi.fn(),
      getSnapshot: () => ({
        status: 'ready',
        document: { roots: [{ id: 'a', text: 'foo bar', children: [] }] },
        location: { currentParentId: null, selectedNodeId: 'a' },
      }),
    } as unknown as EditorStore
    const { result } = renderHook(() => {
      const [vimMode, setVimMode] = useState<VimMode>('normal')
      const bindings = useNodeInputBindings({
        store,
        selectedNodeId: 'a',
        vimMode,
        setVimMode,
        onPreviewAttachment: vi.fn(),
      })
      return { bindings, vimMode }
    })
    const input = document.createElement('textarea')
    document.body.append(input)
    input.value = 'foo bar'
    const press = (key: string): void => {
      act(() => {
        result.current.bindings({ id: 'a', text: input.value, children: [] }).onKeyDown({
          currentTarget: input,
          key,
          metaKey: false,
          ctrlKey: false,
          altKey: false,
          preventDefault: vi.fn(),
        } as never)
      })
    }
    input.setSelectionRange(0, 0)
    press('v')
    press('l')
    press('l')
    expect(result.current.vimMode).toBe('visual')

    // An unsupported delimiter changes nothing and keeps the selection so it can be retyped.
    press('S')
    press('z')
    expect(store.replaceTextRanges).not.toHaveBeenCalled()
    expect(result.current.vimMode).toBe('visual')

    press('S')
    press('}')
    expect(store.replaceTextRanges).toHaveBeenLastCalledWith('a', [
      { start: 0, end: 0, inserted: '{' },
      { start: 3, end: 3, inserted: '}' },
    ])
    expect(result.current.vimMode).toBe('normal')
    input.remove()
  })
})
