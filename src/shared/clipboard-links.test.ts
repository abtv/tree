import { describe, expect, it } from 'vitest'
import { extractClipboardLinks } from './clipboard-links'

describe('clipboard link extraction', () => {
  it('does not extract a link from an unterminated opening attribute matching literal clipboard text', () => {
    expect(extractClipboardLinks('<a href="url>label</a>', '<a href="url>label')).toEqual([])
  })

  it.each(['data=x" > href="url" extra="x', 'data=x" name> href="url" extra="x', 'data=x"> href="url" extra="x'])(
    'does not recover an href past a malformed attribute terminator: %s',
    (attributes) => {
      const html = `<a ${attributes}>label</a>`

      expect(extractClipboardLinks(html, 'label')).toEqual([{ start: 0, end: 5, url: '' }])
    },
  )

  it('does not invent a line break from a malformed tag containing a break-like suffix', () => {
    const html = '<a href="url">before<foo<br>after</a>'

    expect(extractClipboardLinks(html, 'before\nafter')).toEqual([])
  })

  it('does not invent a URL from an unterminated href after a malformed unrelated attribute', () => {
    const html = '<a data=unquoted" href="https://example.com>label</a>'

    expect(extractClipboardLinks(html, 'label')).toEqual([{ start: 0, end: 5, url: '' }])
  })

  it('preserves the entire link label through unknown inline elements', () => {
    const html = '<a href="https://example.com">before<ba>inside</ba>after</a>'

    expect(extractClipboardLinks(html, 'beforeinsideafter')).toEqual([
      { start: 0, end: 17, url: 'https://example.com' },
    ])
  })

  it.each(['/', '>'])('keeps an href after a quoted attribute ending in %j', (title) => {
    const html = `<a title="${title}" href="https://example.com">label</a>`

    expect(extractClipboardLinks(html, 'label')).toEqual([{ start: 0, end: 5, url: 'https://example.com' }])
  })

  it.each(['<', '</', 'text<', 'text</'])('does not throw on truncated markup %j', (html) => {
    expect(extractClipboardLinks(html, 'text')).toEqual([])
  })

  it.each(['/', ' /'])('does not read an href after a self-closing marker %j', (marker) => {
    expect(extractClipboardLinks(`<a${marker} href="unreachable">label</a>`, 'label')).toEqual([
      { start: 0, end: 5, url: '' },
    ])
  })

  it('ignores orphan closing anchors before a real link with the same label', () => {
    expect(extractClipboardLinks('</a >label<a href="url">label</a>', 'labellabel')).toEqual([
      { start: 5, end: 10, url: 'url' },
    ])
  })

  it('does not use a later duplicate href when the first href has no quoted value', () => {
    for (const attributes of ['href href="later"', 'href=unquoted href="later"']) {
      expect(extractClipboardLinks(`<a ${attributes}>label</a>`, 'label')).toEqual([{ start: 0, end: 5, url: '' }])
    }
  })

  it('skips an entire unquoted attribute value containing href-like text', () => {
    expect(extractClipboardLinks('<a data-x=href="wrong" href="right">label</a>', 'label')).toEqual([
      { start: 0, end: 5, url: 'right' },
    ])
  })

  it.each(['<br>', '<BR />', '<br\t/\n>', '<br\u00a0>', '<br /  >'])('retains %s inside a link label', (tag) => {
    expect(extractClipboardLinks(`<a href="url">first${tag}second</a>`, 'first\nsecond')).toEqual([
      { start: 0, end: 12, url: 'url' },
    ])
  })

  it('assigns successive identical labels to their own URLs', () => {
    expect(extractClipboardLinks('<a href="one">x</a><a href="two">x</a>', 'xx')).toEqual([
      { start: 0, end: 1, url: 'one' },
      { start: 1, end: 2, url: 'two' },
    ])
  })

  it('ignores angle brackets inside double-quoted attributes', () => {
    expect(extractClipboardLinks('<a title="a>b" href="url">label</a>', 'label')).toEqual([
      { start: 0, end: 5, url: 'url' },
    ])
  })

  it.each(['<a', '<a/', '<a href="url">label</a'])('ignores unfinished tag %s', (html) => {
    expect(extractClipboardLinks(html, 'label')).toEqual([])
  })

  it('does not treat a closing tag as the next opening anchor', () => {
    expect(extractClipboardLinks('</a>prefix<a href="url">label</a>', 'prefixlabel')).toEqual([
      { start: 6, end: 11, url: 'url' },
    ])
  })

  it('keeps literal less-than characters at the end of a label', () => {
    expect(extractClipboardLinks('<a href="url">value <</a>', 'value <')).toEqual([{ start: 0, end: 7, url: 'url' }])
  })

  it('skips unquoted unrelated attributes without reading them as href', () => {
    expect(extractClipboardLinks('<a data-x=value>label</a>', 'label')).toEqual([{ start: 0, end: 5, url: '' }])
    expect(extractClipboardLinks('<a href=unquoted title="other">label</a>', 'label')).toEqual([
      { start: 0, end: 5, url: '' },
    ])
  })

  it.each([' ', '\t', '\n', '\r', '\f'])('accepts HTML attribute whitespace %j and mixed-case names', (space) => {
    expect(
      extractClipboardLinks(
        `<A${space}title='a>b'${space}HREF${space}=${space}'https://example.com'>label</A>`,
        'label',
      ),
    ).toEqual([{ start: 0, end: 5, url: 'https://example.com' }])
  })

  it.each([
    ['&AMP;&QUOT;&LT;&GT;&NBSP;', '&"<>\u00a0'],
    ['&#x1F600;&#128512;', '😀😀'],
    ['&#55296;&#57343;&#1114112;', '\ufffd\ufffd\ufffd'],
    ['&#55295;&#57344;&#1114111;', '\ud7ff\ue000\udbff\udfff'],
  ])('decodes label references %s without changing UTF-16 ranges', (encoded, label) => {
    expect(extractClipboardLinks(`<a href="https://example.com">${encoded}</a>`, label)).toEqual([
      { start: 0, end: label.length, url: 'https://example.com' },
    ])
  })

  it.each(['<abbr>wrong</abbr>', '</a>wrong', '<a href="unterminated>wrong', '<a href="x">wrong'])(
    'ignores incomplete or non-anchor markup %s',
    (html) => {
      expect(extractClipboardLinks(html, 'wrong')).toEqual([])
    },
  )

  it.each(['disabled href="url"', 'data-x=value href="url"', 'title="href=wrong" href="url"', '= href="url"'])(
    'finds href after unrelated attributes: %s',
    (attributes) => {
      expect(extractClipboardLinks(`<a ${attributes}>label</a>`, 'label')).toEqual([{ start: 0, end: 5, url: 'url' }])
    },
  )

  it.each(['href=unquoted', 'href', 'title="other"', '/'])('does not invent a URL for %s', (attributes) => {
    expect(extractClipboardLinks(`<a ${attributes}>label</a>`, 'label')).toEqual([{ start: 0, end: 5, url: '' }])
  })

  it('counts unmatched anchors toward the scanning limit', () => {
    const html = '<a href="x">absent</a>'.repeat(100) + '<a href="last">present</a>'

    expect(extractClipboardLinks(html, 'present')).toEqual([])
  })

  it('preserves duplicate unlinked text and markup before the actual link', () => {
    expect(extractClipboardLinks('<b>label</b> &amp; <a href="url"><i>label</i></a>', 'label & label')).toEqual([
      { start: 8, end: 13, url: 'url' },
    ])
  })

  it('accepts the HTML size boundary but rejects one additional character', () => {
    const anchor = '<a href="url">label</a>'
    const html = anchor + ' '.repeat(1_048_576 - anchor.length)

    expect(extractClipboardLinks(html, 'label')).toEqual([{ start: 0, end: 5, url: 'url' }])
    expect(extractClipboardLinks(html + ' ', 'label')).toEqual([])
  })

  it('retains the original href for a partial hyperlink label', () => {
    expect(extractClipboardLinks('<a href="https://example.com">example.com</a>', 'example.com')).toEqual([
      { start: 0, end: 11, url: 'https://example.com' },
    ])
  })

  it('decodes a non-breaking space in a hyperlink label to match the text flavor', () => {
    expect(extractClipboardLinks('<a href="https://example.com">A&nbsp;B</a>', 'A\u00a0B')).toEqual([
      { start: 0, end: 3, url: 'https://example.com' },
    ])
  })

  it('decodes decimal and hexadecimal numeric references in hyperlink labels', () => {
    expect(extractClipboardLinks('<a href="https://example.com">A&#8203;&#x2019;B</a>', 'A\u200b\u2019B')).toEqual([
      { start: 0, end: 4, url: 'https://example.com' },
    ])
  })

  it('decodes HTML character references only once', () => {
    expect(extractClipboardLinks('<a href="https://example.com">&amp;lt;</a>', '&lt;')).toEqual([
      { start: 0, end: 4, url: 'https://example.com' },
    ])
  })

  it('decodes an escaped ampersand in an href once', () => {
    expect(extractClipboardLinks('<a href="https://example.com/?a=1&amp;b=2">label</a>', 'label')).toEqual([
      { start: 0, end: 5, url: 'https://example.com/?a=1&b=2' },
    ])
  })

  it('keeps multiple decoded hyperlink ranges in text order', () => {
    expect(
      extractClipboardLinks(
        '<a href="https://one.example/?x=1&amp;y=2">One&nbsp;link</a> and <a href="https://two.example/">Two&#33;</a>',
        'One\u00a0link and Two!',
      ),
    ).toEqual([
      { start: 0, end: 8, url: 'https://one.example/?x=1&y=2' },
      { start: 13, end: 17, url: 'https://two.example/' },
    ])
  })

  it('ignores anchors with empty text or text absent from the clipboard strings', () => {
    expect(extractClipboardLinks('<a href="https://example.com"></a>', 'plain text')).toEqual([])
    expect(extractClipboardLinks('<a href="https://example.com">missing</a>', 'plain text')).toEqual([])
  })

  it('caps the number of links extracted from clipboard HTML', () => {
    const linkCount = 105
    const html = Array.from({ length: linkCount }, (_, index) => `<a href="https://${index}.example">x</a>`).join(' ')

    expect(extractClipboardLinks(html, 'x '.repeat(linkCount))).toHaveLength(100)
  })

  it('finishes promptly on repeated malformed anchor prefixes', () => {
    const malformed = '<a '.repeat(10_000)
    const startedAt = performance.now()

    expect(extractClipboardLinks(malformed, '')).toEqual([])
    expect(performance.now() - startedAt).toBeLessThan(2_000)
  }, 5_000)

  it('retains a link after a long malformed break tag without blocking clipboard parsing', () => {
    const html = `<br${' '.repeat(128_000)}x><a href="https://example.com">label</a>`
    const startedAt = performance.now()

    const links = extractClipboardLinks(html, 'label')
    const elapsed = performance.now() - startedAt

    expect(links).toEqual([{ start: 0, end: 5, url: 'https://example.com' }])
    expect(elapsed).toBeLessThan(2_000)
  }, 15_000)

  it.each(['<br>', '<BR />', '<br\t/\n>', '<br\u00a0>'])('preserves line breaks from %s before links', (tag) => {
    const html = `label${tag}<a href="https://example.com">label</a>`

    const links = extractClipboardLinks(html, 'label\nlabel')

    expect(links).toEqual([{ start: 6, end: 11, url: 'https://example.com' }])
  })
})
