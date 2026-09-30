import { expect, firePaste, launchTree, node, test, writeClipboardImageSized } from './fixtures'

test.describe('image presentation and preview', () => {
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

  test('opens the preview by clicking the image and closes it with the button', async ({ userDataDir }) => {
    const { app, window } = await launchTree(userDataDir)

    await writeClipboardImageSized(app, 400, 200)
    await firePaste(node(window, 1))
    await window.getByRole('button', { name: 'Open image preview' }).click()

    const dialog = window.getByRole('dialog', { name: 'Image preview' })
    await expect(dialog).toBeVisible()

    await window.getByRole('button', { name: 'Close image preview' }).click()
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

  test('opens the preview with Cmd+Enter', async ({ userDataDir }) => {
    const { app, window } = await launchTree(userDataDir)

    await writeClipboardImageSized(app, 400, 200)
    await firePaste(node(window, 1))
    await expect(window.getByAltText('Attached image')).toBeVisible()
    await node(window, 1).focus()
    await window.keyboard.press('Meta+Enter')

    await expect(window.getByRole('dialog', { name: 'Image preview' })).toBeVisible()
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
