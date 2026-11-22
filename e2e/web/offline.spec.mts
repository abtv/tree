// @editing-modes: independent
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { resolve, extname } from 'node:path'
import type { Page } from '@playwright/test'
import { test, expect, capture, primaryKey } from './fixtures.mts'
import { controlPostedTasksWithClock } from '../search-clock.ts'
import { offlinePackage } from '../../scripts/web/offline-package.mts'
import { holdHeadAcknowledgement, noisePng, readStored, seedImageNodes, writeStored } from './data-helpers.mts'

test.skip(process.env.TREE_WEB_BUILT !== '1', 'Offline lifecycle requires the production package')

const input = (page: Page) => page.locator('[data-node-id="welcome"] .node-input')
const ready = (page: Page) =>
  page.waitForFunction(() => document.getElementById('offline-status')?.textContent === 'Ready to work offline')
const menu = async (page: Page) => {
  if (!(await page.locator('#tree-menu').evaluate((element) => element.matches(':popover-open')))) {
    await page.locator('#tree-menu-button').click()
  }
}

async function abortNextHeadWrite(page: Page) {
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put
    IDBObjectStore.prototype.put = function (...args) {
      const request = put.apply(this, args)
      if (this.name === 'document' && args[1] === 'head') {
        IDBObjectStore.prototype.put = put
        this.transaction.abort()
      }
      return request
    }
  })
}

async function watchController(page: Page) {
  return page.evaluateHandle(() => {
    const original = navigator.serviceWorker.controller
    const watch = { changes: 0, current: () => navigator.serviceWorker.controller === original && original !== null }
    navigator.serviceWorker.addEventListener('controllerchange', () => watch.changes++)
    return watch
  })
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
    await context.addInitScript(() => Object.defineProperty(window, 'showDirectoryPicker', { value: undefined }))
    let page = context.pages()[0]!
    await page.goto(server.url)
    await ready(page)

    const treeMenu = page.getByRole('dialog', { name: 'Tree menu' })
    const messages = ['Saved locally in this browser', /^Storage is (?:not )?protected/, 'Ready to work offline']
    const statusBar = page.locator('.status-bar')

    await page.keyboard.press(`${primaryKey}+Shift+p`)
    const command = page.getByRole('combobox', { name: 'Command' })
    await expect(command).toBeFocused()
    await command.fill('ab')
    await expect(page.getByRole('option', { name: /about-tree/i })).toBeVisible()
    for (const message of messages) await expect(statusBar.getByText(message)).toHaveCount(0)
    const left = await page.locator('.command-input-line').evaluate((line) => line.getBoundingClientRect().left)
    expect(left).toBe(12)
    await capture(page, 'browser-command-without-passive-status.png')

    await page.keyboard.press('Escape')
    await menu(page)
    for (const message of messages) await expect(treeMenu.getByText(message)).toBeVisible()
    await capture(page, 'browser-passive-status-menu.png')
    await page.keyboard.press('Escape')

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
test('can update an open error screen without replacing an unreadable document', async ({ newContext }) => {
  const server = await releaseServer()
  const context = await newContext()
  try {
    const page = await context.newPage()
    await page.goto(server.url)
    await ready(page)
    await page.evaluate(() => window.prototypeStore.flushPersistence())
    const unopened = { ...(await readStored(page, 'document', 'head')), version: 999 }
    await writeStored(page, 'document', 'head', unopened)
    await page.reload()
    await expect(page.getByRole('alert')).toContainText('unsupported format')

    server.publish(2)
    await page.evaluate(() => window.dispatchEvent(new Event('online')))
    await menu(page)
    await page.getByRole('button', { name: 'Update App', exact: true }).click()

    await expect(page).toHaveTitle('Tree release 2')
    await expect(page.getByRole('alert')).toContainText('unsupported format')
    expect(await readStored(page, 'document', 'head')).toEqual(unopened)
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
    const second = await context.newPage()
    await second.goto(server.url)
    await expect(second.locator('#prototype-problem')).toContainText('already open')
    const controller = await watchController(second)
    await context.setOffline(true)
    await menu(page)
    await page.getByRole('button', { name: 'Update App', exact: true }).click()
    await expect(page.locator('#offline-status')).toContainText('Close other Tree')
    await expect(page.locator('script[type="module"]')).toHaveAttribute('src', './assets/old-entry.js')
    expect(await controller.evaluate((watch) => [watch.current(), watch.changes])).toEqual([true, 0])
    await second.close()
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
    await expect(blocked).toHaveTitle('Tree release 1')
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
      window.prototypeStore.flushPersistence = (options) =>
        new Promise<void>((resolve, reject) => {
          Object.assign(window, {
            finishUpdateSave: () => {
              void flush(options).then(() => {
                const saved = window.prototypeStore.getSnapshot()
                window.prototypeStore.editText('welcome', 'Late command after final save')
                if (window.prototypeStore.getSnapshot() !== saved) reject(new Error('Accepted an edit after saving'))
                else resolve()
              }, reject)
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
test('retries the replacement package when the waiting worker changes during a document save', async ({
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
    await holdHeadAcknowledgement(page)
    await input(page).fill('Edited during release 1')
    await menu(page)
    const update = page.getByRole('button', { name: 'Update App', exact: true })
    await update.click()
    await page.waitForFunction(() => !!window.finishHeadWrite)
    await expect(page.locator('#root')).toHaveJSProperty('inert', true)
    const second = await context.newPage()
    await second.goto(server.url)
    await expect(second.locator('#prototype-problem')).toContainText('already open')
    const writerController = await watchController(page)
    const secondController = await watchController(second)
    server.publish(3)
    await page.evaluate(async () => {
      const registration = (await navigator.serviceWorker.getRegistration())!
      const previous = registration.waiting!
      const replaced = new Promise<void>((resolve) => {
        previous.addEventListener('statechange', () => {
          if (previous.state === 'redundant') resolve()
        })
      })
      await registration.update()
      await replaced
    })
    await page.evaluate(() => window.finishHeadWrite!())

    await expect(page.locator('#offline-status')).toContainText('update was replaced')
    await expect(page).toHaveTitle('Tree release 1')
    await expect(update).toBeEnabled()
    expect((await readStored(page, 'document', 'head')).document.roots[0]?.text).toBe('Edited during release 1')
    await update.click()
    await expect(page.locator('#offline-status')).toContainText('Close other Tree')
    await expect(page.locator('#root')).toHaveJSProperty('inert', false)
    expect(await writerController.evaluate((watch) => [watch.current(), watch.changes])).toEqual([true, 0])
    expect(await secondController.evaluate((watch) => [watch.current(), watch.changes])).toEqual([true, 0])
    await expect(second).toHaveTitle('Tree release 1')
    await second.close()
    await page.keyboard.press('Escape')
    await input(page).fill('Edited after replacement')
    await menu(page)
    await update.click()
    await expect(page).toHaveTitle('Tree release 3')
    await expect(input(page)).toHaveValue('Edited after replacement')
    await input(page).fill('Edited after activation')
    await expect(page.locator('#prototype-save-status')).toHaveText('Saved locally in this browser')
    await page.reload()
    await expect(input(page)).toHaveValue('Edited after activation')
  } finally {
    await context.close()
    await server.close()
  }
})

test('keeps the confirmed Find result and its caret after an update save fails', async ({ newContext }) => {
  const server = await releaseServer()
  const context = await newContext()
  try {
    const page = await context.newPage()
    await page.goto(server.url)
    await ready(page)
    server.publish(2)
    await page.evaluate(() => window.dispatchEvent(new Event('online')))
    await expect(page.locator('#tree-menu-button')).toHaveClass(/update-attention/)
    await page.clock.install()
    await page.clock.pauseAt(new Date(Date.now() + 1000))
    await controlPostedTasksWithClock(page)
    await input(page).fill('Edited origin')
    await page.keyboard.press(`${primaryKey}+f`)
    const find = page.getByRole('textbox', { name: 'Search', exact: true })
    await find.fill('cond')
    await find.press('Enter')
    await page.clock.runFor(60)
    await expect(page.locator('.search-count')).toHaveText('1 / 1')
    await expect(find).toBeFocused()
    await abortNextHeadWrite(page)
    const update = page.getByRole('button', { name: 'Update App', exact: true })

    await menu(page)
    await update.click()
    await expect(page.locator('#offline-status')).toHaveText('Local save failed.')
    await expect(page.locator('#root')).toHaveJSProperty('inert', false)
    expect(
      await page.evaluate(() => (window.prototypeStore.getSnapshot() as ReadyEditorSnapshot).location.selectedNodeId),
    ).toBe('second')
    await page.keyboard.press('Escape')
    const result = page.locator('[data-node-id="second"] .node-input')
    const resultText = () =>
      result.evaluate((element) => (element instanceof HTMLTextAreaElement ? element.value : element.textContent))
    await expect(result).toBeFocused()
    await page.keyboard.type('!')
    await expect.poll(resultText).toBe('Se!cond step')
    await expect(input(page)).toHaveValue('Edited origin')
    await menu(page)
    await update.click()

    await expect(page).toHaveTitle('Tree release 2')
    await expect.poll(resultText).toBe('Se!cond step')
    await expect(input(page)).toHaveValue('Edited origin')
    const head = await readStored(page, 'document', 'head')
    expect(head.location.selectedNodeId).toBe('second')
    expect(head.document.roots[1]?.children[1]?.text).toBe('Se!cond step')
  } finally {
    await context.close()
    await server.close()
  }
})

for (const stage of ['pinning the running package', 'waiting for commit']) {
  test(`refuses a new tab opened while ${stage}`, async ({ newContext }) => {
    const server = await releaseServer()
    const context = await newContext()
    try {
      const page = await context.newPage()
      await page.goto(server.url)
      await ready(page)
      const next = context.waitForEvent('serviceworker')
      server.publish(2)
      await page.evaluate(() => window.dispatchEvent(new Event('online')))
      const worker = await next
      await expect(page.locator('#tree-menu-button')).toHaveClass(/update-attention/)
      const gate =
        stage === 'waiting for commit'
          ? await page.evaluateHandle(() => {
              const state = { paused: false, release() {} }
              const post = MessagePort.prototype.postMessage
              MessagePort.prototype.postMessage = function (
                this: MessagePort,
                message: unknown,
                options?: StructuredSerializeOptions | Transferable[],
              ) {
                const send = () => Reflect.apply(post, this, [message, options])
                if (message !== 'commit') return send()
                MessagePort.prototype.postMessage = post
                state.paused = true
                state.release = send
              }
              return state
            })
          : await worker.evaluateHandle(() => {
              const gate = { paused: false, release() {} }
              const paused = new Promise<void>((resolve) => {
                gate.release = resolve
              })
              const put = Cache.prototype.put
              Cache.prototype.put = async function (key, value) {
                const state = String(key).endsWith('__offline_state__') ? await value.clone().json() : null
                await put.call(this, key, value)
                if (state?.requested) {
                  Cache.prototype.put = put
                  gate.paused = true
                  await paused
                }
              }
              return gate
            })
      const controller = await watchController(page)
      await input(page).fill('Saved before the second tab')
      await menu(page)
      const update = page.getByRole('button', { name: 'Update App', exact: true })
      await update.click()
      await expect.poll(() => gate.evaluate((state) => state.paused)).toBe(true)
      const second = await context.newPage()
      await second.goto(server.url)
      await expect(second.locator('body')).toContainText('Tree is updating')
      const otherController = await watchController(second)

      await gate.evaluate((state) => state.release())
      await expect(page.locator('#offline-status')).toContainText('Close other Tree')
      expect(await controller.evaluate((watch) => [watch.current(), watch.changes])).toEqual([true, 0])
      expect(await otherController.evaluate((watch) => [watch.current(), watch.changes])).toEqual([true, 0])
      expect((await readStored(page, 'document', 'head')).document.roots[0]?.text).toBe('Saved before the second tab')
      await second.close()
      await update.click()

      await expect(page).toHaveTitle('Tree release 2')
      await expect(input(page)).toHaveValue('Saved before the second tab')
    } finally {
      await context.close()
      await server.close()
    }
  })
}

for (const check of ['before confirmation', 'after confirmation']) {
  test(`ignores a late client check ${check} after the page has canceled activation`, async ({ newContext }) => {
    const server = await releaseServer()
    const context = await newContext()
    try {
      const page = await context.newPage()
      await page.goto(server.url)
      await ready(page)
      const next = context.waitForEvent('serviceworker')
      server.publish(2)
      await page.evaluate(() => window.dispatchEvent(new Event('online')))
      const worker = await next
      await expect(page.locator('#tree-menu-button')).toHaveClass(/update-attention/)
      const gate = await worker.evaluateHandle(
        (number) => {
          const scope = self as unknown as {
            clients: { matchAll(options: unknown): Promise<unknown[]> }
            skipWaiting(): Promise<void>
          }
          const state = { checks: 0, waiting: false, skips: 0, release() {} }
          const paused = new Promise<void>((resolve) => {
            state.release = resolve
          })
          const list = scope.clients.matchAll.bind(scope.clients)
          scope.clients.matchAll = async (options) => {
            const clients = await list(options)
            if (++state.checks === number) {
              state.waiting = true
              await paused
            }
            return clients
          }
          const skip = scope.skipWaiting.bind(scope)
          scope.skipWaiting = () => {
            state.skips++
            return skip()
          }
          return state
        },
        check === 'before confirmation' ? 2 : 3,
      )
      const original = await watchController(page)
      await page.clock.install()
      await page.clock.pauseAt(new Date(Date.now() + 1000))
      await input(page).fill('Before the delayed check')
      await menu(page)
      const update = page.getByRole('button', { name: 'Update App', exact: true })
      await update.click()
      await expect.poll(() => gate.evaluate((state) => state.waiting)).toBe(true)
      await page.clock.fastForward(15_001)
      await expect(page.locator('#offline-status')).toContainText(
        check === 'before confirmation' ? 'did not respond' : 'update was requested',
      )
      await expect(page.locator('#root')).toHaveJSProperty('inert', false)
      await page.keyboard.press('Escape')
      await input(page).fill('Edited after cancellation')

      await gate.evaluate((state) => state.release())
      await page.evaluate(() =>
        navigator.locks.request(`tree-offline:${new URL('.', document.baseURI).href}:lifecycle`, () => {}),
      )
      expect(await gate.evaluate((state) => state.skips)).toBe(0)
      expect(await original.evaluate((watch) => [watch.current(), watch.changes])).toEqual([true, 0])
      await menu(page)
      await update.click()

      await expect(page).toHaveTitle('Tree release 2')
      await expect(input(page)).toHaveValue('Edited after cancellation')
    } finally {
      await context.close()
      await server.close()
    }
  })
}

test('keeps edits made after an accepted update times out and only reloads on retry', async ({ newContext }) => {
  const server = await releaseServer()
  const context = await newContext()
  try {
    const page = await context.newPage()
    await page.goto(server.url)
    await ready(page)
    const next = context.waitForEvent('serviceworker')
    server.publish(2)
    await page.evaluate(() => window.dispatchEvent(new Event('online')))
    const worker = await next
    await expect(page.locator('#tree-menu-button')).toHaveClass(/update-attention/)
    const gate = await worker.evaluateHandle(() => {
      const state = { accepted: false, release() {} }
      const paused = new Promise<void>((resolve) => {
        state.release = resolve
      })
      const put = Cache.prototype.put
      Cache.prototype.put = async function (key, response) {
        const metadata = String(key).endsWith('__offline_state__') ? await response.clone().json() : null
        await put.call(this, key, response)
        if (metadata?.active?.endsWith(':test-release-2')) {
          Cache.prototype.put = put
          state.accepted = true
          await paused
        }
      }
      return state
    })
    await page.clock.install()
    await page.clock.pauseAt(new Date(Date.now() + 1000))
    await menu(page)
    const update = page.getByRole('button', { name: 'Update App', exact: true })
    await update.click()
    await expect.poll(() => gate.evaluate((state) => state.accepted)).toBe(true)
    await page.clock.fastForward(15_001)
    await expect(page.locator('#offline-status')).toContainText('The update was requested')
    await page.keyboard.press('Escape')
    await input(page).fill('Edited after native browser acceptance')

    await gate.evaluate((state) => state.release())
    await expect
      .poll(() =>
        page.evaluate(async () => {
          const registration = (await navigator.serviceWorker.getRegistration())!
          return (
            registration.active?.state === 'activated' && navigator.serviceWorker.controller === registration.active
          )
        }),
      )
      .toBe(true)
    await expect(page).toHaveTitle('Tree release 1')
    await expect(input(page)).toHaveValue('Edited after native browser acceptance')
    await menu(page)
    await update.click()

    await expect(page).toHaveTitle('Tree release 2')
    await expect(input(page)).toHaveValue('Edited after native browser acceptance')
    expect((await readStored(page, 'document', 'head')).document.roots[0]?.text).toBe(
      'Edited after native browser acceptance',
    )
  } finally {
    await context.close()
    await server.close()
  }
})

test('activates for a saved page using the earlier one-way update protocol', async ({ newContext }) => {
  const server = await releaseServer()
  const context = await newContext()
  try {
    const page = await context.newPage()
    await page.goto(server.url)
    await ready(page)
    server.publish(4)
    await page.evaluate(() => window.dispatchEvent(new Event('online')))
    await expect(page.locator('#tree-menu-button')).toHaveClass(/update-attention/)
    await input(page).fill('Last edit from the earlier page')

    // The original page sends this message only after its successful save.
    const response = await page.evaluate(async () => {
      await window.prototypeStore.flushPersistence()
      const worker = (await navigator.serviceWorker.getRegistration())!.waiting!
      const assets = [
        document.querySelector<HTMLScriptElement>('script[type="module"]')!.src,
        ...Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'), (link) => link.href),
      ]
      const channel = new MessageChannel()
      const reply = new Promise<unknown>((resolve) => {
        channel.port1.onmessage = (event) => resolve(event.data)
      })
      worker.postMessage({ type: 'tree-activate-update', assets }, [channel.port2])
      try {
        return await reply
      } finally {
        channel.port1.close()
      }
    })
    expect(response).toBe('activating')
    await expect
      .poll(() =>
        page.evaluate(async () => {
          const registration = (await navigator.serviceWorker.getRegistration())!
          return (
            !registration.waiting &&
            registration.active?.state === 'activated' &&
            registration.active === navigator.serviceWorker.controller
          )
        }),
      )
      .toBe(true)
    await page.reload()

    await expect(page).toHaveTitle('Tree release 4')
    await expect(input(page)).toHaveValue('Last edit from the earlier page')
  } finally {
    await context.close()
    await server.close()
  }
})

test('opens the saved notes offline after an older waiting worker requires all tabs to close', async ({
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
    // An older worker treats the extension as an ordinary readiness request.
    await page.evaluate(() => {
      const post = ServiceWorker.prototype.postMessage
      ServiceWorker.prototype.postMessage = function (
        this: ServiceWorker,
        message,
        options?: StructuredSerializeOptions | Transferable[],
      ) {
        if (message?.prepareUpdate === true) {
          ServiceWorker.prototype.postMessage = post
          return Reflect.apply(post, this, [{ type: message.type, assets: message.assets }, options])
        }
        return Reflect.apply(post, this, [message, options])
      }
    })
    await input(page).fill('Saved before reopening all tabs')
    await menu(page)
    await page.getByRole('button', { name: 'Update App', exact: true }).click()
    await expect(page.locator('#offline-status')).toContainText('Close all Tree tabs and reopen Tree')
    expect((await readStored(page, 'document', 'head')).document.roots[0]?.text).toBe('Saved before reopening all tabs')
    await context.setOffline(true)
    await page.close()

    const reopened = await context.newPage()
    await reopened.goto(server.url)
    await expect(reopened).toHaveTitle('Tree release 2')
    await expect(input(reopened)).toHaveValue('Saved before reopening all tabs')
  } finally {
    await context.close()
    await server.close()
  }
})

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
    await input(page).click()
    await page.keyboard.press(`${primaryKey}+f`)
    await page.getByRole('textbox', { name: 'Search', exact: true }).fill('Second step')
    await page.keyboard.press('Enter')
    await expect(page.locator('.search-count')).toHaveText('1 / 1')
    await page.keyboard.press('Escape')
    await input(page).click()
    await page.evaluate(() => window.prototypeStore.flushPersistence())
    const savedHead = await readStored(page, 'document', 'head')
    await page.clock.install()
    await page.clock.pauseAt(new Date(Date.now() + 1000))
    await controlPostedTasksWithClock(page)
    await abortNextHeadWrite(page)
    await input(page).fill('Keep this text after failure')
    await input(page).press('End')
    await page.keyboard.press(`${primaryKey}+g`)
    await menu(page)
    await page.getByRole('button', { name: 'Update App', exact: true }).click()
    await expect(page.locator('#offline-status')).toHaveText('Local save failed.')
    await expect(page).toHaveTitle('Tree release 1')
    await expect(input(page)).toHaveValue('Keep this text after failure')
    expect(await page.locator('#root').evaluate((element) => (element as HTMLElement).inert)).toBe(false)
    expect(await readStored(page, 'document', 'head')).toEqual(savedHead)
    await page.clock.runFor(100)
    expect(
      await page.evaluate(() => (window.prototypeStore.getSnapshot() as ReadyEditorSnapshot).location.selectedNodeId),
    ).toBe('welcome')
    await page.keyboard.press('Escape')
    await page.keyboard.type('!')
    await expect(input(page)).toHaveValue('Keep this text after failure!')
    await expect(input(page)).toBeFocused()
    await menu(page)
    await page.getByRole('button', { name: 'Update App', exact: true }).click()
    await expect(page).toHaveTitle('Tree release 3')
    await expect(input(page)).toHaveValue('Keep this text after failure!')
  } finally {
    await context.close()
    await server.close()
  }
})
