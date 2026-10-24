// @editing-modes: both
import {
  describeForEachEditingMode,
  expect,
  firePaste,
  launchTree,
  node,
  setCursor,
  test,
  typeInto,
  writeClipboardImageSized,
} from './fixtures'

test.describe('inline image presentation (mode-independent)', () => {
  // @requirement PRODUCT.md §17.1
  test('scales a large inline image down to fit 200x200 while preserving aspect ratio', async ({ userDataDir }) => {
    const { app, window } = await launchTree(userDataDir)

    await writeClipboardImageSized(app, 400, 200)
    await firePaste(node(window, 1))

    const image = window.getByAltText('Attached image')
    await expect(image).toBeVisible()
    const box = await image.boundingBox()
    expect(box).not.toBeNull()
    expect(box!.width).toBeLessThanOrEqual(200)
    expect(box!.height).toBeLessThanOrEqual(200)
    expect(box!.width / box!.height).toBeCloseTo(2, 1)
  })

  test('does not enlarge a small inline image', async ({ userDataDir }) => {
    const { app, window } = await launchTree(userDataDir)

    await writeClipboardImageSized(app, 100, 50)
    await firePaste(node(window, 1))

    const image = window.getByAltText('Attached image')
    await expect(image).toBeVisible()
    const box = await image.boundingBox()
    expect(box!.width).toBeLessThanOrEqual(100)
    expect(box!.height).toBeLessThanOrEqual(50)
  })
})

describeForEachEditingMode('image preview', ({ mode, screenshotName }) => {
  // @requirement PRODUCT.md §17.1
  test('zooms and pans only the image, keeps the close button available, and resets on reopening', async ({
    userDataDir,
  }, testInfo) => {
    const { app, window } = await launchTree(userDataDir)
    await writeClipboardImageSized(app, 1200, 900)
    await firePaste(node(window, 1))
    await window.getByRole('button', { name: 'Open image preview' }).click()
    const image = window.getByAltText('Attached image preview')
    await expect(image).toBeVisible()
    const initial = (await image.boundingBox())!
    const close = window.getByRole('button', { name: 'Close image preview' })
    const closeBounds = await close.boundingBox()
    await window.keyboard.press('Meta+=')
    await expect.poll(async () => (await image.boundingBox())!.width).toBeCloseTo(initial.width * 1.25, 0)
    const zoomed = (await image.boundingBox())!
    await window.keyboard.press('ArrowRight')
    await window.keyboard.press('ArrowDown')
    await expect.poll(async () => (await image.boundingBox())!.x).toBeCloseTo(zoomed.x - 48, 0)
    await expect.poll(async () => (await image.boundingBox())!.y).toBeCloseTo(zoomed.y - 48, 0)
    const panned = (await image.boundingBox())!
    await window.keyboard.press('h')
    await window.keyboard.press('k')
    await expect.poll(async () => (await image.boundingBox())!.x).toBeCloseTo(mode === 'vim' ? zoomed.x : panned.x, 0)
    await expect.poll(async () => (await image.boundingBox())!.y).toBeCloseTo(mode === 'vim' ? zoomed.y : panned.y, 0)
    await expect(close).toBeFocused()
    expect(await close.boundingBox()).toEqual(closeBounds)
    expect(await window.evaluate(() => globalThis.visualViewport!.scale)).toBe(1)
    await expect(window).toHaveScreenshot(screenshotName('image-preview-zoomed.png'))
    await window.screenshot({ path: testInfo.outputPath(screenshotName('image-preview-zoomed.png')) })
    await window.keyboard.press('Meta+-')
    await expect.poll(async () => (await image.boundingBox())!.width).toBeCloseTo(initial.width, 0)
    await window.keyboard.press('Escape')
    await expect(node(window, 1)).toBeFocused()
    await window.keyboard.press('Meta+y')
    await expect(image).toBeVisible()
    expect(await image.boundingBox()).toEqual(initial)
    await close.click()
    await expect(window.getByRole('dialog', { name: 'Image preview' })).toBeHidden()
  })

  test('opens the preview by clicking the image and closes it with the button', async ({ userDataDir }) => {
    const { app, window } = await launchTree(userDataDir)

    await writeClipboardImageSized(app, 400, 200)
    await firePaste(node(window, 1))
    await window.getByRole('button', { name: 'Open image preview' }).click()

    const dialog = window.getByRole('dialog', { name: 'Image preview' })
    await expect(dialog).toBeVisible()

    const close = window.getByRole('button', { name: 'Close image preview' })
    await window.keyboard.press('h')
    await window.keyboard.press('l')
    await expect(close).toBeFocused()
    await window.keyboard.press('Enter')
    await expect(dialog).toBeHidden()
  })

  test('closes the preview on Escape', async ({ userDataDir }) => {
    const { app, window } = await launchTree(userDataDir)

    await writeClipboardImageSized(app, 400, 200)
    await firePaste(node(window, 1))
    await window.getByRole('button', { name: 'Open image preview' }).click()
    await expect(window.getByRole('dialog', { name: 'Image preview' })).toBeVisible()

    await window.keyboard.press('Escape')
    await expect(window.getByRole('dialog', { name: 'Image preview' })).toBeHidden()
  })

  test('closes the preview on a mouse click in the window', async ({ userDataDir }) => {
    const { app, window } = await launchTree(userDataDir)

    await writeClipboardImageSized(app, 400, 200)
    await firePaste(node(window, 1))
    await window.getByRole('button', { name: 'Open image preview' }).click()
    const dialog = window.getByRole('dialog', { name: 'Image preview' })
    await expect(dialog).toBeVisible()

    await window.mouse.click(5, 300)
    await expect(dialog).toBeHidden()

    await window.getByRole('button', { name: 'Open image preview' }).click()
    await expect(dialog).toBeVisible()
    await dialog.getByRole('img').click()
    await expect(dialog).toBeHidden()
  })

  test('opens the preview with Cmd+Y, while Cmd+Enter strikes the node through instead', async ({ userDataDir }) => {
    const { app, window } = await launchTree(userDataDir)

    await writeClipboardImageSized(app, 400, 200)
    await firePaste(node(window, 1))
    await expect(window.getByAltText('Attached image')).toBeVisible()
    await node(window, 1).focus()
    await window.keyboard.press('Meta+Enter')
    await expect(node(window, 1)).toHaveClass(/node-input-struck/)
    await expect(window.getByRole('dialog', { name: 'Image preview' })).toBeHidden()

    await window.keyboard.press('Meta+y')

    await expect(window.getByRole('dialog', { name: 'Image preview' })).toBeVisible()
  })

  // @requirement PRODUCT.md §20.7
  test('shows the same focus ring on the close button however the preview was opened', async ({ userDataDir }) => {
    const { app, window } = await launchTree(userDataDir)
    await writeClipboardImageSized(app, 400, 200)
    await firePaste(node(window, 1))
    await expect(window.getByAltText('Attached image')).toBeVisible()
    const close = window.getByRole('button', { name: 'Close image preview' })
    const ring = (): Promise<string> =>
      close.evaluate((element) => {
        const style = getComputedStyle(element)
        return `${style.outlineStyle} ${style.outlineWidth} ${style.outlineColor}`
      })

    await window.getByRole('button', { name: 'Open image preview' }).click()
    await expect(close).toBeFocused()
    const afterMouse = await ring()
    await window.keyboard.press('Escape')

    await node(window, 1).focus()
    await window.keyboard.press('Meta+y')
    await expect(close).toBeFocused()
    const afterKeyboard = await ring()

    expect(afterMouse).toMatch(/^solid 2px /)
    expect(afterKeyboard).toBe(afterMouse)
  })
})

test.describe('image preview (mode-independent)', () => {
  // @requirement PRODUCT.md §17.1
  test('handles Chromium trackpad pinch and real wheel input without zooming or scrolling the page', async ({
    userDataDir,
  }) => {
    const { app, window } = await launchTree(userDataDir)
    await writeClipboardImageSized(app, 1200, 900)
    await firePaste(node(window, 1))
    await window.getByRole('button', { name: 'Open image preview' }).click()
    const image = window.getByAltText('Attached image preview')
    await expect(image).toBeVisible()
    const initial = (await image.boundingBox())!
    const session = await window.context().newCDPSession(window)
    try {
      await session.send('Input.synthesizePinchGesture', {
        x: initial.x + initial.width / 2,
        y: initial.y + initial.height / 2,
        scaleFactor: 2,
        relativeSpeed: 800,
        gestureSourceType: 'mouse',
      })
      await expect.poll(async () => (await image.boundingBox())!.width).toBeGreaterThan(initial.width * 1.5)
      const enlarged = (await image.boundingBox())!
      await window.mouse.move(initial.x + initial.width / 2, initial.y + initial.height / 2)
      await window.mouse.wheel(40, 50)
      await expect.poll(async () => (await image.boundingBox())!.x).toBeCloseTo(enlarged.x - 40, 0)
      await expect.poll(async () => (await image.boundingBox())!.y).toBeCloseTo(enlarged.y - 50, 0)
      expect(
        await window.evaluate(() => [globalThis.visualViewport!.scale, globalThis.scrollX, globalThis.scrollY]),
      ).toEqual([1, 0, 0])
      await window.getByRole('button', { name: 'Close image preview' }).click()
      await expect(node(window, 1)).toBeFocused()
    } finally {
      await session.detach()
    }
  })

  test('keeps keyboard focus inside the preview', async ({ userDataDir }) => {
    const { app, window } = await launchTree(userDataDir)

    await writeClipboardImageSized(app, 400, 200)
    await firePaste(node(window, 1))
    await window.getByRole('button', { name: 'Open image preview' }).click()

    const close = window.getByRole('button', { name: 'Close image preview' })
    await expect(close).toBeFocused()
    await window.keyboard.press('Tab')
    await expect(close).toBeFocused()
    await window.keyboard.press('Shift+Tab')
    await expect(close).toBeFocused()
  })

  test('does not upscale a small image in the preview', async ({ userDataDir }) => {
    const { app, window } = await launchTree(userDataDir)

    await writeClipboardImageSized(app, 100, 50)
    await firePaste(node(window, 1))
    await window.getByRole('button', { name: 'Open image preview' }).click()

    const preview = window.getByAltText('Attached image preview')
    await expect(preview).toBeVisible()
    const box = await preview.boundingBox()
    expect(box!.width).toBeLessThanOrEqual(100)
    expect(box!.height).toBeLessThanOrEqual(50)
  })
})

test.describe('image preview (Vim editing only)', () => {
  test('returns Normal-mode keys to the editor after a mouse click closes the preview', async ({ userDataDir }) => {
    const { app, window } = await launchTree(userDataDir, { initialMode: 'normal', vimPreference: true })
    const first = node(window, 1)
    await typeInto(first, 'test')
    await first.press('Escape')
    await first.press('o')
    const second = node(window, 2)
    await writeClipboardImageSized(app, 400, 200)
    await firePaste(second)
    await window.keyboard.press('Escape')
    await expect(second).toBeFocused()

    await window.getByRole('button', { name: 'Open image preview' }).click()
    const dialog = window.getByRole('dialog', { name: 'Image preview' })
    await expect(dialog).toBeVisible()
    await window.mouse.click(5, 300)
    await expect(dialog).toBeHidden()

    await window.keyboard.press('k')
    await expect(first).toBeFocused()
  })
})

test.describe('image preview focus return in standard editing', () => {
  test.use({ editingMode: 'standard' })

  for (const close of ['button', 'Escape', 'click'] as const) {
    // @requirement PRODUCT.md §17.1
    test(`returns focus and the caret to the editor after closing with ${close}`, async ({ userDataDir }) => {
      const { app, window } = await launchTree(userDataDir)
      const editor = node(window, 1)
      await typeInto(editor, 'ab')
      await writeClipboardImageSized(app, 80, 80)
      await firePaste(editor)
      await expect(window.getByAltText('Attached image')).toBeVisible()
      await editor.focus()
      await setCursor(editor, 1)
      expect(
        await editor.evaluate((element) => [
          (element as HTMLTextAreaElement).selectionStart,
          (element as HTMLTextAreaElement).selectionEnd,
        ]),
      ).toEqual([1, 1])

      await window.getByRole('button', { name: 'Open image preview' }).click()
      const dialog = window.getByRole('dialog', { name: 'Image preview' })
      await expect(dialog).toBeVisible()

      if (close === 'button') await window.getByRole('button', { name: 'Close image preview' }).click()
      else if (close === 'Escape') await window.keyboard.press('Escape')
      else await window.mouse.click(5, 300)
      await expect(dialog).toBeHidden()

      await expect(editor).toBeFocused()
      expect(
        await editor.evaluate((element) => [
          (element as HTMLTextAreaElement).selectionStart,
          (element as HTMLTextAreaElement).selectionEnd,
        ]),
      ).toEqual([1, 1])
      await window.keyboard.type('X')
      await expect(editor).toHaveValue('aXb')
    })
  }
})
