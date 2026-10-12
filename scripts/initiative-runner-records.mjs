import { randomUUID } from 'node:crypto'
import {
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { digest } from './initiative-runner-git.mjs'

function fail(message) {
  throw new Error(message)
}

function directory(path) {
  mkdirSync(path, { recursive: true })
  if (lstatSync(path).isSymbolicLink() || !lstatSync(path).isDirectory()) fail('Unsafe evidence directory')
}

function syncDirectory(path) {
  const fd = openSync(path, 'r')
  try {
    fsyncSync(fd)
  } finally {
    closeSync(fd)
  }
}

export function atomicRecord(path, value) {
  const data = JSON.stringify({
    version: 1,
    value,
    checksum: digest(value),
  })
  if (Buffer.byteLength(data) > 4 * 1024 * 1024) fail('Record retention limit exceeded')
  if (existsSync(path) && lstatSync(path).isSymbolicLink()) fail('Symlink record rejected')
  const temporary = `${path}.${randomUUID()}.pending`
  const fd = openSync(temporary, 'wx', 0o600)
  try {
    writeFileSync(fd, data)
    fsyncSync(fd)
  } finally {
    closeSync(fd)
  }
  renameSync(temporary, path)
  syncDirectory(dirname(path))
}

export function readRecord(path) {
  if (lstatSync(path).isSymbolicLink() || lstatSync(path).size > 4 * 1024 * 1024) fail('Unsafe record')
  const record = JSON.parse(readFileSync(path, 'utf8'))
  if (record.version !== 1 || !record.value || record.checksum !== digest(record.value))
    fail('Corrupt or unsupported durable record')
  return record.value
}

// Lock ownership is never reclaimed by guessing whether a persisted PID is
// alive. A crashed owner requires explicit host reconciliation of its children.
export class RunRecords {
  constructor({ root, initiative, hostAuthorized, preflightId }) {
    if (hostAuthorized !== true) fail('Separately authorized host launch required')
    if (!/^[a-z][a-z0-9-]*$/.test(initiative)) fail('Invalid initiative identity')
    this.root = realpathSync(root)
    this.initiative = initiative
    const scratch = join(this.root, '.scratch')
    directory(scratch)
    if (realpathSync(scratch) !== scratch) fail('Scratch path escapes repository')
    this.path = join(scratch, initiative)
    directory(this.path)
    if (realpathSync(this.path) !== this.path) fail('Evidence path escapes repository')
    if (preflightId !== undefined) {
      if (!/^[a-z][a-z0-9-]*$/.test(preflightId)) fail('Invalid preflight identity')
      this.path = join(this.path, 'preflight')
      directory(this.path)
      if (realpathSync(this.path) !== this.path) fail('Preflight path escapes repository')
      this.path = join(this.path, preflightId)
      directory(this.path)
      if (realpathSync(this.path) !== this.path) fail('Preflight path escapes repository')
      this.preflight = true
    }
    this.lockPath = join(scratch, 'initiative-runner.lock')
    this.token = randomUUID()
    const fd = openSync(this.lockPath, 'wx', 0o600)
    try {
      writeFileSync(fd, JSON.stringify({ version: 1, token: this.token, initiative, pid: process.pid }))
      fsyncSync(fd)
    } finally {
      closeSync(fd)
    }
    syncDirectory(scratch)
    this.children = new Set()
    this.observed = new Map()
  }

  assertOwned() {
    if (lstatSync(this.lockPath).isSymbolicLink()) fail('Unsafe ownership lock')
    const lock = JSON.parse(readFileSync(this.lockPath, 'utf8'))
    if (
      lock.version !== 1 ||
      lock.token !== this.token ||
      lock.pid !== process.pid ||
      lock.initiative !== this.initiative
    )
      fail('Exclusive ownership lost')
  }

  file(name) {
    if (!/^[a-zA-Z0-9-]+\.(json|jsonl|log)$/.test(name)) fail('Invalid record name')
    return join(this.path, name)
  }

  save(name, value) {
    this.assertOwned()
    this.assertIntegrity()
    atomicRecord(this.file(name), value)
    this.observed.set(name, digest(value))
  }

  load(name) {
    this.assertOwned()
    const value = readRecord(this.file(name))
    if (this.observed.has(name) && this.observed.get(name) !== digest(value)) fail('Host-observed record changed')
    this.observed.set(name, digest(value))
    return value
  }

  assertIntegrity() {
    this.assertOwned()
    for (const [name, identity] of this.observed) {
      if (digest(readRecord(this.file(name))) !== identity) fail('Host-observed record changed')
    }
  }

  budget({ now, budgetMs, approvalReference, allowExpired = false }) {
    this.assertOwned()
    if (this.preflight) fail('Preflight cannot create an execution budget')
    if (!Number.isSafeInteger(now) || now < 0 || !Number.isSafeInteger(budgetMs) || budgetMs <= 0)
      fail('Invalid elapsed-time allowance')
    const path = this.file('budget.json')
    let value
    if (existsSync(path)) {
      value = this.load('budget.json')
      if (
        value.initiative !== this.initiative ||
        value.budgetMs !== budgetMs ||
        value.approvalReference !== approvalReference ||
        !Number.isSafeInteger(value.startedAt) ||
        !Number.isSafeInteger(value.observedAt) ||
        value.observedAt < value.startedAt ||
        value.deadlineAt !== value.startedAt + budgetMs ||
        now < value.observedAt
      )
        fail('Invalid budget identity or clock moved backwards')
    } else {
      // Existing execution records without their budget cannot renew an allowance.
      if (readdirSync(this.path).some((name) => name !== 'preflight')) fail('Missing original budget ledger')
      const preflightPath = join(this.path, 'preflight')
      if (
        existsSync(preflightPath) &&
        (!lstatSync(preflightPath).isDirectory() || realpathSync(preflightPath) !== preflightPath)
      )
        fail('Unsafe preflight evidence directory')
      value = {
        initiative: this.initiative,
        budgetMs,
        approvalReference,
        startedAt: now,
        observedAt: now,
        deadlineAt: now + budgetMs,
      }
    }
    if (!Number.isSafeInteger(value.deadlineAt)) fail('Invalid budget deadline')
    value.observedAt = now
    this.save('budget.json', value)
    if (now >= value.deadlineAt && !allowExpired)
      fail('Initiative budget exhausted; retain ledger and request supported resolution')
    return value
  }

  artifact(path) {
    const absolute = resolve(path)
    if (!absolute.startsWith(`${this.path}/`) || lstatSync(absolute).isSymbolicLink() || !lstatSync(absolute).isFile())
      fail('Artifact must be an owned regular evidence file')
    if (realpathSync(absolute) !== absolute) fail('Artifact path escapes evidence directory')
    if (lstatSync(absolute).size > 16 * 1024 * 1024) fail('Artifact exceeds retention limit')
    return { path: absolute.slice(this.root.length + 1), identity: digest(readFileSync(absolute).toString('base64')) }
  }

  verifyArtifacts(artifacts) {
    if (!Array.isArray(artifacts) || artifacts.length === 0) fail('Missing observed artifacts')
    for (const artifact of artifacts) {
      if (this.artifact(join(this.root, artifact.path)).identity !== artifact.identity)
        fail('Evidence artifact changed')
    }
  }

  release() {
    this.assertOwned()
    if (this.children.size) fail('Owned process cleanup remains unconfirmed; retain lock')
    unlinkSync(this.lockPath)
    syncDirectory(dirname(this.lockPath))
  }
}
