import { writeFileSync } from 'node:fs'
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
  typeInto,
  writeClipboardImage,
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
