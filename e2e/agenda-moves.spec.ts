// @editing-modes: both
import type { Page } from '@playwright/test'
import type { TreeNode } from '../src/domain/document'
import {
  describeForEachEditingMode,
  expect,
  launchTree,
  readPersisted,
  screenshotContentSize,
  seedDocument,
  setAgendaToday,
  setMainWindowContentSize,
  startRowDrag,
  test,
} from './fixtures'

const node = (id: string, text: string, children: TreeNode[] = []): TreeNode => ({ id, text, children })
const dayNumber = (month: number, day: number): number => Math.round(Date.UTC(2026, month - 1, day) / 86_400_000)
const dayKey = (month: number, day: number): string => `day:${dayNumber(month, day)}`
const nodeKey = (month: number, day: number, id: string): string => `node:${dayNumber(month, day)}:${id}`

function seed(userDataDir: string): void {
  seedDocument(userDataDir, {
    document: {
      roots: [
        node('context', 'Context', [
          node('first', '2026-10-14 Prepare 2026-10-20'),
          node('second', '2026-10-15 Review'),
          node('third', '2026-10-14 Plan 2026-10-15'),
        ]),
      ],
    },
    location: { currentParentId: null, selectedNodeId: 'context' },
  })
}

const row = (window: Page, key: string) => window.locator(`.agenda-row[data-agenda-key="${key}"]`)
const persistedTexts = (userDataDir: string): string[] =>
  readPersisted(userDataDir).document.roots[0]!.children.map((child) => child.text)

async function centerOf(window: Page, key: string): Promise<{ x: number; y: number }> {
  const box = await row(window, key).boundingBox()
  if (box === null) throw new Error(`Agenda row ${key} was not rendered.`)
  return { x: box.x + 120, y: box.y + box.height / 2 }
}

describeForEachEditingMode('Agenda moving occurrences', ({ screenshotName }) => {
  // @requirement PRODUCT.md §23.12
  test('drags an inactive occurrence onto another day, changing only that date, and Undo restores it', async ({
    userDataDir,
  }) => {
    seed(userDataDir)
    const { window } = await launchTree(userDataDir)
    await setAgendaToday(window)
    await window.keyboard.press('Meta+p')
    const source = row(window, nodeKey(10, 14, 'first'))
    await startRowDrag(window, source.locator('.agenda-text'))
    await expect(window.locator('body')).toHaveClass(/node-drag-active/)
    await expect(source).toHaveClass(/agenda-row-dragging/)

    const target = await centerOf(window, dayKey(10, 15))
    await window.mouse.move(target.x, target.y, { steps: 5 })
    await expect(window.locator('.agenda-row-drop-on')).toHaveCount(1)
    await expect(row(window, dayKey(10, 15))).toHaveClass(/agenda-row-drop-on/)
    await window.mouse.up()

    await expect(window.locator('.agenda-row-dragging, .agenda-row-drop-on')).toHaveCount(0)
    await expect(row(window, nodeKey(10, 15, 'first'))).toHaveAttribute('aria-selected', 'true')
    await expect(row(window, nodeKey(10, 14, 'first'))).toHaveCount(0)
    // Parent, siblings, and order are unchanged; only the moved date differs.
    await expect
      .poll(() => persistedTexts(userDataDir), { timeout: 20000 })
      .toEqual(['2026-10-15 Prepare 2026-10-20', '2026-10-15 Review', '2026-10-14 Plan 2026-10-15'])

    await window.keyboard.press('Meta+z')
    await expect(row(window, nodeKey(10, 14, 'first'))).toHaveCount(1)
    await expect
      .poll(() => persistedTexts(userDataDir), { timeout: 20000 })
      .toEqual(['2026-10-14 Prepare 2026-10-20', '2026-10-15 Review', '2026-10-14 Plan 2026-10-15'])
  })

  // @requirement PRODUCT.md §23.12
  test('drops on a node row of the target day and removes a duplicate date, activating that occurrence', async ({
    userDataDir,
  }) => {
    seed(userDataDir)
    const { window } = await launchTree(userDataDir)
    await setAgendaToday(window)
    await window.keyboard.press('Meta+p')
    const source = row(window, nodeKey(10, 14, 'third'))
    await startRowDrag(window, source.locator('.agenda-text'))
    const target = await centerOf(window, nodeKey(10, 15, 'second'))
    await window.mouse.move(target.x, target.y, { steps: 5 })
    await expect(row(window, dayKey(10, 15))).toHaveClass(/agenda-row-drop-on/)
    await window.mouse.up()

    await expect(row(window, nodeKey(10, 15, 'third'))).toHaveAttribute('aria-selected', 'true')
    await expect
      .poll(() => persistedTexts(userDataDir), { timeout: 20000 })
      .toEqual(['2026-10-14 Prepare 2026-10-20', '2026-10-15 Review', '2026-10-15 Plan'])
  })

  // @requirement PRODUCT.md §23.12
  test('drags the focused editor and restores its focus and caret after the drop', async ({ userDataDir }) => {
    seed(userDataDir)
    const { window } = await launchTree(userDataDir)
    await setAgendaToday(window)
    await window.keyboard.press('Meta+p')
    await row(window, nodeKey(10, 14, 'third'))
      .locator('.agenda-text')
      .click()
    const input = window.getByRole('textbox', { name: 'Agenda node third', exact: true })
    await expect(input).toBeFocused()
    await startRowDrag(window, input)
    // Oct 13 is an empty day inside the Today neighborhood, so it has a header.
    const target = await centerOf(window, dayKey(10, 13))
    await window.mouse.move(target.x, target.y, { steps: 5 })
    await window.mouse.up()
    await expect(input).toHaveText('2026-10-13 Plan 2026-10-15')
    await expect(input).toBeFocused()
    await expect
      .poll(() => persistedTexts(userDataDir), { timeout: 20000 })
      .toEqual(['2026-10-14 Prepare 2026-10-20', '2026-10-15 Review', '2026-10-13 Plan 2026-10-15'])
  })

  // @requirement PRODUCT.md §23.12
  test('restores the same caret after a drop as after a cancelled drag from the same point', async ({
    userDataDir,
  }) => {
    seed(userDataDir)
    const { window } = await launchTree(userDataDir)
    await setAgendaToday(window)
    await window.keyboard.press('Meta+p')
    await row(window, nodeKey(10, 14, 'third'))
      .locator('.agenda-text')
      .click()
    const input = window.getByRole('textbox', { name: 'Agenda node third', exact: true })
    await expect(input).toBeFocused()
    const caret = (): Promise<number> =>
      input.evaluate((element) => {
        const selection = element.ownerDocument.defaultView!.getSelection()!
        const range = element.ownerDocument.createRange()
        range.selectNodeContents(element)
        range.setEnd(selection.anchorNode!, selection.anchorOffset)
        return range.toString().length
      })
    await startRowDrag(window, input, { xOffset: 90 })
    await window.keyboard.press('Escape')
    await window.mouse.up()
    await expect(input).toBeFocused()
    const cancelled = await caret()
    expect(cancelled).toBeGreaterThan(0)

    await startRowDrag(window, input, { xOffset: 90 })
    const target = await centerOf(window, dayKey(10, 13))
    await window.mouse.move(target.x, target.y, { steps: 5 })
    await window.mouse.up()
    await expect(input).toHaveText('2026-10-13 Plan 2026-10-15')
    await expect(input).toBeFocused()
    expect(await caret()).toBe(cancelled)
  })

  // @requirement PRODUCT.md §23.12
  test('does not drag contextual ancestors, and drops on a gap or the same day change nothing', async ({
    userDataDir,
  }) => {
    seed(userDataDir)
    const { window } = await launchTree(userDataDir)
    await setAgendaToday(window)
    await window.keyboard.press('Meta+p')
    const context = row(window, nodeKey(10, 14, 'context'))
    const box = await context.boundingBox()
    if (box === null) throw new Error('The contextual ancestor was not rendered.')
    await window.mouse.move(box.x + 60, box.y + box.height / 2)
    await window.mouse.down()
    await window.waitForTimeout(700)
    await expect(window.locator('.agenda-row-dragging')).toHaveCount(0)
    await expect(window.locator('body')).not.toHaveClass(/node-drag-active/)
    await window.mouse.up()

    // Pressing the row selects it, which turns a multiply dated node into its editor.
    const source = row(window, nodeKey(10, 14, 'first')).locator('.agenda-text, .node-input')
    await startRowDrag(window, source)
    const gap = window.locator('.agenda-row-gap').first()
    const gapBox = await gap.boundingBox()
    if (gapBox === null) throw new Error('The gap was not rendered.')
    await window.mouse.move(gapBox.x + 120, gapBox.y + gapBox.height / 2, { steps: 5 })
    await expect(window.locator('body')).toHaveClass(/node-drag-invalid/)
    await expect(window.locator('.agenda-row-drop-on')).toHaveCount(0)
    await window.mouse.up()

    await startRowDrag(window, source)
    const same = await centerOf(window, dayKey(10, 14))
    await window.mouse.move(same.x, same.y, { steps: 5 })
    await expect(window.locator('.agenda-row-drop-on')).toHaveCount(0)
    await window.mouse.up()

    await expect(row(window, nodeKey(10, 14, 'first'))).toHaveCount(1)
    expect(persistedTexts(userDataDir)).toEqual([
      '2026-10-14 Prepare 2026-10-20',
      '2026-10-15 Review',
      '2026-10-14 Plan 2026-10-15',
    ])
  })

  // @requirement PRODUCT.md §23.12
  test('cancels a drag with Escape', async ({ userDataDir }) => {
    seed(userDataDir)
    const { window } = await launchTree(userDataDir)
    await setAgendaToday(window)
    await window.keyboard.press('Meta+p')
    const source = row(window, nodeKey(10, 14, 'first'))
    await startRowDrag(window, source.locator('.agenda-text'))
    const target = await centerOf(window, dayKey(10, 15))
    await window.mouse.move(target.x, target.y, { steps: 5 })
    await window.keyboard.press('Escape')
    await expect(window.locator('.agenda-row-dragging, .agenda-row-drop-on')).toHaveCount(0)
    await window.mouse.up()
    await expect(row(window, nodeKey(10, 14, 'first'))).toHaveCount(1)
  })

  // @requirement PRODUCT.md §23.12
  test('shows the drop outline on the target day header in light and dark appearances', async ({ userDataDir }) => {
    seed(userDataDir)
    const { window, app } = await launchTree(userDataDir)
    await setMainWindowContentSize(app, screenshotContentSize)
    await setAgendaToday(window)
    await window.keyboard.press('Meta+p')
    const source = row(window, nodeKey(10, 14, 'first'))
    await startRowDrag(window, source.locator('.agenda-text'))
    const target = await centerOf(window, dayKey(10, 15))
    await window.mouse.move(target.x, target.y, { steps: 5 })
    await expect(row(window, dayKey(10, 15))).toHaveClass(/agenda-row-drop-on/)
    for (const appearance of ['light', 'dark'] as const) {
      await window.emulateMedia({ colorScheme: appearance })
      await expect(window).toHaveScreenshot(screenshotName(`agenda-drop-${appearance}.png`))
    }
    await window.mouse.up()
  })
})
