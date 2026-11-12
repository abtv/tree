// @editing-modes: both
import type { Page } from '@playwright/test'
import {
  describeForEachEditingMode,
  expect,
  fireIdleSave,
  launchTree,
  readPersisted,
  seedDocument,
  setAgendaToday,
  setMainWindowContentSize,
  test,
} from './fixtures'

async function expectSeparatedDays(window: Page): Promise<void> {
  const gaps = await window.locator('.agenda-entry-separated').evaluateAll((entries) =>
    entries.map((entry) => {
      const separator = entry.querySelector('.agenda-day-separator')!.getBoundingClientRect()
      const heading = entry.querySelector('.agenda-row-day')!.getBoundingClientRect()
      return heading.top - separator.bottom
    }),
  )

  expect(gaps.length).toBeGreaterThan(0)
  for (const gap of gaps) expect(gap).toBeGreaterThan(0)
}

describeForEachEditingMode('Flat Agenda', ({ mode }) => {
  // @requirement PRODUCT.md §23.12
  test('mouse and touch holds cannot drag a dated node to another day', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: {
        roots: [
          { id: 'first', text: '2026-10-08 First', children: [] },
          { id: 'later', text: '2026-10-14 Later', children: [] },
        ],
      },
      location: { currentParentId: null, selectedNodeId: 'first' },
    })
    const { window } = await launchTree(userDataDir)
    await setAgendaToday(window)
    await window.keyboard.press('Meta+p')
    const original = readPersisted(userDataDir).document
    const source = (await window.locator('.agenda-row[data-node-id="first"]').boundingBox())!
    const target = (await window.locator('.agenda-row[data-node-id="later"]').boundingBox())!
    const from = { x: source.x + source.width - 16, y: source.y + source.height / 2 }
    const to = { x: target.x + target.width - 16, y: target.y + target.height / 2 }

    await window.mouse.move(from.x, from.y)
    await window.mouse.down()
    await window.waitForTimeout(250)
    await window.mouse.move(to.x, to.y, { steps: 5 })
    await expect(window.locator('.agenda-row-dragging, .agenda-row-drop-on')).toHaveCount(0)
    await window.mouse.up()

    const touch = await window.context().newCDPSession(window)
    try {
      await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...from, id: 1 }] })
      await window.waitForTimeout(250)
      await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...to, id: 1 }] })
      await expect(window.locator('.agenda-row-dragging, .agenda-row-drop-on')).toHaveCount(0)
      await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    } finally {
      await touch.detach()
    }
    await fireIdleSave(window)
    await window.evaluate(() =>
      (globalThis as typeof globalThis & { treeApi: { load(): Promise<unknown> } }).treeApi.load(),
    )

    expect(readPersisted(userDataDir).document).toEqual(original)
    await expect(window.locator('.agenda-row[data-node-id="first"]')).toHaveText('2026-10-08 First')
    await expect(window.locator('.agenda-row[data-node-id="later"]')).toHaveText('2026-10-14 Later')
  })

  // @requirement PRODUCT.md §23.1
  // @requirement PRODUCT.md §23.6
  test('opens a windowed oversized Today at its heading and leading entries', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: {
        roots: [
          ...Array.from({ length: 25 }, (_, index) => ({
            id: `before-${index}`,
            text: `2026-10-07 Earlier ${index}`,
            children: [],
          })),
          {
            id: 'large-today',
            text: 'Today context',
            children: Array.from({ length: 150 }, (_, index) => ({
              id: `today-${index}`,
              text: `2026-10-08 Today task ${index}`,
              children: [],
            })),
          },
          { id: 'later', text: '2026-10-09 Later', children: [] },
        ],
      },
      location: { currentParentId: null, selectedNodeId: 'before-0' },
    })
    const { window, app } = await launchTree(userDataDir, { shortcut: 'stub' })
    await setMainWindowContentSize(app, { width: 680, height: 620 })
    await setAgendaToday(window)
    await window.keyboard.press('Meta+p')

    await expect
      .poll(() =>
        window.evaluate(() => {
          const viewport = document.querySelector('.scroll-viewport')!.getBoundingClientRect()
          const heading = document.querySelector('.agenda-today')!.getBoundingClientRect()
          return Math.abs(heading.top - viewport.top - 25)
        }),
      )
      .toBeLessThan(2)
    await expect(window.getByRole('textbox', { name: 'Agenda node today-0', exact: true })).toBeInViewport()
    expect(await window.locator('.agenda-row').count()).toBeLessThan(100)
    await expect(window.locator('.agenda-today')).toHaveAttribute('aria-selected', 'true')
    await window.screenshot({ path: test.info().outputPath(`opening-oversized-${mode}.png`) })
  })

  for (const surroundingCount of [18, 160]) {
    test(`centers the complete Today block on opening and relinquishes scrolling to the user (${surroundingCount})`, async ({
      userDataDir,
    }) => {
      seedDocument(userDataDir, {
        document: {
          roots: [
            ...Array.from({ length: surroundingCount }, (_, index) => ({
              id: `before-${index}`,
              text: `2026-10-07 Earlier ${index}`,
              children: [],
            })),
            {
              id: 'today-context',
              text: 'A parent path with enough context to wrap in a narrower window',
              children: Array.from({ length: 6 }, (_, index) => ({
                id: `today-${index}`,
                text: `2026-10-08 Today task ${index}`,
                children: [],
              })),
            },
            ...Array.from({ length: surroundingCount }, (_, index) => ({
              id: `after-${index}`,
              text: `2026-10-09 Later ${index}`,
              children: [],
            })),
          ],
        },
        location: { currentParentId: null, selectedNodeId: 'before-0' },
      })
      const { window, app } = await launchTree(userDataDir, { shortcut: 'stub' })
      await setMainWindowContentSize(app, { width: 680, height: 620 })
      await setAgendaToday(window)
      await window.keyboard.press('Meta+p')
      const viewport = window.locator('.scroll-viewport')
      const today = window.locator('.agenda-today')

      await expect
        .poll(() =>
          window.evaluate(() => {
            const bounds = document.querySelector('.scroll-viewport')!.getBoundingClientRect()
            const heading = document.querySelector('.agenda-today')!.getBoundingClientRect()
            const end = document
              .querySelector('[data-node-id="today-5"]')!
              .closest('.agenda-entry')!
              .getBoundingClientRect()
            return Math.abs((heading.top + end.bottom) / 2 - (bounds.top + bounds.bottom) / 2)
          }),
        )
        .toBeLessThan(2)
      await expect(today).toHaveAttribute('aria-selected', 'true')
      await expect(window.getByRole('textbox', { name: 'Agenda node today-5' })).toBeInViewport()
      await window.screenshot({
        path: test.info().outputPath(`opening-centered-${surroundingCount}-${mode}.png`),
      })

      const original = await viewport.evaluate((element) => element.scrollTop)
      await viewport.hover()
      await window.mouse.wheel(0, 180)
      await expect.poll(() => viewport.evaluate((element) => element.scrollTop)).toBeGreaterThan(original + 100)
      const afterWheel = await viewport.evaluate((element) => element.scrollTop)
      await window.evaluate(async () => {
        dispatchEvent(new Event('resize'))
        await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
      })
      expect(await viewport.evaluate((element) => element.scrollTop)).toBe(afterWheel)
    })
  }

  test('retains the last dated entry until leaving it and then shows only the Today message', async ({
    userDataDir,
  }) => {
    seedDocument(userDataDir, {
      document: { roots: [{ id: 'only', text: '2026-12-20 Only entry', children: [] }] },
      location: { currentParentId: null, selectedNodeId: 'only' },
    })
    const { window, app } = await launchTree(userDataDir, { shortcut: 'stub' })
    await setMainWindowContentSize(app, { width: 980, height: 800 })
    await setAgendaToday(window)
    await window.keyboard.press('Meta+p')
    if (mode === 'vim') await window.keyboard.press('Escape')
    const todayMessage = window.locator('.agenda-row-day.agenda-today')
    await expect(todayMessage).toHaveText('No entries for today')
    await expect(todayMessage.locator('button')).toHaveCount(0)
    await expect(window.locator('.agenda-row-day')).toHaveCount(2)
    await expect(window.locator('.agenda-row-gap')).toHaveCount(0)
    await expectSeparatedDays(window)

    const input = window.getByRole('textbox', { name: 'Agenda node only' })
    await input.click()
    if (mode === 'vim') await window.keyboard.press('i')
    await window.keyboard.press('Meta+a')
    await window.keyboard.type('Undated')
    await expect(input).toHaveText('Undated')
    await expect(window.locator('.agenda-row-day')).toHaveCount(2)
    await todayMessage.click()
    await expect(input).toHaveCount(0)
    await expect(window.locator('.agenda-row-day')).toHaveCount(1)
    await expect(todayMessage).toHaveText('No entries for today')
    for (const appearance of ['light', 'dark'] as const) {
      await window.emulateMedia({ colorScheme: appearance })
      await window.screenshot({ path: test.info().outputPath(`empty-${appearance}-${mode}.png`) })
    }
    await window.keyboard.press('Meta+p')
    await expect(window.getByRole('textbox', { name: 'Node 1', exact: true })).toHaveValue('Undated')
  })

  test('windows wrapped path labels and retains the active editor across large scroll jumps', async ({
    userDataDir,
  }) => {
    seedDocument(userDataDir, {
      document: {
        roots: Array.from({ length: 180 }, (_, index) => ({
          id: `parent-${index}`,
          text: `Project ${index}: ${'Long synthetic context for a wrapping path label. '.repeat(3)}`,
          children: [{ id: `item-${index}`, text: `2026-10-08 Task ${index}`, children: [] }],
        })),
      },
      location: { currentParentId: null, selectedNodeId: 'parent-0' },
    })
    const { window, app } = await launchTree(userDataDir, { shortcut: 'stub' })
    await setMainWindowContentSize(app, { width: 680, height: 620 })
    await setAgendaToday(window)
    await window.keyboard.press('Meta+p')
    const viewport = window.locator('.scroll-viewport')
    await expect(window.getByRole('textbox', { name: 'Agenda node item-0' })).toBeInViewport()
    expect(await window.locator('.agenda-row').count()).toBeLessThan(100)

    await viewport.evaluate((element) => {
      element.scrollTo({ top: element.scrollHeight })
      // A pending geometry notification must not restore the opening Today position before scroll delivery.
      globalThis.dispatchEvent(new Event('resize'))
    })
    const last = window.getByRole('textbox', { name: 'Agenda node item-179' })
    await expect(last).toBeInViewport()
    await last.click()
    await viewport.evaluate((element) => element.scrollTo({ top: 0 }))
    await expect(window.getByRole('textbox', { name: 'Agenda node item-0' })).toBeInViewport()
    await expect(last).toHaveCount(1)
    await expect(last).toBeFocused()
    await expect(last.locator('xpath=ancestor::*[contains(@class,"agenda-entry")]')).toHaveClass(/agenda-row-pinned/)
    await viewport.evaluate((element) => element.scrollTo({ top: element.scrollHeight }))
    await expect(last).toBeInViewport()
    await window.screenshot({ path: test.info().outputPath(`windowed-${mode}.png`) })
  })

  test('shows passive paths, day folds and single-node editing in the real renderer', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: {
        roots: [
          {
            id: 'work',
            text: 'Work',
            children: [
              {
                id: 'tree',
                text: 'Tree',
                children: [
                  {
                    id: 'search',
                    text: 'Search',
                    children: [
                      { id: 'a', text: '2026-10-08 Improve result grouping', children: [] },
                      { id: 'b', text: '2026-10-08 Check keyboard navigation', children: [] },
                    ],
                  },
                  {
                    id: 'agenda',
                    text: 'Agenda',
                    children: [
                      { id: 'c', text: '2026-10-08 Flatten the list', children: [] },
                      { id: 'later', text: '2026-10-09 Review the updated layout', children: [] },
                    ],
                  },
                ],
              },
            ],
          },
          {
            id: 'personal',
            text: 'Personal',
            children: [
              {
                id: 'home',
                text: 'Home',
                children: [{ id: 'call', text: '2026-10-08 Call electrician', children: [] }],
              },
            ],
          },
          { id: 'root-note', text: '2026-10-08 A note at the top level', children: [] },
        ],
      },
      location: { currentParentId: null, selectedNodeId: 'work' },
    })
    const { window, app } = await launchTree(userDataDir, { shortcut: 'stub' })
    await setMainWindowContentSize(app, { width: 980, height: 800 })
    await setAgendaToday(window)
    await window.keyboard.press('Meta+p')
    if (mode === 'vim') await window.keyboard.press('Escape')
    const day = window.locator('.agenda-row-day.agenda-today')
    const first = window.getByRole('textbox', { name: 'Agenda node a' })

    await expect(day).toHaveAttribute('aria-current', 'date')
    await expect(day.locator('.agenda-label')).toHaveText('Thu Oct 8')
    await expect(day.locator('.agenda-today-badge')).toHaveText('Today')

    const alignment = await window.evaluate(() => {
      const heading = document.querySelector('.agenda-today .agenda-label')!
      const path = document.querySelector('.agenda-path-label')!
      const input = path.parentElement!.querySelector('.node-input')!
      return {
        heading: heading.getBoundingClientRect().left,
        path: path.getBoundingClientRect().left,
        input: input.getBoundingClientRect().left + Number.parseFloat(getComputedStyle(input).paddingLeft),
        headingToPath: path.getBoundingClientRect().top - heading.getBoundingClientRect().bottom,
        pathToInput: input.getBoundingClientRect().top - path.getBoundingClientRect().bottom,
      }
    })
    expect(alignment.path).toBeCloseTo(alignment.heading, 0)
    expect(alignment.input).toBeCloseTo(alignment.path, 0)
    expect(alignment.headingToPath).toBe(8)
    expect(alignment.pathToInput).toBe(4)

    await expect(window.locator('.agenda-row-day .agenda-rule')).toHaveCount(0)
    await expect(window.locator('.agenda-entry-day').first().locator('.agenda-day-separator')).toHaveCount(0)
    const followingDay = window.locator('.agenda-row-day').nth(1)
    const separator = await followingDay.locator('..').locator('.agenda-day-separator').boundingBox()
    const heading = await followingDay.boundingBox()
    expect(separator!.y + separator!.height).toBeLessThan(heading!.y)

    await expect(window.locator('.agenda-row-node')).toHaveCount(6)
    await expect(window.locator('.agenda-role-context')).toHaveCount(0)
    await expect(window.locator('.agenda-path-label')).toHaveText([
      'Work › Tree › Search',
      'Work › Tree › Agenda',
      'Personal › Home',
      'Work › Tree › Agenda',
    ])
    await expect(window.locator('.agenda-row-node .node-disclosure-triangle')).toHaveCount(0)
    const columns = await window
      .locator('.agenda-row-node')
      .evaluateAll((rows) => rows.map((row) => row.getBoundingClientRect().left))
    expect(new Set(columns).size).toBe(1)

    for (const appearance of ['light', 'dark'] as const) {
      await window.emulateMedia({ colorScheme: appearance })
      await window.screenshot({ path: test.info().outputPath(`preview-${appearance}-${mode}.png`) })
    }
    await day.locator('button').click()
    await expect(first).toHaveCount(0)
    await expectSeparatedDays(window)
    await day.locator('button').click()
    await first.click()
    await window.keyboard.press('Meta+e')
    await expect(window.locator('.agenda-row-node')).toHaveCount(6)
    if (mode === 'vim') {
      await window.keyboard.press('V')
      await expect(window.getByLabel('Vim mode')).toHaveText('NORMAL')
      await window.keyboard.press('o')
      await window.keyboard.press('O')
      await window.keyboard.type('dd')
      await expect(window.locator('.agenda-row-pending')).toHaveCount(0)
      await window.keyboard.press('i')
    }
    await window.keyboard.press('End')
    await window.keyboard.press('Enter')
    await expect.poll(() => first.textContent()).toBe('2026-10-08 Improve result grouping\n')
    await window.keyboard.type('More details')
    await expect.poll(() => first.textContent()).toBe('2026-10-08 Improve result grouping\nMore details')
    await expect(window.locator('.agenda-row-node')).toHaveCount(6)

    await day.click()
    await window.keyboard.press('Meta+.')
    await expect(window.locator('.agenda-focused-heading')).toBeVisible()
    await expect(window.locator('.agenda-path-label')).toHaveCount(3)
    await window.screenshot({ path: test.info().outputPath(`focused-${mode}.png`) })
  })
})
