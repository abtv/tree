// @editing-modes: independent
import { expect, launchTree, node, readPersisted, test, tryReadPersisted, typeInto } from './fixtures'

test.describe('Cmd+0', () => {
  // @requirement PRODUCT.md §9
  test('is registered globally and preserves the document and selection', async ({ userDataDir }) => {
    const { app, window } = await launchTree(userDataDir, { shortcut: 'real' })

    await typeInto(node(window, 1), 'Alpha')
    await window.keyboard.press('Enter')
    await typeInto(node(window, 2), 'Beta')

    const registered = await app.evaluate(({ globalShortcut }) => globalShortcut.isRegistered('CommandOrControl+0'))

    expect(registered).toBe(true)

    await window.keyboard.press('Meta+0')

    await expect(window.locator('[aria-label^="Node "]')).toHaveCount(2)
    await expect(node(window, 1)).toHaveValue('Alpha')
    await expect(node(window, 2)).toHaveValue('Beta')
    await expect(node(window, 2)).toBeFocused()
  })
})

test.describe('Cmd+Q', () => {
  // @requirement PRODUCT.md §9.1
  test('quits the application from an editable node', async ({ userDataDir }) => {
    const { app, window } = await launchTree(userDataDir, { shortcut: 'real' })
    const closed = new Promise<void>((resolve) => app.once('close', resolve))

    await node(window, 1)
      .press('Meta+q')
      .catch(() => undefined)

    await closed
  })

  test('quits after an edit has queued persistence', async ({ userDataDir }) => {
    const { app, window } = await launchTree(userDataDir, { shortcut: 'real' })

    await expect.poll(() => tryReadPersisted(userDataDir)?.document.roots[0]?.text).toBe('')

    await app.evaluate(() => {
      const control = globalThis as typeof globalThis & { saveStarted?: boolean; releaseSave?: () => void }
      const gate = new Promise<void>((resolve) => {
        control.releaseSave = resolve
      })
      globalThis.__treeIpc.wrap('tree:save', async (original, ...args) => {
        control.saveStarted = true
        await gate
        return original(...args)
      })
    })
    await window.evaluate(() => {
      const control = globalThis as typeof globalThis & {
        quitRequested?: boolean
        treeApi: { onQuitRequested(listener: () => void): () => void }
      }
      control.treeApi.onQuitRequested(() => {
        control.quitRequested = true
      })
    })

    // Ten words trigger the real volume save; hold it instead of relying on a long typing race.
    const text = 'one two three four five six seven eight nine ten'

    await typeInto(node(window, 1), text)

    await expect
      .poll(() => app.evaluate(() => (globalThis as typeof globalThis & { saveStarted?: boolean }).saveStarted))
      .toBe(true)

    const closed = new Promise<void>((resolve) => app.once('close', resolve))

    await node(window, 1).press('Meta+q')

    await expect
      .poll(() => window.evaluate(() => (globalThis as typeof globalThis & { quitRequested?: boolean }).quitRequested))
      .toBe(true)
    expect(app.process().exitCode).toBeNull()
    expect(readPersisted(userDataDir).document.roots[0]?.text).toBe('')

    await app.evaluate(() => (globalThis as typeof globalThis & { releaseSave?: () => void }).releaseSave?.())
    await closed

    expect(readPersisted(userDataDir).document.roots[0]?.text).toBe(text)
  })
})
