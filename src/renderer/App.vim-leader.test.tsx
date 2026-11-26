// @vitest-environment jsdom
import { createEvent, fireEvent, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { createAppHarness, settleApp } from './test/app-harness'

/** jsdom stamps events with real time, so a test that crosses the Leader deadline sets the stamp. */
function keyDownAt(element: HTMLElement, key: string, timeStamp: number): void {
  const event = createEvent.keyDown(element, { key })
  Object.defineProperty(event, 'timeStamp', { value: timeStamp })

  fireEvent(element, event)
}

// @requirement PRODUCT.md §20.2.32
// @requirement PRODUCT.md §20.2.27
it('leaves Space to the input method until composition ends', async () => {
  const f = await createAppHarness({ vimEnabled: true })
  const input = screen.getByRole('textbox', { name: 'Node 1' })
  fireEvent.compositionStart(input)

  await f.press(input, ' ')
  await f.press(input, ' ')

  expect(screen.queryByRole('searchbox')).toBeNull()

  fireEvent.compositionEnd(input)
  await f.press(input, ' ')
  await f.press(input, ' ')

  expect(screen.getByRole('searchbox')).toBe(document.activeElement)
})

// @requirement PRODUCT.md §20.2.32
it.each(['focus change', 'pointer press'] as const)('discards Leader after a %s', async (interruption) => {
  const f = await createAppHarness({
    vimEnabled: true,
    document: {
      roots: [
        { id: 'first', text: 'one', children: [] },
        { id: 'second', text: 'two', children: [] },
      ],
    },
  })
  const first = screen.getByRole('textbox', { name: 'Node 1' })
  await f.press(first, ' ')
  await f.press(first, 't')

  if (interruption === 'focus change') await f.focus(screen.getByRole('textbox', { name: 'Node 2' }))
  else fireEvent.pointerDown(first)
  const focused = document.activeElement as HTMLElement
  await f.press(focused, 'm')

  expect(f.node('first').marked).not.toBe(true)
  expect(f.node('second').marked).not.toBe(true)
})

// @requirement PRODUCT.md §20.2.32
it.each([[[' ']], [[' ', 't']]] as const)('discards a colon that follows the unfinished Leader %j', async (prefix) => {
  const f = await createAppHarness({ vimEnabled: true })
  const input = screen.getByRole('textbox', { name: 'Node 1' })
  for (const key of prefix) await f.press(input, key)

  await f.press(input, ':', { shiftKey: true })

  expect(screen.queryByRole('combobox', { name: 'Command' })).toBeNull()

  await f.press(input, ':', { shiftKey: true })

  expect(screen.queryByRole('combobox', { name: 'Command' })).not.toBeNull()
})

// @requirement PRODUCT.md §20.2.32
it('opens the command panel with a colon after the Leader expired', async () => {
  await createAppHarness({ vimEnabled: true })
  const input = screen.getByRole('textbox', { name: 'Node 1' })
  keyDownAt(input, ' ', 1_000)
  await settleApp()

  keyDownAt(input, ':', 3_001)
  await settleApp()

  expect(screen.queryByRole('combobox', { name: 'Command' })).not.toBeNull()
})

// @requirement PRODUCT.md §20.2.32
it('cancels the unfinished Leader when a shortcut with a modifier key runs', async () => {
  const setLineNumbers = vi.fn(async () => undefined)
  Object.assign(window.treeApi, { setLineNumbers })
  const f = await createAppHarness({
    vimEnabled: true,
    document: { roots: [{ id: 'first', text: 'one', children: [] }] },
  })
  const input = screen.getByRole('textbox', { name: 'Node 1' })
  await f.press(input, ' ')

  await f.press(input, 'l', { ctrlKey: true })
  await f.press(input, 't')
  await f.press(input, 'm')

  expect(setLineNumbers).toHaveBeenCalledWith(true)
  expect(f.node('first').marked).not.toBe(true)
})

// @requirement PRODUCT.md §20.2.32
it.each([false, true])('does not block spaces in text entry (Vim enabled: %s)', async (vimEnabled) => {
  const f = await createAppHarness({ vimEnabled })
  const input = screen.getByRole('textbox', { name: 'Node 1' })
  if (vimEnabled) await f.press(input, 'A')

  expect(fireEvent.keyDown(input, { key: ' ' })).toBe(true)
  expect(fireEvent.keyDown(input, { key: ' ' })).toBe(true)

  expect(screen.queryByRole('searchbox')).toBeNull()
})
