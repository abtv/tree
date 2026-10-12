import { digest, repositoryPath } from './initiative-runner-git.mjs'

const terminalBlockers = new Set(['permission', 'authentication', 'owner', 'scope', 'capability', 'budget'])
const recoverableBlockers = new Set(['failure', 'interrupted'])
const roles = new Set(['reviewer', 'product_verifier'])

function requireCondition(value, message) {
  if (!value) throw new Error(message)
}

function strings(values) {
  return Array.isArray(values) && values.every((value) => typeof value === 'string' && value.trim().length > 0)
}

function unique(values) {
  return new Set(values).size === values.length
}

function artifacts(values) {
  if (!Array.isArray(values) || values.length === 0) return false
  if (strings(values)) return true // Pure AW-2 gate fixtures; runtime verifies observed artifact descriptors.
  return values.every(
    (value) => value && strings([value.path, value.identity]) && /^sha256:[a-f0-9]{64}$/.test(value.identity),
  )
}

function validObservation(observation) {
  requireCondition(observation && typeof observation.root === 'string', 'Missing repository observation')
  for (const key of ['head', 'startingCommit', 'planPath', 'taskId', 'indexIdentity', 'headIdentity', 'snapshot']) {
    requireCondition(typeof observation[key] === 'string' && observation[key].length > 0, `Missing ${key}`)
  }
  for (const key of ['parents', 'conflicts', 'unsupported', 'unstaged', 'untracked', 'changed']) {
    requireCondition(strings(observation[key]), `Missing ${key} observation`)
  }
  requireCondition(typeof observation.workingPlanPresent === 'boolean', 'Missing working-plan observation')
}

function clean(observation) {
  return (
    observation.indexIdentity === observation.headIdentity &&
    observation.conflicts.length === 0 &&
    observation.unsupported.length === 0 &&
    observation.unstaged.length === 0 &&
    observation.untracked.length === 0 &&
    !observation.workingPlanPresent
  )
}

// The caller is the trusted coordinator. Never populate approval, observations or
// receipts from the implementing agent's completion JSON. AW-3 owns that boundary.
export function authorizeTask(input) {
  requireCondition(input?.approved === true && input.tool === 'codex', 'Explicit Codex authorization required')
  for (const key of ['initiative', 'taskId', 'approvalReference', 'scope']) {
    requireCondition(typeof input[key] === 'string' && input[key].trim().length > 0, `Missing ${key}`)
  }
  requireCondition(/^[A-Z][A-Z0-9]*-[0-9]+$/.test(input.taskId), 'Invalid task ID')
  if (input.nextTask !== undefined)
    requireCondition(
      /^[A-Z][A-Z0-9]*-[0-9]+$/.test(input.nextTask) && input.nextTask !== input.taskId,
      'Invalid next task',
    )
  repositoryPath(input.planPath)
  requireCondition(
    strings(input.files) && input.files.length > 0 && unique(input.files),
    'Explicit task file scope required',
  )
  input.files.forEach(repositoryPath)
  requireCondition(input.files.includes(input.planPath), 'Task scope must include its plan update')
  requireCondition(Array.isArray(input.commands) && input.commands.length > 0, 'Required validation commands missing')
  for (const command of input.commands) {
    requireCondition(typeof command.id === 'string' && command.id.length > 0, 'Missing command ID')
    requireCondition(strings(command.argv) && command.argv.length > 0, 'Validation requires explicit argv')
  }
  requireCondition(unique(input.commands.map((command) => command.id)), 'Duplicate validation ID')
  requireCondition(
    strings(input.roles) && unique(input.roles) && input.roles.every((role) => roles.has(role)),
    'Invalid independent roles',
  )
  requireCondition(strings(input.ownerChecks) && unique(input.ownerChecks), 'Invalid owner check IDs')
  requireCondition(
    Number.isSafeInteger(input.budgetMs) && input.budgetMs > 0,
    'A finite elapsed-time budget is required',
  )
  if (input.closure !== undefined) {
    requireCondition(input.closure?.approved === true, 'Explicit final-closure authorization required')
    requireCondition(
      Number.isSafeInteger(input.closure.budgetMs) &&
        input.closure.budgetMs > 0 &&
        typeof input.closure.approvalReference === 'string' &&
        input.closure.approvalReference.trim().length > 0,
      'Separate approved closure allowance required',
    )
    repositoryPath(input.closure.indexPath)
    requireCondition(input.files.includes(input.closure.indexPath), 'Closure scope must include the plan index')
    requireCondition(
      strings(input.closure.requiredTasks) &&
        input.closure.requiredTasks.length > 0 &&
        unique(input.closure.requiredTasks) &&
        input.closure.requiredTasks.includes(input.taskId),
      'Explicit completed closure prerequisites required',
    )
  }
  const contract = structuredClone(input)
  return { contract, identity: digest(contract) }
}

function bound(run, authorization, observation, now) {
  requireCondition(run?.version === 1, 'Unsupported run record')
  requireCondition(['executing', 'blocked', 'completed'].includes(run.phase), 'Invalid run phase')
  requireCondition(
    strings([run.runId, run.sessionId, run.root, run.startingCommit, run.startingPlanBlob]),
    'Incomplete run identity',
  )
  requireCondition(
    strings(run.primarySessions) && unique(run.primarySessions) && run.primarySessions.includes(run.sessionId),
    'Incomplete primary session history',
  )
  requireCondition(
    Number.isSafeInteger(run.startedAt) &&
      run.startedAt >= 0 &&
      Number.isSafeInteger(run.observedAt) &&
      run.observedAt >= run.startedAt,
    'Invalid run timestamps',
  )
  requireCondition(
    Number.isSafeInteger(run.deadlineAt) &&
      run.deadlineAt > run.startedAt &&
      run.deadlineAt - run.startedAt <= (authorization.contract.closure?.budgetMs ?? authorization.contract.budgetMs),
    'Invalid persisted deadline',
  )
  requireCondition(
    Number.isSafeInteger(run.recoveryAttempts) && run.recoveryAttempts >= 0 && run.recoveryAttempts <= 2,
    'Invalid recovery counter',
  )
  if (run.phase === 'blocked')
    requireCondition(
      run.blocker &&
        strings([run.blocker.kind, run.blocker.reason, run.blocker.snapshot, run.blocker.head]) &&
        (terminalBlockers.has(run.blocker.kind) || recoverableBlockers.has(run.blocker.kind)),
      'Missing blocker checkpoint',
    )
  if (run.candidate !== null)
    requireCondition(
      run.candidate && strings([run.candidate.identity, run.candidate.snapshot, run.candidate.evidence]),
      'Malformed candidate record',
    )
  requireCondition(authorization.identity === digest(authorization.contract), 'Authorization was modified')
  requireCondition(run.authorization === authorization.identity, 'Run belongs to different authorization')
  requireCondition(Number.isSafeInteger(now) && now >= run.startedAt && now >= run.observedAt, 'Clock moved backwards')
  validObservation(observation)
  requireCondition(observation.root === run.root, 'Repository changed')
  requireCondition(observation.startingCommit === run.startingCommit, 'Observation has a different starting commit')
  requireCondition(
    observation.planPath === authorization.contract.planPath && observation.taskId === authorization.contract.taskId,
    'Observation belongs to another plan or task',
  )
}

export function startTask({ authorization, observation, runId, sessionId, now, deadlineAt }) {
  requireCondition(authorization.identity === digest(authorization.contract), 'Authorization was modified')
  validObservation(observation)
  requireCondition(observation.startingCommit === observation.head, 'Start observation must use the current commit')
  requireCondition(
    observation.planPath === authorization.contract.planPath &&
      observation.taskId === authorization.contract.taskId &&
      strings([observation.planBlob]),
    'Observation belongs to another or missing plan/task',
  )
  requireCondition(clean(observation), 'Initial worktree must be clean; reconcile unfinished work first')
  if (authorization.contract.closure)
    requireCondition(
      observation.planStatus === 'Done' && observation.closureReady === true,
      'Closure requires all committed tasks Done',
    )
  else requireCondition(observation.planStatus === 'Ready', 'Committed task must be Ready')
  requireCondition(strings([runId, sessionId]), 'Run and primary session identities required')
  requireCondition(Number.isSafeInteger(now) && now >= 0, 'Invalid start time')
  requireCondition(
    Number.isSafeInteger(deadlineAt) &&
      deadlineAt > now &&
      deadlineAt - now <= (authorization.contract.closure?.budgetMs ?? authorization.contract.budgetMs),
    'Invalid initiative deadline',
  )
  return {
    version: 1,
    phase: 'executing',
    authorization: authorization.identity,
    runId,
    sessionId,
    primarySessions: [sessionId],
    root: observation.root,
    startingCommit: observation.head,
    startingPlanBlob: observation.planBlob,
    startedAt: now,
    observedAt: now,
    deadlineAt,
    recoveryAttempts: 0,
    candidate: null,
    blocker: null,
  }
}

export function checkpointTask({ run, authorization, observation, now, kind, reason }) {
  bound(run, authorization, observation, now)
  requireCondition(run.phase === 'executing', 'Only an executing task can be checkpointed')
  requireCondition(terminalBlockers.has(kind) || recoverableBlockers.has(kind), 'Unknown blocker kind')
  requireCondition(strings([reason]), 'Concrete blocker required')
  return {
    ...run,
    phase: 'blocked',
    observedAt: now,
    blocker: { kind, reason, snapshot: observation.snapshot, head: observation.head },
  }
}

export function resumeTask({ run, authorization, observation, now, sessionId }) {
  bound(run, authorization, observation, now)
  requireCondition(run.phase === 'blocked', 'Only a blocked task can resume')
  requireCondition(now < run.deadlineAt, 'Initiative budget exhausted')
  requireCondition(recoverableBlockers.has(run.blocker.kind), 'Blocker requires external resolution')
  requireCondition(run.recoveryAttempts < 2, 'Recovery attempts exhausted')
  requireCondition(observation.head === run.startingCommit, 'Reconcile a landed or unexpected commit before resuming')
  requireCondition(
    observation.snapshot === run.blocker.snapshot && observation.head === run.blocker.head,
    'Worktree changed since checkpoint; ownership is unknown',
  )
  requireCondition(
    strings([sessionId]) && !run.primarySessions.includes(sessionId),
    'Fresh recovery session identity required',
  )
  return {
    ...run,
    phase: 'executing',
    sessionId,
    primarySessions: [...run.primarySessions, sessionId],
    observedAt: now,
    recoveryAttempts: run.recoveryAttempts + 1,
    candidate: null,
    blocker: null,
  }
}

// External owner evidence resolves this checkpoint without consuming a repair
// attempt or replacing the already validated primary session.
export function resolveOwnerEvidence({ run, authorization, observation, receipts, now }) {
  bound(run, authorization, observation, now)
  requireCondition(run.phase === 'blocked' && run.blocker.kind === 'owner', 'No owner checkpoint to resolve')
  requireCondition(now < run.deadlineAt, 'Initiative budget exhausted')
  requireCondition(
    observation.head === run.startingCommit && observation.snapshot === run.blocker.snapshot,
    'Worktree changed since owner checkpoint',
  )
  requireCondition(
    authorization.contract.ownerChecks.every((checkId) =>
      receipts.some(
        (receipt) =>
          receipt.kind === 'owner' &&
          receipt.checkId === checkId &&
          receipt.status === 'passed' &&
          receipt.runId === run.runId &&
          receipt.taskId === authorization.contract.taskId &&
          receipt.snapshot === observation.snapshot &&
          receipt.candidate === observation.indexIdentity &&
          strings([receipt.ownerReference]) &&
          artifacts(receipt.artifacts),
      ),
    ),
    'Missing owner verification',
  )
  return { ...run, phase: 'executing', blocker: null, observedAt: now }
}

function evidenceProblems(run, authorization, observation, receipts, now) {
  const problems = []
  const contract = authorization.contract
  if (now >= run.deadlineAt) problems.push('Initiative budget exhausted')
  if (observation.head !== run.startingCommit) problems.push('Unexpected commit before candidate approval')
  if (observation.conflicts.length || observation.unsupported.length)
    problems.push('Unmerged index or unsupported Git entries')
  if (observation.unstaged.length || observation.untracked.length || observation.workingPlanPresent)
    problems.push('Candidate must be fully staged with no temporary working plan')
  if (observation.indexIdentity === observation.headIdentity) problems.push('No task change to commit')
  if (contract.closure) {
    if (observation.closureValid !== true || observation.planBlob !== null)
      problems.push('Candidate lacks the explicitly authorized final closure')
  } else if (observation.planStatus !== 'Done' || observation.planBlob === run.startingPlanBlob)
    problems.push('Candidate lacks the task completion plan update')
  if (!contract.closure && observation.planTransitionsValid === false)
    problems.push('Candidate changes unrelated task statuses or scope')
  if (!observation.changed.includes(contract.planPath)) problems.push('Plan update missing from candidate')
  if (observation.changed.some((path) => !contract.files.includes(path)))
    problems.push('Changed paths need scope reconciliation')
  if (!Array.isArray(receipts)) return [...problems, 'Missing coordinator evidence']
  const ids = receipts.map((receipt) => receipt?.id)
  if (!strings(ids) || !unique(ids)) problems.push('Malformed or duplicate evidence IDs')
  for (const receipt of receipts) {
    if (
      !receipt ||
      receipt.runId !== run.runId ||
      receipt.taskId !== contract.taskId ||
      receipt.snapshot !== observation.snapshot ||
      receipt.candidate !== observation.indexIdentity
    ) {
      problems.push('Stale or incorrectly attributed evidence')
      continue
    }
    if (!Number.isSafeInteger(receipt.finishedAt) || receipt.finishedAt < run.startedAt || receipt.finishedAt > now)
      problems.push('Invalid evidence time')
    if (receipt.status !== 'passed' || !artifacts(receipt.artifacts))
      problems.push('Failed, incomplete or unsupported evidence')
    if (!['command', 'role', 'owner', 'acceptance'].includes(receipt.kind)) problems.push('Unknown evidence kind')
  }
  for (const command of contract.commands) {
    const matches = receipts.filter((receipt) => receipt?.kind === 'command' && receipt.commandId === command.id)
    if (
      matches.length !== 1 ||
      digest(matches[0].argv) !== digest(command.argv) ||
      matches[0].exitCode !== 0 ||
      matches[0].signal !== null
    ) {
      problems.push(`Missing successful observed command: ${command.id}`)
    }
  }
  const reviewers = []
  for (const role of contract.roles) {
    const matches = receipts.filter((receipt) => receipt?.kind === 'role' && receipt.role === role)
    const receipt = matches[0]
    if (
      matches.length !== 1 ||
      !strings([receipt.sessionId]) ||
      run.primarySessions.includes(receipt.sessionId) ||
      !Array.isArray(receipt.unresolvedFindings) ||
      receipt.unresolvedFindings.length > 0
    ) {
      problems.push(`Missing independent resolved review: ${role}`)
    } else reviewers.push(receipt.sessionId)
  }
  if (!unique(reviewers)) problems.push('Required independent roles share a session')
  for (const check of contract.ownerChecks) {
    const matches = receipts.filter((receipt) => receipt?.kind === 'owner' && receipt.checkId === check)
    if (matches.length !== 1 || !strings([matches[0].ownerReference]))
      problems.push(`Missing owner verification: ${check}`)
  }
  const acceptance = receipts.filter((receipt) => receipt?.kind === 'acceptance')
  if (
    acceptance.length !== 1 ||
    acceptance[0].sessionId !== run.sessionId ||
    acceptance[0].allRequirementsCovered !== true ||
    !Array.isArray(acceptance[0].unresolvedFindings) ||
    acceptance[0].unresolvedFindings.length > 0
  ) {
    problems.push('Missing primary acceptance assessment')
  }
  return [...new Set(problems)]
}

// A passing command is not semantic acceptance: the separately attributed primary
// assessment and required independent reviews must cover requirements and skips.
export function prepareCommit({ run, authorization, observation, receipts, now }) {
  bound(run, authorization, observation, now)
  requireCondition(run.phase === 'executing' && run.candidate === null, 'Task is not awaiting candidate approval')
  const problems = evidenceProblems(run, authorization, observation, receipts, now)
  if (problems.length) return { ready: false, problems, run }
  return {
    ready: true,
    problems: [],
    run: {
      ...run,
      observedAt: now,
      candidate: { identity: observation.indexIdentity, snapshot: observation.snapshot, evidence: digest(receipts) },
    },
  }
}

export function reconcileCommit({ run, authorization, observation, now }) {
  bound(run, authorization, observation, now)
  requireCondition(run.phase === 'executing' || run.phase === 'blocked', 'Task already completed')
  const problems = []
  if (!run.candidate) problems.push('No validated candidate recorded before commit')
  if (!clean(observation)) problems.push('Worktree is not clean after commit')
  if (
    observation.head === run.startingCommit ||
    observation.parents.length !== 1 ||
    observation.parents[0] !== run.startingCommit
  )
    problems.push('Expected exactly one append-only task commit')
  if (observation.headIdentity !== run.candidate?.identity) problems.push('Commit differs from the validated candidate')
  if (authorization.contract.closure) {
    if (observation.closureValid !== true) problems.push('Committed closure does not match the authorized projection')
  } else if (observation.planStatus !== 'Done') problems.push('Committed plan does not mark the task Done')
  // Reconciliation may record a commit that already landed before a timeout;
  // it never authorizes the next launch or renews the initiative deadline.
  if (problems.length) return { advance: false, problems, run }
  if (run.phase === 'blocked' && run.blocker.kind !== 'interrupted') {
    return {
      advance: false,
      problems: [`Unresolved ${run.blocker.kind} blocker: ${run.blocker.reason}`],
      run: { ...run, observedAt: now, commit: observation.head },
    }
  }
  return {
    advance: now < run.deadlineAt,
    problems: now < run.deadlineAt ? [] : ['Initiative budget exhausted'],
    run: { ...run, phase: 'completed', observedAt: now, commit: observation.head },
  }
}
