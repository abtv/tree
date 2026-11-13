import { expect, launchTree, round, seedDocument, test, wideSeed } from './fixtures'
import { recordPerfResult } from '../results'

// @requirement PRODUCT.md §22.1
test('native typing preserves responsiveness in a long decorated row', async ({ userDataDir }) => {
  const initial = 'A synthetic 2026-11-13 note. '.repeat(1900).slice(0, 50000)
  const seed = wideSeed(500)
  ;(seed.document as { roots: { children: { text: string }[] }[] }).roots[0]!.children[0]!.text = initial
  seedDocument(userDataDir, seed)
  const { app, window } = await launchTree(userDataDir, { initialMode: 'normal' })
  const input = window.getByRole('textbox', { name: 'Node 1', exact: true })
  await input.focus()
  await window.keyboard.press('A')

  await expect(input).toBeFocused()
  await expect(input).toHaveText(initial)

  await input.evaluate((element) => {
    const paints: number[] = []
    const probe = { paints, offscreenFeedback: 0 }
    ;(window as unknown as { richTypingProbe: typeof probe }).richTypingProbe = probe
    element.addEventListener('input', (event) => {
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          paints.push(performance.now() - event.timeStamp)
          // This sequence appends at the end. Losing the bottom of the input loses its caret too.
          const bottom = element.getBoundingClientRect().bottom
          if (bottom < 0 || bottom > globalThis.innerHeight) probe.offscreenFeedback++
        }),
      )
    })
  })

  // Main-process delivery does not wait for renderer completion, so stalls cannot throttle the burst.
  await app.evaluate(async ({ BrowserWindow }) => {
    const target = BrowserWindow.getAllWindows().find((win) => win.webContents.getURL().includes('index.html'))!
    for (let index = 0; index < 120; index++) {
      target.webContents.sendInputEvent({ type: 'char', keyCode: 'x' })
      await new Promise((resolve) => setTimeout(resolve, 16))
    }
  })
  await window.waitForFunction(
    () => (window as unknown as { richTypingProbe: { paints: number[] } }).richTypingProbe.paints.length === 120,
  )
  const probe = await window.evaluate(
    () => (window as unknown as { richTypingProbe: { paints: number[]; offscreenFeedback: number } }).richTypingProbe,
  )
  const samples = probe.paints.toSorted((a, b) => a - b)

  await expect(input).toHaveText(initial + 'x'.repeat(120))
  await expect(input).toBeFocused()
  await expect(window.getByRole('textbox', { name: 'Current parent', exact: true })).toHaveValue('Root')

  const metrics = {
    twoRafP95Ms: round(samples[114]!),
    twoRafMaxMs: round(samples[119]!),
    offscreenFeedback: probe.offscreenFeedback,
  }
  recordPerfResult({ kind: 'typing', scenario: 'rich-row-50000', samples: samples.length, metrics })

  // Scheduling proxies, not physical presentation. Original p95 was 161–318 ms on the same machine;
  // preserving equivalent native DOM measured 31–32 ms across three independent launches.
  expect(metrics.twoRafP95Ms).toBeLessThan(50)
  expect(metrics.twoRafMaxMs).toBeLessThan(100)
  expect(probe.offscreenFeedback).toBe(0)
})
