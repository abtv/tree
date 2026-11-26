import { writeFileSync } from 'node:fs'
import { expect, launchTree, round, seedDocument, setCalendarDate, test } from './fixtures'
import { recordPerfResult } from '../results'

interface MotionSample {
  delay: number
  processing: number
  feedback: number
}

// @requirement PRODUCT.md §22.2
// @requirement PRODUCT.md §23.4
test('held Vim vertical motions remain responsive across 4,000 Overdue rows', async ({ userDataDir }, info) => {
  seedDocument(userDataDir, {
    document: {
      roots: Array.from({ length: 4_000 }, (_, index) => ({
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
  await window.keyboard.press('Meta+p')
  await expect(window.locator('.agenda-list-windowed')).toBeVisible()
  await window.keyboard.type('gg')
  await expect(window.locator('.agenda-label-overdue')).toHaveText('Overdue')
  await window.keyboard.press('j')
  const first = window.getByRole('textbox', { name: 'Agenda node overdue-0', exact: true })
  await expect(first).toBeFocused()

  await window.evaluate(() => {
    const samples: Record<string, MotionSample[]> = {}
    const started = new WeakMap<KeyboardEvent, { time: number; sample: MotionSample }>()
    Object.assign(globalThis, { agendaVerticalSamples: samples })
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
      const destination = key === 'j' ? samplesPerBurst : key === 'J' ? samplesPerBurst * 10 : 0
      await expect(
        window.getByRole('textbox', { name: `Agenda node overdue-${destination}`, exact: true }),
      ).toBeFocused()
      if (iteration === 2 && (key === 'J' || key === 'K'))
        await window.screenshot({ path: info.outputPath(`${key}.png`) })
    }
  }

  await window.waitForFunction(() => {
    const { agendaVerticalSamples } = globalThis as unknown as { agendaVerticalSamples: Record<string, MotionSample[]> }
    return Object.values(agendaVerticalSamples).every((samples) => samples.every(({ feedback }) => feedback > 0))
  })
  const samples = await window.evaluate(
    () => (globalThis as unknown as { agendaVerticalSamples: Record<string, MotionSample[]> }).agendaVerticalSamples,
  )
  writeFileSync(info.outputPath('vertical-samples.json'), JSON.stringify(samples, null, 2))

  const p95 = (values: number[]): number => round(values.sort((a, b) => a - b)[Math.ceil(values.length * 0.95) - 1]!)
  for (const [key, series] of Object.entries(samples)) {
    expect(series).toHaveLength(samplesPerBurst * 3)
    expect(series.every(({ processing }) => processing > 0)).toBe(true)
    const p95ProcessingMs = p95(series.map(({ processing }) => processing))
    recordPerfResult({
      kind: 'state',
      scenario: `agenda-overdue-vertical-${key === key.toUpperCase() ? 'fast-' : ''}${key.toLowerCase()}`,
      samples: series.length,
      metrics: {
        p95InputDelayMs: p95(series.map(({ delay }) => delay)),
        p95ProcessingMs,
        p95TwoRafMs: p95(series.map(({ feedback }) => feedback)),
      },
    })
    // Keep a margin for rendering during 16 ms repeat, with room for machine-to-machine variation.
    expect.soft(p95ProcessingMs, key).toBeLessThan(7)
  }
})
