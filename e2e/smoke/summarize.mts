import { expect, type Page } from '@playwright/test'
import { acquireSystemClipboardLock, releaseSystemClipboardLock } from '../electron/clipboard-lock.ts'

interface SmokeApi {
  summarization?: { available(): Promise<boolean> }
  readClipboard(): Promise<{ kind: string; text?: string }>
}

/** Uses the production native port; CI without Apple Intelligence verifies the disabled state. */
export async function summarizeSmoke(page: Page): Promise<void> {
  const available = await page.evaluate(
    () => (window as unknown as { treeApi: SmokeApi }).treeApi.summarization?.available() ?? false,
  )
  await page.locator('.node-input').first().click()
  await page.keyboard.press('Meta+Shift+p')
  await page.getByRole('combobox', { name: 'Command' }).fill('summarize')
  const command = page.getByRole('option', { selected: true })
  if (!available) {
    await expect(command).toHaveAttribute('aria-disabled', 'true')
    await page.keyboard.press('Escape')
    console.log('Summarization smoke: system model unavailable, disabled command verified; inference unverified')
    return
  }
  await expect(command).not.toHaveAttribute('aria-disabled', 'true')
  await acquireSystemClipboardLock()
  try {
    await page.keyboard.press('Enter')
    await expect(page.locator('.summary-status')).toHaveText('Summary copied.', { timeout: 60_000 })
    const result = await page.evaluate(() => (window as unknown as { treeApi: SmokeApi }).treeApi.readClipboard())
    expect(result.kind).toBe('text')
    if (result.kind === 'text') expect(result.text?.trim().length).toBeGreaterThan(0)
  } finally {
    releaseSystemClipboardLock()
  }
}
