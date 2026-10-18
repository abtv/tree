import assert from 'node:assert/strict'
import { onePixelPng } from '../src/main/png-test-utils.ts'
import { checkNativeEditing } from './native-editing-test.mjs'

// Shared by isolated Chrome checks and bounded WebKit analysis. Only headless
// Chrome's virtual clipboard may be used for the realClipboard branch.
export async function checkBrowserCompatibility(browser, url, { realClipboard = false } = {}) {
  await checkNativeEditing(browser, url, { realClipboard })
  const context = await browser.newContext({ viewport: { width: 1100, height: 760 } })
  try {
    if (realClipboard) await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    const page = await context.newPage()
    page.setDefaultTimeout(8000)
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto(url)
    await page.waitForFunction(() => window.prototypeStore?.getSnapshot().status === 'ready')
    const input = page.locator('[data-node-id="welcome"] .node-input')
    await input.fill('A wrapping line '.repeat(150))
    const sizing = await input.evaluate((element) => ({ height: element.clientHeight, content: element.scrollHeight }))
    assert(sizing.height > 20 && sizing.content <= sizing.height + 1, 'Wrapped text must fit its editor')
    await input.fill('Accent é, emoji 😀 and #2026-10-17')
    await page.locator('#tree-menu-button').click()
    await page.getByRole('dialog', { name: 'Tree menu' }).waitFor()
    await page.locator('#prototype-vim').click()
    await page.waitForFunction(() => document.querySelector('.tree-app').classList.contains('vim-state-normal'))
    await input.focus()
    await page.keyboard.press('Escape')
    await page.keyboard.press('0')
    await page.keyboard.press('x')
    assert.match(await input.innerText(), /^ccent/)
    await page.keyboard.press('u')
    assert.match(await input.innerText(), /^Accent/)
    await page.evaluate(() => window.prototypeStore.flushPersistence())
    await page.reload()
    await page.waitForFunction(() => window.prototypeStore?.getSnapshot().status === 'ready')
    assert.match(await input.innerText(), /^Accent/)

    await page.evaluate(
      (bytes) => window.treeApi.writeAttachment('compatibility-image', new Uint8Array(bytes)),
      [...onePixelPng],
    )
    // Model Safari's activation boundary without accessing the machine clipboard.
    // The write must start before the event handler yields, even though its PNG
    // representation is fetched asynchronously from real IndexedDB storage.
    await page.evaluate(() => {
      window.originalClipboardWrite = navigator.clipboard.write.bind(navigator.clipboard)
      window.copiedBytes = ['previous clipboard']
      navigator.clipboard.write = async (items) => {
        if (!window.copyActivation) throw new DOMException('Copy lost user activation', 'NotAllowedError')
        const blob = await items[0].getType('image/png')
        window.copiedBytes = [...new Uint8Array(await blob.arrayBuffer())]
      }
      window.copyImage = (attachmentId) => {
        window.copyActivation = true
        const operation = window.prototypeStore.copyVimContent({ kind: 'image', attachmentId })
        window.copyActivation = false
        return operation.then(
          () => 'copied',
          (error) => error.message,
        )
      }
    })
    assert.equal(await page.evaluate(() => window.copyImage('compatibility-image')), 'copied')
    assert.deepEqual(await page.evaluate(() => window.copiedBytes), [...onePixelPng])
    assert.equal(await page.evaluate(() => window.copyImage('missing-image')), 'Image could not be loaded.')
    assert.deepEqual(
      await page.evaluate(() => window.copiedBytes),
      [...onePixelPng],
      'Failed copy must preserve clipboard data',
    )
    await page.evaluate(() => {
      navigator.clipboard.write = async () => {
        throw new DOMException('Clipboard denied', 'NotAllowedError')
      }
    })
    assert.equal(await page.evaluate(() => window.copyImage('compatibility-image')), 'Clipboard denied')

    if (realClipboard) {
      await page.evaluate(() => {
        navigator.clipboard.write = window.originalClipboardWrite
      })
      await page.evaluate(() =>
        window.treeApi.writeClipboardContent({ kind: 'image', attachmentId: 'compatibility-image' }),
      )
      const image = await page.evaluate(async () => {
        const [item] = await navigator.clipboard.read()
        const bitmap = await createImageBitmap(await item.getType('image/png'))
        try {
          const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
          canvas.getContext('2d').drawImage(bitmap, 0, 0)
          return {
            width: bitmap.width,
            height: bitmap.height,
            pixels: [...canvas.getContext('2d').getImageData(0, 0, 1, 1).data],
          }
        } finally {
          bitmap.close()
        }
      })
      assert.deepEqual(image, { width: 1, height: 1, pixels: [255, 0, 0, 255] })
      const failedCopy = await page.evaluate(async () => {
        const bytes = async () => {
          const [item] = await navigator.clipboard.read()
          return [...new Uint8Array(await (await item.getType('image/png')).arrayBuffer())]
        }
        const before = await bytes()
        let rejected = false
        try {
          await window.treeApi.writeClipboardContent({ kind: 'image', attachmentId: 'missing-image' })
        } catch {
          rejected = true
        }
        return { rejected, before, after: await bytes() }
      })
      assert(failedCopy.rejected)
      assert.deepEqual(failedCopy.after, failedCopy.before, 'A failed browser write must preserve the previous PNG')
    }
    assert.deepEqual(errors, [])
    console.log(
      JSON.stringify({
        version: browser.version(),
        wrapping: true,
        richUndoReload: true,
        imageCopyActivationContract: true,
        copyFailurePreservesClipboard: true,
        realClipboard,
        status: 'passed',
      }),
    )
  } finally {
    await context.close()
  }
}
