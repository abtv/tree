import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
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
  sourceCommit,
}) {
  if (hostAuthorized !== true || typeof approvalReference !== 'string' || !approvalReference.trim())
    throw new Error('Separately authorized host launch required')
  repositoryPath(planPath)
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
  const task = execution.tasks?.[taskId]
  const status = taskStatus(plan, taskId)
  if (!task || !(closureAuthorized ? status === 'Done' : status === 'Ready' || (candidate && status === 'Done')))
    throw new Error('Selected approved task is not Ready')
  const taskHeading = plan.split('\n').filter((line) => line.startsWith(`### ${taskId} — `))
  if (taskHeading.length !== 1) throw new Error('Ambiguous task scope')
  const scope = section(plan, taskHeading[0])
  const authority = {
    objective: section(plan, '## Objective and Authorization'),
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
    files: task.files,
    commands: task.commands,
    roles: task.roles,
    ownerChecks: task.ownerChecks,
    budgetMs: execution.budgetMs,
    planAuthority: digest(authority),
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
