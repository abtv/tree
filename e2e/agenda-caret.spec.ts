// @editing-modes: both
import type { Locator } from '@playwright/test'
import type { TreeNode } from '../src/domain/document'
import {
  describeForEachEditingMode,
  expect,
  launchTree,
  screenshotContentSize,
  seedDocument,
  setAgendaToday,
  setMainWindowContentSize,
  test,
} from './fixtures'

const node = (id: string, text: string, children: TreeNode[] = []): TreeNode => ({ id, text, children })
const leaf = (id: string, text: string) => ({ id, text, children: [] })

function seed(userDataDir: string): void {
  seedDocument(userDataDir, {
    document: {
      roots: [
        node('work', 'Work', [
          node('team', 'Team A', [leaf('prepare', '2026-10-14 Prepare rollout'), leaf('later', '2026-11-01 Review')]),
        ]),
      ],
    },
    location: { currentParentId: null, selectedNodeId: 'work' },
  })
}

interface CaretPaint {
  background: string
  leftBorder: string
}

/** Reads how the first letter of a row without an editor is painted: the Agenda's stand-in for the caret. */
async function caretPaint(row: Locator): Promise<CaretPaint | undefined> {
  return row.evaluate((element) => {
    const target = element.querySelector('.agenda-label, .agenda-text')
    if (target === null) return undefined
    const style = getComputedStyle(target, '::first-letter')
    return { background: style.backgroundColor, leftBorder: `${style.borderLeftWidth} ${style.borderLeftStyle}` }
  })
}

describeForEachEditingMode('Agenda caret on rows without an editor', ({ mode }) => {
  // @requirement PRODUCT.md §23.4
  test('shows the caret on days, gaps and contextual ancestors but not on unselected rows', async ({ userDataDir }) => {
    seed(userDataDir)
    const { window, app } = await launchTree(userDataDir)
    await setMainWindowContentSize(app, screenshotContentSize)
    await setAgendaToday(window)
    await window.keyboard.press('Meta+p')
    await window.keyboard.press('Escape')
    const selected = window.locator('.agenda-row[aria-selected="true"]')
    const today = window.locator('.agenda-today')
    await expect(today).toHaveAttribute('aria-selected', 'true')
    const expectCaret = async (row: Locator): Promise<void> => {
      const paint = await caretPaint(row)
      expect(paint).toBeDefined()
      if (mode === 'vim') {
        expect(paint!.background).not.toBe('rgba(0, 0, 0, 0)')
        expect(paint!.leftBorder).toBe('0px none')
      } else {
        expect(paint!.background).toBe('rgba(0, 0, 0, 0)')
        expect(paint!.leftBorder).toBe('1px solid')
      }
    }
    const expectNoCaret = async (row: Locator): Promise<void> => {
      const paint = await caretPaint(row)
      expect(paint).toBeDefined()
      expect(paint!.background).toBe('rgba(0, 0, 0, 0)')
      expect(paint!.leftBorder).toBe('0px none')
    }
    // A day container.
    await expectCaret(today)
    await window.keyboard.press('ArrowDown')
    await expect(selected).toContainText('Fri Oct 9')
    await expectCaret(selected)
    await expectNoCaret(today)
    // A gap.
    const gap = window.locator('.agenda-row-gap').first()
    await gap.click()
    await expect(gap).toHaveAttribute('aria-selected', 'true')
    await expectCaret(gap)
    // A contextual ancestor.
    const work = window.locator('.agenda-row[data-node-id="work"]').first()
    await work.click()
    await expect(work).toHaveAttribute('aria-selected', 'true')
    await expectCaret(work)
    await expectNoCaret(gap)
  })
})
