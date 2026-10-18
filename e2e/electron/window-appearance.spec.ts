// @editing-modes: independent
import { test, expect, launchTree, closeApp } from './fixtures'

for (const appearance of ['dark', 'light'] as const) {
  test(`uses the ${appearance} document background from window creation through close`, async ({ userDataDir }) => {
    const { app, window } = await launchTree(userDataDir, { appearance })
    const color = appearance === 'dark' ? '#3f3f3f' : '#fbf8f1'
    const created = await app.evaluate(() => {
      return (globalThis as unknown as { __treeWindowBackgrounds: Array<{ phase: string; color: string }> })
        .__treeWindowBackgrounds
    })
    expect(created).toEqual([{ phase: 'created', color }])
    // Playwright's browser context defaults to light media independently of nativeTheme.
    await window.emulateMedia({ colorScheme: appearance })
    await expect(window.locator('html')).toHaveCSS(
      'background-color',
      appearance === 'dark' ? 'rgb(63, 63, 63)' : 'rgb(251, 248, 241)',
    )
    const gridImage = await window
      .locator('.scroll-viewport')
      .evaluate((element) => getComputedStyle(element).backgroundImage)
    if (appearance === 'light') expect(gridImage).toContain('rgb(230, 223, 208)')
    else expect(gridImage).not.toContain('rgb(230, 223, 208)')
    await window.screenshot({ path: test.info().outputPath(`${appearance}-window.png`) })

    const opposite = appearance === 'dark' ? 'light' : 'dark'
    await app.evaluate(({ nativeTheme }, value) => {
      nativeTheme.themeSource = value as 'light' | 'dark'
    }, opposite)
    await expect
      .poll(() =>
        app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.getBackgroundColor().toLowerCase()),
      )
      .toBe(opposite === 'dark' ? '#3f3f3f' : '#fbf8f1')

    let output = ''
    app.process().stdout!.on('data', (chunk: Buffer) => {
      output += chunk.toString()
    })
    await closeApp(app)
    expect(output).toContain(`[tree-test-close-background] ${opposite === 'dark' ? '#3f3f3f' : '#fbf8f1'}`)
  })
}
