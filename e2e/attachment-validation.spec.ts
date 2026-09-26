import { rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pngIhdr, pngWith } from '../src/main/png-test-utils'
import {
  attachmentFiles,
  clickApplicationMenuQuit,
  expect,
  firePaste,
  launchTree,
  node,
  readPersisted,
  test,
  tryReadPersisted,
  typeInto,
  writeClipboardImage,
  writeClipboardImageSized,
} from './fixtures'

const invalidPng = [
  137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 73, 69, 78, 68, 0, 0, 0, 0,
]

test.describe('attachment validation and image failures', () => {
  test('rejects invalid attachment bytes at the preload boundary without writing a file', async ({ userDataDir }) => {
    const { window } = await launchTree(userDataDir)

    const message = await window.evaluate(async (bytes) => {
      const api = (
        globalThis as unknown as { treeApi: { writeAttachment(id: string, data: Uint8Array): Promise<void> } }
      ).treeApi
      try {
        await api.writeAttachment('invalid-image', new Uint8Array(bytes))
        return 'resolved'
      } catch (error) {
        return error instanceof Error ? error.message : String(error)
      }
    }, invalidPng)

    expect(message).toMatch(/PNG/)
    expect(attachmentFiles(userDataDir)).not.toContain('invalid-image.png')
  })

  test('rejects an oversized PNG at the preload boundary before writing a file', async ({ userDataDir }) => {
    const { window } = await launchTree(userDataDir)
    const oversizedPng = [
      ...pngWith([
        ['IHDR', pngIhdr(30_000, 30_000)],
        ['IDAT', [1, 2, 3]],
        ['IEND', []],
      ]),
    ]

    const message = await window.evaluate(async (bytes) => {
      const api = (
        globalThis as unknown as { treeApi: { writeAttachment(id: string, data: Uint8Array): Promise<void> } }
      ).treeApi
      try {
        await api.writeAttachment('oversized-image', new Uint8Array(bytes))
        return 'resolved'
      } catch (error) {
        return error instanceof Error ? error.message : String(error)
      }
    }, oversizedPng)

    expect(message).toMatch(/image is too large/)
    expect(attachmentFiles(userDataDir)).not.toContain('oversized-image.png')
  })

  test('pastes a real image, decodes it in the browser, and restores it after restart', async ({ userDataDir }) => {
    const { app, window } = await launchTree(userDataDir)

    await writeClipboardImage(app)
    await firePaste(node(window, 1))

    const image = window.getByAltText('Attached image')
    await expect(image).toBeVisible()
    expect(await image.evaluate((element) => (element as HTMLImageElement).naturalWidth)).toBeGreaterThan(0)

    const closed = new Promise<void>((resolve) => app.once('close', resolve))
    await clickApplicationMenuQuit(app)
    await closed

    const restarted = await launchTree(userDataDir)
    await expect(restarted.window.getByAltText('Attached image')).toBeVisible()
  })

  test('shows an image-only node without a blank text row and keeps it editable', async ({ userDataDir }) => {
    const { app, window } = await launchTree(userDataDir, { initialMode: 'normal' })
    const editor = node(window, 1)
    await writeClipboardImageSized(app, 80, 80)
    await firePaste(editor)

    await expect(window.getByAltText('Attached image')).toBeVisible()
    await expect(editor).toHaveClass(/node-input-image-only/)
    const row = window.locator('.node-row').first()
    await expect(row).toHaveClass(/node-row-image-only/)
    await expect(row).toHaveScreenshot('image-only-node.png')

    await window.getByRole('button', { name: 'Enter node 1' }).click()
    const parentEditor = window.getByRole('textbox', { name: 'Current parent' })
    await expect(parentEditor).toHaveClass(/node-input-image-only/)
    await expect(window.getByRole('region', { name: 'Current parent' })).toHaveScreenshot('image-only-parent.png')

    await typeInto(parentEditor, 'parent caption')
    await expect(parentEditor).toHaveValue('parent caption')
    await expect(parentEditor).not.toHaveClass(/node-input-image-only/)
    await expect(window.getByAltText('Attached image')).toHaveCount(1)

    await window.getByRole('button', { name: 'Top level' }).click()
    await expect(editor).toHaveValue('parent caption')
    await expect(editor).not.toHaveClass(/node-input-image-only/)
    await expect(row).not.toHaveClass(/node-row-image-only/)
    await expect(row.getByAltText('Attached image')).toBeVisible()
    await expect(row.getByAltText('Attached image')).toHaveCount(1)
  })

  test('keeps an image-only text cursor reachable from a blank row click in Normal mode', async ({ userDataDir }) => {
    const { app, window } = await launchTree(userDataDir, { initialMode: 'normal' })
    const editor = node(window, 1)
    await writeClipboardImageSized(app, 80, 80)
    await firePaste(editor)

    const row = window.locator('.node-row').first()
    await expect(editor).toHaveClass(/node-input-image-only/)
    await expect(editor).toHaveCSS('height', '1px')
    await expect(window.getByLabel('Vim mode')).toHaveText('NORMAL')
    await editor.focus()
    await expect(editor).toBeFocused()
    await expect(row.getByRole('button', { name: 'Open image preview' })).toHaveClass(/attachment-image-caret/)
    await expect(editor).toHaveCSS('caret-color', 'rgba(0, 0, 0, 0)')
    await expect(row).toHaveScreenshot('image-only-normal-focused.png', { caret: 'initial' })

    await window.keyboard.press('Enter')
    await expect(window.getByRole('dialog', { name: 'Image preview' })).toBeVisible()
    await window.getByRole('button', { name: 'Close image preview' }).click()
    await expect(editor).toBeFocused()
    await expect(row.getByRole('button', { name: 'Open image preview' })).toHaveClass(/attachment-image-caret/)

    await window.getByRole('button', { name: 'Enter node 1' }).click()
    const parentEditor = window.getByRole('textbox', { name: 'Current parent' })
    await expect(parentEditor).toHaveClass(/node-input-image-only/)
    await window.getByRole('region', { name: 'Current parent' }).click({ position: { x: 250, y: 5 } })
    await expect(parentEditor).toBeFocused()
    await window.keyboard.press('i')
    await expect(window.getByLabel('Vim mode')).toHaveText('INSERT')
    await expect(parentEditor).toHaveCSS('height', '30px')
    await window.keyboard.press('Escape')
    await expect(window.getByLabel('Vim mode')).toHaveText('NORMAL')
    await expect(parentEditor).toHaveCSS('height', '1px')
    await window.getByRole('button', { name: 'Top level' }).click()

    await window.getByRole('button', { name: 'Open image preview' }).click()
    await expect(window.getByRole('dialog', { name: 'Image preview' })).toBeVisible()
    await window.getByRole('button', { name: 'Close image preview' }).click()

    const bounds = await row.boundingBox()
    if (bounds === null) throw new Error('The image-only node row is not visible.')
    await row.click({ position: { x: Math.floor(bounds.width * 0.8), y: 12 } })
    await window.keyboard.press('i')

    await expect(window.getByLabel('Vim mode')).toHaveText('INSERT')
    await expect(editor).toHaveCSS('height', '20px')
    await expect(editor).toHaveCSS('caret-color', 'rgb(55, 63, 67)')
    await expect(row).toHaveScreenshot('image-only-insert-empty.png', { caret: 'initial' })
    await typeInto(editor, 'typed after row click')
    await expect(editor).toHaveValue('typed after row click')
  })

  test('moves the Normal-mode caret onto an image with l and opens it with Enter', async ({ userDataDir }) => {
    const { app, window } = await launchTree(userDataDir, { initialMode: 'normal' })
    const editor = node(window, 1)
    await typeInto(editor, 'text before image')
    await editor.press('Escape')
    await writeClipboardImageSized(app, 80, 80)
    await firePaste(editor)

    const row = window.locator('.node-row').first()
    await expect(row.getByAltText('Attached image')).toBeVisible()
    await expect(editor).toHaveValue('text before image')
    await window.keyboard.press('l')

    await expect(editor).toBeFocused()
    const imageButton = row.getByRole('button', { name: 'Open image preview' })
    await expect(imageButton).toHaveClass(/attachment-image-caret/)
    await expect(editor).toHaveClass(/node-input-image-caret/)
    await expect(row).toHaveScreenshot('text-and-image-image-caret.png', { caret: 'initial' })
    await window.keyboard.press('Enter')
    await expect(window.getByRole('dialog', { name: 'Image preview' })).toBeVisible()
    await expect(window.getByRole('img', { name: 'Attached image preview' })).toBeVisible()
    await window.getByRole('button', { name: 'Close image preview' }).click()
    await expect(imageButton).toHaveClass(/attachment-image-caret/)
    await window.keyboard.press('h')
    await expect(imageButton).not.toHaveClass(/attachment-image-caret/)
  })

  test('opens a document whose stored attachment file is missing', async ({ userDataDir }) => {
    const first = await launchTree(userDataDir)
    await writeClipboardImage(first.app)
    await firePaste(node(first.window, 1))
    await expect(first.window.getByAltText('Attached image')).toBeVisible()
    await expect
      .poll(() => tryReadPersisted(userDataDir)?.document.roots[0]?.attachment?.id)
      .toEqual(expect.any(String))
    const attachmentId = readPersisted(userDataDir).document.roots[0]!.attachment!.id
    const closed = new Promise<void>((resolve) => first.app.once('close', resolve))
    await clickApplicationMenuQuit(first.app)
    await closed

    rmSync(join(userDataDir, 'data', 'attachments', `${attachmentId}.png`))

    const restarted = await launchTree(userDataDir)
    await expect(restarted.window.getByText('Image could not be loaded.')).toBeVisible()
    await typeInto(node(restarted.window, 1), 'still editable')
    await expect(node(restarted.window, 1)).toHaveValue('still editable')
  })

  test('reports a read failure without disabling the editor', async ({ userDataDir }) => {
    const { app, window } = await launchTree(userDataDir)
    await app.evaluate(() => {
      globalThis.__treeIpc.wrap('tree:read-attachment', () => {
        throw new Error('read blocked')
      })
    })

    await writeClipboardImage(app)
    await firePaste(node(window, 1))

    await expect(window.getByText('Image could not be loaded.')).toBeVisible()
    await typeInto(node(window, 1), 'still editable')
    await expect(node(window, 1)).toHaveValue('still editable')
  })

  test('reports corrupt stored bytes after restart and preserves preview keyboard behavior', async ({
    userDataDir,
  }) => {
    const first = await launchTree(userDataDir)
    await writeClipboardImage(first.app)
    await firePaste(node(first.window, 1))
    await expect(first.window.getByAltText('Attached image')).toBeVisible()

    const openButton = first.window.getByRole('button', { name: 'Open image preview' })
    await openButton.click()
    await expect(first.window.getByRole('dialog', { name: 'Image preview' })).toBeVisible()
    await first.window.keyboard.press('Escape')
    await expect(first.window.getByRole('dialog', { name: 'Image preview' })).toBeHidden()
    await expect(openButton).toBeFocused()

    const attachmentId = readPersisted(userDataDir).document.roots[0]?.attachment?.id
    expect(attachmentId).toEqual(expect.any(String))
    const closed = new Promise<void>((resolve) => first.app.once('close', resolve))
    await clickApplicationMenuQuit(first.app)
    await closed

    writeFileSync(
      join(userDataDir, 'data', 'attachments', `${attachmentId}.png`),
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    )

    const restarted = await launchTree(userDataDir)
    await expect(restarted.window.getByText('Image could not be loaded.')).toBeVisible()
    await typeInto(node(restarted.window, 1), 'still editable')
    await expect(node(restarted.window, 1)).toHaveValue('still editable')
  })
})
