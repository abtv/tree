import { describe, expect, it, vi } from 'vitest'
import { isAllowedExternalUrl, surfaceWindow } from './window'

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
})
