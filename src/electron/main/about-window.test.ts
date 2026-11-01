import { EventEmitter } from 'node:events'
import { beforeEach, expect, test, vi } from 'vitest'

vi.mock('electron', async () => {
  const { EventEmitter } = await import('node:events')
  class BrowserWindow extends EventEmitter {
    static windows: BrowserWindow[] = []
    static nextLoadError: Error | undefined
    webContents = new EventEmitter()
    destroyed = false
    show = vi.fn()
    focus = vi.fn()
    setBackgroundColor = vi.fn()
    loadURL = vi.fn(() => {
      const error = BrowserWindow.nextLoadError
      BrowserWindow.nextLoadError = undefined
      return error === undefined ? Promise.resolve() : Promise.reject(error)
    })
    close = vi.fn(() => {
      this.destroyed = true
      this.emit('closed')
    })
    isDestroyed = () => this.destroyed
    constructor(readonly options: Record<string, unknown>) {
      super()
      BrowserWindow.windows.push(this)
    }
  }
  return { BrowserWindow, nativeTheme: Object.assign(new EventEmitter(), { shouldUseDarkColors: false }) }
})

import { BrowserWindow, nativeTheme } from 'electron'
import { createAboutWindowController } from './about-window'

interface TestWindow extends EventEmitter {
  options: Record<string, unknown>
  webContents: EventEmitter
  destroyed: boolean
  show: ReturnType<typeof vi.fn>
  focus: ReturnType<typeof vi.fn>
  setBackgroundColor: ReturnType<typeof vi.fn>
  loadURL: ReturnType<typeof vi.fn>
  close(): void
  isDestroyed(): boolean
}

const mockWindow = BrowserWindow as unknown as { windows: TestWindow[]; nextLoadError: Error | undefined }
const windows = mockWindow.windows
const parent = { isDestroyed: vi.fn(() => false), focus: vi.fn() }
const getParent = () => parent as unknown as BrowserWindow

beforeEach(() => {
  windows.length = 0
  mockWindow.nextLoadError = undefined
  nativeTheme.removeAllListeners()
  vi.clearAllMocks()
})

test('creates one sandboxed modal child without a preload, and waits for its first paint', () => {
  const changed = vi.fn()
  const { show, isOpen } = createAboutWindowController(getParent, 'app://tree/index.html', changed)

  expect(isOpen()).toBe(false)

  show()
  const child = windows[0]!

  expect(isOpen()).toBe(true)
  expect(changed).toHaveBeenCalledOnce()

  expect(child.options).toMatchObject({
    parent,
    modal: true,
    show: false,
    backgroundColor: '#fbf8f1',
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  })
  expect((child.options.webPreferences as Record<string, unknown>).preload).toBeUndefined()
  expect(child.loadURL).toHaveBeenCalledWith('app://tree/about.html')
  expect(child.show).not.toHaveBeenCalled()

  child.emit('ready-to-show')
  show()

  expect(windows).toHaveLength(1)
  expect(child.show).toHaveBeenCalledOnce()
  expect(child.focus).toHaveBeenCalledOnce()
})

test('closing the child restores its parent and releases the theme subscription', () => {
  const changed = vi.fn()
  const { show, isOpen } = createAboutWindowController(getParent, 'http://localhost:5173/index.html', changed)
  show()
  const child = windows[0]!
  child.close()

  expect(child.close).toHaveBeenCalledOnce()
  expect(parent.focus).toHaveBeenCalledOnce()
  expect(nativeTheme.listenerCount('updated')).toBe(0)
  expect(isOpen()).toBe(false)
  expect(changed).toHaveBeenCalledTimes(2)

  show()

  expect(windows).toHaveLength(2)
  expect(windows[1]!.loadURL).toHaveBeenCalledWith('http://localhost:5173/about.html')
})

test('does not open without a live parent', () => {
  createAboutWindowController(() => null, 'app://tree/index.html').show()
  parent.isDestroyed.mockReturnValueOnce(true)
  createAboutWindowController(getParent, 'app://tree/index.html').show()

  expect(windows).toHaveLength(0)
})

test('closes a failed load without leaving a modal window or a theme listener', async () => {
  const error = new Error('missing document')
  const report = vi.spyOn(console, 'error').mockImplementation(() => undefined)
  const { show } = createAboutWindowController(getParent, 'app://tree/index.html')
  mockWindow.nextLoadError = error

  show()
  await Promise.resolve()

  expect(windows[0]!.close).toHaveBeenCalledOnce()
  expect(nativeTheme.listenerCount('updated')).toBe(0)
  expect(report).toHaveBeenCalledWith('[Tree] Could not open About Tree: missing document')
  report.mockRestore()
})
