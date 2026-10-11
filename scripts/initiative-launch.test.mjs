import { execFileSync, spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { launch, launchContract, operation, roleSettings } from './initiative-launch.mjs'

const PLAN =
  '# Autonomous Initiative Execution\n\nThe Product Owner approved this direction.\n\n| AW-3 | Adapter | Ready |\n'
const reviewer = readFileSync('.codex/agents/reviewer.toml', 'utf8')
const verifier = readFileSync('.codex/agents/product-verifier.toml', 'utf8')
const roots = []
function fixture() {
  const scratch = resolve('.scratch/autonomous-initiatives/launcher-tests')
  mkdirSync(scratch, { recursive: true })
  const root = mkdtempSync(join(scratch, 'launch-'))
  roots.push(root)
  const git = (args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' })
  git(['init', '--quiet'])
  git(['config', 'user.name', 'Launcher Fixture'])
  git(['config', 'user.email', 'launcher@example.invalid'])
  git(['config', 'commit.gpgsign', 'false'])
  git(['config', 'core.hooksPath', '/dev/null'])
  mkdirSync(join(root, 'plans'))
  mkdirSync(join(root, '.codex/agents'), { recursive: true })
  writeFileSync(join(root, 'plans/autonomous-initiatives.md'), PLAN)
  writeFileSync(join(root, '.codex/agents/reviewer.toml'), reviewer)
  writeFileSync(join(root, '.codex/agents/product-verifier.toml'), verifier)
  git(['add', '.'])
  git(['commit', '--quiet', '-m', 'test(agents): seed launcher fixture'])
  return root
}
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

const validOutput =
  [
    { type: 'thread.started', thread_id: 'synthetic-session' },
    { type: 'turn.started' },
    { type: 'item.completed', item: { type: 'agent_message', text: 'Synthetic handoff only' } },
    { type: 'turn.completed', usage: { input_tokens: 1, output_tokens: 1 } },
  ]
    .map((event) => JSON.stringify(event))
    .join('\n') + '\n'

function nativeFixture(script, inspect = () => {}) {
  return (command, args, options) => {
    inspect(command, args, options)
    return spawn(process.execPath, ['-e', script], options)
  }
}
const success = `process.stdin.resume(); process.stdin.on('end', () => process.stdout.write(${JSON.stringify(validOutput)}))`

describe('bounded launch authority', () => {
  it.each([
    [],
    ['--help'],
    ['develop-aw4'],
    ['develop-aw3', '--sandbox', 'danger-full-access'],
    ['review-aw3', '/other'],
    ['arbitrary prompt'],
  ])('rejects unsupported input %j before launch', (args) => {
    expect(() => operation(args)).toThrow()
  })
  it.each(['develop-aw3', 'review-aw3', 'verify-aw3'])('fixes repository and sandbox for %s', (selected) => {
    const contract = launchContract('/expected', selected, PLAN, selected === 'review-aw3' ? reviewer : verifier)
    expect(contract.argv.slice(0, 7)).toEqual([
      'exec',
      '--json',
      '--cd',
      '/expected',
      '--sandbox',
      selected === 'review-aw3' ? 'read-only' : 'workspace-write',
      ...(selected === 'develop-aw3' ? ['-'] : ['-c']),
    ])
    expect(contract.argv).not.toContain('--approve-for-me')
    expect(contract.argv).not.toContain('--dangerously-bypass-approvals-and-sandbox')
    expect(contract.argv).not.toContain('--ignore-rules')
    expect(contract.prompt).toContain('Do not launch nested Codex CLI')
    expect(contract.prompt).toContain('Do not publish, run AW-4')
    if (selected !== 'develop-aw3') {
      expect(contract.argv).toContain('web_search="disabled"')
      expect(contract.argv).toContain('sandbox_workspace_write.network_access=false')
    }
  })
  it.each([
    PLAN.replace('Ready', 'Done'),
    PLAN.replace('Ready', 'Planned'),
    PLAN + '| AW-3 | duplicate | Ready |\n',
    PLAN.replace('Autonomous Initiative Execution', 'Other'),
    PLAN.replace('The Product Owner approved this direction', 'Not approved'),
  ])('rejects ineligible committed plan', (plan) => {
    expect(() => launchContract('/repo', 'develop-aw3', plan)).toThrow()
  })
  it('preserves configured role instructions/model and rejects unknown security fields', () => {
    expect(roleSettings(reviewer, 'reviewer').developer_instructions).toContain('No web access or test/build execution')
    expect(roleSettings(verifier, 'product_verifier').model).toBe('gpt-6.1-sol')
    expect(() => roleSettings(reviewer + '\nnew_capability = true\n', 'reviewer')).toThrow()
    expect(() =>
      roleSettings(verifier.replace('network_access = false', 'network_access = true'), 'product_verifier'),
    ).toThrow()
    expect(() => roleSettings(reviewer.replace('"read-only"', '"workspace-write"'), 'reviewer')).toThrow()
  })
})

describe('real process boundary and recovery handoff', () => {
  it('never follows a child-replaced result path when writing the handoff', async () => {
    const root = fixture()
    writeFileSync(join(root, 'preserve.txt'), 'preserve user work')
    const script = `const fs = require('node:fs'); const base = '.scratch/autonomous-initiatives'; const name = fs.readdirSync(base).find(n => n.startsWith('launch-')); const result = base + '/' + name + '/result.json'; if (fs.existsSync(result)) fs.unlinkSync(result); fs.symlinkSync(process.cwd() + '/preserve.txt', result); ${success}`
    const result = await launch({
      root,
      selected: 'develop-aw3',
      onMessage: () => {},
      spawnProcess: nativeFixture(script),
    })
    expect(readFileSync(join(root, 'preserve.txt'), 'utf8')).toBe('preserve user work')
    expect(result.status).toBe('blocked')
  })

  it('preserves UTF-8 messages across native stream chunks', async () => {
    const root = fixture()
    const messages = []
    const output = validOutput.replace('Synthetic handoff only', 'Checked résumé')
    const script = `const b = Buffer.from(${JSON.stringify(output)}); const i = b.indexOf(0xc3) + 1; process.stdout.write(b.subarray(0, i)); setTimeout(() => process.stdout.write(b.subarray(i)), 30); process.stdin.resume()`
    await launch({
      root,
      selected: 'develop-aw3',
      onMessage: (message) => messages.push(message),
      spawnProcess: nativeFixture(script),
    })
    expect(messages).toContain('Checked résumé')
  })

  it('reports lost lock ownership instead of a successful handoff', async () => {
    const root = fixture()
    const script = `require('node:fs').writeFileSync('.scratch/autonomous-initiatives/launcher.lock', '{"token":"another-owner"}'); ${success}`
    const result = await launch({
      root,
      selected: 'develop-aw3',
      onMessage: () => {},
      spawnProcess: nativeFixture(script),
    })
    expect(result.status).toBe('blocked')
    expect(existsSync(join(root, '.scratch/autonomous-initiatives/launcher.lock'))).toBe(true)
  })

  it('pipes a fixed prompt, captures logs, releases ownership only after a native handoff', async () => {
    const root = fixture()
    const messages = []
    const result = await launch({
      root,
      selected: 'develop-aw3',
      onMessage: (message) => messages.push(message),
      spawnProcess: nativeFixture(success, (command, args, options) => {
        expect(command).toBe('codex')
        expect(args).toEqual(['exec', '--json', '--cd', root, '--sandbox', 'workspace-write', '-'])
        expect(options.shell).toBe(false)
      }),
    })
    expect(result.status).toBe('returned')
    expect(result.sessionId).toBe('synthetic-session')
    expect(readFileSync(join(result.evidence, 'stdout.jsonl'), 'utf8')).toBe(validOutput)
    expect(existsSync(join(root, '.scratch/autonomous-initiatives/launcher.lock'))).toBe(false)
    expect(messages).toContain('Synthetic handoff only')
    expect(readFileSync(join(root, 'plans/autonomous-initiatives.md'), 'utf8')).toBe(PLAN)
  })
  it.each([
    ['failed exit', "process.stderr.write('permission denied'); process.exit(1)"],
    ['malformed event', "process.stdout.write('not json\\n'); process.stdin.resume()"],
    ['zero exit without a turn', 'process.exit(0)'],
    [
      'native failure',
      `process.stdout.write(${JSON.stringify(validOutput.replace('turn.completed', 'turn.failed'))}); process.stdin.resume()`,
    ],
  ])('retains the ownership checkpoint after %s', async (_name, script) => {
    const root = fixture()
    const result = await launch({
      root,
      selected: 'develop-aw3',
      onMessage: () => {},
      spawnProcess: nativeFixture(script),
      graceMs: 50,
    })
    expect(result.status).toBe('blocked')
    expect(existsSync(join(root, '.scratch/autonomous-initiatives/launcher.lock'))).toBe(true)
    await expect(
      launch({
        root,
        selected: 'develop-aw3',
        spawnProcess: () => {
          throw new Error('must not launch')
        },
      }),
    ).rejects.toThrow('EEXIST')
  })
  it('stops its owned process at the bound and preserves the lock for cleanup reconciliation', async () => {
    const root = fixture()
    let child
    const result = await launch({
      root,
      selected: 'develop-aw3',
      timeoutMs: 100,
      graceMs: 50,
      onMessage: () => {},
      spawnProcess: (...args) => {
        child = nativeFixture('process.stdin.resume(); setInterval(() => {}, 1000)')(...args)
        return child
      },
    })
    expect(result.status).toBe('blocked')
    expect(result.reason).toContain('limit')
    expect(child.signalCode).toBe('SIGINT')
    expect(existsSync(join(root, '.scratch/autonomous-initiatives/launcher.lock'))).toBe(true)
  })
  it('rejects another launcher and a pre-aborted request without invoking a process', async () => {
    const root = fixture()
    const controller = new AbortController()
    controller.abort()
    await expect(launch({ root, selected: 'develop-aw3', signal: controller.signal })).rejects.toThrow(
      'before starting',
    )
    mkdirSync(join(root, '.scratch/autonomous-initiatives'), { recursive: true })
    writeFileSync(join(root, '.scratch/autonomous-initiatives/launcher.lock'), 'preserve owner')
    await expect(launch({ root, selected: 'develop-aw3' })).rejects.toThrow('EEXIST')
    expect(readFileSync(join(root, '.scratch/autonomous-initiatives/launcher.lock'), 'utf8')).toBe('preserve owner')
  })
  it('refuses uncommitted role policy changes', async () => {
    const root = fixture()
    writeFileSync(join(root, '.codex/agents/reviewer.toml'), reviewer + '\n# changed\n')
    await expect(launch({ root, selected: 'review-aw3' })).rejects.toThrow('Uncommitted role')
  })
})
