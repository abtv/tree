import { useEffect, useRef } from 'react'
import { QUIT_WITHOUT_SAVING_PROMPT } from '../domain/product-messages'

interface QuitWithoutSavingPromptProps {
  onCancel: () => void
  onQuit: () => void
}

export function QuitWithoutSavingPrompt({ onCancel, onQuit }: QuitWithoutSavingPromptProps): React.JSX.Element {
  const dialog = useRef<HTMLDivElement>(null)
  const cancelButton = useRef<HTMLButtonElement>(null)
  const previouslyFocused = useRef<HTMLElement | null>(null)

  useEffect(() => {
    previouslyFocused.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    cancelButton.current?.focus()
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCancel()
        return
      }
      if (event.key !== 'Tab') return
      const buttons = dialog.current?.querySelectorAll<HTMLButtonElement>('button')
      if (buttons === undefined || buttons.length === 0) return
      const first = buttons[0]!
      const last = buttons[buttons.length - 1]!
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      previouslyFocused.current?.focus()
    }
  }, [onCancel])

  return (
    <section
      aria-label="Quit without saving"
      aria-modal="true"
      className="quit-without-saving-overlay"
      role="alertdialog"
    >
      <div className="quit-without-saving" ref={dialog}>
        <p>{QUIT_WITHOUT_SAVING_PROMPT}</p>
        <div className="quit-without-saving-actions">
          <button ref={cancelButton} type="button" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" onClick={onQuit}>
            Quit without saving
          </button>
        </div>
      </div>
    </section>
  )
}
