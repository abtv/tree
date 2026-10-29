import { expect, it } from 'vitest'
import { appVersionLabel } from './app-version.mts'

it('formats the Actions run number with the build date in English and UTC', () => {
  expect(appVersionLabel('142', new Date('2026-10-29T23:30:00-02:00'))).toBe('Version 142 · Oct 30, 2026')
})

it('identifies builds outside Actions without a fabricated release number', () => {
  expect(appVersionLabel(undefined, new Date('2026-10-29T12:00:00Z'))).toBe('Local build · Oct 29, 2026')
})

it.each(['', '0', '-1', '1.5', '<script>'])('rejects an invalid Actions run number: %s', (number) => {
  expect(() => appVersionLabel(number, new Date())).toThrow('GITHUB_RUN_NUMBER must be a positive integer')
})
