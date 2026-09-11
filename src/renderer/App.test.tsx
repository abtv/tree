// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
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

  it('renders and edits the current parent after entering an empty node', async () => {
    const store = createStore()
    await act(async () => { await store.initialize() })
    render(<App store={store} />)
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Node 1' }), { key: '.', metaKey: true })

    const parent = screen.getByRole('textbox', { name: 'Current parent' })
    fireEvent.change(parent, { target: { value: 'Projects' } })

    expect(parent).toHaveValue('Projects')
  })
})
