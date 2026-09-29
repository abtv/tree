import {
  closeApp,
  dragRow,
  expect,
  launchTree,
  node,
  nodeTexts,
  parent,
  pressShifted,
  readPersisted,
  seedDocument,
  setCursor,
  startRowDrag,
  test,
  typeInto,
} from './fixtures'

function nestedSeed(): { document: unknown; location: unknown } {
  return {
    document: {
      roots: [
        {
          id: 'a',
          text: 'Alpha',
          children: [
            {
              id: 'a1',
              text: 'Alpha child one',
              children: [{ id: 'a1a', text: 'Alpha grandchild', children: [] }],
            },
            { id: 'a2', text: 'Alpha child two', children: [] },
          ],
        },
        { id: 'b', text: 'Bravo', children: [] },
      ],
    },
    location: { currentParentId: null, selectedNodeId: 'a' },
  }
}

function wideNestedSeed(topCount: number, expandedCount: number): { document: unknown; location: unknown } {
  return {
    document: {
      roots: Array.from({ length: topCount }, (_, index) => ({
        id: `t${index}`,
        text: `Top ${index}`,
        children:
          index < expandedCount
            ? Array.from({ length: 2 }, (_, childIndex) => ({
                id: `t${index}c${childIndex}`,
                text: `Top ${index} child ${childIndex}`,
                children: [],
              }))
            : [],
      })),
    },
    location: { currentParentId: null, selectedNodeId: 't0' },
  }
}

test.describe('inline node expansion', () => {
  test('expands and collapses a node’s children inline without entering it or moving the caret', async ({
    userDataDir,
  }) => {
    seedDocument(userDataDir, nestedSeed())
    const { window } = await launchTree(userDataDir, { initialMode: 'normal' })
    const locationBefore = await window.getByLabel('Current location').innerText()

    expect(await nodeTexts(window)).toEqual(['Alpha', 'Bravo'])
    await window.getByRole('button', { name: 'Expand node 1' }).click()

    expect(await nodeTexts(window)).toEqual(['Alpha', 'Alpha child one', 'Alpha child two', 'Bravo'])
    await expect(window.getByLabel('Current location')).toHaveText(locationBefore)
    await expect(node(window, 1)).toBeFocused()

    await window.getByRole('button', { name: 'Collapse node 1' }).click()
    expect(await nodeTexts(window)).toEqual(['Alpha', 'Bravo'])
  })

  test('restores nested expansion choices made during the same visit when re-expanding', async ({ userDataDir }) => {
    seedDocument(userDataDir, nestedSeed())
    const { window } = await launchTree(userDataDir, { initialMode: 'normal' })

    await window.getByRole('button', { name: 'Expand node 1' }).click()
    await window.getByRole('button', { name: 'Expand node 2' }).click()
    expect(await nodeTexts(window)).toEqual([
      'Alpha',
      'Alpha child one',
      'Alpha grandchild',
      'Alpha child two',
      'Bravo',
    ])

    await window.getByRole('button', { name: 'Collapse node 1' }).click()
    expect(await nodeTexts(window)).toEqual(['Alpha', 'Bravo'])

    await window.getByRole('button', { name: 'Expand node 1' }).click()
    expect(await nodeTexts(window)).toEqual([
      'Alpha',
      'Alpha child one',
      'Alpha grandchild',
      'Alpha child two',
      'Bravo',
    ])
  })

  test('moves through expanded rows on j and ArrowDown, including entering and leaving branches', async ({
    userDataDir,
  }) => {
    seedDocument(userDataDir, nestedSeed())
    const { window } = await launchTree(userDataDir, { initialMode: 'normal' })

    await window.getByRole('button', { name: 'Expand node 1' }).click()
    await window.getByRole('button', { name: 'Expand node 2' }).click()
    await node(window, 1).click()
    await window.keyboard.press('j')

    await expect(node(window, 2)).toBeFocused()
    await window.keyboard.press('j')
    await expect(node(window, 3)).toBeFocused()
    await window.keyboard.press('j')
    await expect(node(window, 4)).toBeFocused()
    await window.keyboard.press('j')
    await expect(node(window, 5)).toBeFocused()
    await window.keyboard.press('k')
    await expect(node(window, 4)).toBeFocused()
    await node(window, 1).click()
    await window.keyboard.press('2')
    await window.keyboard.press('j')
    await expect(node(window, 3)).toBeFocused()
    await window.keyboard.press('2')
    await window.keyboard.press('k')
    await expect(node(window, 1)).toBeFocused()

    // ArrowDown in Insert mode follows the same visible-row order.
    await node(window, 1).click()
    await window.keyboard.press('i')
    await window.keyboard.press('ArrowDown')
    await expect(node(window, 2)).toBeFocused()
  })

  test('selects the collapsing node with the caret at the start when collapse hides the caret', async ({
    userDataDir,
  }) => {
    seedDocument(userDataDir, nestedSeed())
    const { window } = await launchTree(userDataDir, { initialMode: 'normal' })

    await window.getByRole('button', { name: 'Expand node 1' }).click()
    await node(window, 2).click()
    await expect(node(window, 2)).toBeFocused()

    await window.getByRole('button', { name: 'Collapse node 1' }).click()

    await expect(node(window, 1)).toBeFocused()
    expect(await node(window, 1).evaluate((element) => (element as HTMLTextAreaElement).selectionStart)).toBe(0)
  })

  test('folds inline expansion with the Vim fold keys, moving the caret to the displayed ancestor it hides', async ({
    userDataDir,
  }) => {
    seedDocument(userDataDir, nestedSeed())
    const { window } = await launchTree(userDataDir, { initialMode: 'normal' })
    await node(window, 1).focus()

    // The capital fold keys are pressed with Shift held down, as a physical keyboard sends it.
    // za toggles the selected node's own fold; zc and zo close and open it.
    await window.keyboard.press('z')
    await window.keyboard.press('a')
    await expect(node(window, 2)).toHaveValue('Alpha child one')
    await window.keyboard.press('z')
    await window.keyboard.press('c')
    await expect(node(window, 2)).toHaveValue('Bravo')
    await window.keyboard.press('z')
    await window.keyboard.press('o')
    await expect(node(window, 2)).toHaveValue('Alpha child one')

    // zR opens every fold recursively, including the nested grandchild.
    await node(window, 2).focus()
    await window.keyboard.press('z')
    await pressShifted(window, 'R')
    expect(await nodeTexts(window)).toEqual([
      'Alpha',
      'Alpha child one',
      'Alpha grandchild',
      'Alpha child two',
      'Bravo',
    ])

    // zM closes every fold and hands the caret to the displayed ancestor of the hidden descendant.
    await node(window, 3).focus()
    await window.keyboard.press('z')
    await pressShifted(window, 'M')
    await expect(node(window, 1)).toBeFocused()
    expect(await node(window, 1).evaluate((element) => (element as HTMLTextAreaElement).selectionStart)).toBe(0)
    expect(await nodeTexts(window)).toEqual(['Alpha', 'Bravo'])

    // zC discards the nested choice, so reopening the root shows one level; a leaf ignores zO.
    await node(window, 1).focus()
    await window.keyboard.press('z')
    await window.keyboard.press('a')
    await node(window, 2).focus()
    await window.keyboard.press('z')
    await window.keyboard.press('a')
    await node(window, 1).focus()
    await window.keyboard.press('z')
    await pressShifted(window, 'C')
    await window.keyboard.press('z')
    await window.keyboard.press('o')
    expect(await nodeTexts(window)).toEqual(['Alpha', 'Alpha child one', 'Alpha child two', 'Bravo'])
    await node(window, 4).focus()
    await window.keyboard.press('z')
    await pressShifted(window, 'O')
    expect(await nodeTexts(window)).toEqual(['Alpha', 'Alpha child one', 'Alpha child two', 'Bravo'])

    // zO on the root opens the whole nested subtree, including the grandchild.
    await node(window, 1).focus()
    await window.keyboard.press('z')
    await pressShifted(window, 'O')
    expect(await nodeTexts(window)).toEqual([
      'Alpha',
      'Alpha child one',
      'Alpha grandchild',
      'Alpha child two',
      'Bravo',
    ])
  })

  test('leaves the caret unchanged when collapsing a branch that does not contain it', async ({ userDataDir }) => {
    seedDocument(userDataDir, nestedSeed())
    const { window } = await launchTree(userDataDir, { initialMode: 'normal' })

    await window.getByRole('button', { name: 'Expand node 1' }).click()
    // Bravo is a's own next real sibling, not one of the children hidden by collapsing "a".
    await node(window, 4).click()
    await expect(node(window, 4)).toBeFocused()

    await window.getByRole('button', { name: 'Collapse node 1' }).click()

    await expect(node(window, 2)).toBeFocused()
    await expect(node(window, 2)).toHaveValue('Bravo')
    expect(await nodeTexts(window)).toEqual(['Alpha', 'Bravo'])
  })

  test('resets expansion when entering and leaving a node', async ({ userDataDir }) => {
    seedDocument(userDataDir, nestedSeed())
    const { window } = await launchTree(userDataDir, { initialMode: 'normal' })

    await window.getByRole('button', { name: 'Expand node 1' }).click()
    expect(await nodeTexts(window)).toEqual(['Alpha', 'Alpha child one', 'Alpha child two', 'Bravo'])

    await node(window, 1).click()
    await window.keyboard.press('Meta+.')
    await expect(parent(window)).toBeVisible()
    await window.keyboard.press('Meta+,')

    await expect(node(window, 1)).toBeFocused()
    expect(await nodeTexts(window)).toEqual(['Alpha', 'Bravo'])
    await expect(window.getByRole('button', { name: 'Expand node 1' })).toBeVisible()
  })

  test('resets expansion when navigating via the location breadcrumb', async ({ userDataDir }) => {
    seedDocument(userDataDir, nestedSeed())
    const { window } = await launchTree(userDataDir, { initialMode: 'normal' })

    await window.getByRole('button', { name: 'Expand node 1' }).click()
    expect(await nodeTexts(window)).toEqual(['Alpha', 'Alpha child one', 'Alpha child two', 'Bravo'])

    await node(window, 1).click()
    await window.keyboard.press('Meta+.')
    await expect(parent(window)).toBeVisible()
    await window.getByRole('button', { name: 'Top level' }).click()

    expect(await nodeTexts(window)).toEqual(['Alpha', 'Bravo'])
    await expect(window.getByRole('button', { name: 'Expand node 1' })).toBeVisible()
  })

  test('starts collapsed after relaunch while the saved document persists', async ({ userDataDir }) => {
    seedDocument(userDataDir, nestedSeed())
    const first = await launchTree(userDataDir, { initialMode: 'normal' })

    // Edit the selected root so the relaunched window must load the saved document: a relaunch that
    // accidentally showed the seed instead of persisted content would fail on "Alpha edited".
    await setCursor(node(first.window, 1), 'Alpha'.length)
    await typeInto(node(first.window, 1), ' edited')

    // Expand two levels so an incorrectly restored expansion would render extra descendant rows.
    await first.window.getByRole('button', { name: 'Expand node 1' }).click()
    await first.window.getByRole('button', { name: 'Expand node 2' }).click()
    expect(await nodeTexts(first.window)).toEqual([
      'Alpha edited',
      'Alpha child one',
      'Alpha grandchild',
      'Alpha child two',
      'Bravo',
    ])

    await closeApp(first.app)
    expect(readPersisted(userDataDir).document.roots[0]?.text).toBe('Alpha edited')

    const second = await launchTree(userDataDir, { initialMode: 'normal' })

    // docs/PRODUCT.md §2.4: reopening the application starts collapsed.
    expect(await nodeTexts(second.window)).toEqual(['Alpha edited', 'Bravo'])
    await expect(second.window.getByRole('button', { name: 'Expand node 1' })).toBeVisible()
  })

  test('normalizes an inline-expanded descendant selected below a non-null current parent after relaunch', async ({
    userDataDir,
  }) => {
    seedDocument(userDataDir, nestedSeed())
    const first = await launchTree(userDataDir, { initialMode: 'normal' })

    await node(first.window, 1).click()
    await first.window.keyboard.press('Meta+.')
    await expect(parent(first.window)).toHaveValue('Alpha')
    expect(await nodeTexts(first.window)).toEqual(['Alpha child one', 'Alpha child two'])

    await first.window.getByRole('button', { name: 'Expand node 1' }).click()
    expect(await nodeTexts(first.window)).toEqual(['Alpha child one', 'Alpha grandchild', 'Alpha child two'])

    // Select and edit the inline-expanded grandchild so the persisted location has a non-null
    // current parent and a selected node several levels below the direct child it should normalize to.
    await node(first.window, 2).click()
    await setCursor(node(first.window, 2), 'Alpha grandchild'.length)
    await typeInto(node(first.window, 2), ' edited')

    await closeApp(first.app)
    const persisted = readPersisted(userDataDir)
    expect(persisted.location).toEqual({ currentParentId: 'a', selectedNodeId: 'a1a' })

    const second = await launchTree(userDataDir, { initialMode: 'normal' })

    // docs/PRODUCT.md §2.4: reopening starts collapsed, so the restored caret must land on the
    // displayed direct child on the path to the persisted descendant, not the descendant itself.
    await expect(parent(second.window)).toHaveValue('Alpha')
    expect(await nodeTexts(second.window)).toEqual(['Alpha child one', 'Alpha child two'])
    await expect(node(second.window, 1)).toHaveValue('Alpha child one')
    await expect(node(second.window, 1)).toBeFocused()
    expect(await node(second.window, 1).evaluate((element) => (element as HTMLTextAreaElement).selectionStart)).toBe(0)
  })

  test('keeps gg on the first displayed root while G targets the descendant’s own last real sibling', async ({
    userDataDir,
  }) => {
    seedDocument(userDataDir, nestedSeed())
    const { window } = await launchTree(userDataDir, { initialMode: 'normal' })

    await window.getByRole('button', { name: 'Expand node 1' }).click()
    await node(window, 2).click()
    await expect(node(window, 2)).toBeFocused()

    // gg always targets the first displayed root, never the focused descendant's own real parent.
    await window.keyboard.press('g')
    await window.keyboard.press('g')
    await expect(node(window, 1)).toBeFocused()
    await expect(node(window, 1)).toHaveValue('Alpha')

    // G targets the descendant's own last real sibling (alpha child two), not the flattened last
    // visible row (Bravo), which would be wrong since Bravo is alpha's sibling, not alpha1's.
    await node(window, 2).click()
    await window.keyboard.press('G')
    await expect(node(window, 3)).toBeFocused()
    await expect(node(window, 3)).toHaveValue('Alpha child two')
  })

  test('ends whole-node Visual mode when an ancestor collapses and hides its anchor and focus', async ({
    userDataDir,
  }) => {
    seedDocument(userDataDir, nestedSeed())
    const { window } = await launchTree(userDataDir, { initialMode: 'normal' })

    await window.getByRole('button', { name: 'Expand node 1' }).click()
    await node(window, 2).click()
    await window.keyboard.press('V')
    await expect(window.getByLabel('Vim mode')).toHaveText('VISUAL NODE')

    await window.getByRole('button', { name: 'Collapse node 1' }).click()

    await expect(window.getByLabel('Vim mode')).toHaveText('NORMAL')
    await expect(node(window, 1)).toBeFocused()
  })

  test('reorders a dragged descendant only among its own real siblings', async ({ userDataDir }) => {
    seedDocument(userDataDir, nestedSeed())
    const { window } = await launchTree(userDataDir, { initialMode: 'normal' })

    await window.getByRole('button', { name: 'Expand node 1' }).click()
    // Flattened rows are now: Alpha(1), Alpha child one(2), Alpha child two(3), Bravo(4).
    await expect(node(window, 1)).toHaveValue('Alpha')
    await expect(node(window, 2)).toHaveValue('Alpha child one')
    await expect(node(window, 3)).toHaveValue('Alpha child two')
    await expect(node(window, 4)).toHaveValue('Bravo')

    // Dragging "Alpha child one" (row index 1) past "Bravo" (a's next real sibling, row index 3)
    // must still land it among a's own children, never past Bravo into the root level.
    await dragRow(window, 1, 3)

    await expect(node(window, 1)).toHaveValue('Alpha')
    await expect(node(window, 2)).toHaveValue('Alpha child two')
    await expect(node(window, 3)).toHaveValue('Alpha child one')
    await expect(node(window, 4)).toHaveValue('Bravo')
  })

  test('clamps a drag overshooting past the descendant’s real siblings to the last valid position', async ({
    userDataDir,
  }) => {
    seedDocument(userDataDir, nestedSeed())
    const { window } = await launchTree(userDataDir, { initialMode: 'normal' })

    await window.getByRole('button', { name: 'Expand node 1' }).click()
    const source = window.locator('.node-row').nth(1)
    await startRowDrag(window, source.locator('.node-input'))
    const bravoBox = await window.locator('.node-row').nth(3).boundingBox()
    if (bravoBox === null) throw new Error('Bravo’s row was not rendered.')
    // Move well past Bravo's row; the drop must still snap to a's own last child boundary.
    await window.mouse.move(bravoBox.x + 8, bravoBox.y + bravoBox.height + 40, { steps: 5 })
    await window.mouse.up()

    expect(await nodeTexts(window)).toEqual(['Alpha', 'Alpha child two', 'Alpha child one', 'Bravo'])
  })

  test('windows on the flattened visible row count once inline descendants push past the threshold', async ({
    userDataDir,
  }) => {
    const topCount = 300
    const expandedCount = 110
    seedDocument(userDataDir, wideNestedSeed(topCount, expandedCount))
    const { window } = await launchTree(userDataDir, { initialMode: 'normal' })

    // 300 top-level roots alone stay under the 500-row threshold and render unwindowed.
    expect(await window.locator('.node-list-spacer').count()).toBe(0)

    // Expand by stable node id, not by rendered position: each expansion shifts every later
    // top-level node's flattened row index, so a position-based label would drift mid-loop.
    await window.evaluate((count) => {
      for (let index = 0; index < count; index += 1) {
        const row = document.querySelector(`[data-node-id="t${index}"]`)
        const button = row?.querySelector('.node-disclosure-triangle')
        if (button instanceof HTMLElement) button.click()
      }
    }, expandedCount)

    // 300 top-level rows + 110 * 2 expanded children = 520 visible rows, above the threshold.
    const spacers = window.locator('.node-list-spacer')
    await expect(spacers).toHaveCount(2)
    const mountedRows = await window.locator('.node-row').count()
    expect(mountedRows).toBeLessThan(topCount + expandedCount * 2)
  })

  test('matches the collapsed, expanded, nested, and focused disclosure appearance', async ({ userDataDir }) => {
    seedDocument(userDataDir, nestedSeed())
    const { window } = await launchTree(userDataDir, { initialMode: 'normal' })

    await expect(window.locator('.node-list')).toHaveScreenshot('inline-expansion-collapsed-light.png')

    await window.getByRole('button', { name: 'Expand node 1' }).click()
    await window.getByRole('button', { name: 'Expand node 2' }).click()
    await expect(window.locator('.node-list')).toHaveScreenshot('inline-expansion-nested-light.png')

    await window.emulateMedia({ colorScheme: 'dark' })
    await expect(window.locator('.node-list')).toHaveScreenshot('inline-expansion-nested-dark.png')
    await window.emulateMedia({ colorScheme: 'light' })
  })
})
