// @vitest-environment jsdom

import { act, fireEvent, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { createAppHarness } from './test/app-harness'

describe.each([false, true])('held Agenda shortcut (Vim %s)', (vimEnabled) => {
  // @requirement PRODUCT.md §23.1
  it('keeps the first view through a repeat burst before the next rendering opportunity', async () => {
    const f = await createAppHarness({
      vimEnabled,
      document: { roots: [{ id: 'first', text: '2026-10-08 Item', children: [] }] },
    })
    const documentBefore = f.snapshot().document
    const input = screen.getByRole('textbox', { name: 'Node 1' })

    fireEvent.keyDown(input, { key: 'p', metaKey: true })

    expect(f.snapshot().agenda).toBeDefined()
    for (let i = 0; i < 19; i++) {
      fireEvent.keyDown(document.activeElement!, { key: 'p', metaKey: true, repeat: true })
    }

    expect(f.snapshot().agenda).toBeDefined()

    await act(async () => vi.advanceTimersByTimeAsync(48))

    expect(f.snapshot().agenda).toBeUndefined()
    expect(f.snapshot().document).toBe(documentBefore)
    expect(screen.getByRole('textbox', { name: 'Node 1' })).toHaveFocus()

    for (let i = 0; i < 19; i++) {
      fireEvent.keyDown(document.activeElement!, { key: 'p', metaKey: true, repeat: true })
    }

    expect(f.snapshot().agenda).toBeUndefined()

    await act(async () => vi.advanceTimersByTimeAsync(48))

    expect(f.snapshot().agenda).toBeDefined()
    expect(f.snapshot().document).toBe(documentBefore)
  })

  it('handles distinct presses immediately even within the repeat pacing interval', async () => {
    const f = await createAppHarness({
      vimEnabled,
      document: { roots: [{ id: 'first', text: '2026-10-08 Item', children: [] }] },
    })

    fireEvent.keyDown(document.activeElement!, { key: 'p', metaKey: true })
    expect(f.snapshot().agenda).toBeDefined()

    fireEvent.keyDown(document.activeElement!, { key: 'p', metaKey: true })
    expect(f.snapshot().agenda).toBeUndefined()
  })

  it.each(['release', 'modifier release', 'blur', 'composition', 'pointer', 'wheel', 'unmount'] as const)(
    'discards a pending repeat on %s',
    async (interruption) => {
      const f = await createAppHarness({
        vimEnabled,
        document: { roots: [{ id: 'first', text: '2026-10-08 Item', children: [] }] },
      })
      fireEvent.keyDown(document.activeElement!, { key: 'p', metaKey: true })
      fireEvent.keyDown(document.activeElement!, { key: 'p', metaKey: true, repeat: true })

      if (interruption === 'release') fireEvent.keyUp(document.activeElement!, { key: 'p', metaKey: true })
      else if (interruption === 'modifier release') fireEvent.keyUp(document.activeElement!, { key: 'Meta' })
      else if (interruption === 'blur') fireEvent(window, new Event('blur'))
      else if (interruption === 'pointer') fireEvent.pointerDown(document.body)
      else if (interruption === 'wheel') fireEvent.wheel(document.body, { deltaY: 120 })
      else if (interruption === 'unmount') f.unmount()
      else fireEvent.compositionStart(document.activeElement!)
      await act(async () => vi.advanceTimersByTimeAsync(100))

      expect(f.snapshot().agenda).toBeDefined()
    },
  )
})
