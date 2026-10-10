// @editing-modes: both
import type { TreeNode } from '../src/domain/document'
import { dayNumberOf } from '../src/domain/calendar-date'
import {
  describeForEachEditingMode,
  expect,
  launchTree,
  seedDocument,
  setAgendaToday,
  setCursor,
  screenshotContentSize,
  setMainWindowContentSize,
  test,
} from './fixtures'

const node = (id: string, text: string, children: TreeNode[] = []): TreeNode => ({ id, text, children })
const oct20 = dayNumberOf({ year: 2026, month: 10, day: 20 })
const hint = 'Add a date to keep this item in Agenda'

function seed(userDataDir: string): void {
  // The trailing dated rows give the content room to scroll below the edited occurrence.
  seedDocument(userDataDir, {
    document: {
      roots: [
        node('context', 'Context', [
          node('first', '2026-10-14 Prepare 2026-10-20'),
          node('solo', '2026-10-15 Solo'),
          node('other', '2026-10-15 Other'),
          ...Array.from({ length: 24 }, (_, index) => node(`tail${index}`, `2026-10-30 Tail ${index}`)),
        ]),
      ],
    },
    location: { currentParentId: null, selectedNodeId: 'context' },
  })
}

describeForEachEditingMode('Agenda live occurrences', ({ mode, screenshotName }) => {
  // @requirement PRODUCT.md §23.7
  test('mirrors edits without taking focus or scrolling, and the active occurrence follows a removed date', async ({
    userDataDir,
  }) => {
    seed(userDataDir)
    const { window, app } = await launchTree(userDataDir)
    await setMainWindowContentSize(app, screenshotContentSize)
    await setAgendaToday(window)
    await window.keyboard.press('Meta+p')
    await window.locator('.agenda-row[data-node-id="first"]').first().click()
    const input = window.getByRole('textbox', { name: 'Agenda node first', exact: true })
    await expect(input).toBeFocused()
    if (mode === 'vim') {
      await window.keyboard.press('Escape')
      await window.keyboard.press('i')
    }
    const rows = window.locator('.agenda-row[data-node-id="first"]')
    await expect(rows).toHaveCount(2)
    const mirror = rows.nth(1)
    await expect(mirror).toHaveClass(/agenda-mirror/u)
    await expect(rows.nth(0)).not.toHaveClass(/agenda-mirror/u)
    await expect(mirror.locator('.node-input')).toHaveCount(0)
    const ring = await mirror.locator('.node-enter-control').evaluate((element) => {
      const style = getComputedStyle(element, '::before')
      return { background: style.backgroundColor, border: style.borderTopWidth }
    })
    expect(ring.background).toBe('rgba(0, 0, 0, 0)')
    expect(Number.parseFloat(ring.border)).toBeGreaterThanOrEqual(1)
    for (const appearance of ['light', 'dark'] as const) {
      await window.emulateMedia({ colorScheme: appearance })
      await window.mouse.move(600, 20)
      // Native overlay scrollbars fade independently of CSS animations. Exclude the right edge,
      // where the scrollbar thumb may or may not be drawn during the capture.
      const clip = await window.evaluate(() => ({ x: 0, y: 0, width: innerWidth - 12, height: innerHeight }))
      await expect(window).toHaveScreenshot(screenshotName(`agenda-live-mirror-${appearance}.png`), { clip })
    }
    await input.evaluate((element) => {
      ;(globalThis as unknown as { originalAgendaInput: Element }).originalAgendaInput = element
    })
    const scrollTop = (): Promise<number> => window.locator('.scroll-viewport').evaluate((element) => element.scrollTop)
    const before = await scrollTop()
    await setCursor(input, '2026-10-14 Prepare 2026-10-20'.length)
    await window.keyboard.type(' now')
    await expect(mirror).toHaveText('2026-10-14 Prepare 2026-10-20 now')
    await expect(input).toBeFocused()
    expect(await scrollTop()).toBe(before)

    const top = (): Promise<number> => input.evaluate((element) => element.getBoundingClientRect().top)
    const inputTop = await top()
    await setCursor(input, 10)
    await window.keyboard.press('Backspace')
    await expect(rows).toHaveCount(1)
    await expect(rows).toHaveAttribute('data-agenda-key', new RegExp(`^node:${oct20}:first$`, 'u'))
    await expect(input).toBeFocused()
    expect(
      await input.evaluate(
        (element) => element === (globalThis as unknown as { originalAgendaInput: Element }).originalAgendaInput,
      ),
    ).toBe(true)
    expect(Math.abs((await top()) - inputTop)).toBeLessThan(1)
    if (mode === 'vim') await expect(window.getByLabel('Vim mode')).toHaveText('INSERT')
    await window.keyboard.type('!')
    await expect(input).toHaveText('2026-10-1! Prepare 2026-10-20 now')
    await expect(window.getByRole('status')).toHaveCount(0)
  })

  // @requirement PRODUCT.md §23.7
  test('keeps an item whose last date was removed until selection leaves it, and Undo restores it', async ({
    userDataDir,
  }) => {
    seed(userDataDir)
    const { window, app } = await launchTree(userDataDir)
    await setMainWindowContentSize(app, screenshotContentSize)
    await setAgendaToday(window)
    await window.keyboard.press('Meta+p')
    const solo = window.locator('.agenda-row[data-node-id="solo"]')
    await solo.first().click()
    const input = window.getByRole('textbox', { name: 'Agenda node solo', exact: true })
    await expect(input).toBeFocused()
    if (mode === 'vim') {
      await window.keyboard.press('Escape')
      await window.keyboard.press('i')
    }
    const height = await solo.evaluate((element) => element.getBoundingClientRect().height)
    await setCursor(input, 10)
    for (let index = 0; index < 10; index += 1) await window.keyboard.press('Backspace')
    await expect(input).toHaveText('Solo')
    await expect(window.getByRole('status')).toHaveText(hint)
    await expect(solo).toHaveCount(1)
    await expect(solo.locator('.node-focus-marker')).toHaveCount(1)
    await expect(solo).not.toHaveClass(/agenda-mirror/u)
    expect(await solo.evaluate((element) => element.getBoundingClientRect().height)).toBe(height)
    if (mode === 'vim') {
      await window.keyboard.press('Escape')
      await expect(window.getByLabel('Vim mode')).toHaveText('NORMAL')
      await expect(window.getByRole('status')).toHaveText(hint)
      await expect(solo).toHaveCount(1)
    }
    for (const appearance of ['light', 'dark'] as const) {
      await window.emulateMedia({ colorScheme: appearance })
      await window.mouse.move(600, 20)
      await expect(window).toHaveScreenshot(screenshotName(`agenda-invalid-item-${appearance}.png`))
    }

    await window.locator('.agenda-row[data-node-id="other"]').first().click()
    await expect(solo).toHaveCount(0)
    await expect(window.getByRole('status')).toHaveCount(0)
    await window.keyboard.press('Meta+z')
    await expect(solo).toHaveCount(1)
    await expect(solo).toHaveText('2026-10-15 Solo')
    await expect(window.getByRole('status')).toHaveCount(0)
  })
})
