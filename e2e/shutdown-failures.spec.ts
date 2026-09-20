import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { QUIT_WITHOUT_SAVING_PROMPT, SAVE_LOCKED_MESSAGE } from '../src/domain/product-messages'
import {
  allowRendererError,
  blockSaves,
  clickApplicationMenuQuit,
  closeMainWindow,
  configureHiddenParallelTests,
  delaySaveIpc,
  documentPath,
  exactMessage,
  expect,
  launchTree,
  node,
  readPersisted,
  restoreSaves,
  test,
  tryReadPersisted,
  typeInto,
  waitForDelayedSave,
} from './fixtures'

test.describe('shutdown failure handling', () => {
  configureHiddenParallelTests()

  test('keeps the app open after a save failure and quits after a successful retry', async ({ userDataDir }) => {
    const { app, window } = await launchTree(userDataDir)
    await expect.poll(() => existsSync(documentPath(userDataDir))).toBe(true)
    allowRendererError(
      /^Changes could not be saved: Error invoking remote method 'tree:(?:save|cleanup-attachments)': Error: (?:EEXIST|EISDIR|ENOTDIR): /,
    )
    allowRendererError(
      /^Operation failed: Error invoking remote method 'tree:(?:save|cleanup-attachments)': Error: (?:EEXIST|EISDIR|ENOTDIR): /,
    )
    allowRendererError(/^Operation failed: The application could not finish saving before quit\.$/)

    const dataDirectory = join(userDataDir, 'data')
    const temporaryDocumentPath = join(dataDirectory, 'document.json.tmp')
    mkdirSync(temporaryDocumentPath)

    const initialText = 'unsaved one two three four five six seven eight nine'
    const recoveryText = ' recovered ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen'
    await typeInto(node(window, 1), initialText)
    await expect(window.getByText(/Changes could not be saved:/)).toBeVisible()

    await node(window, 1).press('Meta+q')
    await expect(window.getByText(/Operation failed:/)).toBeVisible()
    expect(app.process().exitCode).toBeNull()
    await expect(
      window.getByText('Operation failed: The application could not finish saving before quit.'),
    ).toBeVisible({ timeout: 7_000 })

    rmSync(temporaryDocumentPath, { recursive: true, force: true })
    await typeInto(node(window, 1), recoveryText)

    await expect(window.getByText(/Changes could not be saved:/)).toHaveCount(0)
    await expect
      .poll(() => tryReadPersisted(userDataDir)?.document.roots[0]?.text ?? '', {
        timeout: 15_000,
      })
      .toBe(`${initialText}${recoveryText}`)

    const closed = new Promise<void>((resolve) => app.once('close', resolve))
    await clickApplicationMenuQuit(app)
    await closed
  })

  test('suppresses duplicate quit requests, reports timeout, and permits retry', async ({ userDataDir }) => {
    const { app, window } = await launchTree(userDataDir)
    allowRendererError(/Operation failed: The application could not finish saving before quit\./)
    allowRendererError(/Operation failed: Error invoking remote method 'tree:quit': Error: Invalid quit request\./)
    await delaySaveIpc(app, 5_500)
    await window.evaluate(() => {
      const state = globalThis as typeof globalThis & {
        __quitRequestCount?: number
        treeApi: { onQuitRequested(listener: () => void): () => void }
      }
      state.__quitRequestCount = 0
      state.treeApi.onQuitRequested(() => {
        state.__quitRequestCount = (state.__quitRequestCount ?? 0) + 1
      })
    })

    await typeInto(node(window, 1), 'delayed save')
    await clickApplicationMenuQuit(app)
    await clickApplicationMenuQuit(app)

    await expect
      .poll(() =>
        window.evaluate(() => (globalThis as typeof globalThis & { __quitRequestCount?: number }).__quitRequestCount),
      )
      .toBe(1)
    await expect(
      window.getByText('Operation failed: The application could not finish saving before quit.'),
    ).toBeVisible({ timeout: 7_000 })
    expect(app.process().exitCode).toBeNull()

    await waitForDelayedSave(app)
    const closed = new Promise<void>((resolve) => app.once('close', resolve))
    await clickApplicationMenuQuit(app)
    await closed
  })

  test('flushes pending changes and quits when the window is closed', async ({ userDataDir }) => {
    const { app, window } = await launchTree(userDataDir)
    await expect.poll(() => existsSync(documentPath(userDataDir))).toBe(true)
    const text = 'window close flush pending'

    await typeInto(node(window, 1), text)
    expect(readPersisted(userDataDir).document.roots[0]?.text).toBe('')
    const closed = new Promise<void>((resolve) => app.once('close', resolve))
    await closeMainWindow(app)
    await closed

    expect(readPersisted(userDataDir).document.roots[0]?.text).toBe(text)
  })

  test('flushes pending changes and quits when the window is closed while the application is not frontmost', async ({
    userDataDir,
  }) => {
    const { app, window } = await launchTree(userDataDir)
    await expect.poll(() => existsSync(documentPath(userDataDir))).toBe(true)
    const text = 'hidden window close flush pending'

    await typeInto(node(window, 1), text)
    expect(readPersisted(userDataDir).document.roots[0]?.text).toBe('')

    // The application is inactive from here on, so the focused-window selector returns null.
    await app.evaluate(({ app: electronApp }) => electronApp.hide())
    await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getFocusedWindow() === null)).toBe(true)

    const closed = app.waitForEvent('close', { timeout: 10_000 })
    await closeMainWindow(app)
    await closed

    expect(readPersisted(userDataDir).document.roots[0]?.text).toBe(text)
  })

  test('flushes text typed while the quit save is in flight', async ({ userDataDir }) => {
    const { app, window } = await launchTree(userDataDir)
    await expect.poll(() => existsSync(documentPath(userDataDir))).toBe(true)

    await app.evaluate(() => {
      const control = globalThis as typeof globalThis & {
        saveCalls?: number
        firstSaveStarted?: boolean
        releaseFirstSave?: () => void
      }
      control.saveCalls = 0
      const gate = new Promise<void>((resolve) => {
        control.releaseFirstSave = resolve
      })
      globalThis.__treeIpc.wrap('tree:save', async (original, ...args) => {
        control.saveCalls = (control.saveCalls ?? 0) + 1
        if (control.saveCalls === 1) {
          control.firstSaveStarted = true
          await gate
        }
        return original(...args)
      })
    })

    const beforeQuit = 'before quit'
    const typedWhilePending = ' typed while quit save pending'
    await typeInto(node(window, 1), beforeQuit)
    await clickApplicationMenuQuit(app)
    await expect
      .poll(() =>
        app.evaluate(() => (globalThis as typeof globalThis & { firstSaveStarted?: boolean }).firstSaveStarted),
      )
      .toBe(true)

    await typeInto(node(window, 1), typedWhilePending)
    const closed = new Promise<void>((resolve) => app.once('close', resolve))
    await app.evaluate(() => (globalThis as typeof globalThis & { releaseFirstSave?: () => void }).releaseFirstSave?.())
    await closed

    expect(readPersisted(userDataDir).document.roots[0]?.text).toBe(`${beforeQuit}${typedWhilePending}`)
  })

  test('keeps the app open after a window-close save failure, reports the timeout, and quits after a retry', async ({
    userDataDir,
  }) => {
    const { app, window } = await launchTree(userDataDir)
    await expect.poll(() => existsSync(documentPath(userDataDir))).toBe(true)
    allowRendererError(
      exactMessage("Changes could not be saved: Error invoking remote method 'tree:save': Error: save blocked"),
    )
    allowRendererError(exactMessage("Operation failed: Error invoking remote method 'tree:save': Error: save blocked"))
    allowRendererError(/^Operation failed: The application could not finish saving before quit\.$/)
    await blockSaves(app)

    // Exactly ten words trigger one volume save attempt before the window close.
    const initialText = 'window close failure alpha beta gamma delta epsilon zeta eta'
    await typeInto(node(window, 1), initialText)
    await expect(window.getByText(/Changes could not be saved:/)).toBeVisible()

    await closeMainWindow(app)
    expect(app.process().exitCode).toBeNull()
    await expect(
      window.getByText('Operation failed: The application could not finish saving before quit.'),
    ).toBeVisible({ timeout: 7_000 })

    await restoreSaves(app)
    const recoveryText = ' recovered one two three four five six seven eight nine ten'
    await typeInto(node(window, 1), recoveryText)
    const closed = new Promise<void>((resolve) => app.once('close', resolve))
    await closeMainWindow(app)
    await closed

    expect(readPersisted(userDataDir).document.roots[0]?.text).toBe(`${initialText}${recoveryText}`)
  })

  test('cancels a window-close quit while locked and confirms without saving on the next close', async ({
    userDataDir,
  }) => {
    const { app, window } = await launchTree(userDataDir)
    await expect.poll(() => existsSync(documentPath(userDataDir))).toBe(true)
    allowRendererError(
      exactMessage("Changes could not be saved: Error invoking remote method 'tree:save': Error: save blocked"),
    )
    allowRendererError(exactMessage("Operation failed: Error invoking remote method 'tree:save': Error: save blocked"))
    allowRendererError(/^Operation failed: The application could not finish saving before quit\.$/)
    allowRendererError(exactMessage(SAVE_LOCKED_MESSAGE))
    await blockSaves(app)

    const text = 'locked window close alpha beta gamma delta epsilon zeta eta theta iota kappa lambda'
    await typeInto(node(window, 1), text)
    await expect(window.getByText(SAVE_LOCKED_MESSAGE)).toBeVisible({ timeout: 15_000 })

    await closeMainWindow(app)
    await expect(window.getByText(QUIT_WITHOUT_SAVING_PROMPT)).toBeVisible({ timeout: 8_000 })

    await window.getByRole('button', { name: 'Cancel' }).click()
    await expect(window.getByText(QUIT_WITHOUT_SAVING_PROMPT)).toHaveCount(0)
    expect(app.process().exitCode).toBeNull()
    await expect(window.getByText(SAVE_LOCKED_MESSAGE)).toBeVisible()

    // The bounded quit handshake still expires after the cancellation before another close can be requested.
    await expect(
      window.getByText('Operation failed: The application could not finish saving before quit.'),
    ).toBeVisible({ timeout: 7_000 })

    await closeMainWindow(app)
    await expect(window.getByText(QUIT_WITHOUT_SAVING_PROMPT)).toBeVisible({ timeout: 8_000 })
    const closed = new Promise<void>((resolve) => app.once('close', resolve))
    await window.getByRole('button', { name: 'Quit without saving' }).click()
    await closed

    const relaunched = await launchTree(userDataDir)
    await expect(relaunched.window.locator('main.tree-app')).toBeVisible()
    expect(readPersisted(userDataDir).document.roots[0]?.text).toBe('')
    await expect(node(relaunched.window, 1)).toBeEditable()
    await expect(relaunched.window.getByText(SAVE_LOCKED_MESSAGE)).toHaveCount(0)
  })
})
