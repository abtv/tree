// @editing-modes: vim
import type { Page } from '@playwright/test'
import { clickApplicationMenuItem, expect, launchTree, node, seedDocument, test } from './fixtures'

async function keys(window: Page, ...sequence: string[]): Promise<void> {
  for (const key of sequence) await window.keyboard.press(key)
}

// @requirement PRODUCT.md §20.2.32
// @requirement PRODUCT.md §20.14
test('uses the usual Search from Help and only leaves Help when opening a note', async ({ userDataDir }) => {
  seedDocument(userDataDir, {
    document: {
      roots: [
        { id: 'one', text: 'original note', children: [] },
        { id: 'two', text: 'synthetic atlas', children: [] },
      ],
    },
    location: { currentParentId: null, selectedNodeId: 'one' },
  })
  const { window } = await launchTree(userDataDir, { initialMode: 'normal' })
  const help = window.getByRole('region', { name: 'Vim shortcuts (read only)' })
  const helpRow = help.getByText('Space h — Help', { exact: true })
  const query = window.getByRole('searchbox', { name: 'Search query' })
  await expect(node(window, 1)).toBeFocused()
  await keys(window, 'Space', 'm', 'Space', 'h', 'h')
  await expect(help.getByRole('heading', { name: 'Vim shortcuts' })).toBeFocused()
  await helpRow.click()
  await expect(helpRow).toBeFocused()
  const helpChild = help.getByText('Space h a — About Tree', { exact: true })
  await expect(helpChild).toBeVisible()
  await keys(window, 'Space', 'e')
  await expect(helpChild).toHaveCount(0)
  await keys(window, 'Space', 'e')
  await expect(helpChild).toBeVisible()

  await keys(window, 'Space', 'Space')

  await expect(query).toBeFocused()
  await expect(query).toHaveValue('')
  await expect(window.getByRole('dialog', { name: 'Search' }).getByText('original note', { exact: true })).toBeVisible()
  await query.fill('Vim shortcuts')
  await expect(window.getByText('No results', { exact: true })).toBeVisible()
  await keys(window, 'Escape')
  await expect(helpRow).toBeFocused()

  await keys(window, 'Meta+;')
  await expect(query).toHaveValue('')
  await query.fill('synthetic atlas')
  await expect(
    window.getByRole('dialog', { name: 'Search' }).getByText('synthetic atlas', { exact: true }),
  ).toBeVisible()
  await window.screenshot({ path: test.info().outputPath('notes-search-over-help.png') })
  await keys(window, 'Enter')

  await expect(help).toHaveCount(0)
  await expect(node(window, 2)).toBeFocused()
  await expect(node(window, 2)).toHaveJSProperty('selectionStart', 0)
  await expect(node(window, 1)).toHaveValue('original note')
})

// @requirement PRODUCT.md §20.2.32
// @requirement PRODUCT.md §20.14
test('keeps Find inside Help and opens notes Search from the native menu above Agenda', async ({ userDataDir }) => {
  seedDocument(userDataDir, {
    document: { roots: [{ id: 'one', text: 'Space h in a note', children: [] }] },
    location: { currentParentId: null, selectedNodeId: 'one' },
  })
  const { app, window } = await launchTree(userDataDir, { initialMode: 'normal' })
  const help = window.getByRole('region', { name: 'Vim shortcuts (read only)' })
  const agenda = window.locator('.agenda-row[aria-selected="true"]')
  const find = window.getByRole('textbox', { name: 'Search', exact: true })
  const search = window.getByRole('searchbox', { name: 'Search query' })
  await expect(node(window, 1)).toBeFocused()
  await keys(window, 'Space', 'p')
  await expect(agenda).toBeFocused()
  await keys(window, 'Space', 'h', 'h')
  await expect(help.getByRole('heading', { name: 'Vim shortcuts' })).toBeFocused()

  await keys(window, '/')
  await find.fill('Space h')
  await keys(window, 'Enter')

  const first = help.getByText('Space h — Help', { exact: true })
  const next = help.getByText('Space h a — About Tree', { exact: true })
  await expect(first).toBeFocused()
  await expect(help.locator('.search-match-current')).toHaveText('Space h')
  await keys(window, 'n')
  await expect(next).toBeFocused()
  await keys(window, 'N')
  await expect(first).toBeFocused()

  await keys(window, 'Meta+f')
  await expect(find).toHaveValue('Space h')
  await find.fill('unconfirmed draft')
  await clickApplicationMenuItem(app, 'Edit', 'Search All Nodes…')

  await expect(search).toBeFocused()
  await expect(find).toHaveCount(0)
  await search.fill('Space h')
  await expect(
    window.getByRole('dialog', { name: 'Search' }).getByText('Space h in a note', { exact: true }),
  ).toBeVisible()
  await keys(window, 'Escape')
  await expect(first).toBeFocused()
  await keys(window, 'Meta+f')
  await expect(find).toHaveValue('Space h')
  await keys(window, 'Escape', 'Escape')
  await expect(agenda).toBeFocused()
})

// @requirement PRODUCT.md §20.14
test('lets the Help Find input finish composition before a native Search menu command', async ({ userDataDir }) => {
  const { app, window } = await launchTree(userDataDir, { initialMode: 'normal' })
  const help = window.getByRole('region', { name: 'Vim shortcuts (read only)' })
  const heading = help.getByRole('heading', { name: 'Vim shortcuts' })
  const find = window.getByRole('textbox', { name: 'Search', exact: true })
  const search = window.getByRole('searchbox', { name: 'Search query' })
  await expect(node(window, 1)).toBeFocused()
  await keys(window, 'Space', 'h', 'h')
  await expect(heading).toBeFocused()
  await keys(window, '/')
  const ime = await window.context().newCDPSession(window)
  await ime.send('Input.imeSetComposition', { text: '日', selectionStart: 1, selectionEnd: 1 })
  await expect(find).toHaveValue('日')

  await clickApplicationMenuItem(app, 'Edit', 'Search All Nodes…')

  await expect(find).toBeFocused()
  await expect(find).toHaveValue('日')
  await expect(search).toHaveCount(0)
  await ime.send('Input.insertText', { text: '日本' })
  await expect(find).toHaveValue('日本')
  await clickApplicationMenuItem(app, 'Edit', 'Search All Nodes…')
  await expect(search).toBeFocused()
  await keys(window, 'Escape')
  await expect(heading).toBeFocused()
  await ime.detach()
})

// @requirement PRODUCT.md §20.2.32
test('switches from Help in either direction without repeating the last Leader key in notes', async ({
  userDataDir,
}) => {
  seedDocument(userDataDir, {
    document: { roots: [{ id: 'one', text: 'alpha beta', children: [] }] },
    location: { currentParentId: null, selectedNodeId: 'one' },
  })
  const { app, window } = await launchTree(userDataDir, { initialMode: 'normal' })
  const editor = node(window, 1)
  const help = window.getByRole('region', { name: 'Vim shortcuts (read only)' })
  const heading = help.getByRole('heading', { name: 'Vim shortcuts' })
  const agenda = window.locator('.agenda-row[aria-selected="true"]')
  await expect(editor).toBeFocused()
  await keys(window, '0', 'l', 'l', 'Space', 'h', 'h')
  await expect(heading).toBeFocused()
  await expect(help.getByText('Move and find', { exact: true })).toHaveCount(0)
  await expect(help.locator('[contenteditable], textarea')).toHaveCount(0)

  await keys(window, 'Space', 'm', 'Space', 's', 'i', 'd', 'd', 'x', 'Space', 'p')
  await expect(help).toHaveCount(0)
  await expect(agenda).toBeFocused()
  await keys(window, 'Space', 'h', 'h')
  await expect(heading).toBeFocused()

  // A repeated p delivered after the surface is gone would act on the notes editor.
  const repeatedKeys = await window.evaluateHandle(() => {
    const hits: string[] = []
    document.addEventListener(
      'keydown',
      (event) => {
        if (event.repeat && event.key === 'p') hits.push(event.key)
      },
      true,
    )
    return hits
  })
  await keys(window, 'Space')
  await window.keyboard.down('p')
  await expect(editor).toBeFocused()
  await window.keyboard.down('p')
  await window.keyboard.up('p')

  expect(await repeatedKeys.jsonValue()).toEqual([])
  await repeatedKeys.dispose()
  await expect(editor).toHaveValue('alpha beta')
  await expect(editor).toHaveJSProperty('selectionStart', 2)
  const marker = window.getByRole('button', { name: 'Enter node 1', exact: true })
  await expect(marker).not.toHaveAttribute('data-marked', 'true')
  await expect(marker).not.toHaveAttribute('data-starred', 'true')
  await keys(window, 'Space', 'h', 'h')
  await expect(heading).toBeFocused()
  await clickApplicationMenuItem(app, 'View', 'Tree')
  await expect(editor).toBeFocused()
  await expect(editor).toHaveJSProperty('selectionStart', 2)
})
