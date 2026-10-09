// @editing-modes: vim
import type { TreeNode } from '../src/domain/document'
import { expect, launchTree, readPersisted, seedDocument, setAgendaToday, test } from './fixtures'

const node = (id: string, text: string, children: TreeNode[] = []): TreeNode => ({ id, text, children })
const dayNumber = (month: number, day: number): number => Math.round(Date.UTC(2026, month - 1, day) / 86_400_000)

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
})
