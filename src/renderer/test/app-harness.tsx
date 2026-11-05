import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, vi } from 'vitest'
import { dayNumberOf } from '../../domain/calendar-date'
import { App } from '../App'
import { getSelectionRange, setSelectionRange } from '../editor-dom'
import { createRealStoreHarness, type RealStoreOptions } from './real-store-harness'
import './setup'

const originalScrollIntoView = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollIntoView')
const originalRangeRect = Object.getOwnPropertyDescriptor(Range.prototype, 'getBoundingClientRect')

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame'] })
  vi.setSystemTime(new Date(2026, 9, 8, 12))
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() })
  // jsdom has no layout. Real popup geometry remains covered in Electron.
  Object.defineProperty(Range.prototype, 'getBoundingClientRect', {
    configurable: true,
    value: () => new DOMRect(0, 0, 0, 0),
  })
  // Only host services are substituted. App, NodeInput, popup, handlers and store stay real.
  vi.stubGlobal('treeApi', {
    getAlwaysOnTop: async () => false,
    setAlwaysOnTop: async () => undefined,
    getAppearance: async () => 'system',
    setAppearance: async () => undefined,
    getCommandHistory: async () => [],
    setCommandHistory: async () => undefined,
    setVimEnabled: async () => undefined,
    quit: async () => undefined,
    quitWithoutSaving: async () => undefined,
  })
})

afterEach(() => {
  cleanup()
  if (originalScrollIntoView === undefined) Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView')
  else Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', originalScrollIntoView)
  if (originalRangeRect === undefined) Reflect.deleteProperty(Range.prototype, 'getBoundingClientRect')
  else Object.defineProperty(Range.prototype, 'getBoundingClientRect', originalRangeRect)
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

export async function settleApp(): Promise<void> {
  await act(async () => vi.advanceTimersByTimeAsync(32))
}

export async function createAppHarness(options: RealStoreOptions & { vimEnabled: boolean }) {
  const harness = await createRealStoreHarness({
    ...options,
    services: { today: () => dayNumberOf({ year: 2026, month: 10, day: 8 }), ...options.services },
  })
  const rendered = render(<App store={harness.store} initialVimEnabled={options.vimEnabled} />)
  await settleApp()

  const press = async (element: HTMLElement, key: string, modifiers: KeyboardEventInit = {}): Promise<void> => {
    fireEvent.keyDown(element, { key, ...modifiers })
    await settleApp()
  }
  const focus = async (element: HTMLElement, position?: number): Promise<void> => {
    act(() => {
      element.focus()
      if (position !== undefined) setSelectionRange(element, position, position)
    })
    await settleApp()
  }
  // Model the DOM mutation and input event delivered by a browser, never store.editText.
  const input = async (element: HTMLElement, text: string, cursor = text.length): Promise<void> => {
    if (element instanceof HTMLTextAreaElement) {
      fireEvent.change(element, { target: { value: text, selectionStart: cursor, selectionEnd: cursor } })
    } else {
      act(() => {
        element.textContent = text
        setSelectionRange(element, cursor, cursor)
        fireEvent.input(element, { inputType: 'insertText' })
      })
    }
    await settleApp()
  }
  return { ...harness, ...rendered, press, focus, input, selection: getSelectionRange }
}
