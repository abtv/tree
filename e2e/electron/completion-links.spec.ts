// @editing-modes: both
import type { Page } from '@playwright/test'
import {
  describeForEachEditingMode,
  expect,
  launchTree,
  pressShifted,
  seedDocument,
  setAgendaToday,
  setCursor,
  test,
} from './fixtures'

async function setAppearance(window: Page, appearance: 'light' | 'dark' | 'gray' | 'white'): Promise<void> {
  await window.evaluate((value) => globalThis.window.treeApi.setAppearance(value), appearance)
  await window.emulateMedia({ colorScheme: appearance === 'dark' ? 'dark' : 'light' })
  await expect(window.locator('html')).toHaveAttribute('data-appearance', appearance)
  await expect(window.locator('html')).toHaveCSS(
    'background-color',
    {
      light: 'rgb(251, 248, 241)',
      dark: 'rgb(63, 63, 63)',
      gray: 'rgb(221, 221, 221)',
      white: 'rgb(255, 255, 255)',
    }[appearance],
  )
}

describeForEachEditingMode('Completed rich text', ({ mode, screenshotName }) => {
  // @requirement PRODUCT.md §20.5
  test('keeps selected hyperlinks on the palette when command-panel focus changes', async ({
    userDataDir,
  }, testInfo) => {
    const url = 'https://example.com'
    const text = `before ${url} after`
    const links = [{ start: 7, end: 7 + url.length, url }]
    seedDocument(userDataDir, {
      document: {
        roots: [
          { id: 'one', text, links, children: [] },
          { id: 'two', text, links, children: [] },
        ],
      },
      location: { currentParentId: null, selectedNodeId: 'one' },
    })
    const { window } = await launchTree(userDataDir)
    const editor = window.getByRole('textbox', { name: 'Node 1', exact: true })
    const link = editor.locator('a')
    const neighbor = window.getByRole('textbox', { name: 'Node 2', exact: true }).locator('a')

    for (const appearance of ['light', 'dark', 'gray', 'white'] as const) {
      await setAppearance(window, appearance)
      await editor.focus()
      await window.keyboard.press('Meta+a')
      await expect(editor).toHaveClass(/select-all/)
      const highlight = await link.evaluate((element) => {
        const style = getComputedStyle(element, '::selection')
        return { color: style.color, background: style.backgroundColor }
      })

      await expect(link).toHaveCSS('color', highlight.color)
      await expect(link).toHaveCSS('background-color', highlight.background)
      await expect(neighbor).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
      if (mode === 'standard' && appearance !== 'white') {
        await expect(editor).toHaveScreenshot(`selected-link-${appearance}.png`)
      }

      await window.keyboard.press('Meta+Shift+p')
      await expect(window.getByRole('combobox', { name: 'Command', exact: true })).toBeFocused()
      // Focus transfer may clear the native selection. Any retained link highlight
      // must use the same pair; a cleared selection must leave the link unpainted.
      await expect
        .poll(() =>
          link.evaluate((element) => {
            const style = getComputedStyle(element)
            const selection = getComputedStyle(element, '::selection')
            return (
              style.backgroundColor === 'rgba(0, 0, 0, 0)' ||
              (style.backgroundColor === selection.backgroundColor && style.color === selection.color)
            )
          }),
        )
        .toBe(true)
      await window.screenshot({ path: testInfo.outputPath(screenshotName(`selected-link-blurred-${appearance}.png`)) })

      await window.keyboard.press('Escape')
      await expect(editor).toBeFocused()
      await setCursor(editor, 0)
      await expect(link).not.toHaveClass(/link-selected/)
      await expect(link).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
      await expect(link).toHaveCSS('color', await neighbor.evaluate((element) => getComputedStyle(element).color))
    }
  })

  // @requirement PRODUCT.md §2.5
  // @requirement PRODUCT.md §23.9
  test('retains completion and link styling across headings, search and Agenda occurrences', async ({
    userDataDir,
  }, testInfo) => {
    const url = 'https://example.com'
    const text = `${url} @me #work &review 2026-10-09 2026-10-11`
    const links = [{ start: 0, end: url.length, url }]
    seedDocument(userDataDir, {
      document: {
        roots: [
          {
            id: 'parent',
            text: url,
            links,
            struckThrough: true,
            children: [{ id: 'done', text, links, struckThrough: true, starred: true, children: [] }],
          },
          { id: 'open', text: `${url} 2026-10-09`, links, children: [] },
        ],
      },
      location: { currentParentId: 'parent', selectedNodeId: 'done' },
    })
    const { window, app } = await launchTree(userDataDir)
    await app.evaluate(({ shell }) => {
      const state = globalThis as typeof globalThis & { completionOpenedUrls?: string[] }
      state.completionOpenedUrls = []
      shell.openExternal = async (url: string): Promise<void> => {
        state.completionOpenedUrls!.push(url)
      }
    })
    await setAgendaToday(window)
    const input = window.getByRole('textbox', { name: 'Node 1', exact: true })
    const heading = window.getByRole('textbox', { name: 'Current parent', exact: true })

    for (const appearance of ['light', 'dark', 'gray', 'white'] as const) {
      await setAppearance(window, appearance)
      for (const editor of [input, heading]) {
        await expect(editor).toHaveCSS('text-decoration-line', 'line-through')
        await expect(editor.locator('a')).toHaveCSS('color', await editor.evaluate((el) => getComputedStyle(el).color))
        await expect(editor.locator('a')).toHaveCSS('text-decoration-line', 'none')
      }
      await window.screenshot({ path: testInfo.outputPath(screenshotName(`links-tree-${appearance}.png`)) })

      await input.focus()
      await setCursor(input, 3)
      await window.keyboard.press('Meta+a')
      // Standard editing marks a select-all; Vim editing selects the whole text in Visual mode.
      await expect(input).toHaveClass(/select-all|node-input-text-selected/)
      await expect(input).toHaveCSS('text-decoration-line', 'line-through')
      await window.screenshot({ path: testInfo.outputPath(screenshotName(`links-selected-${appearance}.png`)) })
      await window.keyboard.press('Escape')
      await setCursor(input, text.length)
    }

    await input.focus()
    await window.keyboard.press('Meta+Enter')
    await expect(input).not.toHaveClass(/node-input-struck/)
    // The heading keeps its own state when its only child returns to normal.
    await expect(heading).toHaveClass(/node-input-struck/)
    await expect(input.locator('a')).toHaveCSS('text-decoration-line', 'underline')
    await window.keyboard.press('Meta+Enter')
    await expect(input).toHaveClass(/node-input-struck/)
    await expect(heading).toHaveClass(/node-input-struck/)

    await window.keyboard.press('Meta+;')
    await expect(window.locator('[data-result-id="done"] .recent-node-text')).toHaveCSS(
      'text-decoration-line',
      'line-through',
    )
    await window.getByRole('searchbox').fill('example')
    for (const appearance of ['light', 'dark', 'gray', 'white'] as const) {
      await setAppearance(window, appearance)
      await expect(window.locator('[data-result-id="done"] .recent-node-text')).toHaveCSS(
        'text-decoration-line',
        'line-through',
      )
      await expect(window.locator('[data-result-id="open"] .recent-node-text')).toHaveCSS(
        'text-decoration-line',
        'none',
      )
      await expect(window.locator('[data-result-id="done"] .recent-node-text')).toHaveCSS(
        'color',
        await input.locator('a').evaluate((el) => getComputedStyle(el).color),
      )
      await window.screenshot({ path: testInfo.outputPath(screenshotName(`links-search-${appearance}.png`)) })
      await window.getByRole('searchbox').fill('')
      await expect(window.locator('[data-result-id="done"] .recent-node-text')).toHaveCSS(
        'color',
        await input.locator('a').evaluate((el) => getComputedStyle(el).color),
      )
      await window.screenshot({ path: testInfo.outputPath(screenshotName(`links-starred-${appearance}.png`)) })
      await window.getByRole('searchbox').fill('example')
    }
    await window.keyboard.press('Escape')
    await window.keyboard.press('Meta+p')
    const occurrences = window.locator('.agenda-role-match[data-node-id="done"]')
    await expect(occurrences).toHaveCount(2)
    await expect(window.locator('.agenda-role-context a')).toHaveCount(0)

    for (const appearance of ['light', 'dark', 'gray', 'white'] as const) {
      await setAppearance(window, appearance)
      for (const row of await occurrences.all()) {
        await expect(row.locator('.agenda-text, .node-input')).toHaveCSS('text-decoration-line', 'line-through')
        await expect(row.locator('a')).toHaveCSS(
          'color',
          await row.locator('.agenda-text, .node-input').evaluate((el) => getComputedStyle(el).color),
        )
        await expect(row.locator('a')).toHaveCSS('text-decoration-line', 'none')
      }
      await window.screenshot({ path: testInfo.outputPath(screenshotName(`links-agenda-passive-${appearance}.png`)) })
      await occurrences.first().locator('a').click()
      const editor = window.getByRole('textbox', { name: 'Agenda node done', exact: true })
      await expect(editor).toBeFocused()
      await expect(editor).toHaveCSS('text-decoration-line', 'line-through')
      await window.screenshot({ path: testInfo.outputPath(screenshotName(`links-agenda-active-${appearance}.png`)) })
    }
    await occurrences
      .last()
      .locator('a')
      .click({ modifiers: ['Meta'] })
    await expect
      .poll(() => app.evaluate(() => (globalThis as { completionOpenedUrls?: string[] }).completionOpenedUrls))
      .toEqual(['https://example.com/'])
    await window.keyboard.press('Meta+Enter')
    for (const row of await occurrences.all()) {
      await expect(row.locator('.agenda-text, .node-input')).toHaveCSS('text-decoration-line', 'none')
    }
  })
})

test.describe('Completed links: Vim editing only', () => {
  // @requirement PRODUCT.md §2.5
  test('uses selection colors for completed links in a whole-node selection', async ({ userDataDir }, testInfo) => {
    const url = 'https://example.com'
    seedDocument(userDataDir, {
      document: {
        roots: [
          { id: 'done', text: url, links: [{ start: 0, end: url.length, url }], struckThrough: true, children: [] },
          { id: 'open', text: url, links: [{ start: 0, end: url.length, url }], children: [] },
        ],
      },
      location: { currentParentId: null, selectedNodeId: 'done' },
    })
    const { window } = await launchTree(userDataDir, { initialMode: 'normal' })
    await pressShifted(window, 'V')
    await window.keyboard.press('j')
    await expect(window.getByLabel('Vim mode')).toHaveText('VISUAL NODE')
    const input = window.getByRole('textbox', { name: 'Node 1', exact: true })
    const neighbor = window.getByRole('textbox', { name: 'Node 2', exact: true })

    for (const appearance of ['light', 'dark', 'gray', 'white'] as const) {
      await setAppearance(window, appearance)
      await window.screenshot({ path: testInfo.outputPath(`links-whole-node-${appearance}.png`) })
      await expect(input.locator('a')).toHaveCSS('color', await input.evaluate((el) => getComputedStyle(el).color))
      await expect(neighbor.locator('a')).toHaveCSS(
        'color',
        await neighbor.evaluate((el) => getComputedStyle(el).color),
      )
      await expect(input).toHaveCSS('text-decoration-line', 'line-through')
      await expect(neighbor).toHaveCSS('text-decoration-line', 'none')
    }

    await window.keyboard.press('Escape')
    await expect(input.locator('a')).toHaveCSS('color', await input.evaluate((el) => getComputedStyle(el).color))
    await expect(input.locator('a')).toHaveCSS('text-decoration-line', 'none')
    await expect(neighbor.locator('a')).toHaveCSS('color', 'rgb(40, 72, 169)')
  })
})
