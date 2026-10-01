import { describe, expect, it } from 'vitest'
import {
  attachImage,
  attachmentSummary,
  cloneDocument,
  cloneNodeWithNewIds,
  createFirstChild,
  createInitialDocument,
  deleteLink,
  deleteNode,
  editNodeText,
  ensureRoot,
  insertSiblingAfter,
  insertSubtreeSibling,
  moveSibling,
  pasteMultilineText,
  pasteText,
  normalizeVisibleLocation,
  removeTextRange,
  replaceSiblingRange,
  splitNode,
  type Document,
  type TreeNode,
} from './document'

const attachment = { id: 'shared-image', mimeType: 'image/png' as const }
const url = 'https://a.test'
const link = { start: 0, end: url.length, url }

describe('document operation content and retention outcomes', () => {
  it('creates URL siblings with complete metadata and plain siblings without optional fields', () => {
    const document = createInitialDocument('root')
    expect(insertSiblingAfter(document, 'root', 'linked', url, attachment).roots[1]).toEqual({
      id: 'linked',
      text: url,
      links: [link],
      attachment,
      children: [],
    })
    expect(insertSiblingAfter(document, 'root', 'plain', 'ordinary').roots[1]).toEqual({
      id: 'plain',
      text: 'ordinary',
      children: [],
    })
    expect(insertSiblingAfter(document, 'root', 'plain', 'ordinary').roots[1]).not.toHaveProperty('attachment')
  })

  it('does not retain a deleted link over identical text after a larger range removal', () => {
    const document: Document = { roots: [{ id: 'root', text: `${url} ${url}`, links: [link], children: [] }] }
    expect(removeTextRange(document, 'root', 0, url.length + 1).roots[0]).toEqual({
      id: 'root',
      text: url,
      children: [],
    })
  })

  it('leaves images absent from every node in an image-free multiline paste', () => {
    const result = pasteMultilineText(createInitialDocument('root'), 'root', 0, ['a', 'b', 'c'], ['b', 'c'])
    for (const node of result.roots) expect(node).not.toHaveProperty('attachment')
  })

  it('normalizes a hidden selection beneath a current parent at depth two', () => {
    const document: Document = {
      roots: [
        {
          id: 'root',
          text: '',
          children: [
            {
              id: 'parent',
              text: '',
              children: [{ id: 'child', text: '', children: [{ id: 'leaf', text: '', children: [] }] }],
            },
          ],
        },
      ],
    }
    expect(
      normalizeVisibleLocation(document, { currentParentId: 'parent', selectedNodeId: 'leaf' }, () => false),
    ).toEqual({
      currentParentId: 'parent',
      selectedNodeId: 'child',
    })
  })

  it('preserves complete hyperlinks on both sides of a node split', () => {
    const text = `${url} ${url}`
    const document: Document = {
      roots: [{ id: 'root', text, links: [link, { ...link, start: url.length + 1, end: text.length }], children: [] }],
    }
    expect(splitNode(document, 'root', url.length + 1, 'new').roots).toEqual([
      { id: 'root', text: `${url} `, links: [link], children: [] },
      { id: 'new', text: url, links: [link], children: [] },
    ])
  })
  it('shares attachment summaries across operations that preserve their occurrences', () => {
    const document: Document = {
      roots: [
        { id: 'root', text: url, links: [link], attachment, children: [] },
        { id: 'other', text: '', children: [] },
      ],
    }
    const summary = attachmentSummary(document)
    const results = [
      deleteLink(document, 'root', url.length)!,
      removeTextRange(document, 'root', 0, 1),
      createFirstChild(document, 'root', 'child'),
      splitNode(document, 'root', 1, 'new'),
      moveSibling(document, 'root', 1),
      pasteText(document, 'root', 0, '!'),
      pasteMultilineText(document, 'root', 0, ['a', 'b'], ['new']),
      attachImage(document, 'root', attachment),
      insertSubtreeSibling(document, 'root', 'after', { id: 'source', text: '', children: [] }, () => 'copy'),
    ]
    for (const result of results) {
      expect(attachmentSummary(result)).toBe(summary)
      expect(new Map(attachmentSummary(result))).toEqual(new Map([[attachment.id, 1]]))
    }
    const initial = createInitialDocument('empty')
    expect(attachmentSummary(initial)).toBe(attachmentSummary(createFirstChild(initial, 'empty', 'child')))
  })
  // @requirement PRODUCT.md §2.4
  it('selects the collapsed child beneath an expanded root at the root location', () => {
    const document: Document = {
      roots: [
        {
          id: 'root',
          text: '',
          children: [
            {
              id: 'child',
              text: '',
              children: [{ id: 'leaf', text: '', children: [] }],
            },
          ],
        },
      ],
    }
    expect(
      normalizeVisibleLocation(document, { currentParentId: null, selectedNodeId: 'leaf' }, (id) => id === 'root'),
    ).toEqual({ currentParentId: null, selectedNodeId: 'child' })
  })
  it('creates a root only when the document has none', () => {
    expect(ensureRoot({ roots: [] }, 'new')).toEqual({ roots: [{ id: 'new', text: '', children: [] }] })
    const document: Document = { roots: [{ id: 'existing', text: 'keep', children: [] }] }
    expect(ensureRoot(document, 'new')).toBe(document)
  })

  it('clones all nested content without sharing mutable copies', () => {
    const leaf: TreeNode = { id: 'leaf', text: url, links: [link], attachment, children: [] }
    const document: Document = {
      roots: [{ id: 'root', text: url, links: [link], attachment, children: [leaf] }],
    }
    const cloned = cloneDocument(document)
    expect(cloned).toEqual(document)
    for (const [copy, original] of [
      [cloned.roots[0]!, document.roots[0]!],
      [cloned.roots[0]!.children[0]!, leaf],
    ]) {
      expect(copy).not.toBe(original)
      expect(copy!.links).not.toBe(original!.links)
      expect(copy!.links![0]).not.toBe(original!.links![0])
      expect(copy!.attachment).not.toBe(original!.attachment)
      expect(copy!.children).not.toBe(original!.children)
    }
    let id = 0
    const fresh = cloneNodeWithNewIds(document.roots[0]!, () => `copy-${id++}`)
    expect(fresh).toEqual({ ...document.roots[0], id: 'copy-0', children: [{ ...leaf, id: 'copy-1' }] })
    expect(fresh.children[0]!.attachment).not.toBe(leaf.attachment)
    expect(fresh.children[0]!.links![0]).not.toBe(leaf.links![0])
  })

  // @requirement PRODUCT.md §13
  it('removes old hyperlink ranges when replacing node text with ordinary text', () => {
    const document: Document = { roots: [{ id: 'root', text: url, links: [link], attachment, children: [] }] }
    expect(editNodeText(document, 'root', 'ordinary').roots[0]).toEqual({
      id: 'root',
      text: 'ordinary',
      attachment,
      children: [],
    })
  })

  it('deletes the middle of adjacent links and shifts only the links that follow it', () => {
    const urls = ['https://a.test', 'https://b.test', 'https://c.test']
    const length = urls[0]!.length
    const links = urls.map((url, index) => ({ start: index * length, end: (index + 1) * length, url }))
    const document: Document = { roots: [{ id: 'root', text: urls.join(''), links, attachment, children: [] }] }
    const result = deleteLink(document, 'root', length * 2)!
    expect(result.roots[0]).toEqual({
      id: 'root',
      text: urls[0]! + urls[2]!,
      attachment,
      children: [],
      links: [links[0], { start: length, end: length * 2, url: urls[2] }],
    })
    expect(document.roots[0]!.links).toEqual(links)
  })

  it('removes intersected links while retaining adjacent links around a reversed deletion', () => {
    const urls = ['https://a.test', 'https://b.test', 'https://c.test']
    const length = urls[0]!.length
    const links = urls.map((url, index) => ({ start: index * length, end: (index + 1) * length, url }))
    const document: Document = { roots: [{ id: 'root', text: urls.join(''), links, children: [] }] }
    const result = removeTextRange(document, 'root', length * 2, length)
    expect(result.roots[0]!.text).toBe(urls[0]! + urls[2]!)
    expect(result.roots[0]!.links).toEqual([links[0], { start: length, end: length * 2, url: urls[2] }])
    expect(removeTextRange(document, 'root', length, length).roots[0]).toEqual(document.roots[0])
    const partial = removeTextRange(document, 'root', length + 1, length + 2)
    expect(partial.roots[0]!.links).toEqual([links[0], { ...links[2], start: length * 2 - 1, end: length * 3 - 1 }])
  })

  it('does not transfer a deleted hyperlink onto identical ordinary text that follows it', () => {
    const document: Document = { roots: [{ id: 'root', text: url + url, links: [link], children: [] }] }
    expect(deleteLink(document, 'root', url.length)!.roots[0]).toEqual({ id: 'root', text: url, children: [] })
    expect(removeTextRange(document, 'root', 0, url.length).roots[0]).toEqual({ id: 'root', text: url, children: [] })
  })

  // @requirement PRODUCT.md §17
  it('keeps shared attachments until their last occurrence is removed by range replacement', () => {
    const node = (id: string, image = attachment): TreeNode => ({ id, text: '', attachment: image, children: [] })
    const document: Document = { roots: [node('a'), node('b'), node('c', { ...attachment, id: 'other-image' })] }
    expect(new Map(attachmentSummary(document))).toEqual(
      new Map([
        ['shared-image', 2],
        ['other-image', 1],
      ]),
    )
    const replaced = replaceSiblingRange(document, 'b', 1, [node('d', { ...attachment, id: 'new-image' })])
    expect(replaced.roots.map((node) => node.id)).toEqual(['a', 'd', 'c'])
    expect(new Map(attachmentSummary(replaced))).toEqual(
      new Map([
        ['shared-image', 1],
        ['other-image', 1],
        ['new-image', 1],
      ]),
    )
    const removed = replaceSiblingRange(replaced, 'a', 1, [])
    expect(new Map(attachmentSummary(removed))).toEqual(
      new Map([
        ['other-image', 1],
        ['new-image', 1],
      ]),
    )
    const duplicated = replaceSiblingRange(document, 'b', 1, [node('d'), node('e')])
    expect(attachmentSummary(duplicated).get('shared-image')).toBe(3)
    expect(attachmentSummary(deleteNode(deleteNode(duplicated, 'a'), 'd')).get('shared-image')).toBe(1)
    expect(attachmentSummary(document).get('shared-image')).toBe(2)
  })

  // @requirement PRODUCT.md §14
  it('splits rich multiline paste into exact line ranges while moving the original suffix and image', () => {
    const lines = [url, 'https://b.test', 'https://c.test']
    const pastedLinks = lines.map((url, index) => ({
      start: index * (lines[0]!.length + 1),
      end: index * (lines[0]!.length + 1) + url.length,
      url,
    }))
    const document: Document = {
      roots: [
        { id: 'root', text: `!${url}`, links: [{ ...link, start: 1, end: url.length + 1 }], attachment, children: [] },
      ],
    }
    const result = pasteMultilineText(document, 'root', 1, lines, ['middle', 'last'], pastedLinks)
    expect(result.roots).toEqual([
      { id: 'root', text: `!${url}`, links: [{ ...link, start: 1, end: url.length + 1 }], children: [] },
      { id: 'middle', text: lines[1], links: [{ ...link, url: lines[1] }], children: [] },
      {
        id: 'last',
        text: lines[2]! + url,
        attachment,
        children: [],
        links: [
          { ...link, url: lines[2] },
          { ...link, start: url.length, end: url.length * 2 },
        ],
      },
    ])
    expect(attachmentSummary(result).get(attachment.id)).toBe(1)
    const plain = pasteMultilineText({ roots: [{ id: 'root', text: '', children: [] }] }, 'root', 0, lines, ['b', 'c'])
    expect(plain.roots.map((node) => node.links)).toEqual(lines.map((url) => [{ ...link, url }]))
    const unlinked = pasteMultilineText(
      { roots: [{ id: 'root', text: '', children: [] }] },
      'root',
      0,
      lines,
      ['b', 'c'],
      [],
    )
    expect(unlinked.roots.map((node) => node.links)).toEqual([undefined, undefined, undefined])
  })

  it('rejects multiline paste with too few lines or the wrong number of IDs', () => {
    const document: Document = { roots: [{ id: 'root', text: '', children: [] }] }
    for (const [lines, ids] of [
      [[], []],
      [['one'], []],
      [['one', 'two'], []],
      [
        ['one', 'two'],
        ['a', 'b'],
      ],
    ]) {
      expect(() => pasteMultilineText(document, 'root', 0, lines!, ids!)).toThrow(
        'Multiline paste requires one new node ID for every line after the first.',
      )
    }
  })

  it('retains one attachment occurrence when reattaching the same image', () => {
    const document: Document = { roots: [{ id: 'root', text: '', attachment, children: [] }] }
    attachmentSummary(document)
    const result = attachImage(document, 'root', attachment)
    expect(attachmentSummary(result).get(attachment.id)).toBe(1)
    expect(attachmentSummary(deleteNode(result, 'root')).size).toBe(0)
  })

  it.each(['\ud800\udc00', '\udbff\udfff'])('snaps a cursor inside the surrogate pair %j to its beginning', (pair) => {
    const document: Document = { roots: [{ id: 'root', text: `a${pair}z`, children: [] }] }
    expect(pasteText(document, 'root', 2, '!').roots[0]!.text).toBe(`a!${pair}z`)
    expect(splitNode(document, 'root', 2, 'new').roots.map((node) => node.text)).toEqual(['a', `${pair}z`])
  })

  it.each(['\ud7ff\udc00', '\ud800\udbff', '\udc00\udc00', '\ud800\ue000'])(
    'does not snap a cursor between characters that are not a surrogate pair %j',
    (pair) => {
      const document: Document = { roots: [{ id: 'root', text: `a${pair}z`, children: [] }] }
      expect(pasteText(document, 'root', 2, '!').roots[0]!.text).toBe(`a${pair[0]}!${pair[1]}z`)
    },
  )
})
