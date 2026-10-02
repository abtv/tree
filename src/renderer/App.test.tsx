// @vitest-environment jsdom

import { act, cleanup, fireEvent, render as renderReact, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EditorStore, type ClipboardValue, type EditorServices } from '../application/editor-store'
import type { Document } from '../domain/document'
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

function createStore(
  clipboard: ClipboardValue = { kind: 'text', text: '' },
  writeClipboard?: EditorServices['writeClipboard'],
): EditorStore {
  const services: EditorServices = {
    load: async () => null,
    save: async () => undefined,
    readClipboard: async () => clipboard,
    writeAttachment: async () => undefined,
    cleanupAttachments: async () => undefined,
    ...(writeClipboard === undefined ? {} : { writeClipboard }),
  }
  let id = 0
  return new EditorStore(services, () => ['root', 'child', 'sibling'][id++] ?? `node-${id}`)
}

async function createSeededStore(
  document: unknown,
  location: unknown,
  save: EditorServices['save'] = async () => undefined,
): Promise<EditorStore> {
  const services: EditorServices = {
    load: async () => ({ version: 1, document, location }),
    save,
    readClipboard: async () => ({ kind: 'text', text: '' }),
    writeAttachment: async () => undefined,
    cleanupAttachments: async () => undefined,
  }
  let id = 0
  const store = new EditorStore(services, () => `created-${id++}`)
  await act(async () => {
    await store.initialize()
  })
  return store
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

  // @requirement PRODUCT.md §3
  // @requirement PRODUCT.md §20
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

  // @requirement PRODUCT.md §17.1
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

    fireEvent.click(input.closest('.node-row')!)
    expect(input).toHaveFocus()
    fireEvent.keyDown(input, { key: 'i' })
    expect(screen.getByText('INSERT')).toBeInTheDocument()

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

  // @requirement PRODUCT.md §2
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
    expect(button.className).not.toContain('node-enter-control-has-children')

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
    expect(disclosure.className).toContain('node-enter-control-has-children')
    fireEvent.mouseDown(disclosure)
    fireEvent.click(disclosure)

    expect(screen.getByRole('textbox', { name: 'Current parent' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Node 1' })).toBeInTheDocument()
  })

  describe('scroll position', () => {
    it('aligns the selected row after the initial focus and saves its live position after user input', async () => {
      const save = vi.fn<EditorServices['save']>(async () => undefined)
      const store = new EditorStore(
        {
          load: async () => ({
            version: 3,
            document: { roots: [{ id: 'root', text: 'Root', children: [] }] },
            location: { currentParentId: null, selectedNodeId: 'root' },
            view: { expandedIds: [], selectedRowTop: 180 },
          }),
          save,
          readClipboard: async () => ({ kind: 'text', text: '' }),
          writeAttachment: async () => undefined,
          cleanupAttachments: async () => undefined,
        },
        () => 'unused',
      )
      await act(async () => {
        await store.initialize()
      })
      let rowTop = 40
      vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
        if (this.classList.contains('scroll-viewport'))
          return { top: 0, bottom: window.innerHeight, height: window.innerHeight } as DOMRect
        const top = this.dataset.nodeId === 'root' ? rowTop : 0
        return { top, bottom: top + 20, height: 20, left: 0, right: 0, width: 0, x: 0, y: top } as DOMRect
      })
      const calls: string[] = []
      const scrollBy = vi.spyOn(window, 'scrollBy').mockImplementation((...args: unknown[]) => {
        calls.push(`scrollBy:${String(args[1])}`)
      })
      const focus = HTMLElement.prototype.focus
      vi.spyOn(HTMLElement.prototype, 'focus').mockImplementation(function (this: HTMLElement, options) {
        calls.push('focus')
        focus.call(this, options)
      })
      const noteViewportChange = vi.spyOn(store, 'noteViewportChange')

      renderReact(<App store={store} />)
      // The row sits 40px from the top after focus; it moves down to its saved 180px.
      expect(calls.indexOf('focus')).toBeGreaterThanOrEqual(0)
      expect(calls.indexOf('scrollBy:-140')).toBeGreaterThan(calls.indexOf('focus'))
      expect(scrollBy).toHaveBeenCalledOnce()

      // Programmatic scrolling before any user input is not a change, and a save keeps the saved value.
      fireEvent.scroll(window)
      expect(noteViewportChange).not.toHaveBeenCalled()
      fireEvent.change(screen.getByRole('textbox', { name: 'Node 1' }), { target: { value: 'Root edited' } })
      await act(async () => {
        await store.flushPersistence()
      })
      expect(save.mock.calls.at(-1)?.[0]).toMatchObject({ view: { selectedRowTop: 180 } })

      // After user input, scrolling is a change and a save measures the row where it now is.
      fireEvent.wheel(window)
      rowTop = 75
      fireEvent.scroll(window)
      expect(noteViewportChange).toHaveBeenCalledOnce()
      await act(async () => {
        await store.flushPersistence()
      })
      expect(save.mock.calls.at(-1)?.[0]).toMatchObject({ view: { selectedRowTop: 75 } })
      expect(scrollBy).toHaveBeenCalledOnce()
    })

    it('clamps a saved position to a shorter window so the selected row stays visible', async () => {
      const save = vi.fn<EditorServices['save']>(async () => undefined)
      const store = new EditorStore(
        {
          load: async () => ({
            version: 3,
            document: { roots: [{ id: 'root', text: 'Root', children: [] }] },
            location: { currentParentId: null, selectedNodeId: 'root' },
            view: { expandedIds: [], selectedRowTop: 5_000 },
          }),
          save,
          readClipboard: async () => ({ kind: 'text', text: '' }),
          writeAttachment: async () => undefined,
          cleanupAttachments: async () => undefined,
        },
        () => 'unused',
      )
      await act(async () => {
        await store.initialize()
      })
      vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
        if (this.classList.contains('scroll-viewport'))
          return { top: 0, bottom: window.innerHeight, height: window.innerHeight } as DOMRect
        const top = this.dataset.nodeId === 'root' ? 40 : 0
        return { top, bottom: top + 20, height: 20, left: 0, right: 0, width: 0, x: 0, y: top } as DOMRect
      })
      const scrollBy = vi.spyOn(window, 'scrollBy').mockImplementation(() => undefined)

      renderReact(<App store={store} />)
      const lowest = window.innerHeight - 20
      expect(scrollBy).toHaveBeenCalledWith(0, 40 - lowest)

      fireEvent.change(screen.getByRole('textbox', { name: 'Node 1' }), { target: { value: 'Root edited' } })
      await act(async () => {
        await store.flushPersistence()
      })
      expect(save.mock.calls.at(-1)?.[0]).toMatchObject({ view: { selectedRowTop: lowest } })
    })

    it('does not scroll when no position was saved', async () => {
      const store = await createSeededStore(
        { roots: [{ id: 'root', text: 'Root', children: [] }] },
        { currentParentId: null, selectedNodeId: 'root' },
      )
      const scrollBy = vi.spyOn(window, 'scrollBy').mockImplementation(() => undefined)

      renderReact(<App store={store} />)
      expect(scrollBy).not.toHaveBeenCalled()
    })
  })

  describe('inline node expansion', () => {
    async function buildRootWithChild(): Promise<EditorStore> {
      const store = createStore()
      await act(async () => {
        await store.initialize()
      })
      render(<App store={store} />)
      fireEvent.keyDown(screen.getByRole('textbox', { name: 'Node 1' }), { key: '.', metaKey: true })
      fireEvent.keyDown(screen.getByRole('textbox', { name: 'Current parent' }), { key: 'Enter' })
      fireEvent.keyDown(screen.getByRole('textbox', { name: 'Node 1' }), { key: ',', metaKey: true })
      return store
    }

    function readySnapshot(store: EditorStore): {
      location: { currentParentId: string | null; selectedNodeId: string }
    } {
      const snapshot = store.getSnapshot()
      if (snapshot.status !== 'ready') throw new Error('The editor is not ready.')
      return snapshot
    }

    it('expands a node’s children inline without changing the current location or the caret', async () => {
      const store = await buildRootWithChild()
      expect(screen.queryByRole('textbox', { name: 'Node 2' })).not.toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: 'Expand node 1' }))

      expect(screen.getByRole('textbox', { name: 'Node 2' })).toBeInTheDocument()
      expect(screen.queryByRole('textbox', { name: 'Current parent' })).not.toBeInTheDocument()
      expect(readySnapshot(store).location).toEqual({ currentParentId: null, selectedNodeId: 'root' })
    })

    it('collapses a node’s children again from the same disclosure control', async () => {
      await buildRootWithChild()
      fireEvent.click(screen.getByRole('button', { name: 'Expand node 1' }))
      expect(screen.getByRole('textbox', { name: 'Node 2' })).toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: 'Collapse node 1' }))

      expect(screen.queryByRole('textbox', { name: 'Node 2' })).not.toBeInTheDocument()
    })

    it('selects the collapsing node with the caret at the start when collapse hides the caret', async () => {
      const store = await buildRootWithChild()
      fireEvent.click(screen.getByRole('button', { name: 'Expand node 1' }))
      const child = screen.getByRole('textbox', { name: 'Node 2' })
      act(() => child.focus())
      expect(readySnapshot(store).location.selectedNodeId).toBe('child')

      fireEvent.click(screen.getByRole('button', { name: 'Collapse node 1' }))

      const snapshot = store.getSnapshot()
      if (snapshot.status !== 'ready') throw new Error('The editor is not ready.')
      expect(snapshot.location.selectedNodeId).toBe('root')
      expect(snapshot.focus?.cursor).toBe(0)
    })

    it('leaves selection unchanged when the caret is on the collapsing node itself', async () => {
      const store = await buildRootWithChild()
      fireEvent.click(screen.getByRole('button', { name: 'Expand node 1' }))
      expect(readySnapshot(store).location.selectedNodeId).toBe('root')
      const focusBefore = store.getSnapshot().status === 'ready' ? store.getSnapshot() : undefined

      fireEvent.click(screen.getByRole('button', { name: 'Collapse node 1' }))

      expect(readySnapshot(store).location.selectedNodeId).toBe('root')
      expect(focusBefore).toBeDefined()
    })

    it('ends whole-node Visual mode when collapse hides its anchor and focus', async () => {
      const store = await buildRootWithChild()
      fireEvent.click(screen.getByRole('button', { name: 'Expand node 1' }))
      const child = screen.getByRole('textbox', { name: 'Node 2' })
      act(() => child.focus())
      fireEvent.keyDown(child, { key: 'Escape' })
      fireEvent.keyDown(child, { key: 'V' })
      expect(screen.getByText('VISUAL NODE')).toBeInTheDocument()
      expect(readySnapshot(store).location.selectedNodeId).toBe('child')

      fireEvent.click(screen.getByRole('button', { name: 'Collapse node 1' }))

      expect(screen.queryByText('VISUAL NODE')).not.toBeInTheDocument()
      expect(screen.getByText('NORMAL')).toBeInTheDocument()
      const snapshot = store.getSnapshot()
      if (snapshot.status !== 'ready') throw new Error('The editor is not ready.')
      expect(snapshot.location.selectedNodeId).toBe('root')
      expect(snapshot.focus?.cursor).toBe(0)
    })

    it('leaves an unrelated whole-node Visual selection active when collapsing a different branch', async () => {
      const store = await buildRootWithChild()
      fireEvent.keyDown(screen.getByRole('textbox', { name: 'Node 1' }), { key: 'Escape' })
      fireEvent.keyDown(screen.getByRole('textbox', { name: 'Node 1' }), { key: 'V' })
      expect(screen.getByText('VISUAL NODE')).toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: 'Expand node 1' }))
      fireEvent.click(screen.getByRole('button', { name: 'Collapse node 1' }))

      expect(screen.getByText('VISUAL NODE')).toBeInTheDocument()
      expect(readySnapshot(store).location.selectedNodeId).toBe('root')
    })

    it('keeps a node expanded after entering it and leaving again', async () => {
      await buildRootWithChild()
      fireEvent.click(screen.getByRole('button', { name: 'Expand node 1' }))
      expect(screen.getByRole('textbox', { name: 'Node 2' })).toBeInTheDocument()

      fireEvent.keyDown(screen.getByRole('textbox', { name: 'Node 1' }), { key: '.', metaKey: true })
      fireEvent.keyDown(screen.getByRole('textbox', { name: 'Node 1' }), { key: ',', metaKey: true })

      expect(screen.getByRole('textbox', { name: 'Node 2' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Collapse node 1' })).toBeInTheDocument()
    })
  })

  describe('Vim fold commands over inline expansion', () => {
    const nestedDocument = {
      roots: [
        {
          id: 'root',
          text: 'Alpha',
          children: [
            {
              id: 'child',
              text: 'Alpha child',
              children: [{ id: 'grandchild', text: 'Alpha grandchild', children: [] }],
            },
            { id: 'leaf', text: 'Alpha leaf', children: [] },
          ],
        },
        { id: 'sibling', text: 'Bravo', children: [] },
      ],
    }

    async function renderNested(): Promise<EditorStore> {
      const store = await createSeededStore(nestedDocument, { currentParentId: null, selectedNodeId: 'root' })
      renderReact(<App store={store} />)
      return store
    }

    function readySnapshot(store: EditorStore): {
      document: Document
      location: { currentParentId: string | null; selectedNodeId: string }
      focus?: { nodeId: string; cursor: number; token: number }
    } {
      const snapshot = store.getSnapshot()
      if (snapshot.status !== 'ready') throw new Error('The editor is not ready.')
      return snapshot
    }

    function press(input: HTMLElement, key: string): void {
      fireEvent.keyDown(input, { key })
    }

    function fold(input: HTMLElement, key: string): void {
      press(input, 'z')
      press(input, key)
    }

    function texts(): string[] {
      return screen
        .getAllByRole('textbox')
        .filter((input) => !/Current parent/u.test(input.getAttribute('aria-label') ?? ''))
        .map((input) => (input as HTMLTextAreaElement).value)
    }

    it('closes, opens, and toggles the selected node’s own fold without moving the caret', async () => {
      const store = await renderNested()
      const alpha = screen.getByRole('textbox', { name: 'Node 1' })
      expect(texts()).toEqual(['Alpha', 'Bravo'])

      fold(alpha, 'a')
      expect(texts()).toEqual(['Alpha', 'Alpha child', 'Alpha leaf', 'Bravo'])
      expect(readySnapshot(store).location.selectedNodeId).toBe('root')

      fold(alpha, 'c')
      expect(texts()).toEqual(['Alpha', 'Bravo'])

      fold(alpha, 'o')
      expect(texts()).toEqual(['Alpha', 'Alpha child', 'Alpha leaf', 'Bravo'])
      expect(readySnapshot(store).location.selectedNodeId).toBe('root')
    })

    it('clears nested choices with zC and opens the whole subtree with zO', async () => {
      await renderNested()
      const alpha = screen.getByRole('textbox', { name: 'Node 1' })
      fold(alpha, 'a')
      const child = screen.getByRole('textbox', { name: 'Node 2' })
      act(() => child.focus())
      fold(child, 'a')
      expect(texts()).toEqual(['Alpha', 'Alpha child', 'Alpha grandchild', 'Alpha leaf', 'Bravo'])

      act(() => alpha.focus())
      fold(alpha, 'C')
      expect(texts()).toEqual(['Alpha', 'Bravo'])

      // zC discarded the nested choice, so reopening the root shows only its direct children.
      fold(alpha, 'o')
      expect(texts()).toEqual(['Alpha', 'Alpha child', 'Alpha leaf', 'Bravo'])

      fold(alpha, 'O')
      expect(texts()).toEqual(['Alpha', 'Alpha child', 'Alpha grandchild', 'Alpha leaf', 'Bravo'])
    })

    it('closes every fold with zM and selects the displayed ancestor of a hidden caret', async () => {
      const store = await renderNested()
      const alpha = screen.getByRole('textbox', { name: 'Node 1' })
      fold(alpha, 'a')
      const child = screen.getByRole('textbox', { name: 'Node 2' })
      act(() => child.focus())
      fold(child, 'a')
      const grandchild = screen.getByRole('textbox', { name: 'Node 3' })
      act(() => grandchild.focus())
      expect(readySnapshot(store).location.selectedNodeId).toBe('grandchild')

      fold(grandchild, 'M')

      expect(texts()).toEqual(['Alpha', 'Bravo'])
      const snapshot = readySnapshot(store)
      expect(snapshot.location.selectedNodeId).toBe('root')
      expect(snapshot.focus?.cursor).toBe(0)
      expect(screen.getByRole('textbox', { name: 'Node 1' })).toHaveFocus()
    })

    it('clears a stale image caret when zM hides the node holding it', async () => {
      const store = await createSeededStore(
        {
          roots: [
            {
              id: 'root',
              text: 'Alpha',
              children: [
                { id: 'child', text: '', attachment: { id: 'child-image', mimeType: 'image/png' }, children: [] },
              ],
            },
          ],
        },
        { currentParentId: null, selectedNodeId: 'root' },
      )
      renderReact(<App store={store} />)
      const alpha = screen.getByRole('textbox', { name: 'Node 1' })
      fold(alpha, 'a')
      const child = screen.getByRole('textbox', { name: 'Node 2' })
      act(() => child.focus())
      expect(child).toHaveClass('node-input-image-caret')

      fold(child, 'M')

      const destination = screen.getByRole('textbox', { name: 'Node 1' })
      expect(destination).toHaveFocus()
      expect(destination).not.toHaveClass('node-input-image-caret')
      expect(readySnapshot(store).focus?.cursor).toBe(0)
    })

    it('opens every fold with zR while the caret stays on the focused descendant', async () => {
      const store = await renderNested()
      const alpha = screen.getByRole('textbox', { name: 'Node 1' })
      fold(alpha, 'a')
      const child = screen.getByRole('textbox', { name: 'Node 2' })
      act(() => child.focus())

      fold(child, 'R')

      expect(texts()).toEqual(['Alpha', 'Alpha child', 'Alpha grandchild', 'Alpha leaf', 'Bravo'])
      const snapshot = readySnapshot(store)
      expect(snapshot.location.selectedNodeId).toBe('child')
      expect(screen.getByRole('textbox', { name: 'Node 2' })).toHaveFocus()
    })

    it('does nothing for fold commands on a leaf', async () => {
      await renderNested()
      const alpha = screen.getByRole('textbox', { name: 'Node 1' })
      fold(alpha, 'a')
      const leaf = screen.getByRole('textbox', { name: 'Node 3' })
      act(() => leaf.focus())

      for (const key of ['c', 'o', 'a', 'C', 'O']) {
        fold(leaf, key)
        expect(texts()).toEqual(['Alpha', 'Alpha child', 'Alpha leaf', 'Bravo'])
      }
      expect(leaf).toHaveFocus()
    })

    it('does nothing for per-node fold commands on the editable current-parent heading', async () => {
      const store = await renderNested()
      const alpha = screen.getByRole('textbox', { name: 'Node 1' })
      fireEvent.keyDown(alpha, { key: '.', metaKey: true })
      const heading = screen.getByRole('textbox', { name: 'Current parent' })
      act(() => heading.focus())
      expect(readySnapshot(store).location.selectedNodeId).toBe('root')

      for (const key of ['c', 'o', 'a', 'C', 'O']) fold(heading, key)

      expect(texts()).toEqual(['Alpha child', 'Alpha leaf'])
      expect(heading).toHaveFocus()
    })

    it('creates no undo entry or document edit when expanding inline, and saves the expansion', async () => {
      const save = vi.fn<EditorServices['save']>(async () => undefined)
      const store = await createSeededStore(nestedDocument, { currentParentId: null, selectedNodeId: 'root' }, save)
      renderReact(<App store={store} />)
      const alpha = screen.getByRole('textbox', { name: 'Node 1' }) as HTMLTextAreaElement
      const beforeEdit = readySnapshot(store)

      fireEvent.change(alpha, { target: { value: 'Alpha edited' } })
      await act(async () => {
        await store.flushPersistence()
      })
      const edited = readySnapshot(store).document
      const savesAfterEdit = save.mock.calls.length
      // The edit itself persists; the assertions below attribute any further save to expansion.
      expect(savesAfterEdit).toBeGreaterThan(0)

      // docs/PRODUCT.md §2.4: expansion is view state. The disclosure triangle, `za`, and `zR` must
      // not edit the document or add an undo entry; the choices are saved with the document.
      fireEvent.click(screen.getByRole('button', { name: 'Expand node 1' }))
      expect(texts()).toEqual(['Alpha edited', 'Alpha child', 'Alpha leaf', 'Bravo'])
      fireEvent.click(screen.getByRole('button', { name: 'Collapse node 1' }))
      fold(alpha, 'a')
      expect(texts()).toEqual(['Alpha edited', 'Alpha child', 'Alpha leaf', 'Bravo'])
      fold(alpha, 'R')
      expect(texts()).toEqual(['Alpha edited', 'Alpha child', 'Alpha grandchild', 'Alpha leaf', 'Bravo'])

      expect(readySnapshot(store).document).toEqual(edited)
      await act(async () => {
        await store.flushPersistence()
      })
      expect(save).toHaveBeenCalledTimes(savesAfterEdit + 1)
      expect(save.mock.calls.at(-1)?.[0]).toMatchObject({
        document: edited,
        view: { expandedIds: ['root', 'child'] },
      })

      // One undo removes exactly the text edit, so expansion added no history entry; a second undo
      // has nothing left to remove.
      press(alpha, 'u')
      const undone = readySnapshot(store)
      expect(undone.document).toEqual(beforeEdit.document)
      expect(undone.location).toEqual({ currentParentId: null, selectedNodeId: 'root' })
      press(alpha, 'u')
      expect(readySnapshot(store).document).toEqual(beforeEdit.document)
    })
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

  it('keeps the text select-all after Cmd+A exits whole-node Visual mode', async () => {
    const store = createStore()
    await act(async () => {
      await store.initialize()
    })
    renderReact(<App store={store} />)
    const input = screen.getByRole('textbox', { name: 'Node 1' }) as HTMLTextAreaElement
    fireEvent.change(input, { target: { value: 'Project' } })
    input.focus()
    fireEvent.keyDown(input, { key: 'V' })
    expect(screen.getByLabelText('Vim mode')).toHaveTextContent('VISUAL NODE')

    fireEvent.keyDown(input, { key: 'a', metaKey: true })

    expect(screen.getByLabelText('Vim mode')).toHaveTextContent('NORMAL')
    expect(input.selectionStart).toBe(0)
    expect(input.selectionEnd).toBe(input.value.length)
  })

  it('commits a pending Replace edit before Cmd+V pastes at the typed end', async () => {
    const store = createStore({ kind: 'text', text: 'PASTED' })
    await act(async () => {
      await store.initialize()
    })
    renderReact(<App store={store} />)
    const input = screen.getByRole('textbox', { name: 'Node 1' }) as HTMLTextAreaElement
    fireEvent.change(input, { target: { value: 'abcd' } })
    input.setSelectionRange(2, 2)
    fireEvent.keyDown(input, { key: 'R' })
    fireEvent.keyDown(input, { key: 'X' })
    expect(input).toHaveValue('abXd')

    fireEvent.keyDown(input, { key: 'v', metaKey: true })
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(input).toHaveValue('abXPASTEDd')
    expect(screen.getByLabelText('Vim mode')).toHaveTextContent('NORMAL')
  })

  it('commits a pending Replace edit before Cmd+A and Cmd+X cut the visible selection', async () => {
    const writeClipboard = vi.fn(async () => undefined)
    const store = createStore({ kind: 'text', text: '' }, writeClipboard)
    await act(async () => {
      await store.initialize()
    })
    renderReact(<App store={store} />)
    const input = screen.getByRole('textbox', { name: 'Node 1' }) as HTMLTextAreaElement
    fireEvent.change(input, { target: { value: 'abcd' } })
    input.setSelectionRange(2, 2)
    fireEvent.keyDown(input, { key: 'R' })
    fireEvent.keyDown(input, { key: 'X' })
    fireEvent.keyDown(input, { key: 'a', metaKey: true })

    fireEvent.keyDown(input, { key: 'x', metaKey: true })
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(writeClipboard).toHaveBeenCalledWith({ text: 'abXd', html: 'abXd' })
    expect(input).toHaveValue('')
    expect(screen.getByLabelText('Vim mode')).toHaveTextContent('NORMAL')
  })

  it('commits a pending Replace edit before the native paste fallback', async () => {
    const store = createStore({ kind: 'text', text: 'PASTED' })
    await act(async () => {
      await store.initialize()
    })
    renderReact(<App store={store} />)
    const input = screen.getByRole('textbox', { name: 'Node 1' }) as HTMLTextAreaElement
    fireEvent.change(input, { target: { value: 'abcd' } })
    input.setSelectionRange(2, 2)
    fireEvent.keyDown(input, { key: 'R' })
    fireEvent.keyDown(input, { key: 'X' })

    fireEvent.paste(input)
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(input).toHaveValue('abXPASTEDd')
    expect(screen.getByLabelText('Vim mode')).toHaveTextContent('NORMAL')
  })

  it('keeps character Visual mode and re-anchors the next motion after Cmd+V', async () => {
    const store = createStore({ kind: 'text', text: 'PASTED' })
    await act(async () => {
      await store.initialize()
    })
    renderReact(<App store={store} />)
    const input = screen.getByRole('textbox', { name: 'Node 1' }) as HTMLTextAreaElement
    fireEvent.change(input, { target: { value: 'abcd' } })
    input.setSelectionRange(0, 0)
    fireEvent.keyDown(input, { key: 'v' })
    fireEvent.keyDown(input, { key: 'l' })
    fireEvent.keyDown(input, { key: 'l' })
    expect(input.selectionStart).toBe(0)
    expect(input.selectionEnd).toBe(3)

    fireEvent.keyDown(input, { key: 'v', metaKey: true })
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(input).toHaveValue('PASTEDabcd')
    expect(screen.getByLabelText('Vim mode')).toHaveTextContent('VISUAL')

    fireEvent.keyDown(input, { key: 'l' })
    expect(input.selectionStart).toBe(6)
  })

  it('keeps whole-node Visual mode and its range after Cmd+V', async () => {
    const store = createStore({ kind: 'text', text: 'X' })
    await act(async () => {
      await store.initialize()
    })
    renderReact(<App store={store} />)
    const root = screen.getByRole('textbox', { name: 'Node 1' }) as HTMLTextAreaElement
    fireEvent.change(root, { target: { value: 'A' } })
    root.focus()
    fireEvent.keyDown(root, { key: 'V' })
    expect(screen.getByLabelText('Vim mode')).toHaveTextContent('VISUAL NODE')
    expect(document.querySelectorAll('.node-row-visual-selected')).toHaveLength(1)

    fireEvent.keyDown(root, { key: 'v', metaKey: true })
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(screen.getByLabelText('Vim mode')).toHaveTextContent('VISUAL NODE')
    expect(document.querySelectorAll('.node-row-visual-selected')).toHaveLength(1)
    expect(root).toHaveValue('AX')
  })

  it('exits whole-node Visual mode when the enter control enters the node', async () => {
    const store = createStore()
    await act(async () => {
      await store.initialize()
    })
    renderReact(<App store={store} />)
    const input = screen.getByRole('textbox', { name: 'Node 1' })
    fireEvent.change(input, { target: { value: 'Root' } })
    input.focus()
    fireEvent.keyDown(input, { key: 'V' })
    expect(screen.getByLabelText('Vim mode')).toHaveTextContent('VISUAL NODE')
    expect(document.querySelectorAll('.node-row-visual-selected')).toHaveLength(1)

    const button = screen.getByRole('button', { name: 'Enter node 1' })
    fireEvent.mouseDown(button)
    fireEvent.click(button)

    expect(screen.getByLabelText('Vim mode')).toHaveTextContent('NORMAL')
    expect(document.querySelectorAll('.node-row-visual-selected')).toHaveLength(0)
  })

  it('exits whole-node Visual mode when a breadcrumb click changes the level', async () => {
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
    const leaf = screen.getByRole('textbox', { name: 'Node 1' })

    fireEvent.keyDown(leaf, { key: 'Escape' })
    expect(screen.getByLabelText('Vim mode')).toHaveTextContent('NORMAL')
    fireEvent.keyDown(leaf, { key: 'V' })
    expect(screen.getByLabelText('Vim mode')).toHaveTextContent('VISUAL NODE')
    expect(document.querySelectorAll('.node-row-visual-selected')).toHaveLength(1)

    fireEvent.click(screen.getByRole('button', { name: 'Root' }))

    expect(screen.getByLabelText('Vim mode')).toHaveTextContent('NORMAL')
    expect(document.querySelectorAll('.node-row-visual-selected')).toHaveLength(0)
  })

  it('toggles the always-on-top setting from the status bar', async () => {
    const store = createStore()
    await act(async () => {
      await store.initialize()
    })
    const setAlwaysOnTop = vi.spyOn(window.treeApi, 'setAlwaysOnTop')
    render(<App store={store} />)

    const toggle = await screen.findByRole('button', { name: 'Pin window on top' })
    expect(toggle.parentElement?.querySelector('.status-tooltip')).toHaveTextContent('Pin window on top')
    expect(toggle.closest('footer.status-bar')).not.toBeNull()
    expect(toggle.closest('.location-bar')).toBeNull()
    expect(toggle.parentElement?.nextElementSibling).toBe(screen.getByLabelText('Vim mode'))
    fireEvent.click(toggle)

    expect(setAlwaysOnTop).toHaveBeenCalledWith(true)
    const unpin = await screen.findByRole('button', { name: 'Unpin window from top' })
    expect(unpin.parentElement?.querySelector('.status-tooltip')).toHaveTextContent('Unpin window from top')
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

  it('keeps the caret and mode through a cancelled drag', async () => {
    const store = createStore()
    await act(async () => {
      await store.initialize()
    })
    render(<App store={store} />)
    const first = screen.getByRole('textbox', { name: 'Node 1' }) as HTMLTextAreaElement
    fireEvent.change(first, { target: { value: 'Alpha' } })
    fireEvent.keyDown(first, { key: 'Enter' })
    const second = screen.getByRole('textbox', { name: 'Node 2' }) as HTMLTextAreaElement
    fireEvent.change(second, { target: { value: 'Bravo' } })
    fireEvent.keyDown(second, { key: 'Enter' })
    fireEvent.change(screen.getByRole('textbox', { name: 'Node 3' }), { target: { value: 'Charlie' } })

    mockAppRowRects()
    vi.useFakeTimers()
    const rows = document.querySelectorAll('.node-row')
    const source = rows[2]
    if (source === undefined) throw new Error('The third row was not rendered.')
    const input = source.querySelector('textarea')
    if (input === null) throw new Error('The third input was not rendered.')
    act(() => {
      input.focus()
      input.setSelectionRange(2, 2)
    })

    fireEvent.pointerDown(source, {
      pointerId: 1,
      button: 0,
      isPrimary: true,
      pointerType: 'mouse',
      clientX: 100,
      clientY: 60,
    })
    act(() => vi.advanceTimersByTime(HOLD_ACTIVATION_MS))
    expect(source).toHaveClass('node-row-dragging')
    const frozen = [input.selectionStart, input.selectionEnd]
    expect(document.activeElement).not.toBe(input)

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(document.activeElement).not.toBe(input)

    fireEvent.pointerUp(window, { pointerId: 1, clientX: 100, clientY: 60 })

    expect(document.activeElement).toBe(input)
    expect([input.selectionStart, input.selectionEnd]).toEqual(frozen)
    expect(screen.getByText('INSERT')).toBeInTheDocument()
    expect(source).not.toHaveClass('node-row-dragging')
  })

  it('keeps the source input blurred after a cancelled drag until the pointer is released', async () => {
    const store = createStore()
    await act(async () => {
      await store.initialize()
    })
    render(<App store={store} />)
    const first = screen.getByRole('textbox', { name: 'Node 1' }) as HTMLTextAreaElement
    fireEvent.change(first, { target: { value: 'Alpha' } })
    fireEvent.keyDown(first, { key: 'Enter' })
    fireEvent.change(screen.getByRole('textbox', { name: 'Node 2' }), { target: { value: 'Bravo' } })

    mockAppRowRects()
    vi.useFakeTimers()
    const rows = document.querySelectorAll('.node-row')
    const source = rows[0]
    if (source === undefined) throw new Error('The first row was not rendered.')
    const input = source.querySelector('textarea')
    if (input === null) throw new Error('The first input was not rendered.')
    act(() => input.focus())
    act(() => input.setSelectionRange(2, 2))

    fireEvent.pointerDown(source, {
      pointerId: 1,
      button: 0,
      isPrimary: true,
      pointerType: 'mouse',
      clientX: 100,
      clientY: 13,
    })
    act(() => vi.advanceTimersByTime(HOLD_ACTIVATION_MS))
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(document.activeElement).not.toBe(input)

    fireEvent.pointerUp(window, { pointerId: 1, clientX: 100, clientY: 13 })

    expect(document.activeElement).toBe(input)
    expect(input.selectionStart).toBe(2)
    expect(input.selectionEnd).toBe(2)
  })

  it('keeps the mode and restores the caret when a drag starts on an unfocused row', async () => {
    const store = createStore()
    await act(async () => {
      await store.initialize()
    })
    render(<App store={store} />)
    const first = screen.getByRole('textbox', { name: 'Node 1' }) as HTMLTextAreaElement
    fireEvent.change(first, { target: { value: 'Alpha' } })
    fireEvent.keyDown(first, { key: 'Enter' })
    const second = screen.getByRole('textbox', { name: 'Node 2' }) as HTMLTextAreaElement
    fireEvent.change(second, { target: { value: 'Bravo' } })
    fireEvent.keyDown(second, { key: 'Enter' })
    fireEvent.change(screen.getByRole('textbox', { name: 'Node 3' }), { target: { value: 'Charlie' } })
    const firstInput = screen.getByRole('textbox', { name: 'Node 1' }) as HTMLTextAreaElement
    act(() => firstInput.focus())

    mockAppRowRects()
    vi.useFakeTimers()
    const rows = document.querySelectorAll('.node-row')
    const source = rows[2]
    if (source === undefined) throw new Error('The third row was not rendered.')
    const input = source.querySelector('textarea')
    if (input === null) throw new Error('The third input was not rendered.')
    expect(document.activeElement).not.toBe(input)

    // A real press first arms the pending hold, then the browser's default mousedown focuses the
    // input; jsdom does not synthesize that default focus, so the test performs it explicitly.
    fireEvent.pointerDown(source, {
      pointerId: 1,
      button: 0,
      isPrimary: true,
      pointerType: 'mouse',
      clientX: 100,
      clientY: 60,
    })
    fireEvent.mouseDown(input, { button: 0 })
    act(() => input.focus())
    act(() => input.setSelectionRange(4, 4))
    act(() => vi.advanceTimersByTime(HOLD_ACTIVATION_MS))

    expect(source).toHaveClass('node-row-dragging')
    expect(document.activeElement).not.toBe(input)

    fireEvent.keyDown(window, { key: 'Escape' })
    fireEvent.pointerUp(window, { pointerId: 1, clientX: 100, clientY: 60 })

    expect(document.activeElement).toBe(input)
    expect(input.selectionStart).toBe(4)
    expect(store.getSnapshot()).toMatchObject({ status: 'ready', location: { selectedNodeId: 'sibling' } })
    expect(screen.getByText('INSERT')).toBeInTheDocument()
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

  it('commits a pending Replace edit when the store flushes persistence for quit', async () => {
    const save = vi.fn(async () => undefined)
    const services: EditorServices = {
      load: async () => null,
      save,
      readClipboard: async () => ({ kind: 'text', text: '' }),
      writeAttachment: async () => undefined,
      cleanupAttachments: async () => undefined,
    }
    const store = new EditorStore(services, () => 'root')
    await act(async () => {
      await store.initialize()
    })
    renderReact(<App store={store} />)
    const root = screen.getByRole('textbox', { name: 'Node 1' }) as HTMLTextAreaElement
    fireEvent.change(root, { target: { value: 'abcd' } })
    root.setSelectionRange(2, 2)
    fireEvent.keyDown(root, { key: 'R' })
    fireEvent.keyDown(root, { key: 'X' })
    expect(root).toHaveValue('abXd')

    await act(async () => {
      await store.flushPersistence()
    })

    const state = store.getSnapshot()
    expect(state.status === 'ready' && state.document.roots[0]!.text).toBe('abXd')
    expect(save).toHaveBeenLastCalledWith(
      expect.objectContaining({ document: { roots: [{ id: 'root', text: 'abXd', children: [] }] } }),
    )
    expect(screen.getByLabelText('Vim mode')).toHaveTextContent('NORMAL')
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
