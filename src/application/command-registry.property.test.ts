import fc from 'fast-check'
import { expect, it } from 'vitest'
import { propertyRuns } from '../test/property-runs'
import { commandRegistry, matchCommands, normalizeCommandHistory, rememberCommand } from './command-registry'

it('keeps history bounded, unique and valid and matching stable under arbitrary histories', () => {
  const known = commandRegistry.map((command) => command.name)
  fc.assert(
    fc.property(
      fc.array(fc.oneof(fc.constantFrom(...known), fc.string()), { maxLength: 1000 }),
      fc.string(),
      (history, query) => {
        const normalized = normalizeCommandHistory(history)
        expect(normalized.length).toBeLessThanOrEqual(100)
        expect(new Set(normalized).size).toBe(normalized.length)
        expect(normalizeCommandHistory(normalized)).toEqual(normalized)
        expect(normalized.every((name) => known.includes(name) && name !== 'quit')).toBe(true)
        const remembered = rememberCommand(normalized, 'set-theme-dark')
        expect(remembered[0]).toBe('set-theme-dark')
        expect(remembered.slice(1)).toEqual(normalized.filter((name) => name !== 'set-theme-dark'))
        const matches = matchCommands(query, history)
        expect(new Set(matches).size).toBe(matches.length)
        expect(
          matchCommands(query, normalized)
            .map((command) => command.name)
            .sort(),
        ).toEqual(matches.map((command) => command.name).sort())
      },
    ),
    { numRuns: propertyRuns(200) },
  )
})
