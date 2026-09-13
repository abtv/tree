import { expect, largeAttachmentSeed, launchTree, round, seedAttachmentFiles, seedDocument, test } from './fixtures'

interface SaveControl {
  saves: number
  cleanupDurations: number[]
}

async function installPersistenceProbes(app: Awaited<ReturnType<typeof launchTree>>['app']): Promise<void> {
  await app.evaluate(({ ipcMain }) => {
    const handlers = (ipcMain as unknown as { _invokeHandlers: Map<string, (...args: unknown[]) => unknown> })
      ._invokeHandlers
    const control = globalThis as typeof globalThis & {
      __saveProbe?: { saves: number; cleanupDurations: number[] }
    }
    control.__saveProbe = { saves: 0, cleanupDurations: [] }

    const save = handlers.get('tree:save')
    if (save === undefined) throw new Error('Save handler is unavailable.')
    ipcMain.removeHandler('tree:save')
    ipcMain.handle('tree:save', async (...args) => {
      const result = await save(...args)
      control.__saveProbe!.saves += 1
      return result
    })

    const cleanup = handlers.get('tree:cleanup-attachments')
    if (cleanup === undefined) throw new Error('Cleanup handler is unavailable.')
    ipcMain.removeHandler('tree:cleanup-attachments')
    ipcMain.handle('tree:cleanup-attachments', async (...args) => {
      const start = performance.now()
      try {
        return await cleanup(...args)
      } finally {
        control.__saveProbe!.cleanupDurations.push(performance.now() - start)
      }
    })
  })
}

async function readProbe(app: Awaited<ReturnType<typeof launchTree>>['app']): Promise<SaveControl> {
  return app.evaluate(() => {
    const probe = (globalThis as typeof globalThis & { __saveProbe?: SaveControl }).__saveProbe
    return { saves: probe?.saves ?? 0, cleanupDurations: probe?.cleanupDurations ?? [] }
  })
}

test.describe('state and persistence work', () => {
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
    const wordCount = typed.split(/\s+/).filter((word) => word.length > 0).length

    console.log(
      `PERF ${JSON.stringify({
        kind: 'state',
        scenario: 'large-10000',
        structuralBurstMs: round(structuralBurstMs),
        typingMs: round(typingMs),
        saveCount,
        cleanupScanMs: round(cleanupScanMs),
      })}`,
    )

    expect(structuralBurstMs).toBeLessThan(2_000)
    expect(typingMs).toBeLessThan(1_000)
    expect(saveCount).toBeGreaterThan(0)
    expect(saveCount).toBeLessThanOrEqual(Math.ceil(wordCount / 10) + 2)
    expect(cleanupScanMs).toBeGreaterThan(0)
    expect(cleanupScanMs).toBeLessThan(1_000)
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

    console.log(
      `PERF ${JSON.stringify({
        kind: 'state',
        scenario: 'large-10000-attachment-history',
        historyMs: round(historyMs),
        saveCount,
        cleanupScanMs: round(cleanupScanMs),
      })}`,
    )

    expect(saveCount).toBeGreaterThan(0)
    expect(historyMs).toBeLessThan(5_000)
    expect(cleanupScanMs).toBeGreaterThan(0)
    expect(cleanupScanMs).toBeLessThan(1_000)
  })
})
