// @editing-modes: independent
import { test, expect, primaryKey } from './fixtures.mjs'

// @requirement PRODUCT.md §1.4
test('serves the static package without development entry points', async ({ request }) => {
  test.skip(process.env.TREE_WEB_BUILT !== '1', 'Static-package contract applies to the built target')
  const response = await request.get('/')
  expect(response.ok()).toBe(true)
  const html = await response.text()
  expect(html).toContain('Content-Security-Policy')
  // ADR 0022: archive work runs in a same-origin module worker; other worker sources stay blocked.
  expect(html.replaceAll('&#39;', "'")).toContain("worker-src 'self';")
  const script = html.match(/src="\.\/(assets\/index-[^"]+\.js)"/)[1]
  const worker = (await (await request.get(`/${script}`)).text()).match(/archive\.worker-[\w-]+\.js/)
  expect(worker, 'The application bundle must reference the hashed archive worker').not.toBeNull()
  expect((await request.get(`/assets/${worker[0]}`)).ok()).toBe(true)
  // PRODUCT §24.1: the installable-app files are package-relative root files.
  expect(html).toContain('<link rel="manifest" href="./manifest.webmanifest"')
  expect(html).toContain('<link rel="apple-touch-icon" href="./apple-touch-icon.png"')
  expect(html).not.toContain('main.tsx')
  expect(html).not.toContain('/@vite/client')
  expect((await request.get('/.nojekyll')).ok()).toBe(true)
  expect((await request.get('/main.tsx')).status()).toBe(404)
  expect((await request.get('/@vite/client')).status()).toBe(404)
})

// @requirement PRODUCT.md §22.3
test('loads the Agenda screen code only when the user opens Agenda', async ({ newContext, baseURL }) => {
  test.skip(process.env.TREE_WEB_BUILT !== '1', 'Lazy static-package loading applies to the built target')
  const context = await newContext()
  const page = await context.newPage()
  const agendaRequests = []
  const agendaAsset = /\/assets\/AgendaView-[^/]+\.js(?:\?|$)/
  page.on('request', (request) => {
    if (agendaAsset.test(request.url())) agendaRequests.push(request.url())
  })
  await page.route(agendaAsset, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 250))
    await route.continue()
  })

  await page.goto(baseURL)
  await page.waitForFunction(() => window.prototypeStore?.getSnapshot().status === 'ready')
  expect(agendaRequests).toEqual([])

  const loaded = page.waitForRequest((request) => agendaAsset.test(request.url()))
  await page.evaluate(() => window.prototypeStore.openAgenda())
  await expect(page.locator('.agenda-loading')).toBeVisible()
  await expect(page.locator('.agenda-loading')).toBeFocused()
  await page.locator('.agenda-loading').screenshot({
    path: test.info().outputPath('agenda-loading.png'),
    animations: 'disabled',
  })
  await page.keyboard.press(`${primaryKey}+p`)
  await expect.poll(() => page.evaluate(() => window.prototypeStore.getSnapshot().agenda === undefined)).toBe(true)
  await loaded
  await page.evaluate(() => window.prototypeStore.openAgenda())
  await expect(page.locator('.agenda-list')).toBeVisible()
  expect(agendaRequests).toHaveLength(1)
  const selectedKey = await page.evaluate(() => window.prototypeStore.getSnapshot().agenda.selectedKey)
  await page.keyboard.press('ArrowDown')
  await expect
    .poll(() => page.evaluate(() => window.prototypeStore.getSnapshot().agenda.selectedKey))
    .not.toBe(selectedKey)
  await expect
    .poll(() =>
      page.evaluate(() => {
        const selectedKey = window.prototypeStore.getSnapshot().agenda.selectedKey
        const activeRow = document.activeElement?.closest('.agenda-row')
        return activeRow?.getAttribute('data-agenda-key') === selectedKey
      }),
    )
    .toBe(true)
})

// @requirement PRODUCT.md §22.3
test('keeps Tree available when the deferred Agenda request fails', async ({ newContext, baseURL }) => {
  test.skip(process.env.TREE_WEB_BUILT !== '1', 'Lazy static-package loading applies to the built target')
  const context = await newContext()
  const page = await context.newPage()
  const agendaAsset = /\/assets\/AgendaView-[^/]+\.js(?:\?|$)/
  await page.route(agendaAsset, async (route) => {
    await route.abort()
  })

  await page.goto(baseURL)
  await page.waitForFunction(() => window.prototypeStore?.getSnapshot().status === 'ready')
  await page.evaluate(() => window.prototypeStore.openAgenda())
  await expect(page.getByRole('alert')).toContainText('Agenda could not load')
  await expect(page.locator('#root')).toBeVisible()
  await page.getByRole('button', { name: 'Return to Tree' }).click()
  await expect(page.locator('.node-list')).toBeVisible()
})

// @requirement PRODUCT.md §1.4
test('keeps an explicit menu focus destination when Agenda finishes loading', async ({ newContext, baseURL }) => {
  test.skip(process.env.TREE_WEB_BUILT !== '1', 'Lazy static-package loading applies to the built target')
  const context = await newContext()
  const page = await context.newPage()
  const agendaAsset = /\/assets\/AgendaView-[^/]+\.js(?:\?|$)/
  await page.route(agendaAsset, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 500))
    await route.continue()
  })

  await page.goto(baseURL)
  await page.waitForFunction(() => window.prototypeStore?.getSnapshot().status === 'ready')
  await page.evaluate(() => window.prototypeStore.openAgenda())
  const loaded = page.waitForResponse((response) => agendaAsset.test(response.url()))
  await expect(page.locator('.agenda-loading')).toBeVisible()
  await page.locator('#tree-menu-button').click()
  await expect(page.locator('#tree-menu')).toBeVisible()
  await page.locator('#data-export').focus()
  await loaded
  await expect(page.locator('.agenda-list')).toBeVisible()
  await expect(page.locator('#tree-menu')).toBeVisible()
  await expect(page.locator('#data-export')).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(page.locator('.agenda-list')).toBeVisible()
  await expect(page.locator('#tree-menu')).toBeHidden()
  await page.evaluate(() => {
    window.agendaRowBeforeMenu = document.querySelector('.agenda-row')
  })
  await page.locator('#tree-menu-button').click()
  await page.locator('#data-export').focus()
  await page.keyboard.press('Escape')
  await expect(page.locator('#tree-menu')).toBeHidden()
  await expect(page.locator('.agenda-list')).toBeVisible()
  expect(await page.evaluate(() => window.agendaRowBeforeMenu?.isConnected)).toBe(true)
})

// @requirement PRODUCT.md §1.4
test('keeps menu focus when the deferred Agenda request fails', async ({ newContext, baseURL }) => {
  test.skip(process.env.TREE_WEB_BUILT !== '1', 'Lazy static-package loading applies to the built target')
  const context = await newContext()
  const page = await context.newPage()
  const agendaAsset = /\/assets\/AgendaView-[^/]+\.js(?:\?|$)/
  await page.route(agendaAsset, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 500))
    await route.abort()
  })

  await page.goto(baseURL)
  await page.waitForFunction(() => window.prototypeStore?.getSnapshot().status === 'ready')
  await page.evaluate(() => window.prototypeStore.openAgenda())
  await expect(page.locator('.agenda-loading')).toBeVisible()
  await page.locator('#tree-menu-button').click()
  await expect(page.locator('#tree-menu')).toBeVisible()
  await page.locator('#data-export').focus()
  await expect(page.getByRole('alert')).toContainText('Agenda could not load')
  await expect(page.locator('#tree-menu')).toBeVisible()
  await expect(page.locator('#data-export')).toBeFocused()
})

// @requirement PRODUCT.md §1.4
test('keeps the command panel focused when Agenda finishes loading', async ({ newContext, baseURL }) => {
  test.skip(process.env.TREE_WEB_BUILT !== '1', 'Lazy static-package loading applies to the built target')
  const context = await newContext()
  const page = await context.newPage()
  const agendaAsset = /\/assets\/AgendaView-[^/]+\.js(?:\?|$)/
  await page.route(agendaAsset, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 500))
    await route.continue()
  })

  await page.goto(baseURL)
  await page.waitForFunction(() => window.prototypeStore?.getSnapshot().status === 'ready')
  await page.evaluate(() => window.prototypeStore.openAgenda())
  const loaded = page.waitForResponse((response) => agendaAsset.test(response.url()))
  await expect(page.locator('.agenda-loading')).toBeVisible()
  await page.keyboard.press(`${primaryKey}+Shift+p`)
  const command = page.getByRole('combobox', { name: 'Command', exact: true })
  await command.fill('tree')
  await loaded
  await expect(page.locator('.agenda-list')).toBeVisible()
  await expect(command).toBeFocused()
  await expect(command).toHaveValue('tree')
  await page.keyboard.press('Escape')
  await expect(page.locator('.agenda-list')).toBeVisible()
  await expect
    .poll(() =>
      page.evaluate(() =>
        document.querySelector('.agenda-row[aria-selected="true"]')?.contains(document.activeElement),
      ),
    )
    .toBe(true)
})

// @requirement PRODUCT.md §1.4
test('keeps an explicit menu-button focus destination when Agenda finishes loading', async ({
  newContext,
  baseURL,
}) => {
  test.skip(process.env.TREE_WEB_BUILT !== '1', 'Lazy static-package loading applies to the built target')
  const context = await newContext()
  const page = await context.newPage()
  const agendaAsset = /\/assets\/AgendaView-[^/]+\.js(?:\?|$)/
  await page.route(agendaAsset, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 500))
    await route.continue()
  })

  await page.goto(baseURL)
  await page.waitForFunction(() => window.prototypeStore?.getSnapshot().status === 'ready')
  await page.evaluate(() => window.prototypeStore.openAgenda())
  const loaded = page.waitForResponse((response) => agendaAsset.test(response.url()))
  await expect(page.locator('.agenda-loading')).toBeFocused()
  await page.locator('#tree-menu-button').focus()
  await expect(page.locator('#tree-menu-button')).toBeFocused()
  await loaded
  await expect(page.locator('.agenda-list')).toBeVisible()
  await expect(page.locator('#tree-menu-button')).toBeFocused()
})

// @requirement PRODUCT.md §1.4
test('mounts Agenda after an external focus owner disappears', async ({ newContext, baseURL }) => {
  test.skip(process.env.TREE_WEB_BUILT !== '1', 'Lazy static-package loading applies to the built target')
  const context = await newContext()
  const page = await context.newPage()
  const agendaAsset = /\/assets\/AgendaView-[^/]+\.js(?:\?|$)/
  await page.route(agendaAsset, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 500))
    await route.continue()
  })

  await page.goto(baseURL)
  await page.waitForFunction(() => window.prototypeStore?.getSnapshot().status === 'ready')
  await page.evaluate(() => window.prototypeStore.openAgenda())
  const loaded = page.waitForResponse((response) => agendaAsset.test(response.url()))
  await expect(page.locator('.agenda-loading')).toBeVisible()
  await page.evaluate(() => {
    const control = document.createElement('button')
    control.id = 'temporary-focus-owner'
    document.body.append(control)
    control.focus()
  })
  await loaded
  await expect(page.locator('.agenda-list')).toBeVisible()
  await expect(page.locator('#temporary-focus-owner')).toBeFocused()
  await page.locator('#temporary-focus-owner').evaluate((element) => element.remove())
  await expect(page.locator('.agenda-list')).toBeVisible()
  await expect(page.locator('.agenda-row[tabindex="0"]')).toBeFocused()
})
