import { agendaSeed, collectRendererHeap, expect, launchTree, round, seedDocument, test, wideSeed } from './fixtures'
import { recordPerfResult } from '../results'
import type { TreeNode } from '../../src/domain/document'

test('bounds repeated Agenda search and scrolling while retaining the draft', async ({ userDataDir }) => {
  seedDocument(userDataDir, agendaSeed(3000))
  const { window } = await launchTree(userDataDir, { initialMode: 'normal' })

  await window.keyboard.press('Meta+p')
  await window.keyboard.press('/')
  const prompt = window.getByRole('textbox', { name: 'Search', exact: true })

  await expect(prompt).toBeFocused()

  // Attribute the long scan to callback work versus scheduler wait, without production hooks.
  await window.evaluate(() => {
    const probe = { callbacks: 0, workMs: 0, maxWorkMs: 0 }
    ;(window as unknown as { searchTimers: typeof probe }).searchTimers = probe
    const browser = globalThis as unknown as Window
    const schedule = browser.setTimeout.bind(browser)
    browser.setTimeout = (handler, timeout, ...args) => {
      if (typeof handler !== 'function' || timeout !== 0) return schedule(handler, timeout, ...args)
      return schedule(() => {
        const start = performance.now()
        handler(...args)
        const elapsed = performance.now() - start
        probe.callbacks++
        probe.workMs += elapsed
        probe.maxWorkMs = Math.max(probe.maxWorkMs, elapsed)
      }, timeout)
    }
  })
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
    const observer = new MutationObserver(() => {
      if (!document.querySelector('[aria-label="Agenda node dated-2999"] .search-match-current')) return
      observer.disconnect()
      requestAnimationFrame(() => requestAnimationFrame(() => (probe.elapsed = performance.now() - probe.start)))
    })
    observer.observe(document.body, { subtree: true, childList: true, attributes: true })
  })
  const navigationStart = performance.now()

  await window.keyboard.press('Enter')

  await expect(
    window.getByRole('textbox', { name: 'Agenda node dated-2999', exact: true }).locator('.search-match-current'),
  ).toBeVisible()

  const navigationMs = performance.now() - navigationStart
  await window.waitForFunction(
    () => (window as unknown as { agendaSearchNavigation: { elapsed: number } }).agendaSearchNavigation.elapsed > 0,
  )
  const navigationPaintMs = await window.evaluate(
    () => (window as unknown as { agendaSearchNavigation: { elapsed: number } }).agendaSearchNavigation.elapsed,
  )
  const timers = await window.evaluate(
    () =>
      (window as unknown as { searchTimers: { callbacks: number; workMs: number; maxWorkMs: number } }).searchTimers,
  )
  const repeats: number[] = []
  await window.keyboard.press('Escape')
  for (const [key, count] of [
    ['n', '2 / 2'],
    ['N', '1 / 2'],
    ['n', '2 / 2'],
  ] as const) {
    const start = performance.now()

    await window.keyboard.press(key)

    await expect(window.locator('.search-count')).toHaveText(count)

    repeats.push(performance.now() - start)
  }

  recordPerfResult({
    kind: 'search',
    scenario: 'agenda-6000-occurrences',
    metrics: {
      resultMs: round(resultMs),
      navigationMs: round(navigationMs),
      navigationPaintMs: round(navigationPaintMs),
      scrollMs: round(scrollMs),
      repeatMaxMs: round(Math.max(...repeats)),
      timerCallbacks: timers.callbacks,
      timerWorkMs: round(timers.workMs),
      timerMaxWorkMs: round(timers.maxWorkMs),
    },
  })

  expect(resultMs).toBeLessThan(2000)
  expect(navigationMs).toBeLessThan(3000)
  expect(scrollMs).toBeLessThan(100)
  expect(Math.max(...repeats)).toBeLessThan(3000)
  expect(timers.maxWorkMs).toBeLessThan(50)
})

test('releases canceled scans across query refinement and presentation switches', async ({ userDataDir }) => {
  seedDocument(userDataDir, agendaSeed(3000))
  const { window } = await launchTree(userDataDir, { initialMode: 'normal', memoryProbe: true })
  const burst = async () => {
    for (let index = 0; index < 12; index++) {
      await window.keyboard.press('/')
      const prompt = window.getByRole('textbox', { name: 'Search', exact: true })

      await expect(prompt).toBeFocused()

      await prompt.fill(`absent ${index}`)
      await prompt.fill(`Item ${index}`)
      await window.keyboard.press('Escape')
      await window.keyboard.press('Meta+p')
    }

    await expect(window.locator('.search-count')).toHaveCount(0)
  }

  await burst()
  const warm = await collectRendererHeap(window)
  await burst()
  const middle = await collectRendererHeap(window)
  await burst()
  const final = await collectRendererHeap(window)
  recordPerfResult({
    kind: 'search',
    scenario: 'canceled-search-retention',
    metrics: { warmHeapBytes: warm, middleHeapBytes: middle, finalHeapBytes: final, retainedGrowthBytes: final - warm },
  })

  // A retained complete corpus per abandoned job would exceed this across both bursts.
  expect(final - warm).toBeLessThan(2_000_000)
  expect(final - middle).toBeLessThan(1_000_000)
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

  const editor = window.getByRole('textbox', { name: 'Node 10000', exact: true })
  await expect(editor.locator('.search-match-current')).toBeVisible()

  const navigationMs = performance.now() - jumpStart

  await editor.focus()
  await window.keyboard.press('0')
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

for (const shape of ['deep', 'long'] as const) {
  test(`bounds common, rare and absent search in a ${shape} Tree`, async ({ userDataDir }) => {
    let root: TreeNode = {
      id: 'target',
      text: `${'ordinary '.repeat(shape === 'long' ? 2500 : 1)}needle`,
      children: [],
    }
    if (shape === 'deep') {
      root = {
        id: 'level-18',
        text: 'ordinary branch',
        children: [
          root,
          ...Array.from({ length: 999 }, (_, index) => ({ id: `leaf-${index}`, text: 'ordinary leaf', children: [] })),
        ],
      }
      for (let depth = 17; depth >= 0; depth--)
        root = { id: `level-${depth}`, text: 'ordinary branch', children: [root] }
    }
    seedDocument(userDataDir, {
      document: { roots: [root] },
      location: { currentParentId: null, selectedNodeId: root.id },
    })
    const { window } = await launchTree(userDataDir, { initialMode: 'normal' })

    await window.keyboard.press('/')
    const prompt = window.getByRole('textbox', { name: 'Search', exact: true })

    await expect(prompt).toBeFocused()

    await prompt.evaluate((input) => {
      const paints: number[] = []
      ;(window as unknown as { searchShapePaints: number[] }).searchShapePaints = paints
      input.addEventListener('input', (event) => {
        requestAnimationFrame(() => requestAnimationFrame(() => paints.push(performance.now() - event.timeStamp)))
      })
    })
    const times: number[] = []
    for (const [query, total] of [
      ['a', '100+'],
      ['needle', '1'],
      ['absent phrase', '0'],
    ] as const) {
      const start = performance.now()

      await prompt.fill(query)

      await expect(window.locator('.search-count')).toHaveText(total)
      if (shape === 'long' && query === 'a') await expect(window.locator('.search-match')).toHaveCount(2500)

      times.push(performance.now() - start)
    }
    await window.waitForFunction(
      () => (window as unknown as { searchShapePaints: number[] }).searchShapePaints.length === 3,
    )
    const paintMaxMs = await window.evaluate(() =>
      Math.max(...(window as unknown as { searchShapePaints: number[] }).searchShapePaints),
    )

    await prompt.fill('needle')

    await expect(window.locator('.search-count')).toHaveText('1')

    const start = performance.now()

    await window.keyboard.press('Enter')

    await expect(window.locator('[data-node-id="target"] .search-match-current')).toBeVisible()
    await expect(prompt).toBeFocused()

    const revealMs = performance.now() - start

    recordPerfResult({
      kind: 'search',
      scenario: `${shape}-queries`,
      metrics: {
        commonMs: round(times[0]!),
        rareMs: round(times[1]!),
        absentMs: round(times[2]!),
        inputPaintMaxMs: round(paintMaxMs),
        revealMs: round(revealMs),
      },
    })

    expect(Math.max(...times)).toBeLessThan(1000)
    expect(paintMaxMs).toBeLessThan(100)
    expect(revealMs).toBeLessThan(1000)
  })
}
