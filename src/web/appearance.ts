type Appearance = 'system' | 'light' | 'dark'

const originalMedia = new WeakMap<CSSMediaRule, string>()
const originalThemeMedia = new WeakMap<HTMLMetaElement, string>()

// Reuse the complete shared palette, including depth colors and selection rules.
// Electron overrides nativeTheme; this browser-only prototype overrides its CSS media rule.
export function applyAppearance(appearance: Appearance): void {
  document.documentElement.style.colorScheme = appearance === 'system' ? 'light dark' : appearance
  for (const sheet of document.styleSheets) {
    for (const rule of sheet.cssRules) {
      if (!(rule instanceof CSSMediaRule)) continue
      if (!originalMedia.has(rule) && rule.conditionText === '(prefers-color-scheme: dark)') {
        originalMedia.set(rule, rule.media.mediaText)
      }
      const original = originalMedia.get(rule)
      if (original === undefined) continue
      rule.media.mediaText = appearance === 'system' ? original : appearance === 'dark' ? 'all' : 'not all'
    }
  }
  // The browser and installed-window chrome follow the chosen surface color.
  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    if (!originalThemeMedia.has(meta)) originalThemeMedia.set(meta, meta.media)
    const original = originalThemeMedia.get(meta)!
    const dark = original.includes('dark')
    meta.media = appearance === 'system' ? original : (appearance === 'dark') === dark ? 'all' : 'not all'
  }
}
