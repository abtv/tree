import {
  collectRendererHeap,
  expect,
  firePaste,
  largeAttachmentSeed,
  largeSeed,
  launchTree,
  round,
  seedAttachmentFiles,
  seedDocument,
  test,
  writeClipboardImageSized,
} from './fixtures'
import { recordPerfResult } from './results'

interface SaveControl {
  saves: number
  bytesWritten: number
  cleanupDurations: number[]
}

const MIB = 1024 * 1024

async function readProcessWorkingSet(app: Awaited<ReturnType<typeof launchTree>>['app']): Promise<{
  mainBytes: number
  rendererBytes: number
  totalBytes: number
  processCount: number
}> {
  return app.evaluate(({ app, BrowserWindow }) => {
    const metrics = app.getAppMetrics()
    const rendererPid = BrowserWindow.getAllWindows()[0]?.webContents.getOSProcessId()
    return {
      mainBytes: (metrics.find((metric) => metric.pid === process.pid)?.memory.workingSetSize ?? 0) * 1024,
      rendererBytes: (metrics.find((metric) => metric.pid === rendererPid)?.memory.workingSetSize ?? 0) * 1024,
      totalBytes: metrics.reduce((total, metric) => total + metric.memory.workingSetSize * 1024, 0),
      processCount: metrics.length,
    }
  })
}

async function installPersistenceProbes(app: Awaited<ReturnType<typeof launchTree>>['app']): Promise<void> {
  await app.evaluate(() => {
    const control = globalThis as typeof globalThis & {
      __saveProbe?: { saves: number; bytesWritten: number; cleanupDurations: number[] }
    }
    control.__saveProbe = { saves: 0, bytesWritten: 0, cleanupDurations: [] }

    globalThis.__treeIpc.wrap('tree:save', async (original, ...args) => {
      const result = await original(...args)
      control.__saveProbe!.saves += 1
      control.__saveProbe!.bytesWritten += Buffer.byteLength(JSON.stringify(args[1], null, 2))
      return result
    })

    globalThis.__treeIpc.wrap('tree:cleanup-attachments', async (original, ...args) => {
      const start = performance.now()
      try {
        return await original(...args)
      } finally {
        control.__saveProbe!.cleanupDurations.push(performance.now() - start)
      }
    })
  })
}

async function readProbe(app: Awaited<ReturnType<typeof launchTree>>['app']): Promise<SaveControl> {
  return app.evaluate(() => {
    const probe = (globalThis as typeof globalThis & { __saveProbe?: SaveControl }).__saveProbe
    return {
      saves: probe?.saves ?? 0,
      bytesWritten: probe?.bytesWritten ?? 0,
      cleanupDurations: probe?.cleanupDurations ?? [],
    }
  })
}

// @requirement PRODUCT.md §22.1
test.describe('state and persistence work', () => {
  test('fresh application process footprint', async ({ userDataDir }) => {
    const { app, window } = await launchTree(userDataDir)
    await expect(window.getByLabel('Vim mode')).toHaveText('INSERT')
    const memory = await readProcessWorkingSet(app)
    recordPerfResult({
      kind: 'state',
      scenario: 'fresh-process-footprint',
      metrics: {
        mainWorkingSetBytes: memory.mainBytes,
        rendererWorkingSetBytes: memory.rendererBytes,
        totalWorkingSetBytes: memory.totalBytes,
        processCount: memory.processCount,
      },
    })
    expect(memory.mainBytes).toBeGreaterThan(0)
    expect(memory.rendererBytes).toBeGreaterThan(0)
    expect(memory.rendererBytes).toBeLessThan(300 * MIB)
    expect(memory.totalBytes).toBeLessThan(800 * MIB)
  })

  test('large-10000 structural burst, save policy, and cleanup scan', async ({ userDataDir }) => {
    seedDocument(userDataDir, largeAttachmentSeed(100, 100))
    seedAttachmentFiles(
      userDataDir,
      Array.from({ length: 100 }, (_, index) => `child-image-${index}`),
    )
    const { app, window } = await launchTree(userDataDir)
    const input = window.getByRole('textbox').first()
    await input.focus()
    await installPersistenceProbes(app)
    const baseline = await readProbe(app)

    const burstStart = performance.now()
    for (let index = 0; index < 200; index += 1) {
      await window.keyboard.press('Enter')
    }
    const structuralBurstMs = performance.now() - burstStart

    const typed = `${'lorem ipsum dolor sit amet '.repeat(4)}final`
    const typingStart = performance.now()
    await window.keyboard.type(typed)
    const typingMs = performance.now() - typingStart

    await window.keyboard.press('Meta+Backspace')
    await window.keyboard.type('cleanup words to persist now tail one two three four five six')

    const deadline = Date.now() + 20_000
    let cleanupScanMs = 0
    while (Date.now() < deadline) {
      const probe = await readProbe(app)
      if (probe.cleanupDurations.length > 0) {
        cleanupScanMs = Math.max(...probe.cleanupDurations)
        break
      }
      await window.waitForTimeout(50)
    }

    const probe = await readProbe(app)
    const saveCount = probe.saves - baseline.saves
    const documentBytesWritten = probe.bytesWritten - baseline.bytesWritten
    const wordCount = typed.split(/\s+/).filter((word) => word.length > 0).length

    recordPerfResult({
      kind: 'state',
      scenario: 'large-10000',
      metrics: {
        structuralBurstMs: round(structuralBurstMs),
        typingMs: round(typingMs),
        saveCount,
        documentBytesWritten,
        cleanupScanMs: round(cleanupScanMs),
      },
    })

    expect(structuralBurstMs).toBeLessThan(2_000)
    expect(typingMs).toBeLessThan(500)
    expect(saveCount).toBeGreaterThan(0)
    expect(saveCount).toBeLessThanOrEqual(Math.ceil(wordCount / 10) + 2)
    expect(documentBytesWritten).toBeLessThan(20_000_000)
    expect(cleanupScanMs).toBeGreaterThan(0)
    expect(cleanupScanMs).toBeLessThan(100)
  })

  test('large-10000 attachment history through edits and undo/redo', async ({ userDataDir }) => {
    seedDocument(userDataDir, largeAttachmentSeed(100, 100))
    seedAttachmentFiles(
      userDataDir,
      Array.from({ length: 100 }, (_, index) => `child-image-${index}`),
    )
    const { app, window } = await launchTree(userDataDir)
    await installPersistenceProbes(app)
    const baseline = await readProbe(app)
    await window.getByRole('textbox', { name: 'Node 1', exact: true }).focus()

    const historyStart = performance.now()
    for (let index = 0; index < 100; index += 1) {
      await window.keyboard.press('Enter')
    }
    for (let index = 0; index < 100; index += 1) {
      await window.keyboard.press('Meta+z')
    }
    for (let index = 0; index < 100; index += 1) {
      await window.keyboard.press('Meta+Shift+z')
    }
    const historyMs = performance.now() - historyStart

    await window.keyboard.type('tail words to force a save one two three four five six seven eight nine ten')

    const deadline = Date.now() + 20_000
    let cleanupScanMs = 0
    while (Date.now() < deadline) {
      const probe = await readProbe(app)
      if (probe.cleanupDurations.length > 0) {
        cleanupScanMs = Math.max(...probe.cleanupDurations)
        break
      }
      await window.waitForTimeout(50)
    }

    const probe = await readProbe(app)
    const saveCount = probe.saves - baseline.saves

    recordPerfResult({
      kind: 'state',
      scenario: 'large-10000-attachment-history',
      metrics: {
        historyMs: round(historyMs),
        saveCount,
        cleanupScanMs: round(cleanupScanMs),
      },
    })

    expect(saveCount).toBeGreaterThan(0)
    expect(historyMs).toBeLessThan(3_000)
    expect(cleanupScanMs).toBeGreaterThan(0)
    expect(cleanupScanMs).toBeLessThan(100)
  })

  test('sustained-10000 structural edits keep renderer memory bounded', async ({ userDataDir }) => {
    seedDocument(userDataDir, largeSeed(100, 100))
    const { app, window } = await launchTree(userDataDir, { memoryProbe: true })
    const input = window.getByRole('textbox', { name: 'Node 1', exact: true })
    await input.focus()
    await expect(input).toBeFocused()

    const structuralCycle = async (): Promise<void> => {
      await window.keyboard.press('Enter')
      await window.keyboard.press('Meta+Backspace')
    }
    for (let index = 0; index < 50; index += 1) await structuralCycle()
    const warmHeapBytes = await collectRendererHeap(window)
    const warmProcess = await readProcessWorkingSet(app)

    const cycles = 250
    for (let index = 0; index < cycles; index += 1) await structuralCycle()
    const middleHeapBytes = await collectRendererHeap(window)
    const middleProcess = await readProcessWorkingSet(app)
    for (let index = 0; index < cycles; index += 1) await structuralCycle()
    const finalHeapBytes = await collectRendererHeap(window)
    const finalProcess = await readProcessWorkingSet(app)
    const growthBytes = finalHeapBytes - warmHeapBytes
    const lateRendererWorkingSetGrowthBytes = finalProcess.rendererBytes - middleProcess.rendererBytes
    const lateTotalWorkingSetGrowthBytes = finalProcess.totalBytes - middleProcess.totalBytes

    recordPerfResult({
      kind: 'state',
      scenario: 'sustained-memory',
      metrics: {
        warmHeapBytes,
        finalHeapBytes,
        growthBytes,
        cycles: cycles * 2,
        warmMainWorkingSetBytes: warmProcess.mainBytes,
        middleMainWorkingSetBytes: middleProcess.mainBytes,
        finalMainWorkingSetBytes: finalProcess.mainBytes,
        warmRendererWorkingSetBytes: warmProcess.rendererBytes,
        middleRendererWorkingSetBytes: middleProcess.rendererBytes,
        finalRendererWorkingSetBytes: finalProcess.rendererBytes,
        lateRendererWorkingSetGrowthBytes,
        lateTotalWorkingSetGrowthBytes,
        warmTotalWorkingSetBytes: warmProcess.totalBytes,
        middleTotalWorkingSetBytes: middleProcess.totalBytes,
        finalTotalWorkingSetBytes: finalProcess.totalBytes,
        middleHeapBytes,
        warmProcessCount: warmProcess.processCount,
        finalProcessCount: finalProcess.processCount,
      },
    })

    expect(warmHeapBytes).toBeGreaterThan(0)
    expect(warmProcess.rendererBytes).toBeGreaterThan(0)
    expect(growthBytes).toBeLessThan(5_000_000)
    expect(lateRendererWorkingSetGrowthBytes).toBeLessThan(30_000_000)
    expect(lateTotalWorkingSetGrowthBytes).toBeLessThan(50 * MIB)
    expect(finalProcess.rendererBytes).toBeLessThan(500 * MIB)
    expect(finalProcess.totalBytes).toBeLessThan(1_100 * MIB)
  })

  test('image insertion decode latency for small and larger images', async ({ userDataDir }) => {
    const { app, window } = await launchTree(userDataDir)
    await app.evaluate(() => {
      const control = globalThis as typeof globalThis & { __decodeProbe?: number[] }
      control.__decodeProbe = []
      globalThis.__treeIpc.wrap('tree:write-attachment', async (original, ...args) => {
        const start = performance.now()
        try {
          return await original(...args)
        } finally {
          control.__decodeProbe!.push(performance.now() - start)
        }
      })
    })

    const measurements: Record<string, number> = {}
    for (const [name, width, height] of [
      ['small', 32, 32],
      ['large', 512, 512],
    ] as const) {
      await writeClipboardImageSized(app, width, height)
      await firePaste(window.getByRole('textbox').first())
      await expect(window.getByAltText('Attached image').last()).toBeVisible()
      const durations = await app.evaluate(
        () => (globalThis as typeof globalThis & { __decodeProbe?: number[] }).__decodeProbe ?? [],
      )
      measurements[name] = round(durations.at(-1) ?? 0)
    }

    recordPerfResult({
      kind: 'attachment',
      scenario: 'image-insertion-decode',
      metrics: {
        smallMs: measurements['small'] ?? 0,
        largeMs: measurements['large'] ?? 0,
      },
    })

    expect(measurements['small']).toBeGreaterThan(0)
    expect(measurements['small']).toBeLessThan(100)
    expect(measurements['large']).toBeLessThan(100)
  })
})
