import { describe, expect, it } from 'vitest'
import {
  insertLinks,
  linkAtPosition,
  linksForLine,
  normalizeLinks,
  reconcileLinkTextEdit,
  replaceLinkedText,
  replaceLinkedTextRanges,
} from './document-links'

describe('link normalization and edit outcomes', () => {
  const url = 'https://a.test'
  const link = { start: 0, end: url.length, url }

  it('keeps link edits at the first character and at a middle-node endpoint distinct from new link creation', () => {
    expect(reconcileLinkTextEdit(url, [link], 'Https://a.test')).toEqual({
      links: [{ ...link, url: 'Https://a.test' }],
      createsNewLink: false,
    })
    const text = `before ${url} after`
    expect(reconcileLinkTextEdit(text, [{ ...link, start: 7, end: 7 + url.length }], `before ${url}/x after`)).toEqual({
      links: [{ start: 7, end: 7 + url.length + 2, url: `${url}/x` }],
      createsNewLink: false,
    })
  })

  it('rejects invalid range bounds even when matching text is not required', () => {
    for (const invalid of [
      { ...link, start: -1 },
      { ...link, start: 2, end: 2 },
      { ...link, end: url.length + 1 },
      { ...link, start: 5, end: 4 },
    ])
      expect(normalizeLinks([invalid], url, false)).toEqual([])
    expect(
      normalizeLinks(
        [
          { ...link, start: -1 },
          { ...link, start: 2, end: 2 },
          { ...link, end: url.length + 1 },
          { ...link, start: 5, end: 4 },
          link,
        ],
        url,
        false,
      ),
    ).toEqual([link])
  })

  it('retains or shifts an invalid URL draft when an unrelated word changes', () => {
    const draft = { start: 2, end: 5, url: 'bad' }
    expect(reconcileLinkTextEdit('x bad z', [], 'xx bad z', draft)).toEqual({
      links: [],
      createsNewLink: false,
      draft: { start: 3, end: 6, url: 'bad' },
    })
    expect(reconcileLinkTextEdit('x bad z', [], 'x bad zz', draft)).toEqual({
      links: [],
      createsNewLink: false,
      draft,
    })
  })

  it('recognizes a URL completed by inserting its scheme before an existing hostname', () => {
    expect(replaceLinkedTextRanges('before a.test after', [], [{ start: 7, end: 7, inserted: 'https://' }])).toEqual({
      text: `before ${url} after`,
      links: [{ ...link, start: 7, end: 7 + url.length }],
      createsNewLink: true,
    })
  })

  it('does not move a deleted link onto identical following text during disjoint edits', () => {
    expect(replaceLinkedTextRanges(url + url, [link], [{ start: 0, end: url.length, inserted: '' }])).toEqual({
      text: url,
      links: [link],
      createsNewLink: true,
    })
    // The remaining URL becomes a new link through token recognition, rather
    // than inheriting the removed range. The creation flag distinguishes them.
  })

  it('returns normalized links and the existing draft for an unchanged edit', () => {
    const draft = { start: url.length + 1, end: url.length + 4, url: 'bad' }
    expect(reconcileLinkTextEdit(`${url} bad`, [link], `${url} bad`, draft)).toEqual({
      links: [link],
      draft,
      createsNewLink: false,
    })
    expect(reconcileLinkTextEdit(url, [link], url)).toEqual({ links: [link], createsNewLink: false })
  })

  it('extends a link at its first and last character without creating a new link', () => {
    expect(reconcileLinkTextEdit(url, [link], `${url}/path`)).toEqual({
      links: [{ ...link, end: url.length + 5, url: `${url}/path` }],
      createsNewLink: false,
    })
    const http = 'http://a.test'
    expect(reconcileLinkTextEdit(http, [{ start: 0, end: http.length, url: http }], url)).toEqual({
      links: [link],
      createsNewLink: false,
    })
  })

  it('keeps unrelated whitespace after a link outside its range', () => {
    expect(reconcileLinkTextEdit(url, [link], `${url} words`)).toEqual({ links: [link], createsNewLink: false })
    const invalid = reconcileLinkTextEdit(url, [link], 'https ://a.test')
    expect(invalid).toEqual({
      links: [],
      draft: { start: 0, end: url.length + 1, url: 'https ://a.test' },
      createsNewLink: false,
    })
    expect(reconcileLinkTextEdit('https ://a.test', [], url, invalid.draft)).toEqual({
      links: [link],
      createsNewLink: false,
    })
    expect(reconcileLinkTextEdit(url, [link], '')).toEqual({ links: [], createsNewLink: false })
  })

  it('shifts neighboring links when replacing text immediately before them', () => {
    const text = `abc${url}`
    expect(reconcileLinkTextEdit(text, [{ ...link, start: 3, end: text.length }], `x${url}`)).toEqual({
      links: [{ ...link, start: 1, end: url.length + 1 }],
      createsNewLink: false,
    })
  })

  it('creates a new URL token without consuming unrelated neighboring links', () => {
    const text = `${url} https://b.tes ${url}`
    const lastStart = text.lastIndexOf(url)
    expect(
      reconcileLinkTextEdit(
        text,
        [link, { ...link, start: lastStart, end: text.length }],
        text.replace('b.tes ', 'b.test '),
      ),
    ).toEqual({
      links: [
        link,
        { start: url.length + 1, end: url.length * 2 + 1, url: 'https://b.test' },
        { ...link, start: lastStart + 1, end: text.length + 1 },
      ],
      createsNewLink: true,
    })
  })

  it('maps rich ranges for each line and excludes ranges that cross a newline', () => {
    const lines = [url, '', 'https://b.test']
    const start = url.length + 2
    const last = { start, end: start + url.length, url: lines[2]! }
    const links = [link, last, { start: url.length - 1, end: start + 1, url }]
    expect(linksForLine(links, lines, 0)).toEqual([link])
    expect(linksForLine(links, lines, 1)).toEqual([])
    expect(linksForLine(links, lines, 2)).toEqual([{ ...link, url: lines[2] }])
    expect(linksForLine(undefined, lines, 2)).toEqual([])
  })

  it('applies disjoint replacements in document order and preserves links next to both edits', () => {
    const text = `abc${url}xyz`
    const result = replaceLinkedTextRanges(
      text,
      [{ ...link, start: 3, end: 3 + url.length }],
      [
        { start: text.length - 3, end: text.length, inserted: '!' },
        { start: 3, end: 0, inserted: '?' },
      ],
    )
    expect(result).toEqual({
      text: `?${url}!`,
      links: [{ ...link, start: 1, end: 1 + url.length }],
      createsNewLink: false,
    })
  })

  it('orders an insertion before a replacement at the same offset', () => {
    expect(
      replaceLinkedTextRanges(
        'abc',
        [],
        [
          { start: 0, end: 1, inserted: 'X' },
          { start: 0, end: 0, inserted: 'Y' },
        ],
      ),
    ).toEqual({ text: 'YXbc', links: [], createsNewLink: false })
  })

  it('recognizes a URL token completed by an edit in the middle of surrounding text', () => {
    expect(
      replaceLinkedTextRanges(
        `before https://a.tes after`,
        [],
        [
          {
            start: 20,
            end: 20,
            inserted: 't',
          },
        ],
      ),
    ).toEqual({
      text: `before ${url} after`,
      links: [{ ...link, start: 7, end: 7 + url.length }],
      createsNewLink: true,
    })
  })

  it('does not report a retained URL token as newly created', () => {
    expect(replaceLinkedTextRanges(url, [link], [{ start: url.length, end: url.length, inserted: '' }])).toEqual({
      text: url,
      links: [link],
      createsNewLink: false,
    })
  })

  it('preserves links on both sides of a newly inserted URL', () => {
    const text = `${url}  ${url}`
    const lastStart = url.length + 2
    const inserted = 'https://b.test'
    expect(
      replaceLinkedTextRanges(
        text,
        [link, { ...link, start: lastStart, end: text.length }],
        [{ start: url.length + 1, end: url.length + 1, inserted }],
      ),
    ).toEqual({
      text: `${url} ${inserted} ${url}`,
      links: [
        link,
        { ...link, start: url.length + 1, end: url.length * 2 + 1, url: inserted },
        { ...link, start: lastStart + inserted.length, end: text.length + inserted.length },
      ],
      createsNewLink: true,
    })
  })
})

describe('replaceLinkedText', () => {
  it('preserves unaffected links and shifts them around an edit', () => {
    const url = 'https://example.com'
    const text = `before ${url} after`
    const start = text.indexOf(url)

    expect(replaceLinkedText(text, [{ start, end: start + url.length, url }], 0, 6, 'now').links).toEqual([
      { start: 4, end: 4 + url.length, url },
    ])
  })

  it('removes a link intersected by the replacement', () => {
    const url = 'https://example.com'
    expect(replaceLinkedText(url, [{ start: 0, end: url.length, url }], 3, 4, '').links).toEqual([])
  })

  it('inserts at the requested character within a link', () => {
    const url = 'https://example.com'
    const result = replaceLinkedText(url, [{ start: 0, end: url.length, url }], 2, 2, 'X')

    expect(result.text).toBe('htXtps://example.com')
    expect(result.links).toEqual([])

    const valid = replaceLinkedText(url, [{ start: 0, end: url.length, url }], url.length, url.length, '/a')
    expect(valid.links).toEqual([{ start: 0, end: url.length + 2, url: `${url}/a` }])
  })
})

describe('insertLinks', () => {
  const url = 'https://example.com'
  const link = { start: 0, end: url.length, url }

  it('recomputes the URL and keeps a link a paste lands inside when the covered text stays valid', () => {
    expect(insertLinks([link], 15, 'x')).toEqual([{ start: 0, end: 20, url: 'https://examplex.com' }])
  })

  it('drops a link a paste lands inside when the covered text is no longer a valid URL', () => {
    expect(insertLinks([link], 5, 'XYZ')).toEqual([])
  })

  it('leaves a link untouched when the paste lands exactly at either boundary', () => {
    expect(insertLinks([link], url.length, '!')).toEqual([link])
    expect(insertLinks([link], 0, '!')).toEqual([{ start: 1, end: url.length + 1, url }])
  })

  it('keeps a valid pasted link range when the surrounding link is dropped', () => {
    const pasted = 'https://paste.example'
    const result = insertLinks([link], 5, pasted, [{ start: 0, end: pasted.length, url: pasted }])
    expect(result).toEqual([{ start: 5, end: 5 + pasted.length, url: pasted }])
  })
})

describe('linkAtPosition', () => {
  const url = 'https://example.com'
  const link = { start: 1, end: 1 + url.length, url }

  it('matches the link at its first and last character', () => {
    expect(linkAtPosition([link], link.start)).toEqual(link)
    expect(linkAtPosition([link], link.end - 1)).toEqual(link)
  })

  it('does not match the characters immediately before or after the link', () => {
    expect(linkAtPosition([link], link.start - 1)).toBeUndefined()
    expect(linkAtPosition([link], link.end)).toBeUndefined()
  })

  it('returns undefined when there are no links', () => {
    expect(linkAtPosition(undefined, 0)).toBeUndefined()
    expect(linkAtPosition([], 0)).toBeUndefined()
  })

  it('picks the link that actually covers the position among several', () => {
    const other = { start: link.end + 5, end: link.end + 10, url: 'https://example.org' }
    expect(linkAtPosition([link, other], other.start)).toEqual(other)
    expect(linkAtPosition([link, other], link.start)).toEqual(link)
  })
})

describe('replaceLinkedTextRanges', () => {
  const url = 'https://example.com'

  it('keeps a link wrapped by two insertions and shifts it behind the opening delimiter', () => {
    const result = replaceLinkedTextRanges(
      url,
      [{ start: 0, end: url.length, url }],
      [
        { start: 0, end: 0, inserted: '(' },
        { start: url.length, end: url.length, inserted: ')' },
      ],
    )
    expect(result.text).toBe(`(${url})`)
    expect(result.links).toEqual([{ start: 1, end: url.length + 1, url }])
    expect(result.createsNewLink).toBe(false)
  })

  it('shifts a link that follows the wrapped range by both delimiters', () => {
    const text = `ab ${url}`
    const result = replaceLinkedTextRanges(
      text,
      [{ start: 3, end: text.length, url }],
      [
        { start: 0, end: 0, inserted: '"' },
        { start: 2, end: 2, inserted: '"' },
      ],
    )
    expect(result.text).toBe(`"ab" ${url}`)
    expect(result.links).toEqual([{ start: 5, end: text.length + 2, url }])
  })

  it('creates a link when removing delimiters exposes a bare URL', () => {
    const text = `"${url}"`
    const result = replaceLinkedTextRanges(
      text,
      [],
      [
        { start: 0, end: 1, inserted: '' },
        { start: text.length - 1, end: text.length, inserted: '' },
      ],
    )
    expect(result.text).toBe(url)
    expect(result.links).toEqual([{ start: 0, end: url.length, url }])
    expect(result.createsNewLink).toBe(true)
  })

  it('drops a link that an edit splits', () => {
    const result = replaceLinkedTextRanges(
      url,
      [{ start: 0, end: url.length, url }],
      [{ start: 4, end: 4, inserted: 'X' }],
    )
    expect(result.links).toEqual([])
  })

  it('leaves the text unchanged when two edits overlap', () => {
    const result = replaceLinkedTextRanges(
      'abcdef',
      [],
      [
        { start: 0, end: 4, inserted: 'X' },
        { start: 2, end: 5, inserted: 'Y' },
      ],
    )
    expect(result.text).toBe('abcdef')
  })

  it('clamps edit bounds to the text', () => {
    const result = replaceLinkedTextRanges('ab', [], [{ start: 5, end: 9, inserted: '!' }])
    expect(result.text).toBe('ab!')
  })
})
