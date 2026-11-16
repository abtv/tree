// @vitest-environment jsdom

import { act, fireEvent, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { dayNumberOf } from '../domain/calendar-date'
import { createAppHarness, settleApp } from './test/app-harness'

const today = dayNumberOf({ year: 2026, month: 10, day: 8 })

beforeEach(() => {
  vi.stubGlobal('treeApi', { ...window.treeApi, readAttachment: async () => null })
})

// @requirement PRODUCT.md §23.4
// @requirement PRODUCT.md §6.1
// @requirement PRODUCT.md §20.2.3
describe.each(['standard', 'normal', 'insert', 'replace'] as const)('Agenda entry in %s', (mode) => {
  it.each(['text child', 'image-only child', 'childless'] as const)(
    'finishes editing and focuses the destination: %s',
    async (destination) => {
      const original = 'Plan 2026-10-08'
      const f = await createAppHarness({
        vimEnabled: mode !== 'standard',
        location: { currentParentId: 'origin', selectedNodeId: 'origin' },
        document: {
          roots: [
            { id: 'origin', text: 'Original branch', children: [] },
            {
              id: 'target',
              text: original,
              children:
                destination === 'childless'
                  ? []
                  : [
                      {
                        id: 'child',
                        text: destination === 'image-only child' ? '' : 'First child',
                        children: [],
                        ...(destination === 'image-only child'
                          ? { attachment: { id: 'image', mimeType: 'image/png' as const } }
                          : {}),
                      },
                    ],
            },
          ],
        },
      })
      act(() => {
        f.store.openAgenda()
        f.store.applyAgenda({ kind: 'select', key: `node:${today}:target` })
      })
      await settleApp()
      const input = screen.getByRole('textbox', { name: 'Agenda node target' })
      await f.focus(input, mode === 'normal' ? 6 : 0)
      let expectedText = original
      if (mode === 'replace') {
        await f.press(input, 'R')
        await f.press(input, 'q')
        expectedText = 'qlan 2026-10-08'
      } else if (mode !== 'normal') {
        if (mode === 'insert') await f.press(input, 'i')
        expectedText = 'Edited 2026-10-08'
        await f.input(input, expectedText)
      }

      if (mode === 'normal') {
        await f.press(input, 'g')
        await f.press(input, 'd')
      } else await f.press(input, '.', { metaKey: true })

      const targetId = destination === 'childless' ? 'target' : 'child'
      const focused = screen.getByRole('textbox', {
        name: destination === 'childless' ? 'Current parent' : 'Node 1',
      })
      expect(f.snapshot().agenda).toBeUndefined()
      expect(f.snapshot().location).toEqual({ currentParentId: 'target', selectedNodeId: targetId })
      expect(f.node('target').text).toBe(expectedText)
      expect(focused).toHaveFocus()
      expect(f.selection(focused)).toEqual({
        start: 0,
        end: destination !== 'image-only child' && (mode === 'normal' || mode === 'replace') ? 1 : 0,
      })
      expect(focused.classList.contains('node-input-image-caret')).toBe(
        destination === 'image-only child' && (mode === 'normal' || mode === 'replace'),
      )
      if (mode !== 'standard')
        expect(screen.getByLabelText('Vim mode')).toHaveTextContent(mode === 'insert' ? 'INSERT' : 'NORMAL')

      if (mode !== 'normal') {
        await f.press(focused, 'z', { metaKey: true })

        expect(f.node('target').text).toBe(original)
      }
    },
  )
})

// @requirement PRODUCT.md §23.4
it.each([false, true])('opens an inactive selected row through its own handler (Vim %s)', async (vimEnabled) => {
  const f = await createAppHarness({
    vimEnabled,
    location: { currentParentId: 'origin', selectedNodeId: 'origin' },
    document: {
      roots: [
        { id: 'origin', text: 'Original branch', children: [] },
        { id: 'target', text: '2026-10-08 Target 2026-10-09', children: [] },
      ],
    },
  })
  act(() => {
    f.store.openAgenda()
    f.store.applyAgenda({ kind: 'select', key: `node:${today + 1}:target` })
    f.store.applyAgenda({ kind: 'focus-day', key: `day:${today}`, scrollTop: 0 })
    f.store.applyAgenda({ kind: 'return-timeline', key: `day:${today}` })
  })
  await settleApp()
  const row = f.container.querySelector<HTMLElement>(`[data-agenda-key="node:${today + 1}:target"]`)!

  expect(row).toHaveFocus()
  expect(row.querySelector('.node-input')).toBeNull()

  fireEvent.keyDown(row, { key: '.', metaKey: true })
  await settleApp()

  expect(f.snapshot().agenda).toBeUndefined()
  expect(f.snapshot().location).toEqual({ currentParentId: 'target', selectedNodeId: 'target' })
  expect(screen.getByRole('textbox', { name: 'Current parent' })).toHaveFocus()
})
