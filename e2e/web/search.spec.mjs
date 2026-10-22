// @editing-modes: vim
import { test, expect, primaryKey } from './fixtures.mjs'

test('searches Agenda context and mirrors through native editing mode transitions', async ({ newContext, baseURL }) => {
  const context = await newContext()
  const page = await context.newPage()
  await page.goto(baseURL)
  await page.waitForFunction(() => window.prototypeStore?.getSnapshot().status === 'ready')
  await page.evaluate(async () => {
    await window.treeApi.save({
      version: 1,
      document: {
        roots: [
          {
            id: 'context',
            text: 'apple context',
            children: [{ id: 'child', text: 'apple 2026-10-14 2026-10-20', children: [] }],
          },
        ],
      },
      location: { currentParentId: null, selectedNodeId: 'context' },
    })
    await window.treeApi.setVimEnabled(true)
  })
  await page.reload()
  await page.waitForFunction(() => window.prototypeStore?.getSnapshot().status === 'ready')
  await page.keyboard.press(`${primaryKey}+p`)
  await page.locator('.agenda-role-context').first().click()
  await page.keyboard.press('/')
  const prompt = page.getByRole('textbox', { name: 'Search', exact: true })
  await prompt.fill('apple')
  await expect(page.locator('.search-count')).toHaveText('4')
  await page.keyboard.press('Enter')
  const editor = page.getByRole('textbox', { name: 'Agenda node child', exact: true })
  await expect(editor).toBeFocused()
  await expect(editor).toHaveAttribute('contenteditable', 'false')
  await page.keyboard.press('n')
  await expect(page.locator('.agenda-role-context').last()).toBeFocused()
  await page.keyboard.press('n')
  await expect(editor).toBeFocused()
  await expect(page.locator('.search-count')).toHaveText('4 / 4')
  await page.keyboard.press('i')
  await expect(editor).toHaveAttribute('contenteditable', 'true')
  await page.keyboard.type('X')
  await expect(editor).toHaveText('Xapple 2026-10-14 2026-10-20')
  await expect(page.locator('.agenda-mirror .agenda-text')).toHaveText('Xapple 2026-10-14 2026-10-20')
  await page.keyboard.press('Escape')
  await page.keyboard.press('/')
  await expect(prompt).toHaveValue('apple')
  await page.keyboard.press('Escape')
  await expect(editor).toBeFocused()
})

test('searches through noneditable Normal text and resumes native Insert editing', async ({ newContext, baseURL }) => {
  const context = await newContext()
  const page = await context.newPage()
  await page.goto(baseURL)
  await page.waitForFunction(() => window.prototypeStore?.getSnapshot().status === 'ready')
  await page.evaluate(async () => {
    await window.treeApi.save({
      version: 1,
      document: {
        roots: [
          { id: 'one', text: 'apple apple', children: [] },
          { id: 'two', text: 'next apple', children: [] },
        ],
      },
      location: { currentParentId: null, selectedNodeId: 'one' },
    })
    await window.treeApi.setVimEnabled(true)
  })
  await page.reload()
  await page.waitForFunction(() => window.prototypeStore?.getSnapshot().status === 'ready')
  await page.keyboard.press('/')
  const prompt = page.getByRole('textbox', { name: 'Search', exact: true })
  await prompt.fill('apple')
  await expect(prompt).toBeFocused()
  await expect(page.locator('.search-count')).toHaveText('3')
  await page.keyboard.press('Enter')
  const editor = page.getByRole('textbox', { name: 'Node 1', exact: true })
  await expect(editor).toBeFocused()
  await expect(editor).toHaveAttribute('contenteditable', 'false')
  await expect(page.locator('.search-count')).toHaveText('2 / 3')
  await page.keyboard.press('i')
  await expect(editor).toHaveAttribute('contenteditable', 'true')
  await page.keyboard.type('X')
  await expect(editor).toHaveText('apple Xapple')
  await page.keyboard.press('Escape')
  await page.keyboard.press('n')
  await expect(page.locator('.search-count')).toHaveText('2 / 3')
  await expect(editor).toBeFocused()
  await page.keyboard.press('n')
  await expect(page.getByRole('textbox', { name: 'Node 2', exact: true })).toBeFocused()
})
