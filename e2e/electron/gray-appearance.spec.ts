// @editing-modes: vim
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  checkedApplicationSubmenuItems,
  clickApplicationSubmenuItem,
  closeApp,
  expect,
  launchTree,
  seedDocument,
  setAgendaToday,
  test,
} from './fixtures'

test.use({ editingMode: 'vim' })
const appearanceMenu = { menu: 'View', submenu: 'Appearance' }

// @requirement PRODUCT.md §20.5
// @requirement PRODUCT.md §20.2.28
test('restores Gray through startup and reload, switches commands and keeps Automatic light or dark', async ({
  userDataDir,
}) => {
  seedDocument(userDataDir, {
    document: { roots: [{ id: 'one', text: 'A quiet gray workspace', children: [] }] },
    location: { currentParentId: null, selectedNodeId: 'one' },
  })
  writeFileSync(join(userDataDir, 'data', 'appearance.json'), JSON.stringify('gray'))
  const { app, window } = await launchTree(userDataDir, { initialMode: 'normal', appearance: 'dark' })

  expect(await checkedApplicationSubmenuItems(app, appearanceMenu)).toEqual(['Gray'])
  expect(await app.evaluate(({ nativeTheme }) => nativeTheme.themeSource)).toBe('light')
  expect(
    await app.evaluate(
      () =>
        (
          globalThis as unknown as {
            __treeWindowBackgrounds: Array<{ phase: string; color: string }>
          }
        ).__treeWindowBackgrounds,
    ),
  ).toEqual([{ phase: 'created', color: '#dddddd' }])
  await expect(window.locator('html')).toHaveCSS('background-color', 'rgb(221, 221, 221)')

  await window.reload()
  await expect(window.locator('.node-input')).toHaveValue('A quiet gray workspace')
  await expect(window.locator('html')).toHaveAttribute('data-appearance', 'gray')
  await expect(window.locator('html')).toHaveCSS('background-color', 'rgb(221, 221, 221)')

  for (const label of ['Light', 'Dark', 'Gray']) {
    await clickApplicationSubmenuItem(app, { ...appearanceMenu, label })
    await expect(window.locator('html')).toHaveAttribute('data-appearance', label.toLowerCase())
    expect(await checkedApplicationSubmenuItems(app, appearanceMenu)).toEqual([label])
  }

  await window.keyboard.press('Meta+Shift+p')
  await window.getByRole('combobox', { name: 'Command', exact: true }).fill('set-theme-gray')
  await expect(window.locator('.command-state')).toHaveText('✓')
  await window.keyboard.press('Enter')
  expect(await window.evaluate(() => globalThis.window.treeApi.getAppearance())).toBe('gray')

  await clickApplicationSubmenuItem(app, { ...appearanceMenu, label: 'Automatic' })
  expect(await app.evaluate(({ nativeTheme }) => nativeTheme.themeSource)).toBe('system')
  await expect(window.locator('html')).toHaveAttribute('data-appearance', 'system')
  for (const colorScheme of ['dark', 'light'] as const) {
    await window.emulateMedia({ colorScheme })
    await expect(window.locator('html')).toHaveCSS(
      'background-color',
      colorScheme === 'dark' ? 'rgb(63, 63, 63)' : 'rgb(251, 248, 241)',
    )
  }

  await clickApplicationSubmenuItem(app, { ...appearanceMenu, label: 'Gray' })
  let output = ''
  app.process().stdout!.on('data', (chunk: Buffer) => {
    output += chunk.toString()
  })
  await closeApp(app)

  expect(output).toContain('[tree-test-close-background] #dddddd')

  const restarted = await launchTree(userDataDir, { initialMode: 'normal' })
  await expect(restarted.window.locator('html')).toHaveCSS('background-color', 'rgb(221, 221, 221)')
  expect(await checkedApplicationSubmenuItems(restarted.app, appearanceMenu)).toEqual(['Gray'])
  await closeApp(restarted.app)
})

// @requirement PRODUCT.md §20.5
test('renders Gray tree, Visual selection, search and command surfaces consistently', async ({ userDataDir }) => {
  seedDocument(userDataDir, {
    document: {
      roots: [
        { id: 'one', text: '#design A quiet workspace', children: [] },
        { id: 'two', text: '@alex Review the gray palette', children: [] },
        { id: 'three', text: 'Keep the surrounding text readable', children: [] },
      ],
    },
    location: { currentParentId: null, selectedNodeId: 'one' },
  })
  const { app, window } = await launchTree(userDataDir, { initialMode: 'normal' })
  await clickApplicationSubmenuItem(app, { ...appearanceMenu, label: 'Gray' })
  await expect(window.locator('html')).toHaveCSS('background-color', 'rgb(221, 221, 221)')
  const tag = window.locator('.tag-text').filter({ hasText: '#design' })
  const input = window.locator('.node-input').first()
  await expect(tag).not.toHaveCSS('color', await input.evaluate((el) => getComputedStyle(el).color))
  await expect(tag).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
  await expect(window).toHaveScreenshot('gray-tree.png')

  await window.keyboard.press('V')
  await window.keyboard.press('j')
  await expect(window.locator('.node-row-visual-selected')).toHaveCount(2)
  await expect(tag).toHaveCSS('color', await input.evaluate((el) => getComputedStyle(el).color))
  await expect(tag).toHaveCSS('background-color', await input.evaluate((el) => getComputedStyle(el).backgroundColor))
  await expect(window).toHaveScreenshot('gray-visual.png')
  await window.keyboard.press('Escape')
  await window.keyboard.press('j')
  await expect(window).toHaveScreenshot('gray-moved-focus.png')

  await window.keyboard.press('Meta+;')
  await window.getByRole('searchbox', { name: 'Search query', exact: true }).fill('gray')
  await expect(window.locator('.recent-node-row')).toHaveCount(1)
  await expect(window.locator('.recent-nodes-popup')).toHaveScreenshot('gray-search.png')

  await window.getByRole('searchbox', { name: 'Search query', exact: true }).fill('#design')
  const popup = window.locator('.recent-nodes-popup')
  await expect(popup.locator('.recent-node-row')).toHaveCount(1)
  await expect(popup.locator('.tag-text')).toHaveCount(0)
  await expect(popup.locator('.recent-node-text .node-search-match')).toHaveText('#design')
  await expect(popup).toHaveScreenshot('gray-tag-search.png')
  await window.keyboard.press('Escape')

  await window.keyboard.press('Meta+Shift+p')
  await window.getByRole('combobox', { name: 'Command', exact: true }).fill('theme')
  await expect(window.locator('.command-row')).toHaveCount(5)
  await expect(window.locator('.command-panel')).toHaveScreenshot('gray-commands.png')
  await closeApp(app)
})

// @requirement PRODUCT.md §20.5
// @requirement PRODUCT.md §20.2.28
test('switches to White, keeps its native background through close and restores it at startup', async ({
  userDataDir,
}) => {
  seedDocument(userDataDir, {
    document: {
      roots: [
        { id: 'one', text: '#design Plan the next review', children: [] },
        { id: 'two', text: '@alex Review the outline', children: [] },
      ],
    },
    location: { currentParentId: null, selectedNodeId: 'one' },
  })
  const { app, window } = await launchTree(userDataDir, { initialMode: 'normal', appearance: 'dark' })
  const html = window.locator('html')

  await clickApplicationSubmenuItem(app, { ...appearanceMenu, label: 'White' })
  await expect(html).toHaveAttribute('data-appearance', 'white')
  await expect(html).toHaveCSS('background-color', 'rgb(255, 255, 255)')
  await expect(window.locator('.title-bar')).toHaveCSS('background-color', 'rgb(255, 255, 255)')
  expect(await checkedApplicationSubmenuItems(app, appearanceMenu)).toEqual(['White'])
  expect(await app.evaluate(({ nativeTheme }) => nativeTheme.themeSource)).toBe('light')
  await expect(window).toHaveScreenshot('white-tree.png')

  await clickApplicationSubmenuItem(app, { ...appearanceMenu, label: 'Gray' })
  await expect(html).toHaveCSS('background-color', 'rgb(221, 221, 221)')
  await window.keyboard.press('Meta+Shift+p')
  const command = window.getByRole('combobox', { name: 'Command', exact: true })
  await command.fill('set-theme-white')
  await command.press('Enter')
  await expect(html).toHaveCSS('background-color', 'rgb(255, 255, 255)')
  expect(await checkedApplicationSubmenuItems(app, appearanceMenu)).toEqual(['White'])

  await window.reload()
  await expect(window.locator('.node-input').first()).toHaveText('#design Plan the next review')
  await expect(html).toHaveAttribute('data-appearance', 'white')
  await expect(html).toHaveCSS('background-color', 'rgb(255, 255, 255)')

  let output = ''
  app.process().stdout!.on('data', (chunk: Buffer) => {
    output += chunk.toString()
  })
  await closeApp(app)
  expect(output).toContain('[tree-test-close-background] #ffffff')

  const restarted = await launchTree(userDataDir, { initialMode: 'normal', appearance: 'dark' })
  await expect(restarted.window.locator('html')).toHaveCSS('background-color', 'rgb(255, 255, 255)')
  expect(await checkedApplicationSubmenuItems(restarted.app, appearanceMenu)).toEqual(['White'])
  expect(
    await restarted.app.evaluate(
      () => (globalThis as typeof globalThis & { __treeWindowBackgrounds: unknown }).__treeWindowBackgrounds,
    ),
  ).toEqual([{ phase: 'created', color: '#ffffff' }])
  await closeApp(restarted.app)
})

// @requirement PRODUCT.md §20.12
// @requirement PRODUCT.md §20.13
test('highlights Gray tags and keeps date colors and weight in Tree and Agenda', async ({ userDataDir }) => {
  seedDocument(userDataDir, {
    document: {
      roots: [
        { id: 'one', text: '#2020-01-01 2020-01-01 #design', children: [] },
        { id: 'two', text: 'A quiet gray workspace', children: [] },
      ],
    },
    location: { currentParentId: null, selectedNodeId: 'two' },
  })
  const { app, window } = await launchTree(userDataDir, { initialMode: 'normal' })
  await clickApplicationSubmenuItem(app, { ...appearanceMenu, label: 'Gray' })

  for (const view of ['tree', 'agenda']) {
    if (view === 'agenda') {
      await setAgendaToday(window)
      await window.keyboard.press('Meta+p')
    }

    const taggedDate = window.locator('.tag-text.date-past').first()
    const plainDate = window.locator('.date-past:not(.tag-text)').first()
    const tag = window.locator('.tag-text').filter({ hasText: '#design' }).first()
    await expect(tag).toBeVisible()
    await expect(tag).not.toHaveCSS('color', await tag.evaluate((el) => getComputedStyle(el.parentElement!).color))
    await expect(tag).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
    await expect(plainDate).toBeVisible()
    await expect(taggedDate).toHaveCSS('color', await plainDate.evaluate((el) => getComputedStyle(el).color))
    await expect(taggedDate).toHaveCSS('font-weight', await plainDate.evaluate((el) => getComputedStyle(el).fontWeight))
    await expect(window).toHaveScreenshot(`gray-date-tags-${view}.png`)
  }

  await closeApp(app)
})
