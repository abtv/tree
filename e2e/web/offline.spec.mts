// @editing-modes: independent
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { resolve, extname } from 'node:path'
import type { Page } from '@playwright/test'
import { test, expect, capture } from './fixtures.mts'
import { offlinePackage } from '../../scripts/web/offline-package.mts'
import { noisePng, seedImageNodes } from './data-helpers.mts'

test.skip(process.env.TREE_WEB_BUILT !== '1', 'Offline lifecycle requires the production package')

const input = (page: Page) => page.locator('[data-node-id="welcome"] .node-input')
const ready = (page: Page) =>
  page.waitForFunction(() => document.getElementById('offline-status')?.textContent === 'Ready to work offline')
const menu = async (page: Page) => {
  if (!(await page.locator('#tree-menu').evaluate((element) => element.matches(':popover-open')))) {
    await page.locator('#tree-menu-button').click()
  }
}

// An actual HTTP origin exercises service-worker network requests, which page.route cannot intercept.
async function releaseServer(initialMismatch = false) {
  const root = resolve('out/web')
  const original = await offlinePackage(root)
  const html = await readFile(resolve(root, 'index.html'), 'utf8')
  const worker = await readFile(resolve(root, 'sw.js'), 'utf8')
  const version = worker.match(/Tree offline version: ([a-f0-9]+)/)![1]!
  const files = new Map(
    await Promise.all(
      original.files.map(async (file) => [file.path, await readFile(resolve(root, file.path))] as const),
    ),
  )
  let release = 1
  let broken = false
  const entry = html.match(/src="\.\/(assets\/index-[^"]+\.js)"/)![1]!
  const archive = original.files.find((file) => file.path.includes('archive.worker-'))!.path
  files.set(
    'assets/old-entry.js',
    Buffer.from(files.get(entry)!.toString().replaceAll(archive.slice(7), 'old-archive-worker.js')),
  )
  files.set('assets/old-archive-worker.js', files.get(archive)!)
  const server = createServer((request, response) => {
    const path = new URL(request.url!, 'http://localhost').pathname.slice(1) || 'index.html'
    const nextHTML = html.replace('<title>Tree</title>', `<title>Tree release ${release}</title>`)
    const integrity = `sha256-${createHash('sha256').update(nextHTML).digest('base64')}`
    const sw = worker
      .replaceAll(version, `test-release-${release}`)
      .replaceAll(original.files.find((file) => file.path === 'index.html')!.integrity, integrity)
    let bytes = path === 'sw.js' ? sw : path === 'index.html' ? nextHTML : files.get(path)
    if (initialMismatch && request.url === '/') {
      initialMismatch = false
      bytes = nextHTML.replace(entry, 'assets/old-entry.js')
    }
    if (bytes === undefined || (broken && path.endsWith('.ttf'))) {
      response.writeHead(503).end()
      return
    }
    const type = (
      {
        '.js': 'text/javascript',
        '.html': 'text/html',
        '.css': 'text/css',
        '.ttf': 'font/ttf',
        '.png': 'image/png',
        '.webmanifest': 'application/manifest+json',
      } as Record<string, string>
    )[extname(path)]
    response
      .writeHead(200, { 'Content-Type': type ?? 'application/octet-stream', 'Cache-Control': 'no-store' })
      .end(bytes)
  })
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
  const address = server.address() as { port: number }
  return {
    url: `http://127.0.0.1:${address.port}/`,
    publish(value: number, incomplete = false) {
      release = value
      broken = incomplete
    },
    close: () =>
      new Promise<void>((done, reject) => {
        server.close((error) => (error ? reject(error) : done()))
        server.closeAllConnections()
      }),
  }
}

// @requirement PRODUCT.md §24.7
test('starts offline after a full browser restart and loads archive workers from the package', async ({
  persistentContext: launch,
}) => {
  const server = await releaseServer()
  let context = await launch()
  try {
    let page = context.pages()[0]!
    await page.goto(server.url)
    await ready(page)
    await input(page).click()
    await input(page).fill('Offline notes survive restart')
    await seedImageNodes(page, [{ id: 'offline-image', bytes: await noisePng(page, 16) }])
    await page.evaluate(() => window.prototypeStore.flushPersistence())
    await context.close()

    context = await launch()
    await context.setOffline(true)
    page = context.pages()[0]!
    await page.goto(server.url)
    await expect(input(page)).toHaveValue('Offline notes survive restart')
    await page.evaluate(() => {
      const state = window.prototypeStore.getSnapshot()
      if (state.status !== 'ready') throw new Error('Missing notes')
      const parent = state.document.roots.find((node) => node.text === 'Seeded images')!
      if (!state.expansion.expandedIds.has(parent.id)) window.prototypeStore.toggleExpansion(parent.id)
    })
    await expect(page.locator('.node-row img').first()).toBeVisible()
    await input(page).click()
    await input(page).fill('Edited without Internet')
    await page.evaluate(() => window.prototypeStore.flushPersistence())
    await page.reload()
    await expect(input(page)).toHaveValue('Edited without Internet')
    await menu(page)
    const download = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Export Notes…', exact: true }).click()
    expect(await (await download).failure()).toBeNull()
    await expect(page.locator('#app-update')).toBeHidden()
  } finally {
    await context.close()
    await server.close()
  }
})

// @requirement PRODUCT.md §24.7
test('retries a failed first installation when connectivity returns', async ({ newContext }) => {
  const server = await releaseServer()
  server.publish(1, true)
  const context = await newContext()
  try {
    const page = await context.newPage()
    await page.goto(server.url)
    await expect(page.locator('#offline-status')).toHaveText('Offline setup incomplete — reconnect to try again')
    server.publish(1)
    await page.evaluate(() => window.dispatchEvent(new Event('online')))
    await ready(page)
    await context.setOffline(true)
    await page.reload()
    await expect(input(page)).toBeVisible()
  } finally {
    await context.close()
    await server.close()
  }
})

// @requirement PRODUCT.md §24.7
test('offers a save-first update when the first page predates the installed package', async ({ newContext }) => {
  const server = await releaseServer(true)
  const context = await newContext()
  try {
    const page = await context.newPage()
    await page.goto(server.url)
    await expect(page.locator('#offline-status')).toHaveText('Update App to enable offline access')
    await expect(page.locator('script[type="module"]')).toHaveAttribute('src', './assets/old-entry.js')
    await input(page).fill('Saved during first offline setup')
    await context.setOffline(true)
    await menu(page)
    await page.getByRole('button', { name: 'Update App', exact: true }).click()
    await ready(page)
    await expect(page.locator('script[type="module"]')).not.toHaveAttribute('src', './assets/old-entry.js')
    await expect(input(page)).toHaveValue('Saved during first offline setup')
    await menu(page)
    const download = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Export Notes…', exact: true }).click()
    expect(await (await download).failure()).toBeNull()
  } finally {
    await context.close()
    await server.close()
  }
})

// @requirement PRODUCT.md §24.7
test('downloads updates without reload, refuses other windows and preserves buffered edits on apply', async ({
  newContext,
}) => {
  const server = await releaseServer()
  const context = await newContext()
  try {
    const page = await context.newPage()
    await page.goto(server.url)
    await ready(page)
    server.publish(2)
    await page.evaluate(() => window.dispatchEvent(new Event('online')))
    await expect(page.locator('#tree-menu-button')).toHaveClass(/update-attention/)
    await expect(page).toHaveTitle('Tree release 1')
    for (const release of [3, 4]) {
      server.publish(release)
      await page.evaluate(async () => {
        await (await navigator.serviceWorker.getRegistration())!.update()
      })
      await expect
        .poll(() =>
          page.evaluate(async (release) => {
            const registration = await navigator.serviceWorker.getRegistration()
            const metadata = await (
              await caches.open(`tree-offline-state:${location.href}`)
            ).match(new URL('__offline_state__', location.href))
            const state = (await metadata?.json()) as { waiting?: string } | undefined
            return (
              !registration?.installing &&
              registration?.waiting?.state === 'installed' &&
              state?.waiting?.endsWith(`:test-release-${release}`)
            )
          }, release),
        )
        .toBe(true)
    }
    expect(
      await page.evaluate(async () => (await caches.keys()).filter((key) => key.startsWith('tree-offline:')).length),
    ).toBeLessThanOrEqual(3)
    await menu(page)
    await expect(page.getByRole('button', { name: 'Update App', exact: true })).toBeVisible()
    await capture(page, 'offline-update-light.png')
    await page.getByRole('button', { name: 'Dark', exact: true }).click()
    await menu(page)
    await capture(page, 'offline-update-dark.png')

    const blocked = await context.newPage()
    await blocked.goto(server.url)
    await expect(blocked.locator('#prototype-problem')).toContainText('already open')
    await page.getByRole('button', { name: 'Update App', exact: true }).click()
    await expect(page.locator('#offline-status')).toContainText('Close other Tree')
    await expect(page).toHaveTitle('Tree release 1')
    await blocked.close()

    await page.locator('#prototype-vim').click()
    await input(page).click()
    await input(page).press('Escape')
    await input(page).press('Home')
    await input(page).press('R')
    await input(page).press('Z')
    const text = await input(page).inputValue()
    await context.setOffline(true)
    await page.evaluate(() => {
      const flush = window.prototypeStore.flushPersistence.bind(window.prototypeStore)
      window.prototypeStore.flushPersistence = () =>
        new Promise<void>((resolve, reject) => {
          Object.assign(window, {
            finishUpdateSave: () => {
              void flush().then(resolve, reject)
            },
          })
        })
    })
    await menu(page)
    await page.getByRole('button', { name: 'Update App', exact: true }).click()
    await expect(page.locator('#root')).toHaveJSProperty('inert', true)
    await page.locator('#tree-menu-button').click()
    await expect(page.locator('#tree-menu')).not.toBeVisible()
    await page.evaluate(() => (window as unknown as { finishUpdateSave(): void }).finishUpdateSave())
    await expect(page).toHaveTitle('Tree release 4')
    await expect(input(page)).toHaveValue(text)
    await context.setOffline(true)
    await page.reload()
    await expect(page).toHaveTitle('Tree release 4')
    await expect(input(page)).toHaveValue(text)
    expect(
      await page.evaluate(async () => (await caches.keys()).filter((key) => key.startsWith('tree-offline:')).length),
    ).toBeLessThanOrEqual(2)
  } finally {
    await context.close()
    await server.close()
  }
})

// @requirement PRODUCT.md §24.7
test('keeps the old offline version after an incomplete update and refuses a failed save', async ({ newContext }) => {
  const server = await releaseServer()
  const context = await newContext()
  try {
    const page = await context.newPage()
    await page.goto(server.url)
    await ready(page)
    server.publish(2, true)
    await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration()
      await registration!.update()
      const worker = registration!.installing
      if (worker)
        await new Promise<void>((done) => {
          worker.addEventListener('statechange', () => {
            if (worker.state === 'redundant') done()
          })
        })
    })
    await expect(page.locator('#tree-menu-button')).not.toHaveClass(/update-attention/)
    await context.setOffline(true)
    await page.reload()
    await expect(page).toHaveTitle('Tree release 1')

    server.publish(3)
    await context.setOffline(false)
    await page.evaluate(() => window.dispatchEvent(new Event('online')))
    await expect(page.locator('#tree-menu-button')).toHaveClass(/update-attention/)
    await page.evaluate(() => {
      const save = window.prototypeStore.flushPersistence.bind(window.prototypeStore)
      window.prototypeStore.flushPersistence = async () => {
        throw new Error('Injected save failure')
      }
      Object.assign(window, {
        restoreOfflineSave: () => {
          window.prototypeStore.flushPersistence = save
        },
      })
    })
    await input(page).fill('Keep this text after failure')
    await menu(page)
    await page.getByRole('button', { name: 'Update App', exact: true }).click()
    await expect(page.locator('#offline-status')).toHaveText('Injected save failure')
    await expect(page).toHaveTitle('Tree release 1')
    await expect(input(page)).toHaveValue('Keep this text after failure')
    expect(await page.locator('#root').evaluate((element) => (element as HTMLElement).inert)).toBe(false)
    await page.evaluate(() => (window as unknown as { restoreOfflineSave(): void }).restoreOfflineSave())
    await page.getByRole('button', { name: 'Update App', exact: true }).click()
    await expect(page).toHaveTitle('Tree release 3')
    await expect(input(page)).toHaveValue('Keep this text after failure')
  } finally {
    await context.close()
    await server.close()
  }
})
