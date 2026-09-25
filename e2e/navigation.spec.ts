import { expect, firePaste, launchTree, node, parent, test, typeInto, writeClipboardText } from './fixtures'

test.describe('navigation', () => {
  test('arrow keys move selection between siblings', async ({ userDataDir }) => {
    const { window } = await launchTree(userDataDir)

    await typeInto(node(window, 1), 'A')
    await window.keyboard.press('Enter')
    await typeInto(node(window, 2), 'B')

    await window.keyboard.press('ArrowUp')
    await expect(node(window, 1)).toBeFocused()

    await window.keyboard.press('ArrowDown')
    await expect(node(window, 2)).toBeFocused()
  })

  test('moves the first root caret to the beginning on ArrowUp', async ({ userDataDir }) => {
    const { window } = await launchTree(userDataDir)

    await typeInto(node(window, 1), 'Root')
    await window.keyboard.press('End')
    await window.keyboard.press('ArrowUp')

    expect(await node(window, 1).evaluate((element) => (element as HTMLTextAreaElement).selectionStart)).toBe(0)
  })

  test('gd enters the selected node like Cmd+.', async ({ userDataDir }) => {
    const { window } = await launchTree(userDataDir)

    await typeInto(node(window, 1), 'Parent')
    await window.keyboard.press('Escape')
    await window.keyboard.press('g')
    await window.keyboard.press('d')

    await expect(parent(window)).toBeVisible()
    await expect(parent(window)).toBeFocused()
  })

  test('moves the last root caret to the end on ArrowDown', async ({ userDataDir }) => {
    const { window } = await launchTree(userDataDir)

    await typeInto(node(window, 1), 'First')
    await window.keyboard.press('Enter')
    await typeInto(node(window, 2), 'Last')
    await window.keyboard.press('Home')
    await window.keyboard.press('ArrowDown')

    expect(await node(window, 2).evaluate((element) => (element as HTMLTextAreaElement).selectionStart)).toBe(4)
  })

  test('moves the last linked root caret to the end on ArrowDown', async ({ userDataDir }) => {
    const { app, window } = await launchTree(userDataDir)

    await writeClipboardText(app, 'https://example.com')
    await firePaste(node(window, 1))
    await window.keyboard.press('Home')
    await window.keyboard.press('ArrowDown')

    const editor = node(window, 1)
    await expect(editor).toBeFocused()
    expect(
      await editor.evaluate((element) => {
        const selection = element.ownerDocument.defaultView?.getSelection()
        return { anchorNodeIsEditor: selection?.anchorNode === element, anchorOffset: selection?.anchorOffset }
      }),
    ).toEqual({ anchorNodeIsEditor: true, anchorOffset: 1 })
  })

  test('moves a childless linked parent caret to the end on ArrowDown', async ({ userDataDir }) => {
    const { app, window } = await launchTree(userDataDir)

    await writeClipboardText(app, 'https://example.com')
    await firePaste(node(window, 1))
    await window.keyboard.press('Meta+.')
    await window.keyboard.press('ArrowDown')

    const editor = parent(window)
    await expect(editor).toBeFocused()
    expect(
      await editor.evaluate((element) => {
        const selection = element.ownerDocument.defaultView?.getSelection()
        return { anchorNodeIsEditor: selection?.anchorNode === element, anchorOffset: selection?.anchorOffset }
      }),
    ).toEqual({ anchorNodeIsEditor: true, anchorOffset: 1 })
  })

  test('moves from the first child up to the current parent', async ({ userDataDir }) => {
    const { window } = await launchTree(userDataDir)

    await typeInto(node(window, 1), 'Projects')
    await window.keyboard.press('Meta+.')
    await window.keyboard.press('Enter')
    await typeInto(node(window, 1), 'Work')

    await window.keyboard.press('ArrowUp')

    await expect(parent(window)).toHaveValue('Projects')
    await expect(parent(window)).toBeFocused()
    expect(await parent(window).evaluate((element) => (element as HTMLTextAreaElement).selectionStart)).toBe(4)

    await window.keyboard.press('ArrowDown')
    await expect(node(window, 1)).toBeFocused()
    expect(await node(window, 1).evaluate((element) => (element as HTMLTextAreaElement).selectionStart)).toBe(4)
  })

  test('focuses a linked first child with a visible caret after moving down from the parent', async ({
    userDataDir,
  }) => {
    const { app, window } = await launchTree(userDataDir)

    await typeInto(node(window, 1), 'Another parent')
    await window.keyboard.press('Meta+.')
    await window.keyboard.press('Enter')
    await writeClipboardText(app, 'https://example.com/long-link')
    await firePaste(node(window, 1))

    await window.keyboard.press('ArrowUp')
    await window.keyboard.press('ArrowDown')

    const child = node(window, 1)
    await expect(child).toBeFocused()
    expect(
      await child.evaluate((element) => {
        const selection = element.ownerDocument.defaultView?.getSelection()
        return {
          anchorNodeIsLinkText: selection?.anchorNode === element.querySelector('a')?.firstChild,
          anchorOffset: selection?.anchorOffset,
          collapsed: selection?.isCollapsed,
        }
      }),
    ).toEqual({ anchorNodeIsLinkText: true, anchorOffset: 14, collapsed: true })
  })

  test('moves left and right across sibling and parent boundaries', async ({ userDataDir }) => {
    const { window } = await launchTree(userDataDir)

    await typeInto(node(window, 1), 'Projects')
    await window.keyboard.press('Meta+.')
    await window.keyboard.press('Enter')
    await typeInto(node(window, 1), 'Work')
    await window.keyboard.press('Enter')
    await typeInto(node(window, 2), 'Personal')

    await window.keyboard.press('Home')
    await window.keyboard.press('ArrowLeft')
    await expect(node(window, 1)).toBeFocused()
    expect(await node(window, 1).evaluate((element) => (element as HTMLTextAreaElement).selectionStart)).toBe(4)

    await window.keyboard.press('End')
    await window.keyboard.press('ArrowRight')
    await expect(node(window, 2)).toBeFocused()
    expect(await node(window, 2).evaluate((element) => (element as HTMLTextAreaElement).selectionStart)).toBe(0)

    await window.keyboard.press('End')
    await window.keyboard.press('ArrowRight')
    await expect(node(window, 2)).toBeFocused()
    expect(await node(window, 2).evaluate((element) => (element as HTMLTextAreaElement).selectionStart)).toBe(8)

    await window.keyboard.press('ArrowUp')
    await window.keyboard.press('Home')
    await window.keyboard.press('ArrowUp')
    await expect(parent(window)).toBeFocused()
    expect(await parent(window).evaluate((element) => (element as HTMLTextAreaElement).selectionStart)).toBe(0)

    await window.keyboard.press('End')
    await window.keyboard.press('ArrowUp')
    expect(await parent(window).evaluate((element) => (element as HTMLTextAreaElement).selectionStart)).toBe(0)

    await window.keyboard.press('End')
    await window.keyboard.press('ArrowRight')
    await expect(node(window, 1)).toBeFocused()
    expect(await node(window, 1).evaluate((element) => (element as HTMLTextAreaElement).selectionStart)).toBe(0)
  })

  test('entering a childless node keeps the cursor in the current parent and Enter creates a first child', async ({
    userDataDir,
  }) => {
    const { window } = await launchTree(userDataDir)

    await typeInto(node(window, 1), 'Projects')
    await window.keyboard.press('Meta+.')

    await expect(parent(window)).toHaveValue('Projects')
    await expect(parent(window)).toBeFocused()
    await expect(window.locator('[aria-label^="Node "]')).toHaveCount(0)

    await window.keyboard.press('Enter')
    await expect(node(window, 1)).toBeFocused()
    expect(await node(window, 1).evaluate((element) => (element as HTMLTextAreaElement).selectionStart)).toBe(0)
    await typeInto(node(window, 1), 'Work')
    await expect(node(window, 1)).toHaveValue('Work')
  })

  test('leaving a node restores the parent level and selects the node that was entered', async ({ userDataDir }) => {
    const { window } = await launchTree(userDataDir)

    await typeInto(node(window, 1), 'Projects')
    await window.keyboard.press('Meta+.')
    await window.keyboard.press('Enter')
    await typeInto(node(window, 1), 'Work')

    await window.keyboard.press('Meta+,')
    await expect(node(window, 1)).toHaveValue('Projects')
    await expect(node(window, 1)).toBeFocused()
  })

  test('the location path navigates to ancestors and the root', async ({ userDataDir }) => {
    const { window } = await launchTree(userDataDir)

    await typeInto(node(window, 1), 'Projects')
    await window.keyboard.press('Meta+.')
    await window.keyboard.press('Enter')
    await typeInto(node(window, 1), 'Work')
    await window.keyboard.press('Meta+.')
    await window.keyboard.press('Enter')
    await typeInto(node(window, 1), 'Task')

    await expect(window.locator('[aria-label="Current location"]')).toContainText('Projects')
    await expect(window.locator('[aria-label="Current location"]')).toContainText('Work')

    await window.getByRole('button', { name: 'Projects' }).click()
    await expect(parent(window)).toHaveValue('Projects')
    await expect(node(window, 1)).toHaveValue('Work')
    await expect(node(window, 1)).toBeFocused()

    await window.getByRole('button', { name: 'Top level' }).click()
    await expect(window.locator('[aria-label^="Node "]')).toHaveCount(1)
    await expect(node(window, 1)).toHaveValue('Projects')
    await expect(node(window, 1)).toBeFocused()
  })

  test('clicks the circular indicator to enter a node with children and a childless node', async ({ userDataDir }) => {
    const { window } = await launchTree(userDataDir)

    await typeInto(node(window, 1), 'Parent')
    await window.keyboard.press('Meta+.')
    await window.keyboard.press('Enter')
    await typeInto(node(window, 1), 'Child')
    await window.keyboard.press('Meta+,')

    const parentIndicator = window.getByRole('button', { name: 'Enter node 1' })
    const indicatorAppearance = await parentIndicator.evaluate((element) => {
      const button = getComputedStyle(element)
      const bullet = getComputedStyle(element, '::before')
      return { background: button.backgroundColor, bulletWidth: bullet.width, bulletHeight: bullet.height }
    })
    expect(indicatorAppearance.background).not.toBe('rgba(0, 0, 0, 0)')
    expect(indicatorAppearance.bulletWidth).toBe('7px')
    expect(indicatorAppearance.bulletHeight).toBe('7px')

    await parentIndicator.click()
    await expect(parent(window)).toHaveValue('Parent')
    await expect(node(window, 1)).toHaveValue('Child')
    await expect(node(window, 1)).toBeFocused()

    const leafIndicator = window.getByRole('button', { name: 'Enter node 1' })
    const leafAppearance = await leafIndicator.evaluate((element) => {
      const button = getComputedStyle(element)
      const bullet = getComputedStyle(element, '::before')
      return { background: button.backgroundColor, bulletWidth: bullet.width, bulletHeight: bullet.height }
    })
    expect(leafAppearance.background).toBe('rgba(0, 0, 0, 0)')
    expect(leafAppearance.bulletWidth).toBe('7px')
    expect(leafAppearance.bulletHeight).toBe('7px')

    await leafIndicator.click()
    await expect(parent(window)).toHaveValue('Child')
    await expect(window.locator('[aria-label^="Node "]')).toHaveCount(0)
    await expect(parent(window)).toBeFocused()
  })
})
