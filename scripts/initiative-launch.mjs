import { spawn, execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import {
  existsSync,
  fstatSync,
  lstatSync,
  mkdirSync,
  openSync,
  closeSync,
  readFileSync,
  realpathSync,
  unlinkSync,
  writeFileSync,
  writeSync,
} from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { StringDecoder } from 'node:string_decoder'

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PLAN = 'plans/autonomous-initiatives.md'
const OPERATIONS = new Set(['develop-aw3', 'review-aw3', 'verify-aw3'])
const LIMIT_MS = 20 * 60 * 1000
const LIMIT_BYTES = 16 * 1024 * 1024

export function operation(args) {
  if (args.length !== 1 || !OPERATIONS.has(args[0]))
    throw new Error('Expected exactly one operation: develop-aw3, review-aw3, or verify-aw3')
  return args[0]
}

// Deliberately supports only the repository's current role-file schema. New
// fields require review rather than silently dropping a security setting.
export function roleSettings(text, role) {
  const instructions = [...text.matchAll(/^developer_instructions = """\n([\s\S]*?)\n"""$/gm)]
  if (instructions.length !== 1) throw new Error('Unsupported role instructions')
  const values = { developer_instructions: instructions[0][1] }
  let section = ''
  for (const raw of text.replace(instructions[0][0], '').split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    if (line === '[sandbox_workspace_write]') {
      section = 'sandbox_workspace_write.'
      continue
    }
    const match = /^([a-z_]+) = (.+)$/.exec(line)
    if (!match) throw new Error('Unsupported role configuration')
    const key = section + match[1]
    if (Object.hasOwn(values, key)) throw new Error('Duplicate role setting')
    values[key] = JSON.parse(match[2])
  }
  const allowed = [
    'name',
    'description',
    'model',
    'model_reasoning_effort',
    'sandbox_mode',
    'developer_instructions',
    'sandbox_workspace_write.network_access',
  ]
  if (Object.keys(values).some((key) => !allowed.includes(key))) throw new Error('Unsupported role setting')
  for (const key of allowed.slice(0, 6))
    if (typeof values[key] !== 'string' || !values[key].trim()) throw new Error(`Missing role setting: ${key}`)
  if (values.name !== role || values.sandbox_mode !== (role === 'reviewer' ? 'read-only' : 'workspace-write'))
    throw new Error('Role sandbox does not match its contract')
  if (role === 'product_verifier' && values['sandbox_workspace_write.network_access'] !== false)
    throw new Error('Verifier network must remain disabled')
  if (values['sandbox_workspace_write.network_access'] === true)
    throw new Error('Role network access is not authorized')
  return values
}

export function launchContract(root, selected, plan, roleText) {
  operation([selected])
  if (!plan.startsWith('# Autonomous Initiative Execution\n')) throw new Error('Wrong initiative plan')
  const rows = plan.split('\n').filter((line) => /^\| AW-3 \|/.test(line))
  if (rows.length !== 1 || rows[0].split('|').at(-2).trim() !== 'Ready') throw new Error('Committed AW-3 must be Ready')
  if (!plan.includes('The Product Owner approved this direction')) throw new Error('Missing initiative authorization')
  const role = selected === 'review-aw3' ? 'reviewer' : selected === 'verify-aw3' ? 'product_verifier' : null
  const argv = ['exec', '--json', '--cd', root, '--sandbox', role === 'reviewer' ? 'read-only' : 'workspace-write']
  if (role) {
    const settings = roleSettings(roleText, role)
    for (const key of ['model', 'model_reasoning_effort', 'developer_instructions'])
      argv.push('-c', `${key}=${JSON.stringify(settings[key])}`)
    argv.push(
      '-c',
      'web_search="disabled"',
      '-c',
      'sandbox_workspace_write.network_access=false',
      '-c',
      'agents.enabled=false',
    )
  }
  argv.push('-')
  const common = `Work only on the approved Autonomous Initiative Execution AW-3 in ${PLAN}. Read AGENTS.md and WORKING_PLAN.md, then only referenced sections needed for your role. The committed plan is the authorization source. Preserve existing unfinished work. Do not change permissions, trust, role configuration, credentials or coding tool. Do not publish, run AW-4, start its 60-minute pilot budget, advance the initiative, or create commits. Do not launch nested Codex CLI processes. Return concrete blockers; never bypass a denial. This launcher does not grant completion or validation authority.\n\n`
  const prompt =
    common +
    (role
      ? `Act only as the configured ${role}. Follow docs/AGENT_ROLES.md. Inspect the full current change set, including relevant untracked files, and the validation record in WORKING_PLAN.md. Reuse valid evidence. If inputs or required evidence are missing, report the omission; do not infer success. Report meaningful findings or the role's successful no-findings result.`
      : 'Act as the primary implementation agent. Finish the AW-3 candidate and sandbox-compatible focused tests using native file-edit tools. The outer coordinating Codex session owns host Electron/performance validation, independent review and the final commit. Do not launch those native suites here. Keep WORKING_PLAN.md current with scope, decisions, exact evidence and remaining work. Stop after delivering a reviewable candidate.')
  return { argv, prompt }
}

function safeDirectory(path) {
  mkdirSync(path, { recursive: true })
  if (realpathSync(path) !== path) throw new Error('Launcher evidence path must not contain symlinks')
}

// No imports from the unfinished controller. This prerequisite neither accepts
// arbitrary prompts/flags nor stages, commits, advances tasks or changes policy.
export async function launch({
  root = ROOT,
  selected,
  spawnProcess = spawn,
  timeoutMs = LIMIT_MS,
  graceMs = 2000,
  signal,
  onMessage = console.log,
}) {
  operation([selected])
  root = realpathSync(root)
  const git = (args) =>
    execFileSync('git', ['--no-pager', ...args], { cwd: root, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 }).trimEnd()
  if (realpathSync(git(['rev-parse', '--show-toplevel'])) !== root)
    throw new Error('Launcher must own the repository root')
  const head = git(['rev-parse', 'HEAD'])
  const plan = git(['show', `${head}:${PLAN}`]) + '\n'
  const rolePath =
    selected === 'review-aw3'
      ? '.codex/agents/reviewer.toml'
      : selected === 'verify-aw3'
        ? '.codex/agents/product-verifier.toml'
        : null
  const roleText = rolePath ? git(['show', `${head}:${rolePath}`]) : undefined
  const contract = launchContract(root, selected, plan, roleText)
  if (rolePath && readFileSync(join(root, rolePath), 'utf8').trimEnd() !== roleText)
    throw new Error('Uncommitted role configuration requires review')
  if (signal?.aborted) throw new Error('Launcher interrupted before starting')
  const scratch = join(root, '.scratch')
  safeDirectory(scratch)
  if (existsSync(join(scratch, 'initiative-runner.lock'))) throw new Error('Controller ownership already exists')
  const base = join(scratch, 'autonomous-initiatives')
  safeDirectory(base)
  const lockPath = join(base, 'launcher.lock')
  const lock = openSync(lockPath, 'wx', 0o600)
  const token = randomUUID()
  writeFileSync(lock, JSON.stringify({ token, pid: process.pid, selected, head }))
  closeSync(lock)
  const evidence = join(base, `launch-${token}`)
  safeDirectory(evidence)
  const out = openSync(join(evidence, 'stdout.jsonl'), 'wx', 0o600)
  const err = openSync(join(evidence, 'stderr.log'), 'wx', 0o600)
  // Open before the child runs: it cannot redirect a later host write by
  // replacing a scratch path with a symlink to unrelated user data.
  const resultPath = join(evidence, 'result.json')
  const resultFile = openSync(resultPath, 'wx', 0o600)
  const resultIdentity = fstatSync(resultFile)
  let child
  let stopReason = null
  let bytes = 0
  let pending = ''
  const decoder = new StringDecoder('utf8')
  let sessionId = null
  let completed = false
  let nativeFailure = false
  let timer
  let terminateTimer
  let hardTimer
  let closed = false
  const stop = (reason) => {
    if (stopReason || closed) return
    stopReason = reason
    child?.kill('SIGINT')
    terminateTimer = setTimeout(() => {
      if (!closed) child?.kill('SIGTERM')
    }, graceMs)
  }
  const abort = () => stop('interrupted')
  try {
    child = spawnProcess('codex', contract.argv, { cwd: root, shell: false, stdio: ['pipe', 'pipe', 'pipe'] })
    const outcome = new Promise((resolveOutcome) => {
      child.once('error', (error) => {
        stopReason ??= error.message
      })
      child.once('close', (code, exitSignal) => {
        closed = true
        resolveOutcome({ code, signal: exitSignal })
      })
    })
    const consume = (fd, chunk, stdout) => {
      bytes += chunk.length
      if (bytes > LIMIT_BYTES) {
        stop('output limit')
        return
      }
      try {
        writeSync(fd, chunk)
        if (!stdout) return
        pending += decoder.write(chunk)
        let end
        while ((end = pending.indexOf('\n')) >= 0) {
          const line = pending.slice(0, end).trim()
          pending = pending.slice(end + 1)
          if (!line) continue
          const event = JSON.parse(line)
          if (event.type === 'thread.started') {
            if (sessionId || typeof event.thread_id !== 'string' || !event.thread_id.trim())
              throw new Error('Invalid session attribution')
            sessionId = event.thread_id
            onMessage(`Codex session: ${sessionId}`)
          }
          if (event.type === 'turn.completed') completed = true
          if (event.type === 'turn.failed' || event.type === 'error') nativeFailure = true
          if (event.type === 'item.completed' && event.item?.type === 'agent_message') onMessage(event.item.text)
        }
      } catch (error) {
        stop(error.message)
      }
    }
    child.stdout.on('data', (chunk) => consume(out, chunk, true))
    child.stderr.on('data', (chunk) => consume(err, chunk, false))
    child.stdin.on('error', () => {})
    signal?.addEventListener('abort', abort, { once: true })
    if (signal?.aborted) abort()
    timer = setTimeout(() => stop('20-minute launcher limit'), timeoutMs)
    const boundedStop = new Promise((resolveStop) => {
      const check = () => {
        if (closed) return
        if (stopReason)
          hardTimer = setTimeout(() => resolveStop({ code: null, signal: null, cleanupUnconfirmed: true }), graceMs * 3)
        else hardTimer = setTimeout(check, 100)
      }
      check()
    })
    onMessage(`Evidence: ${evidence}`)
    child.stdin.end(contract.prompt)
    const result = await Promise.race([outcome, boundedStop])
    pending += decoder.end()
    try {
      const currentResult = lstatSync(resultPath)
      if (
        realpathSync(base) !== base ||
        realpathSync(evidence) !== evidence ||
        lstatSync(lockPath).isSymbolicLink() ||
        currentResult.isSymbolicLink() ||
        currentResult.ino !== resultIdentity.ino ||
        currentResult.dev !== resultIdentity.dev ||
        JSON.parse(readFileSync(lockPath, 'utf8')).token !== token
      )
        stopReason ??= 'Launcher ownership or evidence path changed'
    } catch {
      stopReason ??= 'Launcher ownership is missing or malformed'
    }
    const ok =
      result.code === 0 && !result.signal && !stopReason && sessionId && completed && !nativeFailure && !pending.trim()
    const summary = {
      selected,
      head,
      sessionId,
      ...result,
      status: ok ? 'returned' : 'blocked',
      reason: stopReason,
      evidence,
    }
    writeFileSync(resultFile, JSON.stringify(summary, null, 2))
    // A successful native turn is only a handoff, never acceptance. After any
    // abnormal stop retain ownership: CLI exit alone cannot prove that a shared
    // native daemon cancelled every task. Never kill the daemon or infer a PID.
    if (ok) unlinkSync(lockPath)
    onMessage(JSON.stringify(summary))
    return summary
  } finally {
    clearTimeout(timer)
    clearTimeout(terminateTimer)
    clearTimeout(hardTimer)
    signal?.removeEventListener('abort', abort)
    if (child && !closed) {
      child.stdout.removeAllListeners('data')
      child.stderr.removeAllListeners('data')
      child.stdout.destroy()
      child.stderr.destroy()
      child.unref()
    }
    closeSync(out)
    closeSync(err)
    closeSync(resultFile)
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const controller = new AbortController()
  process.once('SIGINT', () => controller.abort())
  process.once('SIGTERM', () => controller.abort())
  try {
    const result = await launch({ selected: operation(process.argv.slice(2)), signal: controller.signal })
    process.exitCode = result.status === 'returned' ? 0 : 1
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
