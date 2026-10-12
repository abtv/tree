import { execFileSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { digest } from './initiative-runner-git.mjs'
import { executePreflight, hostArguments } from './initiative-runner-host.mjs'
import { readPreflightManifest, validatePreflight } from './initiative-runner-preflight.mjs'
import { observeProcess } from './initiative-runner-process.mjs'
import { readRecord, RunRecords } from './initiative-runner-records.mjs'

const roots = []
function fixture() {
  const base = resolve('.scratch/runner-readiness/tests')
  mkdirSync(base, { recursive: true })
  const root = mkdtempSync(join(base, 'preflight-'))
  roots.push(root)
  const git = (args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()
  git(['init', '--quiet'])
  git(['config', 'user.name', 'Synthetic Preflight'])
  git(['config', 'user.email', 'preflight@example.invalid'])
  git(['config', 'commit.gpgsign', 'false'])
  git(['config', 'core.hooksPath', '/dev/null'])
  writeFileSync(join(root, '.gitignore'), '.scratch/\n')
  writeFileSync(join(root, 'value.txt'), 'preserved\n')
  mkdirSync(join(root, '.codex/agents'), { recursive: true })
  mkdirSync(join(root, 'docs'))
  writeFileSync(join(root, 'docs/AGENT_ROLES.md'), 'Synthetic role contract\n')
  for (const role of ['reviewer', 'product-verifier'])
    writeFileSync(join(root, `.codex/agents/${role}.toml`), 'sandbox_mode = "read-only"\n')
  git(['add', '.'])
  git(['commit', '--quiet', '-m', 'test(preflight): seed synthetic fixture'])
  return root
}
function manifest(probes = [{ id: 'inspect', kind: 'command', argv: ['ps', '-axo', 'pid=,ppid=,command='] }]) {
  return {
    version: 1,
    initiative: 'example',
    id: 'attempt-one',
    budgetMs: 5000,
    scope: 'Synthetic fixtures only',
    probes,
  }
}
function input(root, selected = manifest(), overrides = {}) {
  return {
    root,
    manifest: selected,
    manifestIdentity: digest(selected),
    preflightAuthorized: true,
    approvalReference: 'explicit synthetic test authorization',
    confirmQuiescence: async ({ records }) => !records.children.size,
    ...overrides,
  }
}
function reportPath(root) {
  return join(root, '.scratch/example/preflight/attempt-one/preflight.json')
}
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('bounded preflight host operation', () => {
  it('dispatches explicit preflight separately from authorized initiative execution', () => {
    expect(hostArguments(['--authorized-preflight', '/repo', '.scratch/scope.json', 'sha256:pinned', 'owner'])).toEqual(
      {
        root: '/repo',
        manifestPath: '.scratch/scope.json',
        manifestIdentity: 'sha256:pinned',
        approvalReference: 'owner',
        preflightAuthorized: true,
      },
    )
    expect(() => hostArguments(['--authorized-preflight', '/repo'])).toThrow('Expected')
  })
  it('rejects missing authorization and changed manifest before creating records', async () => {
    const root = fixture()
    await expect(executePreflight(input(root, manifest(), { preflightAuthorized: false }))).rejects.toThrow(
      'authorization',
    )
    await expect(executePreflight(input(root, manifest(), { manifestIdentity: 'changed' }))).rejects.toThrow('identity')
    await expect(executePreflight(input(root, manifest(), { confirmQuiescence: undefined }))).rejects.toThrow('cleanup')
    expect(existsSync(join(root, '.scratch'))).toBe(false)
  })
  it('runs a real bounded read-only process and creates no coordinator or execution ledger', async () => {
    const root = fixture()
    const result = await executePreflight(input(root))
    expect(result).toMatchObject({
      operation: 'preflight',
      phase: 'completed',
      readiness: 'requires-evidence-review',
      cleanupConfirmed: true,
    })
    expect(result.probes[0].result).toMatchObject({ argv: ['ps', '-axo', 'pid=,ppid=,command='], exitCode: 0 })
    expect(result.probes[0].before).toEqual(result.probes[0].after)
    expect(readRecord(reportPath(root)).phase).toBe('completed')
    expect(readdirSync(join(root, '.scratch/example'))).toEqual(['preflight'])
    const retained = readdirSync(join(root, '.scratch/example/preflight/attempt-one'))
    for (const name of ['budget.json', 'run.json', 'authorization.json']) expect(retained).not.toContain(name)
    expect(existsSync(join(root, '.scratch/initiative-runner.lock'))).toBe(false)
    expect(readFileSync(join(root, 'value.txt'), 'utf8')).toBe('preserved\n')
    await expect(executePreflight(input(root))).rejects.toThrow('already used')
    expect(readRecord(reportPath(root)).phase).toBe('completed')
  })
  it('passes fresh, same-session resume and committed configured roles through native adapters', async () => {
    const root = fixture()
    const calls = []
    const selected = manifest([
      { id: 'fresh', kind: 'primary' },
      { id: 'resume', kind: 'resume' },
      { id: 'review', kind: 'role', role: 'reviewer' },
      { id: 'verify', kind: 'role', role: 'product_verifier' },
    ])
    const result = await executePreflight(
      input(root, selected, {
        launchPrimary: async (args) => {
          calls.push(args)
          expect(args.preflightPrompt).toContain('not initiative execution')
          expect(args).not.toHaveProperty('authorization')
          return {
            process: { id: 'synthetic-launch', exitCode: 0 },
            native: { sessionId: 'native-one', finalMessage: 'Observed synthetic fixture' },
          }
        },
        launchConfiguredRole: async (args) => {
          calls.push(args)
          expect(args.configurationIdentity).toMatch(/^sha256:/)
          expect(args.contractIdentity).toMatch(/^sha256:/)
          return { id: 'synthetic-role', sessionId: `native-${args.role}`, exitCode: 0 }
        },
      }),
    )
    expect(calls[0].resumeSession).toBeUndefined()
    expect(calls[1].resumeSession).toBe('native-one')
    expect(calls.slice(2).map((call) => call.role)).toEqual(['reviewer', 'product_verifier'])
    expect(new Set(calls.map((call) => call.deadlineAt)).size).toBe(1)
    expect(result.probes).toHaveLength(4)
  })
  it('blocks changed resume identity and retains evidence', async () => {
    const root = fixture()
    await expect(
      executePreflight(
        input(
          root,
          manifest([
            { id: 'fresh', kind: 'primary' },
            { id: 'again', kind: 'resume' },
          ]),
          {
            launchPrimary: async ({ resumeSession }) => ({
              native: { sessionId: resumeSession ? 'different' : 'native-one' },
              process: { exitCode: 0 },
            }),
          },
        ),
      ),
    ).rejects.toThrow('identity')
    expect(readRecord(reportPath(root)).phase).toBe('blocked')
  })
  it('does not start a second process after a permission denial', async () => {
    const root = fixture()
    let count = 0
    await expect(
      executePreflight(
        input(
          root,
          manifest([
            { id: 'first', kind: 'command', argv: ['npm', 'run', 'build'] },
            { id: 'second', kind: 'command', argv: ['npm', 'run', 'check'] },
          ]),
          {
            observeProcess: async () => {
              count++
              return { blocker: { kind: 'permission', reason: 'approval required' } }
            },
          },
        ),
      ),
    ).rejects.toThrow('approval required')
    expect(count).toBe(1)
    expect(readRecord(reportPath(root)).blocker.kind).toBe('permission')
  })
  it('retains the approved scope when the outer caller mutates its manifest during a probe', async () => {
    const root = fixture()
    const selected = manifest([
      { id: 'first', kind: 'command', argv: ['npm', 'run', 'build'] },
      { id: 'second', kind: 'command', argv: ['npm', 'run', 'check'] },
    ])
    const approvedIdentity = digest(selected)
    const calls = []
    const report = await executePreflight(
      input(root, selected, {
        observeProcess: async ({ argv }) => {
          calls.push(argv)
          selected.probes[1].argv = ['sh', '-c', 'unapproved']
          return { exitCode: 0 }
        },
      }),
    )
    expect(calls).toEqual([
      ['npm', 'run', 'build'],
      ['npm', 'run', 'check'],
    ])
    expect(digest(report.manifest)).toBe(approvedIdentity)
  })
  it('detects application edits instead of reporting readiness', async () => {
    const root = fixture()
    await expect(
      executePreflight(
        input(root, manifest([{ id: 'fresh', kind: 'primary' }]), {
          launchPrimary: async () => {
            writeFileSync(join(root, 'value.txt'), 'unauthorized\n')
            return { native: { sessionId: 'one' }, process: { exitCode: 0 } }
          },
        }),
      ),
    ).rejects.toThrow('repository inputs')
    expect(readRecord(reportPath(root)).phase).toBe('blocked')
    expect(readFileSync(join(root, 'value.txt'), 'utf8')).toBe('unauthorized\n')
  })
  it('detects application staging even when file contents do not change', async () => {
    const root = fixture()
    writeFileSync(join(root, 'value.txt'), 'existing owner edit\n')
    await expect(
      executePreflight(
        input(root, manifest([{ id: 'fresh', kind: 'primary' }]), {
          launchPrimary: async () => {
            execFileSync('git', ['add', 'value.txt'], { cwd: root })
            return { native: { sessionId: 'one' }, process: { exitCode: 0 } }
          },
        }),
      ),
    ).rejects.toThrow('repository inputs')
  })
  it('observes staging, real hooks and append-only commits in an isolated repository', async () => {
    const root = fixture()
    const cwd = '.scratch/example/preflight/attempt-one/fixtures/repository'
    const absolute = join(root, cwd)
    mkdirSync(absolute, { recursive: true })
    const git = (args) => execFileSync('git', args, { cwd: absolute, encoding: 'utf8' }).trim()
    git(['init', '--quiet'])
    git(['config', 'user.name', 'Synthetic Preflight'])
    git(['config', 'user.email', 'preflight@example.invalid'])
    git(['config', 'commit.gpgsign', 'false'])
    git(['config', 'core.hooksPath', '.git/hooks'])
    writeFileSync(join(absolute, '.git/hooks/pre-commit'), '#!/bin/sh\necho preflight-hook-observed\nexit 0\n', {
      mode: 0o755,
    })
    writeFileSync(join(absolute, 'value.txt'), 'seed\n')
    git(['add', '--all'])
    git(['commit', '-m', 'test(preflight): seed isolated history'])
    const parent = git(['rev-parse', 'HEAD'])
    writeFileSync(join(absolute, 'value.txt'), 'candidate\n')
    const selected = manifest([
      { id: 'stage', kind: 'command', cwd, argv: ['git', 'add', '--all'] },
      {
        id: 'commit',
        kind: 'command',
        cwd,
        argv: ['git', 'commit', '-m', 'test(preflight): verify append-only commit'],
      },
      { id: 'reconcile', kind: 'command', cwd, argv: ['git', 'rev-parse', 'HEAD'] },
    ])
    const report = await executePreflight(input(root, selected))
    expect(report.probes.every((probe) => probe.result.exitCode === 0)).toBe(true)
    expect(readFileSync(join(root, report.probes[1].result.artifacts[1].path), 'utf8')).toContain(
      'preflight-hook-observed',
    )
    expect(git(['rev-parse', 'HEAD^'])).toBe(parent)
    expect(git(['status', '--short'])).toBe('')
    expect(report.probes[2].result.artifacts).toHaveLength(3)
  })
  it('rejects synthetic Git metadata that points to the application repository', async () => {
    const root = fixture()
    const cwd = '.scratch/example/preflight/attempt-one/fixtures/repository'
    mkdirSync(join(root, cwd), { recursive: true })
    symlinkSync(join(root, '.git'), join(root, cwd, '.git'))
    await expect(
      executePreflight(input(root, manifest([{ id: 'stage', kind: 'command', cwd, argv: ['git', 'add', '--all'] }]))),
    ).rejects.toThrow('owned local directory')
  })
  it('hashes requested native scratch artifacts and rejects a symlink escape', async () => {
    const root = fixture()
    const path = '.scratch/example/preflight/attempt-one/artifact.log'
    const selected = manifest([{ id: 'fresh', kind: 'primary', artifacts: [path] }])
    const launchPrimary = async () => {
      writeFileSync(join(root, path), 'synthetic retained evidence\n')
      return { native: { sessionId: 'native-one' }, process: { exitCode: 0 } }
    }
    const report = await executePreflight(input(root, selected, { launchPrimary }))
    expect(report.probes[0].artifacts[0]).toMatchObject({ path, identity: expect.stringMatching(/^sha256:/) })
    const second = {
      ...selected,
      id: 'attempt-two',
      probes: [{ id: 'fresh', kind: 'primary', artifacts: [path.replace('attempt-one', 'attempt-two')] }],
    }
    await expect(
      executePreflight(
        input(root, second, {
          launchPrimary: async () => {
            symlinkSync(join(root, 'value.txt'), join(root, path.replace('attempt-one', 'attempt-two')))
            return { native: { sessionId: 'native-two' }, process: { exitCode: 0 } }
          },
        }),
      ),
    ).rejects.toThrow('regular evidence file')
  })
  it('retains exclusive ownership when independent cleanup is unconfirmed', async () => {
    const root = fixture()
    let inspections = 0
    await expect(
      executePreflight(
        input(root, manifest(), {
          confirmQuiescence: async () => ++inspections === 1,
          observeProcess: async () => ({ exitCode: 0 }),
        }),
      ),
    ).rejects.toThrow('ownership retained')
    expect(existsSync(join(root, '.scratch/initiative-runner.lock'))).toBe(true)
    expect(readRecord(reportPath(root)).cleanupConfirmed).toBe(false)
    expect(() => new RunRecords({ root, initiative: 'other', hostAuthorized: true })).toThrow()
  })
  it('persists a blocked cleanup report when independent process inspection is denied', async () => {
    const root = fixture()
    await expect(
      executePreflight(
        input(root, manifest(), {
          confirmQuiescence: async () => {
            throw new Error('Process inspection permission denied')
          },
        }),
      ),
    ).rejects.toThrow('ownership retained')
    expect(readRecord(reportPath(root))).toMatchObject({
      phase: 'blocked',
      cleanupConfirmed: false,
      cleanupFailure: 'Process inspection permission denied',
      blocker: { reason: 'Process inspection permission denied' },
    })
    expect(existsSync(join(root, '.scratch/initiative-runner.lock'))).toBe(true)
  })
  it('shares exclusive ownership with execution records and forbids execution budgets', () => {
    const root = fixture()
    const records = new RunRecords({ root, initiative: 'example', preflightId: 'attempt-one', hostAuthorized: true })
    expect(() => records.budget({ now: 100, budgetMs: 1000, approvalReference: 'owner' })).toThrow('execution budget')
    expect(() => new RunRecords({ root, initiative: 'other', hostAuthorized: true })).toThrow()
    records.release()
  })
  it('does not mistake isolated preflight evidence for an execution ledger', async () => {
    const root = fixture()
    await executePreflight(input(root))
    const records = new RunRecords({ root, initiative: 'example', hostAuthorized: true })
    expect(
      records.budget({ now: 100, budgetMs: 1000, approvalReference: 'separate execution approval' }),
    ).toMatchObject({
      startedAt: 100,
      deadlineAt: 1100,
      approvalReference: 'separate execution approval',
    })
    expect(readRecord(reportPath(root)).operation).toBe('preflight')
    records.release()
  })
  it('bounds real interruption and confirms the directly owned child exit', async () => {
    const root = fixture()
    const controller = new AbortController()
    await expect(
      executePreflight(
        input(root, manifest(), {
          signal: controller.signal,
          observeProcess: async (args) => {
            const timer = setTimeout(() => controller.abort(), 100)
            try {
              return await observeProcess({
                ...args,
                argv: [process.execPath, '-e', 'setInterval(() => {}, 1000)'],
                graceMs: 20,
              })
            } finally {
              clearTimeout(timer)
            }
          },
        }),
      ),
    ).rejects.toThrow('interrupted')
    expect(readRecord(reportPath(root))).toMatchObject({ phase: 'blocked', cleanupConfirmed: true })
    expect(existsSync(join(root, '.scratch/initiative-runner.lock'))).toBe(false)
  })
  it('does not renew an expired allowance or launch when already interrupted', async () => {
    const root = fixture()
    let time = 100
    let launches = 0
    await expect(
      executePreflight(
        input(root, manifest(), {
          now: () => {
            const value = time
            time += 6000
            return value
          },
          observeProcess: async () => {
            launches++
            return { exitCode: 0 }
          },
        }),
      ),
    ).rejects.toThrow('allowance')
    expect(launches).toBe(0)
    expect(readRecord(reportPath(root)).deadlineAt).toBe(5100)
  })
  it('blocks an already aborted invocation before launching any probe', async () => {
    const root = fixture()
    const controller = new AbortController()
    controller.abort()
    let launched = false
    await expect(
      executePreflight(
        input(root, manifest(), {
          signal: controller.signal,
          observeProcess: async () => {
            launched = true
            return { exitCode: 0 }
          },
        }),
      ),
    ).rejects.toThrow('interrupted')
    expect(launched).toBe(false)
  })
})

describe('reviewable manifest and bounded retention', () => {
  const prefix = '.scratch/example/preflight/attempt-one'
  it('rejects a dangling report symlink instead of following it to a new external file', async () => {
    const root = fixture()
    mkdirSync(join(root, prefix), { recursive: true })
    symlinkSync(join(root, 'new-external-report.json'), join(root, prefix, 'report.json'))
    const selected = manifest([
      {
        id: 'diagnostic',
        kind: 'command',
        argv: ['npm', 'run', 'test:e2e:diagnose', '--', `--json-output=${prefix}/report.json`],
      },
    ])
    let launched = false
    await expect(
      executePreflight(
        input(root, selected, {
          observeProcess: async () => {
            launched = true
            return { exitCode: 0 }
          },
        }),
      ),
    ).rejects.toThrow('escapes')
    expect(launched).toBe(false)
    expect(existsSync(join(root, 'new-external-report.json'))).toBe(false)
  })
  it('blocks a scratch output symlink before launching any command', async () => {
    const root = fixture()
    mkdirSync(join(root, prefix, 'fixtures'), { recursive: true })
    symlinkSync(root, join(root, prefix, 'fixtures/escape'))
    let launched = false
    const selected = manifest([
      {
        id: 'diagnostic',
        kind: 'command',
        argv: ['npm', 'run', 'test:e2e:diagnose', '--', `--json-output=${prefix}/fixtures/escape/report.json`],
      },
    ])
    await expect(
      executePreflight(
        input(root, selected, {
          observeProcess: async () => {
            launched = true
            return { exitCode: 0 }
          },
        }),
      ),
    ).rejects.toThrow('escapes')
    expect(launched).toBe(false)
    expect(readRecord(reportPath(root)).cleanupConfirmed).toBe(true)
  })
  it('retains and verifies the actual timing fixture identity', async () => {
    const root = fixture()
    mkdirSync(join(root, prefix), { recursive: true })
    const path = `${prefix}/timing.json`
    writeFileSync(join(root, path), '{}\n')
    const selected = manifest([{ id: 'summary', kind: 'command', argv: ['node', 'scripts/e2e-timing.mjs', path] }])
    await expect(
      executePreflight(
        input(root, selected, {
          observeProcess: async () => {
            writeFileSync(join(root, path), '{"changed":true}\n')
            return { exitCode: 0 }
          },
        }),
      ),
    ).rejects.toThrow()
    const report = readRecord(reportPath(root))
    expect(report.phase).toBe('blocked')
    expect(report.probes[0].inputArtifacts[0].path).toBe(path)
    expect(report.cleanupConfirmed).toBe(true)
  })
  it.each([
    ['npm', 'run', 'format:check:changed'],
    ['npm', 'run', 'check:docs'],
    ['npm', 'run', 'check:opencode'],
    ['npm', 'run', 'check:requirements'],
    ['npm', 'run', 'check:e2e-modes'],
    ['npm', 'run', 'typecheck'],
    ['npm', 'run', 'lint'],
    ['npm', 'test', '--', 'src/renderer/vim-text-commands.test.ts'],
    ['npm', 'run', 'test:e2e', '--', '--list', '--workers=6'],
    [
      'npm',
      'run',
      'test:e2e:diagnose',
      '--',
      '--shared-reset=reload',
      `--json-output=${prefix}/timing.json`,
      '--reporter=list,json',
      '--workers=6',
      'e2e/vim-text-editing.spec.ts',
    ],
    [
      'npm',
      'run',
      'test:e2e:diagnose',
      '--',
      '--shared-reset=reload',
      `--json-output=${prefix}/future.json`,
      '--reporter=list,json',
      '--workers=6',
      `--config=${prefix}/fixtures/memory.config.ts`,
      '--list',
    ],
    ['node', 'scripts/e2e-timing.mjs', `${prefix}/timing.json`],
  ])('supports bounded projected command %j', (...argv) => {
    expect(validatePreflight(manifest([{ id: 'command', kind: 'command', argv }])).probes[0].argv).toEqual(argv)
  })
  it.each([
    ['npm', 'run', 'postinstall'],
    ['npm', 'run', 'check:docs', '--', '--prefix=/elsewhere'],
    ['npm', 'test', '--', '--config=malicious.ts'],
    ['npm', 'run', 'test:e2e', '--', '--workers=100'],
    ['npm', 'run', 'test:e2e', '--', '--global-setup=elsewhere.ts'],
    ['npm', 'run', 'test:e2e:diagnose', '--', '--json-output=/tmp/report.json'],
    ['npm', 'run', 'test:e2e:diagnose', '--', `--json-output=${prefix}/../escape.json`],
    ['npm', 'run', 'test:e2e:diagnose', '--', '--config=elsewhere.ts'],
    ['npm', 'run', 'test:e2e', '--', 'e2e/../outside.spec.ts'],
    ['node', '-e', 'process.exit(0)'],
    ['node', 'scripts/e2e-timing.mjs', 'test-results/report.json'],
  ])('rejects widened command %j', (...argv) => {
    expect(() => validatePreflight(manifest([{ id: 'command', kind: 'command', argv }]))).toThrow()
  })
  it.each([
    { budgetMs: 0 },
    { budgetMs: 3600001 },
    { id: '../escape' },
    { probes: [] },
    { probes: Array.from({ length: 33 }, (_, i) => ({ id: `probe-${i}`, kind: 'primary' })) },
    { probes: [{ id: 'resume', kind: 'resume' }] },
    { probes: [{ id: 'bad', kind: 'role', role: 'planner' }] },
    { probes: [{ id: 'bad', kind: 'command', argv: ['codex', 'exec'] }] },
    { probes: [{ id: 'bad', kind: 'command', argv: ['git', 'commit', '-m', 'feat(test): unauthorized main commit'] }] },
    { probes: [{ id: 'bad', kind: 'command', argv: ['npm', 'run', 'build', '--prefix', '/elsewhere'] }] },
    { probes: [{ id: 'bad', kind: 'command', argv: ['sh', '-c', 'true'] }] },
    { probes: [{ id: 'bad', kind: 'primary', artifacts: ['value.txt'] }] },
  ])('rejects unsafe or unbounded manifest %j', (changes) => {
    expect(() => validatePreflight({ ...manifest(), ...changes })).toThrow()
  })
  it('reads only bounded non-symlink scratch manifests', () => {
    const root = fixture()
    mkdirSync(join(root, '.scratch'))
    writeFileSync(join(root, '.scratch/manifest.json'), JSON.stringify(manifest()))
    expect(readPreflightManifest(root, '.scratch/manifest.json')).toEqual(manifest())
    symlinkSync(join(root, '.scratch/manifest.json'), join(root, '.scratch/link.json'))
    expect(() => readPreflightManifest(root, '.scratch/link.json')).toThrow()
    expect(() => readPreflightManifest(root, 'value.txt')).toThrow()
  })
})
