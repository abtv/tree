import {
  closeMainWindow,
  expect,
  launchTree,
  node,
  readMainWindowBounds,
  readPersisted,
  setMainWindowBounds,
  test,
  typeInto,
} from './fixtures'

test.describe('hidden window mode', () => {
  // The default e2e mode hides the application window so the suite does not steal desktop focus.
  // `TREE_E2E_VISIBLE=1` keeps windows visible for observation, so this spec forces hidden mode and
  // passes in both ambient modes. `launchTree` asserts the requested mode on every launch; this spec
  // additionally proves the hidden window stays fully interactive and quits through the real path.
  test('launches without a visible window and stays interactive', async ({ userDataDir }) => {
    const { app, window } = await launchTree(userDataDir, { windows: 'hidden' })

    const visibility = await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().map((entry) => entry.isVisible()),
    )
    expect(visibility).toEqual([false])

    await typeInto(node(window, 1), 'Hidden window')
    await expect(node(window, 1)).toBeFocused()
    await expect(node(window, 1)).toHaveValue('Hidden window')

    await setMainWindowBounds(app, { width: 900, height: 640 })
    const bounds = await readMainWindowBounds(app)
    expect(bounds.width).toBe(900)
    expect(bounds.height).toBe(640)

    const closed = new Promise<void>((resolve) => app.once('close', resolve))
    await closeMainWindow(app)
    await closed

    expect(readPersisted(userDataDir).document.roots[0]?.text).toBe('Hidden window')
  })
})
