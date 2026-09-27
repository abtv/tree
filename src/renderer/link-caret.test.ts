import { describe, expect, it } from 'vitest'
import { currentLinkDraft, normalCaretTarget } from './link-caret'

describe('normalCaretTarget', () => {
  it('selects exactly one character for a text position', () => {
    expect(normalCaretTarget(5, 2, false)).toEqual({ kind: 'block', start: 2, end: 3 })
  })

  it('clamps a text position to the character range', () => {
    expect(normalCaretTarget(5, -3, false)).toEqual({ kind: 'block', start: 0, end: 1 })
    expect(normalCaretTarget(5, 99, false)).toEqual({ kind: 'block', start: 4, end: 5 })
  })

  it('collapses on an empty node', () => {
    expect(normalCaretTarget(0, 0, false)).toEqual({ kind: 'collapsed', position: 0 })
  })

  it('collapses on the terminal image character of an attached node', () => {
    expect(normalCaretTarget(5, 5, true)).toEqual({ kind: 'collapsed', position: 5 })
    expect(normalCaretTarget(0, 0, true)).toEqual({ kind: 'collapsed', position: 0 })
  })

  it('keeps a text character block before an attached image', () => {
    expect(normalCaretTarget(5, 4, true)).toEqual({ kind: 'block', start: 4, end: 5 })
  })
})

describe('currentLinkDraft', () => {
  const draft = { start: 2, end: 11, url: 'https://x' }

  it('returns the same draft while it addresses its text', () => {
    expect(currentLinkDraft('abhttps://xcd', draft)).toBe(draft)
  })

  it('drops a draft whose text slice no longer matches its url', () => {
    expect(currentLinkDraft('abhttps://ycd', draft)).toBeUndefined()
    expect(currentLinkDraft('ab', draft)).toBeUndefined()
  })

  it('returns undefined for a missing draft', () => {
    expect(currentLinkDraft('text', undefined)).toBeUndefined()
  })
})
