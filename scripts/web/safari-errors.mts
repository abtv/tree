// Executed in each ready Safari document. The isolated origin retains errors through Quit/reopen.
export function observeSafariErrors() {
  const record = (message: string) => {
    const errors = JSON.parse(localStorage.getItem('tree-smoke-errors') ?? '[]') as string[]
    errors.push(message)
    localStorage.setItem('tree-smoke-errors', JSON.stringify(errors))
  }
  window.addEventListener('error', (event) => record(event.message))
  window.addEventListener('unhandledrejection', (event) => record(String(event.reason)))
}

export function readSafariErrors(): string[] {
  return JSON.parse(localStorage.getItem('tree-smoke-errors') ?? '[]')
}
