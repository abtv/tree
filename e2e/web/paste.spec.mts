// @editing-modes: independent
import { test, expect, capture, pressPaste, primaryKey } from './fixtures.mts'

for (const vimEnabled of [false, true]) {
  // @requirement PRODUCT.md §13
  test(`recognizes a plain URL immediately after native paste (${vimEnabled ? 'Vim Insert' : 'standard'})`, async ({
    newContext,
    baseURL,
  }) => {
    const context = await newContext()
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    const page = await context.newPage()
    await page.goto(baseURL!)
    await page.waitForFunction(() => window.prototypeStore?.getSnapshot().status === 'ready')
    await page.evaluate(async (enabled) => {
      await window.treeApi.setVimEnabled(enabled)
    }, vimEnabled)
    await page.reload()
    const input = page.locator('.node-row[data-node-id="welcome"] .node-input')
    if (vimEnabled) {
      await input.click()
      await page.keyboard.press('i')
    }
    await input.fill('')
    const url = 'https://example.com/settings/data-controls'
    await page.evaluate(async (text) => navigator.clipboard.writeText(text), url)
    await pressPaste(page)
    const link = input.locator('a')
    await expect(link).toHaveText(url)
    await expect(link).toHaveAttribute('href', url)
    await expect(input).toBeFocused()
    const opened = page.waitForEvent('popup')
    await link.click({ modifiers: [primaryKey] })
    const popup = await opened
    await popup.close()
    await capture(page, `native-url-paste-${vimEnabled ? 'vim' : 'standard'}.png`)
  })
}

// @requirement PRODUCT.md §1.4
test('uses native text paste in every Vim mode and editor location', async ({ newContext, baseURL }) => {
  const context = await newContext()
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  const page = await context.newPage()
  await page.goto(baseURL!)
  await page.waitForFunction(() => window.prototypeStore?.getSnapshot().status === 'ready')
  await page.evaluate(async () => {
    await window.treeApi.save({
      version: 1,
      document: {
        roots: [
          {
            id: 'parent',
            text: '2026-10-18 Parent',
            children: [{ id: 'child', text: '2026-10-18 Child', children: [] }],
          },
        ],
      },
      location: { currentParentId: 'parent', selectedNodeId: 'child' },
    })
    await window.treeApi.setVimEnabled(true)
  })
  await page.reload()
  await page.waitForFunction(() => window.prototypeStore?.getSnapshot().status === 'ready')
  await page.evaluate(async () => {
    await navigator.clipboard.writeText('PASTED')
    navigator.clipboard.read = async () => {
      throw new Error('Separate clipboard read forbidden')
    }
  })
  for (const scope of ['tree', 'parent', 'agenda']) {
    if (scope === 'agenda') await page.keyboard.press(`${primaryKey}+p`)
    const input =
      scope === 'parent'
        ? page.getByRole('textbox', { name: 'Current parent', exact: true })
        : page.locator(`.${scope === 'agenda' ? 'agenda' : 'node'}-row[data-node-id="child"] .node-input`)
    for (const mode of ['normal', 'insert', 'replace', 'visual']) {
      await input.click()
      await page.keyboard.press('Escape')
      await page.keyboard.press('0')
      if (mode === 'insert') await page.keyboard.press('i')
      if (mode === 'replace') await page.keyboard.press('R')
      if (mode === 'visual') await page.keyboard.press('v')
      const before = await input.innerText()
      await pressPaste(page)
      await expect(input, `${scope} ${mode}`).toHaveText('PASTED' + before)
      await page.keyboard.press('Escape')
      await page.keyboard.press('u')
      await expect(input).toHaveText(before)
    }
  }
})

// @requirement PRODUCT.md §1.4
test('pastes an external image from the native event without requesting clipboard read access', async ({
  newContext,
  baseURL,
}) => {
  const context = await newContext()
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  const page = await context.newPage()
  await page.goto(baseURL!)
  await page.waitForFunction(() => window.prototypeStore?.getSnapshot().status === 'ready')
  await page.evaluate(async () => {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 24
    canvas.getContext('2d')!.fillRect(0, 0, 24, 24)
    const image = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': image! })])
    window.programmaticReads = 0
    navigator.clipboard.read = async () => {
      window.programmaticReads++
      throw new Error('Programmatic paste requires an additional confirmation')
    }
    document.addEventListener('paste', () => {
      window.nativePastes = (window.nativePastes ?? 0) + 1
    })
  })
  const input = page.locator('.node-row[data-node-id="welcome"] .node-input')
  await input.fill('')
  await pressPaste(page)
  await expect(page.locator('.node-row[data-node-id="welcome"] img')).toHaveCount(1)
  expect(await page.evaluate(() => window.programmaticReads)).toBe(0)
  expect(await page.evaluate(() => window.nativePastes)).toBe(1)
  await capture(page, 'native-image-paste.png')
  await page.keyboard.press(`${primaryKey}+z`)
  await expect(page.locator('.node-row[data-node-id="welcome"] img')).toHaveCount(0)
  await page.keyboard.press(`${primaryKey}+Shift+z`)
  await expect(page.locator('.node-row[data-node-id="welcome"] img')).toHaveCount(1)
  await page.evaluate(() => window.prototypeStore.flushPersistence())
  await page.reload()
  await expect(page.locator('.node-row[data-node-id="welcome"] img')).toHaveCount(1)
})
