import { describe, expect, it, vi } from 'vitest'
import { surfaceWindow } from './window'

describe('surfaceWindow', () => {
  it('does nothing for an active window', () => {
    const window = { isFocused: () => true, isMinimized: () => false, restore: vi.fn(), show: vi.fn(), focus: vi.fn() }
    surfaceWindow(window)
    expect(window.show).not.toHaveBeenCalled()
  })

  it('restores and focuses a minimized inactive window', () => {
    const window = { isFocused: () => false, isMinimized: () => true, restore: vi.fn(), show: vi.fn(), focus: vi.fn() }
    surfaceWindow(window)
    expect(window.restore).toHaveBeenCalledOnce()
    expect(window.show).toHaveBeenCalledOnce()
    expect(window.focus).toHaveBeenCalledOnce()
  })
})
