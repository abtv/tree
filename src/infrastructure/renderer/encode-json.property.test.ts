import { it, expect } from 'vitest'
import fc from 'fast-check'
import { encodeJson } from './encode-json'

it('matches native JSON encoding for arbitrary JSON trees', async () => {
  await fc.assert(
    fc.asyncProperty(fc.jsonValue(), async (value) => {
      expect(await encodeJson(value)).toBe(JSON.stringify(value))
    }),
    { numRuns: 100 },
  )
})
