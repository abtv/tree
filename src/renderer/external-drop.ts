/** Tree moves its own nodes with pointer events; native drops are never an input channel. */
export function blockExternalDrops(target: Window): () => void {
  const rejectDrop = (event: DragEvent): void => {
    event.preventDefault()
    if (event.dataTransfer !== null) event.dataTransfer.dropEffect = 'none'
  }
  const rejectDropInput = (event: InputEvent): void => {
    if (event.inputType === 'insertFromDrop') event.preventDefault()
  }
  target.addEventListener('dragover', rejectDrop, true)
  target.addEventListener('drop', rejectDrop, true)
  target.addEventListener('beforeinput', rejectDropInput, true)
  return () => {
    target.removeEventListener('dragover', rejectDrop, true)
    target.removeEventListener('drop', rejectDrop, true)
    target.removeEventListener('beforeinput', rejectDropInput, true)
  }
}
