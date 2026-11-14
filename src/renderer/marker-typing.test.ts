// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { createTextEditHandlers } from './node-input-text-handlers'
import { createRealStoreHarness } from './test/real-store-harness'
import { createVimEditSessionState } from './vim-edit-session'
import { createVimCommandState } from './vim-command-state'
import { getCaret, setCaret } from './editor-dom'
import type { LinkRange } from '../domain/document'

afterEach(() => document.body.replaceChildren())

async function fixture(text: string, links: readonly LinkRange[] = []) {
  const harness = await createRealStoreHarness({ document: { roots: [{ id: 'n', text, links, children: [] }] } })
  let composing = false
  const schedulePendingCaret = vi.fn()
  const session = createVimEditSessionState()
  const commandState = createVimCommandState()
  const handlers = () =>
    createTextEditHandlers(
      {
        store: harness.store,
        composing,
        pendingLinkDraft: { current: undefined },
        schedulePendingCaret,
        getMode: () => 'insert',
        session,
        commandState,
        finishVimReplace: () => false,
        setComposing: (value) => {
          composing = value
        },
      },
      harness.node('n'),
    )
  return { ...harness, handlers, schedulePendingCaret }
}

// @requirement PRODUCT.md §20.13
it.each(['plain', 'rich'] as const)('normalizes only the native typed range in a %s editor', async (kind) => {
  const f = await fixture('#OldName tail')
  const input = document.createElement(kind === 'plain' ? 'textarea' : 'div')
  document.body.append(input)
  input.focus()
  if (input instanceof HTMLTextAreaElement) input.value = '#OldWName tail'
  else input.textContent = '#OldWName tail'
  setCaret(input, 5)
  const event = { currentTarget: input, nativeEvent: { inputType: 'insertText', data: 'W' } }

  if (kind === 'plain') f.handlers().onTextChange(event as never)
  else f.handlers().onContentInput(event as never)

  expect(f.node('n').text).toBe('#OldwName tail')
  if (kind === 'plain') expect(getCaret(input)).toBe(5)
  else expect(f.schedulePendingCaret).toHaveBeenCalledWith(expect.objectContaining({ cursor: 5 }))

  f.store.undo()

  expect(f.node('n').text).toBe('#OldName tail')

  f.store.redo()

  expect(f.node('n').text).toBe('#OldwName tail')
})

// @requirement PRODUCT.md §20.13
it.each(['insertFromPaste', 'insertReplacementText', 'historyUndo', undefined])(
  'preserves uppercase text from %s rather than treating it as typing',
  async (inputType) => {
    const f = await fixture('#')
    const input = document.createElement('textarea')
    input.value = '#Work'
    input.setSelectionRange(5, 5)

    f.handlers().onTextChange({ currentTarget: input, nativeEvent: { inputType, data: 'Work' } } as never)

    expect(f.node('n').text).toBe('#Work')
  },
)

// @requirement PRODUCT.md §20.13
it('preserves rich paste and hyperlink text', async () => {
  const f = await fixture('@ https://x.test/#WORK', [{ start: 2, end: 22, url: 'https://x.test/#WORK' }])
  const input = document.createElement('div')
  input.contentEditable = 'true'
  input.innerHTML = '@Anna <a href="https://x.test/#WORK">https://x.test/#WORK</a>'
  document.body.append(input)
  input.focus()
  setCaret(input, 5)

  f.handlers().onContentInput({
    currentTarget: input,
    nativeEvent: { inputType: 'insertFromPaste', data: 'Anna' },
  } as never)

  expect(f.node('n').text).toBe('@Anna https://x.test/#WORK')
  expect(f.node('n').links).toEqual([{ start: 6, end: 26, url: 'https://x.test/#WORK' }])
})

// @requirement PRODUCT.md §20.13
it.each(['plain', 'rich'] as const)('waits for composition commitment in a %s editor', async (kind) => {
  const f = await fixture('&Old')
  const input = document.createElement(kind === 'plain' ? 'textarea' : 'div')
  input.contentEditable = 'true'
  document.body.append(input)
  input.focus()
  f.handlers().onCompositionStart({ currentTarget: input } as never)
  if (input instanceof HTMLTextAreaElement) input.value = '&OldW'
  else input.textContent = '&OldW'
  setCaret(input, 5)
  const event = {
    currentTarget: input,
    nativeEvent: { inputType: 'insertCompositionText', data: 'W', isComposing: true },
  }

  if (kind === 'plain') f.handlers().onTextChange(event as never)
  else f.handlers().onContentInput(event as never)

  expect(f.node('n').text).toBe('&OldW')

  f.handlers().onCompositionEnd({ currentTarget: input, data: 'W' } as never)

  expect(f.node('n').text).toBe('&Oldw')
  expect(f.schedulePendingCaret).toHaveBeenLastCalledWith(expect.objectContaining({ cursor: 5 }))
})

// @requirement PRODUCT.md §20.13
it('projects the expanded UTF-16 cursor after Unicode lowercasing', async () => {
  const f = await fixture('# End')
  const input = document.createElement('textarea')
  input.value = '#İ End'
  input.setSelectionRange(2, 2)

  f.handlers().onTextChange({ currentTarget: input, nativeEvent: { inputType: 'insertText', data: 'İ' } } as never)

  expect(f.node('n').text).toBe('#i\u0307 End')
  expect(input.selectionStart).toBe(3)
})
