// @editing-modes: both
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { Locator } from '@playwright/test'
import type { TreeNode } from '../../src/domain/document'
import {
  describeForEachEditingMode,
  expect,
  fireIdleSave,
  launchTree,
  readPersisted,
  screenshotContentSize,
  seedDocument,
  setAgendaToday,
  setMainWindowBounds,
  setMainWindowContentSize,
  test,
  tryReadWindowBounds,
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
    expect(
      await window.locator('.scroll-viewport').evaluate((element) => element.scrollHeight > element.clientHeight * 10),
    ).toBe(true)
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
    const viewport = window.locator('.scroll-viewport')
    const wheelDelta = await viewport.evaluate((element) => {
      element.setAttribute('data-wheel-scroll-ended', 'false')
      element.addEventListener(
        'wheel',
        () => {
          const start = element.scrollTop
          const onScrollEnd = () => {
            if (Math.abs(element.scrollTop - start) <= 1000) return
            element.setAttribute('data-wheel-scroll-ended', 'true')
            element.removeEventListener('scrollend', onScrollEnd)
          }
          element.addEventListener('scrollend', onScrollEnd)
        },
        { once: true },
      )
      return element.scrollTop > 8000 ? -8000 : 8000
    })

    // Real wheel input relinquishes navigation reveal even while row measurements settle.
    await window.mouse.move(400, 300)
    await window.mouse.wheel(0, wheelDelta)

    await expect(viewport).toHaveAttribute('data-wheel-scroll-ended', 'true')
    await expect(selected.locator('..')).toHaveClass(/agenda-row-pinned/u)
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
      await window.locator('.agenda-today').click()
    }
    const today = window.locator('.agenda-today')

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

    if (mode === 'vim') {
      await window.keyboard.press('ArrowDown')

      await expectFocused(selected)
      await expect(selected).toHaveAttribute('data-node-id', 'dated-0')

      await window.keyboard.press('$')
    }
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

      if (mode === 'standard')
        await expect(window).toHaveScreenshot(screenshotName(`agenda-windowed-${appearance}.png`))
    }
  })
  // @requirement PRODUCT.md §23.5
  // @requirement PRODUCT.md §23.1
  test(
    'finishes an editing session before opening and preserves its single Undo step',
    { tag: '@linux' },
    async ({ userDataDir }) => {
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
    },
  )
  // @requirement PRODUCT.md §23.1
  test(
    'opens at Today and restores the origin cursor without persisting Agenda',
    { tag: '@linux' },
    async ({ userDataDir }) => {
      seed(userDataDir)
      const { window, app } = await launchTree(userDataDir)

      // Settle native geometry persistence before checking that Agenda creates no files.
      await setMainWindowBounds(app, { width: 900, height: 600 })
      await expect.poll(() => tryReadWindowBounds(userDataDir)).toMatchObject({ width: 900, height: 600 })

      await setAgendaToday(window)
      const input = window.getByRole('textbox', { name: 'Node 1', exact: true })
      await input.focus()

      await input.evaluate((element) => (element as HTMLTextAreaElement).setSelectionRange(2, 2))
      const before = readPersisted(userDataDir)
      const files = readdirSync(join(userDataDir, 'data')).sort()

      await window.keyboard.press('Meta+p')
      const today = window.locator('.agenda-today')

      await expectFocused(today)
      await expect(today).toHaveText('No entries for today')
      await expect(today.locator('.node-input')).toHaveCount(0)

      await window.keyboard.press('ArrowDown')
      await window.keyboard.type('No edit')
      await window.evaluate(() => {
        document.querySelector('.scroll-viewport')!.scrollTop = 300
      })
      await window.keyboard.press('Meta+p')

      await expectFocused(input)
      expect(await input.evaluate((element) => (element as HTMLTextAreaElement).selectionStart)).toBe(2)

      await fireIdleSave(window)
      // Queue a read behind the idle save so the comparison cannot race its asynchronous disk write.
      await window.evaluate(() =>
        (globalThis as typeof globalThis & { treeApi: { load(): Promise<unknown> } }).treeApi.load(),
      )

      expect(readPersisted(userDataDir)).toEqual(before)
      expect(readdirSync(join(userDataDir, 'data')).sort()).toEqual(files)

      await app.close()
      const restarted = await launchTree(userDataDir)

      await expect(restarted.window.locator('.agenda-list')).toHaveCount(0)
      await expect(restarted.window.getByRole('textbox', { name: 'Node 1', exact: true })).toHaveValue('Work')
    },
  )

  // @requirement PRODUCT.md §23.2
  // @requirement PRODUCT.md §23.3
  // @requirement PRODUCT.md §23.4
  test('groups direct matches under passive scope-relative paths and navigates to scoped Tree', async ({
    userDataDir,
  }) => {
    seed(userDataDir)
    const { window, app } = await launchTree(userDataDir)
    await setMainWindowContentSize(app, screenshotContentSize)
    await setAgendaToday(window)
    await window.keyboard.press('Meta+p')

    await expect(window.locator('.agenda-row-day .agenda-label')).toHaveText([
      'Tue Sep 1',
      'No entries for today',
      'Wed Oct 14',
      'Tue Oct 20',
      'Sun Nov 1',
    ])
    await expect(window.locator('.agenda-row-gap, .agenda-role-context')).toHaveCount(0)
    await expect(window.locator('[data-node-id="invalid"]')).toHaveCount(0)
    await expect(window.locator('.agenda-path-label')).toHaveText([
      'Work › Team A › Release',
      'Work › Team A › Release',
      'Work › Team A › Release',
    ])

    const prepare = window.locator('.agenda-row[data-node-id="prepare"]').first()
    await expect(prepare).toHaveText('2026-10-14 Prepare rollout 2026-10-20')
    await expect(prepare.locator('.agenda-date-active')).toHaveText('2026-10-14')
    await expect(prepare.locator('.agenda-date-secondary')).toHaveText('2026-10-20')

    await window.keyboard.press('Meta+p')
    await window.keyboard.press('Meta+.')
    await expect(window.getByRole('textbox', { name: 'Current parent', exact: true })).toHaveValue('Work')
    await window.keyboard.press('Meta+p')

    await expect(window.locator('.agenda-row[data-node-id="outside"]')).toHaveCount(0)
    await expect(window.locator('.agenda-path-label')).toHaveText([
      'Team A › Release',
      'Team A › Release',
      'Team A › Release',
    ])

    await window.keyboard.press('Meta+p')
    await window.keyboard.press('Meta+.')
    await expect(window.getByRole('textbox', { name: 'Current parent', exact: true })).toHaveValue('Team A')
    await window.keyboard.press('Meta+p')
    await expect(window.locator('.agenda-path-label')).toHaveText(['Release', 'Release', 'Release'])

    for (const appearance of ['light', 'dark'] as const) {
      await window.emulateMedia({ colorScheme: appearance })
      await window.locator('.agenda-row-day').filter({ hasText: 'Wed Oct 14' }).click()

      if (mode === 'standard')
        await expect(window).toHaveScreenshot(screenshotName(`agenda-timeline-${appearance}.png`))
    }
  })

  // @requirement PRODUCT.md §23.4
  test(
    'arrows and Vim counts navigate rows while edit commands leave the document intact',
    { tag: '@linux' },
    async ({ userDataDir }) => {
      seed(userDataDir)
      const { window } = await launchTree(userDataDir)

      await setAgendaToday(window)
      await window.keyboard.press('Meta+p')
      await window.keyboard.press('Escape')
      if (mode === 'vim') {
        await window.keyboard.type('2j')

        await expect(window.locator('[aria-selected="true"]')).toContainText('2026-10-14 Prepare')

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
              bottom:
                bounds.bottom - (viewport.scrollTop >= viewport.scrollHeight - viewport.clientHeight ? 0 : margin),
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
    },
  )
})
