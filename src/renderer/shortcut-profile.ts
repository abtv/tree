/**
 * The platform's primary-modifier convention for keyboard and pointer shortcuts. Apple platforms use
 * Cmd where every other platform uses Ctrl (`docs/ARCHITECTURE.md` §8). A profile is a module
 * constant that the composition root injects, so no key event allocates or reads global state.
 */
export type ShortcutPlatform = 'apple' | 'other'

/** The modifier state a primary-shortcut test reads. Test doubles may omit `getModifierState`. */
export interface ShortcutModifierEvent {
  metaKey: boolean
  ctrlKey: boolean
  getModifierState?: ((key: 'AltGraph') => boolean) | undefined
}

/** A shortcut as data: the key and whether Shift joins the primary modifier. */
export interface ShortcutLabelSource {
  key: string
  shift?: boolean
}

export interface ShortcutProfile {
  readonly platform: ShortcutPlatform
  /** The `key` value of a keydown that presses the primary modifier alone. */
  readonly bareModifierKey: 'Meta' | 'Control'
  /** The `code` of the left primary-modifier key, which marks link-open mode. */
  readonly leftModifierCode: 'MetaLeft' | 'ControlLeft'
  /** Whether the event carries the primary modifier of this platform. */
  isPrimary(event: ShortcutModifierEvent): boolean
  /** Whether a press with this event is the platform's context-menu gesture (Ctrl+click on macOS). */
  isContextMenuClick(event: { ctrlKey: boolean }): boolean
  /** Whether the event carries the word-motion modifier (Option on Apple platforms, Ctrl elsewhere). */
  isWordMotion(event: { altKey: boolean; ctrlKey: boolean }): boolean
  /** The command-panel label of a shortcut. */
  format(shortcut: ShortcutLabelSource): string
}

export const APPLE_SHORTCUTS: ShortcutProfile = {
  platform: 'apple',
  bareModifierKey: 'Meta',
  leftModifierCode: 'MetaLeft',
  isPrimary: (event) => event.metaKey,
  isContextMenuClick: (event) => event.ctrlKey,
  isWordMotion: (event) => event.altKey,
  format: (shortcut) => `${shortcut.shift === true ? '⇧' : ''}⌘${shortcut.key.toUpperCase()}`,
}

export const OTHER_SHORTCUTS: ShortcutProfile = {
  platform: 'other',
  bareModifierKey: 'Control',
  leftModifierCode: 'ControlLeft',
  // Windows reports AltGr as Ctrl+Alt; AltGraph state marks that press as character entry.
  isPrimary: (event) => event.ctrlKey && !event.metaKey && event.getModifierState?.('AltGraph') !== true,
  isContextMenuClick: () => false,
  isWordMotion: (event) => event.ctrlKey,
  format: (shortcut) => `Ctrl+${shortcut.shift === true ? 'Shift+' : ''}${shortcut.key.toUpperCase()}`,
}

export function shortcutProfile(platform: ShortcutPlatform): ShortcutProfile {
  return platform === 'apple' ? APPLE_SHORTCUTS : OTHER_SHORTCUTS
}
