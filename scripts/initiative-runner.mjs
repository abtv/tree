import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { launchPrimary } from './initiative-runner-codex.mjs'
import { digest, observeRepository } from './initiative-runner-git.mjs'
import { checkPlanAuthority, projectApprovedPlan } from './initiative-runner-plan.mjs'
import { observeProcess, StageBlocker } from './initiative-runner-process.mjs'
import { RunRecords } from './initiative-runner-records.mjs'
import {
  awaitingPlan,
  checkpointInitiative,
  checkInitiativeRepair,
  requireInitiativeAcceptance,
} from './initiative-runner-owner.mjs'
import {
  checkpointTask,
  prepareCommit,
  reconcileCommit,
  resumeTask,
  resolveOwnerEvidence,
  startTask,
} from './initiative-runner-state.mjs'

function fail(kind, reason, nextAction) {
  throw new StageBlocker(kind, reason, nextAction)
}

function assessment(message) {
  let value
  try {
    value = JSON.parse(message)
  } catch {
    fail(
      'failure',
      'Missing structured acceptance assessment',
      'Repair the same task and supply explicit requirement coverage/findings',
    )
  }
  if (
    !Array.isArray(value.unresolvedFindings) ||
    value.unresolvedFindings.length ||
    value.allRequirementsCovered !== true
  )
    fail(
      'failure',
      `Unresolved or incomplete acceptance assessment: ${message}`,
      'Repair the same task; preserve findings',
    )
  return { allRequirementsCovered: true, unresolvedFindings: [] }
}

// This API is a host coordinator, NOT a tool available to a child primary.
// Host authorization, native role integration
// and process inspection are explicit inputs. Importing it launches nothing.
export class InitiativeCoordinator {
  constructor(input) {
    this.input = input
    this.now = input.now ?? Date.now
    this.authorization = projectApprovedPlan({ ...input, sourceCommit: input.startingCommit })
    if (typeof input.confirmQuiescence !== 'function' || typeof input.launchConfiguredRole !== 'function')
      fail(
        'capability',
        'Host process inspection and configured native role launcher required',
        'Provide supported host integrations; do not emulate role identity with primary JSON',
      )
    this.records = new RunRecords({ ...input, initiative: this.authorization.contract.initiative })
    this.busy = false
    this.run = null
    try {
      if (this.authorization.contract.closure) requireInitiativeAcceptance(this.records, this.authorization)
      this.budget = this.records.budget({
        now: this.now(),
        budgetMs: this.authorization.contract.budgetMs,
        approvalReference: input.approvalReference,
        allowExpired:
          input.hostResume === true &&
          existsSync(this.records.file('run.json')) &&
          Boolean(this.records.load('run.json').candidate),
      })
      this.startingCommit = input.startingCommit
      if (existsSync(this.records.file('run.json'))) {
        const persisted = this.records.load('run.json')
        if (persisted.authorization !== this.authorization.identity) {
          if (persisted.phase !== 'completed')
            throw new Error('An unfinished task must be reconciled before selecting another')
          if (existsSync(this.records.file('blocker.json'))) {
            const blocker = this.records.load('blocker.json')
            if (!blocker.resolvedAt) fail(blocker.kind, blocker.reason, blocker.nextAction)
          }
          const previous = this.records.load('authorization.json')
          const repairing =
            !this.authorization.contract.closure && existsSync(this.records.file('initiative-owner.json'))
          if (repairing) checkInitiativeRepair(this.records, this.authorization)
          const observed = observeRepository({
            root: this.records.root,
            startingCommit: persisted.startingCommit,
            planPath: previous.contract.planPath,
            taskId: previous.contract.taskId,
            closure: previous.contract.closure,
          })
          if (
            (!repairing && observed.head !== persisted.commit) ||
            observed.indexIdentity !== observed.headIdentity ||
            observed.unstaged.length ||
            observed.untracked.length ||
            observed.workingPlanPresent
          )
            throw new Error('Previous completed task no longer matches clean Git state')
          if (this.startingCommit !== (repairing ? observed.head : persisted.commit))
            throw new Error('Next task must start at the reconciled commit')
          if (
            repairing &&
            this.records.load('initiative-owner.json').response.repair.startingCommit !== this.startingCommit
          )
            throw new Error('Repair starting commit changed')
          this.records.save(`${persisted.runId}-completed.json`, persisted)
          this.priorRecoveryAttempts = repairing ? persisted.recoveryAttempts : 0
        } else {
          if (persisted.phase === 'completed' && input.hostResume !== true)
            throw new Error('Completed task replay refused')
          this.run = persisted
          this.startingCommit = persisted.startingCommit
        }
      }
      this.records.save('authorization.json', this.authorization)
      this.receipts =
        this.run && existsSync(this.records.file('receipts.json')) ? this.records.load('receipts.json') : []
      if (!Array.isArray(this.receipts)) throw new Error('Malformed durable receipt ledger')
      if (this.run && this.run.deadlineAt !== this.budget.deadlineAt)
        throw new Error('Run and budget deadline disagree')
      for (const receipt of this.receipts) {
        if (digest(this.records.load(`${receipt.id}-receipt.json`)) !== digest(receipt))
          throw new Error('Durable receipt ledger disagrees with observed receipt')
        this.records.verifyArtifacts(receipt.artifacts)
      }
      this.observation()
    } catch (error) {
      this.records.release()
      throw error
    }
  }

  observation() {
    return observeRepository({
      root: this.records.root,
      startingCommit: this.startingCommit,
      planPath: this.authorization.contract.planPath,
      taskId: this.authorization.contract.taskId,
      closure: this.authorization.contract.closure,
      nextTask: this.authorization.contract.nextTask,
    })
  }

  checkAuthority() {
    const closure = this.authorization.contract.closure
    checkPlanAuthority(
      { ...this.input, sourceCommit: closure ? this.startingCommit : undefined, candidate: Boolean(this.run) },
      this.authorization,
    )
    if (closure && this.run) {
      requireInitiativeAcceptance(this.records, this.authorization, true)
      const observed = this.observation()
      if (!observed.closureReady) throw new Error('Closure prerequisites changed')
      if (!existsSync(join(this.records.root, this.authorization.contract.planPath))) {
        if (
          (observed.planBlob !== null && observed.planBlob !== this.run.startingPlanBlob) ||
          (this.run.candidate && !observed.closureValid)
        )
          throw new Error('Closure candidate lacks the permitted plan/index deletion')
      } else {
        checkPlanAuthority({ ...this.input, sourceCommit: undefined, candidate: true }, this.authorization)
      }
    }
  }

  beforeCommit(signal) {
    return this.exclusive(async () => {
      if (signal?.aborted) fail('interrupted', 'Stopped before commit', 'Reconcile the same task')
      this.checkAuthority()
      this.records.assertIntegrity()
      if (existsSync(this.records.file('blocker.json'))) {
        const blocker = this.records.load('blocker.json')
        if (!blocker.resolvedAt) fail(blocker.kind, blocker.reason, blocker.nextAction)
      }
      const observed = this.observation()
      const candidate = this.run?.candidate
      if (
        this.run?.phase !== 'executing' ||
        !candidate ||
        candidate.identity !== observed.indexIdentity ||
        candidate.snapshot !== observed.snapshot ||
        candidate.evidence !== digest(this.receipts)
      )
        fail(
          'capability',
          'Prepared candidate or evidence identity changed',
          'Preserve work and reconcile the candidate',
        )
      for (const receipt of this.receipts) {
        if (digest(this.records.load(`${receipt.id}-receipt.json`)) !== digest(receipt))
          throw new Error('Prepared candidate receipt integrity changed')
        this.records.verifyArtifacts(receipt.artifacts)
      }
      const checked = prepareCommit({
        run: { ...this.run, candidate: null },
        authorization: this.authorization,
        observation: observed,
        receipts: this.receipts,
        now: this.now(),
      })
      if (!checked.ready)
        fail(
          'capability',
          `Prepared candidate rejected: ${checked.problems.join('; ')}`,
          'Reconcile retained candidate and evidence before committing',
        )
    })
  }

  async exclusive(operation, checkpointErrors = true) {
    if (this.busy)
      fail(
        'capability',
        'Concurrent coordinator stage refused',
        'Wait for the owned stage to close; reconcile processes',
      )
    this.busy = true
    try {
      this.records.assertOwned()
      this.budget = this.records.budget({
        now: this.now(),
        budgetMs: this.authorization.contract.budgetMs,
        approvalReference: this.input.approvalReference,
      })
      if (
        (await this.input.confirmQuiescence({ root: this.records.root, records: this.records, stage: 'before' })) !==
        true
      )
        fail(
          'capability',
          'Native process quiescence is unconfirmed',
          'Inspect owned and competing processes; preserve unrelated work',
        )
      return await operation()
    } catch (error) {
      if (checkpointErrors) this.block(error)
      throw error
    } finally {
      this.busy = false
    }
  }

  block(error) {
    const blocker = {
      kind: error.kind ?? 'failure',
      reason: error.message,
      nextAction: error.nextAction ?? 'Reconcile and repair the same task within supported permissions',
    }
    this.records.save('blocker.json', {
      ...blocker,
      observedAt: this.now(),
      taskId: this.authorization.contract.taskId,
      details: error.details ?? null,
    })
    if (this.run?.phase === 'executing') {
      this.run = checkpointTask({
        run: this.run,
        authorization: this.authorization,
        observation: this.observation(),
        now: this.now(),
        ...blocker,
      })
      this.records.save('run.json', this.run)
    }
  }

  async confirmed(result, onClean) {
    this.records.assertIntegrity()
    if (
      (await this.input.confirmQuiescence({
        root: this.records.root,
        records: this.records,
        stage: 'after',
        process: result,
      })) !== true
    )
      fail(
        'capability',
        'Owned process cleanup is unconfirmed',
        'Inspect the recorded launch; retain ownership until surviving owned children are resolved',
      )
    onClean?.()
    if (result.blocker) {
      const error = new StageBlocker(
        result.blocker.kind,
        result.blocker.reason,
        'Resolve this blocker through the supported host flow; do not bypass a denial',
      )
      error.details = {
        launchId: result.id,
        argv: result.argv,
        artifacts: result.artifacts,
        role: result.configuredRole ?? null,
        sessionId: result.sessionId ?? null,
        findings: result.finalMessage ?? null,
        commandId: result.commandId ?? null,
      }
      throw error
    }
  }

  primary(signal) {
    return this.exclusive(async () => {
      this.checkAuthority()
      checkInitiativeRepair(this.records, this.authorization)
      const observed = this.observation()
      const recovery =
        this.run && existsSync(this.records.file('blocker.json'))
          ? {
              blocker: this.records.load('blocker.json'),
              observation: observed,
              details: this.records.load('blocker.json').details,
              evidenceDirectory: this.records.root + '/.scratch/' + this.authorization.contract.initiative,
              priorReceipts: structuredClone(this.receipts),
              priorPrimary: existsSync(this.records.file('primary.json')) ? this.records.load('primary.json') : null,
            }
          : null
      if (!this.run && existsSync(this.records.file('blocker.json'))) {
        const blocker = this.records.load('blocker.json')
        if (!blocker.resolvedAt) fail(blocker.kind, blocker.reason, blocker.nextAction)
      }
      // Persist intent before launch. An interrupted launch without a session is
      // a capability checkpoint, never permission to renew budget or relaunch.
      if (existsSync(this.records.file('intent.json'))) {
        const intent = this.records.load('intent.json')
        if (intent.phase === 'launching')
          fail(
            'capability',
            'Interrupted launch intent needs host reconciliation',
            'Inspect retained native logs and owned children before explicitly resolving intent',
          )
      }
      if (this.run?.candidate)
        fail(
          'capability',
          'Validated candidate must be reconciled before another primary',
          'Reconcile the landed commit or retained staged candidate',
        )
      const launchStartedAt = this.now()
      if (this.run) {
        // Validate recovery before creating ANY new native session, including
        // terminal blockers, altered checkpoints and exhausted attempts.
        resumeTask({
          run: this.run,
          authorization: this.authorization,
          observation: observed,
          now: launchStartedAt,
          sessionId: randomUUID(),
        })
        this.records.save(`${randomUUID()}-prior-receipts.json`, this.receipts)
        this.receipts = []
        this.records.save('receipts.json', this.receipts)
      } else {
        startTask({
          authorization: this.authorization,
          observation: observed,
          runId: randomUUID(),
          sessionId: randomUUID(),
          now: launchStartedAt,
          deadlineAt: this.budget.deadlineAt,
        })
        this.records.save('receipts.json', [])
      }
      this.records.save('intent.json', {
        phase: 'launching',
        taskId: this.authorization.contract.taskId,
        observed,
        at: this.now(),
      })
      const output = await (this.input.launchPrimary ?? launchPrimary)({
        records: this.records,
        authorization: this.authorization,
        deadlineAt: this.budget.deadlineAt,
        signal,
        now: this.now,
        recovery,
        onSession: (sessionId) => {
          const recovering = Boolean(this.run)
          this.run = this.run
            ? resumeTask({
                run: this.run,
                authorization: this.authorization,
                observation: observed,
                now: this.now(),
                sessionId,
              })
            : startTask({
                authorization: this.authorization,
                observation: observed,
                runId: randomUUID(),
                sessionId,
                now: launchStartedAt,
                deadlineAt: this.budget.deadlineAt,
              })
          if (!recovering && this.priorRecoveryAttempts) this.run.recoveryAttempts = this.priorRecoveryAttempts
          this.records.save('run.json', this.run)
          if (recovering && existsSync(this.records.file('blocker.json'))) {
            const blocker = this.records.load('blocker.json')
            this.records.save('blocker.json', { ...blocker, resolvedAt: this.now(), recoverySession: sessionId })
          }
        },
      })
      await this.confirmed(output.process, () =>
        this.records.save('intent.json', {
          phase: 'finished',
          sessionId: this.run?.sessionId ?? null,
          process: output.process,
          at: this.now(),
        }),
      )
      if (output.blocker)
        fail(
          output.blocker.kind,
          output.blocker.message ?? output.blocker.reason,
          output.blocker.nextAction ?? 'Inspect supported native output',
        )
      const primary = {
        ...output,
        runId: this.run.runId,
        taskId: this.authorization.contract.taskId,
        snapshot: this.observation().snapshot,
      }
      this.records.save(`${output.process.id}-primary.json`, primary)
      this.records.save('primary.json', primary)
      // Invalid assessments block acceptance but do not falsify observed exits.
      assessment(output.native.finalMessage)
      return output
    })
  }

  acceptance(signal) {
    return this.exclusive(async () => {
      const observed = this.observation()
      const base = this.evidenceBase(observed)
      const output = await (this.input.launchPrimary ?? launchPrimary)({
        records: this.records,
        authorization: this.authorization,
        deadlineAt: this.budget.deadlineAt,
        signal,
        now: this.now,
        resumeSession: this.run.sessionId,
        evidence: { observation: observed, receipts: this.receipts },
      })
      await this.confirmed(output.process)
      if (output.blocker)
        fail(output.blocker.kind, output.blocker.message ?? output.blocker.reason, output.blocker.nextAction)
      if (
        output.native.sessionId !== this.run.sessionId ||
        this.observation().snapshot !== base.snapshot ||
        this.observation().indexIdentity !== base.candidate
      )
        throw new Error('Acceptance resume changed identity or candidate')
      assessment(output.native.finalMessage)
      const primary = {
        ...output,
        runId: this.run.runId,
        taskId: this.authorization.contract.taskId,
        snapshot: base.snapshot,
      }
      this.records.save(`${output.process.id}-primary.json`, primary)
      this.records.save('primary.json', primary)
      return output
    })
  }

  evidenceBase(observed, ownerResolution = false) {
    if (
      !this.run ||
      !(
        this.run.phase === 'executing' ||
        (ownerResolution && this.run.phase === 'blocked' && this.run.blocker?.kind === 'owner')
      ) ||
      this.run.candidate
    )
      throw new Error('No executing task awaiting evidence')
    if (
      observed.head !== this.run.startingCommit ||
      observed.unstaged.length ||
      observed.conflicts.length ||
      observed.unsupported.length ||
      observed.untracked.some((path) => path !== 'WORKING_PLAN.md')
    )
      throw new Error('Evidence requires the exact staged candidate with no unknown work')
    if (observed.changed.some((path) => !this.authorization.contract.files.includes(path)))
      throw new Error('Candidate changes exceed approved plan scope')
    return {
      runId: this.run.runId,
      taskId: this.authorization.contract.taskId,
      snapshot: observed.snapshot,
      candidate: observed.indexIdentity,
    }
  }

  addReceipt(receipt) {
    if (this.receipts.length >= 1000) throw new Error('Receipt retention limit exceeded')
    this.records.verifyArtifacts(receipt.artifacts)
    this.records.save(`${receipt.id}-receipt.json`, receipt)
    this.receipts = this.receipts.filter(
      (previous) =>
        !(
          previous.kind === receipt.kind &&
          (receipt.kind === 'command'
            ? previous.commandId === receipt.commandId
            : receipt.kind === 'role'
              ? previous.role === receipt.role
              : previous.checkId === receipt.checkId)
        ),
    )
    this.receipts.push(receipt)
    this.records.save('receipts.json', this.receipts)
    return receipt
  }

  validation(commandId, signal) {
    return this.exclusive(async () => {
      const command = this.authorization.contract.commands.find((item) => item.id === commandId)
      if (!command) throw new Error('Command is absent from approved plan projection')
      const observed = this.observation()
      const base = this.evidenceBase(observed)
      const result = await observeProcess({
        records: this.records,
        argv: command.argv,
        deadlineAt: this.budget.deadlineAt,
        signal,
        now: this.now,
      })
      await this.confirmed({ ...result, commandId })
      const after = this.observation()
      if (after.snapshot !== observed.snapshot || after.indexIdentity !== observed.indexIdentity)
        throw new Error('Validation changed candidate inputs')
      // Receipt provenance is this actual owned launch, never primary JSON.
      return this.addReceipt({
        ...base,
        id: randomUUID(),
        kind: 'command',
        commandId,
        argv: result.argv,
        exitCode: result.exitCode,
        signal: result.signal,
        status: 'passed',
        finishedAt: result.finishedAt,
        launchId: result.id,
        artifacts: result.artifacts,
      })
    })
  }

  role(role, signal) {
    return this.exclusive(async () => {
      if (!this.authorization.contract.roles.includes(role)) throw new Error('Role is absent from approved plan')
      const observed = this.observation()
      const base = this.evidenceBase(observed)
      for (const command of this.authorization.contract.commands) {
        if (
          !this.receipts.some(
            (receipt) =>
              receipt.commandId === command.id &&
              receipt.snapshot === base.snapshot &&
              receipt.candidate === base.candidate,
          )
        )
          throw new Error('Independent roles run only after candidate validation')
      }
      const configPath = join(this.records.root, '.codex/agents', `${role.replaceAll('_', '-')}.toml`)
      const configurationIdentity = digest(readFileSync(configPath, 'utf8'))
      const contractIdentity = digest(readFileSync(join(this.records.root, 'docs/AGENT_ROLES.md'), 'utf8'))
      const result = await this.input.launchConfiguredRole({
        role,
        configPath,
        configurationIdentity,
        contractIdentity,
        root: this.records.root,
        records: this.records,
        run: this.run,
        authorization: this.authorization,
        observation: observed,
        receipts: structuredClone(this.receipts),
        deadlineAt: this.budget.deadlineAt,
        signal,
      })
      await this.confirmed(result)
      if (
        result.configuredRole !== role ||
        result.configurationIdentity !== configurationIdentity ||
        result.contractIdentity !== contractIdentity ||
        result.sessionSource !== 'native-role-launcher' ||
        typeof result.sessionId !== 'string' ||
        !result.sessionId.trim() ||
        this.run.primarySessions.includes(result.sessionId) ||
        this.receipts.some((receipt) => receipt.kind === 'role' && receipt.sessionId === result.sessionId)
      )
        throw new Error('Missing independent configured native role attribution')
      if (
        role === 'reviewer'
          ? result.runtime?.sandbox !== 'read-only'
          : result.runtime?.sandbox !== 'workspace-write' || result.runtime?.networkAccess !== false
      )
        throw new Error('Native role security contract is not established')
      const expected = role === 'reviewer' ? 'No meaningful issues found' : 'No meaningful product issues found'
      if (result.exitCode !== 0 || result.signal !== null || result.finalMessage?.trim() !== expected) {
        const error = new StageBlocker(
          'failure',
          `Independent role reports unresolved findings or incomplete result: ${result.finalMessage ?? 'Missing final message'}`,
          'Repair the same task using the retained role findings',
        )
        error.details = {
          role,
          sessionId: result.sessionId,
          launchId: result.id,
          findings: result.finalMessage,
          artifacts: result.artifacts,
        }
        throw error
      }
      const after = this.observation()
      if (after.snapshot !== base.snapshot || after.indexIdentity !== base.candidate)
        throw new Error('Role changed candidate inputs')
      return this.addReceipt({
        ...base,
        id: randomUUID(),
        kind: 'role',
        role,
        sessionId: result.sessionId,
        configurationIdentity,
        contractIdentity,
        status: 'passed',
        unresolvedFindings: [],
        usage: result.usage ?? null,
        finishedAt: this.now(),
        artifacts: result.artifacts,
      })
    })
  }

  // Owner checks are recorded only through a separately attributable host
  // interaction. They cannot be provided by primary completion output.
  ownerCheck({ checkId, ownerReference, artifacts }) {
    this.records.assertOwned()
    if (
      this.busy ||
      !this.authorization.contract.ownerChecks.includes(checkId) ||
      typeof ownerReference !== 'string' ||
      !ownerReference.trim()
    )
      throw new Error('Unsupported owner evidence')
    return this.addReceipt({
      ...this.evidenceBase(this.observation()),
      id: randomUUID(),
      kind: 'owner',
      checkId,
      ownerReference,
      artifacts,
      status: 'passed',
      finishedAt: this.now(),
    })
  }

  resolveOwnerCheck(evidence) {
    return this.exclusive(async () => {
      this.checkAuthority()
      this.records.assertIntegrity()
      const observed = this.observation()
      const blocker = this.records.load('blocker.json')
      if (
        this.run?.phase !== 'blocked' ||
        this.run.blocker?.kind !== 'owner' ||
        blocker.kind !== 'owner' ||
        blocker.resolvedAt ||
        this.run.candidate ||
        evidence.outcome !== 'passed' ||
        evidence.runId !== this.run.runId ||
        evidence.snapshot !== observed.snapshot ||
        evidence.candidate !== observed.indexIdentity ||
        observed.snapshot !== this.run.blocker.snapshot ||
        !this.authorization.contract.ownerChecks.includes(evidence.checkId) ||
        typeof evidence.ownerReference !== 'string' ||
        !evidence.ownerReference.trim()
      )
        throw new Error('Unsupported or stale owner resolution evidence')
      const base = this.evidenceBase(observed, true)
      const receipt = this.addReceipt({
        ...base,
        id: randomUUID(),
        kind: 'owner',
        checkId: evidence.checkId,
        ownerReference: evidence.ownerReference,
        artifacts: evidence.artifacts,
        status: 'passed',
        finishedAt: this.now(),
      })
      this.records.save(`${receipt.id}-owner-resolution.json`, { blocker, receipt })
      if (
        this.authorization.contract.ownerChecks.every((checkId) =>
          this.receipts.some(
            (item) =>
              item.kind === 'owner' &&
              item.checkId === checkId &&
              item.snapshot === base.snapshot &&
              item.candidate === base.candidate,
          ),
        )
      ) {
        this.run = resolveOwnerEvidence({
          run: this.run,
          authorization: this.authorization,
          observation: observed,
          receipts: this.receipts,
          now: this.now(),
        })
        this.records.save('run.json', this.run)
        this.records.save('blocker.json', { ...blocker, resolvedAt: this.now(), ownerResolution: receipt.id })
      }
      return receipt
    }, false)
  }

  prepare() {
    this.records.assertOwned()
    if (this.busy) throw new Error('Owned process is still running')
    const observed = this.observation()
    this.checkAuthority()
    const ownerContract = this.authorization.contract.initiativeAcceptance
    if (ownerContract && !this.authorization.contract.closure) {
      const complete = awaitingPlan(this.records.root, ':', this.authorization.contract.planPath, ownerContract)
      if ((!this.authorization.contract.nextTask || this.authorization.contract.initiativeRepair) && !complete)
        throw new Error('Final substantive task requires all initiative prerequisites Done')
      if (complete && this.authorization.contract.nextTask && !this.authorization.contract.initiativeRepair)
        throw new Error('Final substantive result cannot advance to another task')
    }
    const primary = this.records.load('primary.json')
    if (
      primary.runId !== this.run?.runId ||
      primary.taskId !== this.authorization.contract.taskId ||
      primary.native.sessionId !== this.run.sessionId ||
      primary.snapshot !== observed.snapshot
    )
      throw new Error('Stale primary acceptance assessment; resume acceptance on the final candidate')
    const accepted = assessment(primary.native.finalMessage)
    const acceptance = {
      ...this.evidenceBase(observed),
      id: randomUUID(),
      kind: 'acceptance',
      sessionId: primary.native.sessionId,
      status: 'passed',
      finishedAt: this.now(),
      artifacts: primary.process.artifacts,
      ...accepted,
    }
    const receipts = [...this.receipts, acceptance]
    for (const receipt of receipts) this.records.verifyArtifacts(receipt.artifacts)
    const result = prepareCommit({
      run: this.run,
      authorization: this.authorization,
      observation: observed,
      receipts,
      now: this.now(),
    })
    if (result.ready) {
      this.records.save(`${acceptance.id}-receipt.json`, acceptance)
      this.records.save('receipts.json', receipts)
      this.receipts = receipts
      this.records.save('run.json', result.run)
      this.run = result.run
    }
    return result
  }

  // The host makes the append-only commit separately AFTER prepare persisted
  // exact identity. The runner never stages, commits, cleans or rewrites Git.
  reconcile() {
    this.records.assertOwned()
    if (this.busy || !this.run) throw new Error('No quiescent task to reconcile')
    const result = reconcileCommit({
      run: this.run,
      authorization: this.authorization,
      observation: this.observation(),
      now: this.now(),
    })
    this.run = result.run
    this.records.save('run.json', this.run)
    const owner =
      result.run.phase === 'completed'
        ? checkpointInitiative(this.records, this.authorization, result.run.commit, this.now())
        : null
    if (existsSync(this.records.file('blocker.json'))) {
      const blocker = this.records.load('blocker.json')
      if (!blocker.resolvedAt)
        return { ...result, advance: false, problems: [...result.problems, blocker.reason], blocker }
    }
    return owner ? { ...result, advance: false, initiativeOwner: owner } : result
  }

  async close() {
    if (this.busy) throw new Error('Cannot release a running stage')
    if (
      (await this.input.confirmQuiescence({ root: this.records.root, records: this.records, stage: 'release' })) !==
      true
    )
      fail(
        'capability',
        'Process cleanup remains unconfirmed',
        'Retain the lock; inspect only owned processes through the supported host flow',
      )
    this.records.release()
  }
}
