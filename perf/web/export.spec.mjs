/* global document */
import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { createStaticServer } from '../../scripts/web/static-server.mts'
import { listCentralEntries } from '../../src/infrastructure/archive/zip-test-utils.ts'
import { recordPerfResult } from '../results.ts'
import {
  IMAGE_COUNT,
  LONG_TASK_CEILING_MS,
  NODE_COUNT,
  ready,
  seedLargeProfile,
  watchMainThread,
} from './large-profile.mjs'

// Measures "Export Notes…" in the built browser package (PRODUCT §24.3, §22.1): the worker writes
// the archive while the main thread only appends transferred chunks to a Blob.
const server = createStaticServer()
let origin = ''

test.beforeAll(async () => {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  origin = `http://127.0.0.1:${server.address().port}/`
})

test.afterAll(async () => {
  await new Promise((resolve) => server.close(resolve))
})

test('exports a large profile without blocking the main thread', async ({ browser }) => {
  test.setTimeout(300_000)
  const context = await browser.newContext({ viewport: { width: 1100, height: 760 }, acceptDownloads: true })
  try {
    const page = await context.newPage()
    await page.goto(origin)
    await ready(page)
    const imageBytes = await seedLargeProfile(page)
    await page.reload()
    await ready(page)

    const stop = await watchMainThread(context, page)
    await page.getByRole('button', { name: 'Tree menu', exact: true }).click()
    const downloading = page.waitForEvent('download', { timeout: 240_000 })
    const started = Date.now()
    await page.getByRole('dialog', { name: 'Tree menu' }).getByRole('button', { name: 'Export Notes…' }).click()
    const download = await downloading
    const exportMs = Date.now() - started
    const mainThread = await stop()

    const archive = new Uint8Array(await readFile(await download.path()))
    expect(listCentralEntries(archive)).toHaveLength(IMAGE_COUNT + 1)
    expect(await page.evaluate(() => document.getElementById('data-activity-text').textContent)).toMatch(/^Exported/)
    recordPerfResult({
      kind: 'web-export',
      scenario: `nodes-${NODE_COUNT}-images-${IMAGE_COUNT}`,
      metrics: {
        exportMs,
        ...mainThread,
        archiveMiB: Math.round((archive.byteLength / 1024 / 1024) * 10) / 10,
        imageKiB: Math.round(imageBytes / 1024),
      },
    })
    expect(mainThread.maxLongTaskMs, 'The main thread must not block while the worker writes the archive').toBeLessThan(
      LONG_TASK_CEILING_MS,
    )
  } finally {
    await context.close()
  }
})
