import { boundedExecFileSync as execFileSync, withHostDeadline } from './initiative-runner-deadline.mjs'
import { randomUUID } from 'node:crypto'
import { existsSync, lstatSync, readFileSync, realpathSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { digest } from './initiative-runner-git.mjs'
import {
  confirmQuiescence,
  executeInitiative,
  reconcileClosureWork,
  resolveInitiativeOwner,
} from './initiative-runner-host.mjs'
import { projectApprovedPlan } from './initiative-runner-plan.mjs'
import { readRecord, RunRecords } from './initiative-runner-records.mjs'

const operations = [
  'finish',
  'accepted',
  'rejected',
  'repair-authorized',
  'repair',
  'closure',
  'replay',
  'reconcile-restored',
]
const scenarios = ['accepted', 'repair']
const fixtureDirectory = '.scratch/runner-readiness/rr4/live'

async function releaseProof(records) {
  if (!(await confirmQuiescence({ records, stage: 'release' })))
    throw new Error('Proof cleanup unconfirmed; ownership retained')
  records.release()
}

export function proofArguments(args, manifest, now = Date.now()) {
  if (
    ![4, 5].includes(args.length) ||
    args[0] !== '--authorized-proof' ||
    args[1] !== digest(manifest) ||
    !scenarios.includes(args[2]) ||
    !operations.includes(args[3]) ||
    (args[4] !== undefined && !/^[a-f0-9]{40,64}$/.test(args[4]))
  )
    throw new Error('Exact identity-pinned RR-4 proof arguments required')
  if (
    manifest?.version !== 1 ||
    manifest.fixtureDirectory !== fixtureDirectory ||
    !Number.isSafeInteger(manifest.startedAt) ||
    manifest.startedAt < 0 ||
    !Number.isSafeInteger(manifest.deadlineAt) ||
    manifest.deadlineAt <= manifest.startedAt ||
    manifest.deadlineAt - manifest.startedAt > 45 * 60000 ||
    typeof manifest.approvalReference !== 'string' ||
    !manifest.approvalReference.trim() ||
    manifest.approvalReference.length > 16384 ||
    !scenarios.every((scenario) => /^[a-f0-9]{40,64}$/.test(manifest.seeds?.[scenario]))
  )
    throw new Error('Bounded RR-4 proof approval required')
  if (!Number.isSafeInteger(now) || now < manifest.startedAt || now >= manifest.deadlineAt)
    throw new Error('RR-4 proof allowance unavailable or exhausted')
  return { scenario: args[2], operation: args[3], source: args[4], deadlineAt: manifest.deadlineAt }
}

// The approval window remains active across every stage and child launch. The
// production process adapter owns bounded interruption and cleanup enforcement.
export async function withinProofWindow(deadlineAt, operation, signal) {
  const remaining = deadlineAt - Date.now()
  if (remaining <= 0) throw new Error('RR-4 proof allowance exhausted')
  const controller = new AbortController()
  const abort = () => controller.abort()
  signal?.addEventListener('abort', abort, { once: true })
  if (signal?.aborted) abort()
  const timer = setTimeout(abort, remaining)
  try {
    if (controller.signal.aborted) throw new Error('RR-4 proof interrupted before execution')
    return await operation(controller.signal)
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', abort)
  }
}

export async function executeReadinessProof(repositoryRoot, args, signal) {
  repositoryRoot = realpathSync(repositoryRoot)
  const manifestPath = join(repositoryRoot, '.scratch/runner-readiness/rr4/approved-proof.json')
  const manifestStat = lstatSync(manifestPath)
  if (!manifestStat.isFile() || manifestStat.isSymbolicLink() || manifestStat.size > 65536)
    throw new Error('Bounded regular proof manifest required')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  const { scenario, operation, source, deadlineAt } = proofArguments(args, manifest)
  return withHostDeadline(deadlineAt, async () => {
    const root = join(repositoryRoot, fixtureDirectory, scenario)
    // No alternate cwd, linked worktree, external Git metadata or fixture symlink.
    if (realpathSync(root) !== root || realpathSync(join(root, '.git')) !== join(root, '.git'))
      throw new Error('Proof fixture must own its isolated repository')
    const git = (argv) =>
      execFileSync('git', ['--no-pager', ...argv], {
        cwd: root,
        encoding: 'utf8',
        maxBuffer: 4 * 1024 * 1024,
      }).trim()
    if (
      realpathSync(git(['rev-parse', '--show-toplevel'])) !== root ||
      realpathSync(git(['rev-parse', '--absolute-git-dir'])) !== join(root, '.git')
    )
      throw new Error('External repository metadata is outside proof scope')
    const startingCommit = source ?? git(['rev-parse', 'HEAD'])
    git(['merge-base', '--is-ancestor', manifest.seeds[scenario], startingCommit])
    const input = {
      root,
      planPath: 'plans/synthetic.md',
      taskId: 'SX-3',
      startingCommit,
      approvalReference: manifest.approvalReference,
      hostAuthorized: true,
      singleTask: true,
    }
    // Pin objective, scope, commands, role contract and projection to the reviewed
    // synthetic seed. Ready/Done and awaiting status alone confer no new authority.
    const authority = (commit) => projectApprovedPlan({ ...input, sourceCommit: commit, candidate: true })
    if (authority(startingCommit).identity !== authority(manifest.seeds[scenario]).identity)
      throw new Error('Synthetic proof scope differs from its reviewed seed')
    return withinProofWindow(
      deadlineAt,
      async (boundedSignal) => {
        if (operation === 'reconcile-restored')
          return reconcileClosureWork({
            ...input,
            closureAuthorized: true,
            reconciliationReference:
              'RR-4 authorized restoration of the failed native closure to its exact accepted baseline',
          })
        if (['accepted', 'rejected', 'repair-authorized'].includes(operation)) {
          const records = new RunRecords({ root, initiative: 'synthetic', hostAuthorized: true })
          let evidence
          try {
            if (!(await confirmQuiescence({ records, stage: 'proof-owner-observation' })))
              throw new Error('Proof owner observation requires confirmed cleanup')
            const state = readRecord(records.file('initiative-owner.json'))
            evidence = {
              outcome: operation,
              commit: state.commit,
              inputIdentity: state.inputIdentity,
              ownerReference:
                operation === 'repair-authorized'
                  ? 'RR-4 explicitly simulated exact SX-3 repair authorization'
                  : `RR-4 explicitly simulated ${operation} response`,
              issues: operation === 'rejected' ? ['Exercise scoped repair and renewed acceptance'] : [],
              artifacts: [records.artifact(records.file('owner-proof.log'))],
            }
          } finally {
            await releaseProof(records)
          }
          if (boundedSignal.aborted) throw new Error('RR-4 proof interrupted before owner response')
          return resolveInitiativeOwner(
            {
              ...input,
              initiative: 'synthetic',
              ...(operation === 'repair-authorized' ? { repairInput: { startingCommit } } : {}),
            },
            evidence,
          )
        }
        const result = await executeInitiative({
          ...input,
          signal: boundedSignal,
          ...(['closure', 'replay'].includes(operation) ? { closureAuthorized: true } : {}),
          ...(operation === 'repair'
            ? {
                repairAuthorized: true,
                repairOwnerReference: 'RR-4 explicitly simulated exact SX-3 repair authorization',
              }
            : {}),
        })
        const records = new RunRecords({ root, initiative: 'synthetic', hostAuthorized: true })
        try {
          if (!(await confirmQuiescence({ records, stage: 'independent-proof-inspection' })))
            throw new Error('Independent proof cleanup unconfirmed; ownership retained')
          const proof = {
            result,
            head: git(['rev-parse', 'HEAD']),
            cleanup: true,
            operation,
            manifestIdentity: digest(manifest),
            budget: readRecord(records.file('budget.json')),
            closureBudget: existsSync(records.file('closure-budget.json'))
              ? readRecord(records.file('closure-budget.json'))
              : null,
          }
          records.save(`proof-${operation}-${result[0].run.runId}-${randomUUID()}.json`, proof)
          return proof
        } finally {
          await releaseProof(records)
        }
      },
      signal,
    )
  })
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const controller = new AbortController()
  process.once('SIGINT', () => controller.abort())
  process.once('SIGTERM', () => controller.abort())
  try {
    console.log(
      JSON.stringify(
        await executeReadinessProof(
          resolve(dirname(fileURLToPath(import.meta.url)), '..'),
          process.argv.slice(2),
          controller.signal,
        ),
      ),
    )
  } catch (error) {
    console.error(
      JSON.stringify({
        kind: error.kind ?? 'capability',
        reason: error.message,
        nextAction: error.nextAction ?? 'Preserve evidence; resolve supported approval or cleanup',
      }),
    )
    process.exitCode = 1
  }
}
