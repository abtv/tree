import { agendaSeed, expect, launchTree, round, seedDocument, test, wideSeed } from './fixtures'
import { recordPerfResult } from '../results'

test('bounds repeated Agenda search and scrolling while retaining the draft', async ({ userDataDir }) => {
  seedDocument(userDataDir, agendaSeed(3000))
  const { window } = await launchTree(userDataDir, { initialMode: 'normal' })
  await window.keyboard.press('Meta+p')
  await window.keyboard.press('/')
  const prompt = window.getByRole('textbox', { name: 'Search', exact: true })
  await expect(prompt).toBeFocused()
  const start = performance.now()
  await prompt.fill('Item 2999')
  await expect(window.locator('.search-count')).toHaveText('2')
  const resultMs = performance.now() - start
  const scrollMs = await window.evaluate(async () => {
    const start = performance.now()
    document.querySelector('.scroll-viewport')!.scrollTop = 100_000
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
    return performance.now() - start
  })
  await expect(prompt).toBeFocused()
  expect(await window.locator('.agenda-row').count()).toBeLessThan(100)
  await window.evaluate(() => {
    const probe = { start: 0, elapsed: 0 }
    ;(window as unknown as { agendaSearchNavigation: typeof probe }).agendaSearchNavigation = probe
    document.addEventListener(
      'keydown',
      (event) => {
        if (event.key === 'Enter') probe.start = event.timeStamp
      },
      { capture: true },
    )
    document.addEventListener('focusin', (event) => {
      if (event.target instanceof HTMLElement && event.target.getAttribute('aria-label') === 'Agenda node dated-2999')
        requestAnimationFrame(() => requestAnimationFrame(() => (probe.elapsed = performance.now() - probe.start)))
    })
  })
  const navigationStart = performance.now()
  await window.keyboard.press('Enter')
  await expect(window.getByRole('textbox', { name: 'Agenda node dated-2999', exact: true })).toBeFocused()
  const navigationMs = performance.now() - navigationStart
  await window.waitForFunction(
    () => (window as unknown as { agendaSearchNavigation: { elapsed: number } }).agendaSearchNavigation.elapsed > 0,
  )
  const navigationPaintMs = await window.evaluate(
    () => (window as unknown as { agendaSearchNavigation: { elapsed: number } }).agendaSearchNavigation.elapsed,
  )
  recordPerfResult({
    kind: 'search',
    scenario: 'agenda-6000-occurrences',
    metrics: {
      resultMs: round(resultMs),
      navigationMs: round(navigationMs),
      navigationPaintMs: round(navigationPaintMs),
      scrollMs: round(scrollMs),
    },
  })
  expect(resultMs).toBeLessThan(2000)
  expect(navigationMs).toBeLessThan(3000)
  expect(scrollMs).toBeLessThan(100)
})

test('keeps draft input and current results responsive across a wide Tree', async ({ userDataDir }) => {
  seedDocument(userDataDir, wideSeed(10_000))
  const { window } = await launchTree(userDataDir, { initialMode: 'normal' })
  await window.keyboard.press('/')
  const prompt = window.getByRole('textbox', { name: 'Search', exact: true })
  await prompt.evaluate((input) => {
    const samples: number[] = []
    ;(window as unknown as { searchPaints: number[] }).searchPaints = samples
    input.addEventListener('input', (event) => {
      requestAnimationFrame(() => requestAnimationFrame(() => samples.push(performance.now() - event.timeStamp)))
    })
  })
  const start = performance.now()
  await prompt.pressSequentially('Child 9999')
  await expect(window.locator('.search-count')).toHaveText('1')
  const resultMs = performance.now() - start
  await window.waitForFunction(() => (window as unknown as { searchPaints: number[] }).searchPaints.length === 10)
  const samples = await window.evaluate(() =>
    (window as unknown as { searchPaints: number[] }).searchPaints.sort((a, b) => a - b),
  )
  const maximum = samples.at(-1)!
  const jumpStart = performance.now()
  await window.keyboard.press('Enter')
  await expect(window.getByRole('textbox', { name: 'Node 10000', exact: true })).toBeFocused()
  const navigationMs = performance.now() - jumpStart
  await window.keyboard.press('i')
  const editStart = performance.now()
  await window.keyboard.type('x'.repeat(104))
  await expect(window.locator('.search-count')).toHaveText('1')
  const editMs = performance.now() - editStart
  recordPerfResult({
    kind: 'search',
    scenario: 'wide-10000',
    metrics: {
      resultMs: round(resultMs),
      inputPaintMaxMs: round(maximum),
      navigationMs: round(navigationMs),
      editMs: round(editMs),
    },
  })
  expect(maximum).toBeLessThan(100)
  expect(resultMs).toBeLessThan(1000)
  expect(navigationMs).toBeLessThan(1000)
  expect(editMs).toBeLessThan(1000)
})
