// @editing-modes: independent
import { rmSync } from 'node:fs'
import { join } from 'node:path'
import {
  closeApp,
  expect,
  launchTree,
  node,
  resetSharedApplication,
  test,
  typeInto,
  type Launched,
  type SharedApplication,
} from './fixtures'

test.describe.configure({ mode: 'default' })

function removeData(shared: SharedApplication): void {
  rmSync(join(shared.directory, 'data'), { recursive: true, force: true })
}

async function memorySample({ app, window }: Launched): Promise<unknown> {
  const session = await window.context().newCDPSession(window)
  try {
    const raw = await session.send('Runtime.getHeapUsage')
    await session.send('HeapProfiler.collectGarbage')
    const retained = await session.send('Runtime.getHeapUsage')
    const native = await app.evaluate(({ app, BrowserWindow, webContents, ipcMain }) => ({
      mainHeap: process.memoryUsage(),
      listeners: {
        appActivate: app.listenerCount('activate'),
        ipcChannels: ipcMain.eventNames().length,
        bounds: BrowserWindow.getAllWindows().map((main) => ({
          move: main.listenerCount('move'),
          resize: main.listenerCount('resize'),
          close: main.listenerCount('close'),
        })),
      },
      processes: app.getAppMetrics().map(({ type, memory }) => ({ type, ...memory })),
      windows: BrowserWindow.getAllWindows().length,
      renderers: webContents.getAllWebContents().filter((contents) => contents.getType() === 'window').length,
      pending: globalThis.__treeSharedTest?.pending() ?? 0,
      errors: globalThis.__treeSharedTest?.errors() ?? 0,
    }))

    expect(native.windows).toBe(1)
    expect(native.renderers).toBe(1)
    expect(native.processes.filter(({ type }) => type === 'Tab')).toHaveLength(1)
    expect(native.pending).toBe(0)
    expect(native.errors).toBe(0)

    return { raw, retained, native }
  } finally {
    await session.detach()
  }
}

const burstSize = Number(process.env['TREE_E2E_MEMORY_BURST_SIZE'] ?? 8)
if (!Number.isInteger(burstSize) || burstSize < 8 || burstSize > 128)
  throw new Error('Invalid memory measurement burst size.')

// ADR 0021 makes visible execution fresh. These measurements require hidden windows.
if (process.env['TREE_E2E_VISIBLE'] === '1') throw new Error('Memory measurements require hidden execution.')

test.describe('subsequent shared owner', () => {
  test.use({ sharedApplicationReset: 'reload' })

  test('measures successive edit/reset bursts after warm-up', async ({ userDataDir, sharedApplication }) => {
    test.setTimeout(300_000)
    const samples: unknown[] = []
    let launched = await launchTree(userDataDir)
    for (let burst = 0; burst < 12; burst += 1) {
      for (let cycle = 0; cycle < burstSize; cycle += 1) {
        await typeInto(node(launched.window, 1), `Synthetic burst ${burst} cycle ${cycle}`)
        await launched.window.keyboard.press('Enter')
        await typeInto(node(launched.window, 2), 'Synthetic second row')
        if (cycle === burstSize - 1) samples.push(await memorySample(launched))
        await resetSharedApplication(sharedApplication)
        removeData(sharedApplication)
        launched = await launchTree(userDataDir)
      }
    }
    test
      .info()
      .annotations.push({ type: 'tree-memory-evidence', description: JSON.stringify({ mode: 'shared', samples }) })
    await test
      .info()
      .attach('shared-memory.json', { body: JSON.stringify(samples, null, 2), contentType: 'application/json' })
  })
})

test('measures matched fresh edit bursts as memory controls', async ({ userDataDir }) => {
  test.setTimeout(600_000)
  const samples: unknown[] = []
  for (let burst = 0; burst < 12; burst += 1) {
    for (let cycle = 0; cycle < burstSize; cycle += 1) {
      const launched = await launchTree(userDataDir)
      await typeInto(node(launched.window, 1), `Synthetic burst ${burst} cycle ${cycle}`)
      await launched.window.keyboard.press('Enter')
      await typeInto(node(launched.window, 2), 'Synthetic second row')
      if (cycle === burstSize - 1) samples.push(await memorySample(launched))
      await closeApp(launched.app)
      rmSync(join(userDataDir, 'data'), { recursive: true, force: true })
    }
  }
  test
    .info()
    .annotations.push({ type: 'tree-memory-evidence', description: JSON.stringify({ mode: 'fresh', samples }) })
  await test
    .info()
    .attach('fresh-memory.json', { body: JSON.stringify(samples, null, 2), contentType: 'application/json' })
})
