// @editing-modes: vim
import type { Page } from '@playwright/test'
import { checkedApplicationSubmenuItems, closeApp, expect, launchTree, node, seedDocument, test } from './fixtures'

async function keys(window: Page, ...sequence: string[]): Promise<void> {
  for (const key of sequence) await window.keyboard.press(key)
}

// @requirement PRODUCT.md §20.2.32
test('runs Leader actions on the focused node without stealing literal spaces', async ({ userDataDir }) => {
  seedDocument(userDataDir, {
    document: { roots: [{ id: 'one', text: 'alpha beta', children: [] }] },
    location: { currentParentId: null, selectedNodeId: 'one' },
  })
  const { window } = await launchTree(userDataDir, { initialMode: 'normal' })
  const editor = node(window, 1)
  const marker = window.getByRole('button', { name: 'Enter node 1', exact: true })
  const search = window.getByRole('searchbox', { name: 'Search query' })
  await expect(editor).toBeFocused()

  await window.keyboard.down('Space')
  await window.keyboard.down('Space')
  await window.keyboard.up('Space')
  await expect(search).toHaveCount(0)
  await keys(window, 'Escape', 'Space', 't', 'm', 'Space', 't', 's')
  await expect(marker).toHaveAttribute('data-marked', 'true')
  await expect(marker).toHaveAttribute('data-starred', 'true')
  await expect(editor).toBeFocused()

  await keys(window, 'Space', 'Space')
  await expect(search).toBeFocused()
  await keys(window, 'a', 'Space', 'b')
  await expect(search).toHaveValue('a b')
  await keys(window, 'Escape')
  await expect(editor).toBeFocused()

  await keys(window, 'Space', 't', 'm', 'Space', 't', 's')
  await expect(marker).not.toHaveAttribute('data-marked', 'true')
  await expect(marker).not.toHaveAttribute('data-starred', 'true')

  await keys(window, '0', 'f', 'Space', 'l', 'r', 'Space')
  await expect(editor).toHaveValue('alpha  eta')
  await keys(window, 'A', 'Space', 'Space', 'z', 'Escape')
  await expect(editor).toHaveValue('alpha  eta  z')
  await expect(search).toHaveCount(0)
})

// @requirement PRODUCT.md §20.2.32
test('cycles every appearance in alphabetical order and saves the choice', async ({ userDataDir }) => {
  const { app, window } = await launchTree(userDataDir, { initialMode: 'normal' })
  const editor = node(window, 1)
  await expect(editor).toBeFocused()
  await expect(window.locator('html')).toHaveAttribute('data-appearance', 'system')

  for (const [label, value] of [
    ['Dark', 'dark'],
    ['Gray', 'gray'],
    ['Light', 'light'],
    ['White', 'white'],
    ['Automatic', 'system'],
    ['Dark', 'dark'],
  ] as const) {
    await keys(window, 'Space', 't', 't')

    await expect(window.locator('html')).toHaveAttribute('data-appearance', value)
    await expect
      .poll(() => checkedApplicationSubmenuItems(app, { menu: 'View', submenu: 'Appearance' }))
      .toEqual([label])
    await expect(editor).toBeFocused()
  }

  await closeApp(app)
  const restarted = await launchTree(userDataDir, { initialMode: 'normal' })
  await expect(restarted.window.locator('html')).toHaveAttribute('data-appearance', 'dark')
})

// @requirement PRODUCT.md §20.2.32
test('opens Global Search from a non-editor Agenda row', async ({ userDataDir }) => {
  const { window } = await launchTree(userDataDir, { initialMode: 'normal' })
  await keys(window, 'Meta+p')
  const row = window.locator('.agenda-row[aria-selected="true"]')
  await expect(row).toBeFocused()

  await keys(window, 'Space', 'Space')
  await expect(window.getByRole('searchbox', { name: 'Search query' })).toBeFocused()
  await keys(window, 'Escape')
  await expect(row).toBeFocused()
})
