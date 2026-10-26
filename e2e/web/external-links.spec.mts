// @editing-modes: independent
import { test, expect, primaryKey } from './fixtures.mts'

for (const gesture of ['primary click', 'Vim Enter'] as const) {
  // @requirement PRODUCT.md §12
  test(`isolates external links opened with ${gesture}`, async ({ newContext, baseURL }) => {
    const context = await newContext()
    const externalUrl = 'https://external-link.test/'
    let referer: string | undefined
    await context.route('https://external-link.test/**', async (route) => {
      referer = route.request().headers()['referer']
      await route.fulfill({
        contentType: 'text/html',
        body: `<!doctype html><title>External site</title><script>
          if (window.opener) window.opener.location.replace('https://external-link.test/fake-tree')
        </script>`,
      })
    })
    const page = await context.newPage()
    await page.goto(baseURL!)
    await page.waitForFunction(() => window.prototypeStore?.getSnapshot().status === 'ready')
    await page.evaluate(
      async ({ url, vim }) => {
        await window.treeApi.save({
          version: 1,
          document: {
            roots: [{ id: 'link', text: url, links: [{ start: 0, end: url.length, url }], children: [] }],
          },
          location: { currentParentId: null, selectedNodeId: 'link' },
        })
        await window.treeApi.setVimEnabled(vim)
      },
      { url: externalUrl, vim: gesture === 'Vim Enter' },
    )
    await page.reload()
    await page.waitForFunction(() => window.prototypeStore?.getSnapshot().status === 'ready')
    const input = page.locator('.node-row[data-node-id="link"] .node-input')
    if (gesture === 'Vim Enter') {
      await input.click()
      await page.keyboard.press('Escape')
      await page.keyboard.press('0')
    }

    const opened = page.waitForEvent('popup')
    if (gesture === 'primary click') await input.locator('a').click({ modifiers: [primaryKey] })
    else await page.keyboard.press('Enter')
    const popup = await opened
    await popup.waitForLoadState()

    expect(await popup.evaluate(() => window.opener === null)).toBe(true)
    expect(await popup.evaluate(() => document.referrer)).toBe('')
    expect(referer).toBeUndefined()
    await expect(popup).toHaveURL(externalUrl)
    await expect(page).toHaveURL(baseURL!)
    await expect(input).toHaveText(externalUrl)
  })
}
