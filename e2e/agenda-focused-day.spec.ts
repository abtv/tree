// @editing-modes: both
import { writeFileSync } from 'node:fs'
import { dayNumberOf } from '../src/domain/calendar-date'
import {
  describeForEachEditingMode,
  expect,
  launchTree,
  seedDocument,
  setAgendaToday,
  setMainWindowContentSize,
  screenshotContentSize,
  test,
} from './fixtures'

const day = dayNumberOf({ year: 2026, month: 10, day: 14 })
const later = dayNumberOf({ year: 2026, month: 10, day: 20 })

describeForEachEditingMode('Focused Agenda day', ({ mode, screenshotName }) => {
  // @requirement PRODUCT.md §23.15
  test('keeps a selected heading outside the virtualized window at its original position', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: {
        roots: Array.from({ length: 600 }, (_, index) => ({
          id: `item-${index}`,
          text: `2026-10-14 Synthetic item ${index}`,
          children: [],
        })),
      },
      location: { currentParentId: null, selectedNodeId: 'item-0' },
    })
    const { window, app } = await launchTree(userDataDir)
    await setMainWindowContentSize(app, screenshotContentSize)
    await setAgendaToday(window)
    await window.keyboard.press('Meta+p')
    if (mode === 'vim') await window.keyboard.press('Escape')
    await window.locator(`[data-agenda-key="day:${day}"]`).click()
    await window.keyboard.press('Meta+.')
    const heading = window.locator('.agenda-focused-heading')
    await expect(heading).toBeFocused()
    await window.evaluate(() => {
      document.querySelector<HTMLElement>('.scroll-viewport')!.scrollTop = 8000
    })
    await expect(heading).toHaveClass(/agenda-row-pinned/u)
    expect(await window.locator('.agenda-row').count()).toBeLessThan(100)
    const offset = await heading.evaluate(
      (element) =>
        element.getBoundingClientRect().top - document.querySelector('.agenda-list')!.getBoundingClientRect().top,
    )
    expect(Math.abs(offset)).toBeLessThan(1)
    await expect(window).toHaveScreenshot(screenshotName('agenda-focused-windowed.png'))
    await window.keyboard.press(mode === 'vim' ? 'j' : 'ArrowDown')
    await expect(window.locator(`[data-agenda-key="node:${day}:item-0"] .node-input`)).toBeFocused()
    await window.keyboard.press('Meta+,')
    await expect(window.locator(`[data-agenda-key="day:${day}"]`)).toHaveAttribute('aria-selected', 'true')
  })

  // @requirement PRODUCT.md §23.15
  test('bounds navigation and restores timeline selection, scroll and folds', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: {
        roots: [
          ...Array.from({ length: 50 }, (_, index) => ({
            id: `item-${index}`,
            text: '2026-10-14 Synthetic item',
            children: [],
          })),
          { id: 'later', text: '2026-10-20 Later item', children: [] },
        ],
      },
      location: { currentParentId: null, selectedNodeId: 'item-0' },
    })
    const { window } = await launchTree(userDataDir)
    await setAgendaToday(window)
    await window.keyboard.press('Meta+p')
    if (mode === 'vim') await window.keyboard.press('Escape')
    await window.locator(`[data-agenda-key="day:${later}"]`).click()
    await window.keyboard.press('Meta+e')
    await expect(window.locator(`[data-agenda-key="node:${later}:later"]`)).toHaveCount(0)
    const header = window.locator(`[data-agenda-key="day:${day}"]`)
    await header.click()
    await window.evaluate(() => {
      document.querySelector<HTMLElement>('.scroll-viewport')!.scrollTop = 120
    })
    const scroll = await window.evaluate(() => document.querySelector<HTMLElement>('.scroll-viewport')!.scrollTop)
    await window.keyboard.press('Meta+.')
    await expect(window.locator('.agenda-focused-heading')).toHaveText('Wed Oct 14')
    await expect(window.locator('.agenda-location-bar')).toHaveText('Agenda/Oct 14')
    await expect(window.locator('.agenda-row-day')).toHaveCount(0)
    await expect(window.locator(`[data-agenda-key="day:${later}"]`)).toHaveCount(0)
    await window.keyboard.press(mode === 'vim' ? 'k' : 'ArrowUp')
    await expect(header).toHaveAttribute('aria-selected', 'true')
    if (mode === 'vim') await window.keyboard.press('G')
    else for (let index = 0; index < 52; index++) await window.keyboard.press('ArrowDown')
    await window.keyboard.press(mode === 'vim' ? 'j' : 'ArrowDown')
    await expect(window.locator('[aria-selected="true"][data-agenda-key]')).toHaveAttribute(
      'data-agenda-key',
      `node:${day}:item-49`,
    )
    if (mode === 'vim') {
      await window.keyboard.press('g')
      await window.keyboard.press('g')
    } else for (let index = 0; index < 52; index++) await window.keyboard.press('ArrowUp')
    await window.keyboard.press('Meta+e')
    await window.keyboard.press('Meta+,')
    await expect(window.locator('.agenda-focused-heading')).toHaveCount(0)
    await expect(header).toHaveAttribute('aria-selected', 'true')
    await expect(window.locator(`[data-agenda-key="node:${day}:item-0"]`)).toBeVisible()
    await expect(window.locator(`[data-agenda-key="node:${later}:later"]`)).toHaveCount(0)
    await expect
      .poll(() => window.evaluate(() => document.querySelector<HTMLElement>('.scroll-viewport')!.scrollTop))
      .toBe(scroll)
  })

  // @requirement PRODUCT.md §23.15
  test('follows a live date edit and creates from the focused heading', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: { roots: [{ id: 'item', text: '2026-10-14 Prepare 2026-10-20', children: [] }] },
      location: { currentParentId: null, selectedNodeId: 'item' },
    })
    const { window } = await launchTree(userDataDir)
    await setAgendaToday(window)
    await window.keyboard.press('Meta+p')
    await window.locator(`[data-agenda-key="day:${day}"]`).click()
    await window.keyboard.press('Meta+.')
    await window.locator(`[data-agenda-key="node:${day}:item"]`).click()
    if (mode === 'vim') await window.keyboard.press('i')
    await window.locator('.node-input').fill('Prepare 2026-10-20')
    await expect(window.locator('.agenda-focused-heading')).toHaveText('Tue Oct 20')
    await expect(window.locator(`[data-agenda-key="node:${later}:item"] .node-input`)).toBeFocused()
    await window.keyboard.press('Meta+,')
    await expect(window.locator('.agenda-focused-heading')).toHaveCount(0)
    await expect(window.locator('[data-agenda-key][aria-selected="true"]')).toHaveAttribute(
      'data-agenda-key',
      `day:${day - 3}`,
    )
    await window.locator(`[data-agenda-key="day:${later}"]`).click()
    await window.keyboard.press('Meta+.')
    if (mode === 'vim') {
      await window.keyboard.press('Escape')
      await window.keyboard.press('o')
    } else await window.keyboard.press('Enter')
    await expect(window.locator('.agenda-row[aria-selected="true"] .node-input')).toHaveText('2026-10-20 ')
    await expect(window.locator('.agenda-row[aria-selected="true"] .node-input')).toBeFocused()
  })

  // @requirement PRODUCT.md §23.15
  test('places its heading at the current-parent position in both appearances', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: {
        roots: [
          {
            id: 'scope',
            text: 'Team A',
            children: [
              {
                id: 'release',
                text: 'Release',
                children: [
                  { id: 'prepare', text: '2026-10-14 Prepare rollout 2026-10-20', children: [] },
                  { id: 'review', text: '2026-10-14 Review release notes', children: [] },
                ],
              },
            ],
          },
        ],
      },
      location: { currentParentId: 'scope', selectedNodeId: 'release' },
    })
    const { window, app } = await launchTree(userDataDir)
    await setMainWindowContentSize(app, screenshotContentSize)
    const treeHeading = await window.locator('.current-parent').boundingBox()
    await setAgendaToday(window)
    await window.keyboard.press('Meta+p')
    await window.locator(`[data-agenda-key="day:${day}"]`).click()
    await window.keyboard.press('Meta+.')
    const focusedHeading = await window.locator('.agenda-focused-heading').boundingBox()
    expect(Math.abs(focusedHeading!.x - treeHeading!.x)).toBeLessThan(1)
    expect(Math.abs(focusedHeading!.y - treeHeading!.y)).toBeLessThan(1)
    for (const appearance of ['light', 'dark'] as const) {
      await window.emulateMedia({ colorScheme: appearance })
      await expect(window).toHaveScreenshot(screenshotName(`agenda-focused-day-${appearance}.png`))
      const session = await window.context().newCDPSession(window)
      const frames: string[] = []
      const frameStages: { index: number; stage: string }[] = []
      let stage = 'focused-before'
      session.on('Page.screencastFrame', (frame: { data: string; sessionId: number }) => {
        frameStages.push({ index: frames.length, stage })
        frames.push(frame.data)
        void session.send('Page.screencastFrameAck', { sessionId: frame.sessionId })
      })
      await session.send('Page.startScreencast', { format: 'png', everyNthFrame: 1 })
      await expect.poll(() => frames.length).toBeGreaterThan(0)
      stage = 'returning'
      await window.keyboard.press('Meta+,')
      await expect(window.locator('.agenda-focused-heading')).toHaveCount(0)
      await window.evaluate(
        () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
      )
      stage = 'entering'
      await window.keyboard.press('Meta+.')
      await expect(window.locator('.agenda-focused-heading')).toBeVisible()
      await window.evaluate(
        () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
      )
      await session.send('Page.stopScreencast')
      await session.detach()
      expect(frames.length).toBeGreaterThan(0)
      frames.forEach((data, index) =>
        writeFileSync(test.info().outputPath(`transition-${appearance}-${index}.png`), Buffer.from(data, 'base64')),
      )
      writeFileSync(test.info().outputPath(`transition-${appearance}-stages.json`), JSON.stringify(frameStages))
    }
    if (mode === 'vim') {
      await window.keyboard.press('Escape')
      await window.keyboard.press('Control+o')
      await expect(window.locator('.agenda-focused-heading')).toHaveCount(0)
      await window.keyboard.press('g')
      await window.keyboard.press('d')
      await expect(window.locator('.agenda-focused-heading')).toHaveText('Wed Oct 14')
      await window.keyboard.press('O')
      await expect(window.locator('.agenda-focused-heading')).toHaveText('Tue Oct 13')
      await expect(window.locator('.node-input')).toHaveText('2026-10-13 ')
      await window.keyboard.press('Escape')
      await window.keyboard.press('g')
      await window.keyboard.press('d')
      await expect(window.locator('.agenda-list')).toHaveCount(0)
      await expect(window.locator('.current-parent .node-input')).toHaveText('2026-10-13 ')
    }
  })
})
