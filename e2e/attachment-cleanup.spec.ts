import { existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import type { ElectronApplication, Page } from '@playwright/test'
import {
  attachmentFiles,
  attachmentPath,
  documentGenerations,
  expect,
  firePaste,
  launchTree,
  node,
  readPersisted,
  test,
  typeInto,
  writeClipboardImage,
} from './fixtures'

async function cleanupAttachments(window: Page, referencedIds: string[]): Promise<void> {
  await window.evaluate(async (ids) => {
    const api = (globalThis as unknown as { treeApi: { cleanupAttachments(referencedIds: string[]): Promise<void> } })
      .treeApi
    await api.cleanupAttachments(ids)
  }, referencedIds)
}

async function countCleanups(app: ElectronApplication): Promise<void> {
  await app.evaluate(() => {
    const control = globalThis as typeof globalThis & { cleanupCount?: number }
    control.cleanupCount = 0
    globalThis.__treeIpc.wrap('tree:cleanup-attachments', async (original, ...args) => {
      const result = await original(...args)
      control.cleanupCount = (control.cleanupCount ?? 0) + 1
      return result
    })
  })
}

function readCleanupCount(app: ElectronApplication): Promise<number> {
  return app.evaluate(() => (globalThis as typeof globalThis & { cleanupCount?: number }).cleanupCount ?? 0)
}

test.describe('attachment cleanup', () => {
  test('retains a deleted image while a recovery generation references it and removes it afterwards', async ({
    userDataDir,
  }) => {
    const { app, window } = await launchTree(userDataDir)
    await countCleanups(app)

    await typeInto(node(window, 1), 'keep')
    await window.keyboard.press('Enter')
    await node(window, 2).focus()
    await writeClipboardImage(app)
    await firePaste(node(window, 2))
    await expect(window.getByAltText('Attached image')).toHaveCount(1)
    await expect.poll(() => readPersisted(userDataDir).document.roots[1]?.attachment?.id).toEqual(expect.any(String))
    const attachmentId = readPersisted(userDataDir).document.roots[1]!.attachment!.id
    expect(existsSync(attachmentPath(userDataDir, attachmentId))).toBe(true)

    // Delete the image-bearing node through the UI and trigger a volume save.
    await node(window, 2).press('Backspace')
    await expect(window.locator('[aria-label^="Node "]')).toHaveCount(1)
    const cleanupsBefore = await readCleanupCount(app)
    await typeInto(node(window, 1), ' one two three four five six seven eight nine ten')
    await expect.poll(() => readPersisted(userDataDir).document.roots.length).toBe(1)
    await expect.poll(() => readPersisted(userDataDir).document.roots[0]?.attachment).toBeUndefined()

    // The automatic cleanup that follows the save retains the file because the undo history and a
    // recovery generation still reference the attachment.
    await expect.poll(() => readCleanupCount(app)).toBeGreaterThan(cleanupsBefore)
    expect(attachmentFiles(userDataDir)).toContain(`${attachmentId}.png`)

    // A retained recovery generation still references the attachment, so explicit cleanup retains it.
    await cleanupAttachments(window, [])
    expect(attachmentFiles(userDataDir)).toContain(`${attachmentId}.png`)

    // With the recovery generations gone and no live references passed, cleanup removes it.
    for (const generation of documentGenerations(userDataDir)) {
      rmSync(join(userDataDir, 'data', generation), { force: true })
    }
    await cleanupAttachments(window, [])
    await expect.poll(() => attachmentFiles(userDataDir)).not.toContain(`${attachmentId}.png`)
  })
})
