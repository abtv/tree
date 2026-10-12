import { boundedExecFileSync as execFileSync } from './initiative-runner-deadline.mjs'
import { existsSync, lstatSync, readFileSync, realpathSync } from 'node:fs'
import { join, posix } from 'node:path'
import { digest, repositoryPath, taskStatus } from './initiative-runner-git.mjs'

function git(root, args) {
  return execFileSync('git', ['--no-pager', '-c', 'core.fsmonitor=false', ...args], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024,
    env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' },
  }).trimEnd()
}

function text(value) {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 16384
}

function ownerArtifacts(records, artifacts) {
  if (!Array.isArray(artifacts) || artifacts.length > 100) throw new Error('Owner artifact retention limit exceeded')
  records.verifyArtifacts(artifacts)
}

function valid(value) {
  if (
    value?.version !== 1 ||
    !['awaiting', 'accepted', 'rejected'].includes(value.status) ||
    !/^[a-f0-9]{40,64}$/.test(value.commit) ||
    !text(value.initiative) ||
    !Array.isArray(value.inputs) ||
    !value.inputs.length ||
    value.inputs.length > 1000 ||
    value.inputIdentity !== digest(value.inputs) ||
    !text(value.contractIdentity) ||
    !Number.isSafeInteger(value.observedAt) ||
    value.observedAt < 0 ||
    !Number.isSafeInteger(value.responseCount) ||
    value.responseCount < 0 ||
    value.responseCount > 100
  )
    throw new Error('Ambiguous or unsupported initiative owner record')
  for (const input of value.inputs) {
    repositoryPath(input.path)
    if (input.entry !== null && !/^100(?:644|755) [a-f0-9]{40,64}$/.test(input.entry))
      throw new Error('Invalid reviewed file identity')
  }
  if (new Set(value.inputs.map((item) => item.path)).size !== value.inputs.length)
    throw new Error('Duplicate reviewed input')
  if (value.status !== 'awaiting' && (!text(value.response?.ownerReference) || !Array.isArray(value.response.issues)))
    throw new Error('Missing attributable owner response')
  return value
}

export function loadInitiativeOwner(records) {
  const state = valid(records.load('initiative-owner.json'))
  if (
    state.status === 'awaiting' &&
    state.responseCount > 0 &&
    digest(records.load(`owner-response-${state.responseCount}.json`)) !== state.previous
  )
    throw new Error('Awaiting result lost its prior owner response history')
  if (state.status !== 'awaiting') {
    if (digest(records.load(`owner-response-${state.responseCount}.json`)) !== digest(state))
      throw new Error('Owner response ledger disagrees with initiative state')
    ownerArtifacts(records, state.response.artifacts)
    if (state.response.repair) ownerArtifacts(records, state.response.repair.artifacts)
  }
  return state
}

// Compare only explicitly reviewed paths. Unrelated owner changes are neither
// included in acceptance nor modified by this read-only operation.
const loadState = loadInitiativeOwner

export function reviewedInputs(root, commit, paths) {
  if (!/^[a-f0-9]{40,64}$/.test(commit)) throw new Error('Full delivered commit required')
  git(root, ['cat-file', '-e', `${commit}^{commit}`])
  const head = git(root, ['rev-parse', 'HEAD'])
  git(root, ['merge-base', '--is-ancestor', commit, head])
  return paths.map((path) => {
    repositoryPath(path)
    const treeEntry = (source) => {
      const raw = git(root, ['--literal-pathspecs', 'ls-tree', source, '--', path])
      if (!raw) return null
      const match = /^(100644|100755) blob ([a-f0-9]{40,64})\t/.exec(raw)
      if (!match) throw new Error('Reviewed input must be a regular file')
      return `${match[1]} ${match[2]}`
    }
    const entry = treeEntry(commit)
    const absolute = join(root, path)
    let worktreeMatches = !existsSync(absolute)
    if (entry !== null) {
      const stat = lstatSync(absolute)
      if (stat.size > 16 * 1024 * 1024) throw new Error('Reviewed input exceeds retention limit')
      worktreeMatches =
        stat.isFile() &&
        !stat.isSymbolicLink() &&
        realpathSync(absolute) === absolute &&
        (stat.mode & 0o111 ? '100755' : '100644') === entry.split(' ')[0] &&
        digest(readFileSync(absolute).toString('base64')) ===
          digest(
            execFileSync('git', ['cat-file', 'blob', entry.split(' ')[1]], {
              cwd: root,
              maxBuffer: 16 * 1024 * 1024,
            }).toString('base64'),
          )
    } else {
      try {
        lstatSync(absolute)
        worktreeMatches = false
      } catch (error) {
        if (error.code !== 'ENOENT') throw error
      }
    }
    const indexed = git(root, ['--literal-pathspecs', 'ls-files', '--stage', '-z', '--', path])
    const expected = entry === null ? '' : `${entry} 0\t${path}\0`
    if (
      !worktreeMatches ||
      treeEntry(head) !== entry ||
      indexed !== expected ||
      git(root, ['--literal-pathspecs', 'diff', '--no-ext-diff', '--no-textconv', '--name-only', '--', path]) ||
      git(root, ['--literal-pathspecs', 'ls-files', '--others', '--exclude-standard', '--', path])
    )
      throw new Error(`Reviewed initiative input changed: ${path}`)
    return { path, entry }
  })
}

export function awaitingPlan(root, source, planPath, contract) {
  const prefix = source === ':' ? ':' : `${source}:`
  const plan = git(root, ['show', `${prefix}${planPath}`])
  if (!contract.requiredTasks.every((id) => taskStatus(plan, id) === 'Done')) return false
  const index = git(root, ['show', `${prefix}${contract.indexPath}`])
  const target = posix.relative(posix.dirname(contract.indexPath), planPath)
  const rows = index.split('\n').filter((line) => line.startsWith('|') && line.includes(`](${target})`))
  if (
    !/^Status: \*\*Awaiting owner acceptance\*\*\.?$/m.test(plan) ||
    rows.length !== 1 ||
    !rows[0].split('|').some((cell) => cell.trim() === 'Awaiting owner acceptance')
  )
    throw new Error('Final result must retain plan and index as Awaiting owner acceptance')
  return true
}

export function checkpointInitiative(records, authorization, commit, now) {
  if (!Number.isSafeInteger(now) || now < 0) throw new Error('Invalid initiative checkpoint time')
  const contract = authorization.contract.initiativeAcceptance
  if (
    !contract ||
    authorization.contract.closure ||
    !awaitingPlan(records.root, commit, authorization.contract.planPath, contract)
  )
    return null
  const inputs = reviewedInputs(records.root, commit, contract.reviewPaths)
  const previous = existsSync(records.file('initiative-owner.json')) ? loadState(records) : null
  if (previous && now < previous.observedAt) throw new Error('Initiative owner clock moved backwards')
  if (previous?.commit === commit) {
    if (previous.inputIdentity !== digest(inputs) || previous.contractIdentity !== digest(contract))
      throw new Error('Initiative acceptance checkpoint changed')
    return previous
  }
  if (
    previous &&
    (previous.status !== 'rejected' || previous.response.repair?.authorization !== authorization.identity)
  )
    throw new Error('New result requires explicitly authorized repair')
  const value = {
    version: 1,
    initiative: authorization.contract.initiative,
    status: 'awaiting',
    commit,
    inputs,
    inputIdentity: digest(inputs),
    contractIdentity: digest(contract),
    observedAt: now,
    responseCount: previous?.responseCount ?? 0,
    previous: previous ? digest(previous) : null,
  }
  records.save('initiative-owner.json', value)
  return value
}

export function requireInitiativeAcceptance(records, authorization, closureCandidate = false) {
  const contract = authorization.contract.initiativeAcceptance
  if (!contract) {
    if (existsSync(records.file('initiative-owner.json'))) throw new Error('Initiative owner contract is missing')
    return
  }
  if (!existsSync(records.file('initiative-owner.json'))) throw new Error('Final owner acceptance is missing')
  const state = loadState(records)
  if (state.initiative !== authorization.contract.initiative || state.contractIdentity !== digest(contract))
    throw new Error('Initiative owner contract changed')
  const paths = closureCandidate
    ? contract.reviewPaths.filter((path) => path !== authorization.contract.planPath && path !== contract.indexPath)
    : contract.reviewPaths
  const inputs = reviewedInputs(records.root, state.commit, paths)
  const expected = state.inputs.filter((input) => paths.includes(input.path))
  if (state.status !== 'accepted' || digest(inputs) !== digest(expected))
    throw new Error('Explicit final owner acceptance required before closure')
}

export function checkInitiativeRepair(records, authorization) {
  if (!existsSync(records.file('initiative-owner.json'))) return
  const state = loadState(records)
  if (authorization.contract.closure) return requireInitiativeAcceptance(records, authorization)
  if (
    state.status !== 'rejected' ||
    state.response.repair?.authorization !== authorization.identity ||
    state.response.repair?.taskId !== authorization.contract.taskId
  )
    throw new Error('Only explicitly authorized initiative repairs may execute')
  return state
}

export function recordInitiativeRepair(records, authorization, evidence, now, startingCommit) {
  const state = loadState(records)
  if (
    state.status !== 'rejected' ||
    !text(evidence?.ownerReference) ||
    evidence.commit !== state.commit ||
    evidence.inputIdentity !== state.inputIdentity ||
    state.responseCount >= 100 ||
    !Number.isSafeInteger(now) ||
    now < state.observedAt ||
    authorization.contract.initiative !== state.initiative ||
    authorization.contract.closure ||
    authorization.contract.initiativeRepair?.ownerReference !== evidence.ownerReference ||
    authorization.contract.initiativeRepair?.startingCommit !== startingCommit ||
    !authorization.contract.initiativeAcceptance ||
    digest(authorization.contract.initiativeAcceptance) !== state.contractIdentity ||
    !/^[a-f0-9]{40,64}$/.test(startingCommit) ||
    git(records.root, ['rev-parse', 'HEAD']) !== startingCommit
  )
    throw new Error('Unsupported initiative repair authorization')
  git(records.root, ['merge-base', '--is-ancestor', state.commit, startingCommit])
  reviewedInputs(records.root, startingCommit, authorization.contract.initiativeAcceptance.reviewPaths)
  ownerArtifacts(records, evidence.artifacts)
  const repair = {
    ownerReference: evidence.ownerReference,
    taskId: authorization.contract.taskId,
    authorization: authorization.identity,
    startingCommit,
    artifacts: evidence.artifacts,
  }
  const value = {
    ...state,
    observedAt: now,
    responseCount: state.responseCount + 1,
    response: { ...state.response, repair },
  }
  if (existsSync(records.file(`owner-response-${value.responseCount}.json`)))
    throw new Error('Unreconciled owner response record')
  records.save(`owner-response-${value.responseCount}.json`, value)
  records.save('initiative-owner.json', value)
  return value
}

export function recordInitiativeResponse(records, evidence, now) {
  const state = loadState(records)
  if (
    state.status !== 'awaiting' ||
    !['accepted', 'rejected'].includes(evidence?.outcome) ||
    evidence.commit !== state.commit ||
    evidence.inputIdentity !== state.inputIdentity ||
    !text(evidence.ownerReference) ||
    !Number.isSafeInteger(now) ||
    now < state.observedAt ||
    state.responseCount >= 100 ||
    !Array.isArray(evidence.issues) ||
    evidence.issues.length > 100 ||
    !evidence.issues.every(text) ||
    (evidence.outcome === 'rejected' ? !evidence.issues.length : evidence.issues.length)
  )
    throw new Error('Unsupported or stale final owner response')
  const inputs = reviewedInputs(
    records.root,
    state.commit,
    state.inputs.map((item) => item.path),
  )
  if (digest(inputs) !== state.inputIdentity) throw new Error('Reviewed initiative inputs changed')
  ownerArtifacts(records, evidence.artifacts)
  if (evidence.repair) throw new Error('Separate committed repair authorization required')
  const response = {
    ownerReference: evidence.ownerReference,
    issues: evidence.issues,
    artifacts: evidence.artifacts,
    repair: evidence.repair ?? null,
  }
  const value = {
    ...state,
    status: evidence.outcome,
    response,
    observedAt: now,
    responseCount: state.responseCount + 1,
  }
  if (existsSync(records.file(`owner-response-${value.responseCount}.json`)))
    throw new Error('Unreconciled owner response record')
  records.save(`owner-response-${value.responseCount}.json`, value)
  records.save('initiative-owner.json', value)
  return value
}
