import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { launchConfiguredRole } from './initiative-runner-codex.mjs'
import { readRecord } from './initiative-runner-records.mjs'
import { projectApprovedPlan } from './initiative-runner-plan.mjs'
import { StageBlocker } from './initiative-runner-process.mjs'
import { InitiativeCoordinator } from './initiative-runner.mjs'

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
      /codex\s+exec|Electron|playwright|initiative-runner-host|test:e2e|test:perf|check:full/.test(row[3]),
  )
}

function blocked(reason, kind = 'capability') {
  throw new StageBlocker(kind, reason, 'Preserve evidence and work; resolve through the supported outer host flow')
}

function stage(coordinator) {
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
  return { run: coordinator.run, advance: coordinator.now() < coordinator.budget.deadlineAt, problems: [] }
}

// No execution on import. Tests inject primary/role adapters only; production
// uses supported native interfaces and the repository's existing configuration.
export async function executeInitiative(input) {
  if (input.hostAuthorized !== true) blocked('Explicit host execution authorization required')
  let selected = { ...input }
  const results = []
  for (;;) {
    const auth = projectApprovedPlan({ ...selected, sourceCommit: selected.startingCommit })
    const directory = join(selected.root, '.scratch', auth.contract.initiative)
    if (existsSync(join(directory, 'authorization.json')) && existsSync(join(directory, 'run.json'))) {
      const previous = readRecord(join(directory, 'authorization.json'))
      const run = readRecord(join(directory, 'run.json'))
      if (previous.contract.taskId === selected.taskId) selected.startingCommit = run.startingCommit
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
              git(selected.root, ['commit', '-m', `chore(initiative): complete ${selected.taskId}`])
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

export function hostArguments(args) {
  if (args.length !== 6 || args[0] !== '--authorized-plan')
    throw new Error('Expected --authorized-plan <root> <planPath> <taskId> <startingCommit> <approvalReference>')
  return {
    root: resolve(args[1]),
    planPath: args[2],
    taskId: args[3],
    startingCommit: args[4],
    approvalReference: args[5],
    hostAuthorized: true,
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const controller = new AbortController()
  process.once('SIGINT', () => controller.abort())
  process.once('SIGTERM', () => controller.abort())
  try {
    console.log(
      JSON.stringify(await executeInitiative({ ...hostArguments(process.argv.slice(2)), signal: controller.signal })),
    )
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
