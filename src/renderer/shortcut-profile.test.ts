import { describe, expect, it } from 'vitest'
import { APPLE_SHORTCUTS, OTHER_SHORTCUTS, shortcutProfile } from './shortcut-profile'

interface Flags {
  metaKey: boolean
  ctrlKey: boolean
  altKey: boolean
  shiftKey: boolean
}

const allFlagCombinations: Flags[] = Array.from({ length: 16 }, (_, bits) => ({
  metaKey: (bits & 1) !== 0,
  ctrlKey: (bits & 2) !== 0,
  altKey: (bits & 4) !== 0,
  shiftKey: (bits & 8) !== 0,
}))

const withModifierState =
  (flags: Flags, active: readonly string[]) =>
  (key: string): boolean =>
    active.includes(key) && flags.ctrlKey && flags.altKey

describe('apple shortcut profile', () => {
  it.each(allFlagCombinations)('treats the primary modifier as metaKey for %o', (flags) => {
    expect(APPLE_SHORTCUTS.isPrimary(flags)).toBe(flags.metaKey)
    expect(APPLE_SHORTCUTS.isPrimary({ ...flags, getModifierState: () => false })).toBe(flags.metaKey)
    expect(APPLE_SHORTCUTS.isPrimary({ ...flags, getModifierState: withModifierState(flags, ['AltGraph']) })).toBe(
      flags.metaKey,
    )
  })

  it('names Cmd keys and the Ctrl context-menu click', () => {
    expect(APPLE_SHORTCUTS.platform).toBe('apple')
    expect(APPLE_SHORTCUTS.bareModifierKey).toBe('Meta')
    expect(APPLE_SHORTCUTS.leftModifierCode).toBe('MetaLeft')
    expect(APPLE_SHORTCUTS.isContextMenuClick({ ctrlKey: true })).toBe(true)
    expect(APPLE_SHORTCUTS.isContextMenuClick({ ctrlKey: false })).toBe(false)
  })

  it('takes word motion from Option alone', () => {
    expect(APPLE_SHORTCUTS.isWordMotion({ altKey: true, ctrlKey: false })).toBe(true)
    expect(APPLE_SHORTCUTS.isWordMotion({ altKey: false, ctrlKey: true })).toBe(false)
  })

  it('formats shortcut labels with the Command symbol', () => {
    expect(APPLE_SHORTCUTS.format({ key: 'Q' })).toBe('⌘Q')
    expect(APPLE_SHORTCUTS.format({ key: 'p', shift: true })).toBe('⇧⌘P')
  })
})

describe('other shortcut profile', () => {
  const base = { metaKey: false, ctrlKey: false }

  it.each([
    ['Ctrl alone', { ...base, ctrlKey: true }, true],
    ['Ctrl+Shift', { ...base, ctrlKey: true, shiftKey: true }, true],
    ['Ctrl+Alt without AltGraph', { ...base, ctrlKey: true, altKey: true }, true],
    [
      'Ctrl+Alt with AltGraph',
      { ...base, ctrlKey: true, altKey: true, getModifierState: (key: string) => key === 'AltGraph' },
      false,
    ],
    ['Ctrl+Alt reporting no AltGraph', { ...base, ctrlKey: true, altKey: true, getModifierState: () => false }, true],
    ['Ctrl+Meta', { metaKey: true, ctrlKey: true }, false],
    ['Meta alone', { metaKey: true, ctrlKey: false }, false],
    ['no modifier', base, false],
  ])('classifies %s', (_name, event, expected) => {
    expect(OTHER_SHORTCUTS.isPrimary(event)).toBe(expected)
  })

  it('names Ctrl keys and has no context-menu click', () => {
    expect(OTHER_SHORTCUTS.platform).toBe('other')
    expect(OTHER_SHORTCUTS.bareModifierKey).toBe('Control')
    expect(OTHER_SHORTCUTS.leftModifierCode).toBe('ControlLeft')
    expect(OTHER_SHORTCUTS.isContextMenuClick({ ctrlKey: true })).toBe(false)
  })

  it('takes word motion from Ctrl alone', () => {
    expect(OTHER_SHORTCUTS.isWordMotion({ altKey: false, ctrlKey: true })).toBe(true)
    expect(OTHER_SHORTCUTS.isWordMotion({ altKey: true, ctrlKey: false })).toBe(false)
  })

  it('formats shortcut labels with Ctrl', () => {
    expect(OTHER_SHORTCUTS.format({ key: 'Q' })).toBe('Ctrl+Q')
    expect(OTHER_SHORTCUTS.format({ key: 'p', shift: true })).toBe('Ctrl+Shift+P')
  })
})

describe('shortcutProfile', () => {
  it('returns the shared constant for each platform', () => {
    expect(shortcutProfile('apple')).toBe(APPLE_SHORTCUTS)
    expect(shortcutProfile('other')).toBe(OTHER_SHORTCUTS)
  })
})
