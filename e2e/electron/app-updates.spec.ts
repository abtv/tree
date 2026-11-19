// @editing-modes: independent
import {
  allowRendererError,
  blockSaves,
  documentPath,
  restoreSaves,
  setCursor,
  typeInto,
  clickApplicationMenuItem,
  expect,
  launchTree,
  readPersisted,
  seedDocument,
  test,
} from './fixtures'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { onePixelPng } from '../../src/electron/main/png-test-utils'

interface UpdateRetryProbe {
  confirmations: boolean[]
  saves: number
  releaseConfirmation(): void
  releaseSave(): void
}

// @requirement PRODUCT.md §26
test('installs a ready update after a document load error and preserves the file', async ({ userDataDir }) => {
  const original = '{"version":99999}'
  mkdirSync(join(userDataDir, 'data'), { recursive: true })
  writeFileSync(documentPath(userDataDir), original)
  const { app, window } = await launchTree(userDataDir, { appUpdates: true, expectReady: false })
  await expect(window.getByText('Tree could not open this document')).toBeVisible()
  await app.evaluate(() => {
    ;(globalThis as unknown as { __treeUpdates: { downloaded(): void } }).__treeUpdates.downloaded()
  })
  await expect
    .poll(() => app.evaluate(({ Menu }) => Menu.getApplicationMenu()!.getMenuItemById('update-app')!.enabled))
    .toBe(true)

  const closed = app.waitForEvent('close')
  await clickApplicationMenuItem(app, 'Tree', 'Restart and Install 1.2.4')
  await closed

  expect(readFileSync(documentPath(userDataDir), 'utf8')).toBe(original)
})

// @requirement PRODUCT.md §26
test('keeps a retry locked when an earlier failed-save acknowledgment arrives late', async ({ userDataDir }) => {
  const { app, window } = await launchTree(userDataDir, { appUpdates: true, vimPreference: false })
  await expect.poll(() => existsSync(documentPath(userDataDir))).toBe(true)
  allowRendererError(/retry save blocked/)
  allowRendererError(/Update failed/)
  await app.evaluate(() => {
    const runtime = globalThis as typeof globalThis & {
      __treeUpdateRetry: UpdateRetryProbe
      __treeUpdates: { downloaded(): void; fail: boolean }
    }
    const probe: UpdateRetryProbe = {
      confirmations: [],
      saves: 0,
      releaseConfirmation: () => undefined,
      releaseSave: () => undefined,
    }
    runtime.__treeUpdateRetry = probe
    const confirmation = new Promise<void>((resolve) => {
      probe.releaseConfirmation = resolve
    })
    const save = new Promise<void>((resolve) => {
      probe.releaseSave = resolve
    })
    globalThis.__treeIpc.wrap('tree:save', async (original, ...args) => {
      if (++probe.saves === 1) throw new Error('retry save blocked')
      await save
      return original(...args)
    })
    globalThis.__treeIpc.wrap('tree:confirm-app-update', async (original, event, id, saved, ...args) => {
      probe.confirmations.push(saved as boolean)
      const result = original(event, id, saved, ...args)
      // Main sends its real finished event before the negative invoke response is released.
      if (!saved) await confirmation
      return result
    })
    runtime.__treeUpdates.fail = true
    runtime.__treeUpdates.downloaded()
  })
  const confirmations = () =>
    app.evaluate(
      () => (globalThis as typeof globalThis & { __treeUpdateRetry: UpdateRetryProbe }).__treeUpdateRetry.confirmations,
    )
  const inert = () => window.evaluate(() => document.getElementById('root')!.inert)
  const editor = window.locator('.node-input').first()
  await editor.fill('Pending retry')

  await clickApplicationMenuItem(app, 'Tree', 'Restart and Install 1.2.4')

  await expect.poll(confirmations).toEqual([false])
  await expect.poll(inert).toBe(false)

  await clickApplicationMenuItem(app, 'Tree', 'Restart and Install 1.2.4')

  await expect.poll(inert).toBe(true)
  await expect
    .poll(() =>
      app.evaluate(
        () => (globalThis as typeof globalThis & { __treeUpdateRetry: UpdateRetryProbe }).__treeUpdateRetry.saves,
      ),
    )
    .toBe(2)

  await app.evaluate(() =>
    (globalThis as typeof globalThis & { __treeUpdateRetry: UpdateRetryProbe }).__treeUpdateRetry.releaseConfirmation(),
  )
  // Drain a later IPC response before inspecting the old acknowledgment's renderer continuation.
  await window.evaluate(() =>
    (globalThis as typeof globalThis & { treeApi: { load(): Promise<unknown> } }).treeApi.load(),
  )

  expect(await inert()).toBe(true)
  await window.keyboard.type('ignored')
  await expect(editor).toHaveValue('Pending retry')
  await app.evaluate(() =>
    (globalThis as typeof globalThis & { __treeUpdateRetry: UpdateRetryProbe }).__treeUpdateRetry.releaseSave(),
  )

  await expect.poll(confirmations).toEqual([false, true])
  await expect
    .poll(() =>
      app.evaluate(() => (globalThis as unknown as { __treeUpdates: { installs: number } }).__treeUpdates.installs),
    )
    .toBe(1)
  await expect.poll(inert).toBe(false)
  expect(readPersisted(userDataDir).document.roots[0]?.text).toBe('Pending retry')
  await editor.fill('Editable after retry')
  await expect(editor).toHaveValue('Editable after retry')
})

// @requirement PRODUCT.md §26
test('rechecks a ready package, replaces it only after a successful download and reports failure', async ({
  userDataDir,
}) => {
  const { app, window } = await launchTree(userDataDir, { appUpdates: true, initialMode: 'normal' })
  await app.evaluate(() => {
    const probe = (globalThis as unknown as { __treeUpdates: { downloaded(): void; nextVersion: string } })
      .__treeUpdates
    probe.downloaded()
    probe.nextVersion = '1.2.5'
  })
  const menu = () =>
    app.evaluate(({ Menu }) => {
      const item = Menu.getApplicationMenu()!.getMenuItemById('update-app')!
      return { label: item.label, enabled: item.enabled }
    })
  await expect.poll(menu).toEqual({ label: 'Restart and Install 1.2.4', enabled: true })

  await clickApplicationMenuItem(app, 'Tree', 'Check for Updates…')
  await expect.poll(menu).toEqual({ label: 'Restart and Install Update', enabled: false })
  await expect(window.locator('.update-status')).toHaveText('Downloading update… 0%')
  await app.evaluate(() => {
    ;(
      globalThis as unknown as { __treeUpdates: { finishDownload(failed: boolean): void } }
    ).__treeUpdates.finishDownload(true)
  })
  await expect(window.locator('.update-status')).toHaveText('Update failed. Check for Updates to retry.')
  await expect.poll(menu).toEqual({ label: 'Restart and Install Update', enabled: false })
  await window.screenshot({ path: 'test-results/update-status-failed.png' })

  await clickApplicationMenuItem(app, 'Tree', 'Check for Updates…')
  await expect(window.locator('.update-status')).toHaveText('Downloading update… 0%')
  await app.evaluate(() => {
    ;(
      globalThis as unknown as { __treeUpdates: { finishDownload(failed: boolean): void } }
    ).__treeUpdates.finishDownload(false)
  })
  await expect.poll(menu).toEqual({ label: 'Restart and Install 1.2.5', enabled: true })
  await expect(window.locator('.update-status')).toHaveText('Update ready')
  await window.keyboard.press(':')
  await window.locator('.command-input-line input').fill('update-app')
  await expect(window.locator('#command-update-app')).toContainText('Restart and Install 1.2.5')
})

// @requirement PRODUCT.md §26
test('download status yields to colon input and restores current readiness after reload', async ({ userDataDir }) => {
  const { app, window } = await launchTree(userDataDir, { appUpdates: true, initialMode: 'normal' })
  await app.evaluate(() => {
    ;(globalThis as unknown as { __treeUpdates: { progress(percent: number): void } }).__treeUpdates.progress(42.8)
  })
  const status = window.locator('.update-status')
  await expect(status).toHaveText('Downloading update… 42%')
  await expect(status.locator('button, a')).toHaveCount(0)
  const bounds = await status.boundingBox()
  const footer = await window.locator('.status-bar').boundingBox()
  expect(bounds!.x - footer!.x).toBe(12)
  await window.screenshot({ path: 'test-results/update-status-downloading.png' })

  await window.keyboard.press(':')
  await expect(window.locator('.command-input-line input')).toBeVisible()
  await expect(status).toHaveCount(0)
  await app.evaluate(() => {
    ;(globalThis as unknown as { __treeUpdates: { downloaded(): void } }).__treeUpdates.downloaded()
  })
  await window.keyboard.press('Escape')
  await expect(status).toHaveText('Update ready')
  await window.screenshot({ path: 'test-results/update-status-ready.png' })

  await window.reload()
  await expect(status).toHaveText('Update ready')
})

// @requirement PRODUCT.md §20.2.28
test('command panel shares live update availability and runs the manual check', async ({ userDataDir }) => {
  const { app, window } = await launchTree(userDataDir, { appUpdates: true, vimPreference: false })
  await window.locator('.node-input').first().click()
  await window.keyboard.press('Meta+Shift+P')
  const input = window.locator('.command-input-line input')
  await input.fill('update-app')
  const update = window.locator('#command-update-app')
  await expect(update).toHaveAttribute('aria-disabled', 'true')
  await window.keyboard.press('Enter')
  await expect(input).toBeVisible()
  await update.click({ force: true })
  await expect(input).toBeVisible()
  await window.screenshot({ path: 'test-results/update-command-disabled.png' })

  await app.evaluate(() => {
    ;(globalThis as unknown as { __treeUpdates: { downloaded(): void } }).__treeUpdates.downloaded()
  })
  await expect(update).not.toHaveAttribute('aria-disabled', 'true')
  await input.fill('check-for-updates')
  await window.keyboard.press('Enter')
  await expect
    .poll(() =>
      app.evaluate(() => (globalThis as unknown as { __treeUpdates: { messages: string[] } }).__treeUpdates.messages),
    )
    .toEqual(['An update is ready to install.'])
  await expect(input).not.toBeVisible()
})

// @requirement PRODUCT.md §26
test('manual update checks report current, failed and downloaded results without installing', async ({
  userDataDir,
}) => {
  const { app } = await launchTree(userDataDir, { appUpdates: true, vimPreference: false })
  const messages = () =>
    app.evaluate(() => (globalThis as unknown as { __treeUpdates: { messages: string[] } }).__treeUpdates.messages)
  await clickApplicationMenuItem(app, 'Tree', 'Check for Updates…')
  await expect.poll(messages).toEqual(['Tree is up to date.'])
  await app.evaluate(() => {
    ;(globalThis as unknown as { __treeUpdates: { checkFails: boolean } }).__treeUpdates.checkFails = true
  })
  await clickApplicationMenuItem(app, 'Tree', 'Check for Updates…')
  await expect.poll(messages).toEqual(['Tree is up to date.', 'Could not check for updates.'])
  await app.evaluate(() => {
    const probe = (globalThis as unknown as { __treeUpdates: { checkFails: boolean; downloaded(): void } })
      .__treeUpdates
    probe.checkFails = false
    probe.downloaded()
  })
  await clickApplicationMenuItem(app, 'Tree', 'Check for Updates…')
  await expect
    .poll(messages)
    .toEqual(['Tree is up to date.', 'Could not check for updates.', 'An update is ready to install.'])
  expect(
    await app.evaluate(() => (globalThis as unknown as { __treeUpdates: { installs: number } }).__treeUpdates.installs),
  ).toBe(0)
})

// @requirement PRODUCT.md §26
test('updates only on request, flushes edits, and keeps normal quit safe after installation failure', async ({
  userDataDir,
}) => {
  const { app, window } = await launchTree(userDataDir, { appUpdates: true, vimPreference: false })
  const editor = window.locator('.node-input').first()
  await editor.fill('Saved before update')
  await app.evaluate(() => {
    const probe = (globalThis as unknown as { __treeUpdates: { downloaded(): void; fail: boolean } }).__treeUpdates
    probe.fail = true
    probe.downloaded()
  })
  allowRendererError(/Update failed/)
  await clickApplicationMenuItem(app, 'Tree', 'Restart and Install 1.2.4')
  await expect.poll(() => readPersisted(userDataDir).document.roots[0]?.text).toBe('Saved before update')
  await expect.poll(() => window.evaluate(() => document.getElementById('root')!.inert)).toBe(false)
  await window.screenshot({ path: 'test-results/app-update-error.png' })
  await editor.fill('Edited after failed update')
  await app.evaluate(() => {
    ;(globalThis as unknown as { __treeUpdates: { fail: boolean } }).__treeUpdates.fail = false
  })
  const closed = app.waitForEvent('close')
  await window.keyboard.press('Meta+Shift+P')
  await window.locator('.command-input-line input').fill('update-app')
  await window.keyboard.press('Enter')
  await closed
  expect(readPersisted(userDataDir).document.roots[0]?.text).toBe('Edited after failed update')
})

// @requirement PRODUCT.md §26
test('ordinary Quit leaves a downloaded update unrequested', async ({ userDataDir }) => {
  const { app, window } = await launchTree(userDataDir, { appUpdates: true, vimPreference: false })
  await window.locator('.node-input').first().fill('Normal quit still saves')
  await app.evaluate(() => {
    const probe = (globalThis as unknown as { __treeUpdates: { downloaded(): void; installs: number } }).__treeUpdates
    probe.downloaded()
    if (probe.installs !== 0) throw new Error('Installed without consent')
  })
  const closed = app.waitForEvent('close')
  await clickApplicationMenuItem(app, 'Tree', 'Quit Tree')
  await closed
  expect(readPersisted(userDataDir).document.roots[0]?.text).toBe('Normal quit still saves')
})

// @requirement PRODUCT.md §26
test('failed update save retains the pending Vim Replace edit without starting installation', async ({
  userDataDir,
}) => {
  const { app, window } = await launchTree(userDataDir, {
    appUpdates: true,
    vimPreference: true,
    initialMode: 'normal',
  })
  await expect.poll(() => existsSync(documentPath(userDataDir))).toBe(true)
  allowRendererError(/save blocked/)
  await blockSaves(app)
  const editor = window.locator('.node-input').first()
  await typeInto(editor, 'abcd')
  await setCursor(editor, 2)
  await window.keyboard.press('Escape')
  await window.keyboard.press('R')
  await window.keyboard.type('XY')
  await expect(editor).toHaveValue('aXYd')
  await app.evaluate(() => {
    ;(globalThis as unknown as { __treeUpdates: { downloaded(): void } }).__treeUpdates.downloaded()
  })

  await clickApplicationMenuItem(app, 'Tree', 'Restart and Install 1.2.4')
  await expect(window.getByText(/Changes could not be saved:/)).toBeVisible()
  await expect.poll(() => window.evaluate(() => document.getElementById('root')!.inert)).toBe(false)
  expect(
    await app.evaluate(() => (globalThis as unknown as { __treeUpdates: { installs: number } }).__treeUpdates.installs),
  ).toBe(0)
  expect(app.process().exitCode).toBeNull()
  await restoreSaves(app)
  const closed = app.waitForEvent('close')
  await clickApplicationMenuItem(app, 'Tree', 'Restart and Install 1.2.4')
  await closed
  expect(readPersisted(userDataDir).document.roots[0]?.text).toBe('aXYd')
})

// @requirement PRODUCT.md §26
test('disables Update App while image preview is open and restores it on close', async ({ userDataDir }) => {
  seedDocument(userDataDir, {
    document: {
      roots: [{ id: 'note', text: 'Image', children: [], attachment: { id: 'preview', mimeType: 'image/png' } }],
    },
    location: { currentParentId: null, selectedNodeId: 'note' },
  })
  mkdirSync(join(userDataDir, 'data', 'attachments'), { recursive: true })
  writeFileSync(join(userDataDir, 'data', 'attachments', 'preview.png'), onePixelPng)
  const { app, window } = await launchTree(userDataDir, { appUpdates: true, vimPreference: false })
  await app.evaluate(() => {
    ;(globalThis as unknown as { __treeUpdates: { downloaded(): void } }).__treeUpdates.downloaded()
  })
  const enabled = () => app.evaluate(({ Menu }) => Menu.getApplicationMenu()!.getMenuItemById('update-app')!.enabled)
  await expect.poll(enabled).toBe(true)
  await window.getByRole('button', { name: 'Open image preview' }).click()
  await expect.poll(enabled).toBe(false)
  await window.keyboard.press('Escape')
  await expect.poll(enabled).toBe(true)
})
