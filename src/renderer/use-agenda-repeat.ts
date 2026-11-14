import { useEffect, useLayoutEffect, useRef } from 'react'
import type { ShortcutProfile } from './shortcut-profile'

/** Pace held shortcuts while leaving independent presses on their existing handler paths. */
export function useAgendaRepeat(options: { shortcuts: ShortcutProfile; blocked: boolean; switchView(): void }): void {
  const latest = useRef(options)
  useLayoutEffect(() => {
    latest.current = options
  })

  useEffect(() => {
    let held = false
    let pending = false
    let remaining = 0
    let frameId = 0

    const stop = (): void => {
      held = false
      pending = false
      cancelAnimationFrame(frameId)
      frameId = 0
    }
    const blocked = (): boolean =>
      latest.current.blocked ||
      document.hidden ||
      document.querySelector('dialog[open], [role="dialog"][aria-modal="true"]') !== null

    const frame = (): void => {
      frameId = 0
      if (!held || blocked()) {
        stop()
        return
      }
      if (--remaining > 0) {
        frameId = requestAnimationFrame(frame)
        return
      }
      if (!pending) return

      pending = false
      latest.current.switchView()
      // Leave a rendering opportunity between repeated replacements. rAF is not a presentation acknowledgment.
      remaining = 2
      frameId = requestAnimationFrame(frame)
    }
    const keydown = (event: KeyboardEvent): void => {
      const { shortcuts } = latest.current
      const target = event.target
      if (
        event.isComposing ||
        event.key.toLowerCase() !== 'p' ||
        !shortcuts.isPrimary(event) ||
        shortcuts.hasNonPrimaryCtrl(event) ||
        event.altKey ||
        event.shiftKey ||
        blocked() ||
        !(target instanceof Element) ||
        target.closest('.node-input, .agenda-list') === null ||
        target.closest('[role="dialog"]') !== null
      ) {
        stop()
        return
      }

      if (!event.repeat || !held) {
        stop()
        held = true
        remaining = 2
        frameId = requestAnimationFrame(frame)
        return
      }

      event.preventDefault()
      event.stopImmediatePropagation()
      pending = true
      if (!frameId) frameId = requestAnimationFrame(frame)
    }
    const keyup = (event: KeyboardEvent): void => {
      if (event.key.toLowerCase() === 'p' || event.key === latest.current.shortcuts.bareModifierKey) stop()
    }

    document.addEventListener('keydown', keydown, true)
    document.addEventListener('keyup', keyup, true)
    document.addEventListener('pointerdown', stop, true)
    document.addEventListener('wheel', stop, { capture: true, passive: true })
    document.addEventListener('compositionstart', stop, true)
    document.addEventListener('visibilitychange', stop)
    window.addEventListener('blur', stop)
    return () => {
      stop()
      document.removeEventListener('keydown', keydown, true)
      document.removeEventListener('keyup', keyup, true)
      document.removeEventListener('pointerdown', stop, true)
      document.removeEventListener('wheel', stop, true)
      document.removeEventListener('compositionstart', stop, true)
      document.removeEventListener('visibilitychange', stop)
      window.removeEventListener('blur', stop)
    }
  }, [])
}
