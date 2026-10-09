// @editing-modes: both
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { Locator } from '@playwright/test'
import type { TreeNode } from '../src/domain/document'
import {
  describeForEachEditingMode,
  expect,
  launchTree,
  readPersisted,
  screenshotContentSize,
  seedDocument,
  setAgendaToday,
  setMainWindowContentSize,
  test,
} from './fixtures'

async function expectFocused(row: Locator): Promise<void> {
  await expect
    .poll(() =>
      row.evaluate(
        (element) =>
          element === document.activeElement || element.querySelector('.node-input') === document.activeElement,
      ),
    )
    .toBe(true)
}

const node = (id: string, text: string, children: TreeNode[] = []): TreeNode => ({ id, text, children })
const leaf = (id: string, text: string) => ({ id, text, children: [] })
function seed(userDataDir: string): void {
  seedDocument(userDataDir, {
    document: {
      roots: [
        node('work', 'Work', [
          node('team', 'Team A', [
            node('release', 'Release', [
              leaf('prepare', '2026-10-14 Prepare rollout 2026-10-20'),
              leaf('later', '2026-11-01 Review'),
            ]),
          ]),
        ]),
        leaf('outside', '2026-09-01 Outside'),
        leaf('invalid', '2026-02-31 Invalid 2026-10-1 Incomplete'),
      ],
    },
    location: { currentParentId: null, selectedNodeId: 'work' },
  })
}

describeForEachEditingMode('Agenda timeline', ({ mode, screenshotName }) => {
  // @requirement PRODUCT.md §23.6
  test('windows occurrences while keeping distant selection focused through scrolling, resizing and folding', async ({
    userDataDir,
  }) => {
    seedDocument(userDataDir, {
      document: {
        roots: Array.from({ length: 600 }, (_, index) =>
          leaf(
            `dated-${index}`,
            `2026-10-08 Item ${index} 2026-10-14 ${'Synthetic wrapping details. '.repeat(index % 3 === 0 ? 8 : 1)}`,
          ),
        ),
      },
      location: { currentParentId: null, selectedNodeId: 'dated-0' },
    })
    const { window, app } = await launchTree(userDataDir)
    await setMainWindowContentSize(app, screenshotContentSize)
    await setAgendaToday(window)
    await window.keyboard.press('Meta+p')
    const selected = window.locator('.agenda-row[aria-selected="true"]')
    await expectFocused(selected)
    await expect(window.locator('.agenda-list-spacer')).toHaveCount(2)
    expect(await window.locator('.agenda-row').count()).toBeLessThan(100)
    await window.keyboard.press('Escape')
    if (mode === 'vim') await window.keyboard.press('G')
    else {
      await window.keyboard.press('Meta+e')
      await window.keyboard.press('ArrowDown')
      await window.keyboard.press('ArrowDown')
      await window.keyboard.press('ArrowDown')
      await window.keyboard.press('Meta+e')
      await window.keyboard.press('ArrowUp')
      await window.keyboard.press('ArrowUp')
      await window.keyboard.press('ArrowUp')
      await window.keyboard.press('Meta+e')
    }
    await expectFocused(selected)
    const key = await selected.getAttribute('data-agenda-key')
    await selected.evaluate((element) => {
      ;(globalThis as unknown as { selectedAgendaElement: Element }).selectedAgendaElement = element
    })
    await window.evaluate(() => {
      document.querySelector<HTMLElement>('.scroll-viewport')!.scrollTop = 8000
    })
    await expect(selected).toHaveClass(/agenda-row-pinned/u)
    await expectFocused(selected)
    await expect
      .poll(() =>
        selected.evaluate(
          (element) => element === (globalThis as unknown as { selectedAgendaElement: Element }).selectedAgendaElement,
        ),
      )
      .toBe(true)
    expect(await window.locator('.agenda-row').count()).toBeLessThan(100)
    await setMainWindowContentSize(app, { width: 650, height: 600 })
    await expect(selected).toHaveAttribute('data-agenda-key', key!)
    await expectFocused(selected)
    if (mode === 'vim') {
      await window.keyboard.press('g')
      await window.keyboard.press('g')
    } else {
      await window.evaluate(() => {
        document.querySelector<HTMLElement>('.scroll-viewport')!.scrollTop = 0
      })
      await window.locator('.agenda-row-day').filter({ hasText: 'TODAY' }).click()
    }
    const today = window.locator('.agenda-row-day').filter({ hasText: 'TODAY' })
    await today.click()
    await window.keyboard.press('Meta+e')
    await expectFocused(today)
    await window.keyboard.press('Meta+e')
    await expectFocused(today)
    expect(await window.locator('.agenda-row').count()).toBeLessThan(100)
    await window.keyboard.press('ArrowDown')
    await expect(selected).toHaveAttribute('data-node-id', 'dated-0')
    await expectFocused(selected)
    const neighbor = window.locator('.agenda-row[data-node-id="dated-1"]').first()
    await expect
      .poll(async () => {
        const bottom = await selected.evaluate((element) => element.getBoundingClientRect().bottom)
        const top = await neighbor.evaluate((element) => element.getBoundingClientRect().top)
        return Math.abs(top - bottom)
      })
      .toBeLessThan(1)
    await window.keyboard.press('ArrowDown')
    await expectFocused(neighbor)
    await window.keyboard.press('ArrowUp')
    await expect(selected).toHaveAttribute('data-node-id', 'dated-0')
    // The native overlay scrollbar fades independently of renderer state and window focus.
    await window.evaluate(() => {
      document.styleSheets[0]!.insertRule('.scroll-viewport::-webkit-scrollbar { display: none; }')
    })
    for (const appearance of ['light', 'dark'] as const) {
      await window.emulateMedia({ colorScheme: appearance })
      await window.mouse.move(600, 20)
      await expect(window).toHaveScreenshot(screenshotName(`agenda-windowed-${appearance}.png`))
    }
  })
  // @requirement PRODUCT.md §23.5
  test('folds occurrences and reveals gaps through pointer and keyboard without changing Tree folds', async ({
    userDataDir,
  }) => {
    seed(userDataDir)
    const { window, app } = await launchTree(userDataDir)
    await setMainWindowContentSize(app, screenshotContentSize)
    await window.getByRole('button', { name: 'Expand node 1', exact: true }).click()
    await expect.poll(() => readPersisted(userDataDir).view?.expandedIds, { timeout: 20_000 }).toContain('work')
    const persisted = readPersisted(userDataDir)
    await setAgendaToday(window)
    await window.keyboard.press('Meta+p')
    const work = window.locator('.agenda-row[data-node-id="work"]').first()
    const prepare = window.locator('.agenda-row[data-node-id="prepare"]').first()
    await prepare.click()
    await work.getByRole('button').click()
    await expectFocused(work)
    await expect(work.getByRole('button')).toHaveAttribute('aria-expanded', 'false')
    await expect(window.locator('.agenda-row[data-node-id="prepare"]')).toHaveCount(1)
    await window.keyboard.press('Meta+e')
    await expect(work.getByRole('button')).toHaveAttribute('aria-expanded', 'true')
    await expect(window.locator('.agenda-row[data-node-id="prepare"]')).toHaveCount(2)
    const day = window.locator('.agenda-row-day').filter({ hasText: 'Wed Oct 14' })
    await day.click()
    await window.keyboard.press('Meta+e')
    await expectFocused(day)
    await expect(day.getByRole('button')).toHaveAttribute('aria-expanded', 'false')
    await day.getByRole('button').click()
    await expect(day.getByRole('button')).toHaveAttribute('aria-expanded', 'true')
    if (mode === 'vim') {
      await window.keyboard.press('Escape')
      await window.keyboard.type('za')
      await expect(day.getByRole('button')).toHaveAttribute('aria-expanded', 'false')
      await window.keyboard.type('za')
    }
    await prepare.click()
    // Folding the other occurrence must leave this row selected and focused.
    await window.locator('.agenda-row[data-node-id="work"]').nth(1).getByRole('button').click()
    await expectFocused(prepare)
    await expect(prepare).toHaveAttribute('aria-selected', 'true')
    const gap = window.locator('.agenda-row-gap').filter({ hasText: '11 empty days · Oct 21 – Oct 31' })
    await gap.click()
    await window.keyboard.press('Meta+e')
    await expectFocused(gap)
    await expect(gap.getByRole('button')).toHaveAttribute('aria-expanded', 'true')
    for (const date of [
      'Wed Oct 21',
      'Thu Oct 22',
      'Fri Oct 23',
      'Sat Oct 24',
      'Sun Oct 25',
      'Mon Oct 26',
      'Tue Oct 27',
    ])
      await expect(window.locator('.agenda-row-day').filter({ hasText: date })).toHaveCount(1)
    const remainder = window.locator('.agenda-row-gap').filter({ hasText: '4 empty days · Oct 28 – Oct 31' })
    await expect(remainder).toHaveCount(1)
    await expect(remainder.getByRole('button')).toHaveAttribute('aria-expanded', 'false')
    const geometry = await gap.evaluate((element) => {
      const label = element.querySelector('.agenda-label')!.getBoundingClientRect()
      const triangle = element.querySelector('.node-disclosure-triangle')!.getBoundingClientRect()
      const focus = element.querySelector('.node-focus-marker')!.getBoundingClientRect()
      return {
        triangleY: triangle.y + triangle.height / 2,
        focusY: focus.y + focus.height / 2,
        labelY: label.y + label.height / 2,
      }
    })
    expect(geometry.triangleY).toBeCloseTo(geometry.labelY, 1)
    expect(geometry.focusY).toBeCloseTo(geometry.labelY, 1)
    for (const appearance of ['light', 'dark'] as const) {
      await window.emulateMedia({ colorScheme: appearance })
      await gap.click()
      await window.mouse.move(500, 20)
      await expect(window).toHaveScreenshot(screenshotName(`agenda-gap-expanded-${appearance}.png`))
    }
    await gap.getByRole('button').click()
    await expectFocused(gap)
    await expect(remainder).toHaveCount(0)
    await expect(window.locator('.agenda-row-day').filter({ hasText: 'Wed Oct 21' })).toHaveCount(0)
    await gap.getByRole('button').click()
    await remainder.getByRole('button').click()
    await expect(window.locator('.agenda-row-day').filter({ hasText: 'Sat Oct 31' })).toHaveCount(1)
    await gap.getByRole('button').click()
    await expect(window.locator('.agenda-row-day').filter({ hasText: 'Sat Oct 31' })).toHaveCount(0)
    if (mode === 'vim') {
      await gap.click()
      await window.keyboard.press('Escape')
      await window.keyboard.type('zM')
      await expect(day.getByRole('button')).toHaveAttribute('aria-expanded', 'false')
      await expectFocused(gap)
      await window.keyboard.type('zR')
      await expect(day.getByRole('button')).toHaveAttribute('aria-expanded', 'true')
      await expect(work.getByRole('button')).toHaveAttribute('aria-expanded', 'true')
      await expectFocused(gap)
    }
    await window.keyboard.press('Meta+p')
    await expect(window.locator('.node-row[data-node-id="team"]')).toHaveCount(1)
    expect(readPersisted(userDataDir)).toEqual(persisted)
  })
  // @requirement PRODUCT.md §23.1
  test('finishes an editing session before opening and preserves its single Undo step', async ({ userDataDir }) => {
    seed(userDataDir)
    const { window } = await launchTree(userDataDir)
    await setAgendaToday(window)
    const input = window.getByRole('textbox', { name: 'Node 1', exact: true })
    if (mode === 'vim') {
      await window.keyboard.press('Escape')
      await window.keyboard.press('0')
      await window.keyboard.press('R')
      await window.keyboard.type('AB')
    } else {
      await input.evaluate((element) => (element as HTMLTextAreaElement).setSelectionRange(0, 0))
      await window.keyboard.type('AB')
    }
    const edited = mode === 'vim' ? 'ABrk' : 'ABWork'
    await expect(input).toHaveValue(edited)
    await window.keyboard.press('Meta+p')
    await expect(window.locator('.agenda-today')).toBeFocused()
    if (mode === 'vim') await expect(window.getByLabel('Vim mode')).toHaveText('NORMAL')
    await window.keyboard.press('Meta+p')
    await expectFocused(input)
    await expect(input).toHaveValue(edited)
    await window.keyboard.press('Meta+z')
    await expect(input).toHaveValue('Work')
  })
  // @requirement PRODUCT.md §23.1
  test('opens at Today and restores the origin cursor without persisting Agenda', async ({ userDataDir }) => {
    seed(userDataDir)
    const { window, app } = await launchTree(userDataDir)
    await setAgendaToday(window)
    const input = window.getByRole('textbox', { name: 'Node 1', exact: true })
    await input.focus()
    await input.evaluate((element) => (element as HTMLTextAreaElement).setSelectionRange(2, 2))
    const before = readPersisted(userDataDir)
    const files = readdirSync(join(userDataDir, 'data')).sort()
    await window.keyboard.press('Meta+p')
    const today = window.locator('.agenda-today')
    await expectFocused(today)
    await expect(today).toContainText('Thu Oct 8 · TODAY')
    await expect(today.locator('.node-input')).toHaveCount(0)
    await window.keyboard.press('ArrowDown')
    await window.keyboard.type('No edit')
    await window.evaluate(() => {
      document.querySelector('.scroll-viewport')!.scrollTop = 300
    })
    await window.keyboard.press('Meta+p')
    await expectFocused(input)
    expect(await input.evaluate((element) => (element as HTMLTextAreaElement).selectionStart)).toBe(2)
    expect(readPersisted(userDataDir)).toEqual(before)
    expect(readdirSync(join(userDataDir, 'data')).sort()).toEqual(files)
    await app.close()
    const restarted = await launchTree(userDataDir)
    await expect(restarted.window.locator('.agenda-list')).toHaveCount(0)
    await expect(restarted.window.getByRole('textbox', { name: 'Node 1', exact: true })).toHaveValue('Work')
  })

  // @requirement PRODUCT.md §23.2
  // @requirement PRODUCT.md §23.3
  // @requirement PRODUCT.md §23.4
  test('projects full hierarchy, emphasizes dates, compresses empty days, and navigates to scoped Tree', async ({
    userDataDir,
  }) => {
    seed(userDataDir)
    const { window, app } = await launchTree(userDataDir)
    await setMainWindowContentSize(app, screenshotContentSize)
    await setAgendaToday(window)
    const treeRow = window.locator('.node-row').first()
    const treeGeometry = await treeRow.evaluate((element) => ({
      bullet: element.querySelector('.node-enter-control')!.getBoundingClientRect().left,
      text:
        element.querySelector('.node-input')!.getBoundingClientRect().left +
        Number.parseFloat(getComputedStyle(element.querySelector('.node-input')!).paddingLeft),
      chevron: element.querySelector('.node-disclosure-triangle')!.getBoundingClientRect().left,
    }))
    await window.keyboard.press('Meta+p')
    for (const date of ['Mon Oct 5', 'Tue Oct 6', 'Wed Oct 7', 'Thu Oct 8', 'Fri Oct 9', 'Sat Oct 10', 'Sun Oct 11'])
      await expect(window.locator('.agenda-row-day').filter({ hasText: date })).toHaveCount(1)
    await expect(window.locator('.agenda-row-gap').filter({ hasText: '11 empty days · Oct 21 – Oct 31' })).toHaveCount(
      1,
    )
    await expect(window.locator('.agenda-row-day').filter({ hasText: 'Mon Oct 12' })).toHaveCount(1)
    await expect(window.locator('.agenda-row-day').filter({ hasText: 'Tue Oct 13' })).toHaveCount(1)
    await expect(window.locator('[data-node-id="invalid"]')).toHaveCount(0)
    const prepare = window.locator('.agenda-row[data-node-id="prepare"]').first()
    await expect(prepare).toHaveText('2026-10-14 Prepare rollout 2026-10-20')
    await expect(prepare.locator('.agenda-date-active')).toHaveText('2026-10-14')
    await expect(prepare.locator('.agenda-date-secondary')).toHaveText('2026-10-20')
    const day = window.locator('.agenda-row-day').filter({ hasText: 'Wed Oct 14' })
    const geometry = await day.evaluate((element) => ({
      text: element.querySelector('.agenda-label')!.getBoundingClientRect().left,
      chevron: element.querySelector('.node-disclosure-triangle')!.getBoundingClientRect().left,
    }))
    expect(geometry.text).toBeCloseTo(treeGeometry.text, 1)
    expect(geometry.chevron).toBeCloseTo(treeGeometry.chevron, 1)
    const work = window.locator('.agenda-row[data-node-id="work"]').first()
    const childText = await work
      .locator('.agenda-text')
      .evaluate(
        (element) => element.getBoundingClientRect().left + Number.parseFloat(getComputedStyle(element).paddingLeft),
      )
    expect(childText - geometry.text).toBe(20)
    await work.click()
    await expectFocused(work)
    await window.keyboard.press('Meta+.')
    await expect(window.getByRole('textbox', { name: 'Current parent', exact: true })).toHaveValue('Work')
    await window.keyboard.press('Meta+p')
    await expect(window.locator('.agenda-today')).toBeFocused()
    await expect(window.locator('.agenda-row[data-node-id="work"]')).toHaveCount(0)
    await expect(window.locator('.agenda-row[data-node-id="outside"]')).toHaveCount(0)
    await window.locator('.agenda-row[data-node-id="team"]').first().click()
    await window.keyboard.press('Meta+.')
    await expect(window.getByRole('textbox', { name: 'Current parent', exact: true })).toHaveValue('Team A')
    await window.keyboard.press('Meta+p')
    await expect(window.locator('.agenda-row[data-node-id="team"]')).toHaveCount(0)
    await expect(window.locator('.agenda-row[data-node-id="work"]')).toHaveCount(0)
    for (const appearance of ['light', 'dark'] as const) {
      await window.emulateMedia({ colorScheme: appearance })
      await window.locator('.agenda-row-day').filter({ hasText: 'Wed Oct 14' }).click()
      await expect(window).toHaveScreenshot(screenshotName(`agenda-timeline-${appearance}.png`))
    }
  })

  // @requirement PRODUCT.md §23.4
  test('arrows and Vim counts navigate rows while edit commands leave the document intact', async ({ userDataDir }) => {
    seed(userDataDir)
    const { window } = await launchTree(userDataDir)
    await setAgendaToday(window)
    await window.keyboard.press('Meta+p')
    await window.keyboard.press('Escape')
    if (mode === 'vim') {
      await window.keyboard.type('2j')
      await expect(window.locator('[aria-selected="true"]')).toContainText('Sat Oct 10')
      await window.keyboard.type('gg')
      await expect(window.locator('[aria-selected="true"]')).toContainText('Tue Sep 1')
      await window.keyboard.type('G')
      await expect(window.locator('[aria-selected="true"]')).toContainText('2026-11-01 Review')
      await window.evaluate(() => {
        document.querySelector('.scroll-viewport')!.scrollTop = 180
      })
      for (const motion of ['H', 'M', 'L', 'Control+d', 'Control+u']) {
        const expectedKey = await window.evaluate((motion) => {
          const viewport = document.querySelector<HTMLElement>('.scroll-viewport')!
          const bounds = viewport.getBoundingClientRect()
          const line = ['H', 'M', 'L'].includes(motion)
          const margin = Math.min(25, viewport.clientHeight / 4)
          const inner = {
            top: bounds.top + (viewport.scrollTop === 0 ? 0 : margin),
            bottom: bounds.bottom - (viewport.scrollTop >= viewport.scrollHeight - viewport.clientHeight ? 0 : margin),
          }
          const rows = [...document.querySelectorAll<HTMLElement>('.agenda-row')].map((element) => ({
            key: element.dataset.agendaKey!,
            selected: element.getAttribute('aria-selected') === 'true',
            box: element.getBoundingClientRect(),
          }))
          const useInner = line && rows.some(({ box }) => box.top >= inner.top && box.bottom <= inner.bottom)
          const range = useInner ? inner : bounds
          const intersecting = rows.filter(({ box }) => box.top < range.bottom && box.bottom > range.top)
          const fullyVisible = line
            ? intersecting.filter(({ box }) => box.top >= range.top && box.bottom <= range.bottom)
            : []
          const eligible = fullyVisible.length ? fullyVisible : intersecting
          const current = eligible.findIndex((row) => row.selected)
          const base = current < 0 ? (motion === 'Control+u' ? eligible.length - 1 : 0) : current
          const index =
            motion === 'H'
              ? 0
              : motion === 'L'
                ? eligible.length - 1
                : motion === 'M'
                  ? Math.floor((eligible.length - 1) / 2)
                  : Math.max(
                      0,
                      Math.min(
                        eligible.length - 1,
                        base + (motion === 'Control+d' ? 1 : -1) * Math.max(1, Math.floor(eligible.length / 2)),
                      ),
                    )
          return eligible[index]!.key
        }, motion)
        const scroll = await window.evaluate(() => document.querySelector('.scroll-viewport')!.scrollTop)
        await window.keyboard.press(motion)
        await expect(window.locator('[aria-selected="true"]')).toHaveAttribute('data-agenda-key', expectedKey)
        if (['H', 'M', 'L'].includes(motion))
          expect(await window.evaluate(() => document.querySelector('.scroll-viewport')!.scrollTop)).toBe(scroll)
      }
    }
    await window.keyboard.press('ArrowUp')
    const selected = await window.locator('[aria-selected="true"]').getAttribute('data-agenda-key')
    // `Enter` is excluded: on a direct match it splits the node (PRODUCT.md §23.11).
    for (const key of ['Tab', 'Shift+Tab', 'Meta+Backspace', 'Meta+Enter', 'Meta+z', 'Backspace'])
      await window.keyboard.press(key)
    expect(await window.locator('[aria-selected="true"]').getAttribute('data-agenda-key')).toBe(selected)
    await window.keyboard.press('Meta+p')
    await expect(window.getByRole('textbox', { name: 'Node 1', exact: true })).toHaveValue('Work')
  })
})
