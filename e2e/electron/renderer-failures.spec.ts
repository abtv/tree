// @editing-modes: independent
import {
  clickApplicationMenuQuit,
  expect,
  forceRenderFailure,
  launchTree,
  node,
  readPersisted,
  setCursor,
  test,
  typeInto,
} from './fixtures'

test.describe('unexpected renderer errors', () => {
  // @requirement PRODUCT.md §21
  test('shows the fallback and reloads the last saved document', async ({ userDataDir }) => {
    // Quit flushes the document deterministically, so the last saved document is a known baseline.
    const first = await launchTree(userDataDir)
    const savedText = 'saved before reload'
    await typeInto(node(first.window, 1), savedText)
    const firstClosed = new Promise<void>((resolve) => first.app.once('close', resolve))
    await clickApplicationMenuQuit(first.app)
    await firstClosed
    expect(readPersisted(userDataDir).document.roots[0]?.text).toBe(savedText)

    const { window } = await launchTree(userDataDir)
    await expect(node(window, 1)).toHaveValue(savedText)

    const unsavedTail = ' unsaved tail'
    await setCursor(node(window, 1), savedText.length)
    await typeInto(node(window, 1), unsavedTail)
    await expect(node(window, 1)).toHaveValue(`${savedText}${unsavedTail}`)

    await forceRenderFailure(window)

    await expect(window.getByRole('heading', { name: 'Tree encountered an unexpected error' })).toBeVisible()
    await expect(window.getByText('forced renderer failure')).toBeVisible()
    await expect(window.getByText('Reload to continue from your last saved document.')).toBeVisible()

    await window.getByRole('button', { name: 'Reload' }).click()

    // Reloading restores the last saved document; the in-memory tail was never persisted.
    await expect(window.locator('main.tree-app')).toBeVisible()
    await expect(node(window, 1)).toHaveValue(savedText)
  })
})
