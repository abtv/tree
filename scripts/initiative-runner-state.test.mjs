import { execFileSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { digest, observeRepository, repositoryPath, taskStatus } from './initiative-runner-git.mjs'
import {
  authorizeTask,
  checkpointTask,
  prepareCommit,
  reconcileCommit,
  resumeTask,
  startTask,
} from './initiative-runner-state.mjs'

const roots = []
const scratch = resolve('.scratch/autonomous-initiatives/tests')
const planPath = 'plans/example.md'
const taskId = 'EX-1'
let observedFixture

function git(root, args) {
  return execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1' },
  }).trim()
}

function fixture() {
  mkdirSync(scratch, { recursive: true })
  const root = mkdtempSync(join(scratch, 'gate-'))
  roots.push(root)
  git(root, ['init', '--quiet'])
  git(root, ['config', 'user.name', 'Synthetic Runner Test'])
  git(root, ['config', 'user.email', 'runner@example.invalid'])
  git(root, ['config', 'commit.gpgsign', 'false'])
  git(root, ['config', 'core.hooksPath', '/dev/null'])
  mkdirSync(join(root, 'plans'))
  writeFileSync(
    join(root, planPath),
    '# Example\n\n| ID | Outcome | Status |\n| --- | --- | --- |\n| EX-1 | Synthetic change | Ready |\n',
  )
  writeFileSync(join(root, 'value.txt'), 'before\n')
  git(root, ['add', '.'])
  git(root, ['commit', '--quiet', '-m', 'test(runner): seed synthetic repository'])
  const startingCommit = git(root, ['rev-parse', 'HEAD'])
  const observe = () => observeRepository({ root, startingCommit, planPath, taskId })
  const authorization = authorizeTask({
    approved: true,
    tool: 'codex',
    initiative: 'example',
    taskId,
    approvalReference: 'synthetic-test-only',
    scope: 'Change the synthetic value',
    planPath,
    files: [planPath, 'value.txt', 'new.txt'],
    commands: [{ id: 'unit', argv: ['npm', 'test', '--', 'example.test.mjs'] }],
    roles: ['reviewer', 'product_verifier'],
    ownerChecks: ['native-check'],
    budgetMs: 60000,
  })
  let run = startTask({
    authorization,
    observation: observe(),
    runId: 'run-1',
    sessionId: 'primary-1',
    now: 1000,
    deadlineAt: 61000,
  })
  function candidate() {
    writeFileSync(join(root, planPath), readFileSync(join(root, planPath), 'utf8').replace('Ready', 'Done'))
    writeFileSync(join(root, 'value.txt'), 'after\n')
    writeFileSync(join(root, 'new.txt'), 'new tracked file\n')
    git(root, ['add', '.'])
    const observation = observe()
    // Synthetic coordinator receipts: these tests do not launch validation or agents.
    const common = {
      runId: run.runId,
      taskId,
      snapshot: observation.snapshot,
      candidate: observation.indexIdentity,
      finishedAt: 2000,
      status: 'passed',
      artifacts: ['synthetic-observed-event'],
    }
    const receipts = [
      {
        ...common,
        id: 'command-1',
        kind: 'command',
        commandId: 'unit',
        argv: authorization.contract.commands[0].argv,
        exitCode: 0,
        signal: null,
      },
      { ...common, id: 'review-1', kind: 'role', role: 'reviewer', sessionId: 'reviewer-1', unresolvedFindings: [] },
      {
        ...common,
        id: 'verify-1',
        kind: 'role',
        role: 'product_verifier',
        sessionId: 'verifier-1',
        unresolvedFindings: [],
      },
      { ...common, id: 'owner-1', kind: 'owner', checkId: 'native-check', ownerReference: 'synthetic-owner-response' },
      {
        ...common,
        id: 'accept-1',
        kind: 'acceptance',
        sessionId: run.sessionId,
        allRequirementsCovered: true,
        unresolvedFindings: [],
      },
    ]
    return { observation, receipts }
  }
  function prepare(input = candidate()) {
    const result = prepareCommit({ run, authorization, ...input, now: 3000 })
    run = result.run
    return result
  }
  function commit() {
    git(root, ['commit', '--quiet', '-m', 'test(runner): complete synthetic task'])
  }
  return {
    root,
    authorization,
    observe,
    candidate,
    prepare,
    commit,
    get run() {
      return run
    },
  }
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

beforeAll(() => {
  const f = fixture()
  observedFixture = { authorization: f.authorization, observation: f.observe(), run: f.run, candidate: f.candidate() }
})

// Pure gate permutations reuse a captured Git observation. Real repository tests
// below separately exercise observation, changes, commits and crash recovery.
function gateFixture() {
  const data = structuredClone(observedFixture)
  return {
    authorization: data.authorization,
    run: data.run,
    observe: () => structuredClone(data.observation),
    candidate: () => structuredClone(data.candidate),
    prepare: (input) => prepareCommit({ run: data.run, authorization: data.authorization, ...input, now: 3000 }),
  }
}

describe('read-only Git observations and commit reconciliation', () => {
  it('observes a real unmerged index and refuses its candidate', () => {
    const f = fixture()
    const input = f.candidate()
    const blob = git(f.root, ['rev-parse', 'HEAD:value.txt'])
    execFileSync('git', ['update-index', '--index-info'], {
      cwd: f.root,
      input: `0 ${'0'.repeat(40)}\tvalue.txt\n100644 ${blob} 1\tvalue.txt\n100644 ${blob} 2\tvalue.txt\n100644 ${blob} 3\tvalue.txt\n`,
    })
    input.observation = f.observe()
    expect(input.observation.conflicts).toContain('value.txt')
    expect(f.prepare(input).ready).toBe(false)
  })

  it('includes executable modes in the candidate identity', () => {
    const f = fixture()
    const before = f.candidate().observation.indexIdentity
    chmodSync(join(f.root, 'value.txt'), 0o755)
    git(f.root, ['add', 'value.txt'])
    expect(f.observe().indexIdentity).not.toBe(before)
  })

  it('matches staged new files to a real commit despite HEAD-based snapshot changes', () => {
    const f = fixture()
    const candidate = f.candidate()
    expect(f.prepare(candidate).ready).toBe(true)
    f.commit()
    const final = f.observe()
    expect(final.snapshot).not.toBe(candidate.observation.snapshot)
    expect(final.headIdentity).toBe(candidate.observation.indexIdentity)
    const result = reconcileCommit({ run: f.run, authorization: f.authorization, observation: final, now: 4000 })
    expect(result.advance).toBe(true)
    expect(result.run.phase).toBe('completed')
    expect(() =>
      reconcileCommit({ run: result.run, authorization: f.authorization, observation: final, now: 4500 }),
    ).toThrow('already completed')
    expect(git(f.root, ['status', '--porcelain'])).toBe('')
  })

  it('recovers a commit that landed before the process checkpoint without a duplicate commit', () => {
    const f = fixture()
    f.prepare()
    f.commit()
    const blocked = checkpointTask({
      run: f.run,
      authorization: f.authorization,
      observation: f.observe(),
      now: 4000,
      kind: 'interrupted',
      reason: 'process ended before receipt persistence',
    })
    expect(() =>
      resumeTask({
        run: blocked,
        authorization: f.authorization,
        observation: f.observe(),
        now: 4100,
        sessionId: 'primary-2',
      }),
    ).toThrow('Reconcile')
    expect(
      reconcileCommit({ run: blocked, authorization: f.authorization, observation: f.observe(), now: 4200 }).advance,
    ).toBe(true)
  })

  it.each(['owner', 'capability', 'scope', 'permission', 'authentication', 'failure', 'budget'])(
    'retains a newly discovered %s blocker when a commit lands',
    (kind) => {
      const f = fixture()
      f.prepare()
      const blocked = checkpointTask({
        run: f.run,
        authorization: f.authorization,
        observation: f.observe(),
        now: 3500,
        kind,
        reason: 'new unresolved obligation',
      })
      f.commit()
      const result = reconcileCommit({
        run: blocked,
        authorization: f.authorization,
        observation: f.observe(),
        now: 4000,
      })
      expect(result.advance).toBe(false)
      expect(result.run.phase).toBe('blocked')
      expect(result.run.commit).toBe(f.observe().head)
      expect(result.run.blocker.reason).toBe('new unresolved obligation')
    },
  )

  it('refuses a commit made without a validated candidate', () => {
    const f = fixture()
    f.candidate()
    f.commit()
    expect(
      reconcileCommit({ run: f.run, authorization: f.authorization, observation: f.observe(), now: 4000 }).advance,
    ).toBe(false)
  })

  it('rejects edits committed after the reviewed candidate', () => {
    const f = fixture()
    f.prepare()
    writeFileSync(join(f.root, 'value.txt'), 'unreviewed\n')
    git(f.root, ['add', 'value.txt'])
    f.commit()
    expect(
      reconcileCommit({ run: f.run, authorization: f.authorization, observation: f.observe(), now: 4000 }).problems,
    ).toContain('Commit differs from the validated candidate')
  })

  it('rejects extra commits even when final files match', () => {
    const f = fixture()
    f.prepare()
    f.commit()
    git(f.root, ['commit', '--quiet', '--allow-empty', '-m', 'test(runner): unexpected extra commit'])
    expect(
      reconcileCommit({ run: f.run, authorization: f.authorization, observation: f.observe(), now: 4000 }).advance,
    ).toBe(false)
  })

  it('does not advance with untracked user work and preserves it', () => {
    const f = fixture()
    f.prepare()
    f.commit()
    writeFileSync(join(f.root, 'user.txt'), 'preserve me')
    expect(
      reconcileCommit({ run: f.run, authorization: f.authorization, observation: f.observe(), now: 4000 }).advance,
    ).toBe(false)
    expect(readFileSync(join(f.root, 'user.txt'), 'utf8')).toBe('preserve me')
  })

  it('distinguishes a completed commit from permission to launch past the budget', () => {
    const f = fixture()
    f.prepare()
    f.commit()
    const result = reconcileCommit({ run: f.run, authorization: f.authorization, observation: f.observe(), now: 62000 })
    expect(result.run.phase).toBe('completed')
    expect(result.advance).toBe(false)
  })
})

describe('completion evidence gates', () => {
  it.each([42, {}, ' '])('rejects malformed attribution %j', (value) => {
    for (const [index, key] of [
      [1, 'sessionId'],
      [3, 'ownerReference'],
    ]) {
      const f = gateFixture()
      const input = f.candidate()
      input.receipts[index][key] = value
      expect(f.prepare(input).ready).toBe(false)
    }
  })

  it.each([
    [
      'missing command',
      (input) => {
        input.receipts.shift()
      },
    ],
    [
      'failed command',
      (input) => {
        input.receipts[0].exitCode = 1
      },
    ],
    [
      'interrupted command',
      (input) => {
        input.receipts[0].signal = 'SIGTERM'
      },
    ],
    [
      'different command',
      (input) => {
        input.receipts[0].argv = ['true']
      },
    ],
    [
      'missing artifacts',
      (input) => {
        input.receipts[0].artifacts = []
      },
    ],
    [
      'blocked evidence',
      (input) => {
        input.receipts[0].status = 'blocked'
      },
    ],
    [
      'stale snapshot',
      (input) => {
        input.receipts[0].snapshot = 'old'
      },
    ],
    [
      'stale candidate',
      (input) => {
        input.receipts[0].candidate = 'old'
      },
    ],
    [
      'wrong task',
      (input) => {
        input.receipts[0].taskId = 'EX-2'
      },
    ],
    [
      'wrong run',
      (input) => {
        input.receipts[0].runId = 'run-2'
      },
    ],
    [
      'future evidence',
      (input) => {
        input.receipts[0].finishedAt = 4000
      },
    ],
    [
      'duplicate evidence',
      (input) => {
        input.receipts.push(input.receipts[0])
      },
    ],
    [
      'absent independent review',
      (input) => {
        input.receipts.splice(1, 1)
      },
    ],
    [
      'self review',
      (input) => {
        input.receipts[1].sessionId = 'primary-1'
      },
    ],
    [
      'shared reviewer sessions',
      (input) => {
        input.receipts[2].sessionId = 'reviewer-1'
      },
    ],
    [
      'unresolved review',
      (input) => {
        input.receipts[1].unresolvedFindings = ['data loss']
      },
    ],
    [
      'missing owner response',
      (input) => {
        input.receipts.splice(3, 1)
      },
    ],
    [
      'missing primary acceptance',
      (input) => {
        input.receipts.pop()
      },
    ],
    [
      'uncovered requirement',
      (input) => {
        input.receipts[4].allRequirementsCovered = false
      },
    ],
    [
      'agent success message',
      (input) => {
        input.receipts = [{ success: true }]
      },
    ],
  ])('rejects %s', (_name, mutate) => {
    const f = gateFixture()
    const input = f.candidate()
    mutate(input)
    const result = f.prepare(input)
    expect(result.ready).toBe(false)
    expect(result.run.candidate).toBeNull()
  })

  it.each(['unstaged', 'untracked', 'working plan', 'out of scope', 'plan not Done'])(
    'rejects %s changes before committing',
    (kind) => {
      const f = fixture()
      const input = f.candidate()
      if (kind === 'unstaged') writeFileSync(join(f.root, 'value.txt'), 'later')
      if (kind === 'untracked') writeFileSync(join(f.root, 'unknown.txt'), 'unknown')
      if (kind === 'working plan') writeFileSync(join(f.root, 'WORKING_PLAN.md'), 'unfinished')
      if (kind === 'out of scope') {
        writeFileSync(join(f.root, 'unapproved.txt'), 'unapproved')
        git(f.root, ['add', 'unapproved.txt'])
      }
      if (kind === 'plan not Done') {
        writeFileSync(join(f.root, planPath), '| EX-1 | change | In progress |\n')
        git(f.root, ['add', planPath])
      }
      input.observation = f.observe()
      expect(f.prepare(input).ready).toBe(false)
    },
  )
})

describe('authorization and bounded recovery', () => {
  it('rejects an unknown persisted blocker', () => {
    const f = gateFixture()
    const run = checkpointTask({
      run: f.run,
      authorization: f.authorization,
      observation: f.observe(),
      now: 2000,
      kind: 'interrupted',
      reason: 'stop',
    })
    run.blocker.kind = 'unknown'
    expect(() =>
      resumeTask({ run, authorization: f.authorization, observation: f.observe(), now: 2100, sessionId: 'recovery' }),
    ).toThrow()
  })

  it.each(['startingCommit', 'planPath', 'taskId'])('rejects an observation for another %s', (key) => {
    const f = gateFixture()
    const observation = { ...f.observe(), [key]: 'other' }
    expect(() =>
      checkpointTask({
        run: f.run,
        authorization: f.authorization,
        observation,
        now: 2000,
        kind: 'interrupted',
        reason: 'stop',
      }),
    ).toThrow()
  })

  it.each(['deadlineAt', 'recoveryAttempts', 'primarySessions', 'candidate', 'startingCommit'])(
    'rejects missing persisted %s',
    (key) => {
      const f = gateFixture()
      const run = { ...f.run }
      delete run[key]
      expect(() =>
        checkpointTask({
          run,
          authorization: f.authorization,
          observation: f.observe(),
          now: 2000,
          kind: 'interrupted',
          reason: 'stop',
        }),
      ).toThrow()
    },
  )

  it('does not treat a previous implementing session as an independent reviewer', () => {
    const f = gateFixture()
    const blocked = checkpointTask({
      run: f.run,
      authorization: f.authorization,
      observation: f.observe(),
      now: 1500,
      kind: 'interrupted',
      reason: 'stop',
    })
    const run = resumeTask({
      run: blocked,
      authorization: f.authorization,
      observation: f.observe(),
      now: 1600,
      sessionId: 'primary-2',
    })
    const input = f.candidate()
    input.receipts[1].sessionId = 'primary-1'
    input.receipts[4].sessionId = 'primary-2'
    expect(prepareCommit({ run, authorization: f.authorization, ...input, now: 3000 }).ready).toBe(false)
  })

  it.each(['approved', 'tool', 'commands', 'ownerChecks', 'budgetMs'])('rejects malformed %s authorization', (key) => {
    const f = gateFixture()
    const input = structuredClone(f.authorization.contract)
    delete input[key]
    expect(() => authorizeTask(input)).toThrow()
  })

  it('rejects changed authorization and duplicate launch on an executing record', () => {
    const f = gateFixture()
    const blockedArgs = {
      run: f.run,
      authorization: f.authorization,
      observation: f.observe(),
      now: 2000,
      sessionId: 'primary-2',
    }
    expect(() => resumeTask(blockedArgs)).toThrow('Only a blocked')
    f.authorization.contract.scope = 'expanded'
    expect(() => checkpointTask({ ...blockedArgs, kind: 'failure', reason: 'test' })).toThrow('modified')
  })

  it('resumes owned work only at the recorded checkpoint, keeps its deadline and caps recovery', () => {
    const f = fixture()
    f.candidate()
    let run = f.run
    for (let attempt = 0; attempt < 2; attempt++) {
      run = checkpointTask({
        run,
        authorization: f.authorization,
        observation: f.observe(),
        now: 2000 + attempt * 100,
        kind: 'failure',
        reason: 'same failing assertion',
      })
      run = resumeTask({
        run,
        authorization: f.authorization,
        observation: f.observe(),
        now: 2050 + attempt * 100,
        sessionId: `recovery-${attempt}`,
      })
      expect(run.deadlineAt).toBe(61000)
    }
    run = checkpointTask({
      run,
      authorization: f.authorization,
      observation: f.observe(),
      now: 2300,
      kind: 'failure',
      reason: 'same failing assertion',
    })
    expect(() =>
      resumeTask({ run, authorization: f.authorization, observation: f.observe(), now: 2400, sessionId: 'again' }),
    ).toThrow('exhausted')
    expect(readFileSync(join(f.root, 'value.txt'), 'utf8')).toBe('after\n')
  })

  it('blocks recovery after unexpected worktree changes without discarding them', () => {
    const f = fixture()
    const run = checkpointTask({
      run: f.run,
      authorization: f.authorization,
      observation: f.observe(),
      now: 2000,
      kind: 'interrupted',
      reason: 'lost process',
    })
    writeFileSync(join(f.root, 'user.txt'), 'new work')
    expect(() =>
      resumeTask({ run, authorization: f.authorization, observation: f.observe(), now: 2100, sessionId: 'recovery' }),
    ).toThrow('ownership is unknown')
  })

  it.each(['permission', 'authentication', 'owner', 'scope', 'capability', 'budget'])(
    'does not automatically retry %s blockers',
    (kind) => {
      const f = gateFixture()
      const run = checkpointTask({
        run: f.run,
        authorization: f.authorization,
        observation: f.observe(),
        now: 2000,
        kind,
        reason: 'external action required',
      })
      expect(() =>
        resumeTask({ run, authorization: f.authorization, observation: f.observe(), now: 2100, sessionId: 'recovery' }),
      ).toThrow('external resolution')
    },
  )

  it('rejects expired or backwards clocks and a dirty initial worktree', () => {
    const f = fixture()
    const run = checkpointTask({
      run: f.run,
      authorization: f.authorization,
      observation: f.observe(),
      now: 2000,
      kind: 'interrupted',
      reason: 'lost process',
    })
    expect(() =>
      resumeTask({ run, authorization: f.authorization, observation: f.observe(), now: 62000, sessionId: 'recovery' }),
    ).toThrow('budget')
    expect(() =>
      resumeTask({ run, authorization: f.authorization, observation: f.observe(), now: 1500, sessionId: 'recovery' }),
    ).toThrow('backwards')
    writeFileSync(join(f.root, 'user.txt'), 'preserve')
    expect(() =>
      startTask({
        authorization: f.authorization,
        observation: f.observe(),
        runId: 'other',
        sessionId: 'other',
        now: 2000,
        deadlineAt: 61000,
      }),
    ).toThrow('clean')
  })
})

describe('plan and path parsing', () => {
  it.each(['../outside', '/absolute', 'a/../b', 'a//b', '-option', 'a\\b', 'a\0b'])(
    'rejects unsafe path %s',
    (path) => {
      expect(() => repositoryPath(path)).toThrow()
    },
  )
  it('does not infer completion from ambiguous plan rows', () => {
    expect(taskStatus('| EX-1 | task | Done |\n| EX-1 | duplicate | Ready |', 'EX-1')).toBeNull()
    expect(taskStatus('EX-1 Done', 'EX-1')).toBeNull()
    expect(digest(['a', 'bc'])).not.toBe(digest(['ab', 'c']))
  })
})
