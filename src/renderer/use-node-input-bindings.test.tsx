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
})
