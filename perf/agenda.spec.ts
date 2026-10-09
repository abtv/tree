import { agendaSeed, expect, launchTree, round, seedDocument, test } from './fixtures'
import { recordPerfResult } from './results'
import type { TreeApi } from '../src/shared/ipc'

// @requirement PRODUCT.md §22.1
test('Agenda typing keeps mounted rows bounded and stays within the interactive budget', async ({ userDataDir }) => {
  seedDocument(userDataDir, agendaSeed(3000))
  const { window } = await launchTree(userDataDir, { initialMode: 'normal' })
  await window.keyboard.press('Meta+p')
  await window.locator('.agenda-row[data-node-id="dated-0"]').first().click()
  const input = window.getByRole('textbox', { name: 'Agenda node dated-0', exact: true })
  await expect(input).toBeFocused()
  await window.keyboard.press('A')
  await window.evaluate(() => {
    const samples: number[] = []
    ;(window as unknown as { agendaTyping: number[] }).agendaTyping = samples
    document.addEventListener(
      'keydown',
      (event) => {
        if (event.key === 'a')
          requestAnimationFrame(() => requestAnimationFrame(() => samples.push(performance.now() - event.timeStamp)))
      },
      { capture: true },
    )
  })
  for (let index = 0; index < 30; index += 1) await window.keyboard.press('a')
  await window.waitForFunction(() => (window as unknown as { agendaTyping: number[] }).agendaTyping.length === 30)
  const samples = await window.evaluate(() =>
    (window as unknown as { agendaTyping: number[] }).agendaTyping.toSorted((a, b) => a - b),
  )
  recordPerfResult({
    kind: 'state',
    scenario: 'agenda-6000-occurrences-typing',
    samples: samples.length,
    metrics: { typingP95Ms: round(samples[28]!), typingMaxMs: round(samples[29]!) },
  })
  expect(samples[28]).toBeLessThan(100)
  expect(samples[29]).toBeLessThan(250)
  expect(await window.locator('.agenda-row').count()).toBeLessThan(100)
  await expect(input).toBeFocused()
})

test('Agenda open, scroll and vertical motion stay responsive on a large dated document', async ({ userDataDir }) => {
  seedDocument(userDataDir, agendaSeed(3000))
  const { window } = await launchTree(userDataDir, { initialMode: 'normal' })
  await window.evaluate(() => {
    const probe = { open: [] as number[], motion: [] as number[], saves: 0 }
    ;(window as unknown as { agendaProbe: typeof probe }).agendaProbe = probe
    const api = (globalThis as unknown as { treeApi: TreeApi }).treeApi
    const save = api.save
    api.save = (...args) => {
      probe.saves += 1
      return save(...args)
    }
    document.addEventListener(
      'keydown',
      (event) => {
        const samples =
          event.metaKey && event.key === 'p' ? probe.open : ['j', 'k'].includes(event.key) ? probe.motion : undefined
        if (samples !== undefined)
          requestAnimationFrame(() => requestAnimationFrame(() => samples.push(performance.now() - event.timeStamp)))
      },
      { capture: true },
    )
  })
  await window.keyboard.press('Meta+p')
  await expect(window.getByRole('grid', { name: 'Agenda timeline' })).toBeVisible()
  await expect(window.locator('.agenda-row[aria-selected="true"]')).toBeFocused()
  await window.waitForFunction(
    () => (window as unknown as { agendaProbe: { open: number[] } }).agendaProbe.open.length === 1,
  )
  const scroll = await window.evaluate(async () => {
    const viewport = document.querySelector<HTMLElement>('.scroll-viewport')!
    const start = performance.now()
    viewport.scrollTop = viewport.scrollHeight / 2
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
    const elapsed = performance.now() - start
    viewport.scrollTop = 0
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
    return elapsed
  })
  for (let index = 0; index < 20; index += 1) await window.keyboard.press('j')
  for (let index = 0; index < 20; index += 1) await window.keyboard.press('k')
  await window.waitForFunction(
    () => (window as unknown as { agendaProbe: { motion: number[] } }).agendaProbe.motion.length === 40,
  )
  const probe = await window.evaluate(
    () => (window as unknown as { agendaProbe: { open: number[]; motion: number[]; saves: number } }).agendaProbe,
  )
  const sorted = probe.motion.toSorted((a, b) => a - b)
  recordPerfResult({
    kind: 'state',
    scenario: 'agenda-6000-occurrences',
    samples: sorted.length,
    metrics: {
      openPaintMs: round(probe.open[0]!),
      scrollPaintMs: round(scroll),
      motionP95Ms: round(sorted[38]!),
      motionMaxMs: round(sorted[39]!),
      saves: probe.saves,
    },
  })
  expect(probe.open[0]).toBeLessThan(1000)
  expect(scroll).toBeLessThan(250)
  expect(sorted[38]).toBeLessThan(100)
  expect(sorted[39]).toBeLessThan(250)
  expect(probe.saves).toBe(0)
  expect(await window.locator('.agenda-row').count()).toBeLessThan(100)
  await expect(window.locator('.agenda-row[aria-selected="true"]')).toBeFocused()
})
