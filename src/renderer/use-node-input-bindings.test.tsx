// @vitest-environment jsdom

import { cleanup, renderHook } from '@testing-library/react'
import type { SyntheticEvent } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { EditorStore } from '../application/editor-store'
import type { TreeNode } from '../domain/document'
import { useNodeInputBindings } from './use-node-input-bindings'

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
    reportError: vi.fn(),
    selectNode: vi.fn(),
  } as unknown as EditorStore
}

function renderBindings(options: {
  store: EditorStore
  selectedNodeId?: string
  focus?: { nodeId: string; cursor: number; token: number }
  vimMode?: 'insert' | 'normal' | 'visual'
}) {
  const onPreviewAttachment = vi.fn()
  return renderHook(() => useNodeInputBindings({ ...options, onPreviewAttachment }))
}

describe('useNodeInputBindings', () => {
  it('edits content on content change using the node links, defaulting to none', () => {
    const store = createStore()
    const { result } = renderBindings({ store, selectedNodeId: 'node' })
    const links = [{ start: 0, end: 1, url: 'https://example.test' }]
    const linkedNode: TreeNode = { id: 'node', text: 'x', links, children: [] }
    const input = document.createElement('div')
    input.textContent = 'x'

    result.current(linkedNode).onContentChange({ currentTarget: input } as unknown as SyntheticEvent<HTMLElement>)
    expect(store.editContent).toHaveBeenCalledWith('node', 'x', links)

    const plainNode: TreeNode = { id: 'node', text: 'x', children: [] }
    result.current(plainNode).onContentChange({ currentTarget: input } as unknown as SyntheticEvent<HTMLElement>)
    expect(store.editContent).toHaveBeenLastCalledWith('node', 'x', [])
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

    result.current(node).onCompositionStart()
    pressD()
    expect(store.deleteSelected).not.toHaveBeenCalled()
  })
})
