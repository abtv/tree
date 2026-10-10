// @editing-modes: vim
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { ElectronApplication } from '@playwright/test'
import type { TreeApi } from '../src/shared/ipc'
import { onePixelPng } from '../src/main/png-test-utils'
import {
  allowRendererError,
  attachmentPath,
  expect,
  launchTree,
  node,
  nodeTexts,
  seedDocument,
  test,
  writeClipboardText,
  writeClipboardTextAndHtml,
} from './fixtures'

const textNode = (id: string, text: string) => ({ id, text, children: [] })
const pictureNode = (id: string, text = '') => ({
  ...textNode(id, text),
  attachment: { id: 'picture', mimeType: 'image/png' },
})

function seed(userDataDir: string): void {
  seedDocument(userDataDir, {
    document: {
      roots: [
        {
          ...pictureNode('first', 'see https://example.com'),
          links: [{ start: 4, end: 23, url: 'https://example.com' }],
          children: [textNode('child', 'Excluded child')],
        },
        textNode('empty', ''),
        pictureNode('image-only'),
        textNode('last', 'Last'),
      ],
    },
    location: { currentParentId: null, selectedNodeId: 'first' },
  })
  const path = attachmentPath(userDataDir, 'picture')
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, onePixelPng)
}

async function content(app: ElectronApplication) {
  return app.evaluate(async ({ clipboard, nativeImage }) => {
    const items = await clipboard.read()
    const image = items.find((item) => item.types.includes('image/png'))
    const blob = image === undefined ? undefined : await image.getType('image/png')
    if (blob !== undefined && !(blob instanceof Blob)) throw new Error('Expected a PNG Blob')
    const png = blob === undefined ? undefined : new Uint8Array(await blob.arrayBuffer())
    return {
      text: await clipboard.readText(),
      html: items.some((item) => item.types.includes('text/html')),
      image:
        png === undefined
          ? null
          : {
              size: nativeImage.createFromBuffer(Buffer.from(png)).getSize(),
              bitmap: [...nativeImage.createFromBuffer(Buffer.from(png)).toBitmap()],
            },
    }
  })
}

// @requirement PRODUCT.md §20.2.22
test('copies dd text and images by the pre-deletion caret while preserving undo and local puts', async ({
  userDataDir,
}) => {
  seed(userDataDir)
  const { app, window } = await launchTree(userDataDir, { initialMode: 'normal' })
  await writeClipboardTextAndHtml(app, 'old', '<b>old</b>')
  await node(window, 1).focus()
  await window.keyboard.press('d')
  await window.keyboard.press('d')
  await expect.poll(() => content(app)).toMatchObject({ text: 'see https://example.com', html: false, image: null })
  await expect.poll(() => nodeTexts(window)).toEqual(['', '', 'Last'])
  await window.keyboard.press('u')
  await expect.poll(() => nodeTexts(window)).toEqual(['see https://example.com', '', '', 'Last'])
  await node(window, 1).focus()
  await window.keyboard.press('j')
  await expect(node(window, 1)).toHaveClass(/node-input-image-caret/)
  await window.keyboard.press('d')
  await window.keyboard.press('d')
  await expect
    .poll(() => content(app))
    .toMatchObject({ text: '', html: false, image: { size: { width: 1, height: 1 } } })
  await window.keyboard.press('p')
  await expect.poll(() => nodeTexts(window)).toEqual(['', 'see https://example.com', '', 'Last'])
  await node(window, 2).focus()
  await window.keyboard.press('g')
  await window.keyboard.press('d')
  await expect(node(window, 1)).toHaveValue('Excluded child')
})

test('preserves the clipboard for empty and counted multiple-node dd and exports a clamped single node', async ({
  userDataDir,
}) => {
  seed(userDataDir)
  const { app, window } = await launchTree(userDataDir, { initialMode: 'normal' })
  await writeClipboardTextAndHtml(app, 'keep', '<b>keep</b>')
  await node(window, 2).focus()
  await window.keyboard.press('d')
  await window.keyboard.press('d')
  await node(window, 1).focus()
  await window.keyboard.press('2')
  await window.keyboard.press('d')
  await window.keyboard.press('d')
  await window.evaluate(() => (globalThis.window as unknown as { treeApi: TreeApi }).treeApi.getVimEnabled())
  expect(await content(app)).toMatchObject({ text: 'keep', html: true, image: null })
  await expect.poll(() => nodeTexts(window)).toEqual(['Last'])
  await window.keyboard.press('2')
  await window.keyboard.press('d')
  await window.keyboard.press('d')
  await expect.poll(() => content(app)).toMatchObject({ text: 'Last', html: false, image: null })
})

test('keeps dd deletion and local put available when the native clipboard rejects the copy', async ({
  userDataDir,
}) => {
  seed(userDataDir)
  const { app, window } = await launchTree(userDataDir, { initialMode: 'normal' })
  await writeClipboardText(app, 'keep')
  await app.evaluate(() => {
    globalThis.__treeIpc.wrap('tree:write-clipboard-content', async () => {
      throw new Error('Synthetic dd clipboard failure')
    })
  })
  allowRendererError(/Operation failed:.*Synthetic dd clipboard failure/)
  await node(window, 1).focus()
  await window.keyboard.press('d')
  await window.keyboard.press('d')
  await expect(window.locator('.save-error')).toContainText('Synthetic dd clipboard failure')
  expect((await content(app)).text).toBe('keep')
  await expect.poll(() => nodeTexts(window)).toEqual(['', '', 'Last'])
  await window.keyboard.press('p')
  await expect.poll(() => nodeTexts(window)).toEqual(['', 'see https://example.com', '', 'Last'])
})

// @requirement PRODUCT.md §20.2.22
test('copies yy text and character Visual y as plain text while retaining local subtree puts', async ({
  userDataDir,
}) => {
  seed(userDataDir)
  const { app, window } = await launchTree(userDataDir, { initialMode: 'normal' })
  await writeClipboardTextAndHtml(app, 'old', '<b>old</b>')
  await node(window, 1).focus()
  await window.keyboard.press('y')
  await window.keyboard.press('y')
  await expect.poll(() => content(app)).toMatchObject({ text: 'see https://example.com', html: false, image: null })
  await expect(node(window, 1)).toBeFocused()
  // `p` on this node would put the copy into its own children, which is rejected; `P` puts it before.
  await window.keyboard.press('P')
  await expect
    .poll(() => nodeTexts(window))
    .toEqual(['see https://example.com', 'see https://example.com', '', '', 'Last'])
  await window.keyboard.press('g')
  await window.keyboard.press('d')
  await expect(node(window, 1)).toHaveValue('Excluded child')
  await window.keyboard.press('Control+o')
  await node(window, 1).focus()
  await window.keyboard.press('0')
  await window.keyboard.press('v')
  await window.keyboard.press('l')
  await window.keyboard.press('l')
  await window.keyboard.press('y')
  await expect.poll(() => content(app)).toMatchObject({ text: 'see', html: false, image: null })
  await expect(window.getByLabel('Vim mode')).toHaveText('NORMAL')
})

test('copies an image with yy on the image caret and uses text priority for a single Visual node', async ({
  userDataDir,
}) => {
  seed(userDataDir)
  const { app, window } = await launchTree(userDataDir, { initialMode: 'normal' })
  await writeClipboardText(app, 'old')
  await node(window, 1).focus()
  await window.keyboard.press('j')
  await expect(node(window, 1)).toHaveClass(/node-input-image-caret/)
  await window.keyboard.press('y')
  await window.keyboard.press('y')
  await expect
    .poll(() => content(app))
    .toMatchObject({ text: '', html: false, image: { size: { width: 1, height: 1 } } })
  const expectedBitmap = await app.evaluate(
    ({ nativeImage }, bytes) => [...nativeImage.createFromBuffer(Buffer.from(bytes)).toBitmap()],
    [...onePixelPng],
  )
  expect((await content(app)).image?.bitmap).toEqual(expectedBitmap)
  await expect(node(window, 1)).toHaveClass(/node-input-image-caret/)
  await window.keyboard.press('V')
  await window.keyboard.press('y')
  await expect.poll(() => content(app)).toMatchObject({ text: 'see https://example.com', html: false, image: null })
  await node(window, 3).focus()
  await window.keyboard.press('V')
  await window.keyboard.press('y')
  await expect.poll(() => content(app)).toMatchObject({ text: '', image: { size: { width: 1, height: 1 } } })
  await window.keyboard.press('y')
  await window.keyboard.press('y')
  await expect.poll(() => content(app)).toMatchObject({ text: '', image: { size: { width: 1, height: 1 } } })
})

test('copies reverse Visual sibling text with blank lines and excludes descendants and images', async ({
  userDataDir,
}) => {
  seed(userDataDir)
  const { app, window } = await launchTree(userDataDir, { initialMode: 'normal' })
  await writeClipboardText(app, 'old')
  await node(window, 4).focus()
  await window.keyboard.press('V')
  await window.keyboard.press('3')
  await window.keyboard.press('k')
  await window.keyboard.press('y')
  await expect
    .poll(() => content(app))
    .toMatchObject({ text: 'see https://example.com\n\n\nLast', html: false, image: null })
  await expect(window.getByLabel('Vim mode')).toHaveText('NORMAL')
  await node(window, 2).focus()
  await window.keyboard.press('V')
  await window.keyboard.press('j')
  await window.keyboard.press('y')
  await expect.poll(() => content(app)).toMatchObject({ text: '\n', html: false, image: null })
})

test('preserves the system clipboard for empty single nodes and counted multiple-node yy', async ({ userDataDir }) => {
  seed(userDataDir)
  const { app, window } = await launchTree(userDataDir, { initialMode: 'normal' })
  await writeClipboardTextAndHtml(app, 'keep', '<b>keep</b>')
  await node(window, 2).focus()
  await window.keyboard.press('y')
  await window.keyboard.press('y')
  await window.keyboard.press('V')
  await window.keyboard.press('y')
  await node(window, 1).focus()
  await window.keyboard.press('2')
  await window.keyboard.press('y')
  await window.keyboard.press('y')
  // A subsequent Invoke is a renderer-to-main barrier; no-copy assertions don't rely on a timeout.
  await window.evaluate(() => (globalThis.window as unknown as { treeApi: TreeApi }).treeApi.getVimEnabled())
  expect(await content(app)).toMatchObject({ text: 'keep', html: true, image: null })
  await node(window, 4).focus()
  await window.keyboard.press('2')
  await window.keyboard.press('y')
  await window.keyboard.press('y')
  await expect.poll(() => content(app)).toMatchObject({ text: 'Last', html: false, image: null })
})

// @requirement PRODUCT.md §20.2.26
test('reports native copy failure, preserves the old clipboard and local yank, then retries', async ({
  userDataDir,
}) => {
  seed(userDataDir)
  const { app, window } = await launchTree(userDataDir, { initialMode: 'normal' })
  await writeClipboardText(app, 'keep')
  await app.evaluate(() => {
    let fail = true
    globalThis.__treeIpc.wrap('tree:write-clipboard-content', async (original, ...args) => {
      if (fail) {
        fail = false
        throw new Error('Synthetic native clipboard failure')
      }
      return original(...args)
    })
  })
  allowRendererError(/Operation failed:.*Synthetic native clipboard failure/)
  await node(window, 1).focus()
  await window.keyboard.press('y')
  await window.keyboard.press('y')
  await expect(window.locator('.save-error')).toContainText('Synthetic native clipboard failure')
  expect((await content(app)).text).toBe('keep')
  await window.keyboard.press('P')
  await expect
    .poll(() => nodeTexts(window))
    .toEqual(['see https://example.com', 'see https://example.com', '', '', 'Last'])
  await window.keyboard.press('y')
  await window.keyboard.press('y')
  await expect.poll(() => content(app)).toMatchObject({ text: 'see https://example.com', html: false })
})
