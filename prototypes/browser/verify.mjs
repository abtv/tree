import assert from 'node:assert/strict'
import { chromium } from '@playwright/test'

if (process.argv[2] === 'theme') {
  await import('./theme-test.mjs')
} else if (process.argv[2] === 'menu') {
  await import('./menu-test.mjs')
} else if (process.argv[2] === 'storage') {
  await import('./storage-test.mjs')
} else {
  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  try {
    const context = await browser.newContext({ viewport: { width: 1100, height: 760 }, colorScheme: 'light' })
    const page = await context.newPage()
    page.setDefaultTimeout(12000)
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto(process.env.TREE_WEB_URL ?? 'http://127.0.0.1:5174/')
    await page.locator('[data-node-id="welcome"] .node-input').waitFor()
    assert.equal(await page.locator('.node-input').count(), 5)
    await page.locator('[data-node-id="welcome"] .node-input').fill('Browser editing is working')
    await page.locator('[data-node-id="welcome"] .node-input').press('End')
    await page.locator('[data-node-id="welcome"] .node-input').press('Enter')
    await page.waitForFunction(
      () =>
        document.activeElement?.classList.contains('node-input') &&
        document.activeElement.getAttribute('aria-label') !== 'Node 1',
    )
    await page.locator('.node-input:focus').fill('Created in the browser')
    await page.locator('.node-input:focus').press('Tab')
    await page.waitForFunction(() => {
      const snapshot = window.prototypeStore.getSnapshot()
      return (
        snapshot.status === 'ready' &&
        snapshot.document.roots[0].children.some((node) => node.text === 'Created in the browser')
      )
    })
    await page.waitForFunction(
      () => document.getElementById('prototype-save-status').textContent === 'Saved locally in this browser',
    )
    await page.reload()
    await page.waitForFunction(() => window.prototypeStore?.getSnapshot().status === 'ready')
    const restored = await page.evaluate(() => window.prototypeStore.getSnapshot().document)
    assert.equal(restored.roots[0].text, 'Browser editing is working')
    assert(restored.roots[0].children.some((node) => node.text === 'Created in the browser'))
    await page.screenshot({ path: '.scratch/web-prototype/tree-light.png' })
    await page.locator('#tree-menu-button').click()
    await page.locator('#prototype-agenda').click()
    await page.waitForFunction(() => !!window.prototypeStore.getSnapshot().agenda)
    await page.screenshot({ path: '.scratch/web-prototype/agenda-light.png' })
    await page.locator('#tree-menu-button').click()
    await page.locator('#prototype-tree').click()
    await page.locator('#tree-menu-button').click()
    await page.locator('#prototype-vim').click()
    await page.waitForFunction(() => document.getElementById('prototype-vim').getAttribute('aria-pressed') === 'true')
    await page.reload()
    await page.waitForFunction(
      () =>
        document.getElementById('prototype-vim').getAttribute('aria-pressed') === 'true' &&
        window.prototypeStore?.getSnapshot().status === 'ready',
    )
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.screenshot({ path: '.scratch/web-prototype/tree-dark.png' })
    const blocked = await context.newPage()
    await blocked.goto(process.env.TREE_WEB_URL ?? 'http://127.0.0.1:5174/')
    await blocked.waitForFunction(() =>
      document.getElementById('prototype-problem').textContent.includes('already open'),
    )
    assert.equal(await blocked.locator('.node-input').count(), 0)
    await blocked.close()
    assert.deepEqual(errors, [])
    console.log(
      JSON.stringify({
        version: browser.version(),
        textEditing: true,
        siblingAndIndent: true,
        savedAfterReload: true,
        agendaOpened: true,
        vimPreferenceRetained: true,
        secondWriterBlocked: true,
        rendererErrors: errors,
        status: 'passed',
      }),
    )
  } catch (error) {
    for (const context of browser.contexts())
      for (const page of context.pages()) {
        console.error(
          JSON.stringify({ title: await page.title(), body: (await page.locator('body').innerText()).slice(0, 3000) }),
        )
      }
    throw error
  } finally {
    await browser.close()
  }
}
