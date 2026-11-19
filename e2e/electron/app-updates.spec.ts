// @editing-modes: independent
import {
  allowRendererError,
  blockSaves,
  closeMainWindow,
  documentPath,
  restoreSaves,
  setCursor,
  typeInto,
  clickApplicationMenuItem,
  clickApplicationMenuQuit,
  expect,
  launchTree,
  readPersisted,
  seedDocument,
  test,
} from './fixtures'
import { existsSync, mkdirSync, readFileSync, utimesSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { onePixelPng } from '../../src/shared/png-test-utils'
import { controlPostedTasksWithClock } from '../search-clock'
import { captureQuitTimer } from './quit-timer'

interface UpdateRetryProbe {
  confirmations: boolean[]
  saves: number
  releaseConfirmation(): void
  releaseSave(): void
}

for (const file of ['document.json', 'document.json.tmp']) {
  // @requirement PRODUCT.md §26
  test(`installs from a load error and preserves newer-format ${file} and its image`, async ({
    userDataDir,
  }, testInfo) => {
    const previous = {
      document: { roots: [{ id: 'note', text: 'Earlier revision', children: [] }] },
      location: { currentParentId: null, selectedNodeId: 'note' },
    }
    seedDocument(userDataDir, previous)
    const backup = readFileSync(documentPath(userDataDir))
    const generation = join(userDataDir, 'data', 'document.1.json')
    writeFileSync(generation, backup)
    const past = new Date(Date.now() - 60_000)
    utimesSync(generation, past, past)
    utimesSync(documentPath(userDataDir), past, past)
    const directory = join(userDataDir, 'data', 'attachments')
    mkdirSync(directory, { recursive: true })
    const image = join(directory, 'latest.png')
    writeFileSync(image, onePixelPng)
    const latest = join(userDataDir, 'data', file)
    const original = JSON.stringify({
      ...previous,
      version: 99999,
      document: {
        roots: [
          {
            id: 'note',
            text: 'Keep my latest edit',
            children: [],
            attachment: { id: 'latest', mimeType: 'image/png' },
            futureField: 'keep',
          },
        ],
      },
    })
    writeFileSync(latest, original)
    const primary = readFileSync(documentPath(userDataDir))
    const expectPreserved = () => {
      expect(readFileSync(latest, 'utf8')).toBe(original)
      expect(readFileSync(documentPath(userDataDir))).toEqual(primary)
      expect(readFileSync(generation)).toEqual(backup)
      expect(readFileSync(image)).toEqual(Buffer.from(onePixelPng))
    }
    const { app, window } = await launchTree(userDataDir, { appUpdates: true, expectReady: false })
    await expect(window.getByText('Tree could not open this document')).toBeVisible()
    await app.evaluate(() => {
      const updates = (globalThis as unknown as { __treeUpdates: { downloaded(): void; fail: boolean } }).__treeUpdates
      updates.fail = true
      updates.downloaded()
    })
    const enabled = () => app.evaluate(({ Menu }) => Menu.getApplicationMenu()!.getMenuItemById('update-app')!.enabled)
    await expect.poll(enabled).toBe(true)

    allowRendererError(/Update failed\. Try Restart and Install again/)
    await clickApplicationMenuItem(app, 'Tree', 'Restart and Install 1.2.4')
    await expect
      .poll(() =>
        app.evaluate(() => (globalThis as unknown as { __treeUpdates: { installs: number } }).__treeUpdates.installs),
      )
      .toBe(1)
    await expect.poll(enabled).toBe(true)
    await expect(window.getByText('Tree could not open this document')).toBeVisible()
    await expect(window.getByText(/Update failed\. Try Restart and Install again/)).toBeVisible()
    if (file === 'document.json.tmp')
      await window.screenshot({ path: testInfo.outputPath('unopened-document-update-error.png') })
    expectPreserved()

    await app.evaluate(() => {
      ;(globalThis as unknown as { __treeUpdates: { fail: boolean } }).__treeUpdates.fail = false
    })
    const closed = app.waitForEvent('close')
    await clickApplicationMenuItem(app, 'Tree', 'Restart and Install 1.2.4')
    await closed

    expectPreserved()
  })
}

test('a failed update keeps a delayed Find result from redirecting the next keystroke', async ({ userDataDir }) => {
  seedDocument(userDataDir, {
    document: {
      roots: [
        { id: 'a', text: 'Origin', children: [] },
        { id: 'b', text: 'Target', children: [] },
      ],
    },
    location: { currentParentId: null, selectedNodeId: 'a' },
  })
  const { app, window } = await launchTree(userDataDir, { appUpdates: true, vimPreference: false })
  const origin = window.locator('[data-node-id="a"] .node-input')
  await window.keyboard.press('Meta+f')
  await window.getByRole('textbox', { name: 'Search', exact: true }).fill('Target')
  await window.keyboard.press('Enter')
  await expect(window.locator('.search-count')).toHaveText('1 / 1')
  await window.keyboard.press('Escape')
  await origin.click()
  await window.clock.install()
  await window.clock.pauseAt(new Date(Date.now() + 1000))
  await controlPostedTasksWithClock(window)
  await origin.fill('Origin!')
  await setCursor(origin, 'Origin!'.length)
  await window.keyboard.press('Meta+g')
  await expect(origin).toBeFocused()
  await blockSaves(app)
  allowRendererError(/save blocked/)
  await app.evaluate(() => {
    ;(globalThis as unknown as { __treeUpdates: { downloaded(): void } }).__treeUpdates.downloaded()
  })

  await clickApplicationMenuItem(app, 'Tree', 'Restart and Install 1.2.4')
  await expect(window.getByText(/Changes could not be saved:/)).toBeVisible()
  await expect(window.locator('#root')).toHaveJSProperty('inert', false)
  await window.clock.runFor(1000)
  await window.keyboard.type('X')

  await expect(origin).toBeFocused()
  await expect(origin).toHaveValue('Origin!X')
  await restoreSaves(app)
  const closed = app.waitForEvent('close')
  await clickApplicationMenuItem(app, 'Tree', 'Restart and Install 1.2.4')
  await closed
  expect(readPersisted(userDataDir).document.roots.map((row) => row.text)).toEqual(['Origin!X', 'Target'])
})

test('closing the window while the update saves drains the edit before ordinary quit', async ({ userDataDir }) => {
  const { app, window } = await launchTree(userDataDir, { appUpdates: true, vimPreference: false })
  await expect.poll(() => existsSync(documentPath(userDataDir))).toBe(true)
  const gate = await app.evaluateHandle(() => {
    const control = { saving: false, installsAtQuit: -1, release() {}, finishQuit() {} }
    const pending = new Promise<void>((resolve) => {
      control.release = resolve
    })
    globalThis.__treeIpc.wrap('tree:save', async (original, ...args) => {
      control.saving = true
      await pending
      return original(...args)
    })
    const updates = (globalThis as unknown as { __treeUpdates: { downloaded(): void; installs: number } }).__treeUpdates
    const quit = new Promise<void>((resolve) => {
      control.finishQuit = resolve
    })
    globalThis.__treeIpc.wrap('tree:quit', async (original, ...args) => {
      control.installsAtQuit = updates.installs
      await quit
      return original(...args)
    })
    updates.downloaded()
    return control
  })
  await window.locator('.node-input').first().fill('Last edit before close')
  await clickApplicationMenuItem(app, 'Tree', 'Restart and Install 1.2.4')
  await expect.poll(() => gate.evaluate((control) => control.saving)).toBe(true)
  await closeMainWindow(app)
  expect(readPersisted(userDataDir).document.roots[0]?.text).not.toBe('Last edit before close')
  await gate.evaluate((control) => control.release())

  await expect.poll(() => gate.evaluate((control) => control.installsAtQuit)).toBe(0)
  expect(readPersisted(userDataDir).document.roots[0]?.text).toBe('Last edit before close')
  const closed = app.waitForEvent('close')
  await gate.evaluate((control) => control.finishQuit())
  await closed
  const reopened = await launchTree(userDataDir, { vimPreference: false })
  await expect(reopened.window.locator('.node-input').first()).toHaveValue('Last edit before close')
})

// @requirement PRODUCT.md §26
test('closing during native staging completes ordinary quit before a late native download', async ({ userDataDir }) => {
  const { app, window } = await launchTree(userDataDir, { appUpdates: true, vimPreference: false })
  const gate = await app.evaluateHandle(({ autoUpdater }) => {
    const state = { staging: false, installCalls: 0, quitRequested: false, release() {} }
    autoUpdater.checkForUpdates = () => {
      state.staging = true
    }
    autoUpdater.quitAndInstall = () => {
      state.installCalls++
    }
    const ack = new Promise<void>((resolve) => {
      state.release = resolve
    })
    globalThis.__treeIpc.wrap('tree:quit', async (original, ...args) => {
      state.quitRequested = true
      await ack
      return original(...args)
    })
    ;(globalThis as unknown as { __treeUpdates: { downloaded(): void } }).__treeUpdates.downloaded()
    return state
  })
  await window.locator('.node-input').first().fill('Last edit before native staging')
  await clickApplicationMenuItem(app, 'Tree', 'Restart and Install 1.2.4')
  await expect.poll(() => gate.evaluate((state) => state.staging)).toBe(true)

  await closeMainWindow(app)
  await expect.poll(() => gate.evaluate((state) => state.quitRequested)).toBe(true)
  await app.evaluate(({ autoUpdater }) => {
    autoUpdater.emit('update-downloaded')
  })
  expect(await gate.evaluate((state) => state.installCalls)).toBe(0)
  expect(readPersisted(userDataDir).document.roots[0]?.text).toBe('Last edit before native staging')
  const closed = app.waitForEvent('close')
  await gate.evaluate((state) => state.release())
  await closed

  const reopened = await launchTree(userDataDir, { vimPreference: false })
  await expect(reopened.window.locator('.node-input').first()).toHaveValue('Last edit before native staging')
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
for (const timing of ['during', 'after'] as const) {
  test(`a late native install error ${timing} the retry save cannot unlock the editor`, async ({ userDataDir }) => {
    const { app, window } = await launchTree(userDataDir, { appUpdates: true, vimPreference: false })
    await expect.poll(() => existsSync(documentPath(userDataDir))).toBe(true)
    const expire = await captureQuitTimer(app, 'update')
    const handoff = await app.evaluateHandle(({ autoUpdater }) => {
      const status = { starts: 0, finish: autoUpdater.quitAndInstall.bind(autoUpdater) }
      autoUpdater.quitAndInstall = () => {
        status.starts++
      }
      ;(globalThis as unknown as { __treeUpdates: { downloaded(): void } }).__treeUpdates.downloaded()
      return status
    })
    allowRendererError(/Update preparation took too long/)
    await clickApplicationMenuItem(app, 'Tree', 'Restart and Install 1.2.4')
    await expect.poll(() => handoff.evaluate((status) => status.starts)).toBe(1)
    await expire()
    await expect(window.locator('#root')).toHaveJSProperty('inert', false)

    const gate = await app.evaluateHandle(() => {
      const save = { started: false, confirmed: false, release() {} }
      const pending = new Promise<void>((resolve) => {
        save.release = resolve
      })
      globalThis.__treeIpc.wrap('tree:save', async (original, ...args) => {
        save.started = true
        await pending
        return original(...args)
      })
      globalThis.__treeIpc.wrap('tree:confirm-app-update', (original, ...args) => {
        const result = original(...args)
        save.confirmed = true
        return result
      })
      return save
    })
    await window.locator('.node-input').first().fill('Last edit after timeout')
    await clickApplicationMenuItem(app, 'Tree', 'Restart and Install 1.2.4')
    await expect.poll(() => gate.evaluate((save) => save.started)).toBe(true)
    if (timing === 'after') {
      await gate.evaluate((save) => save.release())
      await expect.poll(() => gate.evaluate((save) => save.confirmed)).toBe(true)
    }
    const startsBeforeError = await handoff.evaluate((status) => status.starts)
    await app.evaluate(({ autoUpdater }) => {
      autoUpdater.emit('error', new Error('Late native install failure'))
    })
    await window.evaluate(() => globalThis.window.treeApi.load())

    await expect(window.locator('#root')).toHaveJSProperty('inert', true)
    expect(startsBeforeError).toBe(1)
    if (timing === 'during') await gate.evaluate((save) => save.release())
    await expect.poll(() => handoff.evaluate((status) => status.starts)).toBe(2)
    const closed = app.waitForEvent('close')
    await handoff.evaluate((status) => status.finish())
    await closed
    expect(readPersisted(userDataDir).document.roots[0]?.text).toBe('Last edit after timeout')
  })
}

test('recovers through ordinary quit and reopen when native installation never responds', async ({ userDataDir }) => {
  const { app, window } = await launchTree(userDataDir, { appUpdates: true, vimPreference: false })
  await expect.poll(() => existsSync(documentPath(userDataDir))).toBe(true)
  const expire = await captureQuitTimer(app, 'update', 2)
  const status = await app.evaluateHandle(({ autoUpdater }) => {
    const status = { confirmed: 0, handoffs: 0 }
    autoUpdater.quitAndInstall = () => {
      status.handoffs++
    }
    globalThis.__treeIpc.wrap('tree:confirm-app-update', (original, ...args) => {
      const result = original(...args)
      status.confirmed++
      return result
    })
    ;(globalThis as unknown as { __treeUpdates: { downloaded(): void } }).__treeUpdates.downloaded()
    return status
  })
  allowRendererError(/Update preparation took too long/)
  const editor = window.locator('.node-input').first()
  for (const attempt of [1, 2]) {
    const text = `Edit before attempt ${attempt}`
    await editor.fill(text)
    await clickApplicationMenuItem(app, 'Tree', 'Restart and Install 1.2.4')
    await expect.poll(() => status.evaluate((value) => value.confirmed)).toBe(attempt)
    await expire()

    await expect(window.locator('#root')).toHaveJSProperty('inert', false)
    expect(readPersisted(userDataDir).document.roots[0]?.text).toBe(text)
  }
  expect(await status.evaluate((value) => value.handoffs)).toBe(1)
  await expect(window.getByRole('alert')).toContainText(/quit and reopen Tree/i)
  await window.screenshot({ path: 'test-results/update-preparation-timeout.png' })
  await editor.fill('Edit after the installer stopped responding')
  const closed = app.waitForEvent('close')
  await clickApplicationMenuQuit(app)
  await closed

  const reopened = await launchTree(userDataDir, { appUpdates: true, vimPreference: false })
  await expect(reopened.window.locator('.node-input').first()).toHaveValue(
    'Edit after the installer stopped responding',
  )
  await reopened.app.evaluate(() => {
    ;(globalThis as unknown as { __treeUpdates: { downloaded(): void } }).__treeUpdates.downloaded()
  })
  const installed = reopened.app.waitForEvent('close')
  await clickApplicationMenuItem(reopened.app, 'Tree', 'Restart and Install 1.2.4')
  await installed
  expect(readPersisted(userDataDir).document.roots[0]?.text).toBe('Edit after the installer stopped responding')
})

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
