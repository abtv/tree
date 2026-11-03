// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { installAboutDialog } from './about-dialog'

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true
    this.querySelector<HTMLButtonElement>('button')!.focus()
  }
  HTMLDialogElement.prototype.close = function () {
    this.open = false
  }
})
afterEach(() => {
  document.body.replaceChildren()
  vi.restoreAllMocks()
})

it('preserves a backward input selection across repeated opening and disposal', () => {
  const input = document.createElement('textarea')
  input.value = 'Synthetic selection'
  document.body.append(input)
  input.focus()
  input.setSelectionRange(2, 8, 'backward')
  const changed = vi.fn()
  const about = installAboutDialog('Version 1.0.0', changed)

  about.show()
  about.show()
  about.close()

  expect(document.activeElement).toBe(input)
  expect([input.selectionStart, input.selectionEnd, input.selectionDirection]).toEqual([2, 8, 'backward'])
  expect(changed.mock.calls).toEqual([[true], [false]])
  about.dispose()
  expect(document.querySelector('dialog')).toBeNull()
})

it('dismisses only outside clicks, Close and Escape and ignores stale close events', () => {
  const about = installAboutDialog('Version 1.0.0')
  const dialog = document.querySelector('dialog')!
  vi.spyOn(dialog, 'getBoundingClientRect').mockReturnValue({ left: 20, right: 200, top: 20, bottom: 200 } as DOMRect)

  about.show()
  dialog.dispatchEvent(new MouseEvent('click', { clientX: 100, clientY: 100 }))
  expect(dialog.open).toBe(true)
  dialog.dispatchEvent(new MouseEvent('click', { clientX: 10, clientY: 100 }))
  expect(dialog.open).toBe(false)
  about.show()
  dialog.dispatchEvent(new Event('close'))
  expect(dialog.open).toBe(true)
  dialog.dispatchEvent(new Event('cancel', { cancelable: true }))
  expect(dialog.open).toBe(false)
  about.show()
  dialog.querySelector('button')!.click()
  expect(dialog.open).toBe(false)
})
