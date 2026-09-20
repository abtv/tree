import { randomUUID } from 'node:crypto'
import { mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// The macOS system clipboard is a single machine-wide resource. Parallel E2E workers each launch
// their own application, so a clipboard write or copy in one worker can otherwise be observed by a
// paste in another worker. Clipboard-using tests serialize through this lock directory.
//
// The lock is a directory created atomically with `mkdir`, holding an owner file with the owning
// worker PID, acquisition time, and a unique token. A lock whose owner process is gone is broken by
// atomically renaming the directory to a quarantine name, so exactly one waiter can claim a stale
// lock. A live owner is never considered stale, even if its test runs long. `e2e/global-setup.ts`
// removes a leftover lock before a run starts.
const LOCK_NAME = 'tree-e2e-clipboard.lock'
const LOCK_DIRECTORY = join(tmpdir(), LOCK_NAME)
const STALE_QUARANTINE_PREFIX = `${LOCK_NAME}.stale-`
const OWNER_FILE = 'owner.json'
// A freshly created lock directory may not have its owner file yet. Only treat a missing owner file
// as stale once the directory has outlived this grace period, so a concurrent acquisition is not
// mistaken for a crash.
const OWNER_FILE_GRACE_MS = 2_000
const ACQUIRE_TIMEOUT_MS = 30_000
const POLL_INTERVAL_MS = 25

interface LockOwner {
  pid: number
  startedAt: number
  token: string
}

let heldToken: string | undefined

export async function acquireSystemClipboardLock(): Promise<void> {
  if (heldToken !== undefined) return
  const deadline = Date.now() + ACQUIRE_TIMEOUT_MS
  for (;;) {
    const token = `${process.pid}-${Date.now()}-${randomUUID()}`
    try {
      mkdirSync(LOCK_DIRECTORY)
      writeFileSync(
        join(LOCK_DIRECTORY, OWNER_FILE),
        JSON.stringify({ pid: process.pid, startedAt: Date.now(), token }),
      )
      // Confirm ownership after writing: a waiter that observed an older state could have
      // quarantined this directory between the `mkdir` and the write.
      if (readOwner()?.token === token) {
        heldToken = token
        return
      }
    } catch (error) {
      if (!isExpectedLockError(error)) throw error
    }
    if (breakStaleLock()) continue
    if (Date.now() >= deadline) {
      throw new Error(
        `Timed out after ${ACQUIRE_TIMEOUT_MS} ms waiting for the system clipboard lock at ${LOCK_DIRECTORY} ` +
          `(${describeLockOwner()}; this worker pid ${process.pid}). ` +
          'Another E2E worker is using the system clipboard, or a stale lock could not be broken.',
      )
    }
    await delay(POLL_INTERVAL_MS)
  }
}

export function releaseSystemClipboardLock(): void {
  if (heldToken === undefined) return
  const token = heldToken
  heldToken = undefined
  // Only remove the lock this process still owns. If the lock was broken and re-acquired in the
  // meantime, removing it would hand the shared clipboard to two workers at once.
  if (readOwner()?.token === token) rmSync(LOCK_DIRECTORY, { recursive: true, force: true })
}

// The global setup runs before any worker exists, so a lock and any quarantined leftovers from a
// crashed run are necessarily stale and can be removed without consulting their owner.
export function removeStaleClipboardLock(): void {
  rmSync(LOCK_DIRECTORY, { recursive: true, force: true })
  for (const entry of readdirSync(tmpdir())) {
    if (entry.startsWith(STALE_QUARANTINE_PREFIX)) {
      rmSync(join(tmpdir(), entry), { recursive: true, force: true })
    }
  }
}

function describeLockOwner(): string {
  const owner = readOwner()
  if (owner === undefined) return `unreadable owner file, directory age ${directoryAgeMs()} ms`
  return `owner pid ${owner.pid}, age ${Date.now() - owner.startedAt} ms, running ${processIsRunning(owner.pid)}`
}

// Claims a stale lock by renaming its directory to a unique quarantine name. Only one waiter can
// move a given directory, so the same stale lock is never deleted twice. The moved directory is
// inspected before deletion: if a newer lock was moved, it is put back, and its owner's release
// remains owner-checked. This is test tooling, not a general-purpose lock primitive; reclamation
// only needs to handle a crashed worker, not adversarial scheduling.
function breakStaleLock(): boolean {
  const owner = readOwner()
  if (owner !== undefined && !ownerIsStale(owner)) return false
  if (owner === undefined && directoryAgeMs() <= OWNER_FILE_GRACE_MS) return false
  // Re-read immediately before the move: a lock acquired between the staleness read and the move
  // must not be touched. The re-read leaves a single-syscall window that the token check below
  // detects and repairs.
  if (readOwner()?.token !== owner?.token) return false
  const quarantine = join(tmpdir(), `${STALE_QUARANTINE_PREFIX}${process.pid}-${randomUUID()}`)
  try {
    renameSync(LOCK_DIRECTORY, quarantine)
  } catch {
    return false
  }
  const moved = readOwnerFrom(quarantine)
  if (moved !== undefined && moved.token !== owner?.token) {
    try {
      renameSync(quarantine, LOCK_DIRECTORY)
    } catch {
      // The canonical path is occupied again. Leave the quarantine for the global setup instead of
      // destroying the newer owner's data; that owner's release remains owner-checked.
    }
    return false
  }
  rmSync(quarantine, { recursive: true, force: true })
  return true
}

function ownerIsStale(owner: LockOwner): boolean {
  // A worker that still runs can be releasing its lock concurrently; its own next acquisition
  // (this process) recovers a lock left by a previous test in the same worker.
  if (owner.pid === process.pid) return true
  return !processIsRunning(owner.pid)
}

function readOwner(): LockOwner | undefined {
  return readOwnerFrom(LOCK_DIRECTORY)
}

function readOwnerFrom(directory: string): LockOwner | undefined {
  let parsed: unknown
  try {
    parsed = JSON.parse(readFileSync(join(directory, OWNER_FILE), 'utf8')) as unknown
  } catch {
    return undefined
  }
  if (typeof parsed !== 'object' || parsed === null) return undefined
  const candidate = parsed as Partial<LockOwner>
  if (
    typeof candidate.pid !== 'number' ||
    typeof candidate.startedAt !== 'number' ||
    typeof candidate.token !== 'string'
  ) {
    return undefined
  }
  return { pid: candidate.pid, startedAt: candidate.startedAt, token: candidate.token }
}

function directoryAgeMs(): number {
  try {
    return Date.now() - statSync(LOCK_DIRECTORY).mtimeMs
  } catch {
    return 0
  }
}

function processIsRunning(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    // A process owned by another user exists but cannot be signalled; only a missing process is dead.
    return isPermissionError(error)
  }
}

function isPermissionError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'EPERM'
}

function isExpectedLockError(error: unknown): boolean {
  return hasCode(error, 'EEXIST') || hasCode(error, 'ENOENT')
}

function hasCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code
}

async function delay(milliseconds: number): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, milliseconds)
  })
}

// Best-effort release when a worker exits without running the fixture teardown.
process.on('exit', () => {
  releaseSystemClipboardLock()
})
