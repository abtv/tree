import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { closeSync, fsyncSync, openSync, writeSync } from 'node:fs'

export class StageBlocker extends Error {
  constructor(kind, reason, nextAction) {
    super(reason)
    this.kind = kind
    this.nextAction = nextAction
  }
}

export function classifyFailure(text) {
  if (/authentication|unauthorized|not logged in|invalid api key|401\b/i.test(text)) return 'authentication'
  if (/operation not permitted|permission denied|approval.*(denied|required)|sandbox.*denied/i.test(text))
    return 'permission'
  return 'failure'
}

// Direct child handles are authority for signalling, never a PID from disk.
// Native subtree cleanup must additionally be confirmed by the host before it
// releases ownership or launches another process. There is no escalation here.
export async function observeProcess({
  records,
  argv,
  cwd = records.root,
  deadlineAt,
  signal,
  input,
  onStdout,
  now = Date.now,
  graceMs = 1000,
}) {
  records.assertOwned()
  if (!Array.isArray(argv) || !argv.length || argv.some((arg) => typeof arg !== 'string' || arg.includes('\0')))
    throw new Error('Explicit process argv required')
  if (!Number.isSafeInteger(deadlineAt) || now() >= deadlineAt)
    throw new StageBlocker(
      'budget',
      'Initiative budget exhausted',
      'Retain the ledger; obtain supported budget resolution',
    )
  if (signal?.aborted) throw new StageBlocker('interrupted', 'Interrupted before launch', 'Reconcile the same task')
  const id = randomUUID()
  const stdoutPath = records.file(`${id}-stdout.log`)
  const stderrPath = records.file(`${id}-stderr.log`)
  const stdout = openSync(stdoutPath, 'wx', 0o600)
  const stderr = openSync(stderrPath, 'wx', 0o600)
  const startedAt = now()
  let child
  let interrupted = null
  let error = null
  let bytes = 0
  let stderrTail = ''
  let terminateTimer
  let hardTimer
  let budgetTimer
  let closed = false
  const launch = { id, argv, cwd, startedAt, token: records.token, pid: null, phase: 'starting' }
  const stop = (kind, reason) => {
    if (closed || interrupted) return
    interrupted = { kind, reason }
    // The in-memory child is owned by this invocation, even if the persisted
    // record has been altered. Never look up or signal another process by PID.
    child?.kill('SIGINT')
    terminateTimer = setTimeout(() => child?.kill('SIGTERM'), graceMs)
  }
  const abort = () => stop('interrupted', 'Coordinator interrupted')
  let result
  let outcome
  let cleanupDeadline
  try {
    records.save(`${id}-launch.json`, launch)
    child = spawn(argv[0], argv.slice(1), { cwd, shell: false, stdio: ['pipe', 'pipe', 'pipe'] })
    child.on('error', (cause) => {
      error = cause
    })
    records.children.add(child)
    launch.pid = child.pid ?? null
    launch.phase = 'running'
    const consume = (fd, chunk, isStdout) => {
      try {
        bytes += chunk.length
        if (bytes > 16 * 1024 * 1024) {
          stop('capability', 'Observed output exceeded bounded retention')
          return
        }
        writeSync(fd, chunk)
        if (isStdout) {
          onStdout?.(chunk)
        } else stderrTail = (stderrTail + chunk.toString('utf8')).slice(-8192)
      } catch (cause) {
        error = cause
        stop('capability', `Unsupported native output: ${cause.message}`)
      }
    }
    child.stdout.on('data', (chunk) => consume(stdout, chunk, true))
    child.stderr.on('data', (chunk) => consume(stderr, chunk, false))
    // Chunk long allowances to avoid Node's signed timer overflow.
    const armBudget = () => {
      const remaining = deadlineAt - now()
      if (remaining <= 0) stop('budget', 'Initiative budget exhausted during process')
      else budgetTimer = setTimeout(armBudget, Math.min(remaining, 60000))
    }
    armBudget()
    signal?.addEventListener('abort', abort, { once: true })
    if (signal?.aborted) abort()
    outcome = new Promise((resolve) => {
      child.once('error', (cause) => {
        error = cause
      })
      child.once('close', (exitCode, exitSignal) => {
        closed = true
        records.children.delete(child)
        resolve({ exitCode, signal: exitSignal })
      })
    })
    child.stdin.on('error', () => {})
    child.stdin.end(input ?? '')
    cleanupDeadline = new Promise((resolve) => {
      // If SIGTERM cannot confirm closure, preserve the live handle and lock.
      const check = () => {
        if (closed) return
        if (interrupted)
          hardTimer = setTimeout(() => resolve({ exitCode: null, signal: null, cleanupUnconfirmed: true }), graceMs * 3)
        else hardTimer = setTimeout(check, Math.min(100, graceMs))
      }
      check()
    })
    records.save(`${id}-launch.json`, launch)
    result = await Promise.race([outcome, cleanupDeadline])
    if (result.cleanupUnconfirmed) {
      child.stdout.removeAllListeners('data')
      child.stderr.removeAllListeners('data')
      child.stdout.destroy()
      child.stderr.destroy()
    }
    const finishedAt = now()
    const failureText = `${error?.message ?? ''}\n${stderrTail}`
    const kind = result.cleanupUnconfirmed ? 'capability' : classifyFailure(failureText)
    const blocker =
      interrupted ??
      (error || result.exitCode !== 0 || result.signal
        ? { kind, reason: failureText.trim() || 'Observed process failed' }
        : null)
    const record = { ...launch, ...result, phase: 'finished', finishedAt, blocker, bytes, stderrTail }
    records.save(`${id}-launch.json`, record)
    return {
      ...record,
      artifacts: [
        records.artifact(stdoutPath),
        records.artifact(stderrPath),
        records.artifact(records.file(`${id}-launch.json`)),
      ],
    }
  } catch (cause) {
    // A persistence/ownership failure after spawn must not abandon the live
    // child. Cleanup uses only the in-memory handle; failed cleanup keeps it
    // in records.children, preventing release of the lock.
    if (child && !closed) {
      stop('capability', `Coordinator observation failed: ${cause.message}`)
      if (outcome && cleanupDeadline) {
        const cleanup = await Promise.race([outcome, cleanupDeadline])
        if (cleanup.cleanupUnconfirmed) {
          child.stdout.removeAllListeners('data')
          child.stderr.removeAllListeners('data')
          child.stdout.destroy()
          child.stderr.destroy()
        }
      }
    }
    throw cause
  } finally {
    clearTimeout(budgetTimer)
    clearTimeout(terminateTimer)
    clearTimeout(hardTimer)
    signal?.removeEventListener('abort', abort)
    fsyncSync(stdout)
    fsyncSync(stderr)
    closeSync(stdout)
    closeSync(stderr)
  }
}
