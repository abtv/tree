import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  allowRendererError,
  clickApplicationMenuQuit,
  delaySaveIpc,
  documentPath,
  expect,
  launchTree,
  node,
  readPersisted,
  test,
  typeInto,
} from './fixtures'

test.describe('shutdown failure handling', () => {
  test('keeps the app open after a save failure and quits after a successful retry', async ({ userDataDir }) => {
    const { app, window } = await launchTree(userDataDir)
    await expect.poll(() => existsSync(documentPath(userDataDir))).toBe(true)
    allowRendererError(
      /^Changes could not be saved: Error invoking remote method 'tree:save': Error: (?:EEXIST|ENOTDIR): /,
    )
    allowRendererError(/^Operation failed: Error invoking remote method 'tree:save': Error: (?:EEXIST|ENOTDIR): /)
    allowRendererError(/^Operation failed: The application could not finish saving before quit\.$/)

    const dataDirectory = join(userDataDir, 'data')
    rmSync(dataDirectory, { recursive: true, force: true })
    writeFileSync(dataDirectory, 'blocks persistence directory creation')

    await typeInto(node(window, 1), 'unsaved')
    await expect(window.getByText(/Changes could not be saved:/)).toBeVisible()

    await node(window, 1).press('Meta+q')
    await expect(window.getByText(/Operation failed:/)).toBeVisible()
    expect(app.process().exitCode).toBeNull()
    await expect(
      window.getByText('Operation failed: The application could not finish saving before quit.'),
    ).toBeVisible({ timeout: 7_000 })

    rmSync(dataDirectory, { force: true })
    mkdirSync(dataDirectory, { recursive: true })
    await typeInto(node(window, 1), ' recovered')

    await expect(window.getByText(/Changes could not be saved:/)).toHaveCount(0)
    await expect
      .poll(() => (existsSync(documentPath(userDataDir)) ? readPersisted(userDataDir).document.roots[0]?.text : ''))
      .toBe('unsaved recovered')

    const closed = new Promise<void>((resolve) => app.once('close', resolve))
    await clickApplicationMenuQuit(app)
    await closed
  })

  test('suppresses duplicate quit requests, reports timeout, and permits retry', async ({ userDataDir }) => {
    const { app, window } = await launchTree(userDataDir)
    allowRendererError(/Operation failed: The application could not finish saving before quit\./)
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

    await new Promise<void>((resolve) => globalThis.setTimeout(resolve, 750))
    const closed = new Promise<void>((resolve) => app.once('close', resolve))
    await clickApplicationMenuQuit(app)
    await closed
  })

  test('preserves saved state across window close and quits without a renderer', async ({ userDataDir }) => {
    const { app, window } = await launchTree(userDataDir)
    await expect.poll(() => existsSync(documentPath(userDataDir))).toBe(true)
    const text = 'saved window-close persistence '.repeat(100)

    await typeInto(node(window, 1), text)
    await expect.poll(() => readPersisted(userDataDir).document.roots[0]?.text).toBe(text)
    await window.close()

    expect(readPersisted(userDataDir).document.roots[0]?.text).toBe(text)
    const closed = new Promise<void>((resolve) => app.once('close', resolve))
    await clickApplicationMenuQuit(app)
    await closed
  })
})
