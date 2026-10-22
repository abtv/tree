import { expect, it } from 'vitest'
import { validateArguments } from './safari.mts'

it('accepts only the fixed Safari checks or help, without configurable scripts, origins or profiles', () => {
  expect(validateArguments([])).toBe('run')
  expect(validateArguments(['--help'])).toBe('help')
  for (const args of [
    ['.scratch/probe.mjs'],
    ['--url=https://example.com'],
    ['--profile=/Users/example/Library/Safari'],
    ['--enable'],
    ['--help', 'probe.mjs'],
  ]) {
    expect(() => validateArguments(args)).toThrow('with no arguments')
  }
})
