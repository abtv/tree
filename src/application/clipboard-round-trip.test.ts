import { describe, expect, it } from 'vitest'
import { clipboardSelectionTransition } from './editor-clipboard-transitions'
import { extractClipboardLinks } from '../infrastructure/main/clipboard'
import { pasteText, requireNode, type Document, type LinkRange } from '../domain/document'

function sourceDocument(text: string, links: readonly LinkRange[] = []): Document {
  return { roots: [{ id: 'source', text, ...(links.length === 0 ? {} : { links }), children: [] }] }
}

function emptyTarget(): Document {
  return { roots: [{ id: 'target', text: '', children: [] }] }
}

function roundTrip(text: string, links: readonly LinkRange[], from: number, to: number): readonly LinkRange[] {
  const copied = clipboardSelectionTransition(sourceDocument(text, links), 'source', from, to)
  if (copied === undefined) throw new Error('Expected a non-empty selection.')
  const extracted = extractClipboardLinks(copied.payload.html, copied.payload.text)
  const pasted = pasteText(emptyTarget(), 'target', 0, copied.payload.text, extracted)
  return requireNode(pasted, 'target').node.links ?? []
}

describe('clipboard rich-copy round trip', () => {
  it('preserves a link whose URL contains an ampersand in its query string', () => {
    const url = 'https://example.test/x?a=1&b=2'
    const text = `See ${url} for details`
    const links: LinkRange[] = [{ start: 4, end: 4 + url.length, url }]

    const copied = clipboardSelectionTransition(sourceDocument(text, links), 'source', 0, text.length)!
    const extracted = extractClipboardLinks(copied.payload.html, copied.payload.text)

    expect(extracted).toEqual(links)
    expect(roundTrip(text, links, 0, text.length)).toEqual(links)
  })

  it('preserves unlinked surrounding text containing <, >, &, and "', () => {
    const url = 'https://example.test'
    const text = `<tag> & "quotes" go to ${url} now`
    const links: LinkRange[] = [{ start: text.indexOf(url), end: text.indexOf(url) + url.length, url }]

    const copied = clipboardSelectionTransition(sourceDocument(text, links), 'source', 0, text.length)!
    const extracted = extractClipboardLinks(copied.payload.html, copied.payload.text)

    expect(extracted).toEqual(links)
    expect(roundTrip(text, links, 0, text.length)).toEqual(links)
  })

  it('locates a link correctly when a newline in the surrounding text precedes it', () => {
    const url = 'https://example.test'
    const text = `First\nSecond ${url} end`
    const links: LinkRange[] = [{ start: text.indexOf(url), end: text.indexOf(url) + url.length, url }]

    const copied = clipboardSelectionTransition(sourceDocument(text, links), 'source', 0, text.length)!
    const extracted = extractClipboardLinks(copied.payload.html, copied.payload.text)

    expect(extracted).toEqual(links)
    expect(roundTrip(text, links, 0, text.length)).toEqual(links)
  })

  it('emits no anchor and no link for a partially selected link', () => {
    const url = 'https://example.test/path'
    const text = url
    const links: LinkRange[] = [{ start: 0, end: url.length, url }]

    const copied = clipboardSelectionTransition(sourceDocument(text, links), 'source', 0, 10)!
    const extracted = extractClipboardLinks(copied.payload.html, copied.payload.text)

    expect(copied.payload.html).not.toContain('<a ')
    expect(extracted).toEqual([])
    expect(roundTrip(text, links, 0, 10)).toEqual([])
  })

  it('recovers two distinct links from one selection in text order', () => {
    const first = 'https://example.test'
    const second = 'https://example.org'
    const text = `Go to ${first} then ${second} please`
    const links: LinkRange[] = [
      { start: text.indexOf(first), end: text.indexOf(first) + first.length, url: first },
      { start: text.indexOf(second), end: text.indexOf(second) + second.length, url: second },
    ]

    const copied = clipboardSelectionTransition(sourceDocument(text, links), 'source', 0, text.length)!
    const extracted = extractClipboardLinks(copied.payload.html, copied.payload.text)

    expect(extracted).toEqual(links)
    expect(roundTrip(text, links, 0, text.length)).toEqual(links)
  })

  it('locates the actually linked occurrence when the same URL text appears twice', () => {
    const url = 'https://example.test'
    const text = `${url} not linked, but ${url} is linked`
    const secondStart = text.lastIndexOf(url)
    const links: LinkRange[] = [{ start: secondStart, end: secondStart + url.length, url }]

    const copied = clipboardSelectionTransition(sourceDocument(text, links), 'source', 0, text.length)!
    const extracted = extractClipboardLinks(copied.payload.html, copied.payload.text)

    expect(extracted).toEqual(links)
    expect(roundTrip(text, links, 0, text.length)).toEqual(links)
  })
})
