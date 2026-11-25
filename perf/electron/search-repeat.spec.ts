import type { ElectronApplication, Page } from '@playwright/test'
import { recordPerfResult } from '../results'
import { expect, launchTree, round, seedDocument, test } from './fixtures'

const steps = 48
const intervalMs = 16

async function measureHold(app: ElectronApplication, page: Page, backwards: boolean) {
  // Arm before sending input. Observe the actual highlighted row, including moves
  // that complete after keyup. The two final frames are a presentation proxy.
  const result = await page.evaluateHandle(
    ({ backwards, steps }) => {
      const inputs: number[] = []
      const rows: string[] = []
      const times: number[] = []
      const sample = { inputs, times, rows, repeats: 0, release: -1, finalFrame: -1 }
      const currentRow = () =>
        document.querySelector('.search-match-current')?.closest<HTMLElement>('[data-node-id]')?.dataset.nodeId
      let previous = currentRow()
      const key = backwards ? 'N' : 'n'
      function keydown(event: KeyboardEvent) {
        if (event.key !== key) return
        inputs.push(event.timeStamp)
        if (event.repeat) sample.repeats++
      }
      function keyup(event: KeyboardEvent) {
        if (event.key === key) sample.release = event.timeStamp
      }
      const observer = new MutationObserver(() => {
        const current = currentRow()
        if (!current || current === previous) return
        previous = current
        rows.push(current)
        times.push(performance.now())
        if (rows.length === steps) {
          requestAnimationFrame(() => requestAnimationFrame(() => (sample.finalFrame = performance.now())))
        }
      })
      document.addEventListener('keydown', keydown, true)
      document.addEventListener('keyup', keyup, true)
      observer.observe(document.querySelector('.scroll-viewport')!, {
        childList: true,
        attributes: true,
        subtree: true,
      })
      return {
        sample,
        stop() {
          observer.disconnect()
          document.removeEventListener('keydown', keydown, true)
          document.removeEventListener('keyup', keyup, true)
        },
      }
    },
    { backwards, steps },
  )

  // The producer runs in Electron's main process independently of renderer work.
  const durationMs = await app.evaluate(
    async ({ BrowserWindow }, { backwards, steps, intervalMs }) => {
      const contents = BrowserWindow.getAllWindows()[0]!.webContents
      const modifiers: ('shift' | 'isautorepeat')[] = backwards ? ['shift'] : []
      const start = performance.now()
      for (let index = 0; index < steps; index++) {
        contents.sendInputEvent({ type: 'keyDown', keyCode: 'N', modifiers })
        if (index === 0) modifiers.push('isautorepeat')
        await new Promise<void>((resolve) => setTimeout(resolve, intervalMs))
      }
      contents.sendInputEvent({ type: 'keyUp', keyCode: 'N', modifiers: backwards ? ['shift'] : [] })
      return performance.now() - start
    },
    { backwards, steps, intervalMs },
  )
  await page.waitForFunction(({ sample }) => sample.release >= 0 && sample.finalFrame >= 0, result)
  const { rows, times, inputs, repeats, release, finalFrame } = await result.evaluate((probe) => {
    probe.stop()
    return probe.sample
  })
  await result.dispose()

  expect(inputs).toHaveLength(steps)
  expect(repeats).toBe(steps - 1)
  expect(rows).toEqual(Array.from({ length: steps }, (_, index) => String(backwards ? steps - index : index + 2)))
  const delays = times.map((time, index) => time - inputs[index]!).sort((a, b) => a - b)
  return {
    sendIntervalMs: round(durationMs / steps),
    highlightP95Ms: round(delays[Math.ceil(steps * 0.95) - 1]!),
    afterReleaseMs: round(Math.max(0, times.at(-1)! - release)),
    lastInputToTwoFramesMs: round(finalFrame - inputs.at(-1)!),
  }
}

for (const matches of [80, 5000]) {
  test(`held n and N after /a with ${matches} matches across 5000 rows`, async ({ userDataDir }) => {
    const roots = Array.from({ length: 5000 }, (_, index) => ({
      id: String(index),
      text: `${index < matches ? 'a' : 'x'} item ${index}: review open issues, confirm owners, collect notes, then record the next steps before closing.`,
      children: [],
    }))
    seedDocument(userDataDir, { document: { roots }, location: { currentParentId: null, selectedNodeId: '0' } })
    const { app, window } = await launchTree(userDataDir, { initialMode: 'normal' })

    await window.keyboard.press('/')
    const prompt = window.getByRole('textbox', { name: 'Search', exact: true })
    await expect(prompt).toBeFocused()
    await prompt.fill('a')
    await expect(window.locator('.search-count')).toHaveText(matches === 80 ? '80' : '100+')
    await prompt.press('Enter')
    await expect(window.locator('[data-node-id="1"] .search-match-current')).toBeVisible()
    await expect(window.locator('[data-node-id="1"] .node-input')).toBeFocused()

    for (const backwards of [false, true]) {
      const metrics = await measureHold(app, window, backwards)
      recordPerfResult({
        kind: 'search',
        scenario: `hold-${backwards ? 'reverse' : 'forward'}-${matches}`,
        samples: steps,
        metrics,
      })
      expect(metrics.sendIntervalMs).toBeLessThan(25)
      expect(metrics.highlightP95Ms).toBeLessThan(120)
      expect(metrics.afterReleaseMs).toBeLessThan(100)
      await expect(window.locator(`[data-node-id="${backwards ? 1 : steps + 1}"] .node-input`)).toBeFocused()
    }
  })
}

// @requirement PRODUCT.md §22.2
test('keeps repeated matches responsive within one densely highlighted row', async ({ userDataDir }) => {
  const text = 'alpha rollout brief '.repeat(2500)
  seedDocument(userDataDir, {
    document: { roots: [{ id: 'long', text, children: [] }] },
    location: { currentParentId: null, selectedNodeId: 'long' },
  })
  const { app, window } = await launchTree(userDataDir, { initialMode: 'normal' })
  const input = window.getByRole('textbox', { name: 'Node 1', exact: true })
  await window.keyboard.press('/')
  const prompt = window.getByRole('textbox', { name: 'Search', exact: true })
  await prompt.fill('alpha')
  await expect(input.locator('.search-match')).toHaveCount(2500)
  await prompt.press('Enter')
  await expect(input).toBeFocused()
  const ordinal = () =>
    input.evaluate(
      (element) =>
        [...element.querySelectorAll('.search-match')].findIndex((span) =>
          span.classList.contains('search-match-current'),
        ) + 1,
    )
  await expect.poll(ordinal).toBe(2)

  const probe = await window.evaluateHandle(() => {
    const samples: number[] = []
    const observe = (event: KeyboardEvent): void => {
      if (event.key === 'n')
        requestAnimationFrame(() => requestAnimationFrame(() => samples.push(performance.now() - event.timeStamp)))
    }
    document.addEventListener('keydown', observe, true)
    return { samples, stop: () => document.removeEventListener('keydown', observe, true) }
  })
  const inputs = 40
  const duration = await app.evaluate(
    async ({ BrowserWindow }, { inputs, intervalMs }) => {
      const contents = BrowserWindow.getAllWindows()[0]!.webContents
      const start = performance.now()
      for (let index = 0; index < inputs; index++) {
        contents.sendInputEvent({ type: 'keyDown', keyCode: 'N' })
        contents.sendInputEvent({ type: 'keyUp', keyCode: 'N' })
        await new Promise((resolve) => setTimeout(resolve, intervalMs))
      }
      return performance.now() - start
    },
    { inputs, intervalMs },
  )

  await expect.poll(ordinal).toBe(2 + inputs)
  await window.waitForFunction(({ samples }) => samples.length === 40, probe)
  const samples = await probe.evaluate(({ samples, stop }) => {
    stop()
    return samples.toSorted((left, right) => left - right)
  })
  await probe.dispose()
  await expect(input).toBeFocused()
  await expect(input).toHaveText(text)
  const metrics = {
    sendIntervalMs: round(duration / inputs),
    twoFrameP95Ms: round(samples[Math.ceil(samples.length * 0.95) - 1]!),
  }
  recordPerfResult({ kind: 'search', scenario: 'repeat-within-2500-hits', samples: inputs, metrics })
  expect(metrics.sendIntervalMs).toBeLessThan(25)
  expect(metrics.twoFrameP95Ms).toBeLessThan(110)
})
