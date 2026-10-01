import { describe, expect, it } from 'vitest'
import { countInsertedWords, countPastedWords } from './save-policy'

describe('countInsertedWords', () => {
  it('counts a word once as it is typed one character at a time', () => {
    let text = ''
    let count = 0
    for (const character of 'hello') {
      const next = text + character
      count += countInsertedWords(text, next)
      text = next
    }
    expect(count).toBe(1)
  })

  it('counts each new word separated by whitespace', () => {
    let text = ''
    let count = 0
    for (const character of 'hello world again') {
      const next = text + character
      count += countInsertedWords(text, next)
      text = next
    }
    expect(count).toBe(3)
  })

  it('ignores deletions', () => {
    expect(countInsertedWords('hello world', 'hello')).toBe(0)
    expect(countInsertedWords('hello world', 'hello wold')).toBe(0)
    expect(countInsertedWords('hello', '')).toBe(0)
  })

  it('does not count a continued word when its prefix was already present', () => {
    expect(countInsertedWords('cat', 'cats')).toBe(0)
    expect(countInsertedWords('wor', 'word')).toBe(0)
  })

  it('counts words inserted in the middle of existing text', () => {
    expect(countInsertedWords('hello world', 'hello brave world')).toBe(1)
  })

  it('counts every word of a longer replacement of the old text', () => {
    expect(countInsertedWords('cat', 'dog and bird')).toBe(3)
    expect(countInsertedWords('hello world', 'hello big wide')).toBe(2)
  })

  it('counts a word repeated after text that already ends with it', () => {
    expect(countInsertedWords('ab', 'ab ab')).toBe(1)
  })
})

describe('countPastedWords', () => {
  it('counts whole pasted words', () => {
    expect(countPastedWords('foo bar', undefined)).toBe(2)
  })

  it('does not count a paste that continues an existing word', () => {
    expect(countPastedWords('foo', 'a')).toBe(0)
  })

  it('counts a paste that begins after whitespace', () => {
    expect(countPastedWords('foo', ' ')).toBe(1)
  })

  it('counts each pasted line independently', () => {
    expect(countPastedWords('a\nb c', undefined)).toBe(3)
    expect(countPastedWords('one\ntwo', 'x')).toBe(1)
  })

  it('treats CRLF and lone CR as line breaks between words', () => {
    expect(countPastedWords('one\r\ntwo\rthree', undefined)).toBe(3)
  })
})
