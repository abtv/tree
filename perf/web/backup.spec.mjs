/* global window, document, Worker, IDBObjectStore, requestAnimationFrame */
import { test, expect } from '@playwright/test'
import { createStaticServer } from '../../scripts/web/static-server.mts'
import { installBackupPicker, chooseMenuItem } from '../../e2e/web/data-helpers.mjs'
import { recordPerfResult } from '../results.ts'
import {
  IMAGE_COUNT,
  NODE_COUNT,
  LONG_TASK_CEILING_MS,
  ready,
  seedLargeProfile,
  watchMainThread,
} from './large-profile.mjs'

const server = createStaticServer()
let origin = ''
test.beforeAll(async () => {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  origin = `http://127.0.0.1:${server.address().port}/`
})
test.afterAll(async () => {
  await new Promise((resolve) => server.close(resolve))
})

const percentile = (values, fraction) => [...values].sort((a, b) => a - b)[Math.ceil(values.length * fraction) - 1] ?? 0

test('folder backup keeps typing responsive and bounds document writes on a large profile', async ({ browser }) => {
  test.setTimeout(300_000)
  const context = await browser.newContext({ viewport: { width: 1100, height: 760 } })
  try {
    await installBackupPicker(context)
    // Observe real worker writes without a production hook. Metric messages are consumed before
    // the controller receives ordinary messages, so they never enter the production protocol.
    await context.addInitScript(() => {
      window.backupMeasurements = { writes: [], paints: [], saves: [] }
      const NativeWorker = Worker
      window.Worker = class extends NativeWorker {
        constructor(...args) {
          super(...args)
          this.addEventListener('message', (event) => {
            if (!event.data?.backupMeasurement) return
            event.stopImmediatePropagation()
            window.backupMeasurements.writes.push({ ...event.data.backupMeasurement, time: performance.now() })
          })
        }
      }
      document.addEventListener(
        'input',
        (event) => {
          if (!event.target.matches('.node-input')) return
          const started = performance.now()
          requestAnimationFrame(() =>
            requestAnimationFrame(() => window.backupMeasurements.paints.push(performance.now() - started)),
          )
        },
        true,
      )
      const put = IDBObjectStore.prototype.put
      IDBObjectStore.prototype.put = function (...args) {
        const started = performance.now()
        const request = put.apply(this, args)
        if (this.name === 'document')
          this.transaction.addEventListener('complete', () =>
            window.backupMeasurements.saves.push(performance.now() - started),
          )
        return request
      }
    })
    const page = await context.newPage()
    await page.route(/backup\.worker.*\.js/, async (route) => {
      const response = await route.fetch()
      const patch = `{
        const create = FileSystemFileHandle.prototype.createWritable;
        FileSystemFileHandle.prototype.createWritable = async function (...args) {
          const name = this.name, stream = await create.apply(this, args);
          const write = stream.write.bind(stream), close = stream.close.bind(stream);
          let bytes = 0;
          stream.write = async value => {
            bytes += typeof value === 'string' ? new TextEncoder().encode(value).byteLength : value.size ?? value.byteLength ?? 0;
            return write(value);
          };
          stream.close = async () => { await close(); self.postMessage({ backupMeasurement: { name, bytes } }); };
          return stream;
        };
      }\n`
      await route.fulfill({ response, body: patch + (await response.text()) })
    })
    await page.goto(origin)
    await ready(page)
    await seedLargeProfile(page)
    await page.reload()
    await ready(page)
    const samples = []
    for (const [index, enabled] of [false, true, false, true].entries()) {
      if (enabled) {
        await chooseMenuItem(page, 'Back Up to Folder…')
        const occupied = page.getByRole('dialog', { name: 'This Folder Already Contains Notes' })
        // The second enabled repetition uses the same folder, with explicit overwrite consent.
        if (index > 1) await occupied.getByRole('button', { name: 'Replace Backup with Current Notes' }).click()
        await expect(page.locator('#backup-status')).toContainText('Backed up', { timeout: 90_000 })
      } else if (index > 0) await chooseMenuItem(page, 'Stop Backing Up')
      const input = page.locator('[data-node-id="r0"] .node-input')
      await input.click()
      await expect(input).toBeFocused()
      const heading = await page.locator('.location-bar').textContent()
      await page.evaluate(() => {
        window.backupMeasurements = { writes: [], paints: [], saves: [] }
      })
      const stop = await watchMainThread(context, page)
      const started = Date.now()
      // A real input stream lasts beyond the backup interval; rapid commits are not postponed.
      await input.pressSequentially(' ordinary typing '.repeat(28), { delay: 25 })
      await page.evaluate(() => window.prototypeStore.flushPersistence())
      await expect(page.locator('#prototype-save-status')).toHaveText('Saved locally in this browser')
      const savedAt = Date.now()
      if (enabled) {
        await expect
          .poll(
            () =>
              page.evaluate(async () => {
                const folder = await (await navigator.storage.getDirectory()).getDirectoryHandle('Tree Backup')
                const head = JSON.parse(await (await (await folder.getFileHandle('document.json')).getFile()).text())
                return head.document.roots[0].text === window.prototypeStore.getSnapshot().document.roots[0].text
              }),
            { timeout: 15_000 },
          )
          .toBe(true)
      }
      const backupLagMs = enabled ? Date.now() - savedAt : 0
      const elapsed = Date.now() - started
      const mainThread = await stop()
      const measured = await page.evaluate(() => window.backupMeasurements)
      expect(measured.paints.length).toBeGreaterThan(100)
      expect(await page.locator('.location-bar').textContent()).toBe(heading)
      const documentWrites = measured.writes.filter((write) => write.name === 'document.json')
      const metrics = {
        inputPaintP50Ms: percentile(measured.paints, 0.5),
        inputPaintP95Ms: percentile(measured.paints, 0.95),
        inputPaintMaxMs: Math.max(...measured.paints),
        saveP95Ms: percentile(measured.saves, 0.95),
        backupLagMs,
        documentWrites: documentWrites.length,
        bytesPerMinute: (measured.writes.reduce((sum, write) => sum + write.bytes, 0) * 60_000) / elapsed,
        ...mainThread,
      }
      samples.push({ enabled, metrics })
      recordPerfResult({
        kind: 'web-backup',
        scenario: `nodes-${NODE_COUNT}-images-${IMAGE_COUNT}-${enabled ? 'on' : 'off'}-${index}`,
        metrics,
      })
      expect(mainThread.maxLongTaskMs).toBeLessThan(LONG_TASK_CEILING_MS)
      if (enabled) {
        expect(backupLagMs).toBeLessThan(15_000)
        expect(documentWrites.length).toBeGreaterThan(0)
        expect(documentWrites.length).toBeLessThanOrEqual(Math.ceil(elapsed / 10_000) + 1)
        expect(measured.writes.every((write) => write.name === 'document.json')).toBe(true)
      } else expect(measured.writes).toEqual([])
    }
    const mean = (enabled, metric) =>
      samples.filter((sample) => sample.enabled === enabled).reduce((sum, sample) => sum + sample.metrics[metric], 0) /
      2
    // Compare within one alternating run; the additive allowance covers frame-scheduling noise.
    expect(mean(true, 'inputPaintP95Ms')).toBeLessThan(mean(false, 'inputPaintP95Ms') * 1.5 + 16.7)
  } finally {
    await context.close()
  }
})
