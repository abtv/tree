// @editing-modes: both
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
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
    await expect(input).toBeFocused()
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
    await expect(today).toBeFocused()
    await expect(today).toContainText('Thu Oct 8 · TODAY')
    await expect(window.locator('.node-input')).toHaveCount(0)
    await window.keyboard.press('ArrowDown')
    await window.keyboard.type('No edit')
    await window.evaluate(() => {
      document.querySelector('.scroll-viewport')!.scrollTop = 300
    })
    await window.keyboard.press('Meta+p')
    await expect(input).toBeFocused()
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
    await expect(work).toBeFocused()
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
    for (const key of ['Tab', 'Shift+Tab', 'Meta+Backspace', 'Meta+Enter', 'Meta+z', 'Enter', 'Backspace'])
      await window.keyboard.press(key)
    expect(await window.locator('[aria-selected="true"]').getAttribute('data-agenda-key')).toBe(selected)
    await window.keyboard.press('Meta+p')
    await expect(window.getByRole('textbox', { name: 'Node 1', exact: true })).toHaveValue('Work')
  })
})
