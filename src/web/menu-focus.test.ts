// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { installMenuFocus } from './menu-focus'
import { getSelectionEndpoints, setSelectionRange } from '../renderer/editor-dom'

afterEach(() => {
  window.dispatchEvent(new Event('pagehide'))
  document.body.replaceChildren()
})

function fixture(rich = false) {
  const editor = document.createElement(rich ? 'div' : 'textarea')
  editor.className = 'node-input'
  editor.tabIndex = 0
  if (editor instanceof HTMLTextAreaElement) editor.value = 'alpha beta'
  else editor.innerHTML = 'alpha <a>beta</a>'
  const trigger = document.createElement('button')
  const menu = document.createElement('div')
  const item = document.createElement('button')
  menu.append(item)
  document.body.append(editor, trigger, menu)
  const focus = installMenuFocus(menu, trigger)
  menu.hidePopover = vi.fn(() => {
    menu.dispatchEvent(Object.assign(new Event('beforetoggle'), { newState: 'closed' }))
    if (menu.contains(document.activeElement)) trigger.focus()
  })
  const open = () => {
    trigger.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    trigger.focus()
    menu.dispatchEvent(Object.assign(new Event('beforetoggle'), { newState: 'open' }))
    item.focus()
  }
  return { editor, trigger, menu, item, focus, open }
}

// @requirement PRODUCT.md §1.4
it.each([false, true])('restores backward selection after Escape (rich=%s)', async (rich) => {
  const f = fixture(rich)
  f.editor.focus()
  setSelectionRange(f.editor, 8, 2)

  f.open()
  f.item.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))

  expect(document.activeElement).toBe(f.editor)
  expect(getSelectionEndpoints(f.editor)).toEqual({ anchor: 8, focus: 2 })

  await Promise.resolve()

  expect(document.activeElement).toBe(f.editor)
})

it('restores before dispatch, leaves a following dialog alone, and ignores hidden-menu commands', async () => {
  const f = fixture()
  f.editor.focus()

  f.open()
  f.focus.close()

  expect(document.activeElement).toBe(f.editor)

  const dialog = document.createElement('button')
  document.body.append(dialog)
  dialog.focus()
  await Promise.resolve()

  expect(document.activeElement).toBe(dialog)

  f.focus.close()

  expect(document.activeElement).toBe(dialog)
})

it('keeps explicit outside focus and never restores a detached editor or disposed snapshot', async () => {
  const f = fixture()
  f.editor.focus()

  f.open()
  const other = document.createElement('button')
  document.body.append(other)
  other.focus()
  await Promise.resolve()

  expect(document.activeElement).toBe(other)

  f.editor.focus()

  f.open()
  f.editor.remove()
  f.focus.close()

  expect(document.activeElement).toBe(f.trigger)

  f.focus.dispose()
  await Promise.resolve()

  expect(document.activeElement).toBe(f.trigger)
})

it.each([0, 5, 10])('keeps a collapsed caret at %s and preserves native Tab', (offset) => {
  const f = fixture()
  f.editor.focus()
  setSelectionRange(f.editor, offset, offset)

  f.open()

  expect(f.item.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }))).toBe(true)

  f.focus.close()

  expect(getSelectionEndpoints(f.editor)).toEqual({ anchor: offset, focus: offset })
})
