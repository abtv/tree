import { StringDecoder } from 'node:string_decoder'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { roleSettings } from './initiative-launch.mjs'
import { digest } from './initiative-runner-git.mjs'
import { classifyFailure, observeProcess, StageBlocker } from './initiative-runner-process.mjs'

export function codexPrimaryArgv(root) {
  // No unrestricted flags, approval bypasses, profiles, role overrides, auth
  // relocation, alternate tool/model or ignored rules. Existing config applies.
  return ['codex', 'exec', '--json', '--cd', root, '--sandbox', 'workspace-write', '-']
}

export function codexResumeArgv(root, sessionId) {
  if (typeof sessionId !== 'string' || !/^[a-zA-Z0-9-]+$/.test(sessionId))
    throw new Error('Explicit native session required')
  return ['codex', 'exec', '--json', '--cd', root, '--sandbox', 'workspace-write', 'resume', sessionId, '-']
}

export class CodexEvents {
  constructor() {
    this.decoder = new StringDecoder('utf8')
    this.buffer = ''
    this.sessionId = null
    this.usage = null
    this.finalMessage = null
    this.failure = null
    this.completed = false
    this.count = 0
    this.commands = []
  }

  push(chunk) {
    this.buffer += this.decoder.write(chunk)
    if (Buffer.byteLength(this.buffer) > 1024 * 1024) throw new Error('Native event line exceeds retention limit')
    let newline
    while ((newline = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, newline)
      this.buffer = this.buffer.slice(newline + 1)
      if (line.trim()) this.event(JSON.parse(line))
    }
  }

  event(event) {
    if (++this.count > 10000) throw new Error('Native event count exceeds retention limit')
    if (!event || typeof event.type !== 'string') throw new Error('Malformed native event')
    if (event.type === 'thread.started') {
      if (this.sessionId || typeof event.thread_id !== 'string' || !event.thread_id.trim())
        throw new Error('Ambiguous native session identity')
      this.sessionId = event.thread_id
      return
    }
    if (!this.sessionId) throw new Error('Native events precede session identity')
    if (this.completed) throw new Error('Native events after completed turn')
    if (event.type === 'turn.completed') {
      if (
        !event.usage ||
        ['input_tokens', 'cached_input_tokens', 'output_tokens'].some(
          (key) => !Number.isSafeInteger(event.usage[key]) || event.usage[key] < 0,
        )
      )
        throw new Error('Malformed native usage')
      this.usage = event.usage
      this.completed = true
    } else if (event.type === 'turn.failed' || event.type === 'error') {
      this.failure = event.error?.message ?? event.message ?? 'Native turn failed'
    } else if (event.type === 'item.completed') {
      if (event.item?.type === 'agent_message') {
        if (typeof event.item.text !== 'string' || Buffer.byteLength(event.item.text) > 256 * 1024)
          throw new Error('Malformed final message')
        this.finalMessage = event.item.text
      } else if (event.item?.type === 'command_execution') {
        if (this.commands.length >= 1000) throw new Error('Native command retention limit exceeded')
        this.commands.push(event.item)
      }
    }
    // Progress/item types are retained in raw output; their existence does not
    // establish nested role identity or successful coordinator validation.
  }

  finish() {
    this.buffer += this.decoder.end()
    if (this.buffer.trim()) throw new Error('Truncated native JSON stream')
    if (!this.sessionId || !this.completed || !this.finalMessage || this.failure)
      throw new Error(this.failure ?? 'Incomplete native turn')
    return { sessionId: this.sessionId, usage: this.usage, finalMessage: this.finalMessage, commands: this.commands }
  }
}

export function primaryPrompt({ authorization, resumeSession, evidence, recovery }) {
  const contract = authorization.contract
  return [
    `You are the fresh primary for ${authorization.contract.initiative} ${authorization.contract.taskId} only.`,
    'Read AGENTS.md, WORKING_PLAN.md if present, the selected approved plan and relevant development instructions.',
    `Plan: ${authorization.contract.planPath}. Approval: ${authorization.contract.approvalReference}.`,
    `Authorized scope:\n${authorization.contract.scope}`,
    'Own source/test/doc edits only. Use native file-edit tools. Preserve existing work and permission boundaries.',
    'The separately authorized host coordinator owns validation, configured independent role launches and commit gates.',
    'Do not launch validation, Electron/performance tests, nested roles, another primary, or Git commits.',
    'Do not change permissions, trust, authentication, tool/model, or use unrestricted flags. A denial blocks its stage.',
    ...(authorization.contract.closure
      ? [
          'This is explicitly authorized final closure. Authority is the original committed plan; preserve the permitted plan deletion and remove only its index entry after completed prerequisites. Do not recreate the plan to infer authority.',
        ]
      : [
          'Leave a reviewable candidate. When complete, update only the selected task to Done and the projected nextTask from Planned to Ready. Remove WORKING_PLAN.md after preserving useful context in durable owners; the host gates these provisional labels before committing. Do not execute another task.',
          ...(contract.initiativeAcceptance && (!contract.nextTask || contract.initiativeRepair)
            ? [
                'After all initiativeAcceptance.requiredTasks are Done, retain the plan with the exact line Status: **Awaiting owner acceptance** and its index row with status Awaiting owner acceptance. Final owner acceptance is a separate post-commit outer-host decision; do not claim it or retire the plan.',
              ]
            : []),
          ...(contract.initiativeRepair
            ? [
                'This is only the exact owner-authorized repair task. Preserve completed neighbouring tasks; do not advance to nextTask. Its delivered result requires renewed final owner acceptance.',
              ]
            : []),
        ]),
    'Return only JSON: {"allRequirementsCovered":true,"unresolvedFindings":[]}, listing actual findings or false coverage when incomplete. This assessment is not validation evidence.',
    ...(recovery
      ? [`Same-task repair context (retain findings and unfinished work): ${JSON.stringify(recovery)}`]
      : []),
    ...(resumeSession
      ? [
          'This resumes acceptance of the SAME unfinished task. Inspect the final staged candidate and supplied observed evidence; make no edits, commits, test or role launches.',
          `Coordinator evidence: ${JSON.stringify(evidence)}`,
        ]
      : []),
  ].join('\n\n')
}

export async function launchPrimary({
  records,
  authorization,
  deadlineAt,
  signal,
  now,
  onSession,
  resumeSession,
  evidence,
  recovery,
  preflightPrompt,
}) {
  const events = new CodexEvents()
  records.save('native-cleanup.json', { confirmed: false, stage: resumeSession ? 'acceptance' : 'primary' })
  const input = preflightPrompt ?? primaryPrompt({ authorization, resumeSession, evidence, recovery })
  const process = await observeProcess({
    records,
    argv: resumeSession ? codexResumeArgv(records.root, resumeSession) : codexPrimaryArgv(records.root),
    input,
    deadlineAt,
    signal,
    now,
    onStdout: (chunk) => {
      const previous = events.sessionId
      events.push(chunk)
      if (!previous && events.sessionId) onSession?.(events.sessionId)
    },
  })
  if (process.blocker) return { process, blocker: process.blocker }
  try {
    const native = events.finish()
    if (resumeSession && native.sessionId !== resumeSession)
      throw new Error('Resume changed the native primary identity')
    // A child running its own tests cannot mint coordinator receipts. Stop
    // before any subsequent validation if it violated the launch contract.
    if (
      native.commands.some((item) => /(?:npm\s+(?:run\s+)?(?:test|check)|playwright|vitest)/i.test(item.command ?? ''))
    )
      throw new Error('Primary launched coordinator-owned validation')
    records.save('native-cleanup.json', { confirmed: true, launchId: process.id, sessionId: native.sessionId })
    return { process, native }
  } catch (error) {
    const kind = events.failure ? classifyFailure(events.failure) : 'capability'
    return {
      process,
      blocker: new StageBlocker(
        kind,
        error.message,
        'Inspect native output; restore a supported event interface without weakening gates',
      ),
    }
  }
}

// Project only committed configured roles; never treat a primary's nested-role
// item or a JSON success claim as independent provenance.
export async function launchConfiguredRole(input) {
  const { root, role, records, deadlineAt, signal, authorization, observation, receipts } = input
  if (!['reviewer', 'product_verifier'].includes(role)) throw new Error('Unsupported configured role')
  const path = `.codex/agents/${role.replaceAll('_', '-')}.toml`
  const committed = (file) =>
    execFileSync('git', ['show', `${observation.head}:${file}`], { cwd: root, encoding: 'utf8' })
  const text = committed(path)
  const contract = committed('docs/AGENT_ROLES.md')
  if (
    readFileSync(join(root, path), 'utf8') !== text ||
    readFileSync(join(root, 'docs/AGENT_ROLES.md'), 'utf8') !== contract
  )
    throw new Error('Uncommitted role configuration or contract requires review')
  if (digest(text) !== input.configurationIdentity || digest(contract) !== input.contractIdentity)
    throw new Error('Role configuration identity changed')
  const settings = roleSettings(text, role)
  const argv = configuredRoleArgv(root, settings)
  const parser = new CodexEvents()
  records.save('native-cleanup.json', { confirmed: false, stage: role })
  const process = await observeProcess({
    records,
    argv,
    deadlineAt,
    signal,
    input:
      input.preflightPrompt ??
      `Act only as configured ${role}. Read docs/AGENT_ROLES.md and AGENTS.md. Inspect the full staged diff and relevant untracked files for ${authorization.contract.taskId} in ${authorization.contract.planPath}. Preserve all work; no edits, commits, nested launches, permission/configuration changes or web access. Reuse valid validation evidence. Report findings or the role's exact no-findings output.\nObserved candidate: ${JSON.stringify(observation)}\nObserved receipts: ${JSON.stringify(receipts)}`,
    onStdout: (chunk) => parser.push(chunk),
  })
  if (process.blocker) return process
  const native = parser.finish()
  records.save('native-cleanup.json', { confirmed: true, launchId: process.id, sessionId: native.sessionId })
  return {
    ...process,
    ...native,
    configuredRole: role,
    configurationIdentity: digest(text),
    contractIdentity: digest(contract),
    sessionSource: 'native-role-launcher',
    // These are explicit native launch settings, not independent OS probes.
    runtime: { sandbox: settings.sandbox_mode, networkAccess: false },
  }
}

export function configuredRoleArgv(root, settings) {
  const argv = ['codex', 'exec', '--json', '--cd', root, '--sandbox', settings.sandbox_mode]
  for (const name of ['model', 'model_reasoning_effort', 'developer_instructions'])
    argv.push('-c', `${name}=${JSON.stringify(settings[name])}`)
  argv.push(
    '-c',
    'web_search="disabled"',
    '-c',
    'sandbox_workspace_write.network_access=false',
    '-c',
    'agents.enabled=false',
    '-',
  )
  return argv
}
