// @editing-modes: both
import type { Locator } from '@playwright/test'
import { describeForEachEditingMode, expect, launchTree, seedDocument, setAgendaToday, test } from './fixtures'

async function highlight(row: Locator) {
  return row.evaluate((element) => {
    const style = getComputedStyle(element, '::after')
    const bounds = element.getBoundingClientRect()
    const list = element.closest('.node-list, .agenda-list')!.getBoundingClientRect()
    return {
      content: style.content,
      left: bounds.left + Number.parseFloat(style.left),
      right: bounds.left + Number.parseFloat(style.left) + Number.parseFloat(style.width),
      height: Number.parseFloat(style.height),
      rowHeight: bounds.height,
      listLeft: list.left,
      listRight: list.right,
    }
  })
}

async function expectFullRow(row: Locator): Promise<void> {
  const actual = await highlight(row)

  expect(actual.content).toBe('""')
  expect(Math.abs(actual.left - actual.listLeft)).toBeLessThan(1)
  expect(Math.abs(actual.right - actual.listRight)).toBeLessThan(1)
  expect(Math.abs(actual.height - actual.rowHeight)).toBeLessThan(1)
}

describeForEachEditingMode('active row', ({ mode, screenshotName }) => {
  // @requirement PRODUCT.md §2.1
  test('highlights only the active full-width row through focus, wrapping and selection', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: {
        roots: [
          {
            id: 'parent',
            text: 'Parent',
            children: [
              {
                id: 'child',
                text: 'A wrapped child with enough synthetic text to span several lines. '.repeat(5),
                children: [],
              },
            ],
          },
          { id: 'other', text: 'Other branch', children: [] },
        ],
      },
      location: { currentParentId: null, selectedNodeId: 'parent' },
    })
    const { window } = await launchTree(userDataDir, { initialMode: 'normal' })
    const parent = window.locator('[data-node-id="parent"]')
    const other = window.locator('[data-node-id="other"]')

    await expectFullRow(parent)

    await other.hover()

    expect((await highlight(other)).content).toBe('none')

    await parent.locator('.node-disclosure-triangle').click()
    const child = window.locator('[data-node-id="child"]')

    await child.locator('.node-input').click()

    await expectFullRow(child)
    expect((await highlight(parent)).content).toBe('none')
    expect((await highlight(other)).content).toBe('none')
    await expect(other.locator('.node-input')).toHaveCSS('opacity', '1')
    expect((await highlight(child)).height).toBeGreaterThan(25)

    for (const appearance of ['light', 'dark'] as const) {
      await window.emulateMedia({ colorScheme: appearance })

      await expect(window.locator('.node-list')).toHaveScreenshot(screenshotName(`active-row-${appearance}.png`))
    }
    await window.locator('.always-on-top-toggle').focus()

    expect((await highlight(child)).content).toBe('none')

    await other.locator('.node-input').focus()

    await expectFullRow(other)
    expect((await highlight(child)).content).toBe('none')

    if (mode === 'vim') {
      await window.keyboard.press('Escape')
      await window.keyboard.press('V')

      await expect(other).toHaveClass(/node-row-visual-selected/)
      expect((await highlight(other)).content).toBe('none')

      await window.keyboard.press('Escape')

      await expectFullRow(other)
    }
  })

  // @requirement PRODUCT.md §2.1
  // @requirement PRODUCT.md §23.4
  // @requirement PRODUCT.md §23.15
  test('follows Agenda selection between a day, a node and a focused-day heading', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: {
        roots: [
          { id: 'a', text: '2026-10-08 First item', children: [] },
          { id: 'b', text: '2026-10-08 Second item', children: [] },
        ],
      },
      location: { currentParentId: null, selectedNodeId: 'a' },
    })
    const { window } = await launchTree(userDataDir)

    await setAgendaToday(window)
    await window.keyboard.press('Meta+p')
    const day = window.locator('.agenda-row-day.agenda-today')

    await day.click()

    await expectFullRow(day)

    const item = window.locator('.agenda-row[data-node-id="a"]')

    await item.locator('.node-input').click()

    await expectFullRow(item)
    expect((await highlight(day)).content).toBe('none')
    expect((await highlight(window.locator('.agenda-row[data-node-id="b"]'))).content).toBe('none')

    await day.click()
    await window.keyboard.press('Meta+.')

    await expectFullRow(window.locator('.agenda-focused-heading'))
  })
})
