import { constants, appendFileSync, closeSync, fstatSync, lstatSync, mkdirSync, openSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const MAX_INPUT_BYTES = 64 * 1024
const MAX_LOG_BYTES = 1024 * 1024
const WORKFLOWS = new Set([
  'check',
  'check:full',
  'test',
  'test:coverage',
  'test:performance',
  'test:e2e',
  'test:e2e:changed',
  'test:e2e:diagnose',
  'test:e2e:visible',
  'test:e2e:timing',
  'test:perf',
  'test:perf:profile',
])

// Never copy incoming strings into the record, even tool names or error messages.
export function permissionRecord(input, now = new Date()) {
  if (!input || input.hook_event_name !== 'PermissionRequest') return null
  const tool =
    input.tool_name === 'Bash'
      ? 'shell'
      : input.tool_name === 'apply_patch'
        ? 'file-edit'
        : typeof input.tool_name === 'string' && input.tool_name.startsWith('mcp__')
          ? 'mcp'
          : 'other'
  let operation = 'unknown'
  if (tool === 'shell' && typeof input.tool_input?.command === 'string') {
    const words = input.tool_input.command.trimStart().split(/\s+/, 6)
    let timed = false
    if (words[0] === '/usr/bin/time') {
      words.shift()
      if (words[0] === '-p') words.shift()
      timed = true
    }
    if (words[0] === 'npm' && words[1] === 'test') operation = 'npm:test'
    if (words[0] === 'npm' && words[1] === 'run' && WORKFLOWS.has(words[2])) operation = `npm:${words[2]}`
    if (timed && operation !== 'unknown') operation = `timed:${operation}`
  }
  return { timestamp: now.toISOString(), event: 'permission-request', tool, operation }
}

export function appendPermissionRecord(record, root = ROOT) {
  ensureLogDirectories(root)
  const path = resolve(root, '.scratch/permission-requests/events.jsonl')
  const fd = openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_APPEND | constants.O_NOFOLLOW, 0o600)
  try {
    const stat = fstatSync(fd)
    const line = `${JSON.stringify(record)}\n`
    if (!stat.isFile() || stat.nlink !== 1 || stat.size + Buffer.byteLength(line) > MAX_LOG_BYTES)
      throw new Error('Unsafe or full permission log')
    appendFileSync(fd, line)
  } finally {
    closeSync(fd)
  }
}

function ensureLogDirectories(root) {
  for (const directory of [resolve(root, '.scratch'), resolve(root, '.scratch/permission-requests')]) {
    try {
      mkdirSync(directory, { mode: 0o700 })
    } catch (error) {
      if (error.code !== 'EEXIST') throw error
    }
    if (!lstatSync(directory).isDirectory() || lstatSync(directory).isSymbolicLink())
      throw new Error('Unsafe permission log directory')
  }
}

export async function runPermissionHook(input, output, root = ROOT) {
  try {
    const chunks = []
    let bytes = 0
    for await (const chunk of input) {
      bytes += Buffer.byteLength(chunk)
      if (bytes > MAX_INPUT_BYTES) throw new Error('Oversized hook input')
      chunks.push(chunk)
    }
    const record = permissionRecord(
      JSON.parse(Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString('utf8')),
    )
    if (record) {
      appendPermissionRecord(record, root)
    }
  } catch {
    // A logging failure never changes the approval decision and never echoes input.
    output.write(
      JSON.stringify({ systemMessage: 'Permission request could not be recorded. Approval policy is unchanged.' }),
    )
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await runPermissionHook(process.stdin, process.stdout)
}
