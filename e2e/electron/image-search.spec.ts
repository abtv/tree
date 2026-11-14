// @editing-modes: both
import {
  test,
  expect,
  describeForEachEditingMode,
  launchTree,
  closeApp,
  seedDocument,
  lockSystemClipboard,
  firePaste,
  node,
  fireIdleSave,
  readPersisted,
  writeClipboardImageSized,
  typeInto,
} from './fixtures'

describeForEachEditingMode('automatic image search', ({ screenshotName }) => {
  // @requirement PRODUCT.md §15.1
  // @requirement PRODUCT.md §20.14
  test('recognizes paste, preserves hidden text after restart and removes matches with the image', async ({
    userDataDir,
  }) => {
    seedDocument(userDataDir, {
      document: { roots: [{ id: 'source', text: 'Screenshot', children: [] }] },
      location: { currentParentId: null, selectedNodeId: 'source' },
    })
    const { app, window } = await launchTree(userDataDir)
    await window.clock.install()
    const bytes = await window.evaluate(() => {
      const canvas = document.createElement('canvas')
      canvas.width = 800
      canvas.height = 240
      const context = canvas.getContext('2d')!
      context.fillStyle = 'white'
      context.fillRect(0, 0, 800, 240)
      context.fillStyle = 'black'
      context.font = '64px Arial'
      context.fillText('Secret Zebra', 30, 130)
      return Array.from(atob(canvas.toDataURL('image/png').split(',')[1]!), (c) => c.charCodeAt(0))
    })
    await app.evaluate(() => {
      const control = globalThis as typeof globalThis & { releaseImageOcr?: () => void }
      globalThis.__treeIpc.wrap('tree:image-to-text', async (original, ...args) => {
        await new Promise<void>((resolve) => {
          control.releaseImageOcr = resolve
        })
        return original(...args)
      })
    })
    await lockSystemClipboard()
    await app.evaluate(async ({ clipboard, ClipboardItem }, png) => {
      clipboard.clear()
      await clipboard.write([
        new ClipboardItem({ 'public.png': new Blob([new Uint8Array(png)], { type: 'image/png' }) }),
      ])
    }, bytes)

    await firePaste(node(window, 1))
    const image = window.locator('.attachment-button')
    await expect(image).toHaveAttribute('data-recognition-incomplete', 'true')
    await expect(image.locator('..')).toHaveScreenshot(screenshotName('image-recognition-pending.png'))
    await window.emulateMedia({ colorScheme: 'dark' })
    await expect.poll(() => window.evaluate(() => matchMedia('(prefers-color-scheme: dark)').matches)).toBe(true)
    await expect(image.locator('..')).toHaveScreenshot(screenshotName('image-recognition-pending-dark.png'))
    await window.emulateMedia({ colorScheme: 'light' })
    const pendingBox = await image.boundingBox()
    await expect
      .poll(() =>
        app.evaluate(
          () =>
            typeof (
              globalThis as typeof globalThis & {
                releaseImageOcr?: () => void
              }
            ).releaseImageOcr,
        ),
      )
      .toBe('function')
    await app.evaluate(() => (globalThis as typeof globalThis & { releaseImageOcr: () => void }).releaseImageOcr())
    await expect(image).not.toHaveAttribute('data-recognition-incomplete', 'true', { timeout: 30_000 })
    expect(await image.boundingBox()).toEqual(pendingBox)
    await expect(node(window, 1)).toHaveValue('Screenshot')
    await expect(window.locator('.node-input')).toHaveCount(1)
    await fireIdleSave(window)
    await expect
      .poll(() => readPersisted(userDataDir).document.roots[0]?.attachment?.searchText)
      .toContain('Secret Zebra')
    await closeApp(app)

    const reopened = await launchTree(userDataDir)
    await expect(reopened.window.locator('.attachment-button')).not.toHaveAttribute(
      'data-recognition-incomplete',
      'true',
    )
    await reopened.window.keyboard.press('Meta+;')
    await reopened.window.getByRole('searchbox', { name: 'Search query' }).fill('secret zebra')
    await expect(reopened.window.getByRole('listbox', { name: 'Search results' }).getByRole('option')).toHaveCount(1)
    await expect(reopened.window.getByRole('listbox', { name: 'Search results' })).toContainText('Screenshot')
    await expect(reopened.window.getByRole('listbox', { name: 'Search results' })).not.toContainText('Secret Zebra')
    await reopened.window.keyboard.press('Escape')
    await reopened.window.keyboard.press('Meta+Backspace')
    await expect(reopened.window.locator('.attachment-button')).toHaveCount(0)
    await reopened.window.keyboard.press('Meta+;')
    await reopened.window.getByRole('searchbox', { name: 'Search query' }).fill('secret zebra')
    await expect(reopened.window.getByText('No results', { exact: true })).toBeVisible()
  })
})

test.describe('pending recognition with Vim image caret', () => {
  test.use({ editingMode: 'vim' })

  // @requirement PRODUCT.md §15.1
  test('keeps both the recognition border and image caret on rows and the current parent', async ({ userDataDir }) => {
    const { app, window } = await launchTree(userDataDir, { appearance: 'dark' })
    await window.emulateMedia({ colorScheme: 'dark' })
    await app.evaluate(() => {
      globalThis.__treeIpc.wrap('tree:image-to-text', () => new Promise<string[]>(() => undefined))
    })
    await typeInto(node(window, 1), 'Pending image')
    await window.keyboard.press('Escape')
    await writeClipboardImageSized(app, 80, 80)
    await firePaste(node(window, 1))
    await window.keyboard.press('l')

    await expect(window.locator('.attachment-button')).toHaveClass(/attachment-image-caret/)
    await expect(window.locator('.attachment-button')).toHaveAttribute('data-recognition-incomplete', 'true')
    await expect(window.locator('.node-row').first()).toHaveScreenshot('pending-image-caret-dark.png', {
      caret: 'initial',
    })
    await window.keyboard.press('Meta+.')
    await expect(window.getByRole('region', { name: 'Current parent' }).locator('.attachment-button')).toHaveAttribute(
      'data-recognition-incomplete',
      'true',
    )
    await expect(window.getByRole('region', { name: 'Current parent' })).toHaveScreenshot(
      'pending-image-parent-dark.png',
    )
  })
})
