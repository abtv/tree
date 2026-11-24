// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { createBlankPressFocus, keepsEditorFocusOnPress } from './blank-press-focus'

afterEach(() => {
  document.body.replaceChildren()
})

function page(): { editor: HTMLTextAreaElement; row: HTMLElement; shell: HTMLElement; agendaRow: HTMLElement } {
  const shell = document.createElement('section')
  shell.className = 'editor-shell'
  const row = document.createElement('div')
  row.className = 'node-row'
  const editor = document.createElement('textarea')
  editor.className = 'node-input'
  row.append(editor)
  const agendaRow = document.createElement('div')
  agendaRow.className = 'agenda-row'
  agendaRow.tabIndex = 0
  shell.append(row, agendaRow)
  document.body.append(shell)
  return { editor, row, shell, agendaRow }
}

function press(target: Element, { button = 0, clientX = 10, clientY = 10 } = {}) {
  return { target, button, clientX, clientY }
}

it('keeps a focused node editor or Agenda row through a press on a blank area', () => {
  const { editor, row, shell, agendaRow } = page()

  expect(keepsEditorFocusOnPress(press(shell), editor)).toBe(true)
  expect(keepsEditorFocusOnPress(press(row), editor)).toBe(true)
  expect(keepsEditorFocusOnPress(press(shell), agendaRow)).toBe(true)
})

it('keeps focus through a press on decorative SVG', () => {
  const { editor, shell } = page()
  const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  icon.append(path)
  shell.append(icon)

  expect(keepsEditorFocusOnPress(press(path), editor)).toBe(true)
})

it('handles primary and secondary presses only', () => {
  const { editor, shell } = page()

  expect([0, 1, 2, 3].map((button) => keepsEditorFocusOnPress(press(shell, { button }), editor))).toEqual([
    true,
    false,
    true,
    false,
  ])
})

it('leaves focus outside the editor to the default press behavior', () => {
  const { shell } = page()
  const input = document.createElement('input')
  document.body.append(input)

  expect(keepsEditorFocusOnPress(press(shell), input)).toBe(false)
  expect(keepsEditorFocusOnPress(press(shell), document.body)).toBe(false)
  expect(keepsEditorFocusOnPress(press(shell), null)).toBe(false)
})

it.each([
  ['a node editor', '<div class="node-input"><span>x</span></div>'],
  ['a button', '<button><span>x</span></button>'],
  ['a link', '<a href="https://example.com"><span>x</span></a>'],
  ['a text field', '<input>'],
  ['a label', '<label><span>x</span></label>'],
  ['an Agenda row', '<div class="agenda-row"><span>x</span></div>'],
  ['a dialog', '<div role="dialog"><span>x</span></div>'],
  ['a status message', '<span role="status"><span>x</span></span>'],
  ['an error message', '<span role="alert"><span>x</span></span>'],
  ['a status-bar message', '<span class="status-bar-message"><span>x</span></span>'],
  ['a focusable element', '<div tabindex="-1"><span>x</span></div>'],
])('keeps the native press for %s', (_name, markup) => {
  const { editor, shell } = page()
  const host = document.createElement('div')
  host.innerHTML = markup
  shell.append(host)
  const target = host.querySelector('span') ?? host.firstElementChild!

  expect(keepsEditorFocusOnPress(press(target), editor)).toBe(false)
})

it('keeps the native press on a classic scrollbar of a scrolling element', () => {
  const { editor, shell } = page()
  shell.style.overflowY = 'auto'
  shell.style.overflowX = 'hidden'
  Object.defineProperties(shell, {
    clientLeft: { value: 0 },
    clientTop: { value: 0 },
    clientWidth: { value: 785 },
    clientHeight: { value: 600 },
  })
  shell.getBoundingClientRect = () => new DOMRect(0, 0, 800, 600)

  expect(keepsEditorFocusOnPress(press(shell, { clientX: 790, clientY: 300 }), editor)).toBe(false)
  expect(keepsEditorFocusOnPress(press(shell, { clientX: 780, clientY: 300 }), editor)).toBe(true)
  expect(keepsEditorFocusOnPress(press(shell, { clientX: 400, clientY: 599 }), editor)).toBe(true)
})

it('does not treat a non-scrolling element without a client box as a scrollbar', () => {
  const { editor, shell } = page()
  const text = document.createElement('span')
  shell.append(text)
  text.getBoundingClientRect = () => new DOMRect(10, 10, 40, 16)

  expect(keepsEditorFocusOnPress(press(text, { clientX: 20, clientY: 15 }), editor)).toBe(true)
})

function focusedSelection(): { editor: HTMLTextAreaElement; shell: HTMLElement } {
  const { editor, shell } = page()
  editor.value = 'alpha'
  editor.focus()
  editor.setSelectionRange(1, 3)
  return { editor, shell }
}

function mousedown(target: Element, button = 0) {
  return { ...press(target, { button }), preventDefault: vi.fn() }
}

it('prevents a blank press and returns the selection that its context menu moved on release', () => {
  const { editor, shell } = focusedSelection()
  const focus = createBlankPressFocus()
  const event = mousedown(shell, 2)

  focus.press(event)
  focus.contextMenu()
  editor.setSelectionRange(0, 0)
  focus.settle()

  expect(event.preventDefault).toHaveBeenCalledOnce()
  expect(document.activeElement).toBe(editor)
  expect([editor.selectionStart, editor.selectionEnd]).toEqual([1, 3])
})

it('leaves later selection changes alone when no context menu followed the press', () => {
  const { editor, shell } = focusedSelection()
  const focus = createBlankPressFocus()

  focus.press(mousedown(shell))
  editor.setSelectionRange(4, 4)
  focus.settle()

  expect([editor.selectionStart, editor.selectionEnd]).toEqual([4, 4])
})

it('completes a pending return before the next press captures the selection', () => {
  const { editor, shell } = focusedSelection()
  const focus = createBlankPressFocus()

  focus.press(mousedown(shell, 2))
  focus.contextMenu()
  editor.setSelectionRange(0, 0)
  focus.press(mousedown(shell, 2))
  focus.contextMenu()
  editor.setSelectionRange(0, 0)
  focus.settle()

  expect([editor.selectionStart, editor.selectionEnd]).toEqual([1, 3])
})

it('drops a pending return when focus moved elsewhere before it settles', () => {
  const { editor, shell } = focusedSelection()
  const focus = createBlankPressFocus()
  const find = document.createElement('input')
  document.body.append(find)

  focus.press(mousedown(shell, 2))
  focus.contextMenu()
  editor.setSelectionRange(0, 0)
  find.focus()
  focus.settle()

  expect(document.activeElement).toBe(find)
  expect([editor.selectionStart, editor.selectionEnd]).toEqual([0, 0])
})

it('neither prevents nor returns a press that does not keep editor focus', () => {
  const { editor } = focusedSelection()
  const focus = createBlankPressFocus()
  const button = document.createElement('button')
  document.body.append(button)
  const event = mousedown(button, 2)

  focus.press(event)
  focus.contextMenu()
  editor.setSelectionRange(0, 0)
  focus.settle()

  expect(event.preventDefault).not.toHaveBeenCalled()
  expect([editor.selectionStart, editor.selectionEnd]).toEqual([0, 0])
})
