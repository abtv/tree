// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EditorStore, type ClipboardValue, type EditorServices } from '../application/editor-store'
import './test/setup'
import { App } from './App'

afterEach(cleanup)

const attachmentBytes = new Uint8Array([137, 80, 78, 71])

beforeEach(() => {
  window.treeApi = {
    quit: async () => undefined,
    onQuitRequested: () => () => undefined,
    onQuitFailed: () => () => undefined,
    load: async () => null,
    save: async () => undefined,
    readClipboard: async () => ({ kind: 'text', text: '' }),
    writeAttachment: async () => undefined,
    hasAttachment: async () => true,
    readAttachment: async () => attachmentBytes,
    cleanupAttachments: async () => undefined,
  }
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: () => 'blob:test' })
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: () => undefined })
})

function createStore(clipboard: ClipboardValue = { kind: 'text', text: '' }): EditorStore {
  const services: EditorServices = {
    load: async () => null,
    save: async () => undefined,
    readClipboard: async () => clipboard,
    writeAttachment: async () => undefined,
    hasAttachment: async () => true,
    cleanupAttachments: async () => undefined,
  }
  let id = 0
  return new EditorStore(services, () => ['root', 'child', 'sibling'][id++] ?? `node-${id}`)
}

describe('App', () => {
  it('renders the initial editable root and splits it with Enter', async () => {
    const store = createStore()
    await act(async () => {
      await store.initialize()
    })
    render(<App store={store} />)
    const root = screen.getByRole('textbox', { name: 'Node 1' }) as HTMLTextAreaElement

    fireEvent.change(root, { target: { value: 'Current' } })
    root.setSelectionRange(3, 3)
    fireEvent.keyDown(root, { key: 'Enter' })

    expect(screen.getByRole('textbox', { name: 'Node 1' })).toHaveValue('Cur')
    expect(screen.getByRole('textbox', { name: 'Node 2' })).toHaveValue('rent')
  })

  it('deletes an empty node and focuses the previous node on Backspace', async () => {
    const store = createStore()
    await act(async () => {
      await store.initialize()
    })
    render(<App store={store} />)
    const first = screen.getByRole('textbox', { name: 'Node 1' }) as HTMLTextAreaElement

    fireEvent.change(first, { target: { value: 'A' } })
    fireEvent.keyDown(first, { key: 'Enter' })
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Node 2' }), { key: 'Backspace' })

    expect(screen.queryByRole('textbox', { name: 'Node 2' })).not.toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Node 1' })).toHaveValue('A')
    expect(screen.getByRole('textbox', { name: 'Node 1' })).toHaveFocus()
  })

  it('keeps consecutive text edits in one undo session when the caret advances', async () => {
    const store = createStore()
    await act(async () => {
      await store.initialize()
    })
    render(<App store={store} />)
    const root = screen.getByRole('textbox', { name: 'Node 1' }) as HTMLTextAreaElement

    fireEvent.change(root, { target: { value: 'F' } })
    await act(async () => undefined)
    fireEvent.select(root)
    fireEvent.change(root, { target: { value: 'Fi' } })
    fireEvent.change(root, { target: { value: 'Fir' } })

    fireEvent.keyDown(root, { key: 'z', metaKey: true })

    expect(root).toHaveValue('')
  })

  it('ends the text session when the user selects text within the node', async () => {
    const store = createStore()
    await act(async () => {
      await store.initialize()
    })
    render(<App store={store} />)
    const root = screen.getByRole('textbox', { name: 'Node 1' }) as HTMLTextAreaElement

    fireEvent.change(root, { target: { value: 'Fir' } })
    await act(async () => undefined)
    root.setSelectionRange(0, 3)
    fireEvent.select(root)
    fireEvent.change(root, { target: { value: 'First' } })

    fireEvent.keyDown(root, { key: 'z', metaKey: true })

    expect(root).toHaveValue('Fir')
  })

  it('opens the image preview with Cmd+Enter and closes it on Escape, restoring focus', async () => {
    const store = createStore({ kind: 'image', png: attachmentBytes })
    await act(async () => {
      await store.initialize()
    })
    await act(async () => {
      await store.paste('root', 0)
    })
    render(<App store={store} />)
    const node = screen.getByRole('textbox', { name: 'Node 1' })
    await screen.findByRole('button', { name: 'Open image preview' })

    fireEvent.keyDown(node, { key: 'Enter', metaKey: true })
    expect(screen.getByRole('dialog', { name: 'Image preview' })).toBeInTheDocument()

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: 'Image preview' })).not.toBeInTheDocument()
    expect(node).toHaveFocus()
  })

  it('opens the image preview by clicking the image and closes it with the close button', async () => {
    const store = createStore({ kind: 'image', png: attachmentBytes })
    await act(async () => {
      await store.initialize()
    })
    await act(async () => {
      await store.paste('root', 0)
    })
    render(<App store={store} />)

    fireEvent.click(await screen.findByRole('button', { name: 'Open image preview' }))
    expect(screen.getByRole('dialog', { name: 'Image preview' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Close image preview' }))
    expect(screen.queryByRole('dialog', { name: 'Image preview' })).not.toBeInTheDocument()
  })

  it('opens the image preview from the current parent with Cmd+Enter', async () => {
    const store = createStore({ kind: 'image', png: attachmentBytes })
    await act(async () => {
      await store.initialize()
    })
    await act(async () => {
      await store.paste('root', 0)
    })
    render(<App store={store} />)

    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Node 1' }), { key: '.', metaKey: true })
    const parent = screen.getByRole('textbox', { name: 'Current parent' })
    await screen.findByRole('button', { name: 'Open image preview' })

    fireEvent.keyDown(parent, { key: 'Enter', metaKey: true })

    expect(screen.getByRole('dialog', { name: 'Image preview' })).toBeInTheDocument()
  })

  it('does nothing on Cmd+Enter when the node has no image', async () => {
    const store = createStore()
    await act(async () => {
      await store.initialize()
    })
    render(<App store={store} />)

    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Node 1' }), { key: 'Enter', metaKey: true })

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('renders a pasted HTTP URL as a clickable styled link', async () => {
    const store = createStore({ kind: 'text', text: 'https://example.com' })
    await act(async () => {
      await store.initialize()
      await store.paste('root', 0)
    })
    render(<App store={store} />)

    const link = screen.getByRole('link', { name: 'https://example.com' })
    expect(link).toHaveAttribute('href', 'https://example.com')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveStyle({ textDecoration: 'underline' })
  })

  it('keeps linked text visibly selected after copying all text', async () => {
    const store = createStore({ kind: 'text', text: 'https://example.com' })
    await act(async () => {
      await store.initialize()
      await store.paste('root', 0)
    })
    render(<App store={store} />)

    const editor = screen.getByRole('textbox', { name: 'Node 1' })
    await act(async () => {
      fireEvent.keyDown(editor, { key: 'a', metaKey: true })
      await Promise.resolve()
    })
    expect(editor).toHaveClass('select-all')

    fireEvent.keyDown(editor, { key: 'c', metaKey: true })

    expect(editor).toHaveClass('select-all')
  })

  it('preserves the caret after typing in a linked node', async () => {
    const store = createStore({ kind: 'text', text: 'https://example.com' })
    await act(async () => {
      await store.initialize()
      await store.paste('root', 0)
    })
    render(<App store={store} />)

    const editor = screen.getByRole('textbox', { name: 'Node 1' }) as HTMLDivElement
    const addedText = document.createTextNode('x')
    editor.append(addedText)
    const selection = window.getSelection()!
    const range = document.createRange()
    range.setStart(addedText, 1)
    range.collapse(true)
    selection.removeAllRanges()
    selection.addRange(range)
    fireEvent.input(editor)

    await act(async () => undefined)
    const caret = window.getSelection()!.getRangeAt(0)
    expect(caret.startContainer.textContent).toBe('https://example.comx')
    expect(caret.startOffset).toBeGreaterThan(0)
  })

  it('places a linked caret at the nearest editable boundary', async () => {
    const store = createStore({ kind: 'text', text: 'https://example.com' })
    await act(async () => {
      await store.initialize()
      await store.paste('root', 0)
    })
    render(<App store={store} />)
    const editor = screen.getByRole('textbox', { name: 'Node 1' })

    await act(async () => {
      store.selectNode('root', 9)
    })
    expect(window.getSelection()!.getRangeAt(0).startContainer).toBe(editor)
    expect(window.getSelection()!.getRangeAt(0).startOffset).toBe(0)

    await act(async () => {
      store.selectNode('root', 10)
    })
    expect(window.getSelection()!.getRangeAt(0).startContainer).toBe(editor)
    expect(window.getSelection()!.getRangeAt(0).startOffset).toBe(1)
  })

  it('moves the caret to a new sibling after Enter at the end of linked text', async () => {
    const store = createStore({ kind: 'text', text: 'https://example.com' })
    await act(async () => {
      await store.initialize()
      await store.paste('root', 0)
    })
    render(<App store={store} />)
    const editor = screen.getByRole('textbox', { name: 'Node 1' })

    await act(async () => {
      store.selectNode('root', 19)
    })
    fireEvent.keyDown(editor, { key: 'Enter' })

    expect(screen.getByRole('link', { name: 'https://example.com' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Node 2' })).toHaveValue('')
    const newEditor = screen.getByRole('textbox', { name: 'Node 2' })
    expect(newEditor).toHaveFocus()
    expect((newEditor as HTMLTextAreaElement).selectionStart).toBe(0)
  })

  it('renders and edits the current parent after entering an empty node', async () => {
    const store = createStore()
    await act(async () => {
      await store.initialize()
    })
    render(<App store={store} />)
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Node 1' }), { key: '.', metaKey: true })

    const parent = screen.getByRole('textbox', { name: 'Current parent' })
    fireEvent.change(parent, { target: { value: 'Projects' } })

    expect(parent).toHaveValue('Projects')
    expect(screen.getByLabelText('Current location')).toHaveTextContent('›Projects')
  })

  it('shows a disclosure control only for nodes with children and enters the node when clicked', async () => {
    const store = createStore()
    await act(async () => {
      await store.initialize()
    })
    render(<App store={store} />)

    expect(screen.queryByRole('button', { name: 'Enter node 1' })).not.toBeInTheDocument()

    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Node 1' }), { key: '.', metaKey: true })
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Current parent' }), { key: 'Enter' })
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Node 1' }), { key: ',', metaKey: true })
    fireEvent.click(screen.getByRole('button', { name: 'Enter node 1' }))

    expect(screen.getByRole('textbox', { name: 'Current parent' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Node 1' })).toBeInTheDocument()
  })

  it('navigates through the location path and selects the child on the previous path', async () => {
    const store = createStore()
    await act(async () => {
      await store.initialize()
    })
    render(<App store={store} />)
    const root = screen.getByRole('textbox', { name: 'Node 1' })

    fireEvent.change(root, { target: { value: 'Root' } })
    fireEvent.keyDown(root, { key: '.', metaKey: true })
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Current parent' }), { key: 'Enter' })
    const child = screen.getByRole('textbox', { name: 'Node 1' })
    fireEvent.change(child, { target: { value: 'Child' } })
    fireEvent.keyDown(child, { key: '.', metaKey: true })
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Current parent' }), { key: 'Enter' })

    fireEvent.click(screen.getByRole('button', { name: 'Root' }))
    expect(screen.getByRole('textbox', { name: 'Current parent' })).toHaveValue('Root')
    expect(screen.getByRole('textbox', { name: 'Node 1' })).toHaveValue('Child')
    expect(screen.getByRole('textbox', { name: 'Node 1' })).toHaveFocus()

    fireEvent.click(screen.getByRole('button', { name: 'Top level' }))
    expect(screen.getByRole('textbox', { name: 'Node 1' })).toHaveValue('Root')
    expect(screen.getByRole('textbox', { name: 'Node 1' })).toHaveFocus()
  })

  it('moves a node to the boundary above a row and prevents the node ID from being dropped into its text', async () => {
    const store = createStore()
    await act(async () => {
      await store.initialize()
    })
    render(<App store={store} />)
    const first = screen.getByRole('textbox', { name: 'Node 1' }) as HTMLTextAreaElement
    fireEvent.change(first, { target: { value: 'A' } })
    fireEvent.keyDown(first, { key: 'Enter' })
    const transfer = {
      dropEffect: '',
      effectAllowed: '',
      value: '',
      setData(_type: string, value: string) {
        this.value = value
      },
      getData() {
        return this.value
      },
    }
    const secondRow = screen.getByRole('textbox', { name: 'Node 2' }).parentElement
    const firstRow = first.parentElement
    vi.spyOn(firstRow!, 'getBoundingClientRect').mockReturnValue({ height: 20, top: 10 } as DOMRect)

    fireEvent.dragStart(secondRow!, { dataTransfer: transfer })
    fireEvent.dragOver(first, { dataTransfer: transfer, clientY: 11 })
    fireEvent.drop(first, { dataTransfer: transfer, clientY: 11 })

    expect(transfer.effectAllowed).toBe('move')
    expect(transfer.dropEffect).toBe('move')
    expect(screen.getByRole('textbox', { name: 'Node 1' })).toHaveValue('A')
    expect(screen.getByRole('textbox', { name: 'Node 2' })).toHaveValue('')
  })

  it('moves nodes through the drop zones before the first and after the last node', async () => {
    const store = createStore()
    await act(async () => {
      await store.initialize()
    })
    render(<App store={store} />)
    const first = screen.getByRole('textbox', { name: 'Node 1' }) as HTMLTextAreaElement
    const transfer = {
      dropEffect: '',
      effectAllowed: '',
      value: '',
      setData(_type: string, value: string) {
        this.value = value
      },
      getData() {
        return this.value
      },
    }

    fireEvent.change(first, { target: { value: 'A' } })
    first.setSelectionRange(1, 1)
    fireEvent.keyDown(first, { key: 'Enter' })
    fireEvent.change(screen.getByRole('textbox', { name: 'Node 2' }), { target: { value: 'B' } })
    fireEvent.dragStart(screen.getByRole('textbox', { name: 'Node 1' }).parentElement!, { dataTransfer: transfer })
    fireEvent.drop(screen.getByLabelText('Drop position 3'), { dataTransfer: transfer })

    expect(screen.getByRole('textbox', { name: 'Node 1' })).toHaveValue('B')
    expect(screen.getByRole('textbox', { name: 'Node 2' })).toHaveValue('A')

    fireEvent.dragStart(screen.getByRole('textbox', { name: 'Node 2' }).parentElement!, { dataTransfer: transfer })
    fireEvent.drop(screen.getByLabelText('Drop position 1'), { dataTransfer: transfer })

    expect(screen.getByRole('textbox', { name: 'Node 1' })).toHaveValue('A')
    expect(screen.getByRole('textbox', { name: 'Node 2' })).toHaveValue('B')
  })

  it('shows a loading state before the document is ready', () => {
    render(<App store={createStore()} />)
    expect(screen.getByText('Loading document…')).toBeInTheDocument()
  })

  it('shows an error state when the document cannot be loaded', async () => {
    const services: EditorServices = {
      load: async () => {
        throw new Error('boom')
      },
      save: async () => undefined,
      readClipboard: async () => ({ kind: 'text', text: '' }),
      writeAttachment: async () => undefined,
      hasAttachment: async () => true,
      cleanupAttachments: async () => undefined,
    }
    const store = new EditorStore(services, () => 'root')
    await act(async () => {
      await store.initialize()
    })

    render(<App store={store} />)

    expect(screen.getByRole('alert')).toHaveTextContent('boom')
  })

  it('selects a node when its input receives focus', async () => {
    const store = createStore()
    await act(async () => {
      await store.initialize()
    })
    render(<App store={store} />)
    const first = screen.getByRole('textbox', { name: 'Node 1' }) as HTMLTextAreaElement
    fireEvent.change(first, { target: { value: 'A' } })
    fireEvent.keyDown(first, { key: 'Enter' })
    expect(store.getSnapshot()).toMatchObject({ status: 'ready', location: { selectedNodeId: 'child' } })

    fireEvent.focus(screen.getByRole('textbox', { name: 'Node 1' }))

    expect(store.getSnapshot()).toMatchObject({ status: 'ready', location: { selectedNodeId: 'root' } })
  })

  it('ignores keys during composition', async () => {
    const store = createStore()
    await act(async () => {
      await store.initialize()
    })
    render(<App store={store} />)
    const node = screen.getByRole('textbox', { name: 'Node 1' })

    fireEvent.compositionStart(node)
    fireEvent.keyDown(node, { key: 'Enter' })
    expect(screen.queryByRole('textbox', { name: 'Node 2' })).not.toBeInTheDocument()

    fireEvent.compositionEnd(node)
    fireEvent.keyDown(node, { key: 'Enter' })
    expect(screen.getByRole('textbox', { name: 'Node 2' })).toBeInTheDocument()
  })

  it('handles cut as a standalone text edit', async () => {
    const store = createStore()
    await act(async () => {
      await store.initialize()
    })
    render(<App store={store} />)
    const node = screen.getByRole('textbox', { name: 'Node 1' }) as HTMLTextAreaElement

    fireEvent.change(node, { target: { value: 'a' } })
    fireEvent.cut(node)
    fireEvent.change(node, { target: { value: 'ab' } })
    fireEvent.keyDown(node, { key: 'z', metaKey: true })

    expect(node).toHaveValue('a')
  })

  it('pastes at the cursor', async () => {
    const store = createStore({ kind: 'text', text: 'XY' })
    await act(async () => {
      await store.initialize()
    })
    render(<App store={store} />)
    const first = screen.getByRole('textbox', { name: 'Node 1' }) as HTMLTextAreaElement

    fireEvent.change(first, { target: { value: 'ab' } })
    first.setSelectionRange(1, 1)
    await act(async () => {
      fireEvent.paste(first)
    })

    expect(first).toHaveValue('aXYb')
  })

  it('dispatches navigation keys', async () => {
    const store = createStore()
    await act(async () => {
      await store.initialize()
    })
    render(<App store={store} />)
    const first = screen.getByRole('textbox', { name: 'Node 1' }) as HTMLTextAreaElement
    fireEvent.change(first, { target: { value: 'A' } })
    fireEvent.keyDown(first, { key: 'Enter' })
    const second = screen.getByRole('textbox', { name: 'Node 2' })

    fireEvent.keyDown(second, { key: 'ArrowUp' })
    expect(store.getSnapshot()).toMatchObject({ status: 'ready', location: { selectedNodeId: 'root' } })
    fireEvent.keyDown(first, { key: 'ArrowDown' })
    expect(store.getSnapshot()).toMatchObject({ status: 'ready', location: { selectedNodeId: 'child' } })
    fireEvent.keyDown(first, { key: 'ArrowLeft' })
  })

  it('dispatches undo and redo keys', async () => {
    const store = createStore()
    await act(async () => {
      await store.initialize()
    })
    render(<App store={store} />)
    const first = screen.getByRole('textbox', { name: 'Node 1' }) as HTMLTextAreaElement

    fireEvent.change(first, { target: { value: 'A' } })
    fireEvent.keyDown(first, { key: 'z', metaKey: true })
    expect(first).toHaveValue('')
    fireEvent.keyDown(first, { key: 'z', metaKey: true, shiftKey: true })
    expect(first).toHaveValue('A')
  })

  it('quits the application when Cmd+Q is pressed in an editable node', async () => {
    const store = createStore()
    await act(async () => {
      await store.initialize()
    })
    render(<App store={store} />)
    const quit = vi.spyOn(window.treeApi, 'quit')

    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Node 1' }), { key: 'q', metaKey: true })

    await act(async () => undefined)
    expect(quit).toHaveBeenCalledOnce()
  })

  it('deletes the selected node with Cmd+Backspace', async () => {
    const store = createStore()
    await act(async () => {
      await store.initialize()
    })
    render(<App store={store} />)
    const first = screen.getByRole('textbox', { name: 'Node 1' }) as HTMLTextAreaElement
    fireEvent.change(first, { target: { value: 'A' } })
    fireEvent.keyDown(first, { key: 'Enter' })

    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Node 2' }), { key: 'Backspace', metaKey: true })

    expect(screen.queryByRole('textbox', { name: 'Node 2' })).not.toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Node 1' })).toHaveValue('A')
  })

  it('falls back to the dragged node when the drop carries no id', async () => {
    const store = createStore()
    await act(async () => {
      await store.initialize()
    })
    render(<App store={store} />)
    const first = screen.getByRole('textbox', { name: 'Node 1' }) as HTMLTextAreaElement
    const transfer = {
      dropEffect: '',
      effectAllowed: '',
      setData() {},
      getData() {
        return ''
      },
    }

    fireEvent.change(first, { target: { value: 'A' } })
    fireEvent.keyDown(first, { key: 'Enter' })
    fireEvent.change(screen.getByRole('textbox', { name: 'Node 2' }), { target: { value: 'B' } })
    fireEvent.dragStart(screen.getByRole('textbox', { name: 'Node 1' }).parentElement!, { dataTransfer: transfer })
    fireEvent.drop(screen.getByLabelText('Drop position 3'), { dataTransfer: transfer })

    expect(screen.getByRole('textbox', { name: 'Node 1' })).toHaveValue('B')
    expect(screen.getByRole('textbox', { name: 'Node 2' })).toHaveValue('A')
  })
})
