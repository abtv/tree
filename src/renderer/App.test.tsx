// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EditorStore, type EditorServices } from '../application/editor-store'
import './test/setup'
import { App } from './App'

afterEach(cleanup)

function createStore(): EditorStore {
  const services: EditorServices = {
    load: async () => null,
    save: async () => undefined,
    readClipboard: async () => ({ kind: 'text', text: '' }),
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
    await act(async () => { await store.initialize() })
    render(<App store={store} />)
    const root = screen.getByRole('textbox', { name: 'Node 1' }) as HTMLInputElement

    fireEvent.change(root, { target: { value: 'Current' } })
    root.setSelectionRange(3, 3)
    fireEvent.keyDown(root, { key: 'Enter' })

    expect(screen.getByRole('textbox', { name: 'Node 1' })).toHaveValue('Cur')
    expect(screen.getByRole('textbox', { name: 'Node 2' })).toHaveValue('rent')
  })

  it('keeps consecutive text edits in one undo session when the caret advances', async () => {
    const store = createStore()
    await act(async () => { await store.initialize() })
    render(<App store={store} />)
    const root = screen.getByRole('textbox', { name: 'Node 1' }) as HTMLInputElement

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
    await act(async () => { await store.initialize() })
    render(<App store={store} />)
    const root = screen.getByRole('textbox', { name: 'Node 1' }) as HTMLInputElement

    fireEvent.change(root, { target: { value: 'Fir' } })
    await act(async () => undefined)
    root.setSelectionRange(0, 3)
    fireEvent.select(root)
    fireEvent.change(root, { target: { value: 'First' } })

    fireEvent.keyDown(root, { key: 'z', metaKey: true })

    expect(root).toHaveValue('Fir')
  })

  it('renders and edits the current parent after entering an empty node', async () => {
    const store = createStore()
    await act(async () => { await store.initialize() })
    render(<App store={store} />)
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Node 1' }), { key: '.', metaKey: true })

    const parent = screen.getByRole('textbox', { name: 'Current parent' })
    fireEvent.change(parent, { target: { value: 'Projects' } })

    expect(parent).toHaveValue('Projects')
    expect(screen.getByLabelText('Current location')).toHaveTextContent('›Projects')
  })

  it('shows a disclosure control only for nodes with children and enters the node when clicked', async () => {
    const store = createStore()
    await act(async () => { await store.initialize() })
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
    await act(async () => { await store.initialize() })
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
    await act(async () => { await store.initialize() })
    render(<App store={store} />)
    const first = screen.getByRole('textbox', { name: 'Node 1' }) as HTMLInputElement
    fireEvent.change(first, { target: { value: 'A' } })
    fireEvent.keyDown(first, { key: 'Enter' })
    const transfer = { dropEffect: '', effectAllowed: '', value: '', setData(_type: string, value: string) { this.value = value }, getData() { return this.value } }
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
    await act(async () => { await store.initialize() })
    render(<App store={store} />)
    const first = screen.getByRole('textbox', { name: 'Node 1' }) as HTMLInputElement
    const transfer = { dropEffect: '', effectAllowed: '', value: '', setData(_type: string, value: string) { this.value = value }, getData() { return this.value } }

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
})
