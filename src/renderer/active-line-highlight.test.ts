// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import './test/setup'
import { createActiveLineHighlight } from './active-line-highlight'

const rect = (top: number, height = 16): DOMRect => new DOMRect(100, top, 200, height)
let dispose: (() => void) | undefined
let rangeRects: DOMRect[]
let observed: HTMLElement[]
let disconnected: number
let frameCallback: FrameRequestCallback | undefined

beforeEach(() => {
  observed = []
  disconnected = 0
  rangeRects = [rect(122)]
  Object.defineProperty(Range.prototype, 'getClientRects', {
    configurable: true,
    value: () => rangeRects,
  })
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe(element: HTMLElement) {
        observed.push(element)
      }
      disconnect() {
        disconnected++
      }
    },
  )
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn((callback: FrameRequestCallback) => {
      frameCallback = callback
      return 1
    }),
  )
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
})

afterEach(() => {
  dispose?.()
  dispose = undefined
  frameCallback = undefined
  document.body.replaceChildren()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function fixture(synthetic = false) {
  const root = document.createElement('main')
  root.className = 'tree-app vim-state-normal'
  const row = document.createElement('div')
  row.className = synthetic ? 'agenda-row' : 'node-row'
  row.tabIndex = 0
  const input = document.createElement('div')
  input.className = synthetic ? 'agenda-text' : 'node-input'
  input.tabIndex = 0
  input.textContent = 'First line second line third line'
  input.style.lineHeight = '20px'
  vi.spyOn(input, 'getBoundingClientRect').mockReturnValue(rect(100, 60))
  vi.spyOn(row, 'getBoundingClientRect').mockReturnValue(rect(100, 65))
  row.append(input)
  root.append(row)
  document.body.append(root)
  const range = document.createRange()
  range.setStart(input.firstChild!, 6)
  range.setEnd(input.firstChild!, 7)
  document.getSelection()!.removeAllRanges()
  document.getSelection()!.addRange(range)
  ;(synthetic ? row : input).focus()
  const owner = createActiveLineHighlight()
  dispose = owner.mount(() => root)
  return { root, row, input, owner }
}

it('projects one text line without moving native focus or selection and observes only the current input', () => {
  const { row, input, owner } = fixture()
  const before = document.getSelection()!.toString()

  expect(row.style.getPropertyValue('--active-line-top')).toBe('20px')
  expect(row.style.getPropertyValue('--active-line-height')).toBe('20px')
  expect(input).toHaveFocus()
  expect(document.getSelection()!.toString()).toBe(before)

  for (let index = 0; index < 100; index++) owner.update()

  expect(observed).toEqual([input])
  expect(disconnected).toBe(1)

  const button = document.createElement('button')
  document.body.append(button)
  button.focus()

  expect(row).not.toHaveAttribute('data-active-line')
  expect(row.style.getPropertyValue('--active-line-top')).toBe('')
  expect(disconnected).toBe(2)
})

it('follows either endpoint of rendered synthetic selection marks and releases image feedback', () => {
  const { row, input, owner } = fixture(true)
  const first = document.createElement('span')
  first.className = 'agenda-selection'
  const last = first.cloneNode() as HTMLElement
  vi.spyOn(first, 'getClientRects').mockReturnValue([rect(102)] as unknown as DOMRectList)
  vi.spyOn(last, 'getClientRects').mockReturnValue([rect(142)] as unknown as DOMRectList)
  input.replaceChildren(first, last)

  owner.update()

  expect(row.style.getPropertyValue('--active-line-top')).toBe('40px')

  row.dataset.caretEnd = 'start'
  owner.update()

  expect(row.style.getPropertyValue('--active-line-top')).toBe('0px')

  input.classList.add('node-input-image-caret')
  owner.update()

  expect(row).not.toHaveAttribute('data-active-line')
  expect(row.style.getPropertyValue('--active-line-height')).toBe('')
})

it('coalesces pending layout work and removes listeners, observers and decoration on cleanup', () => {
  const { row } = fixture()

  window.dispatchEvent(new Event('resize'))
  window.dispatchEvent(new Event('resize'))

  expect(requestAnimationFrame).toHaveBeenCalledTimes(1)
  expect(frameCallback).toBeDefined()

  dispose!()
  dispose = undefined
  window.dispatchEvent(new Event('resize'))

  expect(cancelAnimationFrame).toHaveBeenCalledWith(1)
  expect(requestAnimationFrame).toHaveBeenCalledTimes(1)
  expect(row).not.toHaveAttribute('data-active-line')
  expect(disconnected).toBe(2)
})

it('keeps a text-height band when multiline text becomes single-line and clears missing geometry', () => {
  const { row, input, owner } = fixture()
  vi.mocked(input.getBoundingClientRect).mockReturnValue(rect(100, 20))

  owner.update()

  expect(row.style.getPropertyValue('--active-line-top')).toBe('0px')
  expect(row.style.getPropertyValue('--active-line-height')).toBe('20px')

  input.style.paddingBottom = '2px'
  vi.mocked(input.getBoundingClientRect).mockReturnValue(rect(100, 22))
  owner.update()

  expect(row.style.getPropertyValue('--active-line-height')).toBe('20px')

  vi.mocked(input.getBoundingClientRect).mockReturnValue(rect(100, 0))
  owner.update()

  expect(row).not.toHaveAttribute('data-active-line')

  input.style.paddingBottom = '0px'
  vi.mocked(input.getBoundingClientRect).mockReturnValue(rect(100, 60))
  rangeRects = []
  owner.update()

  expect(row.style.getPropertyValue('--active-line-height')).toBe('')
})

it('projects the same text-height band for a synthetic line and a textless separator', () => {
  const { row, input, owner } = fixture(true)
  vi.mocked(input.getBoundingClientRect).mockReturnValue(rect(100, 20))
  rangeRects = []

  owner.update()

  expect(row.style.getPropertyValue('--active-line-height')).toBe('20px')

  row.classList.add('agenda-row-separator')
  owner.update()

  expect(row).toHaveAttribute('data-active-line')
  expect(row.style.getPropertyValue('--active-line-height')).toBe('20px')
})

it('follows a delayed image, its outer frame and resize without retaining the image band on text', () => {
  const { row, input, owner } = fixture()
  input.classList.add('node-input-image-caret')

  owner.update()

  expect(row).not.toHaveAttribute('data-active-line')
  expect(observed.at(-1)).toBe(row)

  const placeholder = document.createElement('span')
  placeholder.className = 'attachment-placeholder'
  vi.spyOn(placeholder, 'getBoundingClientRect').mockReturnValue(rect(136, 24))
  row.append(placeholder)
  owner.update()

  expect(row.style.getPropertyValue('--active-line-top')).toBe('36px')
  expect(row.style.getPropertyValue('--active-line-height')).toBe('24px')

  const button = document.createElement('button')
  button.className = 'attachment-button attachment-image-caret'
  button.style.outlineStyle = 'solid'
  button.style.outlineWidth = '2px'
  button.style.outlineOffset = '2px'
  const image = document.createElement('img')
  image.className = 'attachment-image'
  const imageBounds = vi.spyOn(image, 'getBoundingClientRect').mockReturnValue(rect(136, 80))
  const buttonBounds = vi.spyOn(button, 'getBoundingClientRect').mockReturnValue(rect(136, 80))
  button.append(image)
  placeholder.replaceWith(button)
  owner.update()

  expect(row.style.getPropertyValue('--active-line-top')).toBe('32px')
  expect(row.style.getPropertyValue('--active-line-height')).toBe('88px')
  expect(observed.at(-1)).toBe(image)
  expect(input).toHaveFocus()

  imageBounds.mockReturnValue(rect(136, 120))
  buttonBounds.mockReturnValue(rect(136, 120))
  window.dispatchEvent(new Event('resize'))
  frameCallback!(0)

  expect(row.style.getPropertyValue('--active-line-height')).toBe('128px')

  input.classList.remove('node-input-image-caret')
  owner.update()

  expect(row.style.getPropertyValue('--active-line-top')).toBe('20px')
  expect(row.style.getPropertyValue('--active-line-height')).toBe('20px')
  expect(observed.at(-1)).toBe(input)
})

it('projects a rich editor insertion point after the trailing BR without inserting DOM markers', () => {
  const { root, row, input, owner } = fixture()
  root.className = 'tree-app vim-state-insert'
  input.textContent = 'First\nSecond\n'
  const trailing = document.createElement('br')
  trailing.dataset.trailingLine = ''
  input.append(trailing)
  const range = document.createRange()
  range.selectNodeContents(input)
  range.collapse(false)
  document.getSelection()!.removeAllRanges()
  document.getSelection()!.addRange(range)
  rangeRects = []
  const before = input.innerHTML

  owner.update()

  expect(row.style.getPropertyValue('--active-line-top')).toBe('40px')
  expect(row.style.getPropertyValue('--active-line-height')).toBe('20px')
  expect(input.innerHTML).toBe(before)
  expect(document.getSelection()!.focusNode).toBe(input)
  expect(document.getSelection()!.focusOffset).toBe(2)
})
