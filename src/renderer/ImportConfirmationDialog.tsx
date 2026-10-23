import { useLayoutEffect, useRef } from 'react'
import type { DesktopDataOperations, DataActivity } from '../application/notes-archive/desktop-data-operations'
import { desktopImportConfirmationText } from '../application/notes-archive/archive-messages'

export function ImportConfirmationDialog({
  operations,
  state,
}: {
  operations: DesktopDataOperations
  state: DataActivity
}): React.JSX.Element | null {
  const ref = useRef<HTMLDialogElement>(null)
  const cancel = useRef<HTMLButtonElement>(null)
  const confirmation = operations.getConfirmation()
  useLayoutEffect(() => {
    const dialog = ref.current
    if (dialog === null || confirmation === undefined) return
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : undefined
    dialog.showModal()
    return () => {
      dialog.close()
      if (previous?.isConnected) previous.focus({ preventScroll: true })
    }
  }, [confirmation])
  useLayoutEffect(() => {
    if (state.phase === 'confirming') cancel.current?.focus()
  }, [state.phase])
  if (confirmation === undefined) return null
  const text = desktopImportConfirmationText(
    confirmation.fileName,
    confirmation.fileBytes,
    confirmation.incoming,
    confirmation.current,
  )
  const blocked = state.phase !== 'confirming'
  const cancelable = state.phase === 'confirming' || state.phase === 'running'
  return (
    <dialog
      data-popup-navigation="horizontal"
      className="import-confirmation"
      ref={ref}
      role="dialog"
      aria-labelledby="import-title"
      onCancel={(event) => {
        event.preventDefault()
        if (cancelable) void operations.cancel()
      }}
    >
      <h2 id="import-title">Replace Current Notes?</h2>
      <p>{text.incoming}</p>
      <p>{text.current}</p>
      {text.missing === undefined ? null : <p>{text.missing}</p>}
      <p role="status">{'text' in state ? state.text : ''}</p>
      <div className="import-confirmation-actions">
        {typeof confirmation.current === 'string' ? null : (
          <button
            type="button"
            disabled={blocked}
            onClick={() => {
              void operations.exportNotes(true)
            }}
          >
            Export Current Notes First
          </button>
        )}
        <button
          type="button"
          disabled={blocked}
          onClick={() => {
            void operations.replaceNotes()
          }}
        >
          Replace Notes
        </button>
        <button
          type="button"
          ref={cancel}
          disabled={!cancelable}
          onClick={() => {
            void operations.cancel()
          }}
        >
          Cancel
        </button>
      </div>
    </dialog>
  )
}
