// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { captureFocusRestoration, getSelectionEndpoints, setSelectionRange } from './editor-dom'

afterEach(() => {
  document.body.replaceChildren()
  vi.restoreAllMocks()
})

it.each([
  { rich: false, anchor: 0, focus: 0, text: '' },
  { rich: false, anchor: 1, focus: 4, text: 'hello' },
  { rich: false, anchor: 4, focus: 1, text: 'hello' },
  { rich: true, anchor: 1, focus: 4, text: 'hello' },
  { rich: true, anchor: 4, focus: 1, text: 'hello' },
  { rich: true, anchor: 5, focus: 5, text: 'hello' },
])('restores logical editor selection after decoration ($rich, $anchor → $focus)', ({ rich, anchor, focus, text }) => {
  const editor = document.createElement(rich ? 'div' : 'textarea')
  editor.className = 'node-input'
  editor.tabIndex = 0
  if (editor instanceof HTMLTextAreaElement) editor.value = text
  else editor.textContent = text
  const other = document.createElement('button')
  document.body.append(editor, other)
  editor.focus()
  setSelectionRange(editor, anchor, focus)
  const restore = captureFocusRestoration()

  other.focus()
  if (rich) editor.innerHTML = `<span>${text}</span>`
  else (editor as HTMLTextAreaElement).setSelectionRange(0, 0)
  restore()

  expect(document.activeElement).toBe(editor)
  expect(getSelectionEndpoints(editor)).toEqual({ anchor, focus })
})

it.each(['textarea', 'input'] as const)('restores native %s selection across repeated returns', (tag) => {
  const control = document.createElement(tag)
  control.value = 'example'
  document.body.append(control)
  control.focus()
  control.setSelectionRange(1, 5, 'backward')
  const restore = captureFocusRestoration(control, 'native-with-input')

  control.setSelectionRange(0, 0)
  restore()
  restore()

  expect([control.selectionStart, control.selectionEnd, control.selectionDirection]).toEqual([1, 5, 'backward'])
})

it('retains the narrower editor and command-panel control scopes', () => {
  const input = document.createElement('input')
  input.value = 'example'
  document.body.append(input)
  input.focus()
  input.setSelectionRange(1, 5, 'backward')
  const editorReturn = captureFocusRestoration(input)
  const commandReturn = captureFocusRestoration(input, 'native')

  input.setSelectionRange(2, 2)
  editorReturn()
  commandReturn()

  expect([input.selectionStart, input.selectionEnd]).toEqual([2, 2])
})

it('restores native document selection only while its original endpoints remain connected', () => {
  const editor = document.createElement('div')
  editor.tabIndex = 0
  editor.textContent = 'example'
  document.body.append(editor)
  editor.focus()
  const text = editor.firstChild!
  const selection = window.getSelection()!
  selection.setBaseAndExtent(text, 5, text, 1)
  const restore = captureFocusRestoration(editor, 'native')

  selection.collapse(text, 0)
  restore()

  expect([selection.anchorNode, selection.anchorOffset, selection.focusNode, selection.focusOffset]).toEqual([
    text,
    5,
    text,
    1,
  ])

  editor.textContent = 'replacement'

  expect(restore).not.toThrow()
  expect(selection.anchorNode).not.toBe(text)
})

it('ignores a disconnected origin and leaves the new focus destination alone', () => {
  const origin = document.createElement('textarea')
  const destination = document.createElement('button')
  document.body.append(origin, destination)
  origin.focus()
  const restore = captureFocusRestoration()

  origin.remove()
  destination.focus()
  restore()

  expect(document.activeElement).toBe(destination)
})

it('restores a readonly Agenda row without projecting an editor selection', () => {
  const row = document.createElement('div')
  row.className = 'agenda-row'
  row.tabIndex = 0
  document.body.append(row)
  const restore = captureFocusRestoration(row)
  const selection = vi.spyOn(window.getSelection()!, 'setBaseAndExtent')

  restore()

  expect(document.activeElement).toBe(row)
  expect(selection).not.toHaveBeenCalled()
  expect(() => captureFocusRestoration(null)()).not.toThrow()
})
