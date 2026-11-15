// @vitest-environment jsdom

import { act, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { getSelectionEndpoints, setSelectionRange } from './editor-dom'
import { createAppHarness, settleApp } from './test/app-harness'

async function fixture(vimEnabled: boolean, text = '') {
  const f = await createAppHarness({
    vimEnabled,
    document: {
      roots: [
        { id: 'first', text, children: [] },
        { id: 'neighbor', text: 'Neighbor', children: [] },
      ],
    },
  })
  const first = screen.getByRole('textbox', { name: 'Node 1' })
  if (vimEnabled) await f.press(first, 'i')
  return { ...f, first }
}

describe.each([false, true])('clipboard focus after editor replacement (Vim %s)', (vimEnabled) => {
  // @requirement PRODUCT.md §14
  it.each(['', 'left right', 'due 2026-10-08'])(
    'keeps the final pasted node focused after multiline paste into %j',
    async (text) => {
      const f = await fixture(vimEnabled, text)
      const cursor = text === '' ? 0 : 5
      const lines = ['2026-10-08 First', '2026-10-09 Middle', '2026-10-10 Last']
      f.clipboard.current = { kind: 'text', text: lines.join('\n') }
      await f.focus(f.first, cursor)

      await f.press(f.first, 'v', { metaKey: true })

      const roots = f.snapshot().document.roots
      const last = screen.getByRole('textbox', { name: 'Node 3' })
      const suffix = text.slice(cursor)
      expect(roots.map((node) => node.text)).toEqual([
        text.slice(0, cursor) + lines[0],
        lines[1],
        lines[2] + suffix,
        'Neighbor',
      ])
      expect(f.snapshot().location.selectedNodeId).toBe(roots[2]!.id)
      expect(last).toHaveFocus()
      expect(f.selection(last)).toEqual({ start: lines[2]!.length, end: lines[2]!.length })

      await f.input(last, lines[2] + '!' + suffix, lines[2]!.length + 1)

      expect(f.node(roots[2]!.id).text).toBe(lines[2] + '!' + suffix)
      expect(f.node('first').text).toBe(text.slice(0, cursor) + lines[0])
    },
  )

  // @requirement PRODUCT.md §13
  it('lets a newer same-node paste cursor win over the replaced textarea selection', async () => {
    const f = await fixture(vimEnabled, 'left right')
    f.clipboard.current = { kind: 'text', text: '2026-10-08' }
    await f.focus(f.first, 5)

    await f.press(f.first, 'v', { metaKey: true })

    const input = screen.getByRole('textbox', { name: 'Node 1' })
    expect(input).toHaveFocus()
    expect(input).toHaveTextContent('left 2026-10-08right')
    expect(f.selection(input)).toEqual({ start: 15, end: 15 })
  })

  // @requirement PRODUCT.md §20.10
  it.each(['2026-10-08', '2026-10-1'])(
    'retains backward selection when %s decorates the same node without a new focus request',
    async (date) => {
      const f = await fixture(vimEnabled, 'plain text')
      await f.focus(f.first)
      act(() => setSelectionRange(f.first, 8, 2))

      act(() => f.store.editText('first', `plain text ${date}`))
      await settleApp()

      const input = screen.getByRole('textbox', { name: 'Node 1' })
      expect(input).toHaveFocus()
      expect(getSelectionEndpoints(input)).toEqual({ anchor: 8, focus: 2 })

      act(() => f.store.editText('first', 'plain text'))
      await settleApp()

      expect(screen.getByRole('textbox', { name: 'Node 1' })).toBe(input)
      expect(input).toHaveFocus()
      expect(getSelectionEndpoints(input)).toEqual({ anchor: 8, focus: 2 })
    },
  )
})
