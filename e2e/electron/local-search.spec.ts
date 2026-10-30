// @editing-modes: both
import {
  test,
  expect,
  launchTree,
  seedDocument,
  describeForEachEditingMode,
  clickApplicationMenuItem,
} from './fixtures'

describeForEachEditingMode('Local search', () => {
  test('keeps Find geometry and focus stable while typing and counting', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: { roots: [{ id: 'one', text: 'apple apple', children: [] }] },
      location: { currentParentId: null, selectedNodeId: 'one' },
    })
    const { window } = await launchTree(userDataDir)
    await window.keyboard.press('Meta+f')
    const prompt = window.getByRole('textbox', { name: 'Search', exact: true })
    await window.evaluate(() => {
      const panel = document.querySelector('.local-search-panel')!
      const input = panel.querySelector('input')!
      const probe = {
        widths: [input.getBoundingClientRect().width],
        lostFocus: false,
        replaced: false,
        blankCount: false,
      }
      const observer = new MutationObserver(() => {
        probe.widths.push(input.getBoundingClientRect().width)
        probe.lostFocus ||= document.activeElement !== input
        probe.replaced ||= !input.isConnected || !panel.isConnected
        probe.blankCount ||= panel.querySelector('.search-count')?.textContent === ''
      })
      observer.observe(panel, { childList: true, subtree: true, characterData: true })
      Object.assign(window, { findGeometry: { probe, observer } })
    })

    await prompt.pressSequentially('apple', { delay: 30 })
    await expect(window.locator('.search-count')).toHaveText('2')
    await prompt.press('Enter')
    await expect(window.locator('.search-count')).toHaveText('2 / 2')
    await prompt.press('End')
    await prompt.pressSequentially('xyz', { delay: 30 })
    await expect(window.locator('.search-count')).toHaveText('0')
    const probe = await window.evaluate(() => {
      const { probe, observer } = (
        window as unknown as {
          findGeometry: {
            probe: { widths: number[]; lostFocus: boolean; replaced: boolean; blankCount: boolean }
            observer: MutationObserver
          }
        }
      ).findGeometry
      observer.disconnect()
      return probe
    })

    expect(probe.lostFocus).toBe(false)
    expect(probe.replaced).toBe(false)
    expect(probe.blankCount).toBe(false)
    expect(Math.max(...probe.widths) - Math.min(...probe.widths)).toBeLessThan(1)
  })

  test('closes Find on a text click and retains the query for recall and repeat', async ({ userDataDir }, testInfo) => {
    seedDocument(userDataDir, {
      document: {
        roots: [
          { id: 'one', text: 'apple apple', children: [] },
          { id: 'two', text: 'notes', children: [] },
        ],
      },
      location: { currentParentId: null, selectedNodeId: 'one' },
    })
    const { window } = await launchTree(userDataDir)
    await window.keyboard.press('Meta+f')
    const prompt = window.getByRole('textbox', { name: 'Search', exact: true })
    await prompt.fill('apple')
    await window.keyboard.press('Enter')
    await expect(window.locator('.search-count')).toHaveText('2 / 2')

    const editor = window.getByRole('textbox', { name: 'Node 2', exact: true })
    await editor.click()

    await expect(window.locator('.local-search-panel')).toHaveCount(0)
    await expect(window.locator('.search-match')).toHaveCount(0)
    await expect(editor).toBeFocused()
    await window.keyboard.press('Home')
    await window.keyboard.type('Z')
    await expect(editor).toHaveText('Znotes')
    await window.screenshot({ path: testInfo.outputPath('search-closed-after-click.png') })
    await window.keyboard.press('Meta+f')
    await expect(prompt).toHaveValue('apple')
    await prompt.fill('discarded')
    await editor.click()
    await expect(window.locator('.local-search-panel')).toHaveCount(0)
    await window.keyboard.press('Meta+g')
    await expect(window.locator('.search-count')).toHaveText('1 / 2')
  })

  test('keeps Find focused through repeated Enter and restores the last match on Escape', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: {
        roots: [
          { id: 'one', text: 'apple apple', children: [] },
          { id: 'two', text: 'apple', children: [] },
        ],
      },
      location: { currentParentId: null, selectedNodeId: 'one' },
    })
    const { window } = await launchTree(userDataDir)
    await window.keyboard.press('Meta+f')
    const prompt = window.getByRole('textbox', { name: 'Search', exact: true })
    await prompt.fill('apple')

    for (const count of ['2 / 3', '3 / 3']) {
      await window.keyboard.press('Enter')
      await expect(window.locator('.search-count')).toHaveText(count)
      await expect(prompt).toBeFocused()
    }
    await window.keyboard.press('Shift+Enter')
    await expect(window.locator('.search-count')).toHaveText('2 / 3')
    await expect(prompt).toBeFocused()
    await prompt.press('End')
    await prompt.pressSequentially('xyz')
    await expect(prompt).toHaveValue('applexyz')
    await expect(window.locator('.search-count')).toHaveText('0')
    await prompt.press('Backspace')
    await prompt.press('Backspace')
    await prompt.press('Backspace')
    await window.keyboard.press('Enter')
    await expect(window.locator('.search-count')).toHaveText('3 / 3')
    await window.keyboard.press('Shift+Enter')
    await expect(window.locator('.search-count')).toHaveText('2 / 3')
    await window.keyboard.press('Escape')

    const editor = window.getByRole('textbox', { name: 'Node 1', exact: true })
    await expect(editor).toBeFocused()
    await expect(window.locator('.local-search-panel')).toHaveCount(0)
    await window.keyboard.type('Z')
    await expect(editor).toHaveText('apple Zapple')
  })

  test('preserves the native editing selection when a local search is canceled', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: { roots: [{ id: 'one', text: 'apple apple', children: [] }] },
      location: { currentParentId: null, selectedNodeId: 'one' },
    })
    const { window } = await launchTree(userDataDir, { initialMode: 'insert' })
    const editor = window.getByRole('textbox', { name: 'Node 1', exact: true })
    await expect(editor).toBeFocused()
    for (let index = 0; index < 3; index++) await window.keyboard.press('Shift+ArrowRight')

    await window.keyboard.press('Meta+f')
    await window.getByRole('textbox', { name: 'Search', exact: true }).fill('discard')
    await window.keyboard.press('Escape')

    await expect(editor).toBeFocused()
    await window.keyboard.type('Z')
    await expect(editor).toHaveText('Zle apple')
  })

  test('searches Agenda contextual rows without leaving the presentation', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: {
        roots: [
          { id: 'parent', text: 'apple apple', children: [{ id: 'dated', text: 'apple 2026-10-14', children: [] }] },
        ],
      },
      location: { currentParentId: null, selectedNodeId: 'parent' },
    })
    const { window } = await launchTree(userDataDir)
    await window.keyboard.press('Meta+p')
    await window.locator('.agenda-row').filter({ hasText: 'apple apple' }).click()

    await window.keyboard.press('Meta+f')
    const prompt = window.getByRole('textbox', { name: 'Search', exact: true })
    await expect(prompt).toHaveAttribute('placeholder', 'Find')
    await expect(window.locator('.search-scope')).toHaveCount(0)
    await prompt.fill('apple')
    await window.keyboard.press('Enter')

    await expect(window.locator('.search-count')).toHaveText('2 / 3')
    await window.keyboard.press('Enter')
    await expect(window.locator('.search-count')).toHaveText('3 / 3')
    await expect(prompt).toBeFocused()
    await window.keyboard.press('Shift+Enter')
    await expect(window.locator('.search-count')).toHaveText('2 / 3')
    await expect(prompt).toBeFocused()
    await window.getByRole('button', { name: 'Next match', exact: true }).focus()
    await expect(window.getByRole('button', { name: 'Next match', exact: true })).toBeFocused()
    await window.keyboard.press('Space')
    await expect(window.locator('.search-count')).toHaveText('3 / 3')
    await window.keyboard.press('Meta+Shift+g')
    await expect(window.locator('.search-count')).toHaveText('2 / 3')
    await window.keyboard.press('Meta+g')
    await expect(window.locator('.search-count')).toHaveText('3 / 3')
    await expect(window.locator('.agenda-row')).not.toHaveCount(0)
    await window.keyboard.press('Meta+f')
    await prompt.fill('discard')
    await window.keyboard.press('Escape')
    await window.keyboard.press('Meta+f')
    await expect(prompt).toHaveValue('apple')
    await window.locator('.agenda-row .agenda-text').filter({ hasText: 'apple apple' }).click()
    await expect(window.locator('.local-search-panel')).toHaveCount(0)
    await expect(window.locator('.search-match')).toHaveCount(0)
  })

  // @requirement PRODUCT.md §20.2.26
  test('finds individual matches and keeps global node search separate', async ({ userDataDir }, testInfo) => {
    seedDocument(userDataDir, {
      document: {
        roots: [
          { id: 'one', text: 'apple apple', children: [] },
          { id: 'two', text: 'apple', children: [] },
        ],
      },
      location: { currentParentId: null, selectedNodeId: 'one' },
    })
    const { window, app } = await launchTree(userDataDir)

    await window.keyboard.press('Meta+f')
    const prompt = window.getByRole('textbox', { name: 'Search', exact: true })
    await expect(prompt).toBeFocused()
    await expect(prompt).toHaveAttribute('placeholder', 'Find')
    const panel = window.locator('.local-search-panel')
    for (const name of ['Previous match', 'Next match', 'Close search']) {
      const button = window.getByRole('button', { name, exact: true })
      await button.hover()
      await expect(button.locator('.search-tooltip')).toBeVisible()
      await expect(button.locator('.search-tooltip')).toHaveText(name)
    }
    await window.screenshot({ path: testInfo.outputPath('search-tooltip-light.png') })
    await prompt.hover()
    await expect(window.locator('.search-tooltip:visible')).toHaveCount(0)
    await prompt.press('Tab')
    await expect(
      window.getByRole('button', { name: 'Previous match', exact: true }).locator('.search-tooltip'),
    ).toBeVisible()
    await window.keyboard.press('Shift+Tab')
    const panelBounds = await panel.boundingBox()
    const footerBounds = await window.locator('.status-bar').boundingBox()
    expect(panelBounds!.y + panelBounds!.height).toBeLessThan(footerBounds!.y)
    await window.screenshot({ path: testInfo.outputPath('local-search-empty.png') })
    await prompt.fill('apple')

    await expect(window.locator('.search-count')).toHaveText('3')
    await window.screenshot({ path: testInfo.outputPath('local-search.png') })
    await window.keyboard.press('Enter')

    await expect(window.locator('.search-count')).toHaveText('2 / 3')
    await expect(prompt).toHaveValue('apple')
    await window.getByRole('button', { name: 'Next match', exact: true }).focus()
    await window.keyboard.press('Space')
    await expect(window.locator('.search-count')).toHaveText('3 / 3')
    await window.keyboard.press('Meta+Shift+g')
    await expect(window.locator('.search-count')).toHaveText('2 / 3')
    await window.keyboard.press('Meta+g')
    await expect(window.locator('.search-count')).toHaveText('3 / 3')
    await window.keyboard.press('Meta+Shift+g')
    await expect(window.locator('.search-count')).toHaveText('2 / 3')
    await window.getByRole('button', { name: 'Next match', exact: true }).click()
    await expect(window.locator('.search-count')).toHaveText('3 / 3')
    await window.getByRole('button', { name: 'Close search', exact: true }).click()
    await expect(window.locator('.search-count')).toHaveCount(0)

    await window.keyboard.press('Meta+;')
    await expect(window.getByRole('dialog', { name: 'Search', exact: true })).toBeVisible()
    await expect(window.getByRole('searchbox')).toBeFocused()
    await window.evaluate(() => {
      const remove = (
        window as unknown as { treeApi: import('../../src/shared/ipc').TreeApi }
      ).treeApi.onFindMenuCommand?.(() => {
        document.body.setAttribute('data-find-menu-received', 'true')
        remove?.()
      })
    })
    await clickApplicationMenuItem(app, 'Edit', 'Find Next')
    await expect(window.locator('body')).toHaveAttribute('data-find-menu-received', 'true')
    await expect(window.getByRole('searchbox')).toBeFocused()
    await expect(window.locator('.search-count')).toHaveCount(0)
    await window.keyboard.press('Escape')

    await clickApplicationMenuItem(app, 'Edit', 'Find…')
    await expect(prompt).toBeFocused()
    await window.keyboard.press('Shift+Enter')
    await expect(window.locator('.search-count')).toHaveText('2 / 3')
    await clickApplicationMenuItem(app, 'Edit', 'Find Next')
    await expect(window.locator('.search-count')).toHaveText('3 / 3')
    await window.emulateMedia({ colorScheme: 'dark' })
    await window.getByRole('button', { name: 'Next match', exact: true }).hover()
    await window.screenshot({ path: testInfo.outputPath('search-tooltip-dark.png') })
    await prompt.hover()
    await window.keyboard.press('Meta+f')
    await window.screenshot({ path: testInfo.outputPath('local-search-dark.png') })
    await window.keyboard.press('Enter')
    await prompt.click()
    await prompt.fill('absent')
    await expect(window.locator('.search-count')).toHaveText('0')
    await window.keyboard.press('Escape')
    await expect(panel).toHaveCount(0)
  })
})

test.describe('Local search Vim modes', () => {
  test.use({ editingMode: 'vim' })

  test('commits pending Replace when reopening Find after a text click', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: { roots: [{ id: 'one', text: 'apple apple', children: [] }] },
      location: { currentParentId: null, selectedNodeId: 'one' },
    })
    const { window } = await launchTree(userDataDir, { initialMode: 'normal' })
    await window.keyboard.press('Meta+f')
    const prompt = window.getByRole('textbox', { name: 'Search', exact: true })
    await prompt.fill('apple')
    await window.keyboard.press('Enter')
    await expect(window.locator('.search-count')).toHaveText('2 / 2')
    await window.getByRole('textbox', { name: 'Node 1', exact: true }).click()
    await window.keyboard.press('0')
    await window.keyboard.press('w')
    await window.keyboard.press('R')
    await window.keyboard.type('berry')

    await window.keyboard.press('Meta+f')
    await prompt.fill('berry')

    await expect(window.locator('.search-count')).toHaveText('1')
    await expect(window.getByLabel('Vim mode')).toHaveText('REPLACE')
  })

  test('retains Visual for empty and absent results and finishes it only on a match', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: { roots: [{ id: 'one', text: 'apple apple', children: [] }] },
      location: { currentParentId: null, selectedNodeId: 'one' },
    })
    const { window } = await launchTree(userDataDir, { initialMode: 'normal' })
    await window.keyboard.press('v')
    await window.keyboard.press('l')
    await window.keyboard.press('Meta+f')
    await window.keyboard.press('Enter')

    await expect(window.getByLabel('Vim mode')).toHaveText('VISUAL')

    await window.keyboard.press('Meta+f')
    await window.getByRole('textbox', { name: 'Search', exact: true }).fill('absent')
    await window.keyboard.press('Enter')
    await expect(window.locator('.search-count')).toHaveText('0')
    await expect(window.getByLabel('Vim mode')).toHaveText('VISUAL')

    await window.keyboard.press('Meta+f')
    await window.getByRole('textbox', { name: 'Search', exact: true }).fill('apple')
    await window.keyboard.press('Enter')
    await expect(window.getByLabel('Vim mode')).toHaveText('NORMAL')
    await expect(window.locator('.search-count')).toHaveText('2 / 2')
  })
})
