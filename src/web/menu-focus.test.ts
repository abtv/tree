// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { installMenuFocus } from './menu-focus'
import { getSelectionEndpoints, setSelectionRange } from '../renderer/editor-dom'

afterEach(() => {
  window.dispatchEvent(new Event('pagehide'))
  vi.restoreAllMocks()
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

it('preserves a new caret when an explicit command focuses the original editor', async () => {
  const f = fixture()
  f.editor.focus()
  setSelectionRange(f.editor, 8, 8)
  f.open()
  setSelectionRange(f.editor, 2, 2)

  f.editor.focus()
  await Promise.resolve()

  expect(f.menu.hidePopover).toHaveBeenCalledOnce()
  expect(document.activeElement).toBe(f.editor)
  expect(getSelectionEndpoints(f.editor)).toEqual({ anchor: 2, focus: 2 })
})

it('restores the editor when native dismissal leaves focus temporarily inside the menu', async () => {
  const f = fixture()
  f.editor.focus()
  setSelectionRange(f.editor, 3, 6)
  f.open()

  f.menu.dispatchEvent(Object.assign(new Event('beforetoggle'), { newState: 'closed' }))
  await Promise.resolve()

  expect(document.activeElement).toBe(f.editor)
  expect(getSelectionEndpoints(f.editor)).toEqual({ anchor: 3, focus: 6 })
})

it('removes active menu event handlers when disposed before the menu closes', async () => {
  const f = fixture()
  f.editor.focus()
  f.open()

  f.focus.dispose()
  const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
  f.item.dispatchEvent(escape)
  document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }))
  f.editor.focus()
  await Promise.resolve()

  expect(escape.defaultPrevented).toBe(false)
  expect(f.menu.hidePopover).not.toHaveBeenCalled()
  expect(document.activeElement).toBe(f.editor)
})

it('opens and closes without an editor snapshot', async () => {
  const f = fixture()

  f.open()
  f.focus.close()
  await Promise.resolve()

  expect(document.activeElement).toBe(f.trigger)
  expect(f.menu.hidePopover).toHaveBeenCalledOnce()
})

it('remembers the editor when the menu opens without a trigger press', () => {
  const f = fixture()
  f.editor.focus()
  setSelectionRange(f.editor, 6, 2)

  f.menu.dispatchEvent(Object.assign(new Event('beforetoggle'), { newState: 'open' }))
  f.item.focus()
  f.focus.close()

  expect(document.activeElement).toBe(f.editor)
  expect(getSelectionEndpoints(f.editor)).toEqual({ anchor: 6, focus: 2 })
})

it('ignores outside presses while closed and permits departure without an editor snapshot', () => {
  const f = fixture()
  const errors: unknown[] = []
  const onError = (event: ErrorEvent) => {
    event.preventDefault()
    errors.push(event.error)
  }
  window.addEventListener('error', onError)
  try {
    const destination = document.createElement('button')
    document.body.append(destination)

    destination.dispatchEvent(new Event('pointerdown', { bubbles: true }))

    expect(f.menu.hidePopover).not.toHaveBeenCalled()

    f.open()
    destination.focus()

    expect(document.activeElement).toBe(destination)
    expect(f.menu.hidePopover).toHaveBeenCalledOnce()
    expect(errors).toEqual([])
  } finally {
    window.removeEventListener('error', onError)
  }
})

it('dismisses an outside press even when there is no editor to restore', () => {
  const f = fixture()
  f.open()

  document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }))

  expect(f.menu.hidePopover).toHaveBeenCalledOnce()
})

it('disposes the menu automatically when the page is hidden', async () => {
  const f = fixture()
  f.editor.focus()
  f.open()

  window.dispatchEvent(new Event('pagehide'))
  f.item.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  f.menu.dispatchEvent(Object.assign(new Event('beforetoggle'), { newState: 'closed' }))
  f.focus.restore()
  await Promise.resolve()

  expect(document.activeElement).toBe(f.item)
  expect(f.menu.hidePopover).not.toHaveBeenCalled()
})

it('keeps disposed handlers inert after new focus and popover events', () => {
  const f = fixture()
  f.focus.dispose()
  f.editor.focus()
  f.trigger.focus()
  f.menu.dispatchEvent(Object.assign(new Event('beforetoggle'), { newState: 'open' }))

  f.focus.close()
  f.focus.restore()

  expect(document.activeElement).toBe(f.trigger)
  expect(f.menu.hidePopover).not.toHaveBeenCalled()
})

it('remembers selection when keyboard focus leaves the editor for the menu trigger', () => {
  const f = fixture()
  f.editor.focus()
  setSelectionRange(f.editor, 7, 3)
  f.editor.addEventListener('focusout', (event) => event.stopPropagation())

  f.trigger.focus()
  f.menu.dispatchEvent(Object.assign(new Event('beforetoggle'), { newState: 'open' }))
  f.item.focus()
  f.focus.close()

  expect(document.activeElement).toBe(f.editor)
  expect(getSelectionEndpoints(f.editor)).toEqual({ anchor: 7, focus: 3 })
})

it('restores and blurs the borrowed editor before a Tab destination retains focus', async () => {
  const f = fixture()
  const outside = document.createElement('button')
  document.body.append(outside)
  f.editor.focus()
  f.open()
  const events: string[] = []
  const focusEditor = vi.spyOn(f.editor, 'focus')
  const focusDestination = vi.spyOn(outside, 'focus')
  f.editor.addEventListener('focus', () => events.push('editor focus'))
  f.editor.addEventListener('blur', () => events.push('editor blur'))

  outside.focus()
  await Promise.resolve()

  expect(f.menu.hidePopover).toHaveBeenCalledOnce()
  expect(events).toEqual(['editor focus', 'editor blur'])
  expect(focusEditor).toHaveBeenCalledExactlyOnceWith({ preventScroll: true })
  expect(focusDestination).toHaveBeenLastCalledWith({ preventScroll: true })
  expect(document.activeElement).toBe(outside)
})

it('does not intercept Escape dispatched outside the menu or while the menu is closed', () => {
  const f = fixture()
  f.editor.focus()
  const closed = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
  f.trigger.dispatchEvent(closed)
  expect(closed.defaultPrevented).toBe(false)
  f.open()
  const outside = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })

  document.body.dispatchEvent(outside)

  expect(outside.defaultPrevented).toBe(false)
  expect(f.menu.hidePopover).not.toHaveBeenCalled()
})

it('restores on native dismissal that temporarily focuses the body', async () => {
  const f = fixture()
  f.editor.focus()
  setSelectionRange(f.editor, 4, 4)
  f.open()

  f.item.blur()
  f.menu.dispatchEvent(Object.assign(new Event('beforetoggle'), { newState: 'closed' }))
  await Promise.resolve()

  expect(document.activeElement).toBe(f.editor)
  expect(getSelectionEndpoints(f.editor)).toEqual({ anchor: 4, focus: 4 })
})

it('restores an agenda row after native dismissal without creating an editor selection', async () => {
  const f = fixture()
  const row = document.createElement('div')
  row.className = 'agenda-row'
  row.tabIndex = 0
  document.body.append(row)
  row.focus()
  f.open()

  f.menu.hidePopover()
  await Promise.resolve()

  expect(document.activeElement).toBe(row)
})

it('restores before an outside press and leaves its explicit destination focused', async () => {
  const f = fixture()
  const outside = document.createElement('button')
  document.body.append(outside)
  f.editor.focus()
  setSelectionRange(f.editor, 6, 6)
  f.open()

  outside.dispatchEvent(new Event('pointerdown', { bubbles: true }))

  expect(f.menu.hidePopover).toHaveBeenCalledOnce()
  expect(document.activeElement).toBe(f.editor)
  expect(getSelectionEndpoints(f.editor)).toEqual({ anchor: 6, focus: 6 })
  outside.focus()
  await Promise.resolve()
  expect(document.activeElement).toBe(outside)
})

it('ignores inside presses and composing Escape while consuming an ordinary Escape', () => {
  const f = fixture()
  f.editor.focus()
  f.open()
  const composing = new KeyboardEvent('keydown', { key: 'Escape', isComposing: true, bubbles: true, cancelable: true })

  f.item.dispatchEvent(new Event('pointerdown', { bubbles: true }))
  f.item.dispatchEvent(composing)

  expect(composing.defaultPrevented).toBe(false)
  expect(f.menu.hidePopover).not.toHaveBeenCalled()
  const bubble = vi.fn()
  document.addEventListener('keydown', bubble)
  const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
  f.trigger.dispatchEvent(escape)

  expect(escape.defaultPrevented).toBe(true)
  expect(bubble).not.toHaveBeenCalled()
  expect(f.menu.hidePopover).toHaveBeenCalledOnce()
  document.removeEventListener('keydown', bubble)
})

it('does not restore a stale snapshot after a close immediately followed by reopen', async () => {
  const f = fixture()
  f.editor.focus()
  f.open()
  f.menu.hidePopover()
  f.open()

  await Promise.resolve()

  expect(document.activeElement).toBe(f.item)
})

it('removes document listeners and makes pending restoration inert after disposal', async () => {
  const add = vi.spyOn(document, 'addEventListener')
  const remove = vi.spyOn(document, 'removeEventListener')
  const f = fixture()
  const focusout = add.mock.calls.find(([type]) => type === 'focusout')![1]
  f.editor.focus()
  f.open()
  f.menu.hidePopover()
  f.focus.dispose()
  await Promise.resolve()
  vi.mocked(f.menu.hidePopover).mockClear()

  f.item.focus()
  f.item.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }))
  f.focus.restore()

  expect(document.activeElement).toBe(f.item)
  expect(f.menu.hidePopover).not.toHaveBeenCalled()
  expect(remove).toHaveBeenCalledWith('focusout', focusout, true)
})

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
