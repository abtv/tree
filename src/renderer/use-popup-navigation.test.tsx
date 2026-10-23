// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { usePopupNavigation } from './use-popup-navigation'

function Fixture({ enabled = true }: { enabled?: boolean }): React.JSX.Element {
  usePopupNavigation(enabled)
  return (
    <>
      <textarea aria-label="Editor" />
      <section data-popup-navigation="horizontal">
        <button>First</button>
        <button disabled>Disabled</button>
        <div hidden>
          <button>Hidden</button>
        </div>
        <button>Last</button>
        <input aria-label="Query" />
        <div contentEditable suppressContentEditableWarning aria-label="Rich input">
          Text
        </div>
      </section>
    </>
  )
}

beforeEach(() => {
  // jsdom has no layout. Model visibility, including a hidden ancestor.
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockImplementation(function (this: HTMLElement) {
    return (this.closest('[hidden]') === null ? [{}] : []) as unknown as DOMRectList
  })
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

// @requirement PRODUCT.md §20.2.29
it('moves between visible enabled actions without wrapping or activating them', () => {
  render(<Fixture />)
  const first = screen.getByText('First')
  const last = screen.getByText('Last')
  const activate = vi.fn()
  last.addEventListener('click', activate)
  first.focus()
  fireEvent.keyDown(first, { key: 'h' })
  expect(document.activeElement).toBe(first)
  fireEvent.keyDown(first, { key: 'l' })
  expect(document.activeElement).toBe(last)
  fireEvent.keyDown(last, { key: 'l' })
  expect(document.activeElement).toBe(last)
  fireEvent.keyDown(last, { key: 'h' })
  expect(document.activeElement).toBe(first)
  expect(activate).not.toHaveBeenCalled()
})

it('respects the current preference and removes handlers on unmount', () => {
  const { rerender, unmount } = render(<Fixture enabled={false} />)
  const first = screen.getByText('First')
  first.focus()
  expect(fireEvent.keyDown(first, { key: 'l' })).toBe(true)
  rerender(<Fixture />)
  expect(fireEvent.keyDown(first, { key: 'l' })).toBe(false)
  rerender(<Fixture enabled={false} />)
  expect(fireEvent.keyDown(screen.getByText('Last'), { key: 'h' })).toBe(true)
  rerender(<Fixture />)
  unmount()
  expect(fireEvent.keyDown(document, { key: 'h' })).toBe(true)
})

it('leaves text, composition, modified keys and existing keyboard controls alone', () => {
  render(<Fixture />)
  for (const target of [
    screen.getByLabelText('Editor'),
    screen.getByLabelText('Query'),
    screen.getByLabelText('Rich input'),
  ]) {
    target.focus()
    expect(fireEvent.keyDown(target, { key: 'h' })).toBe(true)
    expect(document.activeElement).toBe(target)
  }
  const first = screen.getByText('First')
  first.focus()
  for (const options of [
    { isComposing: true },
    { ctrlKey: true },
    { metaKey: true },
    { altKey: true },
    { shiftKey: true },
  ]) {
    expect(fireEvent.keyDown(first, { key: 'l', ...options })).toBe(true)
  }
  for (const key of ['Enter', 'Tab', 'Escape', 'x']) expect(fireEvent.keyDown(first, { key })).toBe(true)
  expect(document.activeElement).toBe(first)
})

it('dismisses only the focused activity and leaves modal cancellation to its owner', () => {
  const dismiss = vi.fn()
  function Activity(): React.JSX.Element {
    usePopupNavigation(true)
    return (
      <aside data-popup-navigation="horizontal">
        <button data-popup-dismiss onClick={dismiss}>
          OK
        </button>
      </aside>
    )
  }
  render(<Activity />)
  const ok = screen.getByText('OK')
  ok.focus()
  expect(fireEvent.keyDown(ok, { key: 'Escape' })).toBe(false)
  expect(dismiss).toHaveBeenCalledTimes(1)
  expect(fireEvent.keyDown(document, { key: 'Escape' })).toBe(true)
  expect(dismiss).toHaveBeenCalledTimes(1)
})

it('focuses the first action on vertical popover opening and uses only j/k', () => {
  const { rerender } = render(<Fixture />)
  const first = screen.getByText('First')
  const last = screen.getByText('Last')
  const popup = first.parentElement!
  popup.dataset.popupNavigation = 'vertical'
  popup.setAttribute('popover', '')
  screen.getByLabelText('Editor').focus()
  fireEvent(popup, Object.assign(new Event('toggle'), { newState: 'open' }))
  expect(document.activeElement).toBe(first)
  fireEvent.keyDown(first, { key: 'k' })
  expect(document.activeElement).toBe(first)
  expect(fireEvent.keyDown(first, { key: 'l' })).toBe(true)
  fireEvent.keyDown(first, { key: 'j' })
  expect(document.activeElement).toBe(last)
  fireEvent.keyDown(last, { key: 'j' })
  expect(document.activeElement).toBe(last)
  fireEvent.keyDown(last, { key: 'k' })
  expect(document.activeElement).toBe(first)
  screen.getByLabelText('Editor').focus()
  fireEvent(popup, Object.assign(new Event('toggle'), { newState: 'closed' }))
  expect(document.activeElement).toBe(screen.getByLabelText('Editor'))
  rerender(<Fixture enabled={false} />)
  fireEvent(popup, Object.assign(new Event('toggle'), { newState: 'open' }))
  expect(document.activeElement).toBe(screen.getByLabelText('Editor'))
})
