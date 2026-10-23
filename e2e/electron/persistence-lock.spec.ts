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
  idleSavePoll,
  launchTree,
  node,
  readPersisted,
  readSaveAttempts,
  restoreSaves,
  test,
  typeInto,
} from './fixtures'

test.describe('save failure lock', () => {
  configureHiddenParallelTests()

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

  test('confirms quitting without saving while locked and opens the previous version on restart', async ({
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

    const text = 'alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi omicron pi rho sigma tau'
    await typeInto(node(window, 1), text)
    await expect(window.getByText(SAVE_LOCKED_MESSAGE)).toBeVisible({ timeout: 15_000 })

    await clickApplicationMenuQuit(app)
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
