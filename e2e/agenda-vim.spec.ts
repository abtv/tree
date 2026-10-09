// @editing-modes: vim
import type { Page } from '@playwright/test'
import type { TreeNode } from '../src/domain/document'
import {
  expect,
  launchTree,
  readPersisted,
  screenshotContentSize,
  seedDocument,
  setAgendaToday,
  setMainWindowContentSize,
  test,
  writeClipboardText,
} from './fixtures'

const node = (id: string, text: string, children: TreeNode[] = []): TreeNode => ({ id, text, children })
const dayNumber = (month: number, day: number): number => Math.round(Date.UTC(2026, month - 1, day) / 86_400_000)
const dayKey = (month: number, day: number): string => `day:${dayNumber(month, day)}`
const nodeKey = (month: number, day: number, id: string): string => `node:${dayNumber(month, day)}:${id}`
const gapKey = `gap:${dayNumber(10, 17)}:${dayNumber(11, 30)}`
const row = (window: Page, key: string) => window.locator(`.agenda-row[data-agenda-key="${key}"]`)
const message = (window: Page) => window.locator('.status-bar-message')
const persistedTexts = (userDataDir: string): string[] =>
  readPersisted(userDataDir).document.roots[0]!.children.map((child) => child.text)

function seedPending(userDataDir: string): void {
  seedDocument(userDataDir, {
    document: {
      roots: [
        node('context', 'Context', [
          node('plan', '2026-10-14 Prepare', [node('step', 'Step')]),
          node('other', '2026-10-14 Other'),
          node('later', '2026-10-16 Later'),
        ]),
        // Far enough away that Oct 17 – Nov 30 is one gap.
        node('far', '2026-12-01 Far'),
      ],
    },
    location: { currentParentId: null, selectedNodeId: 'context' },
  })
}

/** Open Agenda, put the focus in a direct match's editor and return to Normal. */
async function openAndSelect(window: Page, key: string): Promise<void> {
  await setAgendaToday(window)
  await window.keyboard.press('Meta+p')
  await row(window, key).click()
  await row(window, key).locator('.node-input').click()
  await window.keyboard.press('Escape')
}

function seed(userDataDir: string): void {
  seedDocument(userDataDir, {
    document: {
      roots: [
        node('context', 'Context', [
          node('plan', '2026-10-14 Prepare', [node('step', 'Step')]),
          node('other', '2026-10-14 Other'),
        ]),
      ],
    },
    location: { currentParentId: null, selectedNodeId: 'context' },
  })
}

test.describe('Agenda Vim commands', () => {
  // @requirement PRODUCT.md §23.14
  test('Visual group selection skips contextual rows and other levels and moves across real parents in one Undo', async ({
    userDataDir,
  }) => {
    seedDocument(userDataDir, {
      document: {
        roots: [
          node('left', 'Left', [
            node('a', '2026-10-14 A 2026-10-20', [node('child', '2026-10-14 Child')]),
            node('b', '2026-10-14 B'),
          ]),
          node('right', 'Right', [node('c', '2026-10-14 C')]),
          node('target', '2026-10-16 Target'),
        ],
      },
      location: { currentParentId: null, selectedNodeId: 'left' },
    })
    const { window, app } = await launchTree(userDataDir)
    await writeClipboardText(app, 'clipboard before')
    await openAndSelect(window, nodeKey(10, 14, 'a'))
    await window.keyboard.press('V')
    await expect(window.getByLabel('Vim mode')).toHaveText('VISUAL NODE')
    await window.keyboard.press('2')
    await window.keyboard.press('j')
    await expect(row(window, nodeKey(10, 14, 'c')).locator('.node-input')).toBeFocused()
    await expect(window.locator('.agenda-row-visual-selected')).toHaveCount(3)
    for (const id of ['a', 'b', 'c'])
      await expect(row(window, nodeKey(10, 14, id))).toHaveClass(/agenda-row-visual-selected/)
    for (const id of ['left', 'right', 'child'])
      await expect(row(window, nodeKey(10, 14, id))).not.toHaveClass(/agenda-row-visual-selected/)
    await expect(row(window, nodeKey(10, 20, 'a'))).not.toHaveClass(/agenda-row-visual-selected/)
    // Unsupported range edits cannot reach Tree operations.
    for (const key of ['>', '<', 'J', 'c', 'y', 'p', 'Meta+Enter']) await window.keyboard.press(key)
    await expect(window.locator('.agenda-row-visual-selected')).toHaveCount(3)
    await window.keyboard.press('o')
    await expect(row(window, nodeKey(10, 14, 'a')).locator('.node-input')).toBeFocused()
    await window.keyboard.press('g')
    await window.keyboard.press('g')
    await window.keyboard.press('G')
    await expect(window.locator('.agenda-row-visual-selected')).toHaveCount(1)
    await window.keyboard.press('g')
    await window.keyboard.press('g')
    await expect(window.locator('.agenda-row-visual-selected')).toHaveCount(3)
    await window.keyboard.press('d')
    await expect(window.getByLabel('Vim mode')).toHaveText('NORMAL')
    await expect(window.locator('.agenda-row-pending')).toHaveCount(3)
    await expect(window.locator('.agenda-row-visual-selected')).toHaveCount(0)
    await row(window, dayKey(10, 16)).locator('.agenda-label').click()
    await window.keyboard.press('p')
    const texts = () =>
      readPersisted(userDataDir).document.roots.flatMap((root) => root.children.map((child) => child.text))
    await expect.poll(texts, { timeout: 20000 }).toEqual(['2026-10-16 A 2026-10-20', '2026-10-16 B', '2026-10-16 C'])
    expect(readPersisted(userDataDir).document.roots[0]!.children[0]!.children[0]!.text).toBe('2026-10-14 Child')
    await expect(row(window, nodeKey(10, 16, 'a'))).toHaveAttribute('aria-selected', 'true')
    await window.keyboard.press('Escape')
    await window.keyboard.press('u')
    await expect.poll(texts, { timeout: 20000 }).toEqual(['2026-10-14 A 2026-10-20', '2026-10-14 B', '2026-10-14 C'])
    await expect.poll(() => app.evaluate(({ clipboard }) => clipboard.readText())).toBe('clipboard before')
  })

  // @requirement PRODUCT.md §23.14
  test('Visual range exits on Escape, pointer selection, hidden endpoints and leaving Agenda', async ({
    userDataDir,
  }) => {
    seedPending(userDataDir)
    const { window } = await launchTree(userDataDir)
    await openAndSelect(window, nodeKey(10, 14, 'plan'))
    await window.keyboard.press('V')
    await window.keyboard.press('j')
    await window.keyboard.press('Escape')
    await expect(window.locator('.agenda-row-visual-selected')).toHaveCount(0)
    await window.keyboard.press('V')
    await row(window, dayKey(10, 16)).locator('.agenda-label').click()
    await expect(window.getByLabel('Vim mode')).toHaveText('NORMAL')
    await window.keyboard.press('V')
    await expect(window.getByLabel('Vim mode')).toHaveText('NORMAL')
    await row(window, nodeKey(10, 14, 'plan'))
      .locator('.node-input')
      .click()
    await window.keyboard.press('V')
    await row(window, dayKey(10, 14)).locator('.node-disclosure-triangle').click()
    await expect(window.getByLabel('Vim mode')).toHaveText('NORMAL')
    await row(window, dayKey(10, 14)).locator('.node-disclosure-triangle').click()
    await row(window, nodeKey(10, 14, 'plan'))
      .locator('.node-input')
      .click()
    await window.keyboard.press('d')
    await window.keyboard.press('d')
    await window.keyboard.press('V')
    await window.keyboard.press('Escape')
    await expect(message(window)).toHaveCount(0)
    await window.keyboard.press('V')
    await window.keyboard.press('Meta+p')
    await expect(window.getByLabel('Vim mode')).toHaveText('NORMAL')
  })

  // @requirement PRODUCT.md §23.14
  test('highlights only qualifying Visual rows in light and dark appearances', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: {
        roots: [
          node('left', 'Left', [node('a', '2026-10-14 A'), node('b', '2026-10-14 B')]),
          node('right', 'Right', [node('c', '2026-10-14 C')]),
        ],
      },
      location: { currentParentId: null, selectedNodeId: 'left' },
    })
    const { window, app } = await launchTree(userDataDir)
    await setMainWindowContentSize(app, screenshotContentSize)
    await openAndSelect(window, nodeKey(10, 14, 'a'))
    await window.keyboard.press('V')
    await window.keyboard.press('G')
    await expect(window.locator('.agenda-row-visual-selected')).toHaveCount(3)
    for (const appearance of ['light', 'dark'] as const) {
      await window.emulateMedia({ colorScheme: appearance })
      await expect(window).toHaveScreenshot(`agenda-visual-selection-${appearance}.png`)
    }
  })

  // @requirement PRODUCT.md §23.11
  test('o and O on a dated node create dated real siblings in Insert, and one Undo removes each', async ({
    userDataDir,
  }) => {
    seed(userDataDir)
    const { window } = await launchTree(userDataDir)
    await setAgendaToday(window)
    await window.keyboard.press('Meta+p')
    await window.locator('.agenda-row[data-node-id="plan"]').first().click()
    await window.keyboard.press('Escape')
    await window.keyboard.press('o')
    const created = window.locator('.agenda-row[aria-selected="true"] .node-input')
    await expect(created).toBeFocused()
    await expect(created).toHaveText('2026-10-14 ')
    await expect(window.getByLabel('Vim mode')).toHaveText('INSERT')
    await window.keyboard.type('After')
    await expect(window.locator(`[data-agenda-key^="node:${dayNumber(10, 14)}:"]`)).toHaveCount(4)
    await expect
      .poll(() => readPersisted(userDataDir).document.roots[0]!.children.map((entry) => entry.text), {
        timeout: 20000,
      })
      .toEqual(['2026-10-14 Prepare', '2026-10-14 After', '2026-10-14 Other'])
    // The sibling follows the node and its subtree; the node keeps its child.
    expect(readPersisted(userDataDir).document.roots[0]!.children[0]!.children.map((entry) => entry.id)).toEqual([
      'step',
    ])
    await window.keyboard.press('Escape')
    await window.locator('.agenda-row[data-node-id="other"]').first().click()
    await window.keyboard.press('Escape')
    await window.keyboard.press('O')
    await expect(created).toBeFocused()
    await expect(created).toHaveText('2026-10-14 ')
    await expect(window.getByLabel('Vim mode')).toHaveText('INSERT')
    await expect
      .poll(() => readPersisted(userDataDir).document.roots[0]!.children.map((entry) => entry.text), {
        timeout: 20000,
      })
      .toEqual(['2026-10-14 Prepare', '2026-10-14 After', '2026-10-14 ', '2026-10-14 Other'])
    await window.keyboard.press('Escape')
    await window.keyboard.press('u')
    await expect
      .poll(() => readPersisted(userDataDir).document.roots[0]!.children.map((entry) => entry.text), {
        timeout: 20000,
      })
      .toEqual(['2026-10-14 Prepare', '2026-10-14 After', '2026-10-14 Other'])
  })

  // @requirement PRODUCT.md §23.11
  test('o, O, and a counted o do nothing on a contextual ancestor and a counted o on a match', async ({
    userDataDir,
  }) => {
    seed(userDataDir)
    const { window } = await launchTree(userDataDir)
    await setAgendaToday(window)
    await window.keyboard.press('Meta+p')
    const context = window.locator('.agenda-row[data-node-id="context"]').first()
    await context.click()
    for (const key of ['o', 'O', 'Enter']) await window.keyboard.press(key)
    await expect(context).toBeFocused()
    await window.locator('.agenda-row[data-node-id="plan"]').first().click()
    await window.keyboard.press('Escape')
    await window.keyboard.press('2')
    await window.keyboard.press('o')
    await expect(window.getByLabel('Vim mode')).toHaveText('NORMAL')
    await expect(window.getByRole('textbox', { name: 'Agenda node plan', exact: true })).toBeFocused()
    expect(readPersisted(userDataDir).document.roots[0]!.children.map((entry) => entry.id)).toEqual(['plan', 'other'])
  })

  // @requirement PRODUCT.md §23.13
  test('dd marks an occurrence, navigation keeps it, and p on a day puts it in one undoable move', async ({
    userDataDir,
  }) => {
    seedPending(userDataDir)
    const { window, app } = await launchTree(userDataDir)
    await writeClipboardText(app, 'clipboard before')
    await openAndSelect(window, nodeKey(10, 14, 'plan'))
    await window.keyboard.press('d')
    await window.keyboard.press('d')
    await expect(window.locator('.agenda-row-pending')).toHaveCount(1)
    await expect(row(window, nodeKey(10, 14, 'plan'))).toHaveClass(/agenda-row-pending/)
    await expect(message(window)).toHaveText('Moving 1 item · p to put · Esc to cancel')
    // Marking edits nothing: the node still reads and persists as before.
    await expect(row(window, nodeKey(10, 14, 'plan')).locator('.node-input')).toHaveText('2026-10-14 Prepare')

    // Navigation, folding, and expanding a gap keep the move.
    await window.keyboard.press('j')
    await window.keyboard.press('k')
    await row(window, dayKey(10, 14)).locator('.agenda-label').click()
    await window.keyboard.press('z')
    await window.keyboard.press('c')
    await window.keyboard.press('z')
    await window.keyboard.press('o')
    await row(window, gapKey).locator('.agenda-label').click()
    await window.keyboard.press('Meta+e')
    await expect(row(window, dayKey(10, 17))).toHaveCount(1)
    await expect(message(window)).toHaveText('Moving 1 item · p to put · Esc to cancel')
    await expect(row(window, nodeKey(10, 14, 'plan'))).toHaveClass(/agenda-row-pending/)

    // A gap is not a day: p leaves the move pending.
    await window.keyboard.press('p')
    await expect(message(window)).toHaveCount(1)
    await expect(row(window, nodeKey(10, 14, 'plan'))).toHaveCount(1)

    await row(window, dayKey(10, 16)).locator('.agenda-label').click()
    await window.keyboard.press('p')
    await expect(row(window, nodeKey(10, 16, 'plan'))).toHaveAttribute('aria-selected', 'true')
    await expect(row(window, nodeKey(10, 14, 'plan'))).toHaveCount(0)
    await expect(window.locator('.agenda-row-pending')).toHaveCount(0)
    await expect(message(window)).toHaveCount(0)
    await expect
      .poll(() => persistedTexts(userDataDir), { timeout: 20000 })
      .toEqual(['2026-10-16 Prepare', '2026-10-14 Other', '2026-10-16 Later'])
    // The node keeps its parent and children.
    expect(readPersisted(userDataDir).document.roots[0]!.children[0]!.children.map((entry) => entry.id)).toEqual([
      'step',
    ])

    await window.keyboard.press('Escape')
    await window.keyboard.press('u')
    await expect
      .poll(() => persistedTexts(userDataDir), { timeout: 20000 })
      .toEqual(['2026-10-14 Prepare', '2026-10-14 Other', '2026-10-16 Later'])
    await expect.poll(() => app.evaluate(({ clipboard }) => clipboard.readText())).toBe('clipboard before')
  })

  // @requirement PRODUCT.md §23.13
  test('a counted dd marks following direct matches of the day and one put moves all of them', async ({
    userDataDir,
  }) => {
    seedPending(userDataDir)
    const { window } = await launchTree(userDataDir)
    await openAndSelect(window, nodeKey(10, 14, 'plan'))
    await window.keyboard.press('2')
    await window.keyboard.press('d')
    await window.keyboard.press('d')
    await expect(message(window)).toHaveText('Moving 2 items · p to put · Esc to cancel')
    await expect(window.locator('.agenda-row-pending')).toHaveCount(2)
    // Clicking another direct match selects it and keeps Normal mode, so the move stays pending.
    await row(window, nodeKey(10, 16, 'later'))
      .locator('.node-input')
      .click()
    await expect(message(window)).toHaveText('Moving 2 items · p to put · Esc to cancel')
    await expect(window.getByLabel('Vim mode')).toHaveText('NORMAL')
    await window.keyboard.press('P')
    await expect
      .poll(() => persistedTexts(userDataDir), { timeout: 20000 })
      .toEqual(['2026-10-16 Prepare', '2026-10-16 Other', '2026-10-16 Later'])
    await window.keyboard.press('Escape')
    await window.keyboard.press('u')
    await expect
      .poll(() => persistedTexts(userDataDir), { timeout: 20000 })
      .toEqual(['2026-10-14 Prepare', '2026-10-14 Other', '2026-10-16 Later'])
  })

  // @requirement PRODUCT.md §23.13
  test('Escape, a text edit, Undo, Cmd+P, and Cmd+. cancel the move without an edit or Undo entry', async ({
    userDataDir,
  }) => {
    seedPending(userDataDir)
    const { window } = await launchTree(userDataDir)
    await openAndSelect(window, nodeKey(10, 14, 'plan'))
    const mark = async (): Promise<void> => {
      await window.keyboard.press('d')
      await window.keyboard.press('d')
      await expect(message(window)).toHaveCount(1)
    }

    await mark()
    await window.keyboard.press('Escape')
    await expect(message(window)).toHaveCount(0)
    await expect(window.locator('.agenda-row-pending')).toHaveCount(0)

    // A text edit cancels the move; the edit is the only history entry.
    await mark()
    await window.keyboard.press('A')
    await window.keyboard.type('!')
    await expect(message(window)).toHaveCount(0)
    await window.keyboard.press('Escape')
    await expect.poll(() => persistedTexts(userDataDir), { timeout: 20000 }).toContain('2026-10-14 Prepare!')

    // Undo cancels a move and reverts only the earlier edit.
    await mark()
    await window.keyboard.press('u')
    await expect(message(window)).toHaveCount(0)
    await expect
      .poll(() => persistedTexts(userDataDir), { timeout: 20000 })
      .toEqual(['2026-10-14 Prepare', '2026-10-14 Other', '2026-10-16 Later'])

    // Leaving Agenda discards the move.
    await row(window, nodeKey(10, 14, 'plan'))
      .locator('.node-input')
      .click()
    await window.keyboard.press('Escape')
    await mark()
    await window.keyboard.press('Meta+p')
    await expect(window.locator('.agenda-list')).toHaveCount(0)
    await window.keyboard.press('Meta+p')
    await expect(window.locator('.agenda-list')).toHaveCount(1)
    await expect(message(window)).toHaveCount(0)

    await row(window, nodeKey(10, 14, 'plan'))
      .locator('.node-input')
      .click()
    await window.keyboard.press('Escape')
    await mark()
    await window.keyboard.press('Meta+.')
    await expect(window.locator('.agenda-list')).toHaveCount(0)
    await window.keyboard.press('Meta+p')
    await expect(message(window)).toHaveCount(0)
    expect(persistedTexts(userDataDir)).toEqual(['2026-10-14 Prepare', '2026-10-14 Other', '2026-10-16 Later'])
  })

  // @requirement PRODUCT.md §23.13
  test('p without a pending move changes nothing on a day and with a node register', async ({ userDataDir }) => {
    seedPending(userDataDir)
    const { window } = await launchTree(userDataDir)
    await openAndSelect(window, nodeKey(10, 14, 'plan'))
    await window.keyboard.press('p')
    await window.keyboard.press('P')
    await row(window, dayKey(10, 16)).locator('.agenda-label').click()
    await window.keyboard.press('p')
    await expect(message(window)).toHaveCount(0)
    expect(persistedTexts(userDataDir)).toEqual(['2026-10-14 Prepare', '2026-10-14 Other', '2026-10-16 Later'])
    await expect(row(window, nodeKey(10, 14, 'plan'))).toHaveCount(1)
  })

  // @requirement PRODUCT.md §23.13
  test('dims a pending source and shows the status message in light and dark appearances', async ({ userDataDir }) => {
    seedPending(userDataDir)
    const { window, app } = await launchTree(userDataDir)
    await setMainWindowContentSize(app, screenshotContentSize)
    await openAndSelect(window, nodeKey(10, 14, 'plan'))
    await window.keyboard.press('d')
    await window.keyboard.press('d')
    await expect(message(window)).toHaveText('Moving 1 item · p to put · Esc to cancel')
    // The marked node's text, bullet, and chevron are dimmed; the unmarked neighbor is not.
    const opacity = (key: string, selector: string): Promise<string> =>
      row(window, key)
        .locator(selector)
        .first()
        .evaluate((element) => getComputedStyle(element).opacity)
    expect(await opacity(nodeKey(10, 14, 'plan'), '.node-input')).toBe('0.38')
    expect(await opacity(nodeKey(10, 14, 'plan'), '.node-enter-control')).toBe('0.38')
    expect(await opacity(nodeKey(10, 14, 'other'), '.node-input, .agenda-text')).toBe('1')
    for (const appearance of ['light', 'dark'] as const) {
      await window.emulateMedia({ colorScheme: appearance })
      await expect(window).toHaveScreenshot(`agenda-pending-move-${appearance}.png`)
    }
  })
})
