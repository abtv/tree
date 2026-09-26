// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import './test/setup'
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
})
