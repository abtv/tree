import { boundedExecFileSync as execFileSync } from './initiative-runner-deadline.mjs'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { launchConfiguredRole } from './initiative-runner-codex.mjs'
import { readRecord, RunRecords } from './initiative-runner-records.mjs'
import {
  checkpointInitiative,
  loadInitiativeOwner,
  recordInitiativeRepair,
  recordInitiativeResponse,
} from './initiative-runner-owner.mjs'
import { projectApprovedPlan } from './initiative-runner-plan.mjs'
import { observeProcess, StageBlocker } from './initiative-runner-process.mjs'
import { InitiativeCoordinator } from './initiative-runner.mjs'
import { executePreflight, readPreflightManifest } from './initiative-runner-preflight.mjs'
import { randomUUID } from 'node:crypto'

export { executePreflight } from './initiative-runner-preflight.mjs'

function git(root, args) {
  return execFileSync('git', ['--no-pager', ...args], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  }).trimEnd()
}

// Read-only inspection. Never signal a persisted PID or the shared Codex daemon.
// Ancestors may be the coordinating Codex session. Other native/test workers
// block this host conservatively, including workers from unrelated checkouts.
export async function confirmQuiescence({ records, process: result }) {
  if (existsSync(records.file('native-cleanup.json')) && records.load('native-cleanup.json').confirmed !== true)
    return false
  if (records.children.size || result?.cleanupUnconfirmed) return false
  if (result?.argv?.[0] === 'codex' && result.blocker) return false
  const output = execFileSync('ps', ['-axo', 'pid=,ppid=,command='], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 })
  return processTableQuiescent(output, process.pid)
}

export function processTableQuiescent(output, ownerPid) {
  const rows = output
    .split('\n')
    .map((line) => /^\s*(\d+)\s+(\d+)\s+(.+)$/.exec(line))
    .filter(Boolean)
  if (!rows.some((row) => Number(row[1]) === ownerPid)) return false
  const ancestors = new Set([ownerPid])
  let pid = ownerPid
  while (pid > 1) {
    const row = rows.find((entry) => Number(entry[1]) === pid)
    if (!row || ancestors.has(Number(row[2]))) break
    pid = Number(row[2])
    ancestors.add(pid)
  }
  return !rows.some(
    (row) =>
      !ancestors.has(Number(row[1])) &&
      /codex\s+exec|Electron|playwright|vitest|initiative-runner-host|runner-readiness-proof|\.git\/hooks\/|\.githooks\/|npm\s+(?:test|run\s+(?:build|check))|test:e2e|test:perf|check:full/.test(
        row[3],
      ),
  )
}

function blocked(reason, kind = 'capability') {
  throw new StageBlocker(kind, reason, 'Preserve evidence and work; resolve through the supported outer host flow')
}

function stage(coordinator) {
  if (coordinator.authorization.contract.closure) coordinator.checkAuthority()
  const observed = coordinator.observation()
  const { files } = coordinator.authorization.contract
  if (observed.head !== coordinator.run.startingCommit || observed.conflicts.length || observed.unsupported.length)
    blocked('Candidate Git state cannot be staged')
  if ([...observed.changed, ...observed.unstaged, ...observed.untracked].some((path) => !files.includes(path)))
    blocked('Unknown dirty work blocks candidate staging')
  if (observed.workingPlanPresent) blocked('Primary must finish and remove WORKING_PLAN.md before staging')
  // Literal pathspecs avoid glob expansion; no reset, restore, clean or rewrite.
  git(coordinator.records.root, ['--literal-pathspecs', 'add', '-A', '--', ...files])
  coordinator.evidenceBase(coordinator.observation())
}

function completed(coordinator) {
  if (coordinator.authorization.contract.closure) coordinator.checkAuthority()
  const observed = coordinator.observation()
  if (
    observed.head !== coordinator.run.commit ||
    observed.indexIdentity !== observed.headIdentity ||
    observed.unstaged.length ||
    observed.untracked.length ||
    observed.workingPlanPresent
  )
    blocked('Completed task no longer matches clean reconciled Git state')
  if (existsSync(coordinator.records.file('blocker.json'))) {
    const blocker = coordinator.records.load('blocker.json')
    if (!blocker.resolvedAt) blocked(blocker.reason, blocker.kind)
  }
  const owner = checkpointInitiative(
    coordinator.records,
    coordinator.authorization,
    coordinator.run.commit,
    coordinator.now(),
  )
  return {
    run: coordinator.run,
    advance: !owner && coordinator.now() < coordinator.budget.deadlineAt,
    problems: [],
    ...(owner ? { initiativeOwner: owner } : {}),
  }
}

// No execution on import. Tests inject primary/role adapters only; production
// uses supported native interfaces and the repository's existing configuration.
export async function executeInitiative(input) {
  if (input.hostAuthorized !== true) blocked('Explicit host execution authorization required')
  let selected = { ...input }
  const results = []
  for (;;) {
    const auth = projectApprovedPlan({
      ...selected,
      sourceCommit: selected.startingCommit,
      candidate: !selected.closureAuthorized,
    })
    const directory = join(selected.root, '.scratch', auth.contract.initiative)
    if (existsSync(join(directory, 'authorization.json')) && existsSync(join(directory, 'run.json'))) {
      const previous = readRecord(join(directory, 'authorization.json'))
      const run = readRecord(join(directory, 'run.json'))
      if (previous.identity === auth.identity && previous.contract.taskId === selected.taskId)
        selected.startingCommit = run.startingCommit
    }
    const coordinator = new InitiativeCoordinator({
      ...selected,
      hostResume: true,
      confirmQuiescence: input.confirmQuiescence ?? confirmQuiescence,
      launchConfiguredRole: input.launchConfiguredRole ?? launchConfiguredRole,
    })
    let result
    try {
      for (;;) {
        try {
          if (coordinator.run?.phase === 'completed') {
            result = completed(coordinator)
          } else if (coordinator.run?.candidate) {
            if (coordinator.observation().head === coordinator.run.startingCommit) {
              if (existsSync(coordinator.records.file('blocker.json'))) {
                const blocker = coordinator.records.load('blocker.json')
                if (!blocker.resolvedAt) blocked(blocker.reason, blocker.kind)
              }
              if (coordinator.now() >= coordinator.budget.deadlineAt || input.signal?.aborted)
                blocked('Stopped before commit', 'budget')
              await coordinator.beforeCommit(input.signal)
              const closure = coordinator.authorization.contract.closure
              const commit = await observeProcess({
                records: coordinator.records,
                argv: [
                  'git',
                  '--literal-pathspecs',
                  'commit',
                  ...(closure ? ['--only', ...coordinator.authorization.contract.files] : []),
                  '-m',
                  `chore(initiative): ${closure ? 'close' : 'complete'} ${selected.taskId}`,
                ],
                deadlineAt: coordinator.budget.deadlineAt,
                signal: input.signal,
              })
              await coordinator.confirmed(commit)
            }
            result = coordinator.reconcile()
          } else {
            if (coordinator.run?.phase === 'blocked' && coordinator.run.blocker?.kind === 'owner')
              blocked('Required owner checks need attributable host evidence', 'owner')
            if (
              !coordinator.run ||
              coordinator.run.phase === 'blocked' ||
              !existsSync(coordinator.records.file('primary.json'))
            )
              await coordinator.primary(input.signal)
            stage(coordinator)
            const base = coordinator.evidenceBase(coordinator.observation())
            const current = (receipt) =>
              receipt.snapshot === base.snapshot &&
              receipt.candidate === base.candidate &&
              receipt.runId === base.runId &&
              receipt.taskId === base.taskId &&
              receipt.status === 'passed'
            for (const command of coordinator.authorization.contract.commands)
              if (
                !coordinator.receipts.some(
                  (receipt) => current(receipt) && receipt.kind === 'command' && receipt.commandId === command.id,
                )
              )
                await coordinator.validation(command.id, input.signal)
            for (const role of coordinator.authorization.contract.roles)
              if (
                !coordinator.receipts.some(
                  (receipt) => current(receipt) && receipt.kind === 'role' && receipt.role === role,
                )
              )
                await coordinator.role(role, input.signal)
            if (
              coordinator.authorization.contract.ownerChecks.some(
                (checkId) =>
                  !coordinator.receipts.some(
                    (receipt) => current(receipt) && receipt.kind === 'owner' && receipt.checkId === checkId,
                  ),
              )
            )
              blocked('Required owner checks need attributable host evidence', 'owner')
            await coordinator.acceptance(input.signal)
            const prepared = coordinator.prepare()
            if (!prepared.ready) blocked(prepared.problems.join('; '), 'failure')
            continue
          }
          break
        } catch (error) {
          coordinator.block(error)
          if (
            !coordinator.run ||
            coordinator.run.candidate ||
            !['failure', 'interrupted'].includes(error.kind ?? 'failure') ||
            input.signal?.aborted ||
            coordinator.run.recoveryAttempts >= 2
          )
            throw error
          // primary() rechecks checkpoint ownership, original deadline and
          // recovery count before launching any fresh session.
          await coordinator.primary(input.signal)
        }
      }
    } finally {
      await coordinator.close()
    }
    results.push(result)
    const nextTask = coordinator.authorization.contract.nextTask
    if (!result.advance || !nextTask || input.singleTask === true) return results
    selected = { ...selected, taskId: nextTask, startingCommit: result.run.commit }
  }
}

// Supported outer-host API. Evidence is an explicit owner result, never child
// completion output. This operation does not execute or advance an initiative.
export async function resolveOwnerCheck(input, evidence) {
  if (input.hostAuthorized !== true) blocked('Explicit host execution authorization required')
  const coordinator = new InitiativeCoordinator({
    ...input,
    hostResume: true,
    confirmQuiescence: input.confirmQuiescence ?? confirmQuiescence,
    launchConfiguredRole: input.launchConfiguredRole ?? launchConfiguredRole,
  })
  try {
    return await coordinator.resolveOwnerCheck(evidence)
  } finally {
    await coordinator.close()
  }
}

// An outer host may reconcile a restored failed closure only after the exact
// accepted inputs and unrelated index/worktree baseline match again. Retain the
// old checkpoint before rebinding its snapshot; never reset time or recoveries.
export async function reconcileClosureWork(input) {
  if (input.hostAuthorized !== true || !input.closureAuthorized || !input.reconciliationReference?.trim())
    blocked('Explicit restored-closure reconciliation authorization required')
  const coordinator = new InitiativeCoordinator({
    ...input,
    hostResume: true,
    confirmQuiescence: input.confirmQuiescence ?? confirmQuiescence,
    launchConfiguredRole: input.launchConfiguredRole ?? launchConfiguredRole,
  })
  try {
    const run = coordinator.run
    const observed = coordinator.observation()
    if (
      run?.phase !== 'blocked' ||
      run.candidate ||
      run.blocker?.kind !== 'failure' ||
      run.blocker.reason !== 'Unrelated work changed during closure; preserve work and reconcile' ||
      observed.head !== run.startingCommit ||
      !observed.closureReady ||
      observed.unrelatedIdentity !== run.closureUnrelatedIdentity ||
      coordinator.now() >= coordinator.budget.deadlineAt
    )
      blocked('Restored closure does not match its retained baseline')
    coordinator.checkAuthority()
    if (!(await coordinator.input.confirmQuiescence({ records: coordinator.records, stage: 'closure-reconciliation' })))
      blocked('Restored closure cleanup remains unconfirmed')
    coordinator.records.save(`closure-reconciliation-${randomUUID()}.json`, {
      run,
      blocker: coordinator.records.load('blocker.json'),
      observation: observed,
      reference: input.reconciliationReference,
      observedAt: coordinator.now(),
    })
    coordinator.run = { ...run, blocker: { ...run.blocker, snapshot: observed.snapshot, head: observed.head } }
    coordinator.records.save('run.json', coordinator.run)
    return coordinator.run
  } finally {
    await coordinator.close()
  }
}

// Post-commit owner decisions are deliberately independent of task receipts and
// budget construction. The authorized outer host supplies the owner's words.
export async function resolveInitiativeOwner(input, evidence) {
  if (input.hostAuthorized !== true) blocked('Explicit host execution authorization required')
  const records = new RunRecords(input)
  const inspect = input.confirmQuiescence ?? confirmQuiescence
  try {
    if ((await inspect({ records, root: records.root, stage: 'owner-response' })) !== true)
      blocked('Owner response requires confirmed process cleanup')
    records.waitingBudget(loadInitiativeOwner(records), (input.now ?? Date.now)())
    if (evidence.outcome === 'repair-authorized') {
      const repair = projectApprovedPlan({
        ...input,
        ...input.repairInput,
        hostAuthorized: true,
        repairAuthorized: true,
        repairOwnerReference: evidence.ownerReference,
        sourceCommit: input.repairInput?.startingCommit,
      })
      return recordInitiativeRepair(
        records,
        repair,
        evidence,
        (input.now ?? Date.now)(),
        input.repairInput?.startingCommit,
      )
    }
    if (evidence.repair) blocked('Use separate repair-authorized response with committed repair scope', 'scope')
    return recordInitiativeResponse(records, evidence, (input.now ?? Date.now)())
  } finally {
    if ((await inspect({ records, root: records.root, stage: 'release' })) !== true)
      blocked('Owner response cleanup remains unconfirmed; ownership retained')
    records.release()
  }
}

export function hostArguments(args) {
  if (args.length === 5 && args[0] === '--authorized-preflight') {
    return {
      root: resolve(args[1]),
      manifestPath: args[2],
      manifestIdentity: args[3],
      approvalReference: args[4],
      preflightAuthorized: true,
    }
  }
  if (args.length !== 6 || !['--authorized-plan', '--authorized-closure'].includes(args[0]))
    throw new Error(
      'Expected --authorized-plan or --authorized-closure <root> <planPath> <taskId> <startingCommit> <approvalReference>',
    )
  return {
    root: resolve(args[1]),
    planPath: args[2],
    taskId: args[3],
    startingCommit: args[4],
    approvalReference: args[5],
    hostAuthorized: true,
    ...(args[0] === '--authorized-closure' ? { closureAuthorized: true, singleTask: true } : {}),
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const controller = new AbortController()
  process.once('SIGINT', () => controller.abort())
  process.once('SIGTERM', () => controller.abort())
  try {
    const input = { ...hostArguments(process.argv.slice(2)), signal: controller.signal }
    const result = input.preflightAuthorized
      ? await executePreflight({
          ...input,
          manifest: readPreflightManifest(input.root, input.manifestPath),
          confirmQuiescence,
        })
      : await executeInitiative(input)
    console.log(JSON.stringify(result))
  } catch (error) {
    console.error(
      JSON.stringify({
        kind: error.kind ?? 'capability',
        reason: error.message,
        nextAction: error.nextAction ?? 'Inspect retained evidence; do not bypass a denial',
      }),
    )
    process.exitCode = 1
  }
}
