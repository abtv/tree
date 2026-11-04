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
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { onePixelPng } from '../../src/electron/main/png-test-utils'

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
  await clickApplicationMenuItem(app, 'Tree', 'Update App')
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

  await clickApplicationMenuItem(app, 'Tree', 'Update App')
  await expect(window.getByText(/Changes could not be saved:/)).toBeVisible()
  await expect.poll(() => window.evaluate(() => document.getElementById('root')!.inert)).toBe(false)
  expect(
    await app.evaluate(() => (globalThis as unknown as { __treeUpdates: { installs: number } }).__treeUpdates.installs),
  ).toBe(0)
  expect(app.process().exitCode).toBeNull()
  await restoreSaves(app)
  const closed = app.waitForEvent('close')
  await clickApplicationMenuItem(app, 'Tree', 'Update App')
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
  const enabled = () =>
    app.evaluate(
      ({ Menu }) =>
        Menu.getApplicationMenu()!.items[0]!.submenu!.items.find((item) => item.label === 'Update App')!.enabled,
    )
  await expect.poll(enabled).toBe(true)
  await window.getByRole('button', { name: 'Open image preview' }).click()
  await expect.poll(enabled).toBe(false)
  await window.keyboard.press('Escape')
  await expect.poll(enabled).toBe(true)
})
