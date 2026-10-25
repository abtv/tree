// @editing-modes: both
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  test,
  expect,
  launchTree,
  seedDocument,
  node,
  typeInto,
  closeApp,
  describeForEachEditingMode,
  setMainWindowBounds,
} from './fixtures'

describeForEachEditingMode('Recent nodes', (mode) => {
  // @requirement PRODUCT.md §20.14
  test('promotes edits, cancels without navigation, visits a node and survives restart', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: {
        roots: [
          { id: 'a', text: '', children: [{ id: 'child', text: 'Nested', children: [] }] },
          { id: 'b', text: '', children: [] },
        ],
      },
      location: { currentParentId: null, selectedNodeId: 'a' },
    })
    const first = await launchTree(userDataDir)
    await typeInto(node(first.window, 1), 'Alpha edited')
    await typeInto(node(first.window, 2), 'Beta edited')
    await first.window.keyboard.press('Meta+;')

    const popup = first.window.getByRole('dialog', { name: 'Recent nodes' })
    await expect(popup.getByRole('option')).toHaveText(['Beta edited', 'Alpha edited'])
    await expect(popup.getByRole('img', { name: 'Top level' })).toHaveCount(2)
    const fontSize = await node(first.window, 2).evaluate((element) => getComputedStyle(element).fontSize)
    await expect(popup.locator('.recent-node-text').first()).toHaveCSS('font-size', fontSize)
    await first.window.keyboard.press('ArrowUp')
    await expect(popup.getByRole('option').nth(1)).toHaveAttribute('aria-selected', 'true')
    await first.window.keyboard.press('Escape')

    await expect(popup).toHaveCount(0)
    await expect(node(first.window, 2)).toBeFocused()

    await first.window.keyboard.press('Meta+;')
    await first.window.keyboard.press('ArrowDown')
    await first.window.screenshot({ path: `.scratch/recent-nodes/${mode.mode}-popup.png` })
    await first.window.keyboard.press('Enter')

    await expect(node(first.window, 1)).toBeFocused()
    await closeApp(first.app)

    expect(JSON.parse(readFileSync(join(userDataDir, 'data', 'recent-nodes.json'), 'utf8'))).toEqual(['a', 'b'])
    const second = await launchTree(userDataDir, { appearance: 'dark' })
    await second.window.evaluate(() => window.treeApi.setAppearance('dark'))
    await second.window.emulateMedia({ colorScheme: 'dark' })
    await second.window.keyboard.press('Meta+;')

    await expect(second.window.getByRole('option')).toHaveText(['Alpha edited', 'Beta edited'])
    await second.window.screenshot({ path: `.scratch/recent-nodes/${mode.mode}-dark-popup.png` })
    await second.window.keyboard.press('Escape')
  })
})

test.describe('Recent-node buffered editing', () => {
  test.use({ editingMode: 'vim' })
  // @requirement PRODUCT.md §20.14
  test('preserves Replace on cancel and finishes it before a nested jump', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: {
        roots: [
          { id: 'a', text: 'Alpha', children: [{ id: 'child', text: 'Nested', children: [] }] },
          { id: 'b', text: 'Beta', children: [] },
        ],
      },
      location: { currentParentId: null, selectedNodeId: 'a' },
    })
    const { window } = await launchTree(userDataDir, { initialMode: 'normal' })
    await window.keyboard.press('Meta+.')
    await window.keyboard.press('Meta+.')
    await window.keyboard.press('Meta+,')
    await window.keyboard.press('Meta+,')
    await node(window, 2).click()
    await window.keyboard.press('0')
    await window.keyboard.press('R')
    await window.keyboard.type('X')
    await window.keyboard.press('Meta+;')
    await window.keyboard.press('Escape')

    await expect(window.getByLabel('Vim mode')).toHaveText('REPLACE')
    await window.keyboard.type('Y')
    await window.keyboard.press('Meta+;')
    await window.getByRole('option').filter({ hasText: 'Nested' }).click()

    await expect(window.locator('[data-node-id="child"] .node-input')).toBeFocused()
    await expect(window.getByLabel('Vim mode')).toHaveText('NORMAL')
    await window.keyboard.press('Meta+,')
    await expect(node(window, 2)).toHaveValue('XYta')
  })
})

test.describe('Recent-node popup geometry (mode-independent)', () => {
  // @requirement PRODUCT.md §20.14
  test('reveals the last result in a short window and restores focus on an outside click', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: { roots: Array.from({ length: 8 }, (_, i) => ({ id: `n${i}`, text: `Node ${i}`, children: [] })) },
      location: { currentParentId: null, selectedNodeId: 'n0' },
    })
    const { app, window } = await launchTree(userDataDir)
    await window.evaluate(() =>
      (
        globalThis as typeof globalThis & { treeApi: { setRecentNodes(ids: string[]): Promise<void> } }
      ).treeApi.setRecentNodes(Array.from({ length: 8 }, (_, i) => `n${i}`)),
    )
    await window.reload()
    await expect(node(window, 1)).toBeVisible()
    await window.keyboard.press('Meta+;')
    const popup = window.getByRole('dialog', { name: 'Recent nodes' })
    const centerOffset = () =>
      popup.evaluate((element) => {
        const box = element.getBoundingClientRect()
        return Math.max(
          Math.abs(box.left + box.width / 2 - innerWidth / 2),
          Math.abs(box.top + box.height / 2 - innerHeight / 2),
        )
      })
    await expect.poll(centerOffset).toBeLessThanOrEqual(1)
    await window.screenshot({ path: 'test-results/recent-nodes-centered.png' })
    await window.keyboard.press('Escape')
    await setMainWindowBounds(app, { width: 700, height: 400 })
    await node(window, 1).focus()
    await window.keyboard.press('Meta+;')
    await window.locator('.recent-nodes-title').click()
    await expect(window.getByRole('dialog', { name: 'Recent nodes' })).toBeVisible()
    await expect.poll(centerOffset).toBeLessThanOrEqual(1)
    await window.keyboard.press('ArrowUp')

    const geometry = await window
      .getByRole('option')
      .last()
      .evaluate((element) => {
        const row = element.getBoundingClientRect()
        const popup = element.closest('.recent-nodes-popup')!.getBoundingClientRect()
        return { rowBottom: row.bottom, popupBottom: popup.bottom, rowTop: row.top, popupTop: popup.top }
      })
    expect(geometry.rowBottom).toBeLessThanOrEqual(geometry.popupBottom)
    expect(geometry.rowTop).toBeGreaterThanOrEqual(geometry.popupTop)

    await window.mouse.click(10, 70)

    await expect(window.getByRole('dialog', { name: 'Recent nodes' })).toHaveCount(0)
    await expect(node(window, 1)).toBeFocused()
  })
})
