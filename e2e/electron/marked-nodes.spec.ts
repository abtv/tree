// @editing-modes: both
import type { Page } from '@playwright/test'
import {
  test,
  expect,
  launchTree,
  seedDocument,
  closeApp,
  describeForEachEditingMode,
  setAgendaToday,
  setMainWindowBounds,
} from './fixtures'

/** Resolves a color custom property to the computed form that `toHaveCSS` and `getComputedStyle` report. */
function themeColor(window: Page, name: string): Promise<string> {
  return window.evaluate((property) => {
    const probe = document.createElement('span')
    probe.style.backgroundColor = `var(${property})`
    document.body.append(probe)
    const color = getComputedStyle(probe).backgroundColor
    probe.remove()
    return color
  }, name)
}

test.describe('Mark presentation', () => {
  test.use({ editingMode: 'vim' })

  for (const appearance of ['light', 'dark', 'gray'] as const) {
    // @requirement PRODUCT.md §2.7
    // @requirement PRODUCT.md §20.14
    // @requirement PRODUCT.md §23.2
    test(`keeps marks clear through focus, heading, Search and Agenda in ${appearance}`, async ({ userDataDir }) => {
      seedDocument(userDataDir, {
        document: {
          roots: [
            {
              id: 'report',
              text: 'Write the report',
              marked: true,
              children: [{ id: 'figures', text: 'Collect figures\nSecond line', marked: true, children: [] }],
            },
            { id: 'budget', text: 'Review budget', starred: true, marked: true, children: [] },
            { id: 'dated', text: '2026-10-08 Planning', children: [] },
            { id: 'plain', text: 'Regular node', children: [] },
          ],
        },
        location: { currentParentId: null, selectedNodeId: 'report' },
      })
      const { app, window } = await launchTree(userDataDir, { initialMode: 'normal' })
      await setMainWindowBounds(app, { width: 700, height: 600 })
      await window.evaluate((value) => globalThis.window.treeApi.setAppearance(value), appearance)
      await window.emulateMedia({ colorScheme: appearance === 'dark' ? 'dark' : 'light' })
      await expect(window.locator('html')).toHaveAttribute('data-appearance', appearance)
      await setAgendaToday(window)
      await window.reload()
      await expect(window.getByRole('textbox', { name: 'Node 1', exact: true })).toBeVisible()
      const markColor = await themeColor(window, '--color-node-mark')
      const focusColor = await themeColor(window, '--color-node-mark-focus')
      const textColor = await themeColor(window, '--color-text')
      const row = (id: string) => window.locator(`.node-row[data-node-id="${id}"]`)
      const bulletColor = (id: string) =>
        row(id)
          .locator('.node-enter-control')
          .evaluate((element) => getComputedStyle(element, '::before').backgroundColor)

      const ringColor = (id: string) =>
        row(id)
          .locator('.node-enter-control')
          .evaluate((element) => getComputedStyle(element).backgroundColor)

      expect(new Set([markColor, focusColor, textColor]).size).toBe(3)
      expect(await ringColor('report')).toBe(await themeColor(window, '--color-node-mark-ring'))
      expect(await ringColor('report')).not.toBe(await themeColor(window, '--color-enter-ring-background'))
      expect(await ringColor('budget')).toBe('rgba(0, 0, 0, 0)')
      await expect(row('report').locator('.node-focus-marker')).toHaveCSS('background-color', focusColor)
      expect(await bulletColor('report')).toBe(markColor)
      expect(await bulletColor('budget')).toBe(markColor)
      expect(await bulletColor('plain')).not.toBe(markColor)
      await expect(window).toHaveScreenshot(`mark-tree-${appearance}.png`)

      await row('budget').locator('.node-input').focus()
      await expect(row('budget').locator('.node-focus-marker')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
      expect(await bulletColor('budget')).toBe(focusColor)
      await row('plain').locator('.node-input').focus()
      await expect(row('plain').locator('.node-focus-marker')).toHaveCSS('background-color', textColor)
      expect(await bulletColor('budget')).toBe(markColor)

      await row('report').getByRole('button', { name: 'Enter node 1', exact: true }).click()
      await expect(window.getByRole('textbox', { name: 'Current parent', exact: true })).toBeVisible()
      await expect(window).toHaveScreenshot(`mark-heading-${appearance}.png`)

      await window.keyboard.press('Meta+;')
      const popup = window.getByRole('dialog', { name: 'Search' })
      await expect(popup.locator('.node-search-results-heading')).toHaveText('Marked and recent')
      await expect(popup.locator('.recent-node-text')).toHaveText([
        'Review budget',
        'Write the report',
        'Collect figures\nSecond line',
      ])
      const textEdges = await popup
        .locator('.recent-node-text')
        .evaluateAll((texts) => texts.map((text) => Math.round(text.getBoundingClientRect().x)))
      expect(new Set(textEdges).size).toBe(1)
      const alignment = await popup.locator('.recent-node-title-line').evaluateAll((rows) =>
        rows.map((row) => {
          const indicator = row.querySelector('.node-mark, .node-star')!.getBoundingClientRect()
          const text = row.querySelector('.recent-node-text')!
          const range = document.createRange()
          range.selectNodeContents(text)
          const firstLine = range.getClientRects()[0]!
          return Math.abs(indicator.y + indicator.height / 2 - firstLine.y - firstLine.height / 2)
        }),
      )
      expect(alignment.every((difference) => difference <= 3)).toBe(true)
      await expect(popup).toHaveScreenshot(`mark-search-${appearance}.png`)
      await window.keyboard.press('Escape')

      await window.keyboard.press('Meta+p')
      const agendaNodes = window.locator('.agenda-row[data-node-id]')
      await expect(agendaNodes).toHaveCount(4)
      expect(
        await agendaNodes.evaluateAll((rows) => rows.map((element) => element.getAttribute('data-node-id'))),
      ).toEqual(['report', 'figures', 'budget', 'dated'])
      const agendaNode = window.locator('.agenda-row[data-node-id="figures"]')
      await agendaNode.click()
      await expect(agendaNode).toHaveAttribute('aria-selected', 'true')
      await expect(agendaNode.locator('.node-focus-marker')).toHaveCSS('background-color', focusColor)
      await expect(window).toHaveScreenshot(`mark-agenda-${appearance}.png`)
    })
  }
})

describeForEachEditingMode('Marked nodes @linux', () => {
  // @requirement PRODUCT.md §2.7
  // @requirement PRODUCT.md §20.14
  // @requirement PRODUCT.md §23.2
  test('runs the command and keeps the node first in Search and under Today across restarts', async ({
    userDataDir,
  }) => {
    seedDocument(userDataDir, {
      document: {
        roots: [
          { id: 'alpha', text: 'Alpha', starred: true, children: [] },
          { id: 'zulu', text: 'Zulu', children: [] },
        ],
      },
      location: { currentParentId: null, selectedNodeId: 'zulu' },
    })
    const first = await launchTree(userDataDir)
    await first.window.keyboard.press('Meta+Shift+p')
    await first.window.getByRole('combobox', { name: 'Command' }).fill('toggle-mark-node')
    await first.window.keyboard.press('Enter')
    await expect(first.window.locator('.command-panel')).toHaveCount(0)
    await expect(first.window.locator('.node-row[data-node-id="zulu"] .node-enter-control')).toHaveAttribute(
      'data-marked',
      'true',
    )
    await closeApp(first.app)

    const second = await launchTree(userDataDir)
    await second.window.keyboard.press('Meta+;')
    const popup = second.window.getByRole('dialog', { name: 'Search' })
    await expect(popup.locator('.node-search-results-heading')).toHaveText('Marked, starred and recent')
    await expect(popup.locator('.recent-node-text')).toHaveText(['Zulu', 'Alpha'])
    await popup.getByRole('searchbox').fill('l')
    await expect(popup.locator('.recent-node-text')).toHaveText(['Zulu', 'Alpha'])
    await second.window.keyboard.press('Escape')
    await second.window.keyboard.press('Meta+p')
    const occurrence = second.window.locator('.agenda-row[data-node-id="zulu"]')
    await expect(occurrence).toHaveCount(1)
    await expect(occurrence.locator('.node-enter-control')).toHaveAttribute('data-marked', 'true')
    await occurrence.click()
    await expect(occurrence).toHaveAttribute('aria-selected', 'true')
    await second.window.keyboard.press('Meta+Shift+p')
    await second.window.getByRole('combobox', { name: 'Command' }).fill('toggle-mark-node')
    await second.window.keyboard.press('Enter')
    await expect(second.window.locator('.command-panel')).toHaveCount(0)
    await expect(second.window.getByText('Add a date to keep this item in Agenda')).toBeVisible()
    await closeApp(second.app)

    const third = await launchTree(userDataDir)
    await third.window.keyboard.press('Meta+;')
    await expect(third.window.getByRole('dialog', { name: 'Search' }).locator('.recent-node-text')).toHaveText([
      'Alpha',
    ])
    await third.window.keyboard.press('Escape')
    await third.window.keyboard.press('Meta+p')
    await expect(third.window.locator('.agenda-row-day').first()).toBeVisible()
    await expect(third.window.locator('.agenda-row[data-node-id="zulu"]')).toHaveCount(0)
  })
})
