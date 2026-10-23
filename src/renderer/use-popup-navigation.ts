import { useEffect } from 'react'

function availableButtons(popup: HTMLElement): HTMLButtonElement[] {
  return Array.from(popup.querySelectorAll<HTMLButtonElement>('button')).filter(
    (button) => !button.disabled && button.getClientRects().length > 0,
  )
}

/** Popup input belongs to the focused surface, independently of the editor's Vim mode. */
export function usePopupNavigation(vimEnabled: boolean): void {
  useEffect(() => {
    if (!vimEnabled) return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (
        event.defaultPrevented ||
        event.isComposing ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        event.shiftKey ||
        !['h', 'j', 'k', 'l', 'Escape'].includes(event.key)
      )
        return
      const target = event.target
      if (!(target instanceof HTMLElement) || target.closest('input, textarea, select, [contenteditable]')) return
      const popup = target.closest<HTMLElement>('[data-popup-navigation]')
      if (popup === null) return
      const buttons = availableButtons(popup)
      if (event.key === 'Escape') {
        const dismiss = buttons.find((button) => button.hasAttribute('data-popup-dismiss'))
        if (dismiss === undefined) return // Dialogs own their cancellation and busy-state rules.
        event.preventDefault()
        event.stopPropagation()
        dismiss.click()
        return
      }
      const [previous, next] = popup.dataset.popupNavigation === 'vertical' ? ['k', 'j'] : ['h', 'l']
      if (event.key !== previous && event.key !== next) return
      const index = buttons.findIndex((button) => button === document.activeElement)
      if (index < 0) return
      event.preventDefault()
      event.stopPropagation()
      buttons[Math.max(0, Math.min(buttons.length - 1, index + (event.key === previous ? -1 : 1)))]!.focus()
    }
    const onToggle = (event: Event): void => {
      const popup = event.target
      if (
        (event as ToggleEvent).newState === 'open' &&
        popup instanceof HTMLElement &&
        popup.matches('[popover][data-popup-navigation="vertical"]')
      )
        availableButtons(popup)[0]?.focus()
    }
    document.addEventListener('keydown', onKeyDown, true)
    document.addEventListener('toggle', onToggle, true)
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      document.removeEventListener('toggle', onToggle, true)
    }
  }, [vimEnabled])
}
