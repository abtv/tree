import { describe, expect, it } from 'vitest'
import type { LinkRange } from '../domain/document'
import { clipboardIntroducesLink, nodeContent, sameNodeContent } from './editor-content-changes'

const link: LinkRange = { start: 2, end: 9, url: 'https://example.com' }

describe('nodeContent', () => {
  it('copies the text and every link field', () => {
    expect(nodeContent({ text: 'a link b', links: [link] })).toEqual({ text: 'a link b', links: [link] })
  })

  it('returns links that are independent of the node', () => {
    const source = { text: 'a link b', links: [link] }
    const content = nodeContent(source)

    expect(content.links[0]).not.toBe(link)
    content.links[0] = { ...link, end: 3 }
    expect(source.links[0]).toEqual(link)
  })

  it('treats absent links as an empty list', () => {
    expect(nodeContent({ text: 'plain' })).toEqual({ text: 'plain', links: [] })
  })
})

describe('sameNodeContent', () => {
  const expected = { text: 'a link b', links: [link] }

  it('accepts equal text and links', () => {
    expect(sameNodeContent({ text: 'a link b', links: [{ ...link }] }, expected)).toBe(true)
  })

  it('treats absent links as equal to an empty expected list', () => {
    expect(sameNodeContent({ text: 'plain' }, { text: 'plain', links: [] })).toBe(true)
  })

  it('rejects different text', () => {
    expect(sameNodeContent({ text: 'other', links: [link] }, expected)).toBe(false)
  })

  it('rejects a different number of links', () => {
    expect(sameNodeContent({ text: 'a link b' }, expected)).toBe(false)
    expect(sameNodeContent({ text: 'a link b', links: [link, link] }, expected)).toBe(false)
  })

  it.each([
    ['start', { ...link, start: 3 }],
    ['end', { ...link, end: 8 }],
    ['url', { ...link, url: 'https://example.org' }],
  ])('rejects a link with a different %s', (_field, changed) => {
    expect(sameNodeContent({ text: 'a link b', links: [changed] }, expected)).toBe(false)
  })

  it('compares each link with the link at the same index', () => {
    const second: LinkRange = { start: 10, end: 14, url: 'https://example.net' }
    const two = { text: 'a link b and more', links: [link, second] }

    expect(sameNodeContent(two, nodeContent(two))).toBe(true)
    expect(sameNodeContent({ ...two, links: [second, link] }, nodeContent(two))).toBe(false)
  })
})

describe('clipboardIntroducesLink', () => {
  it('is true when the payload carries link ranges', () => {
    expect(clipboardIntroducesLink({ kind: 'text', text: 'word', links: [link] })).toBe(true)
  })

  it('is false for an empty link list and plain text', () => {
    expect(clipboardIntroducesLink({ kind: 'text', text: 'word', links: [] })).toBe(false)
    expect(clipboardIntroducesLink({ kind: 'text', text: 'word' })).toBe(false)
  })

  it.each(['\n', '\r\n', '\r'])('is true when one pasted line is a URL, split on %j', (separator) => {
    expect(clipboardIntroducesLink({ kind: 'text', text: `first${separator}https://example.com` })).toBe(true)
  })

  it('is false when a URL is only part of a line', () => {
    expect(clipboardIntroducesLink({ kind: 'text', text: 'see https://example.com' })).toBe(false)
  })
})
