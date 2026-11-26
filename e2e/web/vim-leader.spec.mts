// @editing-modes: vim
import { expect, test } from './fixtures.mts'

// @requirement PRODUCT.md §20.2.32
test('uses the saved browser appearance as the start of the Leader cycle', async ({ newContext, baseURL }) => {
  const context = await newContext()
  const page = await context.newPage()
  await page.goto(baseURL!)
  await page.waitForFunction(() => window.prototypeStore?.getSnapshot().status === 'ready')
  await page.evaluate(async () => {
    await window.treeApi.setVimEnabled(true)
    await window.treeApi.setAppearance('gray')
  })
  await expect(page.locator('.tree-app')).toHaveClass(/vim-state-normal/)
  const editor = page.locator('.node-input').first()
  await editor.focus()

  for (const key of ['Space', 't', 't', 'Space', 't', 't']) await page.keyboard.press(key)

  await expect(page.locator('html')).toHaveAttribute('data-appearance', 'white')
  await expect(editor).toBeFocused()
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-appearance', 'white')
})

// @requirement PRODUCT.md §20.2.32
test('opens About with Leader and does not request a native pin in the browser', async ({ newContext, baseURL }) => {
  const context = await newContext()
  const page = await context.newPage()
  await page.goto(baseURL!)
  await page.waitForFunction(() => window.prototypeStore?.getSnapshot().status === 'ready')
  const pinRequests = await page.evaluateHandle(async () => {
    await window.treeApi.setVimEnabled(true)
    const requests: boolean[] = []
    const setAlwaysOnTop = window.treeApi.setAlwaysOnTop
    window.treeApi.setAlwaysOnTop = (value) => {
      requests.push(value)
      return setAlwaysOnTop(value)
    }
    return requests
  })
  await expect(page.locator('.tree-app')).toHaveClass(/vim-state-normal/)
  const editor = page.locator('.node-input').first()
  const about = page.locator('#app-about-dialog')
  await editor.focus()

  for (const key of ['Space', 'h', 'a']) await page.keyboard.press(key)
  await expect(about.getByRole('button', { name: 'Close', exact: true })).toBeFocused()
  await page.keyboard.press('Escape')
  for (const key of ['Space', 't', 'f']) await page.keyboard.press(key)

  await expect(about).toBeHidden()
  await expect(editor).toBeFocused()
  await expect(page.locator('.always-on-top-toggle')).toBeHidden()
  expect(await pinRequests.jsonValue()).toEqual([])
  await pinRequests.dispose()
})

// @requirement PRODUCT.md §20.2.32
test('downloads an archive and opens the browser import picker through Leader', async ({ newContext, baseURL }) => {
  const context = await newContext()
  const page = await context.newPage()
  await page.goto(baseURL!)
  await page.waitForFunction(() => window.prototypeStore?.getSnapshot().status === 'ready')
  await page.evaluate(() => window.treeApi.setVimEnabled(true))
  await expect(page.locator('.tree-app')).toHaveClass(/vim-state-normal/)
  const editor = page.locator('.node-input').first()
  await editor.focus()

  const downloading = page.waitForEvent('download')
  for (const key of ['Space', 'f', 'e']) await page.keyboard.press(key)
  const archive = test.info().outputPath('Leader Notes.zip')
  await (await downloading).saveAs(archive)
  await expect(editor).toBeFocused()
  await page.keyboard.press('A')
  await page.keyboard.type(' newer')
  await page.keyboard.press('Escape')

  const choosing = page.waitForEvent('filechooser')
  for (const key of ['Space', 'f', 'i']) await page.keyboard.press(key)
  await (await choosing).setFiles(archive)
  const confirmation = page.getByRole('dialog', { name: 'Replace Current Notes?' })
  const cancel = confirmation.getByRole('button', { name: 'Cancel', exact: true })
  await expect(cancel).toBeFocused()
  await cancel.click()

  await expect(confirmation).toBeHidden()
  await expect(editor).toBeFocused()
  await expect
    .poll(() => editor.evaluate((input) => (input instanceof HTMLTextAreaElement ? input.value : input.textContent)))
    .toContain(' newer')
  expect(await page.evaluate(() => window.treeApi.getCommandHistory())).toEqual([])
})

// @requirement PRODUCT.md §20.2.32
// @requirement PRODUCT.md §20.14
test('routes the browser menu Search to notes even when Help owns focus', async ({ newContext, baseURL }) => {
  const context = await newContext()
  const page = await context.newPage()
  await page.goto(baseURL!)
  await page.waitForFunction(() => window.prototypeStore?.getSnapshot().status === 'ready')
  await page.evaluate(async () => {
    await window.treeApi.save({
      version: 1,
      document: { roots: [{ id: 'one', text: 'synthetic browser atlas', children: [] }] },
      location: { currentParentId: null, selectedNodeId: 'one' },
    })
    await window.treeApi.setVimEnabled(true)
  })
  await page.reload()
  await page.waitForFunction(() => window.prototypeStore?.getSnapshot().status === 'ready')
  const editor = page.locator('.node-input').first()
  await editor.focus()
  for (const key of ['Space', 'h', 'h']) await page.keyboard.press(key)
  const help = page.getByRole('region', { name: 'Vim shortcuts (read only)' })
  const heading = help.getByRole('heading', { name: 'Vim shortcuts' })
  await expect(heading).toBeFocused()

  await page.locator('#tree-menu-button').click()
  await page.locator('#global-search').click()
  const global = page.getByRole('searchbox', { name: 'Search query' })
  await expect(global).toBeFocused()
  await global.fill('synthetic browser atlas')
  await expect(
    page.getByRole('dialog', { name: 'Search' }).getByText('synthetic browser atlas', { exact: true }),
  ).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(heading).toBeFocused()

  await page.locator('#tree-menu-button').click()
  await page.locator('#local-find').click()
  const prompt = page.getByRole('textbox', { name: 'Search', exact: true })
  await expect(prompt).toBeFocused()
  await prompt.fill('Space h')
  await page.keyboard.press('Enter')

  await expect(help.locator('.search-match-current')).toHaveText('Space h')
  await expect(help.getByText('Space h — Help', { exact: true })).toBeFocused()
})
