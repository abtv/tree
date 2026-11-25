// @vitest-environment jsdom
import { fireEvent, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { createAppHarness } from './test/app-harness'

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
it.each([false, true])('does not block spaces in text entry (Vim enabled: %s)', async (vimEnabled) => {
  const f = await createAppHarness({ vimEnabled })
  const input = screen.getByRole('textbox', { name: 'Node 1' })
  if (vimEnabled) await f.press(input, 'A')

  expect(fireEvent.keyDown(input, { key: ' ' })).toBe(true)
  expect(fireEvent.keyDown(input, { key: ' ' })).toBe(true)

  expect(screen.queryByRole('searchbox')).toBeNull()
})
