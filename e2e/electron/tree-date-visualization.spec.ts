// @editing-modes: both
import type { Locator } from '@playwright/test'
import {
  describeForEachEditingMode,
  expect,
  launchTree,
  seedDocument,
  setCursor,
  screenshotContentSize,
  setMainWindowContentSize,
  setAgendaToday,
  test,
} from './fixtures'

/**
 * True while `input` shows the Vim Normal block caret: a one-character selection covering the
 * character at `offset`. The renderer owns this caret, so a screenshot taken before it draws the
 * block would capture no caret; the test waits for it after moving with the renderer's own motion.
 */
async function blockCaretAt(input: Locator, offset: number): Promise<boolean> {
  return input.evaluate((element, target) => {
    if (element instanceof HTMLTextAreaElement) {
      return element.selectionStart === target && element.selectionEnd === target + 1
    }
    const selection = element.ownerDocument.getSelection()
    if (selection === null || selection.rangeCount === 0) return false
    const range = selection.getRangeAt(0)
    if (!element.contains(range.startContainer) || !element.contains(range.endContainer)) return false
    const before = element.ownerDocument.createRange()
    before.selectNodeContents(element)
    before.setEnd(range.startContainer, range.startOffset)
    return before.toString().length === target && range.toString().length === 1
  }, offset)
}

describeForEachEditingMode('Tree date visualization', ({ mode, screenshotName }) => {
  // @requirement PRODUCT.md §20.11
  // @requirement PRODUCT.md §23.2
  test('colors past, today and future dates consistently across Tree and Agenda', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: { roots: [{ id: 'dates', text: 'Dates 2026-10-07 2026-10-08 2026-10-09', children: [] }] },
      location: { currentParentId: null, selectedNodeId: 'dates' },
    })
    const { window, app } = await launchTree(userDataDir)
    await setMainWindowContentSize(app, screenshotContentSize)
    await setAgendaToday(window)
    // Force the mounted Tree editor to render using the fixed local calendar.
    const input = window.getByRole('textbox', { name: 'Node 1', exact: true })
    await input.click()
    await window.keyboard.press('Meta+Enter')
    await window.keyboard.press('Meta+Enter')
    for (const view of ['tree', 'agenda'] as const) {
      if (view === 'agenda') await window.keyboard.press('Meta+p')
      for (const appearance of ['light', 'dark'] as const) {
        await window.emulateMedia({ colorScheme: appearance })
        for (const [kind, text] of [
          ['past', '2026-10-07'],
          ['today', '2026-10-08'],
          ['future', '2026-10-09'],
        ] as const) {
          const dates = window.locator(`.date-${kind}`)

          await expect.poll(() => dates.count()).toBeGreaterThan(0)
          for (const date of await dates.all()) {
            await expect(date).toHaveText(text)
            await expect(date).toHaveCSS(
              'color',
              await date.evaluate((el, name) => {
                const probe = document.createElement('span')
                probe.style.color = getComputedStyle(el).getPropertyValue(`--color-date-${name}`)
                el.append(probe)
                const color = getComputedStyle(probe).color
                probe.remove()
                return color
              }, kind),
            )
          }
        }

        await window.mouse.move(600, 20)

        await expect(window).toHaveScreenshot(screenshotName(`temporal-dates-${view}-${appearance}.png`))
      }
    }
  })

  // @requirement PRODUCT.md §2.5
  // @requirement PRODUCT.md §20.11
  // @requirement PRODUCT.md §23.2
  test('struck dates inherit text color in Tree and Agenda', async ({ userDataDir }, testInfo) => {
    seedDocument(userDataDir, {
      document: {
        roots: [{ id: 'a', text: 'Finished 2026-10-08 and 2026-10-09', children: [] }],
      },
      location: { currentParentId: null, selectedNodeId: 'a' },
    })
    const { window, app } = await launchTree(userDataDir)

    await setMainWindowContentSize(app, screenshotContentSize)
    await setAgendaToday(window)
    const input = window.getByRole('textbox', { name: 'Node 1', exact: true })

    await input.click()
    await window.keyboard.press('Meta+Enter')
    for (const view of ['tree', 'agenda'] as const) {
      if (view === 'agenda') await window.keyboard.press('Meta+p')
      for (const appearance of ['light', 'dark'] as const) {
        await window.emulateMedia({ colorScheme: appearance })
        const dates = window.locator(
          '.node-input-struck .agenda-date-active, .node-input-struck .agenda-date-secondary, .agenda-text-struck .agenda-date-active, .agenda-text-struck .agenda-date-secondary',
        )

        await expect.poll(() => dates.count()).toBeGreaterThan(0)
        for (const date of await dates.all()) {
          await expect(date).toHaveCSS(
            'color',
            await date.evaluate((el) => getComputedStyle(el.closest('.node-input-struck, .agenda-text-struck')!).color),
          )
        }

        await window.screenshot({ path: testInfo.outputPath(`${view}-${appearance}.png`) })
      }
    }

    await window.keyboard.press('Meta+p')
    await input.click()
    await window.keyboard.press('Meta+Enter')

    await expect(input).not.toHaveClass(/node-input-struck/)
    await expect(input.locator('.agenda-date-active').first()).not.toHaveCSS(
      'color',
      await input.evaluate((el) => getComputedStyle(el).color),
    )
  })

  // @requirement PRODUCT.md §20.11
  test('styles heading and row dates like Agenda and preserves selection colors', async ({ userDataDir }) => {
    const url = 'https://example.com/2026-10-12'
    seedDocument(userDataDir, {
      document: {
        roots: [
          {
            id: 'p',
            text: 'Plan 2026-10-08',
            children: [
              { id: 'a', text: 'Release 2026-10-09 and 2026-10-10', children: [] },
              { id: 'b', text: 'Review 2026-10-11', children: [] },
              {
                id: 'c',
                text: url,
                links: [{ start: 0, end: url.length, url }],
                children: [],
              },
            ],
          },
        ],
      },
      location: { currentParentId: 'p', selectedNodeId: 'a' },
    })
    const { window, app } = await launchTree(userDataDir)

    await setMainWindowContentSize(app, screenshotContentSize)
    const heading = window.getByRole('textbox', { name: 'Current parent', exact: true })
    const first = window.getByRole('textbox', { name: 'Node 1', exact: true })
    const second = window.getByRole('textbox', { name: 'Node 2', exact: true })

    await setAgendaToday(window)
    await first.click()
    await window.keyboard.press('Meta+Enter')
    await window.keyboard.press('Meta+Enter')

    await expect(heading.locator('.agenda-date-active')).toHaveText('2026-10-08')
    await expect(first.locator('.agenda-date-active')).toHaveCount(2)
    await expect(
      window.getByRole('textbox', { name: 'Node 3', exact: true }).locator('.agenda-date-active'),
    ).toHaveCount(0)

    for (const appearance of ['light', 'dark'] as const) {
      await window.emulateMedia({ colorScheme: appearance })
      await first.click()
      if (mode === 'vim') {
        // The renderer owns the Normal-mode block caret; moving to the first character with `0`
        // draws it deterministically. `setCursor` would collapse the selection outside the
        // renderer's caret model, so the block reappears only on a timing-dependent redraw.
        await window.keyboard.press('Escape')
        await window.keyboard.press('0')
      } else {
        await setCursor(first, 0)
      }

      await expect(first.locator('.agenda-date-active').first()).toHaveCSS('font-weight', '600')
      if (mode === 'vim') await expect.poll(() => blockCaretAt(first, 0)).toBe(true)

      await window.mouse.move(600, 20)

      await expect(window).toHaveScreenshot(screenshotName(`tree-dates-${appearance}.png`))

      await second.click()

      await expect(second).toBeFocused()
      await expect(first.locator('.agenda-date-active')).toHaveCount(2)

      if (mode === 'vim') {
        await window.keyboard.press('Escape')
        await window.keyboard.press('V')

        await expect(second.locator('.agenda-date-active')).toHaveCSS(
          'color',
          await second.evaluate((el) => getComputedStyle(el).color),
        )
        await expect(window).toHaveScreenshot(screenshotName(`tree-dates-selected-${appearance}.png`))

        await window.keyboard.press('Escape')
      }
    }
  })

  // @requirement PRODUCT.md §20.11
  test('updates date styling while typing and keeps focus through undo and date removal', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: { roots: [{ id: 'n', text: 'Due ', children: [] }] },
      location: { currentParentId: null, selectedNodeId: 'n' },
    })
    const { window } = await launchTree(userDataDir)
    let input = window.getByRole('textbox', { name: 'Node 1', exact: true })

    await input.click()
    if (mode === 'vim') {
      await window.keyboard.press('Escape')
      await window.keyboard.press('A')
    }

    await setCursor(input, 4)
    await window.keyboard.type('2026-10-14')
    input = window.getByRole('textbox', { name: 'Node 1', exact: true })

    await expect(input).toHaveText('Due 2026-10-14')
    await expect(input).toBeFocused()
    await expect(input.locator('.agenda-date-active')).toHaveText('2026-10-14')

    await window.keyboard.type('!')

    await expect(input).toHaveText('Due 2026-10-14!')

    await window.keyboard.press('Backspace')
    await window.keyboard.press('Backspace')

    await expect(input).toHaveText('Due 2026-10-1')
    await expect(input.locator('.agenda-date-active')).toHaveCount(0)
    await expect(input).toBeFocused()

    await window.keyboard.type('4')

    await expect(input.locator('.agenda-date-active')).toHaveText('2026-10-14')

    await window.keyboard.press('Meta+a')
    await window.keyboard.type('Plain text')

    await expect(input).toHaveText('Plain text')
    await expect(input).toBeFocused()
    await expect(input.locator('.agenda-date-active')).toHaveCount(0)

    await window.keyboard.press('Meta+z')

    await expect(input.locator('.agenda-date-active')).toHaveText('2026-10-14')
    await expect(input).toBeFocused()
  })
})
