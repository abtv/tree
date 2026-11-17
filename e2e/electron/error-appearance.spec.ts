// @editing-modes: independent
import type { Locator } from '@playwright/test'
import { allowRendererError, expect, launchTree, seedDocument, test, typeInto } from './fixtures'

async function contrastOnDocument(element: Locator): Promise<number> {
  return element.evaluate((node) => {
    const luminance = (color: string) => {
      const channels = /^rgb\((\d+), (\d+), (\d+)\)$/.exec(color)
      if (channels === null) throw new Error(`Expected an opaque RGB color, received ${color}`)
      const [red = 0, green = 0, blue = 0] = channels.slice(1).map((channel) => {
        const value = Number(channel) / 255
        return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
      })
      return red * 0.2126 + green * 0.7152 + blue * 0.0722
    }
    const foreground = luminance(getComputedStyle(node).color)
    const background = luminance(getComputedStyle(document.documentElement).backgroundColor)
    return (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05)
  })
}

// @requirement PRODUCT.md §20.5
// @requirement PRODUCT.md §16.2
// @requirement PRODUCT.md §17.1
test('keeps save and inline image errors readable in every appearance', async ({ userDataDir }, testInfo) => {
  seedDocument(userDataDir, {
    document: {
      roots: [
        { id: 'one', text: 'Synthetic notes', children: [] },
        { id: 'two', text: 'Missing image', attachment: { id: 'missing', mimeType: 'image/png' }, children: [] },
      ],
    },
    location: { currentParentId: null, selectedNodeId: 'one' },
  })
  const { app, window } = await launchTree(userDataDir)
  await expect(window.locator('.attachment-error')).toHaveText('Image could not be loaded.')
  allowRendererError(/^Changes could not be saved: .*Synthetic appearance failure$/)
  await app.evaluate(() => {
    let fail = true
    globalThis.__treeIpc.wrap('tree:save', async (original, ...args) => {
      if (fail) {
        fail = false
        throw new Error('Synthetic appearance failure')
      }
      return original(...args)
    })
  })

  await typeInto(
    window.getByRole('textbox', { name: 'Node 1', exact: true }),
    'one two three four five six seven eight nine ten ',
  )
  const saveError = window.locator('.save-error')
  const imageError = window.locator('.attachment-error')
  await expect(saveError).toContainText('Synthetic appearance failure')

  for (const appearance of ['dark', 'light', 'gray', 'white'] as const) {
    await window.evaluate((value) => globalThis.window.treeApi.setAppearance(value), appearance)
    await window.emulateMedia({ colorScheme: appearance === 'dark' ? 'dark' : 'light' })
    await expect(window.locator('html')).toHaveAttribute('data-appearance', appearance)
    const contrast = {
      save: await contrastOnDocument(saveError),
      image: await contrastOnDocument(imageError),
    }
    await window.screenshot({ path: testInfo.outputPath(`errors-${appearance}.png`) })

    const description = `${appearance}: ${JSON.stringify(contrast)}`
    expect(Math.min(contrast.save, contrast.image), description).toBeGreaterThanOrEqual(4.5)
    if (appearance !== 'white') {
      await expect(saveError).toHaveScreenshot(`save-error-${appearance}.png`)
      await expect(imageError).toHaveScreenshot(`image-error-${appearance}.png`)
    }
  }
})
