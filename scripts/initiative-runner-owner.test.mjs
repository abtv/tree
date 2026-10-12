import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { digest } from './initiative-runner-git.mjs'
import { projectApprovedPlan } from './initiative-runner-plan.mjs'
import { atomicRecord, readRecord, RunRecords } from './initiative-runner-records.mjs'
import {
  awaitingPlan,
  checkpointInitiative,
  checkInitiativeRepair,
  recordInitiativeResponse,
  requireInitiativeAcceptance,
  reviewedInputs,
} from './initiative-runner-owner.mjs'
import { executeInitiative, resolveInitiativeOwner } from './initiative-runner-host.mjs'
import { InitiativeCoordinator } from './initiative-runner.mjs'
import { observeProcess } from './initiative-runner-process.mjs'

const roots = []
const git = (root, args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()

function fixture({ awaiting = true, contract = true } = {}) {
  const directory = resolve('.scratch/runner-readiness/rr2/tests')
  mkdirSync(directory, { recursive: true })
  const root = mkdtempSync(join(directory, 'owner-'))
  roots.push(root)
  git(root, ['init', '--quiet'])
  git(root, ['config', 'user.name', 'Synthetic Owner Test'])
  git(root, ['config', 'user.email', 'owner@example.invalid'])
  git(root, ['config', 'commit.gpgsign', 'false'])
  git(root, ['config', 'core.hooksPath', '/dev/null'])
  mkdirSync(join(root, 'plans'))
  const files = ['plans/example.md', 'plans/README.md', 'value.txt']
  const task = {
    files,
    commands: [{ id: 'unit', argv: [process.execPath, '-e', 'console.log("validated")'] }],
    roles: [],
    ownerChecks: [],
  }
  const execution = {
    version: 1,
    tool: 'codex',
    initiative: 'example',
    budgetMs: 60000,
    substantiveTaskCount: 3,
    tasks: { 'EX-1': { ...task, nextTask: 'EX-2' }, 'EX-2': { ...task, nextTask: 'EX-3' }, 'EX-3': task },
    closure: { indexPath: 'plans/README.md', requiredTasks: ['EX-1', 'EX-2', 'EX-3'] },
    ...(contract
      ? {
          initiativeAcceptance: {
            indexPath: 'plans/README.md',
            requiredTasks: ['EX-1', 'EX-2', 'EX-3'],
            reviewPaths: [...files, 'removed.txt'],
          },
        }
      : {}),
  }
  const plan = `# Example\n\n## Objective and Authorization\n\nStatus: **${awaiting ? 'Awaiting owner acceptance' : 'In progress'}**\n\nApproved synthetic outcome.\n\n## Sources and Constraints\n\nPreserve data.\n\n## Tasks\n\n| ID | Outcome | Status |\n| --- | --- | --- |\n| EX-1 | First | Done |\n| EX-2 | Second | Done |\n| EX-3 | Final | ${awaiting ? 'Done' : 'Ready'} |\n\n### EX-1 — First\n\nFirst outcome.\n\n### EX-2 — Second\n\nSecond outcome.\n\n### EX-3 — Final\n\nFinal outcome.\n\n## Execution Projection\n\n\`\`\`initiative-runner\n${JSON.stringify(execution)}\n\`\`\`\n`
  writeFileSync(join(root, 'plans/example.md'), plan)
  writeFileSync(
    join(root, 'plans/README.md'),
    `# Active Plans\n\n| Initiative | Status |\n| --- | --- |\n| [Example](example.md) | ${awaiting ? 'Awaiting owner acceptance' : 'In progress'} |\n| [Other](other.md) | Proposed |\n`,
  )
  writeFileSync(join(root, 'value.txt'), 'delivered\n')
  writeFileSync(join(root, 'unrelated.txt'), 'owner\n')
  writeFileSync(join(root, '.gitignore'), '.scratch/\nremoved.txt\n')
  git(root, ['add', '.'])
  git(root, ['commit', '--quiet', '-m', 'test(runner): seed owner checkpoint'])
  const commit = git(root, ['rev-parse', 'HEAD'])
  const input = {
    root,
    planPath: 'plans/example.md',
    taskId: 'EX-3',
    startingCommit: commit,
    approvalReference: 'initial execution approval',
    hostAuthorized: true,
    confirmQuiescence: async () => true,
    launchConfiguredRole: async () => {
      throw new Error('No roles expected')
    },
  }
  const authorization = () => projectApprovedPlan({ ...input, sourceCommit: input.startingCommit, candidate: true })
  return { root, input, commit, execution, authorization }
}

function checkpoint(f) {
  const records = new RunRecords({ root: f.root, initiative: 'example', hostAuthorized: true })
  const state = checkpointInitiative(records, f.authorization(), f.commit, 100)
  writeFileSync(join(records.path, 'owner.log'), 'Explicit synthetic owner observation\n')
  const artifacts = [records.artifact(join(records.path, 'owner.log'))]
  const evidence = {
    outcome: 'accepted',
    commit: state.commit,
    inputIdentity: state.inputIdentity,
    ownerReference: 'owner message accepting this commit',
    issues: [],
    artifacts,
  }
  return { records, state, evidence }
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('post-commit initiative owner checkpoint', () => {
  it('fails closed on qualifying legacy projections without acceptance, including corrupt counts', () => {
    const f = fixture({ contract: false })
    expect(f.authorization).toThrow('requires explicit final owner acceptance')
    f.execution.substantiveTaskCount = 'unknown'
    const plan = readFileSync(join(f.root, f.input.planPath), 'utf8').replace(
      /```initiative-runner\n[\s\S]*?\n```/,
      `\`\`\`initiative-runner\n${JSON.stringify(f.execution)}\n\`\`\``,
    )
    writeFileSync(join(f.root, f.input.planPath), plan)
    expect(() => projectApprovedPlan({ ...f.input, candidate: true })).toThrow('retained substantive task count')
  })

  it('requires committed Done prerequisites and retained plan/index status', () => {
    const f = fixture({ awaiting: false })
    expect(awaitingPlan(f.root, f.commit, f.input.planPath, f.execution.initiativeAcceptance)).toBe(false)
    writeFileSync(
      join(f.root, f.input.planPath),
      readFileSync(join(f.root, f.input.planPath), 'utf8').replace('| Final | Ready |', '| Final | Done |'),
    )
    git(f.root, ['add', '.'])
    git(f.root, ['commit', '--quiet', '-m', 'test(runner): retain wrong final status'])
    expect(() =>
      awaitingPlan(f.root, git(f.root, ['rev-parse', 'HEAD']), f.input.planPath, f.execution.initiativeAcceptance),
    ).toThrow('Awaiting owner acceptance')
  })

  it('blocks closure until attributable acceptance and preserves it across record restart', async () => {
    const f = fixture()
    const { records, state, evidence } = checkpoint(f)
    expect(state.status).toBe('awaiting')
    expect(() => requireInitiativeAcceptance(records, f.authorization())).toThrow('Explicit final owner acceptance')
    const accepted = recordInitiativeResponse(records, evidence, 110)
    requireInitiativeAcceptance(records, f.authorization())
    records.release()
    const reopened = new RunRecords({ root: f.root, initiative: 'example', hostAuthorized: true })
    expect(checkpointInitiative(reopened, f.authorization(), f.commit, 120)).toEqual(accepted)
    requireInitiativeAcceptance(reopened, f.authorization())
    reopened.release()
    expect(existsSync(join(f.root, '.scratch/example/budget.json'))).toBe(false)
  })

  it.each([
    { ownerReference: '' },
    { commit: 'f'.repeat(40) },
    { inputIdentity: digest('wrong') },
    { outcome: 'passed' },
    { issues: ['unresolved'] },
    { artifacts: [] },
  ])('rejects incomplete or stale external evidence %j', (change) => {
    const f = fixture()
    const { records, evidence } = checkpoint(f)
    expect(() => recordInitiativeResponse(records, { ...evidence, ...change }, 110)).toThrow()
    expect(records.load('initiative-owner.json').status).toBe('awaiting')
    records.release()
  })

  it.each(['unstaged', 'staged', 'committed', 'ignored absent', 'skip-worktree'])(
    'invalidates changed reviewed inputs: %s',
    (kind) => {
      const f = fixture()
      const { records, evidence } = checkpoint(f)
      recordInitiativeResponse(records, evidence, 110)
      if (kind === 'skip-worktree') git(f.root, ['update-index', '--skip-worktree', 'value.txt'])
      writeFileSync(join(f.root, kind === 'ignored absent' ? 'removed.txt' : 'value.txt'), 'changed\n')
      if (kind === 'staged' || kind === 'committed') git(f.root, ['add', '.'])
      if (kind === 'committed') git(f.root, ['commit', '--quiet', '-m', 'test(runner): change reviewed result'])
      expect(() => requireInitiativeAcceptance(records, f.authorization())).toThrow('input changed')
      records.release()
    },
  )

  it('preserves unrelated staged, unstaged and committed owner changes', () => {
    const f = fixture()
    const { records, evidence } = checkpoint(f)
    writeFileSync(join(f.root, 'unrelated.txt'), 'owner staged\n')
    git(f.root, ['add', 'unrelated.txt'])
    writeFileSync(join(f.root, 'another.txt'), 'owner untracked\n')
    const before = git(f.root, ['status', '--porcelain'])
    recordInitiativeResponse(records, evidence, 110)
    requireInitiativeAcceptance(records, f.authorization())
    expect(git(f.root, ['status', '--porcelain'])).toBe(before)
    git(f.root, ['commit', '--quiet', '-m', 'test(runner): preserve unrelated work'])
    requireInitiativeAcceptance(records, f.authorization())
    records.release()
  })

  it('retains rejection without implicitly authorizing repairs and requires renewed acceptance', async () => {
    const f = fixture()
    const { records, state, evidence } = checkpoint(f)
    recordInitiativeResponse(records, { ...evidence, outcome: 'rejected', issues: ['Fix the delivered value'] }, 110)
    expect(() => checkInitiativeRepair(records, f.authorization())).toThrow('explicitly authorized')
    records.save('budget.json', { retained: 'original allowance and recovery history' })
    records.release()
    writeFileSync(
      join(f.root, f.input.planPath),
      readFileSync(join(f.root, f.input.planPath), 'utf8').replace('| Final | Done |', '| Final | Ready |'),
    )
    git(f.root, ['add', '.'])
    git(f.root, ['commit', '--quiet', '-m', 'test(runner): prepare authorized repair'])
    const startingCommit = git(f.root, ['rev-parse', 'HEAD'])
    const ownerReference = 'owner explicitly authorizes scoped repair'
    const repaired = await resolveInitiativeOwner(
      { ...f.input, initiative: 'example', now: () => 120, repairInput: { startingCommit } },
      { ...evidence, outcome: 'repair-authorized', ownerReference },
    )
    const auth = projectApprovedPlan({
      ...f.input,
      startingCommit,
      sourceCommit: startingCommit,
      repairAuthorized: true,
      repairOwnerReference: ownerReference,
    })
    expect(repaired.response.repair.authorization).toBe(auth.identity)
    const reopened = new RunRecords({ root: f.root, initiative: 'example', hostAuthorized: true })
    checkInitiativeRepair(reopened, auth)
    expect(() => requireInitiativeAcceptance(reopened, auth)).toThrow()
    writeFileSync(join(f.root, 'value.txt'), 'repaired\n')
    writeFileSync(
      join(f.root, f.input.planPath),
      readFileSync(join(f.root, f.input.planPath), 'utf8').replace('| Final | Ready |', '| Final | Done |'),
    )
    git(f.root, ['add', '.'])
    git(f.root, ['commit', '--quiet', '-m', 'test(runner): finish scoped repair'])
    const next = checkpointInitiative(reopened, auth, git(f.root, ['rev-parse', 'HEAD']), 130)
    expect(next).toMatchObject({ status: 'awaiting', responseCount: 2, previous: digest(repaired) })
    expect(next.commit).not.toBe(state.commit)
    expect(() => recordInitiativeResponse(reopened, evidence, 140)).toThrow('stale')
    recordInitiativeResponse(reopened, { ...evidence, commit: next.commit, inputIdentity: next.inputIdentity }, 140)
    requireInitiativeAcceptance(reopened, auth)
    expect(reopened.load('owner-response-1.json').response.issues).toEqual(['Fix the delivered value'])
    expect(reopened.load('budget.json')).toEqual({ retained: 'original allowance and recovery history' })
    reopened.release()
  })

  it('fails closed on mismatched response records and interrupted response persistence', () => {
    const f = fixture()
    const { records, evidence } = checkpoint(f)
    const originalSave = records.save.bind(records)
    records.save = (name, value) => {
      if (name === 'initiative-owner.json') throw new Error('synthetic crash')
      originalSave(name, value)
    }
    expect(() => recordInitiativeResponse(records, evidence, 110)).toThrow('synthetic crash')
    records.save = originalSave
    expect(() => recordInitiativeResponse(records, evidence, 120)).toThrow('Unreconciled')
    expect(() => requireInitiativeAcceptance(records, f.authorization())).toThrow('Explicit')
    records.release()
    atomicRecord(join(f.root, '.scratch/example/initiative-owner.json'), { version: 1, status: 'accepted' })
    const reopened = new RunRecords({ root: f.root, initiative: 'example', hostAuthorized: true })
    expect(() => requireInitiativeAcceptance(reopened, f.authorization())).toThrow('Ambiguous')
    reopened.release()
  })

  it('bounds response history and refuses contradictory provenance', () => {
    const f = fixture()
    const { records, state, evidence } = checkpoint(f)
    records.save('initiative-owner.json', { ...state, responseCount: 100 })
    expect(() => recordInitiativeResponse(records, evidence, 110)).toThrow()
    records.save('initiative-owner.json', {
      ...state,
      inputs: [...state.inputs, state.inputs[0]],
      inputIdentity: digest([...state.inputs, state.inputs[0]]),
    })
    expect(() => requireInitiativeAcceptance(records, f.authorization())).toThrow('Duplicate')
    records.release()
  })

  it('bounds reviewed input memory and owner evidence growth', () => {
    const f = fixture()
    const { records, evidence } = checkpoint(f)
    expect(() =>
      recordInitiativeResponse(records, { ...evidence, artifacts: Array(101).fill(evidence.artifacts[0]) }, 110),
    ).toThrow('retention limit')
    expect(() =>
      recordInitiativeResponse(records, { ...evidence, outcome: 'rejected', issues: Array(101).fill('issue') }, 110),
    ).toThrow('Unsupported')
    writeFileSync(join(f.root, 'value.txt'), Buffer.alloc(16 * 1024 * 1024 + 1))
    expect(() => reviewedInputs(f.root, f.commit, ['value.txt'])).toThrow('retention limit')
    records.release()
  })

  it('records explicit owner results through supported host without a budget or child launch', async () => {
    const f = fixture()
    const { records, evidence } = checkpoint(f)
    records.release()
    const accepted = await resolveInitiativeOwner({ ...f.input, initiative: 'example', now: () => 110 }, evidence)
    expect(accepted.status).toBe('accepted')
    expect(existsSync(join(f.root, '.scratch/example/budget.json'))).toBe(false)
    expect(existsSync(join(f.root, '.scratch/initiative-runner.lock'))).toBe(false)
    expect(readRecord(join(f.root, '.scratch/example/owner-response-1.json'))).toEqual(accepted)
  })

  it('retains ownership and leaves approval pending when cleanup is unconfirmed', async () => {
    const f = fixture()
    const { records, evidence } = checkpoint(f)
    records.release()
    await expect(
      resolveInitiativeOwner({ ...f.input, initiative: 'example', confirmQuiescence: async () => false }, evidence),
    ).rejects.toThrow('ownership retained')
    expect(existsSync(join(f.root, '.scratch/initiative-runner.lock'))).toBe(true)
    expect(readRecord(join(f.root, '.scratch/example/initiative-owner.json')).status).toBe('awaiting')
    expect(existsSync(join(f.root, '.scratch/example/budget.json'))).toBe(false)
  })

  it('blocks direct coordinator closure before acceptance and verifies exact relevant paths', () => {
    const f = fixture()
    expect(() => new InitiativeCoordinator({ ...f.input, closureAuthorized: true })).toThrow('acceptance is missing')
    expect(existsSync(join(f.root, '.scratch/example/budget.json'))).toBe(false)
    expect(reviewedInputs(f.root, f.commit, f.execution.initiativeAcceptance.reviewPaths)).toHaveLength(4)
  })

  it('final task commits awaiting status and restarts without inferring owner approval', async () => {
    const f = fixture({ awaiting: false })
    let launches = 0
    f.input.launchPrimary = async ({ records, authorization, onSession, resumeSession, deadlineAt }) => {
      onSession?.('synthetic-primary')
      if (!resumeSession) {
        launches++
        writeFileSync(join(f.root, 'value.txt'), 'final result\n')
        writeFileSync(
          join(f.root, f.input.planPath),
          readFileSync(join(f.root, f.input.planPath), 'utf8')
            .replace(new RegExp(`(\\| ${authorization.contract.taskId} \\|[^\\n]+\\| )Ready( \\|)`), '$1Done$2')
            .replace('Status: **In progress**', 'Status: **Awaiting owner acceptance**'),
        )
        writeFileSync(
          join(f.root, 'plans/README.md'),
          readFileSync(join(f.root, 'plans/README.md'), 'utf8').replace(
            '| In progress |',
            '| Awaiting owner acceptance |',
          ),
        )
      }
      const process = await observeProcess({
        records,
        deadlineAt,
        argv: [globalThis.process.execPath, '-e', 'console.log("synthetic native")'],
      })
      return {
        process,
        native: {
          sessionId: 'synthetic-primary',
          finalMessage: '{"allRequirementsCovered":true,"unresolvedFindings":[]}',
        },
      }
    }
    const result = await executeInitiative(f.input)
    expect(result[0]).toMatchObject({
      advance: false,
      initiativeOwner: { status: 'awaiting' },
      run: { phase: 'completed' },
    })
    const resumed = await executeInitiative(f.input)
    expect(resumed[0].initiativeOwner).toEqual(result[0].initiativeOwner)
    expect(launches).toBe(1)
    expect(git(f.root, ['show', 'HEAD:plans/README.md'])).toContain('Awaiting owner acceptance')
    expect(git(f.root, ['show', 'HEAD:plans/example.md'])).toContain('Status: **Awaiting owner acceptance**')
    const directory = join(f.root, '.scratch/example')
    const before = readRecord(join(directory, 'budget.json'))
    const owned = new RunRecords({ root: f.root, initiative: 'example', hostAuthorized: true })
    writeFileSync(join(owned.path, 'owner.log'), 'Explicit owner rejection and scoped repair\n')
    const artifacts = [owned.artifact(join(owned.path, 'owner.log'))]
    owned.release()
    const evidence = {
      commit: result[0].initiativeOwner.commit,
      inputIdentity: result[0].initiativeOwner.inputIdentity,
      ownerReference: 'owner rejects the delivered result',
      outcome: 'rejected',
      issues: ['Repair value'],
      artifacts,
    }
    await resolveInitiativeOwner({ ...f.input, initiative: 'example' }, evidence)
    const runPath = join(directory, 'run.json')
    const retainedRun = readRecord(runPath)
    // Seed a prior recovery to prove authorization does not clear its history.
    atomicRecord(runPath, { ...retainedRun, recoveryAttempts: 1 })
    writeFileSync(
      join(f.root, f.input.planPath),
      readFileSync(join(f.root, f.input.planPath), 'utf8').replace('| Final | Done |', '| Final | Ready |'),
    )
    git(f.root, ['add', '.'])
    git(f.root, ['commit', '--quiet', '-m', 'test(runner): approve scoped repair task'])
    const repairCommit = git(f.root, ['rev-parse', 'HEAD'])
    const ownerReference = 'owner approves this committed repair scope'
    await resolveInitiativeOwner(
      { ...f.input, initiative: 'example', repairInput: { startingCommit: repairCommit } },
      { ...evidence, outcome: 'repair-authorized', ownerReference },
    )
    const repaired = await executeInitiative({
      ...f.input,
      startingCommit: repairCommit,
      repairAuthorized: true,
      repairOwnerReference: ownerReference,
    })
    expect(repaired[0]).toMatchObject({
      advance: false,
      run: { recoveryAttempts: 1 },
      initiativeOwner: { status: 'awaiting' },
    })
    expect(repaired[0].initiativeOwner.commit).not.toBe(result[0].initiativeOwner.commit)
    expect(readRecord(join(directory, 'budget.json'))).toMatchObject({
      startedAt: before.startedAt,
      deadlineAt: before.deadlineAt,
    })
    expect(readRecord(join(directory, `${retainedRun.runId}-completed.json`)).recoveryAttempts).toBe(1)
    const secondEvidence = {
      ...evidence,
      commit: repaired[0].initiativeOwner.commit,
      inputIdentity: repaired[0].initiativeOwner.inputIdentity,
    }
    await resolveInitiativeOwner({ ...f.input, initiative: 'example' }, secondEvidence)
    writeFileSync(
      join(f.root, f.input.planPath),
      readFileSync(join(f.root, f.input.planPath), 'utf8').replace('| First | Done |', '| First | Ready |'),
    )
    git(f.root, ['add', '.'])
    git(f.root, ['commit', '--quiet', '-m', 'test(runner): authorize earlier task repair'])
    const earlierCommit = git(f.root, ['rev-parse', 'HEAD'])
    const earlierReference = 'owner authorizes only EX-1 repair'
    await resolveInitiativeOwner(
      { ...f.input, initiative: 'example', repairInput: { startingCommit: earlierCommit, taskId: 'EX-1' } },
      { ...secondEvidence, outcome: 'repair-authorized', ownerReference: earlierReference },
    )
    const earlier = await executeInitiative({
      ...f.input,
      taskId: 'EX-1',
      startingCommit: earlierCommit,
      repairAuthorized: true,
      repairOwnerReference: earlierReference,
    })
    expect(earlier).toHaveLength(1)
    expect(earlier[0]).toMatchObject({
      advance: false,
      run: { recoveryAttempts: 1 },
      initiativeOwner: { status: 'awaiting' },
    })
    expect(readRecord(join(directory, 'budget.json')).deadlineAt).toBe(before.deadlineAt)
  }, 30000)
})
