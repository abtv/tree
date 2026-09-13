import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { countInsertedWords, countPastedWords } from './save-policy'

const word = fc.stringMatching(/^[^ \t\n\r]{1,6}$/)

describe('save policy word counting', () => {
  it('never counts a word when the text is unchanged', () => {
    fc.assert(
      fc.property(fc.string(), (text) => {
        expect(countInsertedWords(text, text)).toBe(0)
      }),
    )
  })

  it('never counts a word for a deletion', () => {
    fc.assert(
      fc.property(fc.string(), fc.nat(), fc.nat(), (text, first, second) => {
        const start = Math.min(first % (text.length + 1), second % (text.length + 1))
        const end = Math.max(first % (text.length + 1), second % (text.length + 1))
        const remaining = text.slice(0, start) + text.slice(end)
        expect(countInsertedWords(text, remaining)).toBe(0)
      }),
    )
  })

  it('counts exactly one word when a whitespace-separated word is appended', () => {
    fc.assert(
      fc.property(fc.string(), word, (previous, appended) => {
        expect(countInsertedWords(previous, `${previous} ${appended}`)).toBe(1)
      }),
    )
  })

  it('treats a leading partial word as one inserted word', () => {
    fc.assert(
      fc.property(word, word, (first, second) => {
        let text = ''
        let count = 0
        for (const character of `${first} ${second}`) {
          const next = text + character
          count += countInsertedWords(text, next)
          text = next
        }
        expect(count).toBe(2)
      }),
    )
  })

  it('counts a pasted word only when it begins a word', () => {
    fc.assert(
      fc.property(word, (pasted) => {
        expect(countPastedWords(pasted, undefined)).toBe(1)
        expect(countPastedWords(pasted, 'a')).toBe(0)
        expect(countPastedWords(pasted, ' ')).toBe(1)
      }),
    )
  })

  it('counts pasted words across multiple lines', () => {
    fc.assert(
      fc.property(word, word, (first, second) => {
        expect(countPastedWords(`${first}\n${second}`, undefined)).toBe(2)
      }),
    )
  })
})
