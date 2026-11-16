// @editing-modes: both
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

test.describe('Star presentation', () => {
  test.use({ editingMode: 'vim' })

  for (const appearance of ['light', 'dark', 'gray'] as const) {
    // @requirement PRODUCT.md §2.6
    // @requirement PRODUCT.md §20.14.2
    test(`keeps stars clear through focus, heading, Search and Agenda in ${appearance}`, async ({ userDataDir }) => {
      seedDocument(userDataDir, {
        document: {
          roots: [
            {
              id: 'standup',
              text: '#standup',
              starred: true,
              children: [{ id: 'child', text: '2026-10-08 Meeting notes\nSecond line', starred: true, children: [] }],
            },
            { id: 'leaf', text: '2026-10-08 Planning', starred: true, children: [] },
            { id: 'plain', text: 'Regular node', children: [] },
          ],
        },
        location: { currentParentId: null, selectedNodeId: 'standup' },
      })
      const { app, window } = await launchTree(userDataDir, { initialMode: 'normal' })
      await setMainWindowBounds(app, { width: 700, height: 600 })
      await window.evaluate((value) => globalThis.window.treeApi.setAppearance(value), appearance)
      await window.emulateMedia({ colorScheme: appearance === 'dark' ? 'dark' : 'light' })
      await expect(window.locator('html')).toHaveAttribute('data-appearance', appearance)
      await setAgendaToday(window)
      await window.reload()
      await expect(window.getByRole('textbox', { name: 'Node 1', exact: true })).toBeVisible()
      const parent = window.locator('.node-row[data-node-id="standup"]')
      const leaf = window.locator('.node-row[data-node-id="leaf"]')
      const markerColor = async () =>
        parent
          .locator('.node-enter-control')
          .evaluate((element) => getComputedStyle(element, '::before').backgroundColor)
      const focusedColor = await markerColor()

      await expect(parent.locator('.node-focus-marker')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
      await expect(window).toHaveScreenshot(`star-tree-${appearance}.png`)
      await leaf.locator('.node-input').focus()
      await expect(leaf.locator('.node-focus-marker')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
      expect(await markerColor()).not.toBe(focusedColor)
      await window.locator('.node-row[data-node-id="plain"] .node-input').focus()
      await expect(window.locator('.node-row[data-node-id="plain"] .node-focus-marker')).not.toHaveCSS(
        'background-color',
        'rgba(0, 0, 0, 0)',
      )

      await parent.getByRole('button', { name: 'Enter node 1', exact: true }).click()
      await expect(window.getByRole('textbox', { name: 'Current parent', exact: true })).toBeVisible()
      await expect(window).toHaveScreenshot(`star-heading-${appearance}.png`)

      await window.keyboard.press('Meta+;')
      const popup = window.getByRole('dialog', { name: 'Search' })
      await expect(popup.getByRole('option')).toHaveCount(3)
      const alignment = await popup.locator('.recent-node-title-line').evaluateAll((rows) =>
        rows.map((row) => {
          const star = row.querySelector('.node-star')!.getBoundingClientRect()
          const text = row.querySelector('.recent-node-text')!
          const range = document.createRange()
          range.selectNodeContents(text)
          const firstLine = range.getClientRects()[0]!
          return Math.abs(star.y + star.height / 2 - firstLine.y - firstLine.height / 2)
        }),
      )
      expect(alignment.every((difference) => difference <= 3)).toBe(true)
      await expect(popup).toHaveScreenshot(`star-search-${appearance}.png`)
      await window.keyboard.press('Escape')

      await window.keyboard.press('Meta+p')
      const agendaNode = window.locator('.agenda-row[data-node-id="child"]')
      await agendaNode.click()
      await expect(agendaNode).toHaveAttribute('aria-selected', 'true')
      await expect(agendaNode.locator('.node-focus-marker')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
      await expect(window).toHaveScreenshot(`star-agenda-${appearance}.png`)
    })
  }
})

test.describe('Star command with a pending Vim replacement', () => {
  test.use({ editingMode: 'vim' })

  // @requirement PRODUCT.md §2.6
  test('finishes replacement before the separate star history entry', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: { roots: [{ id: 'alpha', text: 'Alpha', children: [] }] },
      location: { currentParentId: null, selectedNodeId: 'alpha' },
    })
    const { window } = await launchTree(userDataDir, { initialMode: 'normal' })
    await window.keyboard.press('R')
    await window.keyboard.type('Z')
    await window.keyboard.press('Meta+Shift+p')
    await window.getByRole('combobox', { name: 'Command' }).fill('toggle-star-node')
    await window.keyboard.press('Enter')
    await expect(window.getByLabel('Vim mode')).toHaveText('NORMAL')
    await window.keyboard.press('u')
    await expect(window.getByRole('textbox', { name: 'Node 1', exact: true })).toHaveValue('Zlpha')
    await window.keyboard.press('u')
    await expect(window.getByRole('textbox', { name: 'Node 1', exact: true })).toHaveValue('Alpha')
  })
})

describeForEachEditingMode('Starred nodes @linux', () => {
  // @requirement PRODUCT.md §2.6
  // @requirement PRODUCT.md §20.14
  test('runs the command and retains its empty-search entry across an application restart', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: {
        roots: [
          { id: 'alpha', text: 'Alpha', children: [] },
          { id: 'zulu', text: 'Zulu', children: [] },
        ],
      },
      location: { currentParentId: null, selectedNodeId: 'zulu' },
    })
    const first = await launchTree(userDataDir)
    await first.window.keyboard.press('Meta+Shift+p')
    await first.window.getByRole('combobox', { name: 'Command' }).fill('toggle-star-node')
    await first.window.keyboard.press('Enter')
    await expect(first.window.locator('.command-panel')).toHaveCount(0)
    await closeApp(first.app)

    const second = await launchTree(userDataDir)
    await second.window.keyboard.press('Meta+;')
    const popup = second.window.getByRole('dialog', { name: 'Search' })
    await expect(popup.getByRole('option').first()).toContainText('Zulu')
    await popup.getByRole('searchbox').fill('A')
    await expect(popup.getByRole('option')).toHaveCount(1)
    await expect(popup.getByRole('option')).toContainText('Alpha')
    await popup.getByRole('searchbox').fill('')
    await expect(popup.getByRole('option').first()).toContainText('Zulu')
    await second.window.keyboard.press('Escape')
    await second.window.keyboard.press('Meta+Shift+p')
    await second.window.getByRole('combobox', { name: 'Command' }).fill('toggle-star-node')
    await second.window.keyboard.press('Enter')
    await expect(second.window.locator('.command-panel')).toHaveCount(0)
    await closeApp(second.app)

    const third = await launchTree(userDataDir)
    await third.window.keyboard.press('Meta+;')
    await expect(third.window.getByRole('dialog', { name: 'Search' }).getByRole('option')).toHaveCount(0)
  })
})
