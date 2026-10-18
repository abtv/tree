// @editing-modes: both
import {
  describeForEachEditingMode,
  expect,
  launchTree,
  seedDocument,
  setAgendaToday,
  setCursor,
  screenshotContentSize,
  setMainWindowContentSize,
  test,
} from './fixtures'
import type { Locator } from '@playwright/test'

/** The drawn underline of every date-like span in an editor: its computed line, style and caret flag. */
async function underlines(input: Locator): Promise<{ line: string; style: string; caret: boolean }[]> {
  return input.evaluate((element) =>
    [...element.querySelectorAll('.date-like-text')].map((span) => {
      const style = getComputedStyle(span)
      return {
        line: style.textDecorationLine,
        style: style.textDecorationStyle,
        caret: span.hasAttribute('data-caret'),
      }
    }),
  )
}

describeForEachEditingMode('Date-like text indicator', ({ mode, screenshotName }) => {
  // @requirement PRODUCT.md §20.10
  test('flags the current parent heading like a child row', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: {
        roots: [{ id: 'p', text: 'Plan 2026-02-31', children: [{ id: 'c', text: 'Child 2026-1-5', children: [] }] }],
      },
      location: { currentParentId: 'p', selectedNodeId: 'c' },
    })
    const { window } = await launchTree(userDataDir)
    const heading = window.getByRole('textbox', { name: 'Current parent', exact: true })
    const child = window.getByRole('textbox', { name: 'Node 1', exact: true })
    await expect.poll(() => underlines(heading)).toEqual([{ line: 'underline', style: 'wavy', caret: false }])
    await expect.poll(() => underlines(child)).toEqual([{ line: 'underline', style: 'wavy', caret: false }])
  })

  if (mode === 'vim') {
    // @requirement PRODUCT.md §20.10
    test('treats the Normal block caret as the caret before its character', async ({ userDataDir }) => {
      seedDocument(userDataDir, {
        document: { roots: [{ id: 'n', text: 'Report 2026-02-31', children: [] }] },
        location: { currentParentId: null, selectedNodeId: 'n' },
      })
      const { window } = await launchTree(userDataDir)
      const input = window.getByRole('textbox', { name: 'Node 1', exact: true })
      await input.click()
      await window.keyboard.press('Escape')
      await window.keyboard.press('0')
      await expect.poll(async () => (await underlines(input))[0]?.line).toBe('underline')
      await window.keyboard.press('6')
      await window.keyboard.press('l')
      // Block on the space before the token: still drawn. Block on the token's first character: hidden.
      await expect.poll(async () => (await underlines(input))[0]?.line).toBe('underline')
      await window.keyboard.press('l')
      await expect.poll(async () => (await underlines(input))[0]?.caret).toBe(true)
      await window.keyboard.press('0')
      await expect.poll(async () => (await underlines(input))[0]?.line).toBe('underline')
    })
  }

  for (const view of ['Tree', 'Agenda'] as const) {
    // @requirement PRODUCT.md §20.10
    test(`flags impossible dates only away from the caret in ${view}`, async ({ userDataDir }) => {
      seedDocument(userDataDir, {
        document: {
          roots: [
            { id: 'n', text: '2026-10-08 Report', children: [] },
            { id: 'other', text: '2026-10-09 Other', children: [] },
          ],
        },
        location: { currentParentId: null, selectedNodeId: 'n' },
      })
      const { window, app } = await launchTree(userDataDir)
      await setAgendaToday(window)
      await setMainWindowContentSize(app, screenshotContentSize)
      if (view === 'Agenda') {
        await window.keyboard.press('Meta+p')
        await window.locator('.agenda-row[data-node-id="n"]').click()
      }
      const input =
        view === 'Agenda'
          ? window.getByRole('textbox', { name: 'Agenda node n', exact: true })
          : window.getByRole('textbox', { name: 'Node 1', exact: true })
      const other =
        view === 'Agenda'
          ? window.locator('.agenda-row[data-node-id="other"]')
          : window.getByRole('textbox', { name: 'Node 2', exact: true })
      const text = async (): Promise<string> =>
        input.evaluate((element) =>
          element instanceof HTMLTextAreaElement ? element.value : (element.textContent ?? ''),
        )
      if (mode === 'vim') {
        await window.keyboard.press('Escape')
        await window.keyboard.press('i')
      }
      await setCursor(input, '2026-10-08 Report'.length)

      // An intermediate typing state is never flagged, and the row keeps focus and text while typing.
      await window.keyboard.type(' 2026-10-1')
      await expect.poll(text).toBe('2026-10-08 Report 2026-10-1')
      await expect(input).toBeFocused()
      expect(await underlines(input)).toEqual([{ line: 'none', style: 'solid', caret: true }])
      // Completing a valid date leaves nothing to flag and moves nothing in Agenda.
      await window.keyboard.type('5')
      await expect.poll(text).toBe('2026-10-08 Report 2026-10-15')
      await expect(input).toBeFocused()
      expect(await underlines(input)).toEqual([])

      // An impossible date stays unflagged at the caret and is drawn once the caret leaves it.
      await window.keyboard.press('Meta+a')
      await window.keyboard.type('2026-10-08 Report 2026-02-31')
      await expect.poll(text).toBe('2026-10-08 Report 2026-02-31')
      await expect(input).toBeFocused()
      expect(await underlines(input)).toEqual([{ line: 'none', style: 'solid', caret: true }])
      await window.keyboard.press('Home')
      await expect.poll(async () => (await underlines(input))[0]?.line).toBe('underline')
      expect(await underlines(input)).toEqual([{ line: 'underline', style: 'wavy', caret: false }])
      await expect(input).toBeFocused()
      await expect.poll(text).toBe('2026-10-08 Report 2026-02-31')
      await setCursor(input, '2026-10-08 Report 2026-02-'.length)
      await expect.poll(async () => (await underlines(input))[0]?.caret).toBe(true)
      expect(await underlines(input)).toEqual([{ line: 'none', style: 'solid', caret: true }])
      await window.keyboard.press('Home')
      await expect.poll(async () => (await underlines(input))[0]?.line).toBe('underline')

      // The impossible date is ordinary text: the node stays under its one real date.
      if (view === 'Agenda') await expect(window.locator('.agenda-row[data-node-id="n"]')).toHaveCount(1)

      for (const appearance of ['light', 'dark'] as const) {
        await window.emulateMedia({ colorScheme: appearance })
        await window.mouse.move(600, 20)
        await expect(window).toHaveScreenshot(screenshotName(`date-like-${view.toLowerCase()}-${appearance}.png`))
      }

      // A node that is no longer being edited shows the underline whatever the caret was doing.
      await setCursor(input, '2026-10-08 Report 2026-02-'.length)
      await expect.poll(async () => (await underlines(input))[0]?.caret).toBe(true)
      await other.click()
      await expect(input).not.toBeFocused()
      expect(await underlines(input)).toEqual([{ line: 'underline', style: 'wavy', caret: false }])
    })
  }
})
