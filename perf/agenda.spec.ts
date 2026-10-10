import { agendaSeed, expect, launchTree, round, seedDocument, test } from './fixtures'
import { recordPerfResult } from './results'

type LaunchedApp = Awaited<ReturnType<typeof launchTree>>['app']

/** Counts `tree:save` calls in the main process; the renderer's `treeApi` object cannot be patched. */
async function installSaveProbe(app: LaunchedApp): Promise<void> {
  await app.evaluate(() => {
    const control = globalThis as typeof globalThis & { __agendaSaves?: number }
    control.__agendaSaves = 0
    globalThis.__treeIpc.wrap('tree:save', async (original, ...args) => {
      const result = await original(...args)
      control.__agendaSaves! += 1
      return result
    })
  })
}

async function readSaves(app: LaunchedApp): Promise<number> {
  return app.evaluate(() => (globalThis as typeof globalThis & { __agendaSaves?: number }).__agendaSaves ?? 0)
}

// @requirement PRODUCT.md §22.1
// @requirement PRODUCT.md §23.14
test('Agenda Visual navigation stays responsive with bounded mounted rows and no saves', async ({ userDataDir }) => {
  seedDocument(userDataDir, agendaSeed(3000))
  const { app, window } = await launchTree(userDataDir, { initialMode: 'normal' })
  await installSaveProbe(app)
  await window.keyboard.press('Meta+p')
  await window.locator('.agenda-row[data-node-id="dated-0"]').first().click()
  await window.keyboard.press('V')
  await window.evaluate(() => {
    const probe = { motion: [] as number[] }
    ;(window as unknown as { agendaVisualProbe: typeof probe }).agendaVisualProbe = probe
    document.addEventListener(
      'keydown',
      (event) => {
        if (['j', 'k'].includes(event.key))
          requestAnimationFrame(() =>
            requestAnimationFrame(() => probe.motion.push(performance.now() - event.timeStamp)),
          )
      },
      { capture: true },
    )
  })
  for (let index = 0; index < 20; index += 1) await window.keyboard.press('j')
  for (let index = 0; index < 20; index += 1) await window.keyboard.press('k')
  await window.waitForFunction(
    () => (window as unknown as { agendaVisualProbe: { motion: number[] } }).agendaVisualProbe.motion.length === 40,
  )
  const probe = await window.evaluate(
    () => (window as unknown as { agendaVisualProbe: { motion: number[] } }).agendaVisualProbe,
  )
  const saves = await readSaves(app)
  const sorted = probe.motion.toSorted((a, b) => a - b)
  recordPerfResult({
    kind: 'state',
    scenario: 'agenda-6000-occurrences-visual-navigation',
    samples: sorted.length,
    metrics: { motionP95Ms: round(sorted[38]!), motionMaxMs: round(sorted[39]!), saves },
  })
  expect(sorted[38]).toBeLessThan(100)
  expect(sorted[39]).toBeLessThan(250)
  expect(saves).toBe(0)
  expect(await window.locator('.agenda-row').count()).toBeLessThan(100)
  await expect(window.getByRole('textbox', { name: 'Agenda node dated-0', exact: true })).toBeFocused()
})

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

// @requirement PRODUCT.md §22.1
test('Agenda keystrokes that change date recognition stay within the interactive budget and save rarely', async ({
  userDataDir,
}) => {
  seedDocument(userDataDir, agendaSeed(3000))
  const { app, window } = await launchTree(userDataDir, { initialMode: 'normal' })
  await installSaveProbe(app)
  await window.keyboard.press('Meta+p')
  await window.locator('.agenda-row[data-node-id="dated-0"]').first().click()
  const input = window.getByRole('textbox', { name: 'Agenda node dated-0', exact: true })
  await expect(input).toBeFocused()
  await window.keyboard.press('A')
  await window.evaluate(() => {
    const samples: number[] = []
    ;(window as unknown as { agendaDateEdit: number[] }).agendaDateEdit = samples
    let completedDate = false
    document.addEventListener(
      'keydown',
      (event) => {
        // `5` completes 2099-01-05 and the next Backspace breaks it again: both change the days the node appears under.
        const changesDate = event.key === '5' || (event.key === 'Backspace' && completedDate)
        completedDate = event.key === '5'
        if (changesDate)
          requestAnimationFrame(() => requestAnimationFrame(() => samples.push(performance.now() - event.timeStamp)))
      },
      { capture: true },
    )
  })
  for (let round = 0; round < 15; round += 1) {
    await window.keyboard.type('2099-01-05')
    for (let index = 0; index < 10; index += 1) await window.keyboard.press('Backspace')
  }
  await window.waitForFunction(() => (window as unknown as { agendaDateEdit: number[] }).agendaDateEdit.length === 30)
  const samples = await window.evaluate(() =>
    (window as unknown as { agendaDateEdit: number[] }).agendaDateEdit.toSorted((a, b) => a - b),
  )
  const saves = await readSaves(app)
  recordPerfResult({
    kind: 'state',
    scenario: 'agenda-6000-occurrences-date-edit',
    samples: samples.length,
    metrics: { dateEditP95Ms: round(samples[28]!), dateEditMaxMs: round(samples[29]!), saves },
  })
  expect(samples[28]).toBeLessThan(100)
  expect(samples[29]).toBeLessThan(250)
  // Recognition changes must not save per keystroke: 150 keystrokes make no more than a handful of saves.
  expect(saves).toBeLessThan(10)
  expect(await window.locator('.agenda-row').count()).toBeLessThan(100)
  await expect(input).toBeFocused()
})

// @requirement PRODUCT.md §22.1
test('Agenda mirror updates keep focus and stay within the interactive budget', async ({ userDataDir }) => {
  seedDocument(userDataDir, agendaSeed(3000, true))
  const { window } = await launchTree(userDataDir, { initialMode: 'normal' })
  await window.keyboard.press('Meta+p')
  const occurrences = window.locator('.agenda-row[data-node-id="pair"]')
  await expect(occurrences).toHaveCount(2)
  await occurrences.first().click()
  const input = window.getByRole('textbox', { name: 'Agenda node pair', exact: true })
  await expect(input).toBeFocused()
  await window.keyboard.press('A')
  await window.evaluate(() => {
    const samples: number[] = []
    ;(window as unknown as { agendaMirror: number[] }).agendaMirror = samples
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
  await window.waitForFunction(() => (window as unknown as { agendaMirror: number[] }).agendaMirror.length === 30)
  const samples = await window.evaluate(() =>
    (window as unknown as { agendaMirror: number[] }).agendaMirror.toSorted((a, b) => a - b),
  )
  recordPerfResult({
    kind: 'state',
    scenario: 'agenda-6000-occurrences-mirror-update',
    samples: samples.length,
    metrics: { mirrorP95Ms: round(samples[28]!), mirrorMaxMs: round(samples[29]!) },
  })
  expect(samples[28]).toBeLessThan(100)
  expect(samples[29]).toBeLessThan(250)
  // Both occurrences show the typed text while the active one keeps focus.
  await expect(occurrences).toHaveCount(2)
  await expect(occurrences.nth(1)).toContainText('a'.repeat(30))
  await expect(input).toBeFocused()
  expect(await window.locator('.agenda-row').count()).toBeLessThan(100)
})

// @requirement PRODUCT.md §22.1
// @requirement PRODUCT.md §23.14
test('Agenda group move of a Visual selection completes within budget as one save and one Undo', async ({
  userDataDir,
}) => {
  seedDocument(userDataDir, agendaSeed(3000))
  const { app, window } = await launchTree(userDataDir, { initialMode: 'normal' })
  await installSaveProbe(app)
  await window.keyboard.press('Meta+p')
  await window.locator('.agenda-row[data-node-id="dated-0"]').first().click()
  await window.keyboard.press('V')
  await window.keyboard.type('99j')
  await window.keyboard.press('d')
  await expect(window.locator('.agenda-row-pending').first()).toBeVisible()
  await window.evaluate(() => {
    const probe = { move: [] as number[], undo: [] as number[] }
    ;(window as unknown as { agendaMove: typeof probe }).agendaMove = probe
    document.addEventListener(
      'keydown',
      (event) => {
        const samples = event.key === 'p' ? probe.move : event.key === 'u' ? probe.undo : undefined
        if (samples !== undefined)
          requestAnimationFrame(() => requestAnimationFrame(() => samples.push(performance.now() - event.timeStamp)))
      },
      { capture: true },
    )
  })
  // The last row belongs to the later day, so `p` there moves the marked nodes onto it.
  await window.keyboard.press('G')
  await window.keyboard.press('p')
  await window.waitForFunction(
    () => (window as unknown as { agendaMove: { move: number[] } }).agendaMove.move.length === 1,
  )
  await expect(window.locator('.agenda-row-pending')).toHaveCount(0)
  // A cancelled move would never save, so a save here shows that the dates were changed.
  await expect.poll(() => readSaves(app), { timeout: 20000 }).toBeGreaterThanOrEqual(1)
  await window.keyboard.press('Escape')
  await window.keyboard.press('u')
  await window.waitForFunction(
    () => (window as unknown as { agendaMove: { undo: number[] } }).agendaMove.undo.length === 1,
  )
  await expect.poll(() => readSaves(app), { timeout: 20000 }).toBeGreaterThanOrEqual(2)
  const probe = await window.evaluate(
    () => (window as unknown as { agendaMove: { move: number[]; undo: number[] } }).agendaMove,
  )
  const saves = await readSaves(app)
  recordPerfResult({
    kind: 'state',
    scenario: 'agenda-6000-occurrences-group-move',
    samples: 2,
    metrics: { moveMs: round(probe.move[0]!), undoMs: round(probe.undo[0]!), saves },
  })
  expect(probe.move[0]).toBeLessThan(1000)
  expect(probe.undo[0]).toBeLessThan(1000)
  // One save for the move and one for its Undo at most; a per-node save would reach one hundred.
  expect(saves).toBeLessThanOrEqual(2)
  expect(await window.locator('.agenda-row').count()).toBeLessThan(100)
})

test('Agenda open, scroll and vertical motion stay responsive on a large dated document', async ({ userDataDir }) => {
  seedDocument(userDataDir, agendaSeed(3000))
  const { app, window } = await launchTree(userDataDir, { initialMode: 'normal' })
  await installSaveProbe(app)
  await window.evaluate(() => {
    const probe = { open: [] as number[], motion: [] as number[] }
    ;(window as unknown as { agendaProbe: typeof probe }).agendaProbe = probe
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
    () => (window as unknown as { agendaProbe: { open: number[]; motion: number[] } }).agendaProbe,
  )
  const saves = await readSaves(app)
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
      saves,
    },
  })
  expect(probe.open[0]).toBeLessThan(1000)
  expect(scroll).toBeLessThan(250)
  expect(sorted[38]).toBeLessThan(100)
  expect(sorted[39]).toBeLessThan(250)
  expect(saves).toBe(0)
  expect(await window.locator('.agenda-row').count()).toBeLessThan(100)
  await expect(window.locator('.agenda-row[aria-selected="true"]')).toBeFocused()
})
