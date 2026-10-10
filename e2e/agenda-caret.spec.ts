// @editing-modes: both
import type { Locator } from '@playwright/test'
import type { TreeNode } from '../src/domain/document'
import {
  describeForEachEditingMode,
  expect,
  launchTree,
  lockSystemClipboard,
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
          node('team', 'Team A', [leaf('prepare', '2026-10-14 Prepare rollout'), leaf('later', '2026-11-01 Review')]),
        ]),
      ],
    },
    location: { currentParentId: null, selectedNodeId: 'work' },
  })
}

const TODAY_LABEL = 'Thu Oct 8 · TODAY'

interface Mark {
  text: string
  /** Characters of the row's text before the mark. */
  before: number
  background: string
  leftBorder: string
}

/** Reads the stand-in caret the renderer draws in a row without an editor. */
async function caretMark(row: Locator): Promise<Mark | undefined> {
  return row.evaluate((element) => {
    const mark = element.querySelector('.agenda-caret')
    const host = element.querySelector('.agenda-label, .agenda-text, .agenda-focused-heading')
    if (mark === null) return undefined
    const range = document.createRange()
    range.selectNodeContents(host ?? element)
    range.setEndBefore(mark)
    const style = getComputedStyle(mark)
    return {
      text: mark.textContent ?? '',
      before: range.toString().length,
      background: style.backgroundColor,
      leftBorder: `${style.borderLeftWidth} ${style.borderLeftStyle}`,
    }
  })
}

const selectionText = (row: Locator): Promise<string | undefined> =>
  row.evaluate((element) => element.querySelector('.agenda-selection')?.textContent ?? undefined)

describeForEachEditingMode('Agenda caret on rows without an editor', ({ mode, screenshotName }) => {
  // @requirement PRODUCT.md §23.4
  test('carries the caret through a day and contextual ancestor into another editor', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: {
        roots: [
          leaf('first', '2026-10-09 First'),
          node('parent', 'Context ancestor', [leaf('second', '2026-10-10 Second')]),
        ],
      },
      location: { currentParentId: null, selectedNodeId: 'first' },
    })
    const { window, app } = await launchTree(userDataDir)
    await setMainWindowContentSize(app, screenshotContentSize)
    await setAgendaToday(window)
    await window.keyboard.press('Meta+p')
    await window.keyboard.press('Escape')
    await window.keyboard.press('ArrowDown')
    await window.keyboard.press('ArrowDown')
    const selected = window.locator('.agenda-row[aria-selected="true"]')
    await expect(selected).toHaveAttribute('data-node-id', 'first')
    if (mode === 'vim') await window.keyboard.type('0' + '5l')
    else {
      await window.keyboard.press('Home')
      await window.keyboard.press('ArrowRight')
      await window.keyboard.press('ArrowRight')
      await window.keyboard.press('ArrowRight')
      await window.keyboard.press('ArrowRight')
      await window.keyboard.press('ArrowRight')
    }
    const down = mode === 'vim' ? 'j' : 'ArrowDown'
    await window.keyboard.press(down)
    await expect(selected).toHaveClass(/agenda-row-day/u)
    expect((await caretMark(selected))!.before).toBe(5)
    await expect(window).toHaveScreenshot(screenshotName('agenda-caret-arrival-light.png'))
    await window.emulateMedia({ colorScheme: 'dark' })
    await expect(window).toHaveScreenshot(screenshotName('agenda-caret-arrival-dark.png'))
    await window.emulateMedia({ colorScheme: 'light' })
    await window.keyboard.press(down)
    await expect(selected).toHaveAttribute('data-node-id', 'parent')
    expect((await caretMark(selected))!.before).toBe(5)
    await window.keyboard.press(down)
    await expect(selected).toHaveAttribute('data-node-id', 'second')
    expect(
      await selected.locator('.node-input').evaluate((input) => {
        if (input instanceof HTMLTextAreaElement) return input.selectionStart
        const selection = document.getSelection()!
        const range = document.createRange()
        range.selectNodeContents(input)
        range.setEnd(selection.anchorNode!, selection.anchorOffset)
        return range.toString().length
      }),
    ).toBe(5)
  })

  // @requirement PRODUCT.md §23.4
  test('shows the caret on days, gaps and contextual ancestors but not on unselected rows', async ({ userDataDir }) => {
    seed(userDataDir)
    const { window, app } = await launchTree(userDataDir)
    await setMainWindowContentSize(app, screenshotContentSize)
    await setAgendaToday(window)
    await window.keyboard.press('Meta+p')
    await window.keyboard.press('Escape')
    const today = window.locator('.agenda-today')
    await expect(today).toHaveAttribute('aria-selected', 'true')
    const expectCaret = async (row: Locator, first: string): Promise<void> => {
      const mark = await caretMark(row)
      expect(mark).toBeDefined()
      expect(mark!.before).toBe(0)
      if (mode === 'vim') {
        expect(mark!.text).toBe(first)
        expect(mark!.background).not.toBe('rgba(0, 0, 0, 0)')
        expect(mark!.leftBorder).toBe('0px none')
      } else {
        expect(mark!.text).toBe('')
        expect(mark!.background).toBe('rgba(0, 0, 0, 0)')
        expect(mark!.leftBorder).toBe('1px solid')
      }
    }
    await expectCaret(today, 'T')
    await window.keyboard.press('ArrowDown')
    const selected = window.locator('.agenda-row[aria-selected="true"]')
    await expect(selected).toContainText('Fri Oct 9')
    await expectCaret(selected, 'F')
    expect(await caretMark(today)).toBeUndefined()
    const gap = window.locator('.agenda-row-gap').first()
    await gap.click()
    await expect(gap).toHaveAttribute('aria-selected', 'true')
    await expectCaret(gap, '1')
    const work = window.locator('.agenda-row[data-node-id="work"]').first()
    await work.click()
    await expect(work).toHaveAttribute('aria-selected', 'true')
    await expectCaret(work, 'W')
    expect(await caretMark(gap)).toBeUndefined()
  })

  // @requirement PRODUCT.md §23.4
  test('leaves no second caret in the editor that selection moved away from', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: { roots: [leaf('item', '2026-10-09 Item'), leaf('other', '2026-10-10 Other')] },
      location: { currentParentId: null, selectedNodeId: 'item' },
    })
    const { window } = await launchTree(userDataDir)
    await setAgendaToday(window)
    await window.keyboard.press('Meta+p')
    await window.keyboard.press('Escape')
    const selected = window.locator('.agenda-row[aria-selected="true"]')
    const nativeSelectionInEditor = (): Promise<boolean> =>
      window.evaluate(() => {
        const selection = document.getSelection()
        return (
          selection !== null &&
          selection.rangeCount > 0 &&
          selection.anchorNode?.parentElement?.closest('.node-input') != null
        )
      })
    await window.keyboard.press('ArrowDown')
    await window.keyboard.press('ArrowDown')
    await expect(selected).toHaveAttribute('data-node-id', 'item')
    expect(await nativeSelectionInEditor()).toBe(true)
    await window.keyboard.press(mode === 'vim' ? 'k' : 'ArrowUp')
    await expect(selected).toHaveClass(/agenda-row-day/u)
    await expect(selected).toBeFocused()
    expect(await nativeSelectionInEditor()).toBe(false)
  })

  // @requirement PRODUCT.md §23.4
  test('moves, selects and copies over the text of a day without editing', async ({ userDataDir }) => {
    seed(userDataDir)
    const { window, app } = await launchTree(userDataDir)
    await lockSystemClipboard()
    await setMainWindowContentSize(app, screenshotContentSize)
    await setAgendaToday(window)
    await window.keyboard.press('Meta+p')
    await window.keyboard.press('Escape')
    const today = window.locator('.agenda-today')
    await expect(today).toHaveAttribute('aria-selected', 'true')
    const clipboard = (): Promise<string> => app.evaluate(({ clipboard }) => clipboard.readText())
    if (mode === 'vim') {
      await window.keyboard.type('3l')
      expect((await caretMark(today))!.before).toBe(3)
      await window.keyboard.press('$')
      expect((await caretMark(today))!).toMatchObject({ before: TODAY_LABEL.length - 1, text: 'Y' })
      await window.keyboard.press('l')
      expect((await caretMark(today))!.before).toBe(TODAY_LABEL.length - 1)
      await window.keyboard.type('0')
      expect((await caretMark(today))!.before).toBe(0)
      await window.keyboard.type('fO')
      expect((await caretMark(today))!.before).toBe(4)
      await window.keyboard.type('w')
      expect((await caretMark(today))!.before).toBe(8)
      await window.keyboard.type('0vee')
      await expect(window.locator('.vim-mode-indicator, [aria-label="Vim mode"]').first()).toHaveText('VISUAL')
      expect(await selectionText(today)).toBe('Thu Oct')
      await expect(window).toHaveScreenshot(screenshotName('agenda-caret-selection-light.png'))
      await window.emulateMedia({ colorScheme: 'dark' })
      await expect(window).toHaveScreenshot(screenshotName('agenda-caret-selection-dark.png'))
      await window.emulateMedia({ colorScheme: 'light' })
      await window.keyboard.press('y')
      await expect.poll(clipboard).toBe('Thu Oct')
      await expect(window.getByLabel('Vim mode')).toHaveText('NORMAL')
      expect((await caretMark(today))!.before).toBe(0)
      await window.keyboard.press('l')
      await window.keyboard.press('Meta+c')
      await expect.poll(clipboard).toBe('h')
    } else {
      await window.keyboard.press('ArrowRight')
      await window.keyboard.press('ArrowRight')
      expect((await caretMark(today))!.before).toBe(2)
      await window.keyboard.press('Shift+ArrowRight')
      await window.keyboard.press('Shift+ArrowRight')
      await window.keyboard.press('Shift+ArrowRight')
      expect(await selectionText(today)).toBe('u O')
      await expect(window).toHaveScreenshot(screenshotName('agenda-caret-selection-light.png'))
      await window.emulateMedia({ colorScheme: 'dark' })
      await expect(window).toHaveScreenshot(screenshotName('agenda-caret-selection-dark.png'))
      await window.emulateMedia({ colorScheme: 'light' })
      await window.keyboard.press('Meta+c')
      await expect.poll(clipboard).toBe('u O')
      await window.keyboard.press('ArrowLeft')
      expect((await caretMark(today))!.before).toBe(2)
      await window.keyboard.press('Meta+ArrowRight')
      expect((await caretMark(today))!.before).toBe(TODAY_LABEL.length)
      await window.keyboard.press('Home')
      expect((await caretMark(today))!.before).toBe(0)
    }
    // Typing and editing keys leave every text alone and never open an editor on the row.
    const texts = await window.locator('.agenda-row').allTextContents()
    await window.keyboard.type('ixdD')
    await expect(today.locator('.agenda-label')).toHaveText(TODAY_LABEL)
    await expect(today.locator('.node-input')).toHaveCount(0)
    expect(await window.locator('.agenda-row').allTextContents()).toEqual(texts)
    // Vertical navigation carries the current position rather than resetting it.
    const beforeNavigation = (await caretMark(today))!.before
    await window.keyboard.press('ArrowDown')
    await window.keyboard.press('ArrowUp')
    await expect(today).toHaveAttribute('aria-selected', 'true')
    expect((await caretMark(today))!.before).toBe(beforeNavigation)
  })
})
