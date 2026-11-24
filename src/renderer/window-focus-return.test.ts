// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest'
import { getSelectionEndpoints, setSelectionRange } from './editor-dom'
import { installWindowFocusReturn, isInitialFocusTarget } from './window-focus-return'

let stop: (() => void) | undefined

afterEach(() => {
  stop?.()
  stop = undefined
  document.body.replaceChildren()
})

function layout(): { topLevel: HTMLButtonElement; editor: HTMLTextAreaElement; other: HTMLTextAreaElement } {
  const topLevel = document.createElement('button')
  topLevel.textContent = 'Top level'
  const editor = document.createElement('textarea')
  editor.className = 'node-input'
  editor.value = 'alpha beta'
  const other = document.createElement('textarea')
  other.className = 'node-input'
  other.value = 'gamma'
  document.body.append(topLevel, editor, other)
  stop = installWindowFocusReturn(window)
  return { topLevel, editor, other }
}

function leaveWindow(): void {
  window.dispatchEvent(new FocusEvent('blur'))
}

function returnToWindow(initialFocus?: HTMLElement): void {
  initialFocus?.focus()
  window.dispatchEvent(new FocusEvent('focus'))
}

it.each([false, true])('returns to the left editor and its selection after initial focus (rich: %s)', (rich) => {
  const { topLevel } = layout()
  const editor = document.createElement(rich ? 'div' : 'textarea')
  editor.className = 'node-input'
  editor.tabIndex = 0
  if (editor instanceof HTMLTextAreaElement) editor.value = 'alpha beta'
  else editor.textContent = 'alpha beta'
  document.body.append(editor)
  editor.focus()
  setSelectionRange(editor, 7, 6)
  leaveWindow()

  if (rich) getSelection()?.removeAllRanges()
  returnToWindow(topLevel)

  expect(document.activeElement).toBe(editor)
  expect(getSelectionEndpoints(editor)).toEqual({ anchor: 7, focus: 6 })
})

it('does not refocus an element that kept focus', () => {
  const { editor } = layout()
  editor.focus()
  let focusEvents = 0
  editor.addEventListener('focus', () => focusEvents++)
  leaveWindow()

  returnToWindow()

  expect(document.activeElement).toBe(editor)
  expect(focusEvents).toBe(0)
})

it('keeps a different element that the application focused while the window was inactive', () => {
  const { editor, other } = layout()
  editor.focus()
  leaveWindow()

  returnToWindow(other)

  expect(document.activeElement).toBe(other)
})

it('returns to the left control within an open modal dialog', () => {
  const { editor } = layout()
  editor.focus()
  const dialog = document.createElement('dialog')
  dialog.setAttribute('open', '')
  const link = document.createElement('a')
  link.href = 'https://example.com'
  const close = document.createElement('button')
  dialog.append(link, close)
  document.body.append(dialog)
  close.focus()
  leaveWindow()

  returnToWindow(link)

  expect(document.activeElement).toBe(close)
})

it('returns within a modal prompt that precedes another open dialog in tree order', () => {
  const { editor } = layout()
  const prompt = document.createElement('dialog')
  prompt.setAttribute('open', '')
  const quit = document.createElement('button')
  const cancel = document.createElement('button')
  prompt.append(quit, cancel)
  editor.after(prompt)
  const about = document.createElement('dialog')
  about.setAttribute('open', '')
  about.append(document.createElement('button'))
  document.body.append(about)
  cancel.focus()
  leaveWindow()

  returnToWindow(quit)

  expect(document.activeElement).toBe(cancel)
})

it('returns to no focus when nothing was focused', () => {
  const { topLevel } = layout()
  leaveWindow()

  returnToWindow(topLevel)

  expect(document.activeElement).toBe(document.body)
})

it('keeps the initial focus when the left element was removed', () => {
  const { topLevel, editor } = layout()
  editor.focus()
  leaveWindow()
  editor.remove()

  returnToWindow(topLevel)

  expect(document.activeElement).toBe(topLevel)
})

it('acts only on the return that follows a departure and stops when disposed', () => {
  const { topLevel, editor } = layout()
  editor.focus()
  topLevel.focus()

  returnToWindow()

  expect(document.activeElement).toBe(topLevel)

  editor.focus()
  leaveWindow()
  stop?.()
  stop = undefined
  returnToWindow(topLevel)

  expect(document.activeElement).toBe(topLevel)
})

it('recognizes only the first enabled, non-inert, sequentially focusable element', () => {
  const skipped = document.createElement('div')
  skipped.tabIndex = -1
  const disabled = document.createElement('button')
  disabled.disabled = true
  const inert = document.createElement('div')
  inert.setAttribute('inert', '')
  const inertButton = document.createElement('button')
  inert.append(inertButton)
  const plain = document.createElement('span')
  const first = document.createElement('input')
  const second = document.createElement('button')
  document.body.append(skipped, disabled, inert, plain, first, second)

  const recognized = [skipped, disabled, inertButton, first, second, document.body].filter((element) =>
    isInitialFocusTarget(document, element),
  )

  expect(recognized).toEqual([first])
})

it('recognizes the body when nothing is focusable', () => {
  document.body.append(document.createElement('span'))

  expect(isInitialFocusTarget(document, document.body)).toBe(true)
})
