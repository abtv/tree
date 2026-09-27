import fc from 'fast-check'
import { expect, it } from 'vitest'
import { currentLinkDraft, normalCaretTarget } from './link-caret'

it('keeps every Normal caret target on exactly one character or the terminal position', () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 0, max: 200 }),
      fc.integer({ min: -5, max: 205 }),
      fc.boolean(),
      (textLength, position, hasAttachment) => {
        const target = normalCaretTarget(textLength, position, hasAttachment)
        if (target.kind === 'block') {
          expect(target.start).toBeGreaterThanOrEqual(0)
          expect(target.end).toBe(target.start + 1)
          expect(target.end).toBeLessThanOrEqual(textLength)
        } else {
          expect(target.position).toBeGreaterThanOrEqual(0)
          expect(target.position).toBeLessThanOrEqual(textLength)
        }
      },
    ),
  )
})

it('never selects a character outside the link under the caret', () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 1, max: 200 }),
      fc.nat(199),
      fc.integer({ min: 1, max: 200 }),
      fc.boolean(),
      (textLength, linkStartSeed, linkLengthSeed, hasAttachment) => {
        const linkStart = linkStartSeed % textLength
        const linkLength = 1 + (linkLengthSeed % (textLength - linkStart))
        const link = { start: linkStart, end: linkStart + linkLength }
        const caret = link.start + (linkStartSeed % linkLength)
        const target = normalCaretTarget(textLength, caret, hasAttachment)
        expect(target.kind).toBe('block')
        if (target.kind !== 'block') return
        expect(target.start).toBe(caret)
        expect(target.start).toBeGreaterThanOrEqual(link.start)
        expect(target.end).toBeLessThanOrEqual(link.end)
      },
    ),
  )
})

it('keeps a pending link draft only while its text still matches its url', () => {
  fc.assert(
    fc.property(fc.string({ maxLength: 40 }), fc.nat(40), fc.nat(40), (text, startSeed, endSeed) => {
      const bounds = [startSeed % (text.length + 1), endSeed % (text.length + 1)].sort((a, b) => a - b)
      const draft = { start: bounds[0]!, end: bounds[1]!, url: text.slice(bounds[0]!, bounds[1]!) }
      expect(currentLinkDraft(text, draft)).toBe(draft)
      expect(currentLinkDraft(text, { ...draft, url: `${draft.url}!` })).toBeUndefined()
      expect(currentLinkDraft(text, undefined)).toBeUndefined()
    }),
  )
})
