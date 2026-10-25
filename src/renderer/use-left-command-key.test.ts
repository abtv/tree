// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import './test/setup'
import { APPLE_SHORTCUTS, OTHER_SHORTCUTS } from './shortcut-profile'
import { useLeftCommandKey } from './use-left-command-key'

afterEach(() => {
  window.dispatchEvent(new Event('blur'))
})

describe('useLeftCommandKey', () => {
  it('tracks only the physical left Command key and resets when the window blurs', () => {
    const { result } = renderHook(() => useLeftCommandKey())

    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'MetaRight' })))

    expect(result.current).toBe(false)

    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'MetaLeft' })))

    expect(result.current).toBe(true)

    act(() => window.dispatchEvent(new KeyboardEvent('keyup', { code: 'MetaRight' })))

    expect(result.current).toBe(true)

    act(() => window.dispatchEvent(new Event('blur')))

    expect(result.current).toBe(false)
  })

  // @requirement PRODUCT.md §1.5
  it('tracks only the physical left Control key on the other profile and ignores the Command keys', () => {
    const { result } = renderHook(() => useLeftCommandKey(OTHER_SHORTCUTS))

    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'MetaLeft' })))

    expect(result.current).toBe(false)

    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ControlRight' })))

    expect(result.current).toBe(false)

    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ControlLeft' })))

    expect(result.current).toBe(true)

    act(() => window.dispatchEvent(new KeyboardEvent('keyup', { code: 'ControlRight' })))

    expect(result.current).toBe(true)

    act(() => window.dispatchEvent(new KeyboardEvent('keyup', { code: 'ControlLeft' })))

    expect(result.current).toBe(false)
  })

  // @requirement PRODUCT.md §1.5
  it('ignores the left Control key on the Apple profile', () => {
    const { result } = renderHook(() => useLeftCommandKey(APPLE_SHORTCUTS))

    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ControlLeft' })))

    expect(result.current).toBe(false)
  })
})
