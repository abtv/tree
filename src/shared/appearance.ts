const appearances = ['system', 'light', 'dark', 'gray', 'white'] as const

/** The user's appearance choice. Automatic follows the operating system. */
export type AppearancePreference = (typeof appearances)[number]

export function isAppearancePreference(value: unknown): value is AppearancePreference {
  return appearances.some((appearance) => appearance === value)
}

export function appearanceThemeSource(appearance: AppearancePreference): 'system' | 'light' | 'dark' {
  return appearance === 'gray' || appearance === 'white' ? 'light' : appearance
}

export function appearanceColorScheme(appearance: AppearancePreference): string {
  return appearance === 'system' ? 'light dark' : appearanceThemeSource(appearance)
}

/** Match the document surface in the native window and browser chrome. */
export function appearanceBackgroundColor(dark: boolean, appearance: AppearancePreference): string {
  if (appearance === 'gray') return '#dddddd'
  if (appearance === 'white') return '#ffffff'
  return dark ? '#3f3f3f' : '#fbf8f1'
}
