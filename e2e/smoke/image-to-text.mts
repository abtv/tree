import { expect, type Page } from '@playwright/test'

// Keep this Node-run smoke independent of renderer/application TypeScript transforms.
interface SmokeApi {
  writeAttachment(id: string, bytes: Uint8Array): Promise<void>
  save(state: unknown): Promise<void>
  load(): Promise<unknown>
}

/** Runs only in isolated smoke profiles, using the production bridge and real Vision helper. */
export async function imageToTextSmoke(page: Page): Promise<void> {
  await page.reload()
  await page.locator('.node-input').first().waitFor()
  await page.evaluate(async () => {
    const api = (window as unknown as { treeApi: SmokeApi }).treeApi
    const canvas = document.createElement('canvas')
    canvas.width = 1400
    canvas.height = 160
    const context = canvas.getContext('2d')!
    context.fillStyle = 'white'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.fillStyle = 'black'
    context.font = '36px Arial'
    context.fillText('Local image recognition works with English text on this device.', 30, 80)
    const bytes = Uint8Array.from(atob(canvas.toDataURL('image/png').split(',')[1]!), (c) => c.charCodeAt(0))
    await api.writeAttachment('smoke-ocr', bytes)
    await api.save({
      version: 1,
      document: {
        roots: [
          {
            id: 'smoke-image',
            text: 'OCR smoke',
            attachment: { id: 'smoke-ocr', mimeType: 'image/png' },
            children: [],
          },
        ],
      },
      location: { currentParentId: null, selectedNodeId: 'smoke-image' },
    })
  })
  await page.reload()
  await page.locator('.node-input').first().click()
  await page.keyboard.press('Meta+Shift+p')
  await page.getByRole('combobox', { name: 'Command' }).fill('image-to-text')
  await page.keyboard.press('Enter')
  await expect(page.locator('.status-bar')).toContainText('Image to text: added 1 paragraph.', { timeout: 15000 })
  await page.getByRole('button', { name: 'Expand node 1', exact: true }).click()
  await expect(page.locator('.node-input').nth(1)).toHaveValue(
    'Local image recognition works with English text on this device.',
  )
  const savedText = () =>
    page.evaluate(async () => {
      const api = (window as unknown as { treeApi: SmokeApi }).treeApi
      const state = (await api.load()) as {
        document: { roots: { children: { text: string }[] }[] }
      } | null
      return state?.document.roots[0]?.children[0]?.text
    })
  // Wait for normal autosave before simulating an abrupt renderer reload.
  await expect.poll(savedText).toBe('Local image recognition works with English text on this device.')
  await page.reload()
  await page.locator('.node-input').first().waitFor()
  expect(await savedText()).toBe('Local image recognition works with English text on this device.')
}
