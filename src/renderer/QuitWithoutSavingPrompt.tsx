import { useLayoutEffect, useRef } from 'react'
import { QUIT_WITHOUT_SAVING_PROMPT } from '../domain/product-messages'

interface QuitWithoutSavingPromptProps {
  onChange?: (() => void) | undefined
  onCancel: () => void
  onQuit: () => void
}

export function QuitWithoutSavingPrompt({
  onCancel,
  onQuit,
  onChange,
}: QuitWithoutSavingPromptProps): React.JSX.Element {
  const dialog = useRef<HTMLDialogElement>(null)
  const cancelButton = useRef<HTMLButtonElement>(null)
  useLayoutEffect(() => {
    const surface = dialog.current!
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    surface.showModal()
    onChange?.()
    cancelButton.current?.focus()
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopImmediatePropagation()
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
      surface.close()
      onChange?.()
      if (previous?.isConnected) previous.focus({ preventScroll: true })
    }
  }, [onCancel, onChange])

  return (
    <dialog
      ref={dialog}
      aria-label="Quit without saving"
      aria-modal="true"
      className="quit-without-saving-overlay"
      role="alertdialog"
      data-popup-navigation="horizontal"
      data-editor-selection-return
      onCancel={(event) => {
        event.preventDefault()
        onCancel()
      }}
    >
      <div className="quit-without-saving">
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
    </dialog>
  )
}
