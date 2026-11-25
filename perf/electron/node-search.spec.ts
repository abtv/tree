import { expect, launchTree, seedDocument, test } from './fixtures'
import { recordPerfResult } from '../results'

for (const script of ['ASCII', 'Cyrillic'] as const) {
  // @requirement PRODUCT.md §20.14.3
  test(`completes an absent ${script} query across a large mixed-length document`, async ({ userDataDir }) => {
    const cyrillic = script === 'Cyrillic'
    seedDocument(userDataDir, {
      document: {
        roots: Array.from({ length: 200 }, (_, root) => ({
          id: `r${root}`,
          text: cyrillic ? `Группа проектов ${root}` : `Project group ${root}`,
          children: Array.from({ length: 250 }, (_, child) => {
            const index = root * 250 + child
            const date = index % 4 === 0 ? '2026-11-11' : ''
            const detail = cyrillic
              ? 'план выпуска и открытые задачи для проверки. '
              : 'the synthetic release plan and open tasks. '
            return {
              id: `n${index}`,
              text: `${cyrillic ? 'Проект' : 'Project'} ${index} ${date} ${cyrillic ? 'Обзор #работа' : 'Review #work'} ${detail.repeat(index % 7 === 0 ? 8 : 2)}`,
              children: [],
            }
          }),
        })),
      },
      location: { currentParentId: 'r0', selectedNodeId: 'n1' },
    })
    const { window } = await launchTree(userDataDir)
    await window.keyboard.press('Meta+;')
    const input = window.getByRole('searchbox')
    await expect(input).toBeFocused()
    const start = performance.now()

    await input.fill(cyrillic ? 'отсутствует' : 'zzabsent')

    await expect(window.getByText('No results', { exact: true })).toBeVisible({ timeout: 15_000 })
    const completeMs = performance.now() - start
    await expect(input).toBeFocused()
    recordPerfResult({
      kind: 'node-search',
      scenario: `absent-${script.toLowerCase()}-50200-mixed-length`,
      samples: 1,
      metrics: { completeMs },
    })

    expect(completeMs).toBeLessThan(5000)
  })
}

// @requirement PRODUCT.md §20.14
test('complete-document search keeps rendered results bounded and accepts fresh input', async ({ userDataDir }) => {
  seedDocument(userDataDir, {
    document: {
      roots: [
        {
          id: 'parent',
          text: 'Parent',
          children: Array.from({ length: 10_000 }, (_, i) => ({
            id: `n${i}`,
            text: `Needle ${i} #work`,
            children: [],
          })),
        },
      ],
    },
    location: { currentParentId: null, selectedNodeId: 'parent' },
  })
  const { window } = await launchTree(userDataDir)
  await window.keyboard.press('Meta+;')
  const input = window.getByRole('searchbox')
  await expect(input).toBeFocused()
  const start = performance.now()
  await input.fill('Needle')
  await expect(window.locator('.recent-node-row[aria-selected="true"]')).toContainText('Needle 0')
  const completeMs = performance.now() - start
  expect(await window.getByRole('option').count()).toBeLessThanOrEqual(40)
  await window.keyboard.press('ArrowUp')
  await expect(window.locator('.recent-node-group-path[aria-selected="true"]')).toHaveText('Parent')
  await window.keyboard.press('ArrowUp')
  await expect(window.locator('[role="option"][aria-selected="true"]')).toContainText('Needle 9999')
  await window.keyboard.press('ArrowDown')
  await window.keyboard.press('ArrowDown')
  const arrowPaint = await input.evaluate(async (element) => {
    const samples: number[] = []
    for (let step = 0; step < 24; step++) {
      const start = performance.now()
      element.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }))
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
      samples.push(performance.now() - start)
    }
    samples.sort((a, b) => a - b)
    return { p95Ms: samples[Math.floor(samples.length * 0.95)]!, maxMs: samples.at(-1)! }
  })
  await expect(window.locator('[role="option"][aria-selected="true"]')).toContainText('Needle 24')
  const scroll = await window.locator('.node-search-results').evaluate(async (element) => {
    const maximum = element.scrollHeight - element.clientHeight
    const frames: number[] = []
    let mountedMax = 0
    let previous = await new Promise<number>((resolve) => requestAnimationFrame(resolve))
    for (let step = 0; step < 60; step++) {
      const fraction = (step % 30) / 29
      element.scrollTop = maximum * (step < 30 ? fraction : 1 - fraction)
      const now = await new Promise<number>((resolve) => requestAnimationFrame(resolve))
      frames.push(now - previous)
      previous = now
      mountedMax = Math.max(mountedMax, element.querySelectorAll('[role="option"]').length)
    }
    frames.sort((a, b) => a - b)
    return { p95Ms: frames[Math.floor(frames.length * 0.95)]!, maxMs: frames.at(-1)!, mountedMax }
  })
  const paintMs = await input.evaluate(async (element) => {
    const start = performance.now()
    const input = element as HTMLInputElement
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    setter.call(input, 'missing')
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
    return performance.now() - start
  })
  await expect(window.getByText('No results', { exact: true })).toBeVisible()
  const shortCompleteMs: number[] = []
  for (const query of ['N', 'Ne']) {
    const start = performance.now()
    await input.fill(query)
    await expect(window.getByRole('listbox', { name: 'Search results' })).toHaveAttribute('aria-busy', 'false')
    await expect(window.getByLabel('Result position')).toHaveText('1 / 10000')
    await expect(window.locator('.recent-node-row[aria-selected="true"]')).toContainText('Needle 0')
    shortCompleteMs.push(performance.now() - start)
    expect(await window.getByRole('option').count()).toBeLessThanOrEqual(40)
    await expect(input).toBeFocused()
  }
  await expect(window.locator('[data-node-id="parent"] .node-input')).toHaveValue('Parent')
  await window.screenshot({ path: 'test-results/search-short-query-scale.png' })
  recordPerfResult({
    kind: 'node-search',
    scenario: 'wide-10000-results',
    samples: 1,
    metrics: {
      completeMs,
      shortQueryMaxCompleteMs: Math.max(...shortCompleteMs),
      paintMs,
      arrowPaintP95Ms: arrowPaint.p95Ms,
      arrowPaintMaxMs: arrowPaint.maxMs,
      scrollFrameP95Ms: scroll.p95Ms,
      scrollFrameMaxMs: scroll.maxMs,
      scrollMountedMax: scroll.mountedMax,
    },
  })
  expect(completeMs).toBeLessThan(2000)
  expect(Math.max(...shortCompleteMs)).toBeLessThan(2000)
  expect(paintMs).toBeLessThan(150)
  expect(arrowPaint.p95Ms).toBeLessThan(80)
  expect(scroll.p95Ms).toBeLessThan(50)
  expect(scroll.maxMs).toBeLessThan(100)
  expect(scroll.mountedMax).toBeLessThanOrEqual(40)
})

// @requirement PRODUCT.md §20.14
test('keeps full multiline result navigation and late-match reveal responsive', async ({ userDataDir }) => {
  const longText = `${'Context before the match\n'.repeat(120)}Needle at the end`
  const count = 10_000
  seedDocument(userDataDir, {
    document: {
      roots: Array.from({ length: count }, (_, index) => ({
        id: `n${index}`,
        text: index % 10 === 0 ? longText : `Needle ${index} ${'wrapped text '.repeat(index % 4)}`,
        children: [],
      })),
    },
    location: { currentParentId: null, selectedNodeId: 'n0' },
  })
  const { window } = await launchTree(userDataDir)
  await window.keyboard.press('Meta+;')
  const input = window.getByRole('searchbox')
  await expect(input).toBeFocused()
  const start = performance.now()
  await input.fill('Needle')
  const list = window.getByRole('listbox', { name: 'Search results' })
  await expect(window.getByLabel('Result position')).toHaveText(`1 / ${count}`)
  await expect
    .poll(() =>
      list.evaluate((element) => {
        const match = element.querySelector('[aria-selected="true"] .node-search-match')?.getBoundingClientRect()
        const bounds = element.getBoundingClientRect()
        return match !== undefined && match.top >= bounds.top && match.bottom <= bounds.bottom
      }),
    )
    .toBe(true)
  const completeMs = performance.now() - start
  const navigationStart = performance.now()
  for (let index = 0; index < 24; index++) {
    await window.keyboard.press('ArrowDown')
    await expect(window.getByLabel('Result position')).toHaveText(`${index + 2} / ${count}`)
  }
  const navigationMs = performance.now() - navigationStart
  await expect(input).toBeFocused()
  expect(await list.getByRole('option').count()).toBeLessThanOrEqual(40)
  await expect(window.locator('[data-node-id="n0"] .node-input')).toHaveValue(longText)
  recordPerfResult({
    kind: 'node-search',
    scenario: 'mixed-10000-full-text',
    samples: 24,
    metrics: { completeMs, navigationMs },
  })
  expect(completeMs).toBeLessThan(2000)
  expect(navigationMs).toBeLessThan(3000)
})
