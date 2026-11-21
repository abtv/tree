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
  await page.getByRole('combobox', { name: 'Command' }).fill('reindex-all-images')
  await page.keyboard.press('Enter')
  const savedSearchText = () =>
    page.evaluate(async () => {
      const api = (window as unknown as { treeApi: SmokeApi }).treeApi
      const state = (await api.load()) as {
        document: { roots: { attachment?: { searchText?: string } }[] }
      } | null
      return state?.document.roots[0]?.attachment?.searchText
    })
  // Hidden recognition uses the ordinary metadata save policy, so wait for that save.
  await expect.poll(savedSearchText, { timeout: 30000 }).toContain('Local image recognition works with English text')
  await page.reload()
  await page.locator('.node-input').first().waitFor()
  expect(await savedSearchText()).toContain('Local image recognition works with English text')
  await expect(page.locator('.node-input')).toHaveCount(1)
}
