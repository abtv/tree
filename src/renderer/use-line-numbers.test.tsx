// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { EditorStore } from '../application/editor-store'
import { useLineNumbers } from './use-line-numbers'
import type { TreeApi } from '../shared/ipc'

afterEach(cleanup)

async function setup() {
  const write = vi.fn<(value: boolean) => Promise<void>>(async () => undefined)
  window.treeApi = { setLineNumbers: write } as unknown as TreeApi
  const store = new EditorStore(
    {
      load: async () => null,
      save: async () => undefined,
      readClipboard: async () => ({ kind: 'text', text: '' }),
      writeAttachment: async () => undefined,
      cleanupAttachments: async () => undefined,
    },
    () => 'root',
  )
  await store.initialize()
  const error = vi.spyOn(store, 'reportError')
  function Harness() {
    const { lineNumbers } = useLineNumbers(false, store)
    return (
      <main className="tree-app">
        <textarea aria-label="Editor" />
        <output>{String(lineNumbers)}</output>
        <input aria-label="Search" className="search-controls" />
        <input aria-label="Command" className="command-input-line" />
      </main>
    )
  }
  render(<Harness />)
  return { write, error, editor: screen.getByLabelText('Editor') }
}

// @requirement PRODUCT.md §2.1
it('toggles only on unmodified Control+L, consumes repeats and preserves editor focus', async () => {
  const { editor, write } = await setup()
  editor.focus()

  fireEvent.keyDown(editor, { key: 'l', ctrlKey: true })
  fireEvent.keyDown(editor, { key: 'l', ctrlKey: true, repeat: true })

  expect(screen.getByText('true')).toBeTruthy()
  expect(document.activeElement).toBe(editor)
  expect(write).toHaveBeenCalledExactlyOnceWith(true)

  fireEvent.keyDown(editor, { key: 'l', ctrlKey: true })

  expect(screen.getByText('false')).toBeTruthy()
  expect(write.mock.calls).toEqual([[true], [false]])
})

it.each([
  { metaKey: true },
  { ctrlKey: true, metaKey: true },
  { ctrlKey: true, altKey: true },
  { ctrlKey: true, shiftKey: true },
  { ctrlKey: true, isComposing: true },
  {},
])('leaves other key combinations and composition untouched: %j', async (modifiers) => {
  const { editor, write } = await setup()

  expect(fireEvent.keyDown(editor, { key: 'l', ...modifiers })).toBe(true)
  expect(write).not.toHaveBeenCalled()
})

it('leaves prompts and modal dialogs alone and reports persistence errors', async () => {
  const { editor, write, error } = await setup()
  for (const label of ['Search', 'Command'])
    fireEvent.keyDown(screen.getByLabelText(label), { key: 'l', ctrlKey: true })
  const dialog = document.createElement('dialog')
  dialog.open = true
  document.body.append(dialog)

  fireEvent.keyDown(editor, { key: 'l', ctrlKey: true })

  expect(write).not.toHaveBeenCalled()

  dialog.remove()
  write.mockRejectedValueOnce(new Error('Preference failed'))
  await act(async () => {
    fireEvent.keyDown(editor, { key: 'l', ctrlKey: true })
  })

  expect(error).toHaveBeenCalledWith(new Error('Preference failed'))
})
