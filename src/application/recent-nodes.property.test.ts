import fc from 'fast-check'
import { expect, it } from 'vitest'
import { RecentNodes } from './recent-nodes'

it('keeps unique most-recent order for arbitrary repeated visits', () => {
  fc.assert(
    fc.property(fc.array(fc.integer({ min: 0, max: 149 }), { maxLength: 250 }), (visits) => {
      const document = {
        roots: Array.from({ length: 150 }, (_, id) => ({ id: String(id), text: String(id), children: [] })),
      }
      const recent = new RecentNodes()
      recent.load([], document)
      for (const visit of visits) recent.remember(String(visit), document)
      const expected = [...new Set([...visits].reverse().map(String))].slice(0, 100)

      expect(recent.getIds()).toEqual(expected)
      expect(recent.getResults().map(({ id }) => id)).toEqual(expected.slice(0, 8))
    }),
  )
})
