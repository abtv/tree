import { AsyncLocalStorage } from 'node:async_hooks'
import { execFileSync } from 'node:child_process'

const deadline = new AsyncLocalStorage()

export function withHostDeadline(deadlineAt, operation) {
  if (!Number.isSafeInteger(deadlineAt) || deadlineAt <= Date.now())
    throw new Error('Host authorization window exhausted')
  return deadline.run(deadlineAt, operation)
}

// These calls inspect Git/ps or stage fixed paths; commits use owned async
// process handles. Disable indefinite synchronous waits while the abort timer
// cannot run. Context is invocation-local and never renews a persisted allowance.
export function boundedExecFileSync(file, args, options) {
  let remaining = (deadline.getStore() ?? Date.now() + 10000) - Date.now()
  // Read-only cleanup may finish after the work window, within one second.
  if (remaining <= 0 && file === 'ps') remaining = 1000
  if (remaining <= 0) throw new Error('Host authorization window exhausted before subprocess')
  return execFileSync(file, args, {
    ...options,
    timeout: Math.min(10000, remaining),
    killSignal: 'SIGKILL',
  })
}
