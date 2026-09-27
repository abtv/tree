// @vitest-environment jsdom

import { act, cleanup, fireEvent, renderHook } from '@testing-library/react'
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
    getSnapshot: vi.fn(() => ({
      status: 'ready',
      document: { roots: [{ id: 'node', text: 'hello', children: [] }] },
      location: { currentParentId: null, selectedNodeId: 'node' },
      focus: { nodeId: 'node', cursor: 3, token: 1 },
    })),
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
  return renderHook(() => useNodeInputBindings({ ...options, onPreviewAttachment }).bindings)
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
      const { bindings } = useNodeInputBindings({
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
      const { bindings } = useNodeInputBindings({
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
      const { bindings } = useNodeInputBindings({
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

  it('keeps a non-final image return position across commands without a new focus intent', () => {
    const node: TreeNode = {
      id: 'root',
      text: 'abcd',
      attachment: { id: 'image', mimeType: 'image/png' },
      children: [],
    }
    let focus = { nodeId: 'root', cursor: 0, token: 1 }
    const store = {
      getSnapshot: () => ({
        status: 'ready',
        document: { roots: [node] },
        location: { currentParentId: null, selectedNodeId: 'root' },
        focus,
      }),
      undo: vi.fn(),
      redo: vi.fn(),
      leave: vi.fn(),
      endTextSession: vi.fn(),
      selectNode: vi.fn((_id: string, cursor: number) => {
        focus = { nodeId: 'root', cursor, token: focus.token + 1 }
      }),
    } as unknown as EditorStore
    const { result } = renderHook(() => {
      const [vimMode, setVimMode] = useState<VimMode>('normal')
      const [selection, setSelection] = useState<{ anchorId: string; focusId: string }>()
      const [imageCaretNodeId, setImageCaretNodeId] = useState<string>()
      return {
        bindings: useNodeInputBindings({
          store,
          selectedNodeId: 'root',
          focus,
          vimMode,
          setVimMode,
          setImageCaretNodeId,
          nodeVisualSelection: selection,
          setNodeVisualSelection: setSelection,
          onPreviewAttachment: vi.fn(),
        }).bindings,
        vimMode,
        imageCaretNodeId,
      }
    })
    const row = document.createElement('div')
    row.className = 'node-row'
    row.dataset.hasAttachment = 'true'
    const input = document.createElement('textarea')
    input.value = node.text
    input.setSelectionRange(1, 1)
    row.append(input)
    const press = (key: string, ctrlKey = false): void => {
      act(() => {
        result.current.bindings(node).onKeyDown({
          currentTarget: input,
          key,
          metaKey: false,
          ctrlKey,
          altKey: false,
          preventDefault: vi.fn(),
        } as never)
      })
      input.classList.toggle('node-input-image-caret', result.current.imageCaretNodeId === node.id)
    }

    press('j')
    expect(result.current.imageCaretNodeId).toBe('root')
    press('u')
    press('r', true)
    press('o', true)
    press('V')
    press('Escape')
    expect(result.current.vimMode).toBe('normal')
    expect(result.current.imageCaretNodeId).toBe('root')
    press('k')
    expect(input.selectionStart).toBe(1)
    expect(result.current.imageCaretNodeId).toBeUndefined()

    press('j')
    act(() => {
      store.selectNode('root', 0)
      result.current.bindings(node).onKeyDown({
        currentTarget: input,
        key: 'u',
        metaKey: false,
        ctrlKey: false,
        altKey: false,
        preventDefault: vi.fn(),
      } as never)
    })
    expect(result.current.imageCaretNodeId).toBeUndefined()
  })

  it('keeps an explicit image destination when a child-to-parent motion creates a focus intent', () => {
    const child: TreeNode = { id: 'child', text: 'child', children: [] }
    const parent: TreeNode = {
      id: 'parent',
      text: 'Parent',
      attachment: { id: 'image', mimeType: 'image/png' },
      children: [child],
    }
    let selectedNodeId = child.id
    let focus = { nodeId: child.id, cursor: 0, token: 1 }
    const store = {
      getSnapshot: () => ({
        status: 'ready',
        document: { roots: [parent] },
        location: { currentParentId: parent.id, selectedNodeId },
        focus,
      }),
      moveSelection: vi.fn(() => {
        selectedNodeId = parent.id
        focus = { nodeId: parent.id, cursor: parent.text.length, token: 2 }
      }),
      endTextSession: vi.fn(),
    } as unknown as EditorStore
    const { result, rerender } = renderHook(() => {
      const [imageCaretNodeId, setImageCaretNodeId] = useState<string>()
      return {
        bindings: useNodeInputBindings({
          store,
          selectedNodeId,
          focus,
          vimMode: 'normal',
          setImageCaretNodeId,
          onPreviewAttachment: vi.fn(),
        }).bindings,
        imageCaretNodeId,
      }
    })
    const input = document.createElement('textarea')
    input.value = child.text
    act(() => {
      result.current.bindings(child).onKeyDown({
        currentTarget: input,
        key: 'k',
        metaKey: false,
        ctrlKey: false,
        altKey: false,
        preventDefault: vi.fn(),
      } as never)
    })
    rerender()

    expect(store.moveSelection).toHaveBeenCalledWith('up', child.text.length)
    expect(result.current.imageCaretNodeId).toBe(parent.id)
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
      const { bindings } = useNodeInputBindings({
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

  it('captures a plain Insert session when blur leaves the node selected', () => {
    const store = {
      endTextSession: vi.fn(),
      replaceTextRange: vi.fn(),
      getSnapshot: () => ({
        status: 'ready',
        document: { roots: [{ id: 'a', text: 'a', children: [] }] },
        location: { currentParentId: null, selectedNodeId: 'a' },
      }),
    } as unknown as EditorStore
    const { result } = renderHook(() => {
      const [vimMode, setVimMode] = useState<VimMode>('normal')
      const { bindings } = useNodeInputBindings({
        store,
        selectedNodeId: 'a',
        vimMode,
        setVimMode,
        onPreviewAttachment: vi.fn(),
      })
      return { bindings, vimMode }
    })
    const node: TreeNode = { id: 'a', text: 'a', children: [] }
    const input = document.createElement('textarea')
    input.value = 'a'
    result.current.bindings(node).inputRef(input)
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
    press('i')
    expect(result.current.vimMode).toBe('insert')
    input.value = 'aX'
    act(() => result.current.bindings(node).onBlur())
    expect(result.current.vimMode).toBe('insert')
    press('Escape')
    press('.')
    expect(store.replaceTextRange).toHaveBeenCalledTimes(1)
  })

  it('captures a plain Insert session across a node change but does not replay it on a different node', () => {
    const store = {
      endTextSession: vi.fn(),
      replaceTextRange: vi.fn(),
      getSnapshot: () => ({
        status: 'ready',
        document: { roots: [{ id: 'a', text: 'a', children: [] }] },
        location: { currentParentId: null, selectedNodeId: 'a' },
      }),
    } as unknown as EditorStore
    const { result } = renderHook(() => {
      const [vimMode, setVimMode] = useState<VimMode>('normal')
      const { bindings } = useNodeInputBindings({
        store,
        selectedNodeId: 'a',
        vimMode,
        setVimMode,
        onPreviewAttachment: vi.fn(),
      })
      return { bindings, vimMode }
    })
    const nodeA: TreeNode = { id: 'a', text: 'a', children: [] }
    const nodeB: TreeNode = { id: 'b', text: 'b', children: [] }
    const inputA = document.createElement('textarea')
    inputA.value = 'a'
    const inputB = document.createElement('textarea')
    inputB.value = 'b'
    result.current.bindings(nodeA).inputRef(inputA)
    result.current.bindings(nodeB).inputRef(inputB)
    const pressOn = (node: TreeNode, input: HTMLElement, key: string): void => {
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
    pressOn(nodeA, inputA, 'i')
    expect(result.current.vimMode).toBe('insert')
    inputA.value = 'aX'
    // Focus moves to a different node's own input with no intervening Escape (mirroring Enter
    // while still in Insert mode, or clicking directly into another row). The dot-repeat diff is
    // still captured (against node A), but must not later replay onto node B.
    act(() => result.current.bindings(nodeA).onBlur())
    expect(result.current.vimMode).toBe('insert')
    pressOn(nodeB, inputB, 'Escape')
    pressOn(nodeB, inputB, '.')
    expect(store.replaceTextRange).not.toHaveBeenCalled()
  })

  it('replays a plain Insert session once the user returns to the node it was captured on', () => {
    const store = {
      endTextSession: vi.fn(),
      replaceTextRange: vi.fn(),
      getSnapshot: () => ({
        status: 'ready',
        document: { roots: [{ id: 'a', text: 'a', children: [] }] },
        location: { currentParentId: null, selectedNodeId: 'a' },
      }),
    } as unknown as EditorStore
    const { result } = renderHook(() => {
      const [vimMode, setVimMode] = useState<VimMode>('normal')
      const { bindings } = useNodeInputBindings({
        store,
        selectedNodeId: 'a',
        vimMode,
        setVimMode,
        onPreviewAttachment: vi.fn(),
      })
      return { bindings, vimMode }
    })
    const nodeA: TreeNode = { id: 'a', text: 'a', children: [] }
    const nodeB: TreeNode = { id: 'b', text: 'b', children: [] }
    const inputA = document.createElement('textarea')
    inputA.value = 'a'
    const inputB = document.createElement('textarea')
    inputB.value = 'b'
    result.current.bindings(nodeA).inputRef(inputA)
    result.current.bindings(nodeB).inputRef(inputB)
    const pressOn = (node: TreeNode, input: HTMLElement, key: string): void => {
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
    pressOn(nodeA, inputA, 'i')
    inputA.value = 'aX'
    // Focus crosses to node B with no intervening Escape, same as the discard case above, but the
    // user then returns to node A (e.g. navigates back) without starting a fresh Insert session
    // there. The captured diff's node ID still matches, so `.` must replay it.
    act(() => result.current.bindings(nodeA).onBlur())
    pressOn(nodeB, inputB, 'Escape')
    pressOn(nodeA, inputA, '.')
    expect(store.replaceTextRange).toHaveBeenCalledTimes(1)
    expect((store.replaceTextRange as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]).toBe('a')
  })

  it('captures a plain Insert session when a same-node pointer click commits it', () => {
    const store = {
      endTextSession: vi.fn(),
      replaceTextRange: vi.fn(),
      getSnapshot: () => ({
        status: 'ready',
        document: { roots: [{ id: 'a', text: 'a', children: [] }] },
        location: { currentParentId: null, selectedNodeId: 'a' },
      }),
    } as unknown as EditorStore
    const { result } = renderHook(() => {
      const [vimMode, setVimMode] = useState<VimMode>('normal')
      const { bindings } = useNodeInputBindings({
        store,
        selectedNodeId: 'a',
        vimMode,
        setVimMode,
        onPreviewAttachment: vi.fn(),
      })
      return { bindings, vimMode }
    })
    const node: TreeNode = { id: 'a', text: 'a', children: [] }
    const input = document.createElement('textarea')
    input.value = 'a'
    result.current.bindings(node).inputRef(input)
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
    press('i')
    input.value = 'aX'
    act(() => result.current.bindings(node).onMouseDown({ currentTarget: input, button: 0 } as never))
    press('Escape')
    press('.')
    expect(store.replaceTextRange).toHaveBeenCalledTimes(1)
  })

  it('captures opened child text for structural dot repeat after blur ends the session', () => {
    // 'o' creates a new sibling and immediately moves focus onto it, which blurs the originating
    // node as an incidental side effect before any text is typed. Model that with two distinct
    // tracked nodes (as real node creation always produces a new id) so the structural session is
    // only finished by a later blur on the node it actually ends up focused on.
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
      const { bindings } = useNodeInputBindings({
        store,
        selectedNodeId: 'a',
        vimMode,
        setVimMode,
        onPreviewAttachment: vi.fn(),
      })
      return { bindings, vimMode }
    })
    const nodeA: TreeNode = { id: 'a', text: 'A', children: [] }
    const nodeB: TreeNode = { id: 'b', text: '', children: [] }
    const inputA = document.createElement('textarea')
    inputA.value = 'A'
    const inputB = document.createElement('textarea')
    result.current.bindings(nodeA).inputRef(inputA)
    result.current.bindings(nodeB).inputRef(inputB)

    act(() => {
      result.current.bindings(nodeA).onKeyDown({
        currentTarget: inputA,
        key: 'o',
        metaKey: false,
        ctrlKey: false,
        altKey: false,
        preventDefault: vi.fn(),
      } as never)
    })
    expect(result.current.vimMode).toBe('insert')
    act(() => result.current.bindings(nodeA).onBlur())
    expect(result.current.vimMode).toBe('insert')

    inputB.value = 'Opened'
    act(() => result.current.bindings(nodeB).onBlur())

    act(() => {
      result.current.bindings(nodeB).onKeyDown({
        currentTarget: inputB,
        key: 'Escape',
        metaKey: false,
        ctrlKey: false,
        altKey: false,
        preventDefault: vi.fn(),
      } as never)
    })
    act(() => {
      result.current.bindings(nodeB).onKeyDown({
        currentTarget: inputB,
        key: '.',
        metaKey: false,
        ctrlKey: false,
        altKey: false,
        preventDefault: vi.fn(),
      } as never)
    })
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

  it('reuses a pending link draft while its text still matches the edited node', () => {
    const store = createStore()
    const original = 'see https://example.test'
    const edited = 'see https//example.test'
    const linked: TreeNode = {
      id: 'node',
      text: original,
      links: [{ start: 4, end: original.length, url: original.slice(4) }],
      children: [],
    }
    let node: TreeNode = linked
    const { result, rerender } = renderHook(
      () => useNodeInputBindings({ store, selectedNodeId: 'node', onPreviewAttachment: vi.fn() }).bindings,
    )
    const input = document.createElement('div')
    input.textContent = edited
    result.current(node).onContentInput({ currentTarget: input } as unknown as SyntheticEvent<HTMLElement>)
    expect(store.editContent).toHaveBeenLastCalledWith('node', edited, [], false)

    node = { id: 'node', text: edited, links: [], children: [] }
    rerender()
    input.textContent = original
    result.current(node).onContentInput({ currentTarget: input } as unknown as SyntheticEvent<HTMLElement>)
    expect(store.editContent).toHaveBeenLastCalledWith(
      'node',
      original,
      [{ start: 4, end: original.length, url: original.slice(4) }],
      false,
    )
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

  it('commits a pending Replace session exactly once when the store re-enters the finish path', () => {
    const node: TreeNode = { id: 'a', text: 'ab', children: [] }
    const store = {
      endTextSession: vi.fn(),
      replaceTextRange: vi.fn(() => {
        // A store side effect that synchronously re-enters the finish path must not be able to
        // commit the Replace session a second time; the session is consumed before this call.
        result.current.bindings.onBlur()
      }),
      getSnapshot: () => ({
        status: 'ready',
        document: { roots: [node] },
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
      }).bindings(node)
      return { bindings, vimMode }
    })
    const input = document.createElement('textarea')
    input.value = 'ab'
    input.setSelectionRange(2, 2)
    result.current.bindings.inputRef(input)
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
    press('X')
    press('Escape')

    expect(store.replaceTextRange).toHaveBeenCalledTimes(1)
    expect(store.replaceTextRange).toHaveBeenCalledWith('a', 2, 2, 'X')
    expect(result.current.vimMode).toBe('normal')
  })

  it('reads the register written directly by the keyboard handler through the shared owner', () => {
    const nodes: TreeNode[] = [
      { id: 'a', text: 'A', children: [] },
      { id: 'b', text: 'B', children: [] },
    ]
    let selectedNodeId = 'a'
    const store = {
      getSnapshot: () => ({
        status: 'ready',
        document: { roots: nodes },
        location: { currentParentId: null, selectedNodeId },
      }),
      selectNode: vi.fn((id: string) => {
        selectedNodeId = id
      }),
      applyNodeVisual: vi.fn(() => ({ nodes, sourceIds: ['a'] })),
      endTextSession: vi.fn(),
    } as unknown as EditorStore
    const { result } = renderHook(() => {
      const [vimMode, setVimMode] = useState<VimMode>('normal')
      const [selection, setSelection] = useState<{ anchorId: string; focusId: string }>()
      return {
        bindings: useNodeInputBindings({
          store,
          selectedNodeId,
          vimMode,
          setVimMode,
          nodeVisualSelection: selection,
          setNodeVisualSelection: setSelection,
          onPreviewAttachment: vi.fn(),
        }).bindings,
      }
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

    press(nodes[0]!, 'y')
    press(nodes[0]!, 'y')
    press(nodes[0]!, 'V')
    press(nodes[0]!, 'j')
    press(nodes[1]!, 'd')

    expect(store.applyNodeVisual).toHaveBeenCalledWith('d', 'a', 'b', {
      nodes: [{ id: 'a', text: 'A', children: [] }],
      sourceIds: ['a'],
    })
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
    const { result } = renderHook(
      () =>
        useNodeInputBindings({
          store,
          selectedNodeId: 'node',
          focus: { nodeId: 'missing', cursor: 0, token: 1 },
          onPreviewAttachment: vi.fn(),
        }).bindings,
    )
    await Promise.resolve()

    expect(result.current({ id: 'node', text: '', children: [] })).toBeDefined()
  })

  it('focuses the registered input and positions the caret for the requested node', () => {
    const store = createStore()
    const holder: { focus: { nodeId: string; cursor: number; token: number } | undefined } = { focus: undefined }
    const { result, rerender } = renderHook(
      () =>
        useNodeInputBindings({ store, selectedNodeId: 'node', focus: holder.focus, onPreviewAttachment: vi.fn() })
          .bindings,
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
    const { result, rerender } = renderHook(
      () =>
        useNodeInputBindings({
          store,
          selectedNodeId: 'node',
          focus: holder.focus,
          onPreviewAttachment: vi.fn(),
          vimMode: 'normal',
        }).bindings,
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

  it('collapses the Normal caret on an attached node at its terminal image position', () => {
    const store = createStore()
    const holder: { focus: { nodeId: string; cursor: number; token: number } | undefined } = { focus: undefined }
    const { result, rerender } = renderHook(
      () =>
        useNodeInputBindings({
          store,
          selectedNodeId: 'node',
          focus: holder.focus,
          onPreviewAttachment: vi.fn(),
          vimMode: 'normal',
        }).bindings,
    )
    const row = document.createElement('div')
    row.className = 'node-row'
    row.dataset.hasAttachment = 'true'
    const textarea = document.createElement('textarea')
    textarea.value = 'hello'
    row.append(textarea)
    document.body.append(row)
    result.current({ id: 'node', text: 'hello', children: [] }).inputRef(textarea)

    holder.focus = { nodeId: 'node', cursor: 5, token: 1 }
    rerender()

    expect(textarea.selectionStart).toBe(5)
    expect(textarea.selectionEnd).toBe(5)
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
      }).bindings(node)
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
      }).bindings(node)
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

  it('activates the image caret when a Replace session commits on blur at the terminal position', () => {
    const node: TreeNode = { id: 'node', text: 'ab', attachment: { id: 'image', mimeType: 'image/png' }, children: [] }
    const store = {
      getSnapshot: () => ({
        status: 'ready',
        document: { roots: [node] },
        location: { currentParentId: null, selectedNodeId: 'node' },
      }),
      replaceTextRange: vi.fn(),
      endTextSession: vi.fn(),
    } as unknown as EditorStore
    const { result } = renderHook(() => {
      const [vimMode, setVimMode] = useState<VimMode>('normal')
      const [imageCaretNodeId, setImageCaretNodeId] = useState<string>()
      const bindings = useNodeInputBindings({
        store,
        selectedNodeId: 'node',
        onPreviewAttachment: vi.fn(),
        vimMode,
        setVimMode,
        setImageCaretNodeId,
      }).bindings(node)
      return { bindings, vimMode, imageCaretNodeId }
    })
    const input = document.createElement('textarea')
    input.value = node.text
    input.setSelectionRange(2, 2)
    result.current.bindings.inputRef(input)
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
    expect(input.value).toBe('abX')

    act(() => result.current.bindings.onBlur())

    expect(store.replaceTextRange).toHaveBeenCalledWith('node', 2, 2, 'X')
    expect(result.current.imageCaretNodeId).toBe('node')
  })

  it('activates the image caret when a same-node pointer click commits a Replace session at the terminal position', () => {
    const node: TreeNode = { id: 'node', text: 'ab', attachment: { id: 'image', mimeType: 'image/png' }, children: [] }
    const store = {
      getSnapshot: () => ({
        status: 'ready',
        document: { roots: [node] },
        location: { currentParentId: null, selectedNodeId: 'node' },
      }),
      replaceTextRange: vi.fn(),
      endTextSession: vi.fn(),
    } as unknown as EditorStore
    const { result } = renderHook(() => {
      const [vimMode, setVimMode] = useState<VimMode>('normal')
      const [imageCaretNodeId, setImageCaretNodeId] = useState<string>()
      const bindings = useNodeInputBindings({
        store,
        selectedNodeId: 'node',
        onPreviewAttachment: vi.fn(),
        vimMode,
        setVimMode,
        setImageCaretNodeId,
      }).bindings(node)
      return { bindings, vimMode, imageCaretNodeId }
    })
    const input = document.createElement('textarea')
    input.value = node.text
    input.setSelectionRange(2, 2)
    result.current.bindings.inputRef(input)
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
    press('X')
    expect(input.value).toBe('abX')

    act(() => result.current.bindings.onMouseDown({ currentTarget: input, button: 0 } as never))

    expect(store.replaceTextRange).toHaveBeenCalledWith('node', 2, 2, 'X')
    expect(result.current.imageCaretNodeId).toBe('node')
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
      const { bindings } = useNodeInputBindings({
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
      const { bindings } = useNodeInputBindings({
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
      const { bindings } = useNodeInputBindings({
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

  it('clears a character Visual selection on a pointer press and re-anchors at the pointer', () => {
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
      const { bindings } = useNodeInputBindings({
        store,
        selectedNodeId: 'a',
        vimMode,
        setVimMode,
        onPreviewAttachment: vi.fn(),
      })
      return { bindings, vimMode }
    })
    const node: TreeNode = { id: 'a', text: 'foo bar', children: [] }
    const input = document.createElement('textarea')
    document.body.append(input)
    input.value = 'foo bar'
    result.current.bindings(node).inputRef(input)
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

    input.setSelectionRange(0, 0)
    press('v')
    expect(result.current.vimMode).toBe('visual')
    expect(input.selectionStart).toBe(0)
    expect(input.selectionEnd).toBe(1)

    // A pointer press clears the Visual endpoints while character Visual mode stays active, so
    // the next motion must anchor at the pointer position rather than a stale anchor.
    input.setSelectionRange(3, 3)
    act(() => result.current.bindings(node).onMouseDown({ currentTarget: input, button: 0 } as never))

    press('l')
    expect(result.current.vimMode).toBe('visual')
    expect(input.selectionStart).toBe(3)
    expect(input.selectionEnd).toBe(5)
    input.remove()
  })
})

describe('drag caret freeze', () => {
  const node: TreeNode = { id: 'node', text: 'hello', children: [] }

  function renderFreeze(options: { vimMode?: VimMode; setVimMode?: (mode: VimMode) => void } = {}) {
    const store = createStore()
    return renderHook(() =>
      useNodeInputBindings({
        store,
        selectedNodeId: 'node',
        vimMode: options.vimMode ?? 'normal',
        setVimMode: options.setVimMode ?? vi.fn(),
        onPreviewAttachment: vi.fn(),
      }),
    )
  }

  function focusedInput(result: {
    current: { bindings: (node: TreeNode) => { inputRef: (input: HTMLElement | null) => void } }
  }) {
    const input = document.createElement('textarea')
    input.value = node.text
    document.body.append(input)
    result.current.bindings(node).inputRef(input)
    input.focus()
    return input
  }

  it('collapses a transient selection and blurs the source input when the freeze begins', () => {
    const { result } = renderFreeze()
    const input = focusedInput(result)
    input.setSelectionRange(1, 3)

    act(() => result.current.dragFreeze.begin('node', 7))

    expect(document.activeElement).not.toBe(input)
    expect(input.selectionStart).toBe(1)
    expect(input.selectionEnd).toBe(1)
    input.remove()
  })

  it('restores focus and the captured caret when the frozen pointer is released', () => {
    const { result } = renderFreeze()
    const input = focusedInput(result)
    input.setSelectionRange(1, 3)
    act(() => result.current.dragFreeze.begin('node', 7))

    act(() => result.current.dragFreeze.end(7))

    expect(document.activeElement).toBe(input)
    expect(input.selectionStart).toBe(1)
    expect(input.selectionEnd).toBe(1)
    input.remove()
  })

  it('ignores a release for a different pointer and restores exactly once for its own pointer', () => {
    const { result } = renderFreeze()
    const input = focusedInput(result)
    input.setSelectionRange(2, 2)
    act(() => result.current.dragFreeze.begin('node', 7))

    act(() => result.current.dragFreeze.end(8))
    expect(document.activeElement).not.toBe(input)

    act(() => result.current.dragFreeze.end(7))
    expect(document.activeElement).toBe(input)
    expect(input.selectionStart).toBe(2)

    act(() => result.current.dragFreeze.end(7))
    expect(document.activeElement).toBe(input)
    expect(input.selectionStart).toBe(2)
    input.remove()
  })

  it('releases any freeze when no pointer is given', () => {
    const { result } = renderFreeze()
    const input = focusedInput(result)
    act(() => result.current.dragFreeze.begin('node', 7))

    act(() => result.current.dragFreeze.end())

    expect(document.activeElement).toBe(input)
    input.remove()
  })

  it('restores the caret when the frozen pointer is cancelled', () => {
    const { result } = renderFreeze()
    const input = focusedInput(result)
    input.setSelectionRange(2, 2)
    act(() => result.current.dragFreeze.begin('node', 7))

    act(() => fireEvent.pointerCancel(window, { pointerId: 7 }))

    expect(document.activeElement).toBe(input)
    expect(input.selectionStart).toBe(2)
    input.remove()
  })

  it('leaves a frozen caret unrestored on unmount', () => {
    const { result, unmount } = renderFreeze()
    const input = focusedInput(result)
    act(() => result.current.dragFreeze.begin('node', 7))

    unmount()

    expect(document.activeElement).not.toBe(input)
    input.remove()
  })

  it('does not touch the caret when the source input is not the active element', () => {
    const { result } = renderFreeze()
    const input = document.createElement('textarea')
    input.value = node.text
    document.body.append(input)
    result.current.bindings(node).inputRef(input)
    input.setSelectionRange(1, 3)

    act(() => result.current.dragFreeze.begin('node', 7))
    act(() => result.current.dragFreeze.end(7))

    expect(document.activeElement).not.toBe(input)
    expect(input.selectionStart).toBe(1)
    expect(input.selectionEnd).toBe(3)
    input.remove()
  })

  it('writes no mode or image-caret state of its own', () => {
    const setVimMode = vi.fn()
    const { result } = renderFreeze({ setVimMode })
    const input = focusedInput(result)

    act(() => result.current.dragFreeze.begin('node', 7))
    act(() => result.current.dragFreeze.end(7))

    expect(setVimMode).not.toHaveBeenCalled()
    input.remove()
  })

  it('keeps the existing Replace-to-Normal blur transition exactly once', () => {
    const setVimMode = vi.fn()
    const { result } = renderFreeze({ vimMode: 'replace', setVimMode })
    const input = focusedInput(result)

    act(() => result.current.dragFreeze.begin('node', 7))
    // In production the input's React onBlur runs when begin blurs it; this harness has no React
    // input, so it invokes the same binding the existing tests use.
    act(() => result.current.bindings(node).onBlur())
    act(() => result.current.dragFreeze.end(7))

    expect(setVimMode).toHaveBeenCalledTimes(1)
    expect(setVimMode).toHaveBeenCalledWith('normal')
    expect(document.activeElement).toBe(input)
    input.remove()
  })

  it('restores a collapsed caret in a contenteditable input', () => {
    const { result } = renderFreeze()
    const input = document.createElement('div')
    input.className = 'node-input'
    input.contentEditable = 'true'
    input.tabIndex = 0
    input.textContent = node.text
    document.body.append(input)
    result.current.bindings(node).inputRef(input)
    input.focus()

    const selection = globalThis.getSelection()
    const text = input.firstChild
    if (selection === null || text === null) throw new Error('The editable text was not rendered.')
    const range = document.createRange()
    range.setStart(text, 1)
    range.setEnd(text, 3)
    selection.removeAllRanges()
    selection.addRange(range)

    act(() => result.current.dragFreeze.begin('node', 7))
    expect(document.activeElement).not.toBe(input)

    act(() => result.current.dragFreeze.end(7))
    expect(document.activeElement).toBe(input)
    expect(selection.isCollapsed).toBe(true)
    expect(selection.anchorOffset).toBe(1)
    input.remove()
  })

  it('restores the caret across an attached image without rewriting the image indicator', () => {
    const imageNode: TreeNode = {
      id: 'node',
      text: 'hello',
      attachment: { id: 'a', mimeType: 'image/png' },
      children: [],
    }
    let focus = { nodeId: 'node', cursor: 5, token: 1 }
    const store = {
      endTextSession: vi.fn(),
      getSnapshot: () => ({
        status: 'ready',
        document: { roots: [imageNode] },
        location: { currentParentId: null, selectedNodeId: 'node' },
        focus,
      }),
      selectNode: vi.fn(),
    } as unknown as EditorStore
    const setImageCaretNodeId = vi.fn()
    const { result, rerender } = renderHook(() =>
      useNodeInputBindings({
        store,
        selectedNodeId: 'node',
        focus,
        vimMode: 'normal',
        setImageCaretNodeId,
        onPreviewAttachment: vi.fn(),
      }),
    )
    const row = document.createElement('div')
    row.className = 'node-row'
    row.dataset.hasAttachment = 'true'
    const input = document.createElement('textarea')
    input.value = imageNode.text
    row.append(input)
    document.body.append(row)
    result.current.bindings(imageNode).inputRef(input)

    focus = { nodeId: 'node', cursor: 5, token: 2 }
    rerender()
    expect(setImageCaretNodeId).toHaveBeenCalledWith('node')
    setImageCaretNodeId.mockClear()

    act(() => result.current.dragFreeze.begin('node', 7))
    act(() => result.current.dragFreeze.end(7))

    expect(setImageCaretNodeId).not.toHaveBeenCalled()
    expect(input.selectionStart).toBe(5)
    expect(input.selectionEnd).toBe(5)
    row.remove()
  })
})
