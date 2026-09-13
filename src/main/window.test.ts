import { describe, expect, it, vi } from 'vitest'
import {
  configureSingleInstance,
  isAllowedExternalUrl,
  isAllowedRendererUrl,
  reportMainProcessError,
  surfaceWindow,
} from './window'

describe('configureSingleInstance', () => {
  it('registers second-instance handling when the lock is acquired', () => {
    const app = { requestSingleInstanceLock: vi.fn(() => true), on: vi.fn() }
    const onSecondInstance = vi.fn()

    expect(configureSingleInstance(app, onSecondInstance)).toBe(true)
    expect(app.on).toHaveBeenCalledWith('second-instance', onSecondInstance)
  })

  it('does not register second-instance handling when another process owns the lock', () => {
    const app = { requestSingleInstanceLock: vi.fn(() => false), on: vi.fn() }

    expect(configureSingleInstance(app, vi.fn())).toBe(false)
    expect(app.on).not.toHaveBeenCalled()
  })
})

describe('reportMainProcessError', () => {
  it('reports Error messages with context', () => {
    const report = vi.fn()

    reportMainProcessError('Could not start', new Error('startup failed'), report)

    expect(report).toHaveBeenCalledWith('[Tree] Could not start: startup failed')
  })

  it('reports a safe message for non-Error failures', () => {
    const report = vi.fn()

    reportMainProcessError('Could not start', 'bad failure', report)

    expect(report).toHaveBeenCalledWith('[Tree] Could not start: Unknown error.')
  })
})

describe('surfaceWindow', () => {
  it('does nothing for a destroyed window', () => {
    const window = {
      isDestroyed: () => true,
      isFocused: () => false,
      isMinimized: () => false,
      restore: vi.fn(),
      show: vi.fn(),
      focus: vi.fn(),
    }
    surfaceWindow(window)
    expect(window.show).not.toHaveBeenCalled()
    expect(window.focus).not.toHaveBeenCalled()
  })

  it('does nothing for an active window', () => {
    const window = {
      isDestroyed: () => false,
      isFocused: () => true,
      isMinimized: () => false,
      restore: vi.fn(),
      show: vi.fn(),
      focus: vi.fn(),
    }
    surfaceWindow(window)
    expect(window.show).not.toHaveBeenCalled()
  })

  it('restores and focuses a minimized inactive window', () => {
    const window = {
      isDestroyed: () => false,
      isFocused: () => false,
      isMinimized: () => true,
      restore: vi.fn(),
      show: vi.fn(),
      focus: vi.fn(),
    }
    surfaceWindow(window)
    expect(window.restore).toHaveBeenCalledOnce()
    expect(window.show).toHaveBeenCalledOnce()
    expect(window.focus).toHaveBeenCalledOnce()
  })
})

describe('isAllowedExternalUrl', () => {
  it('allows HTTP and HTTPS URLs only', () => {
    expect(isAllowedExternalUrl('http://example.com')).toBe(true)
    expect(isAllowedExternalUrl('https://example.com/path')).toBe(true)
    expect(isAllowedExternalUrl('javascript:alert(1)')).toBe(false)
    expect(isAllowedExternalUrl('file:///tmp/example')).toBe(false)
  })

  it('rejects values that are not valid URLs', () => {
    expect(isAllowedExternalUrl('not a url')).toBe(false)
    expect(isAllowedExternalUrl('')).toBe(false)
  })
})

describe('isAllowedRendererUrl', () => {
  it('allows only the configured renderer document', () => {
    expect(isAllowedRendererUrl('file:///app/renderer/index.html', 'file:///app/renderer/index.html')).toBe(true)
    expect(isAllowedRendererUrl('file:///app/renderer/other.html', 'file:///app/renderer/index.html')).toBe(false)
    expect(isAllowedRendererUrl('https://evil.example/', 'file:///app/renderer/index.html')).toBe(false)
  })

  it('rejects values that are not valid URLs', () => {
    expect(isAllowedRendererUrl('not a url', 'file:///app/renderer/index.html')).toBe(false)
    expect(isAllowedRendererUrl('file:///app/renderer/index.html', 'not a url')).toBe(false)
  })
})
