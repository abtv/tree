import type { ElectronApplication, Page } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readlinkSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { TreeApi } from '../../src/shared/ipc'
import { recordPerfResult } from '../results'
import { expect, launchTree, round, seedNotesArchiveProfile, test } from './fixtures'

type Operation = 'idle' | 'export' | 'import'
type Request =
  | 'chooseNotesExportDestination'
  | 'startNotesExport'
  | 'chooseNotesImportArchive'
  | 'prepareNotesImport'
  | 'cancelNotesOperation'

function callNotes<K extends Request>(page: Page, request: K): Promise<Awaited<ReturnType<NonNullable<TreeApi[K]>>>> {
  return page.evaluate((name) => {
    const api = (globalThis as unknown as { treeApi: Record<string, () => Promise<unknown>> }).treeApi
    return api[name]!()
  }, request) as Promise<Awaited<ReturnType<NonNullable<TreeApi[K]>>>>
}

interface MainProbe {
  timer: ReturnType<typeof setInterval>
  delays: number[]
  heapStart: number
  heapPeak: number
  previous: number
}

async function startMainProbe(app: ElectronApplication): Promise<void> {
  await app.evaluate(() => {
    const heapStart = process.memoryUsage().heapUsed
    const probe: MainProbe = {
      timer: undefined!,
      delays: [],
      heapStart,
      heapPeak: heapStart,
      previous: performance.now(),
    }
    probe.timer = setInterval(() => {
      const now = performance.now()
      probe.delays.push(Math.max(0, now - probe.previous - 5))
      probe.previous = now
      probe.heapPeak = Math.max(probe.heapPeak, process.memoryUsage().heapUsed)
    }, 5)
    ;(globalThis as typeof globalThis & { archiveProbe?: MainProbe }).archiveProbe = probe
  })
}

async function stopMainProbe(app: ElectronApplication) {
  return app.evaluate(() => {
    const probe = (globalThis as typeof globalThis & { archiveProbe: MainProbe }).archiveProbe
    clearInterval(probe.timer)
    probe.delays.push(Math.max(0, performance.now() - probe.previous - 5))
    probe.heapPeak = Math.max(probe.heapPeak, process.memoryUsage().heapUsed)
    delete (globalThis as typeof globalThis & { archiveProbe?: MainProbe }).archiveProbe
    return { delays: probe.delays, heapGrowth: Math.max(0, probe.heapPeak - probe.heapStart) }
  })
}

function percentile(values: number[], fraction: number): number {
  expect(values.length).toBeGreaterThan(0)
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))]!
}

async function measure(app: ElectronApplication, page: Page, operation: Operation) {
  const field = page.getByRole('textbox', { name: 'Node 2', exact: true })
  const parent = page.getByRole('textbox', { name: 'Current parent', exact: true })
  const parentBefore = await parent.inputValue()
  await field.focus()
  await expect(field).toBeFocused()
  await field.evaluate((element) => {
    const probe = { paints: [] as { start: number; elapsed: number }[], finished: Infinity }
    let keyStarted = 0
    ;(globalThis as typeof globalThis & { archiveTyping?: typeof probe }).archiveTyping = probe
    element.addEventListener('keydown', (event) => {
      keyStarted = event.timeStamp
    })
    element.addEventListener('input', (event) => {
      const start = keyStarted || event.timeStamp
      requestAnimationFrame(() =>
        requestAnimationFrame(() => probe.paints.push({ start, elapsed: performance.now() - start })),
      )
    })
  })
  await startMainProbe(app)
  const started = performance.now()
  let done = operation === 'idle'
  let typed = 0
  let overlappingKeys = 0
  let operationMs = 0
  const job =
    operation === 'idle'
      ? Promise.resolve({ ok: true })
      : callNotes(page, operation === 'export' ? 'startNotesExport' : 'prepareNotesImport')
  const observedJob = job.then(async (result) => {
    operationMs = performance.now() - started
    if (operation !== 'idle')
      await page.evaluate(() => {
        ;(globalThis as typeof globalThis & { archiveTyping: { finished: number } }).archiveTyping.finished =
          performance.now()
      })
    done = true
    return { result, main: operation === 'idle' ? undefined : await stopMainProbe(app) }
  })
  // Continue through completion; a fixed short burst could miss late near-limit decodes.
  do {
    if (!done) overlappingKeys += 1
    await page.keyboard.type('x')
    typed += 1
    await page.waitForTimeout(15)
  } while (!done || typed < 100)
  const { result, main: operationMain } = await observedJob
  const durationMs = operation === 'idle' ? performance.now() - started : operationMs
  expect(result).toMatchObject({ ok: true })
  if (operation === 'export') expect(result).toMatchObject({ summary: { imageCount: 256, missingImageCount: 0 } })
  if (operation === 'import')
    expect(result).toMatchObject({ incoming: { nodeCount: 50176, imageCount: 256, missingImageCount: 0 } })
  await page.waitForFunction(
    (count) =>
      (globalThis as typeof globalThis & { archiveTyping: { paints: number[] } }).archiveTyping.paints.length === count,
    typed,
  )
  const paints = await page.evaluate(() => {
    const probe = (
      globalThis as typeof globalThis & {
        archiveTyping: { paints: { start: number; elapsed: number }[]; finished: number }
      }
    ).archiveTyping
    return probe.paints.filter((sample) => sample.start <= probe.finished).map((sample) => sample.elapsed)
  })
  const main = operationMain ?? (await stopMainProbe(app))
  await expect(field).toHaveValue(new RegExp(`x{${typed}}`))
  await expect(parent).toHaveValue(parentBefore)
  if (operation !== 'idle') expect(overlappingKeys).toBeGreaterThan(10)
  expect(paints.length).toBeGreaterThan(10)
  const metrics = {
    durationMs: round(durationMs),
    paintP50Ms: round(percentile(paints, 0.5)),
    paintP95Ms: round(percentile(paints, 0.95)),
    paintMaxMs: round(Math.max(...paints)),
    mainDelayP95Ms: round(percentile(main.delays, 0.95)),
    mainDelayMaxMs: round(Math.max(...main.delays)),
    mainHeapGrowthMiB: round(main.heapGrowth / 1024 ** 2),
  }
  recordPerfResult({ kind: 'notes-archive', scenario: operation, samples: paints.length, metrics })
  return metrics
}

async function cancelPreparation(app: ElectronApplication, page: Page, archivePath: string): Promise<void> {
  await expect(callNotes(page, 'chooseNotesImportArchive')).resolves.toMatchObject({ ok: true })
  // Cancel after an actual image write, while the worker still owns its open archive FileHandle.
  await page.evaluate(() => {
    const api = (globalThis as unknown as { treeApi: TreeApi }).treeApi
    const unsubscribe = api.onNotesProgress!((progress) => {
      if (progress.imagesDone < 1) return
      unsubscribe()
      void api.cancelNotesOperation!()
    })
  })
  await expect(callNotes(page, 'prepareNotesImport')).resolves.toEqual({ ok: false, canceled: true })
  // lsof inspects the main PID including its worker threads; /proc is the Linux equivalent.
  const pid = app.process().pid!
  const openFiles =
    process.platform === 'darwin'
      ? execFileSync('/usr/sbin/lsof', ['-a', '-p', String(pid), '-Fn'], { encoding: 'utf8' })
      : readdirSync(`/proc/${pid}/fd`)
          .map((fd) => {
            try {
              return readlinkSync(`/proc/${pid}/fd/${fd}`)
            } catch {
              return ''
            }
          })
          .join('\n')
  expect(openFiles).not.toContain(archivePath)
  expect(openFiles).not.toContain('.notes-import/')
  expect(openFiles).not.toContain('.notes-export/')
}

// @requirement PRODUCT.md §22.1
test('large notes archive keeps typing and the main event loop responsive', async ({ userDataDir }) => {
  test.setTimeout(180_000)
  const profile = seedNotesArchiveProfile(userDataDir)
  expect(profile.nodeCount).toBe(50176)
  const archivePath = join(userDataDir, 'Notes.zip')
  const { app, window } = await launchTree(userDataDir)
  await expect(window.getByRole('textbox', { name: 'Node 2', exact: true })).toHaveValue('Node 0.1')
  await app.evaluate(({ dialog }, path) => {
    dialog.showSaveDialog = (async () => ({ canceled: false, filePath: path })) as typeof dialog.showSaveDialog
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [path] })) as typeof dialog.showOpenDialog
  }, archivePath)

  const idle = await measure(app, window, 'idle')
  await expect(callNotes(window, 'chooseNotesExportDestination')).resolves.toMatchObject({ ok: true })
  const exported = await measure(app, window, 'export')
  expect(statSync(archivePath).size).toBeGreaterThan(profile.imageBytes)
  await expect(callNotes(window, 'chooseNotesImportArchive')).resolves.toMatchObject({ ok: true })
  const imported = await measure(app, window, 'import')
  await callNotes(window, 'cancelNotesOperation')
  await cancelPreparation(app, window, archivePath)
  expect(readdirSync(join(userDataDir, '.notes-import'))).toEqual([])
  expect(readdirSync(join(userDataDir, '.notes-export'))).toEqual([])
  expect(existsSync(join(userDataDir, 'Replaced Notes'))).toBe(false)

  // Local operation baseline: export ~0.3 s; import preparation ~1.7 s.
  expect.soft(exported.durationMs).toBeLessThan(5_000)
  expect.soft(imported.durationMs).toBeLessThan(10_000)
  for (const metrics of [idle, exported, imported]) {
    // Local baseline: paint p95 ~32 ms, import main max ~20 ms, heap growth <1 MiB.
    // Retain headroom for frame quantization and slower CI; a 50 ms main stall triggers D1.
    expect.soft(metrics.paintP95Ms).toBeLessThan(50)
    expect.soft(metrics.paintMaxMs).toBeLessThan(100)
    expect.soft(metrics.mainDelayMaxMs).toBeLessThan(50)
    expect.soft(metrics.mainHeapGrowthMiB).toBeLessThan(64)
  }
})
