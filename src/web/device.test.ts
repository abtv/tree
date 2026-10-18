import { describe, expect, it } from 'vitest'
import { isIPhoneOrIPad } from './device'

describe('iPhone and iPad identification', () => {
  it.each([
    ['iPhone Safari', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', 'iPhone', 5, true],
    ['iPhone Chrome', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) CriOS/130', 'iPhone', 5, true],
    ['iPad mobile', 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X)', 'iPad', 5, true],
    ['iPad desktop', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)', 'MacIntel', 5, true],
    ['Mac', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)', 'MacIntel', 0, false],
    ['Mac single touch point', 'Mozilla/5.0 (Macintosh)', 'MacIntel', 1, false],
    ['Android', 'Mozilla/5.0 (Linux; Android 15)', 'Linux armv8l', 5, false],
    ['Windows touch', 'Mozilla/5.0 (Windows NT 10.0)', 'Win32', 10, false],
  ])('%s', (_name, userAgent, platform, maxTouchPoints, expected) => {
    expect(isIPhoneOrIPad({ userAgent, platform, maxTouchPoints })).toBe(expected)
  })
})
