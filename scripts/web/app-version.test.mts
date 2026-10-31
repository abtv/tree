import { expect, it } from 'vitest'
import { appVersionLabel } from './app-version.mts'

it('formats the package version with the build date in English and UTC', () => {
  expect(appVersionLabel('0.1.2', new Date('2026-10-29T23:30:00-02:00'))).toBe('Version 0.1.2 · Oct 30, 2026')
})

it('preserves prerelease and build metadata', () => {
  expect(appVersionLabel('1.2.3-rc.1+test', new Date('2026-10-29T12:00:00Z'))).toBe(
    'Version 1.2.3-rc.1+test · Oct 29, 2026',
  )
})

it.each(['', '0', '-1', '1.5', '<script>'])('rejects an invalid version: %s', (version) => {
  expect(() => appVersionLabel(version, new Date())).toThrow('Invalid semantic version')
})
