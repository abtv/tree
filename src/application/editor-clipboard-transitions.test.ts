import { describe, expect, it } from 'vitest'
import type { Document } from '../domain/document'
import { clipboardSelectionTransition, imagePasteTransition, textPasteTransition } from './editor-clipboard-transitions'

describe('editor clipboard transitions', () => {
  it('normalizes a copied selection, keeps complete links, and produces escaped rich HTML', () => {
    const document: Document = {
      roots: [
        {
          id: 'root',
          text: 'A <https://example.com>\nB',
          links: [{ start: 3, end: 22, url: 'https://example.com?a=1&b=2' }],
          children: [],
        },
      ],
    }

    expect(clipboardSelectionTransition(document, 'root', 23, 2)).toEqual({
      from: 2,
      to: 23,
      payload: {
        text: '<https://example.com>',
        html: '&lt;<a href="https://example.com?a=1&amp;b=2">https://example.com</a>&gt;',
      },
    })
    expect(clipboardSelectionTransition(document, 'root', 4, 22)?.payload).toEqual({
      text: 'ttps://example.com',
      html: 'ttps://example.com',
    })
    expect(clipboardSelectionTransition(document, 'root', 0, 0)).toBeUndefined()
  })

  it('turns copied line breaks into <br> and escapes quotes in text and link targets', () => {
    const document: Document = {
      roots: [
        {
          id: 'root',
          text: 'say "hi"\nnext',
          links: [{ start: 0, end: 3, url: 'https://example.com/?q="x"' }],
          children: [],
        },
      ],
    }
    expect(clipboardSelectionTransition(document, 'root', 0, 13)?.payload).toEqual({
      text: 'say "hi"\nnext',
      html: '<a href="https://example.com/?q=&quot;x&quot;">say</a> &quot;hi&quot;<br>next',
    })
  })

  it('selects the last created node when a paste creates three or more', () => {
    const document: Document = { roots: [{ id: 'root', text: 'abcdef', children: [] }] }
    const transition = textPasteTransition(
      document,
      { currentParentId: null, selectedNodeId: 'root' },
      'root',
      3,
      { kind: 'text', text: 'one\ntwo\nthree\nfour' },
      () => ['n1', 'n2', 'n3'],
    )
    expect(transition.document.roots.map((node) => [node.id, node.text])).toEqual([
      ['root', 'abcone'],
      ['n1', 'two'],
      ['n2', 'three'],
      ['n3', 'fourdef'],
    ])
    expect(transition.location.selectedNodeId).toBe('n3')
    expect(transition.focus).toEqual({ nodeId: 'n3', cursor: 4 })
  })

  it('inserts a single pasted text value and positions focus after it', () => {
    const document: Document = { roots: [{ id: 'root', text: 'abcdef', children: [] }] }
    expect(
      textPasteTransition(
        document,
        { currentParentId: null, selectedNodeId: 'root' },
        'root',
        3,
        { kind: 'text', text: 'XYZ' },
        () => [],
      ),
    ).toMatchObject({
      document: { roots: [{ id: 'root', text: 'abcXYZdef' }] },
      location: { currentParentId: null, selectedNodeId: 'root' },
      focus: { nodeId: 'root', cursor: 6 },
    })
  })

  it('normalizes multiline text and moves focus, selection, and an existing attachment to the final node', () => {
    const document: Document = {
      roots: [
        {
          id: 'root',
          text: 'abcdef',
          attachment: { id: 'image', mimeType: 'image/png' },
          children: [],
        },
      ],
    }
    const transition = textPasteTransition(
      document,
      { currentParentId: null, selectedNodeId: 'root' },
      'root',
      3,
      { kind: 'text', text: 'one\r\ntwo\rthree' },
      () => ['two', 'three'],
    )

    expect(transition.document.roots.map((node) => [node.id, node.text, node.attachment?.id])).toEqual([
      ['root', 'abcone', undefined],
      ['two', 'two', undefined],
      ['three', 'threedef', 'image'],
    ])
    expect(transition.location).toEqual({ currentParentId: null, selectedNodeId: 'three' })
    expect(transition.focus).toEqual({ nodeId: 'three', cursor: 5 })
  })

  it('attaches an image in place or creates a selected sibling, including from a current-parent selection', () => {
    const document: Document = {
      roots: [
        { id: 'empty', text: 'Empty', children: [] },
        { id: 'occupied', text: 'Occupied', attachment: { id: 'old', mimeType: 'image/png' }, children: [] },
      ],
    }
    const inPlace = imagePasteTransition(
      document,
      { currentParentId: null, selectedNodeId: 'empty' },
      'empty',
      { id: 'new', mimeType: 'image/png' },
      () => 'unused',
    )
    expect(inPlace.document.roots[0]).toMatchObject({ id: 'empty', attachment: { id: 'new' } })
    expect(inPlace.focus).toEqual({ nodeId: 'empty', cursor: 5 })
    const sibling = imagePasteTransition(
      document,
      { currentParentId: 'occupied', selectedNodeId: 'occupied' },
      'occupied',
      { id: 'new', mimeType: 'image/png' },
      () => 'sibling',
    )
    expect(sibling.document.roots.map((node) => node.id)).toEqual(['empty', 'occupied', 'sibling'])
    expect(sibling.document.roots[2]).toEqual({
      id: 'sibling',
      text: '',
      attachment: { id: 'new', mimeType: 'image/png' },
      children: [],
    })
    expect(sibling.location).toEqual({ currentParentId: null, selectedNodeId: 'sibling' })
    expect(sibling.focus).toEqual({ nodeId: 'sibling', cursor: 0 })
  })
})
