// @vitest-environment jsdom

import { act, fireEvent, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { createAppHarness, settleApp } from './test/app-harness'

// @requirement PRODUCT.md §20.2.19
it.each(['o', 'O', 'c', 's'])(
  'keeps the previous dot change when a pointer interrupts structural %s',
  async (command) => {
    const f = await createAppHarness({
      vimEnabled: true,
      document: { roots: [{ id: 'a', text: 'ABC', children: [] }] },
    })
    const selected = (): HTMLElement => screen.getByRole('textbox', { name: command === 'o' ? 'Node 2' : 'Node 1' })
    const first = screen.getByRole('textbox', { name: 'Node 1' })
    await f.focus(first)
    await f.press(first, 'x')

    expect(f.node('a').text).toBe('BC')

    if (command === 'c' || command === 's') await f.press(first, 'V', { shiftKey: true })
    await f.press(first, command, { shiftKey: command === 'O' })
    const editedId = f.snapshot().location.selectedNodeId
    await f.input(selected(), 'Opened')
    act(() => {
      fireEvent.mouseDown(selected(), { button: 0 })
      fireEvent.mouseUp(selected(), { button: 0 })
      fireEvent.click(selected(), { button: 0 })
    })
    await settleApp()

    expect(selected()).toHaveFocus()
    expect(screen.getByLabelText('Vim mode')).toHaveTextContent('INSERT')

    await f.press(selected(), 'Escape')
    await f.focus(selected(), 0)
    await f.press(selected(), '.')

    const roots = () => f.snapshot().document.roots.map(({ id, text, children }) => ({ id, text, children }))
    const expected =
      command === 'o'
        ? [
            { id: 'a', text: 'BC', children: [] },
            { id: editedId, text: 'pened', children: [] },
          ]
        : command === 'O'
          ? [
              { id: editedId, text: 'pened', children: [] },
              { id: 'a', text: 'BC', children: [] },
            ]
          : [{ id: editedId, text: 'pened', children: [] }]

    expect(roots()).toEqual(expected)
    expect(selected()).toHaveValue('pened')
    expect(selected()).toHaveFocus()
    expect(f.selection(selected())).toEqual({ start: 0, end: 1 })
    expect(screen.getByLabelText('Vim mode')).toHaveTextContent('NORMAL')

    await f.press(selected(), 'u')

    expect(roots()).toEqual(expected.map((node) => (node.text === 'pened' ? { ...node, text: 'Opened' } : node)))
    expect(selected()).toHaveValue('Opened')
  },
)
