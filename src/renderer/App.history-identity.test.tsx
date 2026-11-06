// @vitest-environment jsdom

import { screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { createAppHarness } from './test/app-harness'

// @requirement PRODUCT.md §10
// @requirement PRODUCT.md §18
it.each([false, true])(
  'restores the complete split document and created identity through App (Vim %s)',
  async (vimEnabled) => {
    const f = await createAppHarness({
      vimEnabled,
      document: {
        roots: [
          { id: 'root', text: 'Alpha', children: [{ id: 'child', text: 'Child', children: [] }] },
          { id: 'peer', text: 'Peer', children: [] },
        ],
      },
    })
    const editor = screen.getByRole('textbox', { name: 'Node 1' })
    await f.focus(editor, 2)
    if (vimEnabled) await f.press(editor, 'i')
    const original = structuredClone(f.snapshot().document)

    await f.press(editor, 'Enter')

    const split = structuredClone(f.snapshot().document)
    const createdId = f.snapshot().location.selectedNodeId
    expect(['root', 'child', 'peer']).not.toContain(createdId)
    expect(split.roots.map(({ id, text }) => ({ id, text }))).toEqual([
      { id: 'root', text: 'Al' },
      { id: createdId, text: 'pha' },
      { id: 'peer', text: 'Peer' },
    ])
    expect(split.roots[0]!.children).toEqual(original.roots[0]!.children)

    await f.press(document.activeElement as HTMLElement, 'z', { metaKey: true })

    expect(f.snapshot().document).toEqual(original)

    await f.press(document.activeElement as HTMLElement, 'z', { metaKey: true, shiftKey: true })

    expect(f.snapshot().document).toEqual(split)
    expect(f.node(createdId).text).toBe('pha')
  },
)
