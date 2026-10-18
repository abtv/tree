import { useEffect, useState } from 'react'
import { APPLE_SHORTCUTS, type ShortcutProfile } from './shortcut-profile'

export function useLeftCommandKey(shortcuts: ShortcutProfile = APPLE_SHORTCUTS): boolean {
  const [pressed, setPressed] = useState(false)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.code === shortcuts.leftModifierCode) setPressed(true)
    }
    const onKeyUp = (event: KeyboardEvent): void => {
      if (event.code === shortcuts.leftModifierCode) setPressed(false)
    }
    const onBlur = (): void => setPressed(false)

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
    }
  }, [shortcuts])

  return pressed
}
