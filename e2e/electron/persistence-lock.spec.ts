// @editing-modes: independent
import { existsSync } from 'node:fs'
import { QUIT_WITHOUT_SAVING_PROMPT, SAVE_LOCKED_MESSAGE } from '../../src/domain/product-messages'
import {
  allowRendererError,
  blockSaves,
  clickApplicationMenuQuit,
  configureHiddenParallelTests,
  documentPath,
  exactMessage,
  expect,
  fireIdleSave,
  firePaste,
  idleSavePoll,
  launchTree,
  node,
  pressKeyThatQuits,
  readPersisted,
  readSaveAttempts,
  restoreSaves,
  seedDocument,
  startRowDrag,
  test,
  typeInto,
  unlockSystemClipboard,
  writeClipboardText,
} from './fixtures'

test.describe('save failure lock', () => {
  configureHiddenParallelTests()

  // @requirement PRODUCT.md §11
  // @requirement PRODUCT.md §20.1
  test('stops drag autoscroll when a save failure locks editing', async ({ userDataDir }, testInfo) => {
    seedDocument(userDataDir, {
      document: {
        roots: Array.from({ length: 100 }, (_, index) => ({ id: `n${index}`, text: `Row ${index}`, children: [] })),
      },
      location: { currentParentId: null, selectedNodeId: 'n0' },
    })
    const { app, window } = await launchTree(userDataDir)
    const scrollTop = (): Promise<number> =>
      window.evaluate(() => document.querySelector('.scroll-viewport')?.scrollTop ?? 0)
    allowRendererError(
      exactMessage("Changes could not be saved: Error invoking remote method 'tree:save': Error: save blocked"),
    )
    allowRendererError(exactMessage(SAVE_LOCKED_MESSAGE))
    await window.clock.install()
    await blockSaves(app, { countAttempts: true })
    const input = window.getByRole('textbox', { name: 'Node 1', exact: true })
    await typeInto(input, ' edited')

    for (let attempt = 1; attempt <= 2; attempt += 1) {
      await fireIdleSave(window)
      await expect.poll(() => readSaveAttempts(app), idleSavePoll).toBe(attempt)
      await window.evaluate(() =>
        (globalThis as typeof globalThis & { treeApi: { load(): Promise<unknown> } }).treeApi.load(),
      )
    }

    const source = window.locator('.node-row').first()
    await startRowDrag(window, source.locator('.node-input'))
    const viewport = await window.locator('.scroll-viewport').boundingBox()
    if (viewport === null) throw new Error('The scroll viewport was not rendered.')
    await window.mouse.move(viewport.x + viewport.width / 2, viewport.y + viewport.height - 1)

    await expect.poll(scrollTop).toBeGreaterThan(100)
    await window.screenshot({ path: testInfo.outputPath('drag-scrolling.png') })

    await fireIdleSave(window)

    await expect(window.getByText(SAVE_LOCKED_MESSAGE)).toBeVisible(idleSavePoll)
    await expect(window.locator('.node-row-dragging')).toHaveCount(0)
    await expect(window.locator('.node-row-drop-on, .node-row-drop-before, .node-row-drop-after')).toHaveCount(0)
    const stopped = await scrollTop()
    await window.waitForTimeout(300)

    expect(await scrollTop()).toBe(stopped)
    await window.screenshot({ path: testInfo.outputPath('drag-cancelled.png') })
    await window.mouse.up()

    await expect(input).not.toBeEditable()
    await restoreSaves(app)
  })

  // @requirement PRODUCT.md §16.2
  test('stops after three failed saves and persists on quit once saving works again', async ({ userDataDir }) => {
    const { app, window } = await launchTree(userDataDir)

    await expect.poll(() => existsSync(documentPath(userDataDir))).toBe(true)

    allowRendererError(
      exactMessage("Changes could not be saved: Error invoking remote method 'tree:save': Error: save blocked"),
    )
    allowRendererError(exactMessage(SAVE_LOCKED_MESSAGE))
    // Install before editing so any incorrectly retained retry uses the controlled clock too.
    await window.clock.install()
    await blockSaves(app, { countAttempts: true })

    const text = 'alpha beta gamma delta epsilon zeta eta theta iota kappa lambda'

    await typeInto(node(window, 1), text)

    await expect(window.getByRole('status')).toContainText('Changes could not be saved:', idleSavePoll)

    // Typing can queue more than one volume-triggered save. Drain their replies before advancing
    // each remaining retry, so the renderer has armed its next idle timer.
    await window.evaluate(() =>
      (globalThis as typeof globalThis & { treeApi: { load(): Promise<unknown> } }).treeApi.load(),
    )
    const initialAttempts = await readSaveAttempts(app)

    expect(initialAttempts).toBeGreaterThan(0)
    expect(initialAttempts).toBeLessThanOrEqual(3)

    for (let expectedAttempts = initialAttempts + 1; expectedAttempts <= 3; expectedAttempts += 1) {
      await fireIdleSave(window)

      await expect.poll(() => readSaveAttempts(app), idleSavePoll).toBe(expectedAttempts)

      await window.evaluate(() =>
        (globalThis as typeof globalThis & { treeApi: { load(): Promise<unknown> } }).treeApi.load(),
      )
    }

    await expect(window.getByText(SAVE_LOCKED_MESSAGE)).toBeVisible(idleSavePoll)
    await expect(node(window, 1)).not.toBeEditable()
    // @requirement PRODUCT.md §25.1
    expect(
      await app.evaluate(({ Menu }) =>
        Menu.getApplicationMenu()!
          .items.find((item) => item.label === 'File')!
          .submenu!.items.map((item) => item.enabled),
      ),
    ).toEqual([false, false])

    const frozen = await node(window, 1).inputValue()
    const attempts = await readSaveAttempts(app)

    expect(attempts).toBe(3)

    await window.clock.runFor(12_000)
    // Drain renderer-to-main work before checking that no extra save was attempted.
    await window.evaluate(() =>
      (globalThis as typeof globalThis & { treeApi: { load(): Promise<unknown> } }).treeApi.load(),
    )

    expect(await readSaveAttempts(app)).toBe(attempts)
    expect(await node(window, 1).inputValue()).toBe(frozen)

    await restoreSaves(app)
    const closed = new Promise<void>((resolve) => app.once('close', resolve))

    await clickApplicationMenuQuit(app)
    await closed

    expect(readPersisted(userDataDir).document.roots[0]?.text).toBe(frozen)
  })

  // @requirement PRODUCT.md §16.2
  test('keeps a delayed volume paste locked until the final quit save', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: { roots: [{ id: 'root', text: '', children: [] }] },
      location: { currentParentId: null, selectedNodeId: 'root' },
    })
    const { app, window } = await launchTree(userDataDir)
    allowRendererError(
      exactMessage("Changes could not be saved: Error invoking remote method 'tree:save': Error: save blocked"),
    )
    allowRendererError(exactMessage(SAVE_LOCKED_MESSAGE))
    await window.clock.install()
    await blockSaves(app, { countAttempts: true })
    await app.evaluate(() => {
      const control = globalThis as typeof globalThis & {
        clipboardStarted?: boolean
        clipboardReturned?: boolean
        releaseClipboard?: () => void
      }
      const gate = new Promise<void>((resolve) => {
        control.releaseClipboard = resolve
      })
      globalThis.__treeIpc.wrap('tree:read-clipboard', async (original, ...args) => {
        control.clipboardStarted = true
        await gate
        const result = await original(...args)
        control.clipboardReturned = true
        return result
      })
    })
    await writeClipboardText(app, 'one two three four five six seven eight nine ten ')
    await typeInto(node(window, 1), 'pending')
    await firePaste(node(window, 1))
    await expect
      .poll(() =>
        app.evaluate(() => (globalThis as typeof globalThis & { clipboardStarted?: boolean }).clipboardStarted),
      )
      .toBe(true)

    for (let attempt = 1; attempt <= 3; attempt++) {
      await fireIdleSave(window)
      await expect.poll(() => readSaveAttempts(app), idleSavePoll).toBe(attempt)
      await window.evaluate(() =>
        (globalThis as typeof globalThis & { treeApi: { load(): Promise<unknown> } }).treeApi.load(),
      )
    }
    await expect(window.getByText(SAVE_LOCKED_MESSAGE)).toBeVisible(idleSavePoll)
    await restoreSaves(app)
    await app.evaluate(() => {
      const control = globalThis as typeof globalThis & { saveAttempts?: number; releaseClipboard?: () => void }
      globalThis.__treeIpc.wrap('tree:save', (original, ...args) => {
        control.saveAttempts = (control.saveAttempts ?? 0) + 1
        return original(...args)
      })
      control.releaseClipboard?.()
    })
    await expect
      .poll(() =>
        app.evaluate(() => (globalThis as typeof globalThis & { clipboardReturned?: boolean }).clipboardReturned),
      )
      .toBe(true)
    await fireIdleSave(window)
    await window.evaluate(() =>
      (globalThis as typeof globalThis & { treeApi: { load(): Promise<unknown> } }).treeApi.load(),
    )
    unlockSystemClipboard()

    expect(await readSaveAttempts(app)).toBe(3)
    await expect(window.getByText(SAVE_LOCKED_MESSAGE)).toBeVisible()
    await expect(node(window, 1)).not.toBeEditable()
    await expect(node(window, 1)).toHaveValue('pending')

    const closed = new Promise<void>((resolve) => app.once('close', resolve))
    await clickApplicationMenuQuit(app)
    await closed

    expect(readPersisted(userDataDir).document.roots[0]?.text).toBe('pending')
  })

  test('confirms quitting without saving while locked and opens the previous version on restart', async ({
    userDataDir,
    editingMode,
  }) => {
    const { app, window } = await launchTree(userDataDir)

    await expect.poll(() => existsSync(documentPath(userDataDir))).toBe(true)

    allowRendererError(
      exactMessage("Changes could not be saved: Error invoking remote method 'tree:save': Error: save blocked"),
    )
    allowRendererError(exactMessage("Operation failed: Error invoking remote method 'tree:save': Error: save blocked"))
    allowRendererError(exactMessage(SAVE_LOCKED_MESSAGE))
    await blockSaves(app)

    const text = 'alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi omicron pi rho sigma tau'

    await typeInto(node(window, 1), text)

    await expect(window.getByText(SAVE_LOCKED_MESSAGE)).toBeVisible({ timeout: 15_000 })

    await clickApplicationMenuQuit(app)

    await expect(window.getByText(QUIT_WITHOUT_SAVING_PROMPT)).toBeVisible({ timeout: 8_000 })
    await expect(window.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused()

    await window.keyboard.press(editingMode === 'vim' ? 'l' : 'Tab')

    await expect(window.getByRole('button', { name: 'Quit without saving' })).toBeFocused()

    await window.keyboard.press(editingMode === 'vim' ? 'h' : 'Shift+Tab')

    await expect(window.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused()

    await window.keyboard.press('Escape')

    await expect(window.getByRole('alertdialog')).toHaveCount(0)
    await expect(
      window.getByText('Operation failed: The application could not finish saving before quit.'),
    ).toHaveCount(0)

    await clickApplicationMenuQuit(app)

    await expect(window.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused()

    await window.keyboard.press(editingMode === 'vim' ? 'l' : 'Tab')
    const closed = new Promise<void>((resolve) => app.once('close', resolve))

    await pressKeyThatQuits(window, 'Enter')
    await closed

    const relaunched = await launchTree(userDataDir)

    await expect(relaunched.window.locator('main.tree-app')).toBeVisible()
    expect(readPersisted(userDataDir).document.roots[0]?.text).toBe('')
    await expect(node(relaunched.window, 1)).toBeEditable()
    await expect(relaunched.window.getByText(SAVE_LOCKED_MESSAGE)).toHaveCount(0)
  })
})
