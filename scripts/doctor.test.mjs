import { describe, expect, it } from 'vitest'
import { meetsEngineRange } from './doctor.mjs'

describe('meetsEngineRange', () => {
  it('accepts a version inside a comparator range', () => {
    expect(meetsEngineRange('24.13.1', '>=24.13.1 <25')).toBe(true)
    expect(meetsEngineRange('11.8.0', '>=11.8.0 <12')).toBe(true)
  })

  it('rejects a version below or above the range', () => {
    expect(meetsEngineRange('24.12.0', '>=24.13.1 <25')).toBe(false)
    expect(meetsEngineRange('25.0.0', '>=24.13.1 <25')).toBe(false)
    expect(meetsEngineRange('12.0.0', '>=11.8.0 <12')).toBe(false)
  })

  it('requires a matching prefix for a bare range or the version itself', () => {
    expect(meetsEngineRange('26.0.3', '>=26')).toBe(true)
    expect(meetsEngineRange('26.0.3', '26')).toBe(false)
  })

  it('rejects an unparseable range', () => {
    expect(meetsEngineRange('24.13.1', 'banana')).toBe(false)
  })
})
