// @vitest-environment jsdom

import { act, cleanup, fireEvent, render as renderReact, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EditorStore, type ClipboardValue, type EditorServices } from '../application/editor-store'
import { QUIT_WITHOUT_SAVING_PROMPT, SAVE_LOCKED_MESSAGE } from '../domain/product-messages'
import { attachmentByteCache } from '../infrastructure/renderer/electron-services'
import './test/setup'
import { App } from './App'
import { HOLD_ACTIVATION_MS } from './node-drag'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

const attachmentBytes = new Uint8Array([137, 80, 78, 71])

beforeEach(() => {
  attachmentByteCache.clear()
  window.treeApi = {
    quit: async () => undefined,
    quitWithoutSaving: async () => undefined,
    onQuitRequested: () => () => undefined,
    onQuitFailed: () => () => undefined,
    load: async () => null,
    save: async () => undefined,
    readClipboard: async () => ({ kind: 'text', text: '' }),
    writeAttachment: async () => undefined,
    readAttachment: async () => attachmentBytes,
    cleanupAttachments: async () => undefined,
    getAlwaysOnTop: async () => false,
    setAlwaysOnTop: async () => undefined,
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
    cleanupAttachments: async () => undefined,
  }
  let id = 0
  return new EditorStore(services, () => ['root', 'child', 'sibling'][id++] ?? `node-${id}`)
}

async function createLockedStore(): Promise<EditorStore> {
  const services: EditorServices = {
    load: async () => null,
    save: async () => {
      throw new Error('disk full')
    },
    readClipboard: async () => ({ kind: 'text', text: '' }),
    writeAttachment: async () => undefined,
    cleanupAttachments: async () => undefined,
  }
  const store = new EditorStore(services, () => 'root')
  await act(async () => {
    await store.initialize()
  })
  for (let index = 1; index <= 3; index += 1) {
    const text = Array.from({ length: index * 10 }, (_, word) => `w${word}`).join(' ')
    await act(async () => {
      store.editText('root', text)
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  }
  return store
}

function mockAppRowRects(originTop = 0, height = 24): void {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const index = this.dataset.nodeIndex
    const top = index === undefined ? originTop : originTop + Number(index) * height
    return {
      top,
      height,
      bottom: top + height,
      left: 0,
      right: 600,
      width: 600,
      x: 0,
      y: top,
      toJSON: () => ({}),
    } as DOMRect
  })
}

function render(ui: Parameters<typeof renderReact>[0]): ReturnType<typeof renderReact> {
  const result = renderReact(ui)
  const input = screen.queryByRole('textbox', { name: 'Node 1' })
  if (input !== null) {
    fireEvent.keyDown(input, { key: 'i' })
    if (input instanceof HTMLTextAreaElement) input.setSelectionRange(input.selectionStart, input.selectionStart)
  }
  return result
}

describe('App', () => {
  it('starts in Normal mode with an empty caret position', async () => {
    const store = createStore()
    await act(async () => {
      await store.initialize()
    })
    renderReact(<App store={store} />)

    expect(screen.getByText('NORMAL')).toBeInTheDocument()
    const root = screen.getByRole('textbox', { name: 'Node 1' }) as HTMLTextAreaElement
    expect(root.selectionStart).toBe(0)
    expect(root.selectionEnd).toBe(0)
    expect(root).toHaveClass('node-input-empty')
  })

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

  it('collapses the empty text row for an image node while keeping it editable', async () => {
    const store = createStore({ kind: 'image', png: attachmentBytes })
    await act(async () => {
      await store.initialize()
      await store.paste('root', 0)
    })
    render(<App store={store} />)

    const input = screen.getByRole('textbox', { name: 'Node 1' })
    expect(input).toHaveClass('node-input-empty', 'node-input-image-only')
    expect(input.closest('.node-row')).toHaveClass('node-row-image-only')

    fireEvent.change(input, { target: { value: 'caption' } })

    expect(input).toHaveValue('caption')
    expect(input).not.toHaveClass('node-input-image-only')
    expect(input.closest('.node-row')).not.toHaveClass('node-row-image-only')
    const snapshot = store.getSnapshot()
    if (snapshot.status !== 'ready') throw new Error('The editor did not finish loading.')
    expect(snapshot.document.roots[0]?.attachment?.mimeType).toBe('image/png')
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

  it('reuses cached attachment bytes when the preview opens after the inline image', async () => {
    const readAttachment = vi.fn(async () => attachmentBytes)
    window.treeApi.readAttachment = readAttachment
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
    await screen.findByAltText('Attached image preview')

    expect(readAttachment).toHaveBeenCalledTimes(1)
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

  it('visually marks hyperlinks when node content is selected', async () => {
    const store = createStore({ kind: 'text', text: 'https://example.com' })
    await act(async () => {
      await store.initialize()
      await store.paste('root', 0)
    })
    render(<App store={store} />)
    const editor = screen.getByRole('textbox', { name: 'Node 1' }) as HTMLDivElement
    const link = screen.getByRole('link', { name: 'https://example.com' })

    const selection = window.getSelection()!
    const range = document.createRange()
    range.selectNodeContents(editor)
    selection.removeAllRanges()
    selection.addRange(range)
    document.dispatchEvent(new Event('selectionchange'))

    expect(link).toHaveClass('link-selected')
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

  it('updates linked content through the contenteditable boundary and ends a selected edit session', async () => {
    const store = createStore({ kind: 'text', text: 'https://example.com' })
    await act(async () => {
      await store.initialize()
      await store.paste('root', 0)
    })
    render(<App store={store} />)
    const editor = screen.getByRole('textbox', { name: 'Node 1' })

    fireEvent.focus(editor)
    fireEvent.mouseDown(editor)
    editor.textContent = 'edited text'
    fireEvent.input(editor)
    fireEvent.change(editor)
    const selection = window.getSelection()!
    const range = document.createRange()
    range.selectNodeContents(editor)
    selection.removeAllRanges()
    selection.addRange(range)
    fireEvent.select(editor)
    fireEvent.blur(editor)

    expect(store.getSnapshot()).toMatchObject({
      status: 'ready',
      document: { roots: [{ text: 'edited text' }] },
    })
  })

  it('places a linked caret at the requested character', async () => {
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
    expect(window.getSelection()!.getRangeAt(0).startContainer).toBe(editor.querySelector('a')?.firstChild)
    expect(window.getSelection()!.getRangeAt(0).startOffset).toBe(9)

    await act(async () => {
      store.selectNode('root', 10)
    })
    expect(window.getSelection()!.getRangeAt(0).startContainer).toBe(editor.querySelector('a')?.firstChild)
    expect(window.getSelection()!.getRangeAt(0).startOffset).toBe(10)
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

  it('renders an enter control for a childless node and enters it without changing the document', async () => {
    const store = createStore()
    await act(async () => {
      await store.initialize()
    })
    render(<App store={store} />)
    const before = store.getSnapshot()
    if (before.status !== 'ready') throw new Error('The editor is not ready.')
    const button = screen.getByRole('button', { name: 'Enter node 1' })
    expect(button.className).not.toContain('node-disclosure-has-children')

    fireEvent.mouseDown(button)
    fireEvent.click(button)

    const after = store.getSnapshot()
    if (after.status !== 'ready') throw new Error('The editor is not ready.')
    expect(screen.getByRole('textbox', { name: 'Current parent' })).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Node 1' })).not.toBeInTheDocument()
    expect(after.location).toEqual({ currentParentId: 'root', selectedNodeId: 'root' })
    expect(after.document).toBe(before.document)
  })

  it('shows a child-bearing indicator and enters the node when clicked', async () => {
    const store = createStore()
    await act(async () => {
      await store.initialize()
    })
    render(<App store={store} />)

    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Node 1' }), { key: '.', metaKey: true })
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Current parent' }), { key: 'Enter' })
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Node 1' }), { key: ',', metaKey: true })
    const disclosure = screen.getByRole('button', { name: 'Enter node 1' })
    expect(disclosure.className).toContain('node-disclosure-has-children')
    fireEvent.mouseDown(disclosure)
    fireEvent.click(disclosure)

    expect(screen.getByRole('textbox', { name: 'Current parent' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Node 1' })).toBeInTheDocument()
  })

  it('marks the node containing the caret and never the current-parent heading', async () => {
    const store = createStore()
    await act(async () => {
      await store.initialize()
    })
    render(<App store={store} />)

    fireEvent.change(screen.getByRole('textbox', { name: 'Node 1' }), { target: { value: 'Projects' } })
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Node 1' }), { key: '.', metaKey: true })

    expect(document.querySelectorAll('.node-focus-marker')).toHaveLength(0)
    expect(document.querySelector('.current-parent .node-focus-marker')).toBeNull()

    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Current parent' }), { key: 'Enter' })
    const child = screen.getByRole('textbox', { name: 'Node 1' })
    expect(document.querySelectorAll('.node-focus-marker')).toHaveLength(1)
    expect(child.closest('.node-row')?.querySelector('.node-focus-marker')).not.toBeNull()
    expect(document.querySelector('.current-parent .node-focus-marker')).toBeNull()

    fireEvent.keyDown(child, { key: 'ArrowUp' })
    expect(document.querySelectorAll('.node-focus-marker')).toHaveLength(0)

    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Current parent' }), { key: 'ArrowDown' })
    expect(document.querySelectorAll('.node-focus-marker')).toHaveLength(1)
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

  it('toggles the always-on-top setting from the location toolbar', async () => {
    const store = createStore()
    await act(async () => {
      await store.initialize()
    })
    const setAlwaysOnTop = vi.spyOn(window.treeApi, 'setAlwaysOnTop')
    render(<App store={store} />)

    const toggle = await screen.findByRole('button', { name: 'Pin window on top' })
    expect(toggle).toHaveAttribute('title', 'Pin window on top')
    fireEvent.click(toggle)

    expect(setAlwaysOnTop).toHaveBeenCalledWith(true)
    expect(await screen.findByRole('button', { name: 'Unpin window from top' })).toHaveAttribute(
      'title',
      'Unpin window from top',
    )
  })

  it('reorders siblings through a press-and-hold drag over the editable surface', async () => {
    const store = createStore()
    await act(async () => {
      await store.initialize()
    })
    render(<App store={store} />)
    const first = screen.getByRole('textbox', { name: 'Node 1' }) as HTMLTextAreaElement
    fireEvent.change(first, { target: { value: 'A' } })
    fireEvent.keyDown(first, { key: 'Enter' })
    const second = screen.getByRole('textbox', { name: 'Node 2' }) as HTMLTextAreaElement
    fireEvent.change(second, { target: { value: 'B' } })
    fireEvent.keyDown(second, { key: 'Enter' })
    fireEvent.change(screen.getByRole('textbox', { name: 'Node 3' }), { target: { value: 'C' } })

    mockAppRowRects()
    vi.useFakeTimers()
    const rows = document.querySelectorAll('.node-row')
    const third = rows[2]
    if (third === undefined) throw new Error('The third row was not rendered.')

    fireEvent.pointerDown(third, {
      pointerId: 1,
      button: 0,
      isPrimary: true,
      pointerType: 'mouse',
      clientX: 100,
      clientY: 60,
    })
    act(() => vi.advanceTimersByTime(HOLD_ACTIVATION_MS))
    expect(third).toHaveClass('node-row-dragging')

    fireEvent.pointerMove(third, { pointerId: 1, clientX: 100, clientY: 10 })
    fireEvent.pointerUp(third, { pointerId: 1, clientX: 100, clientY: 10 })

    expect(screen.getByRole('textbox', { name: 'Node 1' })).toHaveValue('C')
    expect(screen.getByRole('textbox', { name: 'Node 2' })).toHaveValue('A')
    expect(screen.getByRole('textbox', { name: 'Node 3' })).toHaveValue('B')
    expect(store.getSnapshot()).toMatchObject({ status: 'ready', location: { selectedNodeId: 'sibling' } })
  })

  it('does not arm a drag while the editor is persistence-locked', async () => {
    const store = await createLockedStore()
    render(<App store={store} />)
    mockAppRowRects()
    vi.useFakeTimers()
    const row = document.querySelector('.node-row')
    if (row === null) throw new Error('The node row was not rendered.')

    fireEvent.pointerDown(row, {
      pointerId: 1,
      button: 0,
      isPrimary: true,
      pointerType: 'mouse',
      clientX: 100,
      clientY: 13,
    })
    act(() => vi.advanceTimersByTime(HOLD_ACTIVATION_MS * 2))
    fireEvent.pointerMove(row, { pointerId: 1, clientX: 100, clientY: 13 })
    fireEvent.pointerUp(row, { pointerId: 1, clientX: 100, clientY: 13 })

    expect(row).not.toHaveClass('node-row-dragging')
    expect(document.body).not.toHaveClass('node-drag-active')
    expect(store.getSnapshot()).toMatchObject({ status: 'ready', persistenceLocked: true })
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
      cleanupAttachments: async () => undefined,
    }
    const store = new EditorStore(services, () => 'root')
    await act(async () => {
      await store.initialize()
    })

    render(<App store={store} />)

    expect(screen.getByRole('alert')).toHaveTextContent('boom')
  })

  it('shows operation failures in the visible red error message', async () => {
    const store = createStore()
    await act(async () => {
      await store.initialize()
    })

    store.reportError(new Error('attachment cleanup failed'))
    render(<App store={store} />)

    expect(screen.getByRole('alert')).toHaveTextContent('Operation failed: attachment cleanup failed')
  })

  it('shows a save error when persistence fails', async () => {
    const services: EditorServices = {
      load: async () => null,
      save: async () => {
        throw new Error('disk full')
      },
      readClipboard: async () => ({ kind: 'text', text: '' }),
      writeAttachment: async () => undefined,
      cleanupAttachments: async () => undefined,
    }
    const store = new EditorStore(services, () => 'root')
    await act(async () => {
      await store.initialize()
    })
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    render(<App store={store} />)

    expect(screen.getByRole('status')).toHaveTextContent('Changes could not be saved: disk full')
  })

  it('disables editing and shows the lock message after three failed saves', async () => {
    const store = await createLockedStore()
    render(<App store={store} />)
    const input = screen.getByRole('textbox', { name: 'Node 1' }) as HTMLTextAreaElement

    expect(store.getSnapshot()).toMatchObject({ status: 'ready', persistenceLocked: true })
    expect(screen.getByText(SAVE_LOCKED_MESSAGE)).toBeInTheDocument()
    expect(input.readOnly).toBe(true)

    const before = store.getSnapshot()
    fireEvent.change(input, { target: { value: 'changed' } })
    const after = store.getSnapshot()
    if (before.status !== 'ready' || after.status !== 'ready') throw new Error('The editor is not ready.')
    expect(after.document).toBe(before.document)
  })

  it('traps focus, cancels with Escape, and confirms quitting without saving while locked', async () => {
    const store = await createLockedStore()
    render(<App store={store} />)
    const quitWithoutSaving = vi.spyOn(window.treeApi, 'quitWithoutSaving')
    const input = screen.getByRole('textbox', { name: 'Node 1' }) as HTMLTextAreaElement
    input.focus()

    act(() => store.requestQuitWithoutSavingPrompt())
    expect(screen.getByText(QUIT_WITHOUT_SAVING_PROMPT)).toBeInTheDocument()
    const cancel = screen.getByRole('button', { name: 'Cancel' })
    const quit = screen.getByRole('button', { name: 'Quit without saving' })
    expect(cancel).toHaveFocus()

    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
    expect(quit).toHaveFocus()
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(cancel).toHaveFocus()

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByText(QUIT_WITHOUT_SAVING_PROMPT)).not.toBeInTheDocument()
    expect(quitWithoutSaving).not.toHaveBeenCalled()
    expect(input).toHaveFocus()

    act(() => store.requestQuitWithoutSavingPrompt())
    fireEvent.click(screen.getByRole('button', { name: 'Quit without saving' }))
    expect(quitWithoutSaving).toHaveBeenCalledOnce()
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
})
