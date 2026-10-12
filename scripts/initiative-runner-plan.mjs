import { readFileSync } from 'node:fs'
import { boundedExecFileSync as execFileSync } from './initiative-runner-deadline.mjs'
import { join } from 'node:path'
import { digest, repositoryPath, taskStatus } from './initiative-runner-git.mjs'
import { authorizeTask } from './initiative-runner-state.mjs'

function section(plan, heading) {
  const start = plan.indexOf(`${heading}\n`)
  if (start < 0) throw new Error(`Missing plan section: ${heading}`)
  const rest = plan.slice(start + heading.length + 1)
  const end = rest.search(/^#{1,3} /m)
  return end < 0 ? rest : rest.slice(0, end)
}

// The execution block lives IN the approved plan, never in a second editable
// task specification. Only a separately authorized host calls this function.
export function projectApprovedPlan({
  root,
  planPath,
  taskId,
  approvalReference,
  hostAuthorized,
  candidate = false,
  closureAuthorized = false,
  repairAuthorized = false,
  repairOwnerReference,
  startingCommit,
  sourceCommit,
}) {
  if (hostAuthorized !== true || typeof approvalReference !== 'string' || !approvalReference.trim())
    throw new Error('Separately authorized host launch required')
  repositoryPath(planPath)
  if (
    repairAuthorized &&
    (!/^[a-f0-9]{40,64}$/.test(startingCommit) ||
      typeof repairOwnerReference !== 'string' ||
      !repairOwnerReference.trim() ||
      repairOwnerReference.length > 16384)
  )
    throw new Error('Explicit attributable repair authorization required')
  if (sourceCommit !== undefined && !/^[a-f0-9]{40,64}$/.test(sourceCommit))
    throw new Error('Full committed plan source required')
  const plan = sourceCommit
    ? execFileSync('git', ['--no-pager', 'show', `${sourceCommit}:${planPath}`], {
        cwd: root,
        encoding: 'utf8',
        maxBuffer: 4 * 1024 * 1024,
      })
    : readFileSync(join(root, planPath), 'utf8')
  const blocks = [...plan.matchAll(/```initiative-runner\n([\s\S]*?)\n```/g)]
  if (blocks.length !== 1) throw new Error('Exactly one committed-plan execution projection required')
  const execution = JSON.parse(blocks[0][1])
  if (execution.version !== 1 || execution.tool !== 'codex') throw new Error('Unsupported plan execution contract')
  const taskIds = Object.keys(execution.tasks ?? {})
  if (
    execution.substantiveTaskCount !== undefined &&
    (!Number.isSafeInteger(execution.substantiveTaskCount) || execution.substantiveTaskCount < taskIds.length)
  )
    throw new Error('Invalid retained substantive task count')
  const recordedIds = plan
    .split('\n')
    .map((line) => /^\| ([A-Z][A-Z0-9]*-[0-9]+) \|/.exec(line)?.[1])
    .filter(Boolean)
  const count = Math.max(
    taskIds.length,
    recordedIds.length,
    execution.substantiveTaskCount ?? 0,
    execution.closure?.requiredTasks?.length ?? 0,
  )
  const acceptance = execution.initiativeAcceptance
  if (count >= 3 && !acceptance)
    throw new Error('Qualifying initiative requires explicit final owner acceptance contract')
  if (acceptance) {
    repositoryPath(acceptance.indexPath)
    if (
      !Array.isArray(acceptance.requiredTasks) ||
      !acceptance.requiredTasks.length ||
      new Set(acceptance.requiredTasks).size !== acceptance.requiredTasks.length ||
      !taskIds.every((id) => acceptance.requiredTasks.includes(id)) ||
      !recordedIds.every((id) => acceptance.requiredTasks.includes(id)) ||
      !acceptance.requiredTasks.every((id) => taskIds.includes(id)) ||
      !Array.isArray(acceptance.reviewPaths) ||
      !acceptance.reviewPaths.length ||
      acceptance.reviewPaths.length > 1000 ||
      new Set(acceptance.reviewPaths).size !== acceptance.reviewPaths.length
    )
      throw new Error('Invalid initiative acceptance contract')
    acceptance.reviewPaths.forEach(repositoryPath)
    const requiredPaths = [planPath, acceptance.indexPath, ...taskIds.flatMap((id) => execution.tasks[id].files)]
    if (!requiredPaths.every((path) => acceptance.reviewPaths.includes(path)))
      throw new Error('Acceptance review paths omit delivered inputs')
    if (taskIds.filter((id) => !execution.tasks[id].nextTask).length !== 1)
      throw new Error('Ambiguous final substantive task')
    const finalTask = taskIds.find((id) => !execution.tasks[id].nextTask)
    if (!execution.tasks[finalTask].files.includes(acceptance.indexPath))
      throw new Error('Final task scope must include acceptance index')
    for (const first of taskIds) {
      const seen = new Set()
      let current = first
      while (current) {
        if (seen.has(current) || !taskIds.includes(current)) throw new Error('Invalid initiative task sequence')
        seen.add(current)
        current = execution.tasks[current].nextTask
      }
    }
  }
  const task = execution.tasks?.[taskId]
  const status = taskStatus(plan, taskId)
  if (!task || !(closureAuthorized ? status === 'Done' : status === 'Ready' || (candidate && status === 'Done')))
    throw new Error('Selected approved task is not Ready')
  const taskHeading = plan.split('\n').filter((line) => line.startsWith(`### ${taskId} — `))
  if (taskHeading.length !== 1) throw new Error('Ambiguous task scope')
  const scope = section(plan, taskHeading[0])
  if (closureAuthorized && (!execution.closure || !task.files.includes(execution.closure.indexPath)))
    throw new Error('Explicit final-closure scope must include the plan index')
  const authority = {
    objective: acceptance
      ? section(plan, '## Objective and Authorization').replace(
          /^Status: \*\*(?:In progress|Awaiting owner acceptance)\*\*\.?$/gm,
          'Status: <initiative lifecycle>',
        )
      : section(plan, '## Objective and Authorization'),
    constraints: section(plan, '## Sources and Constraints'),
    scope,
    execution,
  }
  const authorization = authorizeTask({
    approved: true,
    tool: execution.tool,
    initiative: execution.initiative,
    taskId,
    approvalReference,
    scope,
    planPath,
    files: closureAuthorized ? [planPath, execution.closure?.indexPath] : task.files,
    commands: task.commands,
    roles: task.roles,
    ownerChecks: task.ownerChecks,
    budgetMs: execution.budgetMs,
    planAuthority: digest(authority),
    ...(acceptance ? { initiativeAcceptance: acceptance } : {}),
    ...(repairAuthorized ? { initiativeRepair: { startingCommit, ownerReference: repairOwnerReference } } : {}),
    ...(task.nextTask ? { nextTask: task.nextTask } : {}),
    ...(closureAuthorized ? { closure: execution.closure ? { ...execution.closure, approved: true } : null } : {}),
  })
  return authorization
}

export function checkPlanAuthority(input, authorization) {
  const projected = projectApprovedPlan(input)
  if (projected.identity !== authorization.identity) throw new Error('Approved plan scope or execution inputs changed')
  return projected
}
