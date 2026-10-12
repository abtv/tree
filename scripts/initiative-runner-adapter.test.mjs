import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { CodexEvents, codexPrimaryArgv, configuredRoleArgv, primaryPrompt } from './initiative-runner-codex.mjs'
import { roleSettings } from './initiative-launch.mjs'
import { observeRepository, planTransitionsValid } from './initiative-runner-git.mjs'
import { projectApprovedPlan } from './initiative-runner-plan.mjs'
import { classifyFailure, observeProcess, StageBlocker } from './initiative-runner-process.mjs'
import { atomicRecord, readRecord, RunRecords } from './initiative-runner-records.mjs'
import { authorizeTask, prepareCommit, reconcileCommit, startTask } from './initiative-runner-state.mjs'
import { InitiativeCoordinator } from './initiative-runner.mjs'
import {
  confirmQuiescence,
  executeInitiative,
  hostArguments,
  processTableQuiescent,
  resolveOwnerCheck,
} from './initiative-runner-host.mjs'

const roots = []
function root() {
  const scratch = resolve('.scratch/autonomous-initiatives/tests')
  mkdirSync(scratch, { recursive: true })
  const path = mkdtempSync(join(scratch, 'adapter-'))
  roots.push(path)
  return path
}
function records(path = root()) {
  return new RunRecords({ root: path, initiative: 'example', hostAuthorized: true })
}
function git(path, argv) {
  return execFileSync('git', argv, { cwd: path, encoding: 'utf8' }).trim()
}
function repository({ done = false, roles = [], argv = ['npm', 'test'] } = {}) {
  const path = root()
  git(path, ['init', '--quiet'])
  git(path, ['config', 'user.name', 'Synthetic Adapter Test'])
  git(path, ['config', 'user.email', 'adapter@example.invalid'])
  git(path, ['config', 'commit.gpgsign', 'false'])
  git(path, ['config', 'core.hooksPath', '/dev/null'])
  mkdirSync(join(path, 'plans'))
  const execution = {
    version: 1,
    tool: 'codex',
    initiative: 'example',
    budgetMs: 60000,
    tasks: {
      'EX-1': {
        files: ['plans/example.md', 'plans/README.md', 'value.txt'],
        commands: [{ id: 'unit', argv }],
        roles,
        ownerChecks: [],
      },
    },
    closure: {
      indexPath: 'plans/README.md',
      requiredTasks: ['EX-1'],
      budgetMs: 60000,
      approvalReference: 'separate synthetic closure allowance',
    },
  }
  const plan = `# Example\n\n## Objective and Authorization\n\nApproved synthetic test scope only.\n\n## Sources and Constraints\n\nPreserve test data.\n\n## Tasks\n\n| ID | Outcome | Status |\n| --- | --- | --- |\n| EX-1 | Synthetic change | ${done ? 'Done' : 'Ready'} |\n\n### EX-1 — Synthetic change\n\nChange value.txt.\n\n### EX-2 — Excluded task\n\nNever select this task.\n\n## Execution Projection\n\n\`\`\`initiative-runner\n${JSON.stringify(execution)}\n\`\`\`\n`
  writeFileSync(join(path, 'plans/example.md'), plan)
  writeFileSync(
    join(path, 'plans/README.md'),
    '# Active Plans\n\n| Initiative | Status |\n| --- | --- |\n| [Example](example.md) | Approved |\n| [Other](other.md) | Proposed |\n',
  )
  writeFileSync(join(path, 'value.txt'), 'before\n')
  writeFileSync(join(path, '.gitignore'), '.scratch/\n')
  if (roles.length) {
    mkdirSync(join(path, '.codex/agents'), { recursive: true })
    mkdirSync(join(path, 'docs'))
    writeFileSync(join(path, 'docs/AGENT_ROLES.md'), 'Synthetic role contract only.\n')
    for (const role of roles)
      writeFileSync(join(path, '.codex/agents', `${role.replaceAll('_', '-')}.toml`), 'sandbox_mode = "read-only"\n')
  }
  git(path, ['add', '.'])
  git(path, ['commit', '--quiet', '-m', 'test(runner): seed adapter repository'])
  return { root: path, plan, startingCommit: git(path, ['rev-parse', 'HEAD']), execution }
}
function events(changes = []) {
  const values = [
    { type: 'thread.started', thread_id: 'native-primary' },
    { type: 'turn.started' },
    {
      type: 'item.completed',
      item: { type: 'agent_message', text: '{"allRequirementsCovered":true,"unresolvedFindings":[]}' },
    },
    ...changes,
    { type: 'turn.completed', usage: { input_tokens: 2, cached_input_tokens: 1, output_tokens: 3 } },
  ]
  return `${values.map((value) => JSON.stringify(value)).join('\n')}\n`
}

afterEach(() => {
  for (const path of roots.splice(0)) rmSync(path, { recursive: true, force: true })
})

describe('supported native adapter contract', () => {
  it.each(['reviewer', 'product_verifier'])(
    'projects committed %s settings without launching native processes',
    (role) => {
      const text = execFileSync('git', ['show', `HEAD:.codex/agents/${role.replaceAll('_', '-')}.toml`], {
        encoding: 'utf8',
      })
      const settings = roleSettings(text, role)
      const argv = configuredRoleArgv('/repo', settings)
      expect(argv.slice(0, 8)).toEqual([
        'codex',
        'exec',
        '--json',
        '--cd',
        '/repo',
        '--sandbox',
        settings.sandbox_mode,
        '-c',
      ])
      expect(argv).toContain(`model=${JSON.stringify(settings.model)}`)
      expect(argv).toContain('sandbox_workspace_write.network_access=false')
      expect(argv).toContain('agents.enabled=false')
      expect(argv).toContain('web_search="disabled"')
      expect(argv.join(' ')).not.toMatch(/dangerously|bypass|full-access/)
    },
  )
  it('uses explicit cwd and workspace-write without broadening config, rules or approvals', () => {
    expect(codexPrimaryArgv('/repo')).toEqual([
      'codex',
      'exec',
      '--json',
      '--cd',
      '/repo',
      '--sandbox',
      'workspace-write',
      '-',
    ])
    expect(codexPrimaryArgv('/repo').join(' ')).not.toMatch(/bypass|ignore|profile|approve|full-access|config/)
  })
  it('captures actual session and usage across chunk boundaries', () => {
    const parser = new CodexEvents()
    const bytes = Buffer.from(events())
    for (const byte of bytes) parser.push(Buffer.from([byte]))
    expect(parser.finish()).toMatchObject({
      sessionId: 'native-primary',
      usage: { input_tokens: 2, cached_input_tokens: 1, output_tokens: 3 },
    })
  })
  it('does not infer nested role provenance from progress items', () => {
    const parser = new CodexEvents()
    parser.push(
      Buffer.from(
        events([
          { type: 'item.completed', item: { type: 'collab_tool_call', role: 'reviewer', sessionId: 'claimed' } },
        ]),
      ),
    )
    expect(parser.finish().sessionId).toBe('native-primary')
    expect(parser.finish()).not.toHaveProperty('roles')
  })
  it.each([
    ['malformed JSON', '{invalid}\n'],
    ['events before identity', '{"type":"turn.started"}\n'],
    [
      'duplicate identity',
      '{"type":"thread.started","thread_id":"one"}\n{"type":"thread.started","thread_id":"two"}\n',
    ],
    ['truncated stream', events().trimEnd()],
    ['missing turn', '{"type":"thread.started","thread_id":"one"}\n'],
    [
      'missing final message',
      '{"type":"thread.started","thread_id":"one"}\n{"type":"turn.completed","usage":{"input_tokens":0,"cached_input_tokens":0,"output_tokens":0}}\n',
    ],
    ['negative usage', events().replace('"input_tokens":2', '"input_tokens":-1')],
    ['event after completion', `${events()}{"type":"turn.started"}\n`],
    ['native failure', events([{ type: 'turn.failed', error: { message: 'permission denied' } }])],
  ])('rejects %s', (_name, stream) => {
    const parser = new CodexEvents()
    expect(() => {
      parser.push(Buffer.from(stream))
      parser.finish()
    }).toThrow()
  })
  it('bounds event lines and retained event count', () => {
    expect(() => new CodexEvents().push(Buffer.alloc(1024 * 1024 + 1, 'x'))).toThrow('retention')
    const parser = new CodexEvents()
    parser.event({ type: 'thread.started', thread_id: 'one' })
    expect(() => {
      for (let i = 0; i < 10001; i++) parser.event({ type: 'turn.started' })
    }).toThrow('retention')
  })
  it.each([
    ['Operation not permitted', 'permission'],
    ['approval required', 'permission'],
    ['authentication failed', 'authentication'],
    ['401 Unauthorized', 'authentication'],
    ['assertion failed', 'failure'],
  ])('classifies %s without alternate retry paths', (message, kind) => {
    expect(classifyFailure(message)).toBe(kind)
  })
})

describe('host-owned records and elapsed allowance', () => {
  it('requires host authorization without provisioning credentials', () => {
    const path = root()
    expect(() => new RunRecords({ root: path, initiative: 'example' })).toThrow('host')
    const owned = new RunRecords({ root: path, initiative: 'example', hostAuthorized: true })
    owned.release()
  })
  it('rejects duplicate writers across initiatives and never steals a stale lock', () => {
    const owned = records()
    expect(() => new RunRecords({ root: owned.root, initiative: 'other', hostAuthorized: true })).toThrow()
    writeFileSync(
      owned.lockPath,
      JSON.stringify({ version: 1, token: owned.token, initiative: 'example', pid: 999999 }),
    )
    expect(() => records(owned.root)).toThrow()
    expect(() => owned.release()).toThrow('lost')
  })
  it('persists an original deadline across task records and restarts', () => {
    const first = records()
    expect(first.budget({ now: 100, budgetMs: 1000, approvalReference: 'approved' }).deadlineAt).toBe(1100)
    first.save('run.json', { taskId: 'EX-1', phase: 'completed' })
    first.release()
    const second = records(first.root)
    expect(second.budget({ now: 700, budgetMs: 1000, approvalReference: 'approved' }).deadlineAt).toBe(1100)
    expect(() => second.budget({ now: 1100, budgetMs: 1000, approvalReference: 'approved' })).toThrow('exhausted')
    expect(second.load('budget.json').deadlineAt).toBe(1100)
    second.release()
  })
  it('rejects backwards clocks, changed allowance and missing original ledger', () => {
    const owned = records()
    owned.budget({ now: 100, budgetMs: 1000, approvalReference: 'approved' })
    expect(() => owned.budget({ now: 90, budgetMs: 1000, approvalReference: 'approved' })).toThrow('backwards')
    expect(() => owned.budget({ now: 200, budgetMs: 2000, approvalReference: 'approved' })).toThrow('identity')
    owned.save('run.json', { taskId: 'EX-1' })
    rmSync(owned.file('budget.json'))
    expect(() => owned.save('run.json', { taskId: 'EX-1' })).toThrow()
    owned.release()
    const resumed = records(owned.root)
    expect(() => resumed.budget({ now: 300, budgetMs: 1000, approvalReference: 'approved' })).toThrow(
      'Missing original',
    )
    resumed.release()
  })
  it('rejects corruption and replacement of records observed by this host', () => {
    const owned = records()
    owned.save('run.json', { observed: true })
    const original = readFileSync(owned.file('run.json'), 'utf8')
    writeFileSync(owned.file('run.json'), original.slice(0, -1))
    expect(() => owned.load('run.json')).toThrow()
    atomicRecord(owned.file('run.json'), { observed: false })
    expect(() => owned.load('run.json')).toThrow('changed')
    expect(() => owned.assertIntegrity()).toThrow('changed')
    owned.release()
  })
  it('does not renew a missing budget after an interrupted pre-session launch', () => {
    const owned = records()
    owned.save('intent.json', { phase: 'launching' })
    expect(() => owned.budget({ now: 100, budgetMs: 1000, approvalReference: 'approved' })).toThrow('Missing original')
    owned.release()
  })
  it('preserves the previous atomic record when an incomplete pending file is left', () => {
    const owned = records()
    owned.save('run.json', { value: 1 })
    writeFileSync(`${owned.file('run.json')}.crashed.pending`, '{')
    expect(owned.load('run.json')).toEqual({ value: 1 })
    expect(readRecord(owned.file('run.json'))).toEqual({ value: 1 })
    owned.release()
  })
  it('checks retained artifact content and rejects paths outside ownership', () => {
    const owned = records()
    writeFileSync(owned.file('observed.log'), 'observed')
    const artifact = owned.artifact(owned.file('observed.log'))
    owned.verifyArtifacts([artifact])
    writeFileSync(owned.file('observed.log'), 'altered')
    expect(() => owned.verifyArtifacts([artifact])).toThrow('changed')
    expect(() => owned.artifact(join(owned.root, 'outside.log'))).toThrow('owned')
    owned.release()
  })
})

describe('synthetic owned processes', () => {
  it('cleans its child when persisting the running launch fails', async () => {
    const owned = records()
    const save = owned.save.bind(owned)
    owned.save = (name, value) => {
      if (value.phase === 'running') throw new Error('synthetic ownership loss')
      save(name, value)
    }
    await expect(
      observeProcess({
        records: owned,
        argv: [process.execPath, '-e', 'setInterval(()=>{},100)'],
        deadlineAt: Date.now() + 2000,
        graceMs: 20,
      }),
    ).rejects.toThrow('synthetic ownership loss')
    expect(owned.children.size).toBe(0)
    owned.release()
  })
  it('records actual argv, cwd, output, exit and artifacts', async () => {
    const owned = records()
    const argv = [process.execPath, '-e', 'console.log(process.cwd())']
    const result = await observeProcess({ records: owned, argv, deadlineAt: Date.now() + 2000 })
    expect(result).toMatchObject({ argv, cwd: owned.root, exitCode: 0, signal: null, blocker: null })
    expect(readFileSync(join(owned.root, result.artifacts[0].path), 'utf8').trim()).toBe(owned.root)
    owned.verifyArtifacts(result.artifacts)
    expect(owned.children.size).toBe(0)
    owned.release()
  })
  it.each([
    ['permission denied', 'permission'],
    ['authentication failed', 'authentication'],
    ['test failed', 'failure'],
  ])('records nonzero %s', async (message, kind) => {
    const owned = records()
    const result = await observeProcess({
      records: owned,
      argv: [process.execPath, '-e', `console.error(${JSON.stringify(message)});process.exit(1)`],
      deadlineAt: Date.now() + 2000,
    })
    expect(result.exitCode).toBe(1)
    expect(result.blocker.kind).toBe(kind)
    expect(owned.load(`${result.id}-launch.json`).blocker.kind).toBe(kind)
    owned.release()
  })
  it('gracefully interrupts only its live child on signal', async () => {
    const owned = records()
    const signal = new AbortController()
    const pending = observeProcess({
      records: owned,
      argv: [process.execPath, '-e', 'setInterval(()=>{},100)'],
      deadlineAt: Date.now() + 2000,
      signal: signal.signal,
      graceMs: 20,
    })
    setTimeout(() => signal.abort(), 50)
    const result = await pending
    expect(result.blocker.kind).toBe('interrupted')
    expect(result.signal).toMatch(/SIGINT|SIGTERM/)
    expect(owned.children.size).toBe(0)
    owned.release()
  })
  it('retains budget exhaustion without renewing deadline', async () => {
    const owned = records()
    const deadlineAt = Date.now() + 70
    const result = await observeProcess({
      records: owned,
      argv: [process.execPath, '-e', 'setInterval(()=>{},100)'],
      deadlineAt,
      graceMs: 20,
    })
    expect(result.blocker.kind).toBe('budget')
    expect(result.finishedAt).toBeGreaterThanOrEqual(deadlineAt)
    owned.release()
  })
  it('captures spawn failures and refuses launch after budget exhaustion', async () => {
    const owned = records()
    const result = await observeProcess({
      records: owned,
      argv: ['nonexistent-synthetic-runner-command'],
      deadlineAt: Date.now() + 1000,
    })
    expect(result.blocker).not.toBeNull()
    await expect(observeProcess({ records: owned, argv: ['anything'], deadlineAt: 0 })).rejects.toMatchObject({
      kind: 'budget',
    })
    owned.release()
  })
  it('bounds unsupported output and preserves its evidence', async () => {
    const owned = records()
    const result = await observeProcess({
      records: owned,
      argv: [process.execPath, '-e', 'console.log("bad json")'],
      deadlineAt: Date.now() + 1000,
      onStdout: () => {
        throw new Error('malformed event')
      },
      graceMs: 20,
    })
    expect(result.blocker.kind).toBe('capability')
    owned.verifyArtifacts(result.artifacts)
    owned.release()
  })
})

describe('host coordinator stages with synthetic integration only', () => {
  function candidate(options = {}) {
    const f = repository({ argv: [process.execPath, '-e', 'console.log("synthetic validation")'], ...options })
    const input = {
      ...f,
      planPath: 'plans/example.md',
      taskId: 'EX-1',
      approvalReference: 'synthetic',
      hostAuthorized: true,
      confirmQuiescence: async () => true,
      launchConfiguredRole: async () => {
        throw new Error('No native role launch in focused tests')
      },
    }
    const coordinator = new InitiativeCoordinator(input)
    coordinator.run = startTask({
      authorization: coordinator.authorization,
      observation: coordinator.observation(),
      runId: 'synthetic-run',
      sessionId: 'synthetic-primary',
      now: Date.now(),
      deadlineAt: coordinator.budget.deadlineAt,
    })
    coordinator.records.save('run.json', coordinator.run)
    writeFileSync(join(f.root, 'value.txt'), 'after\n')
    writeFileSync(join(f.root, input.planPath), f.plan.replace('| Ready |', '| Done |'))
    git(f.root, ['add', 'value.txt', input.planPath])
    return { ...f, input, coordinator }
  }
  function acceptance(coordinator, process) {
    coordinator.records.save('primary.json', {
      runId: coordinator.run.runId,
      taskId: 'EX-1',
      snapshot: coordinator.observation().snapshot,
      process,
      native: {
        sessionId: coordinator.run.sessionId,
        finalMessage: '{"allRequirementsCovered":true,"unresolvedFindings":[]}',
      },
    })
  }
  it('persists observed receipts, prepares, and reconciles an exact synthetic commit', async () => {
    const { root: path, coordinator } = candidate()
    const receipt = await coordinator.validation('unit')
    expect(receipt).toMatchObject({ kind: 'command', exitCode: 0, status: 'passed' })
    expect(coordinator.records.load(`${receipt.id}-receipt.json`)).toEqual(receipt)
    acceptance(coordinator, { artifacts: receipt.artifacts })
    expect(coordinator.prepare().ready).toBe(true)
    git(path, ['commit', '--quiet', '-m', 'test(runner): finish synthetic task'])
    expect(coordinator.reconcile().advance).toBe(true)
    await coordinator.close()
  })
  it('refuses unknown commands and records an explicit blocker', async () => {
    const { coordinator } = candidate()
    await expect(coordinator.validation('unapproved')).rejects.toThrow('absent')
    expect(coordinator.records.load('blocker.json').reason).toContain('absent')
    expect(coordinator.run.phase).toBe('blocked')
    await coordinator.close()
  })
  it('reloads the same unfinished candidate, receipts and original deadline', async () => {
    const { input, coordinator } = candidate()
    const receipt = await coordinator.validation('unit')
    const deadline = coordinator.budget.deadlineAt
    acceptance(coordinator, { artifacts: receipt.artifacts })
    await coordinator.close()
    const resumed = new InitiativeCoordinator(input)
    expect(resumed.run.runId).toBe('synthetic-run')
    expect(resumed.receipts).toEqual([receipt])
    expect(resumed.budget.deadlineAt).toBe(deadline)
    expect(resumed.prepare().ready).toBe(true)
    await resumed.close()
  })
  it('refuses modified retained evidence on restart', async () => {
    const { root: path, input, coordinator } = candidate()
    const receipt = await coordinator.validation('unit')
    await coordinator.close()
    writeFileSync(join(path, receipt.artifacts[0].path), 'altered validation output')
    expect(() => new InitiativeCoordinator(input)).toThrow('changed')
  })
  it('rejects validation which mutates the staged candidate inputs', async () => {
    const { coordinator } = candidate({
      argv: [process.execPath, '-e', 'require("node:fs").writeFileSync("value.txt", "unexpected")'],
    })
    await expect(coordinator.validation('unit')).rejects.toThrow('changed candidate')
    expect(coordinator.receipts).toEqual([])
    await coordinator.close()
  })
  it('serializes host stages and requires quiescence before launching', async () => {
    const { coordinator } = candidate()
    let release
    coordinator.input.confirmQuiescence = () =>
      new Promise((resolve) => {
        release = resolve
      })
    const pending = coordinator.validation('unit')
    await expect(coordinator.validation('unit')).rejects.toMatchObject({ kind: 'capability' })
    release(false)
    await expect(pending).rejects.toThrow('quiescence')
    expect(coordinator.records.children.size).toBe(0)
    coordinator.input.confirmQuiescence = async () => true
    await coordinator.close()
  })
  it('does not mint role receipts from primary identity or claimed role success', async () => {
    const { coordinator } = candidate({ roles: ['reviewer'] })
    await coordinator.validation('unit')
    coordinator.input.launchConfiguredRole = async (input) => ({
      configuredRole: input.role,
      configurationIdentity: input.configurationIdentity,
      contractIdentity: input.contractIdentity,
      sessionSource: 'native-role-launcher',
      sessionId: 'synthetic-primary',
      runtime: { sandbox: 'read-only' },
      exitCode: 0,
      signal: null,
      finalMessage: 'No meaningful issues found',
    })
    await expect(coordinator.role('reviewer')).rejects.toThrow('attribution')
    expect(coordinator.receipts.every((receipt) => receipt.kind === 'command')).toBe(true)
    await coordinator.close()
  })
  it('requires independent role output, runtime posture and retained artifacts', async () => {
    const { coordinator } = candidate({ roles: ['reviewer'] })
    const validation = await coordinator.validation('unit')
    coordinator.input.launchConfiguredRole = async (input) => ({
      configuredRole: input.role,
      configurationIdentity: input.configurationIdentity,
      contractIdentity: input.contractIdentity,
      sessionSource: 'native-role-launcher',
      sessionId: 'synthetic-independent-review',
      runtime: { sandbox: 'read-only' },
      exitCode: 0,
      signal: null,
      finalMessage: 'No meaningful issues found',
      artifacts: validation.artifacts,
    })
    expect(await coordinator.role('reviewer')).toMatchObject({ kind: 'role', role: 'reviewer' })
    acceptance(coordinator, { artifacts: validation.artifacts })
    expect(coordinator.prepare().ready).toBe(true)
    await coordinator.close()
  })
  it('retains new blockers discovered after a commit instead of allowing advancement', async () => {
    const { root: path, coordinator } = candidate()
    const receipt = await coordinator.validation('unit')
    acceptance(coordinator, { artifacts: receipt.artifacts })
    expect(coordinator.prepare().ready).toBe(true)
    git(path, ['commit', '--quiet', '-m', 'test(runner): finish synthetic task'])
    coordinator.records.save('blocker.json', {
      kind: 'permission',
      reason: 'synthetic host denial after commit',
      nextAction: 'Supported host resolution',
    })
    const result = coordinator.reconcile()
    expect(result.run.phase).toBe('completed')
    expect(result.advance).toBe(false)
    expect(result.problems).toContain('synthetic host denial after commit')
    await coordinator.close()
  })
})

describe('executable host with synthetic native adapters', () => {
  it('excludes coordinating ancestors but blocks competing native workers and incomplete inspection', () => {
    const base = '1 0 init\n10 1 codex exec coordinator\n20 10 node initiative-runner-host.mjs\n'
    expect(processTableQuiescent(base, 20)).toBe(true)
    expect(processTableQuiescent(`${base}30 1 Electron fixture\n`, 20)).toBe(false)
    expect(processTableQuiescent(`${base}30 1 codex exec other-task\n`, 20)).toBe(false)
    expect(processTableQuiescent(`${base}30 1 node vitest worker\n`, 20)).toBe(false)
    expect(processTableQuiescent(`${base}30 1 npm test\n`, 20)).toBe(false)
    expect(processTableQuiescent(`${base}30 1 npm run build\n`, 20)).toBe(false)
    expect(processTableQuiescent('', 20)).toBe(false)
  })
  it('retains ownership after unconfirmed native cancellation even if the CLI exited', async () => {
    const owned = records()
    owned.save('native-cleanup.json', { confirmed: false, stage: 'primary' })
    expect(await confirmQuiescence({ records: owned, stage: 'release' })).toBe(false)
    // Synthetic fixture owns no native process; explicit test cleanup only.
    owned.release()
  })
  function host({ twoTasks = false, failValidation = false } = {}) {
    const f = repository({
      argv: [process.execPath, '-e', failValidation ? 'process.exit(1)' : 'console.log("validated")'],
      roles: ['reviewer'],
    })
    if (twoTasks) {
      f.execution.tasks['EX-1'].nextTask = 'EX-2'
      f.execution.tasks['EX-2'] = { ...f.execution.tasks['EX-1'] }
      delete f.execution.tasks['EX-2'].nextTask
      f.plan = f.plan
        .replace(
          '| EX-1 | Synthetic change | Ready |',
          '| EX-1 | Synthetic change | Ready |\n| EX-2 | Second change | Planned |',
        )
        .replace(
          /```initiative-runner\n[\s\S]*?\n```/,
          `\`\`\`initiative-runner\n${JSON.stringify(f.execution)}\n\`\`\``,
        )
      writeFileSync(join(f.root, 'plans/example.md'), f.plan)
      git(f.root, ['add', '.'])
      git(f.root, ['commit', '--quiet', '-m', 'test(runner): approve synthetic second task'])
      f.startingCommit = git(f.root, ['rev-parse', 'HEAD'])
    }
    let sessions = 0
    const stages = []
    const input = {
      ...f,
      planPath: 'plans/example.md',
      taskId: 'EX-1',
      approvalReference: 'synthetic host',
      hostAuthorized: true,
      confirmQuiescence: async ({ records }) => records.children.size === 0,
      launchPrimary: async ({ records, authorization, onSession, resumeSession, deadlineAt }) => {
        const sessionId = resumeSession ?? `synthetic-${++sessions}`
        stages.push(resumeSession ? 'acceptance' : authorization.contract.taskId)
        onSession?.(sessionId)
        if (!resumeSession && !authorization.contract.closure) {
          writeFileSync(join(f.root, 'value.txt'), `${authorization.contract.taskId}\n`)
          let plan = readFileSync(join(f.root, input.planPath), 'utf8')
          const id = authorization.contract.taskId
          plan = plan.replace(new RegExp(`(\\| ${id} \\|[^\\n]+\\| )Ready( \\|)`), '$1Done$2')
          const next = authorization.contract.nextTask
          if (next) plan = plan.replace(new RegExp(`(\\| ${next} \\|[^\\n]+\\| )Planned( \\|)`), '$1Ready$2')
          writeFileSync(join(f.root, input.planPath), plan)
        }
        const process = await observeProcess({
          records,
          argv: [globalThis.process.execPath, '-e', 'console.log("synthetic native output")'],
          deadlineAt,
        })
        return {
          process,
          native: {
            sessionId,
            finalMessage: '{"allRequirementsCovered":true,"unresolvedFindings":[]}',
            usage: { input_tokens: 1, cached_input_tokens: 0, output_tokens: 1 },
          },
        }
      },
      launchConfiguredRole: async (request) => {
        stages.push('reviewer')
        const process = await observeProcess({
          records: request.records,
          argv: [globalThis.process.execPath, '-e', 'console.log("synthetic role")'],
          deadlineAt: request.deadlineAt,
        })
        return {
          ...process,
          configuredRole: request.role,
          configurationIdentity: request.configurationIdentity,
          contractIdentity: request.contractIdentity,
          sessionSource: 'native-role-launcher',
          sessionId: `independent-${sessions}`,
          runtime: { sandbox: 'read-only' },
          finalMessage: 'No meaningful issues found',
        }
      },
    }
    return { ...f, input, stages, sessions: () => sessions }
  }
  it('sequences two fresh tasks through validation, review, acceptance and append-only commits', async () => {
    const f = host({ twoTasks: true })
    const result = await executeInitiative(f.input)
    expect(result.map((item) => item.run.phase)).toEqual(['completed', 'completed'])
    expect(f.stages).toEqual(['EX-1', 'reviewer', 'acceptance', 'EX-2', 'reviewer', 'acceptance'])
    expect(git(f.root, ['rev-list', '--count', `${f.startingCommit}..HEAD`])).toBe('2')
    expect(git(f.root, ['status', '--porcelain'])).toBe('')
    const budget = readRecord(join(f.root, '.scratch/example/budget.json'))
    expect(result.every((item) => item.run.deadlineAt === budget.deadlineAt)).toBe(true)
  }, 15000)
  it('stops after two unsuccessful recoveries and preserves candidate and receipts', async () => {
    const f = host({ failValidation: true })
    await expect(executeInitiative(f.input)).rejects.toThrow('failed')
    expect(f.sessions()).toBe(3)
    const run = readRecord(join(f.root, '.scratch/example/run.json'))
    expect(run).toMatchObject({ phase: 'blocked', recoveryAttempts: 2 })
    expect(git(f.root, ['rev-parse', 'HEAD'])).toBe(f.startingCommit)
    expect(readFileSync(join(f.root, 'value.txt'), 'utf8')).toBe('EX-1\n')
  })
  it('preserves unrelated dirty work without launching a primary', async () => {
    const f = host()
    writeFileSync(join(f.root, 'unrelated.txt'), 'keep')
    await expect(executeInitiative(f.input)).rejects.toThrow('clean')
    expect(f.sessions()).toBe(0)
    expect(readFileSync(join(f.root, 'unrelated.txt'), 'utf8')).toBe('keep')
  })
  it('blocks required owner checks without committing or inventing evidence', async () => {
    const f = host()
    f.execution.tasks['EX-1'].ownerChecks = ['owner-observation']
    const plan = f.plan.replace(
      /```initiative-runner\n[\s\S]*?\n```/,
      `\`\`\`initiative-runner\n${JSON.stringify(f.execution)}\n\`\`\``,
    )
    writeFileSync(join(f.root, 'plans/example.md'), plan)
    git(f.root, ['add', '.'])
    git(f.root, ['commit', '--quiet', '-m', 'test(runner): require synthetic owner check'])
    f.input.startingCommit = git(f.root, ['rev-parse', 'HEAD'])
    await expect(executeInitiative(f.input)).rejects.toThrow('owner checks')
    expect(git(f.root, ['rev-parse', 'HEAD'])).toBe(f.input.startingCommit)
  })
  it('rejects arbitrary launch flags', () => {
    expect(() => hostArguments(['--dangerously-bypass-approvals-and-sandbox'])).toThrow('Expected')
  })
  it.each(['staged input', 'unknown dirty work', 'altered artifact'])(
    'rechecks prepared %s before creating any commit on restart',
    async (change) => {
      const f = host()
      const coordinator = new InitiativeCoordinator(f.input)
      await coordinator.primary()
      git(f.root, ['add', 'value.txt', 'plans/example.md'])
      await coordinator.validation('unit')
      await coordinator.role('reviewer')
      await coordinator.acceptance()
      expect(coordinator.prepare().ready).toBe(true)
      const artifact = coordinator.receipts[0].artifacts[0].path
      await coordinator.close()
      if (change === 'staged input') {
        writeFileSync(join(f.root, 'value.txt'), 'changed after preparation\n')
        git(f.root, ['add', 'value.txt'])
      } else if (change === 'unknown dirty work') writeFileSync(join(f.root, 'unknown.txt'), 'preserve')
      else writeFileSync(join(f.root, artifact), 'altered output')
      await expect(executeInitiative(f.input)).rejects.toThrow()
      expect(git(f.root, ['rev-parse', 'HEAD'])).toBe(f.startingCommit)
    },
    15000,
  )
  it.each([1, 2])(
    'resolves %s attributable owner checks without a repair session',
    async (checks) => {
      const f = host()
      f.execution.tasks['EX-1'].ownerChecks =
        checks === 1 ? ['owner-observation'] : ['owner-observation', 'second-observation']
      writeFileSync(
        join(f.root, 'plans/example.md'),
        f.plan.replace(
          /```initiative-runner\n[\s\S]*?\n```/,
          `\`\`\`initiative-runner\n${JSON.stringify(f.execution)}\n\`\`\``,
        ),
      )
      git(f.root, ['add', '.'])
      git(f.root, ['commit', '--quiet', '-m', 'test(runner): require owner evidence'])
      f.input.startingCommit = git(f.root, ['rev-parse', 'HEAD'])
      await expect(executeInitiative(f.input)).rejects.toThrow('owner checks')
      const directory = join(f.root, '.scratch/example')
      const run = readRecord(join(directory, 'run.json'))
      const observation = observeRepository({ ...f.input })
      const receipts = readRecord(join(directory, 'receipts.json'))
      const evidence = {
        runId: run.runId,
        checkId: 'owner-observation',
        snapshot: observation.snapshot,
        candidate: observation.indexIdentity,
        outcome: 'passed',
        ownerReference: 'Owner observation 2026-10-12',
        artifacts: receipts[0].artifacts,
      }
      await expect(resolveOwnerCheck(f.input, { ...evidence, snapshot: 'stale' })).rejects.toThrow()
      await expect(resolveOwnerCheck(f.input, { ...evidence, outcome: 'failed' })).rejects.toThrow()
      await expect(resolveOwnerCheck(f.input, { ...evidence, checkId: 'unauthorized' })).rejects.toThrow()
      await expect(resolveOwnerCheck(f.input, { ...evidence, artifacts: [] })).rejects.toThrow()
      expect(readRecord(join(directory, 'run.json'))).toEqual(run)
      await resolveOwnerCheck(f.input, evidence)
      if (checks === 2) {
        expect(readRecord(join(directory, 'run.json')).phase).toBe('blocked')
        await expect(executeInitiative(f.input)).rejects.toThrow('owner checks')
        await resolveOwnerCheck(f.input, { ...evidence, checkId: 'second-observation' })
      }
      const resumed = await executeInitiative(f.input)
      expect(resumed[0].run).toMatchObject({ phase: 'completed', recoveryAttempts: 0, sessionId: run.sessionId })
      expect(f.sessions()).toBe(1)
      expect(f.stages).toEqual(['EX-1', 'reviewer', 'acceptance'])
    },
    15000,
  )
  it('recovers final closure from committed authority after the working plan was deleted', async () => {
    const f = host()
    writeFileSync(join(f.root, 'plans/example.md'), f.plan.replace('| Ready |', '| Done |'))
    git(f.root, ['add', '.'])
    git(f.root, ['commit', '--quiet', '-m', 'test(runner): approve completed closure prerequisites'])
    f.input.startingCommit = git(f.root, ['rev-parse', 'HEAD'])
    f.input.closureAuthorized = true
    const launch = f.input.launchPrimary
    let first = true
    f.input.launchPrimary = async (request) => {
      const output = await launch(request)
      if (!request.resumeSession) {
        if (first) rmSync(join(f.root, 'plans/example.md'))
        writeFileSync(
          join(f.root, 'plans/README.md'),
          readFileSync(join(f.root, 'plans/README.md'), 'utf8')
            .split('\n')
            .filter((line) => !line.includes('[Example]'))
            .join('\n'),
        )
        if (first) {
          first = false
          output.process.blocker = { kind: 'failure', reason: 'Synthetic closure repair' }
        }
      }
      return output
    }
    const result = await executeInitiative(f.input)
    expect(result[0].run).toMatchObject({ phase: 'completed', recoveryAttempts: 1 })
    expect(git(f.root, ['status', '--porcelain'])).toBe('')
    const resumed = await executeInitiative(f.input)
    expect(resumed[0].run.commit).toBe(result[0].run.commit)
    expect(f.sessions()).toBe(2)
  }, 15000)
  it('provides concrete reviewer findings and artifact locations to a fresh repair', async () => {
    const f = host()
    const role = f.input.launchConfiguredRole
    const launch = f.input.launchPrimary
    const contexts = []
    f.input.launchPrimary = async (request) => {
      if (!request.resumeSession) contexts.push(request.recovery)
      return launch(request)
    }
    let first = true
    f.input.launchConfiguredRole = async (request) => {
      const output = await role(request)
      if (first) {
        first = false
        output.finalMessage = 'P1: value.txt loses retained content on retry'
      }
      return output
    }
    await executeInitiative(f.input)
    expect(contexts[1].blocker.reason).toContain('loses retained content')
    expect(contexts[1].details.role).toBe('reviewer')
    expect(contexts[1].details.sessionId).toBe('independent-1')
    expect(contexts[1].details.artifacts.length).toBeGreaterThan(0)
    expect(contexts[1].observation.changed).toContain('value.txt')
    const authorization = projectApprovedPlan({ ...f.input, sourceCommit: f.input.startingCommit })
    const prompt = primaryPrompt({ authorization, recovery: contexts[1] })
    expect(prompt).toContain('P1: value.txt loses retained content on retry')
    expect(prompt).toContain(contexts[1].details.artifacts[0].path)
    expect(prompt).toContain('independent-1')
  }, 15000)
  it('retains failed validation command identity and output artifacts for repair', async () => {
    const f = host({ failValidation: true })
    const launch = f.input.launchPrimary
    const contexts = []
    f.input.launchPrimary = async (request) => {
      if (!request.resumeSession) contexts.push(request.recovery)
      return launch(request)
    }
    await expect(executeInitiative(f.input)).rejects.toThrow('failed')
    expect(contexts[1].details.argv).toEqual(f.execution.tasks['EX-1'].commands[0].argv)
    expect(contexts[1].details.commandId).toBe('unit')
    expect(contexts[1].details.artifacts).toHaveLength(3)
    expect(
      primaryPrompt({
        authorization: projectApprovedPlan({ ...f.input, sourceCommit: f.input.startingCommit }),
        recovery: contexts[1],
      }),
    ).toContain(contexts[1].details.artifacts[0].path)
  }, 15000)
  it('refuses to commit an unresolved prepared candidate on restart', async () => {
    const f = host()
    const coordinator = new InitiativeCoordinator(f.input)
    await coordinator.primary()
    git(f.root, ['add', 'value.txt', 'plans/example.md'])
    await coordinator.validation('unit')
    await coordinator.role('reviewer')
    await coordinator.acceptance()
    expect(coordinator.prepare().ready).toBe(true)
    coordinator.block(new StageBlocker('permission', 'Synthetic commit permission denial', 'Supported resolution'))
    await coordinator.close()
    await expect(executeInitiative(f.input)).rejects.toThrow('permission denial')
    expect(f.sessions()).toBe(1)
    expect(git(f.root, ['rev-parse', 'HEAD'])).toBe(f.startingCommit)
  }, 15000)
  it('resumes an interrupted same task with the original deadline and a fresh session', async () => {
    const f = host()
    const launch = f.input.launchPrimary
    const controller = new AbortController()
    f.input.signal = controller.signal
    let first = true
    f.input.launchPrimary = async (request) => {
      const output = await launch(request)
      if (first) {
        first = false
        controller.abort()
        output.process.blocker = { kind: 'interrupted', reason: 'Synthetic interruption after edits' }
      }
      return output
    }
    await expect(executeInitiative(f.input)).rejects.toThrow('interruption')
    const original = readRecord(join(f.root, '.scratch/example/run.json'))
    delete f.input.signal
    const result = await executeInitiative(f.input)
    expect(result[0].run).toMatchObject({ phase: 'completed', deadlineAt: original.deadlineAt, recoveryAttempts: 1 })
    expect(f.sessions()).toBe(2)
  }, 15000)
  it('reconciles a landed commit after lost completion persistence without replaying a primary', async () => {
    const f = host()
    const result = await executeInitiative(f.input)
    const path = join(f.root, '.scratch/example/run.json')
    // Synthetic crash boundary: commit exists, prepared state survived but the
    // completion write did not. All actual receipt artifacts remain untouched.
    atomicRecord(path, { ...result[0].run, phase: 'executing', commit: undefined })
    f.input.now = () => result[0].run.deadlineAt + 1
    const resumed = await executeInitiative(f.input)
    expect(resumed[0].run.commit).toBe(result[0].run.commit)
    expect(resumed[0].advance).toBe(false)
    expect(f.sessions()).toBe(1)
    expect(git(f.root, ['rev-list', '--count', `${f.startingCommit}..HEAD`])).toBe('1')
  }, 15000)
  it('does not retry a permission denial or commit its retained candidate', async () => {
    const f = host()
    const launch = f.input.launchPrimary
    f.input.launchPrimary = async (request) => {
      const output = await launch(request)
      output.process.blocker = { kind: 'permission', reason: 'Synthetic permission denied' }
      return output
    }
    await expect(executeInitiative(f.input)).rejects.toThrow('permission denied')
    expect(f.sessions()).toBe(1)
    expect(git(f.root, ['rev-parse', 'HEAD'])).toBe(f.startingCommit)
  })
})

describe('authoritative plan projection and explicit closure', () => {
  it('derives exact command/file/role inputs from the selected approved plan', () => {
    const f = repository()
    const authorization = projectApprovedPlan({
      ...f,
      planPath: 'plans/example.md',
      taskId: 'EX-1',
      approvalReference: 'synthetic',
      hostAuthorized: true,
    })
    expect(authorization.contract.commands).toEqual(f.execution.tasks['EX-1'].commands)
    expect(authorization.contract.scope).toContain('Change value.txt')
    expect(authorization.contract.scope).not.toContain('Excluded task')
    expect(authorization.contract.planAuthority).toMatch(/^sha256:/)
    expect(() =>
      projectApprovedPlan({
        ...f,
        planPath: 'plans/example.md',
        taskId: 'EX-2',
        approvalReference: 'synthetic',
        hostAuthorized: true,
      }),
    ).toThrow('Ready')
    expect(() =>
      projectApprovedPlan({
        ...f,
        planPath: 'plans/example.md',
        taskId: 'EX-1',
        approvalReference: 'synthetic',
        hostAuthorized: false,
      }),
    ).toThrow('host')
  })
  it('does not select duplicate, missing or implicit execution blocks', () => {
    const f = repository()
    const input = {
      ...f,
      planPath: 'plans/example.md',
      taskId: 'EX-1',
      approvalReference: 'synthetic',
      hostAuthorized: true,
    }
    writeFileSync(join(f.root, input.planPath), `${f.plan}\n${f.plan}`)
    expect(() => projectApprovedPlan(input)).toThrow('Exactly one')
    writeFileSync(join(f.root, input.planPath), f.plan.split('```initiative-runner')[0])
    expect(() => projectApprovedPlan(input)).toThrow('Exactly one')
  })
  function closureFixture() {
    const f = repository({ done: true })
    const input = {
      ...f,
      planPath: 'plans/example.md',
      taskId: 'EX-1',
      approvalReference: 'explicit synthetic closure',
      hostAuthorized: true,
      closureAuthorized: true,
    }
    const authorization = projectApprovedPlan(input)
    const observe = () =>
      observeRepository({
        ...f,
        planPath: input.planPath,
        taskId: input.taskId,
        closure: authorization.contract.closure,
      })
    let run = startTask({
      authorization,
      observation: observe(),
      runId: 'closure-run',
      sessionId: 'closure-primary',
      now: 100,
      deadlineAt: 60100,
    })
    const index = readFileSync(join(f.root, 'plans/README.md'), 'utf8')
    rmSync(join(f.root, input.planPath))
    writeFileSync(
      join(f.root, 'plans/README.md'),
      index
        .split('\n')
        .filter((line) => !line.includes('[Example]'))
        .join('\n'),
    )
    git(f.root, ['add', '.'])
    const observation = observe()
    const common = {
      runId: run.runId,
      taskId: input.taskId,
      snapshot: observation.snapshot,
      candidate: observation.indexIdentity,
      finishedAt: 200,
      status: 'passed',
      artifacts: ['synthetic-observed'],
    }
    const receipts = [
      {
        ...common,
        id: 'validation',
        kind: 'command',
        commandId: 'unit',
        argv: ['npm', 'test'],
        exitCode: 0,
        signal: null,
      },
      {
        ...common,
        id: 'acceptance',
        kind: 'acceptance',
        sessionId: run.sessionId,
        allRequirementsCovered: true,
        unresolvedFindings: [],
      },
    ]
    return {
      ...f,
      observe,
      authorization,
      receipts,
      get run() {
        return run
      },
      prepare() {
        const result = prepareCommit({ run, authorization, observation: observe(), receipts, now: 300 })
        run = result.run
        return result
      },
    }
  }
  it('requires explicit completed-task prerequisites before closure', () => {
    const f = repository()
    expect(() =>
      projectApprovedPlan({
        ...f,
        planPath: 'plans/example.md',
        taskId: 'EX-1',
        approvalReference: 'closure',
        hostAuthorized: true,
        closureAuthorized: true,
      }),
    ).toThrow('Ready')
    const auth = projectApprovedPlan({
      ...f,
      planPath: 'plans/example.md',
      taskId: 'EX-1',
      approvalReference: 'normal',
      hostAuthorized: true,
    })
    expect(() =>
      authorizeTask({
        ...auth.contract,
        closure: { approved: false, indexPath: 'plans/README.md', requiredTasks: ['EX-1'] },
      }),
    ).toThrow('Explicit')
  })
  it('records exact closure candidate before reconciling its single-parent commit', () => {
    const f = closureFixture()
    expect(f.observe().closureValid).toBe(true)
    expect(f.prepare().ready).toBe(true)
    const identity = f.run.candidate.identity
    git(f.root, ['commit', '--quiet', '-m', 'docs(runner): close synthetic initiative'])
    const result = reconcileCommit({ run: f.run, authorization: f.authorization, observation: f.observe(), now: 400 })
    expect(result.advance).toBe(true)
    expect(f.observe().headIdentity).toBe(identity)
    expect(readFileSync(join(f.root, 'plans/README.md'), 'utf8')).toContain('[Other]')
    expect(() =>
      reconcileCommit({ run: result.run, authorization: f.authorization, observation: f.observe(), now: 500 }),
    ).toThrow('already completed')
  })
  it.each(['other index row', 'missing receipt', 'unstaged deletion', 'retained plan'])(
    'rejects closure with %s',
    (kind) => {
      const f = closureFixture()
      if (kind === 'other index row') {
        writeFileSync(join(f.root, 'plans/README.md'), '# no other initiative\n')
        git(f.root, ['add', '.'])
      }
      if (kind === 'missing receipt') f.receipts.shift()
      if (kind === 'unstaged deletion') git(f.root, ['restore', '--staged', 'plans/example.md'])
      if (kind === 'retained plan') {
        writeFileSync(join(f.root, 'plans/example.md'), f.plan)
        git(f.root, ['add', '.'])
      }
      expect(f.prepare().ready).toBe(false)
    },
  )
  it('does not allow unrelated tasks to claim completion in a task commit', () => {
    const before = '| EX-1 | work | Ready |\n| EX-2 | later | Planned |\n'
    expect(
      planTransitionsValid(before, before.replace('Ready', 'Done').replace('Planned', 'Ready'), 'EX-1', 'EX-2'),
    ).toBe(true)
    expect(planTransitionsValid(before, before.replaceAll('Planned', 'Done'), 'EX-1', 'EX-2')).toBe(false)
    expect(planTransitionsValid(before, before.replace('later', 'expanded scope'), 'EX-1', 'EX-2')).toBe(false)
    const withPrerequisite = `${before}| EX-1L | launch prerequisite | Ready |\n`
    expect(
      planTransitionsValid(
        withPrerequisite,
        withPrerequisite.replace('prerequisite | Ready', 'prerequisite | Done'),
        'EX-1',
      ),
    ).toBe(false)
  })
})
