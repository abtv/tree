// @editing-modes: independent
import { test, expect, capture } from './fixtures.mts'
import type { BrowserContext, Page } from '@playwright/test'

const ready = (page: Page) => page.waitForFunction(() => window.prototypeStore?.getSnapshot().status === 'ready')

// Replaces the storage-persistence API before the page runs and counts calls.
function stubPersistence(
  context: BrowserContext,
  { persisted, persist }: { persisted: boolean; persist: boolean | 'reject' },
) {
  return context.addInitScript(
    ({ persisted, persist }) => {
      window.persistCalls = 0
      StorageManager.prototype.persisted = async () => persisted
      StorageManager.prototype.persist = async () => {
        window.persistCalls += 1
        if (persist === 'reject') throw new Error('Persistent storage was refused')
        return persist
      }
    },
    { persisted, persist },
  )
}

// @requirement PRODUCT.md §24.1
test('serves an installable manifest with icons', async ({ newContext, baseURL }) => {
  const context = await newContext()
  const page = await context.newPage()

  page.setDefaultTimeout(5000)
  await page.goto(baseURL!)
  await ready(page)
  const manifest = await page.request.get(new URL('manifest.webmanifest', baseURL).href)

  expect(manifest.ok()).toBe(true)
  expect(manifest.headers()['content-type']).toContain('application/manifest+json')

  for (const name of ['icon-192.png', 'icon-512.png', 'apple-touch-icon.png']) {
    const icon = await page.request.get(new URL(name, baseURL).href)

    expect(icon.ok(), name).toBe(true)
    expect(icon.headers()['content-type']).toContain('image/png')
  }
  const session = await context.newCDPSession(page)
  const report = await session.send('Page.getAppManifest')

  expect(report.errors).toEqual([])
  expect(JSON.parse(report.data!)).toMatchObject({ name: 'Tree', display: 'standalone' })

  const { installabilityErrors } = await session.send('Page.getInstallabilityErrors')

  await test.info().attach('installability-errors.json', {
    body: JSON.stringify(installabilityErrors, null, 2),
    contentType: 'application/json',
  })
  // Profile conditions such as an incognito-like test context are recorded, not failed.
  const manifestErrors = installabilityErrors.filter(({ errorId }) =>
    /manifest|icon|start-url|display|name/.test(errorId),
  )

  expect(manifestErrors).toEqual([])
})

test('asks once for persistent storage and shows the result in the menu', async ({ newContext, baseURL }) => {
  const context = await newContext()

  await stubPersistence(context, { persisted: false, persist: true })
  const page = await context.newPage()

  page.setDefaultTimeout(5000)
  await page.goto(baseURL!)
  await ready(page)
  const status = page.locator('#storage-status')

  await expect(status).toHaveText('Storage is protected from automatic clearing.')
  expect(await page.evaluate(() => window.persistCalls)).toBe(1)

  await page.locator('#tree-menu-button').click()

  await expect(status).toBeVisible()

  await capture(page, 'storage-status-light.png')
  await page.keyboard.press('Escape')
  await page.evaluate(() => window.treeApi.setAppearance('dark'))
  await page.locator('#tree-menu-button').click()
  await capture(page, 'storage-status-dark.png')
  await page.keyboard.press('Escape')
  await page.setViewportSize({ width: 390, height: 760 })
  await page.locator('#tree-menu-button').click()
  await capture(page, 'storage-status-narrow.png')
})

test('does not ask when storage is already persistent', async ({ newContext, baseURL }) => {
  const context = await newContext()

  await stubPersistence(context, { persisted: true, persist: true })
  const page = await context.newPage()

  page.setDefaultTimeout(5000)
  await page.goto(baseURL!)
  await ready(page)

  await expect(page.locator('#storage-status')).toHaveText('Storage is protected from automatic clearing.')
  expect(await page.evaluate(() => window.persistCalls)).toBe(0)
})

test('keeps editing after a refused request', async ({ newContext, baseURL }) => {
  const context = await newContext()

  await stubPersistence(context, { persisted: false, persist: 'reject' })
  const page = await context.newPage()
  const errors: string[] = []

  page.on('pageerror', (error) => errors.push(error.message))
  page.setDefaultTimeout(5000)
  await page.goto(baseURL!)
  await ready(page)

  await expect(page.locator('#storage-status')).toHaveText('Storage is not protected from automatic clearing.')
  expect(await page.evaluate(() => window.persistCalls)).toBe(1)
  expect(errors).toEqual([])
  expect(await page.evaluate(() => (window.prototypeStore.getSnapshot() as ReadyEditorSnapshot).operationError)).toBe(
    undefined,
  )
})

test('theme color follows the Appearance choice', async ({ newContext, baseURL }) => {
  const context = await newContext({ colorScheme: 'light' })
  const page = await context.newPage()

  page.setDefaultTimeout(5000)
  await page.goto(baseURL!)
  await ready(page)
  const themeColor = () =>
    page.evaluate(() =>
      [...document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')]
        .filter((meta) => matchMedia(meta.media).matches)
        .map((meta) => meta.content),
    )

  expect(await themeColor()).toEqual(['#fbf8f1'])

  await page.evaluate(() => window.treeApi.setAppearance('dark'))

  expect(await themeColor()).toEqual(['#3f3f3f'])

  await page.emulateMedia({ colorScheme: 'dark' })
  await page.evaluate(() => window.treeApi.setAppearance('light'))

  expect(await themeColor()).toEqual(['#fbf8f1'])

  await page.evaluate(() => window.treeApi.setAppearance('system'))

  expect(await themeColor()).toEqual(['#3f3f3f'])

  await page.emulateMedia({ colorScheme: 'light' })

  expect(await themeColor()).toEqual(['#fbf8f1'])
})
