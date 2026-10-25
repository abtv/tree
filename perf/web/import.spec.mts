/* global window */
import { stat } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { createStaticServer } from '../../scripts/web/static-server.mts'
import { recordPerfResult } from '../results.ts'
import {
  IMAGE_COUNT,
  LONG_TASK_CEILING_MS,
  NODE_COUNT,
  ready,
  seedLargeProfile,
  watchMainThread,
} from './large-profile.mts'

// Measures "Import Notes…" in the built browser package (PRODUCT §24.4, §22.1): the worker reads,
// validates and stages the archive while the main thread only shows progress and the confirmation.
const server = createStaticServer()
let origin = ''

test.beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('The test server did not bind a TCP port')
  origin = `http://127.0.0.1:${address.port}/`
})

test.afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()))
})

test('imports a large archive without blocking the main thread', async ({ browser }, testInfo) => {
  test.setTimeout(400_000)
  const archivePath = testInfo.outputPath('large.zip')
  const source = await browser.newContext({ viewport: { width: 1100, height: 760 }, acceptDownloads: true })
  try {
    const page = await source.newPage()
    await page.goto(origin)
    await ready(page)
    await seedLargeProfile(page)
    await page.reload()
    await ready(page)
    await page.getByRole('button', { name: 'Tree menu', exact: true }).click()
    const downloading = page.waitForEvent('download', { timeout: 240_000 })
    await page.getByRole('dialog', { name: 'Tree menu' }).getByRole('button', { name: 'Export Notes…' }).click()
    await (await downloading).saveAs(archivePath)
  } finally {
    await source.close()
  }

  const target = await browser.newContext({ viewport: { width: 1100, height: 760 } })
  try {
    const page = await target.newPage()

    await page.goto(origin)
    await ready(page)
    const stop = await watchMainThread(target, page)

    await page.getByRole('button', { name: 'Tree menu', exact: true }).click()
    const choosing = page.waitForEvent('filechooser')
    const started = Date.now()

    await page.getByRole('dialog', { name: 'Tree menu' }).getByRole('button', { name: 'Import Notes…' }).click()
    await (await choosing).setFiles(archivePath)
    const dialog = page.getByRole('dialog', { name: 'Replace Current Notes?' })
    await dialog.waitFor({ timeout: 300_000 })
    const prepareMs = Date.now() - started
    const mainThread = await stop()

    await expect(dialog.locator('#import-confirm-incoming')).toContainText(
      `contains ${NODE_COUNT.toLocaleString('en-US')} nodes and ${IMAGE_COUNT} images.`,
    )

    const replaced = Date.now()
    const reloaded = page.waitForEvent('load')

    await dialog.getByRole('button', { name: 'Replace Notes', exact: true }).click()
    await reloaded
    await ready(page)
    const replaceMs = Date.now() - replaced

    expect(
      await page.evaluate(() => (window.prototypeStore.getSnapshot() as ReadyEditorSnapshot).document.roots.length),
    ).toBe(NODE_COUNT / 1000)

    recordPerfResult({
      kind: 'web-import',
      scenario: `nodes-${NODE_COUNT}-images-${IMAGE_COUNT}`,
      metrics: {
        prepareMs,
        replaceAndReloadMs: replaceMs,
        ...mainThread,
        archiveMiB: Math.round(((await stat(archivePath)).size / 1024 / 1024) * 10) / 10,
      },
    })

    expect(
      mainThread.maxLongTaskMs,
      'The main thread must not block while the worker reads and stages the archive',
    ).toBeLessThan(LONG_TASK_CEILING_MS)
  } finally {
    await target.close()
  }
})
