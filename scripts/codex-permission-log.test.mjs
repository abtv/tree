import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { Readable } from 'node:stream'
import { afterEach, describe, expect, it } from 'vitest'
import { appendPermissionRecord, permissionRecord, runPermissionHook } from './codex-permission-log.mjs'

const roots = []
function fixture() {
  mkdirSync('.scratch', { recursive: true })
  const root = mkdtempSync(resolve('.scratch/codex-permission-log-tests-'))
  roots.push(root)
  return root
}
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

const secret = 'FAKE_SECRET_DO_NOT_SAVE_123'
function payload(command, tool = 'Bash') {
  return {
    hook_event_name: 'PermissionRequest',
    tool_name: tool,
    tool_input: { command, description: secret, token: secret },
    cwd: secret,
    session_id: secret,
    transcript_path: secret,
    turn_id: secret,
    env: { API_KEY: secret },
  }
}

describe('minimal Codex permission metadata', () => {
  it.each(['', '/usr/bin/time ', '/usr/bin/time -p '])('keeps only a known operation with prefix %s', (prefix) => {
    const record = permissionRecord(
      payload(`${prefix}npm run test:e2e:diagnose --workers=1 --token=${secret}`),
      new Date(0),
    )
    expect(record).toEqual({
      timestamp: '1970-01-01T00:00:00.000Z',
      event: 'permission-request',
      tool: 'shell',
      operation: `${prefix ? 'timed:' : ''}npm:test:e2e:diagnose`,
    })
    expect(JSON.stringify(record)).not.toContain(secret)
  })

  it.each([
    [`API_KEY=${secret} npm run test:e2e:diagnose`, 'Bash', 'shell'],
    [`npm run ${secret}`, 'Bash', 'shell'],
    [secret, `mcp__${secret}`, 'mcp'],
    [secret, secret, 'other'],
    [secret, 'apply_patch', 'file-edit'],
  ])('does not persist unknown input %s', (command, tool, label) => {
    const record = permissionRecord(payload(command, tool))
    expect(record.tool).toBe(label)
    expect(record.operation).toBe('unknown')
    expect(JSON.stringify(record)).not.toContain(secret)
  })

  it('ignores other events and missing input without recording transcript content', () => {
    expect(permissionRecord(null)).toBeNull()
    expect(permissionRecord({ ...payload(secret), hook_event_name: 'PostToolUse' })).toBeNull()
    expect(permissionRecord({ hook_event_name: 'PermissionRequest' }).tool).toBe('other')
  })

  it('runs the actual script over stdin and appends private JSONL without approving or denying', () => {
    const root = fixture()
    mkdirSync(resolve(root, 'scripts'))
    const script = resolve(root, 'scripts/codex-permission-log.mjs')
    copyFileSync(resolve('scripts/codex-permission-log.mjs'), script)
    for (const command of [`npm run test:e2e:diagnose --workers=1 --token=${secret}`, secret]) {
      const result = spawnSync(process.execPath, [script], {
        input: JSON.stringify(payload(command)),
        encoding: 'utf8',
      })
      expect(result.status).toBe(0)
      expect(result.stdout).toBe('')
      expect(result.stderr).toBe('')
    }
    const logPath = resolve(root, '.scratch/permission-requests/events.jsonl')
    const contents = readFileSync(logPath, 'utf8')
    expect(contents).not.toContain(secret)
    const records = contents.trim().split('\n').map(JSON.parse)
    expect(records).toHaveLength(2)
    expect(records.map((record) => record.operation)).toEqual(['npm:test:e2e:diagnose', 'unknown'])
    expect(records.every((record) => Object.keys(record).sort().join() === 'event,operation,timestamp,tool')).toBe(true)
    expect(statSync(logPath).mode & 0o777).toBe(0o600)
  })

  it.each(['malformed', 'oversized', 'blocked', 'symlink', 'full'])(
    'warns safely on %s input/storage without changing approval',
    async (failure) => {
      const root = fixture()
      const scratch = resolve(root, '.scratch')
      let raw = JSON.stringify(payload(secret))
      if (failure === 'malformed') raw = secret
      if (failure === 'oversized') raw = secret.repeat(5000)
      if (failure === 'blocked') writeFileSync(scratch, secret)
      if (failure === 'symlink') symlinkSync(root, scratch)
      if (failure === 'full') {
        mkdirSync(resolve(scratch, 'permission-requests'), { recursive: true })
        writeFileSync(resolve(scratch, 'permission-requests/events.jsonl'), ' '.repeat(1024 * 1024))
      }
      let output = ''
      await runPermissionHook(Readable.from([raw]), { write: (text) => (output += text) }, root)
      expect(JSON.parse(output)).toEqual({
        systemMessage: 'Permission request could not be recorded. Approval policy is unchanged.',
      })
      expect(output).not.toContain(secret)
    },
  )

  it('rejects a symlink log file without touching its target', () => {
    const root = fixture()
    const directory = resolve(root, '.scratch/permission-requests')
    mkdirSync(directory, { recursive: true })
    const target = resolve(root, 'target')
    writeFileSync(target, secret)
    symlinkSync(target, resolve(directory, 'events.jsonl'))
    expect(() => appendPermissionRecord(permissionRecord(payload(secret)), root)).toThrow()
    expect(readFileSync(target, 'utf8')).toBe(secret)
  })

  it('configures every permission tool and leaves approval decisions to Codex', () => {
    const config = JSON.parse(readFileSync('.codex/hooks.json', 'utf8'))
    expect(Object.keys(config.hooks)).toEqual(['PermissionRequest'])
    expect(config.hooks.PermissionRequest[0].matcher).toBeUndefined()
    expect(config.hooks.PermissionRequest[0].hooks[0].async).toBeUndefined()
    expect(config.hooks.PermissionRequest[0].hooks[0].command).toContain('/scripts/codex-permission-log.mjs')
  })
})
