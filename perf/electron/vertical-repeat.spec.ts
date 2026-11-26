import { writeFileSync } from 'node:fs'
import { expect, launchTree, round, seedDocument, setCalendarDate, test } from './fixtures'
import { recordPerfResult } from '../results'

interface MotionSample {
  delay: number
  processing: number
  feedback: number
}

// @requirement PRODUCT.md §22.2
// @requirement PRODUCT.md §20.2.9
// @requirement PRODUCT.md §23.4
for (const { view, size, start, scenario, processingBudgetMs } of [
  { view: 'Agenda', size: 4_000, start: 0, scenario: 'agenda-overdue-vertical', processingBudgetMs: 7 },
  { view: 'Agenda', size: 40_000, start: 39_500, scenario: 'agenda-overdue-vertical-tail', processingBudgetMs: 7 },
  { view: 'Tree', size: 100_000, start: 99_500, scenario: 'tree-vertical-tail', processingBudgetMs: 10 },
]) {
  test(`held Vim vertical motions remain responsive at row ${start} of ${size} in ${view}`, async ({
    userDataDir,
  }, info) => {
    seedDocument(userDataDir, {
      document: {
        roots: Array.from({ length: size }, (_, index) => ({
          id: `overdue-${index}`,
          text: `2026-11-08 Review task ${index}`,
          children: [],
        })),
      },
      location: { currentParentId: null, selectedNodeId: 'overdue-0' },
    })
    const { app, window } = await launchTree(userDataDir, { initialMode: 'normal' })
    await setCalendarDate(window, new Date(2026, 10, 16, 12))
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.focus())
    if (view === 'Agenda') await window.keyboard.press('Meta+p')
    const list = view === 'Agenda' ? 'agenda-list' : 'node-list'
    const row = view === 'Agenda' ? 'agenda-row' : 'node-row'
    const editor = (index: number) => window.locator(`.${row}[data-node-id="overdue-${index}"] .node-input`)
    await expect(window.locator(`.${list}-windowed`)).toBeVisible()
    await window.keyboard.type(`${start + (view === 'Agenda' ? 2 : 1)}G`)
    await expect(editor(start)).toBeFocused()

    await window.evaluate(() => {
      const samples: Record<string, MotionSample[]> = {}
      const started = new WeakMap<KeyboardEvent, { time: number; sample: MotionSample }>()
      Object.assign(globalThis, { verticalMotionSamples: samples })
      document.addEventListener(
        'keydown',
        (event) => {
          if (!event.isTrusted || !['j', 'k', 'J', 'K'].includes(event.key)) return
          const start = performance.now()
          const sample = { delay: start - event.timeStamp, processing: 0, feedback: 0 }
          ;(samples[event.key] ??= []).push(sample)
          started.set(event, { time: start, sample })
          requestAnimationFrame(() =>
            requestAnimationFrame(() => {
              sample.feedback = performance.now() - event.timeStamp
            }),
          )
        },
        true,
      )
      globalThis.addEventListener('keydown', (event) => {
        const marker = started.get(event)
        if (marker !== undefined) marker.sample.processing = performance.now() - marker.time
      })
    })

    const samplesPerBurst = 40
    const interval = 16
    for (let iteration = 0; iteration < 3; iteration += 1) {
      for (const key of ['j', 'k', 'J', 'K']) {
        // Send repeat events from the main process so renderer delays cannot slow the producer.
        const duration = await app.evaluate(
          async ({ BrowserWindow }, { key, interval, samplesPerBurst }) => {
            const contents = BrowserWindow.getAllWindows()[0]!.webContents
            const keyCode = key.toUpperCase()
            const shift = key === keyCode
            const modifiers = shift ? (['shift'] as const) : []
            const started = performance.now()
            let count = 0
            await new Promise<void>((done) => {
              const timer = setInterval(() => {
                contents.sendInputEvent({
                  type: 'keyDown',
                  keyCode,
                  modifiers: count === 0 ? [...modifiers] : [...modifiers, 'isautorepeat'],
                })
                if (++count === samplesPerBurst) {
                  clearInterval(timer)
                  done()
                }
              }, interval)
            })
            contents.sendInputEvent({ type: 'keyUp', keyCode, modifiers: [...modifiers] })
            return performance.now() - started
          },
          { key, interval, samplesPerBurst },
        )
        expect(duration).toBeLessThan(samplesPerBurst * (interval + 5))
        const destination = start + (key === 'j' ? samplesPerBurst : key === 'J' ? samplesPerBurst * 10 : 0)
        await expect(editor(destination)).toBeFocused()
        if (iteration === 2 && (key === 'J' || key === 'K'))
          await window.screenshot({ path: info.outputPath(`${key}.png`) })
      }
    }

    await window.waitForFunction(() => {
      const { verticalMotionSamples } = globalThis as unknown as {
        verticalMotionSamples: Record<string, MotionSample[]>
      }
      return Object.values(verticalMotionSamples).every((samples) => samples.every(({ feedback }) => feedback > 0))
    })
    const samples = await window.evaluate(
      () => (globalThis as unknown as { verticalMotionSamples: Record<string, MotionSample[]> }).verticalMotionSamples,
    )
    writeFileSync(info.outputPath('vertical-samples.json'), JSON.stringify(samples, null, 2))

    const p95 = (values: number[]): number => round(values.sort((a, b) => a - b)[Math.ceil(values.length * 0.95) - 1]!)
    for (const [key, series] of Object.entries(samples)) {
      expect(series).toHaveLength(samplesPerBurst * 3)
      expect(series.every(({ processing }) => processing > 0)).toBe(true)
      const p95ProcessingMs = p95(series.map(({ processing }) => processing))
      const p95TwoRafMs = p95(series.map(({ feedback }) => feedback))
      recordPerfResult({
        kind: 'state',
        scenario: `${scenario}-${key === key.toUpperCase() ? 'fast-' : ''}${key.toLowerCase()}`,
        samples: series.length,
        metrics: {
          p95InputDelayMs: p95(series.map(({ delay }) => delay)),
          p95ProcessingMs,
          p95TwoRafMs,
        },
      })
      // Keep a margin for rendering during 16 ms repeat, with room for machine-to-machine variation.
      expect.soft(p95ProcessingMs, key).toBeLessThan(processingBudgetMs)
      if (start > 0) expect.soft(p95TwoRafMs, key).toBeLessThan(60)
    }
  })
}
