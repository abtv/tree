// @editing-modes: independent
import { test, expect, capture } from './fixtures.mts'
test('edits, restructures and reloads the browser document', async ({ newContext, baseURL }) => {
  const context = await newContext({ viewport: { width: 1100, height: 760 }, colorScheme: 'light' })
  const page = await context.newPage()
  page.setDefaultTimeout(12000)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(baseURL!)
  await page.locator('[data-node-id="welcome"] .node-input').waitFor()
  expect(await page.locator('.node-input').count()).toBe(5)
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
      snapshot.document.roots[0]!.children.some((node) => node.text === 'Created in the browser')
    )
  })
  await page.waitForFunction(
    () => document.getElementById('prototype-save-status')!.textContent === 'Saved locally in this browser',
  )
  await page.reload()
  await page.waitForFunction(() => window.prototypeStore?.getSnapshot().status === 'ready')
  const restored = await page.evaluate(() => (window.prototypeStore.getSnapshot() as ReadyEditorSnapshot).document)
  expect(restored.roots[0]!.text).toBe('Browser editing is working')
  expect(restored.roots[0]!.children.some((node) => node.text === 'Created in the browser')).toBeTruthy()
  await capture(page, 'tree-light.png')
  await page.locator('#tree-menu-button').click()
  await page.locator('#prototype-agenda').click()
  await page.waitForFunction(() => !!(window.prototypeStore.getSnapshot() as ReadyEditorSnapshot).agenda)
  await capture(page, 'agenda-light.png')
  await page.locator('#tree-menu-button').click()
  await page.locator('#prototype-tree').click()
  await page.locator('#tree-menu-button').click()
  await page.locator('#prototype-vim').click()
  await page.waitForFunction(() => document.getElementById('prototype-vim')!.getAttribute('aria-pressed') === 'true')
  await page.reload()
  await page.waitForFunction(
    () =>
      document.getElementById('prototype-vim')!.getAttribute('aria-pressed') === 'true' &&
      window.prototypeStore?.getSnapshot().status === 'ready',
  )
  await page.emulateMedia({ colorScheme: 'dark' })
  await capture(page, 'tree-dark.png')
  const blocked = await context.newPage()
  await blocked.goto(baseURL!)
  await blocked.waitForFunction(() =>
    document.getElementById('prototype-problem')!.textContent.includes('already open'),
  )
  expect(await blocked.locator('.node-input').count()).toBe(0)
  await blocked.close()
  expect(errors).toEqual([])
})
