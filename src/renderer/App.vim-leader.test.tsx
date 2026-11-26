// @vitest-environment jsdom
import { act, createEvent, fireEvent, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import type { AppearancePreference } from '../shared/appearance'
import { createAppHarness, settleApp } from './test/app-harness'

/** jsdom stamps events with real time, so a test that crosses the Leader deadline sets the stamp. */
function keyDownAt(element: HTMLElement, key: string, timeStamp: number): void {
  const event = createEvent.keyDown(element, { key })
  Object.defineProperty(event, 'timeStamp', { value: timeStamp })

  fireEvent(element, event)
}

// @requirement PRODUCT.md §20.14
it('cancels a queued Help Find jump when borrowing focus for notes Search', async () => {
  const f = await createAppHarness({ vimEnabled: true })
  const input = screen.getByRole('textbox', { name: 'Node 1' })
  for (const key of [' ', 'h', 'h']) await f.press(input, key)
  const heading = screen.getByRole('heading', { name: 'Vim shortcuts' })
  expect(heading).toHaveFocus()
  await f.press(heading, '/')
  const find = screen.getByRole('textbox', { name: 'Search' })
  fireEvent.change(find, { target: { value: 'Toggle mark' } })

  // Confirm schedules the jump. Do not advance the search scheduler before opening global Search.
  fireEvent.keyDown(find, { key: 'Enter' })
  fireEvent.keyDown(heading, { key: ';', metaKey: true })
  await settleApp()
  const search = screen.getByRole('searchbox', { name: 'Search query' })
  expect(search).toHaveFocus()
  await f.press(search, 'Escape')

  expect(heading).toHaveFocus()
  expect(heading).toHaveAttribute('tabindex', '0')
  await f.press(heading, '/')
  expect(screen.getByRole('textbox', { name: 'Search' })).toHaveValue('Toggle mark')
})

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

// @requirement PRODUCT.md §20.2.27
it('does not let the command panel claim a colon from a composing editor', async () => {
  const f = await createAppHarness({ vimEnabled: true })
  const input = screen.getByRole('textbox', { name: 'Node 1' })
  fireEvent.compositionStart(input)

  await f.press(input, ':', { shiftKey: true, isComposing: false })

  expect(screen.queryByRole('combobox', { name: 'Command' })).toBeNull()

  fireEvent.compositionEnd(input)
  await f.press(input, ':', { shiftKey: true })

  expect(screen.getByRole('combobox', { name: 'Command' })).toBe(document.activeElement)
})

// @requirement PRODUCT.md §20.14
it('keeps the composing editor focused when Global Search receives its shortcut', async () => {
  const f = await createAppHarness({ vimEnabled: true })
  const input = screen.getByRole('textbox', { name: 'Node 1' })
  fireEvent.compositionStart(input)

  await f.press(input, ';', { metaKey: true, isComposing: false })

  expect(screen.queryByRole('searchbox')).toBeNull()
  expect(input).toBe(document.activeElement)

  fireEvent.compositionEnd(input)
  await f.press(input, ';', { metaKey: true })

  expect(screen.getByRole('searchbox')).toBe(document.activeElement)
})

// @requirement PRODUCT.md §20.2.27
// @requirement PRODUCT.md §20.2.32
it('does not carry an abandoned composition between focused editors', async () => {
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
  const second = screen.getByRole('textbox', { name: 'Node 2' })
  await f.focus(first)
  fireEvent.compositionStart(first)

  await f.focus(second)
  await f.focus(first)
  await f.press(first, ' ')
  await f.press(first, ' ')

  expect(screen.getByRole('searchbox')).toBe(document.activeElement)
})

// @requirement PRODUCT.md §20.2.27
// @requirement PRODUCT.md §20.2.32
it('runs Leader on the newly decorated editor after composition commits without another text update', async () => {
  const f = await createAppHarness({ vimEnabled: true })
  const plain = screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'Node 1' })
  fireEvent.compositionStart(plain)
  fireEvent.change(plain, { target: { value: 'hello 2026-10-14' } })
  await settleApp()
  expect(screen.getByRole('textbox', { name: 'Node 1' })).toBe(plain)

  fireEvent.compositionEnd(plain, { data: '2026-10-14' })
  await settleApp()

  const decorated = screen.getByRole('textbox', { name: 'Node 1' })
  expect(decorated).not.toBe(plain)
  expect(decorated).toHaveFocus()
  await f.press(decorated, ' ')
  await f.press(decorated, ' ')
  expect(screen.getByRole('searchbox')).toHaveFocus()
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
it('keeps the menu appearance check after an earlier Leader write finishes', async () => {
  let finishWrite!: () => void
  let changeAppearance!: (value: AppearancePreference) => void
  const write = new Promise<void>((resolve) => {
    finishWrite = resolve
  })
  const setAppearance = vi.fn(() => write)
  Object.assign(window.treeApi, {
    setAppearance,
    onAppearanceChanged: (listen: typeof changeAppearance) => {
      changeAppearance = listen
      return () => undefined
    },
  })
  const f = await createAppHarness({ vimEnabled: true })
  const input = screen.getByRole('textbox', { name: 'Node 1' })
  const checkedAppearance = (value: string) =>
    screen.getByRole('option', { name: new RegExp(`set-appearance-${value}`) }).querySelector('.command-state')

  await f.press(input, ' ')
  await f.press(input, 't')
  await f.press(input, 't')
  expect(setAppearance).toHaveBeenCalledWith('dark')
  await act(async () => changeAppearance('white'))
  await f.press(input, ':', { shiftKey: true })
  fireEvent.change(screen.getByRole('combobox', { name: 'Command' }), { target: { value: 'set-appearance' } })
  expect(checkedAppearance('white')).toHaveTextContent('✓')

  await act(async () => finishWrite())

  expect(checkedAppearance('white')).toHaveTextContent('✓')
  expect(checkedAppearance('dark')).toBeEmptyDOMElement()
})

// @requirement PRODUCT.md §9
it('keeps a newer appearance notification if the startup read is delayed', async () => {
  let finishRead!: (value: AppearancePreference) => void
  let changeAppearance!: (value: AppearancePreference) => void
  const read = new Promise<AppearancePreference>((resolve) => {
    finishRead = resolve
  })
  Object.assign(window.treeApi, {
    getAppearance: () => read,
    onAppearanceChanged: (listen: typeof changeAppearance) => {
      changeAppearance = listen
      return () => undefined
    },
  })
  const f = await createAppHarness({ vimEnabled: true })
  const input = screen.getByRole('textbox', { name: 'Node 1' })

  await act(async () => changeAppearance('gray'))
  await act(async () => finishRead('system'))
  await f.press(input, ':', { shiftKey: true })
  fireEvent.change(screen.getByRole('combobox', { name: 'Command' }), { target: { value: 'set-appearance' } })

  const gray = screen.getByRole('option', { name: /set-appearance-gray/ }).querySelector('.command-state')
  const automatic = screen.getByRole('option', { name: /set-appearance-auto/ }).querySelector('.command-state')
  expect(gray).toHaveTextContent('✓')
  expect(automatic).toBeEmptyDOMElement()
})

// @requirement PRODUCT.md §9
it('shows a completed appearance write after the startup read when notifications are not available', async () => {
  let finishRead!: (value: AppearancePreference) => void
  let finishWrite!: () => void
  const read = new Promise<AppearancePreference>((resolve) => {
    finishRead = resolve
  })
  const write = new Promise<void>((resolve) => {
    finishWrite = resolve
  })
  const setAppearance = vi.fn(() => write)
  Object.assign(window.treeApi, { getAppearance: () => read, setAppearance })
  const f = await createAppHarness({ vimEnabled: true })
  const editor = screen.getByRole('textbox', { name: 'Node 1' })

  await f.press(editor, ':', { shiftKey: true })
  const command = screen.getByRole('combobox', { name: 'Command' })
  fireEvent.change(command, { target: { value: 'set-appearance-white' } })
  await f.press(command, 'Enter')
  expect(setAppearance).toHaveBeenCalledWith('white')
  await act(async () => finishRead('system'))
  await act(async () => finishWrite())

  await f.press(editor, ':', { shiftKey: true })
  fireEvent.change(screen.getByRole('combobox', { name: 'Command' }), { target: { value: 'set-appearance' } })
  const white = screen.getByRole('option', { name: /set-appearance-white/ }).querySelector('.command-state')
  expect(white).toHaveTextContent('✓')
})

// @requirement PRODUCT.md §20.2.32
it('does not apply a stale Leader appearance read over a newer menu choice', async () => {
  let finishRead!: (value: AppearancePreference) => void
  let changeAppearance!: (value: AppearancePreference) => void
  const read = new Promise<AppearancePreference>((resolve) => {
    finishRead = resolve
  })
  const getAppearance = vi
    .fn<() => Promise<AppearancePreference>>()
    .mockResolvedValueOnce('system')
    .mockImplementationOnce(() => read)
    .mockResolvedValue('white')
  const setAppearance = vi.fn(async () => undefined)
  Object.assign(window.treeApi, {
    getAppearance,
    setAppearance,
    onAppearanceChanged: (listen: typeof changeAppearance) => {
      changeAppearance = listen
      return () => undefined
    },
  })
  const f = await createAppHarness({ vimEnabled: true })
  const editor = screen.getByRole('textbox', { name: 'Node 1' })

  await f.press(editor, ' ')
  await f.press(editor, 't')
  await f.press(editor, 't')
  expect(getAppearance).toHaveBeenCalledTimes(2)
  await act(async () => changeAppearance('white'))
  await act(async () => finishRead('system'))

  expect(setAppearance).not.toHaveBeenCalled()

  await f.press(editor, ' ')
  await f.press(editor, 't')
  await f.press(editor, 't')

  expect(setAppearance).toHaveBeenCalledExactlyOnceWith('system')
})

// @requirement PRODUCT.md §20.2.32
it('discards Tab as a Leader continuation without indenting the focused node', async () => {
  const f = await createAppHarness({
    vimEnabled: true,
    document: {
      roots: [
        { id: 'first', text: 'one', children: [] },
        { id: 'second', text: 'two', children: [] },
      ],
    },
  })
  const input = screen.getByRole('textbox', { name: 'Node 2' })
  await f.focus(input)

  await f.press(input, ' ')
  await f.press(input, 'Tab')

  expect(f.node('first').children).toEqual([])

  await f.press(input, 'Tab')

  expect(f.node('first').children.map(({ id }) => id)).toEqual(['second'])
})

// @requirement PRODUCT.md §20.2.32
it.each([false, true])('does not let a held continuation repeat as an edit (window blur: %s)', async (blur) => {
  const f = await createAppHarness({ vimEnabled: true })
  const input = screen.getByRole('textbox', { name: 'Node 1' })
  await f.focus(input, 0)

  await f.press(input, ' ', { code: 'Space' })
  await f.press(input, 'x', { code: 'KeyX' })
  if (blur) fireEvent.blur(window)
  await f.press(input, 'x', { code: 'KeyX', repeat: true })

  expect(f.node('node').text).toBe('hello')

  // The release can go to the other window. A fresh press is still independent.
  if (!blur) fireEvent.keyUp(input, { key: 'x', code: 'KeyX' })
  await f.press(input, 'x', { code: 'KeyX' })

  expect(f.node('node').text).toBe('ello')
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
