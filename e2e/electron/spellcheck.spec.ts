// @editing-modes: independent
import { expect, launchTree, node, test, typeInto } from './fixtures'

test.describe('spellcheck', () => {
  test('is disabled in the session and in the focused editor', async ({ userDataDir }) => {
    const { app, window } = await launchTree(userDataDir)

    const preferences = await app.evaluate(({ BrowserWindow }) => {
      const webContents = BrowserWindow.getAllWindows()[0]?.webContents
      if (webContents === undefined) throw new Error('The main window is unavailable.')
      return { sessionEnabled: webContents.session.isSpellCheckerEnabled() }
    })

    expect(preferences.sessionEnabled).toBe(false)

    await typeInto(node(window, 1), 'dfjdf kjjj')

    await expect(node(window, 1)).toHaveAttribute('spellcheck', 'false')
    expect(await window.evaluate(() => document.activeElement?.getAttribute('spellcheck'))).toBe('false')
  })
})
