import { expect, launchTree, seedDocument, test, round } from './fixtures'
import { recordPerfResult } from '../results'

// @requirement PRODUCT.md §22.1
// @requirement PRODUCT.md §22.2
test('pending Tree save does not stall held Agenda navigation on 100000 nodes', async ({ userDataDir }) => {
  const date = new Date()
  const canonical = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  seedDocument(userDataDir, {
    document: {
      roots: Array.from({ length: 100000 }, (_, index) => ({
        id: `save-${index}`,
        text: `${canonical} Node ${index} ${'Wrapped navigation text. '.repeat(8)}`,
        children: [],
      })),
    },
    location: { currentParentId: null, selectedNodeId: 'save-0' },
  })
  const { app, window } = await launchTree(userDataDir, { initialMode: 'normal' })
  await app.evaluate(() => {
    const state = globalThis as typeof globalThis & { agendaSaveCount: number }
    state.agendaSaveCount = 0
    globalThis.__treeIpc.wrap('tree:save', async (original, ...args) => {
      const result = await original(...args)
      state.agendaSaveCount++
      return result
    })
  })

  await window.keyboard.type('10j10k')
  await window.keyboard.press('Meta+p')
  await window.locator('.agenda-row[data-node-id="save-0"]').first().click()
  await expect(window.getByRole('textbox', { name: 'Agenda node save-0', exact: true })).toBeFocused()
  await window.evaluate(
    () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
  )
  await window.evaluate(() => {
    const probe = { frames: [] as number[], ages: [] as number[], keys: 0, previous: 0, active: true }
    ;(window as unknown as { agendaSaveProbe: typeof probe }).agendaSaveProbe = probe
    const frame = (): void => {
      if (!probe.active) return
      const now = performance.now()
      if (probe.previous) probe.frames.push(now - probe.previous)
      probe.previous = now
      requestAnimationFrame(frame)
    }
    requestAnimationFrame(frame)
    document.addEventListener(
      'keydown',
      (event) => {
        if (probe.active && ['j', 'k'].includes(event.key)) {
          probe.keys++
          probe.ages.push(performance.now() - event.timeStamp)
        }
      },
      true,
    )
  })

  const sent = await app.evaluate(async ({ BrowserWindow }) => {
    const target = BrowserWindow.getAllWindows().find((window) =>
      window.webContents.getURL().includes('index.html'),
    )!.webContents
    let count = 0
    for (const keyCode of ['J', 'K', 'J', 'K']) {
      target.sendInputEvent({ type: 'keyDown', keyCode })
      count++
      const timer = setInterval(() => {
        target.sendInputEvent({ type: 'keyDown', keyCode, modifiers: ['isautorepeat'] })
        count++
      }, 1000 / 30)
      await new Promise((resolve) => setTimeout(resolve, 4000))
      clearInterval(timer)
      target.sendInputEvent({ type: 'keyUp', keyCode })
    }
    return count
  })
  const probe = await window.evaluate(() => {
    const probe = (
      window as unknown as { agendaSaveProbe: { frames: number[]; ages: number[]; keys: number; active: boolean } }
    ).agendaSaveProbe
    probe.active = false
    return probe
  })
  const saves = await app.evaluate(
    () => (globalThis as typeof globalThis & { agendaSaveCount: number }).agendaSaveCount,
  )
  const frames = probe.frames.toSorted((a, b) => a - b)
  const metrics = {
    frameP99Ms: round(frames[Math.floor(frames.length * 0.99)]!),
    frameMaxMs: round(frames.at(-1)!),
    inputAgeMaxMs: round(Math.max(...probe.ages)),
    sent,
    received: probe.keys,
    saves,
  }
  recordPerfResult({
    kind: 'state',
    scenario: 'agenda-100000-pending-tree-save-navigation',
    samples: frames.length,
    metrics,
  })

  expect(probe.keys).toBe(sent)
  expect(frames.length).toBeGreaterThan(100)
  expect(saves).toBe(1)
  expect(metrics.frameMaxMs).toBeLessThan(50)
  expect(metrics.inputAgeMaxMs).toBeLessThan(50)
})
