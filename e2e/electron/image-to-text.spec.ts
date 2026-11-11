// @editing-modes: vim
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test, expect, launchTree, closeApp, seedDocument, fireIdleSave, readPersisted } from './fixtures'
import { ipcEvents } from '../../src/shared/ipc'
import { onePixelPng } from '../../src/shared/png-test-utils'

test.use({ editingMode: 'vim' })

// @requirement PRODUCT.md §15.1

test('recognizes a real image with Apple Vision and appends paragraphs after existing children', async ({
  userDataDir,
}) => {
  test.skip(process.platform !== 'darwin' || process.arch !== 'arm64', 'Apple Silicon prototype')
  const initial = await launchTree(userDataDir, { initialMode: 'normal' })
  const bytes = await initial.window.evaluate(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 1000
    canvas.height = 650
    const context = canvas.getContext('2d')!
    context.fillStyle = 'white'
    context.fillRect(0, 0, 1000, 650)
    context.fillStyle = 'black'
    context.font = '24px Arial'
    context.fillText('Framework', 40, 35)
    context.font = '48px Arial'
    context.fillText('Vision', 40, 100)
    context.font = '32px Arial'
    context.fillText('Please review the release notes.', 40, 160)
    context.fillText('The build is ready for testing.', 40, 202)
    context.fillText('• Send feedback tomorrow.', 40, 300)
    context.fillText('Include the build number.', 62, 342)
    context.fillText('• Check the release status.', 40, 384)
    return Array.from(atob(canvas.toDataURL('image/png').split(',')[1]!), (character) => character.charCodeAt(0))
  })
  await closeApp(initial.app)
  seedDocument(userDataDir, {
    document: {
      roots: [
        {
          id: 'source',
          text: 'Screenshot',
          attachment: { id: 'ocr-image', mimeType: 'image/png' },
          children: [{ id: 'existing', text: 'Existing child', children: [] }],
        },
      ],
    },
    location: { currentParentId: null, selectedNodeId: 'source' },
  })
  mkdirSync(join(userDataDir, 'data', 'attachments'), { recursive: true })
  writeFileSync(join(userDataDir, 'data', 'attachments', 'ocr-image.png'), Buffer.from(bytes))
  const { app, window } = await launchTree(userDataDir, { initialMode: 'normal' })
  await window.clock.install()

  await window.keyboard.press(':')
  await window.getByRole('combobox', { name: 'Command' }).fill('image-to-text')
  await expect(window.getByRole('option', { selected: true })).toContainText('image-to-text')
  await window.screenshot({ path: '.scratch/image-to-text/command.png' })
  await window.keyboard.press('Enter')

  await expect(window.locator('.status-bar')).toContainText(/Image to text: added \d+ paragraphs\./, {
    timeout: 30_000,
  })
  await window.getByRole('button', { name: 'Expand node 1', exact: true }).click()
  await app.evaluate(({ BrowserWindow }, channel) => {
    BrowserWindow.getAllWindows()[0]!.webContents.send(channel, {
      'check-for-updates': false,
      'update-app': false,
      status: 42,
    })
  }, ipcEvents.updateCommandsChanged)
  await expect(window.locator('.status-bar')).toContainText('Downloading update… 42%')
  await expect(window.locator('.status-bar')).toContainText('Image to text: added 5 paragraphs.')
  await window.screenshot({ path: '.scratch/image-to-text/result.png' })
  await fireIdleSave(window)
  await expect
    .poll(() => readPersisted(userDataDir).document.roots[0]!.children.map((child) => child.text))
    .toEqual([
      'Existing child',
      'Framework',
      'Vision',
      'Please review the release notes. The build is ready for testing.',
      '',
      'Send feedback tomorrow. Include the build number.',
      'Check the release status.',
    ])

  // Native failures must be returned to the UI caller without launching another process indefinitely.
  await expect(
    window.evaluate(async () => {
      try {
        await globalThis.window.treeApi.imageToText!('missing-image')
        return ''
      } catch (error) {
        return String(error)
      }
    }),
  ).resolves.toContain('could not be loaded')
  writeFileSync(join(userDataDir, 'data', 'attachments', 'ocr-image.png'), Buffer.from('invalid PNG'))
  await window.keyboard.press(':')
  await window.getByRole('combobox', { name: 'Command' }).fill('image-to-text')
  await window.keyboard.press('Enter')
  await expect(window.locator('.status-bar')).toContainText('Image to text failed:')
  expect(readPersisted(userDataDir).document.roots[0]!.children).toHaveLength(7)
  await closeApp(app)
})

for (const mode of ['insert', 'replace'] as const) {
  // @requirement PRODUCT.md §15.1
  test(`background OCR preserves active Vim ${mode} editing`, async ({ userDataDir }) => {
    test.skip(process.platform !== 'darwin' || process.arch !== 'arm64', 'Apple Silicon only')
    seedDocument(userDataDir, {
      document: {
        roots: [
          { id: 'image', text: 'Image', attachment: { id: 'png', mimeType: 'image/png' }, children: [] },
          { id: 'other', text: 'abcd', children: [] },
        ],
      },
      location: { currentParentId: null, selectedNodeId: 'image' },
    })
    mkdirSync(join(userDataDir, 'data', 'attachments'), { recursive: true })
    writeFileSync(join(userDataDir, 'data', 'attachments', 'png.png'), onePixelPng)
    const { app, window } = await launchTree(userDataDir, { initialMode: 'normal' })
    // Delay just the OCR port to exercise deterministic typing while a result is pending.
    await app.evaluate(() => {
      const runtime = globalThis as unknown as {
        __treeIpc: { wrap(channel: string, wrapper: () => Promise<string[]>): void }
        finishOcr?: (text: string[]) => void
      }
      runtime.__treeIpc.wrap(
        'tree:image-to-text',
        () =>
          new Promise((done) => {
            runtime.finishOcr = done
          }),
      )
    })
    await window.keyboard.press(':')
    await window.getByRole('combobox', { name: 'Command' }).fill('image-to-text')
    await window.keyboard.press('Enter')
    await expect(window.locator('.status-bar')).toContainText('Recognizing image')
    const editor = window.getByRole('textbox', { name: 'Node 2', exact: true })
    await editor.click()
    await window.keyboard.press('0')
    await window.keyboard.press(mode === 'insert' ? 'i' : 'R')
    await window.keyboard.type('X')

    await app.evaluate(() => {
      ;(globalThis as unknown as { finishOcr: (text: string[]) => void }).finishOcr(['Recognized'])
    })

    await expect(window.locator('.status-bar')).toContainText('added 1 paragraph')
    await expect(window.getByLabel('Vim mode')).toHaveText(mode.toUpperCase())
    await expect(editor).toBeFocused()
    await expect(editor).toHaveValue(mode === 'insert' ? 'Xabcd' : 'Xbcd')
    await window.keyboard.press('Escape')
    if (mode === 'insert') {
      await window.keyboard.press('.')
      await expect(editor).toHaveValue('XXabcd')
    }
    await closeApp(app)
  })
}
