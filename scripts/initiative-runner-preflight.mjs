import { execFileSync } from 'node:child_process'
import { existsSync, lstatSync, readFileSync, realpathSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { launchConfiguredRole, launchPrimary } from './initiative-runner-codex.mjs'
import { digest, repositoryPath } from './initiative-runner-git.mjs'
import { observeProcess, StageBlocker } from './initiative-runner-process.mjs'
import { RunRecords } from './initiative-runner-records.mjs'
import { createValidationSnapshot } from './validation-snapshot.mjs'

const scripts = new Set(['check:full', 'check', 'test:e2e', 'test:perf', 'test:performance', 'build', 'audit'])
const identifier = /^[a-z][a-z0-9-]{0,63}$/

function fail(reason, kind = 'capability') {
  throw new StageBlocker(kind, reason, 'Retain preflight evidence; resolve through the supported approval flow')
}

function ownedPath(root, path, prefix) {
  repositoryPath(path)
  const absolute = resolve(root, path)
  if (!path.startsWith(`${prefix}/`) || realpathSync(absolute) !== absolute)
    fail('Preflight fixture must remain inside its owned scratch scope')
  return absolute
}

function snapshot(root) {
  return {
    ...createValidationSnapshot({ rootDirectory: root }),
    indexIdentity: digest(execFileSync('git', ['ls-files', '--stage', '-z'], { cwd: root, encoding: 'utf8' })),
  }
}

function isolatedGit(cwd, argv) {
  const path = join(cwd, '.git')
  if (existsSync(path)) {
    if (!lstatSync(path).isDirectory() || realpathSync(path) !== path)
      fail('Synthetic Git metadata must be an owned local directory')
    const top = execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd, encoding: 'utf8' }).trim()
    const metadata = execFileSync('git', ['rev-parse', '--absolute-git-dir'], { cwd, encoding: 'utf8' }).trim()
    if (realpathSync(top) !== cwd || realpathSync(metadata) !== path)
      fail('Synthetic Git probe resolves outside its isolated repository')
  } else if (argv[1] !== 'init') fail('Initialize the isolated synthetic repository before Git probes')
  if (
    Object.keys(process.env).some((name) =>
      /^GIT_(DIR|WORK_TREE|COMMON_DIR|INDEX_FILE|OBJECT_DIRECTORY|ALTERNATE_OBJECT_DIRECTORIES|CONFIG.*)$/.test(name),
    )
  )
    fail('Git environment overrides require a separately reviewed launch environment')
}

// The reviewed manifest is pinned by identity at the outer host boundary.
// No projection, task status, execution authorization or coordinator is involved.
export function validatePreflight(manifest) {
  if (
    manifest?.version !== 1 ||
    !identifier.test(manifest.initiative ?? '') ||
    !identifier.test(manifest.id ?? '') ||
    !Number.isSafeInteger(manifest.budgetMs) ||
    manifest.budgetMs <= 0 ||
    manifest.budgetMs > 60 * 60 * 1000 ||
    typeof manifest.scope !== 'string' ||
    !manifest.scope.trim() ||
    manifest.scope.length > 16384 ||
    !Array.isArray(manifest.probes) ||
    !manifest.probes.length ||
    manifest.probes.length > 32 ||
    Buffer.byteLength(JSON.stringify(manifest)) > 128 * 1024
  )
    fail('Invalid bounded preflight manifest')
  const ids = new Set()
  let primary = false
  const prefix = `.scratch/${manifest.initiative}/preflight/${manifest.id}`
  for (const probe of manifest.probes) {
    if (!identifier.test(probe.id ?? '') || ids.has(probe.id)) fail('Ambiguous preflight probe identity')
    ids.add(probe.id)
    if (!['primary', 'resume', 'role', 'command'].includes(probe.kind)) fail('Unsupported preflight probe')
    if (probe.kind === 'primary') {
      if (primary) fail('Only one fresh primary is permitted per preflight')
      primary = true
    }
    if (probe.kind === 'resume' && !primary) fail('Resume requires the preceding native primary')
    if (probe.kind === 'role' && !['reviewer', 'product_verifier'].includes(probe.role))
      fail('Unsupported configured preflight role')
    if (probe.instruction !== undefined && (typeof probe.instruction !== 'string' || probe.instruction.length > 16384))
      fail('Invalid probe instruction')
    if (probe.kind === 'command') {
      const argv = probe.argv
      if (
        !Array.isArray(argv) ||
        !argv.length ||
        argv.length > 32 ||
        argv.some((arg) => typeof arg !== 'string' || !arg || arg.includes('\0') || arg.length > 4096)
      )
        fail('Explicit bounded command argv required')
      const npm =
        argv[0] === 'npm' &&
        ((argv.length === 3 && argv[1] === 'run' && scripts.has(argv[2])) || (argv.length === 2 && argv[1] === 'test'))
      const ps = JSON.stringify(argv) === JSON.stringify(['ps', '-axo', 'pid=,ppid=,command='])
      // Git writes are confined to an isolated fixture, never the application
      // repository. No config, rewrite, shell, helper override or bypass flags.
      const git =
        argv[0] === 'git' &&
        probe.cwd?.startsWith(`${prefix}/fixtures/`) &&
        (JSON.stringify(argv) === JSON.stringify(['git', 'init', '--quiet']) ||
          JSON.stringify(argv) === JSON.stringify(['git', 'add', '--all']) ||
          (argv.length === 4 &&
            argv[1] === 'commit' &&
            argv[2] === '-m' &&
            /^[a-z]+\([a-z-]+\): [^\n]+$/.test(argv[3])) ||
          (argv.length === 3 && argv[1] === 'rev-parse' && argv[2] === 'HEAD') ||
          (argv.length === 3 && argv[1] === 'status' && argv[2] === '--short') ||
          (argv.length === 3 && argv[1] === 'log' && argv[2] === '--oneline'))
      if (!npm && !ps && !git) fail('Command is outside supported preflight launch paths')
      if (probe.cwd !== undefined) {
        repositoryPath(probe.cwd)
        if (!git) fail('Only isolated synthetic Git probes may change cwd')
      }
    }
    if (probe.artifacts !== undefined) {
      if (!Array.isArray(probe.artifacts) || probe.artifacts.length > 16) fail('Invalid probe artifacts')
      for (const path of probe.artifacts) {
        repositoryPath(path)
        if (!path.startsWith(`${prefix}/`)) fail('Artifact is outside preflight scope')
      }
    }
  }
  return manifest
}

function prompt(manifest, probe) {
  return [
    `This is separately authorized capability preflight ${manifest.id}, probe ${probe.id}, not initiative execution.`,
    'Read AGENTS.md and docs/AGENT_ROLES.md. Preserve application data and all existing work.',
    `Approved scope: ${manifest.scope}`,
    `Scratch scope: .scratch/${manifest.initiative}/preflight/${manifest.id}/.`,
    'Never execute initiative tasks, create an execution ledger, modify plans, change permissions/trust/authentication or use bypass flags.',
    'Do not run validation, Git writes, nested roles or another primary; the outer host owns those launches.',
    probe.kind === 'role'
      ? `Act only as configured ${probe.role}; inspect permitted files and artifacts, with no edits or web access.`
      : 'Use native file-edit tools for authorized synthetic fixture edits only; inspect requested artifacts through native tools.',
    `Probe instruction: ${probe.instruction ?? 'Inspect the authorized scratch fixtures and report observed capabilities and limitations.'}`,
    'Report actual tools, paths, outcomes, permission interventions and limitations. A success claim is not readiness proof.',
  ].join('\n')
}

export async function executePreflight(input) {
  if (
    input.preflightAuthorized !== true ||
    typeof input.approvalReference !== 'string' ||
    !input.approvalReference.trim()
  )
    fail('Separate explicit preflight authorization required')
  const manifest = structuredClone(validatePreflight(input.manifest))
  if (digest(manifest) !== input.manifestIdentity) fail('Approved preflight manifest identity changed')
  if (typeof input.confirmQuiescence !== 'function') fail('Independent cleanup confirmation is required')
  const now = input.now ?? Date.now
  const records = new RunRecords({
    root: input.root,
    initiative: manifest.initiative,
    preflightId: manifest.id,
    hostAuthorized: true,
  })
  let cleanupConfirmed
  let report
  try {
    // A retry uses a new explicitly authorized id. Never overwrite evidence or
    // silently renew a prior allowance after an interruption.
    if (existsSync(records.file('preflight.json'))) fail('Preflight id already used; preserve its original evidence')
    const startedAt = now()
    if (!Number.isSafeInteger(startedAt) || startedAt < 0 || !Number.isSafeInteger(startedAt + manifest.budgetMs))
      fail('Invalid preflight clock')
    report = {
      operation: 'preflight',
      manifest,
      manifestIdentity: input.manifestIdentity,
      approvalReference: input.approvalReference,
      startedAt,
      deadlineAt: startedAt + manifest.budgetMs,
      phase: 'running',
      probes: [],
      readiness: 'unverified',
      interventions: 'Unknown until native evidence and outer-host approvals are reviewed',
      limitations: ['Probe completion does not establish unattended readiness or future implementation correctness'],
    }
    records.save('preflight.json', report)
    let sessionId
    let observedAt = startedAt
    for (const probe of manifest.probes) {
      records.assertIntegrity()
      if (input.signal?.aborted) fail('Preflight interrupted before launch', 'interrupted')
      const checkedAt = now()
      if (!Number.isSafeInteger(checkedAt) || checkedAt < observedAt || checkedAt >= report.deadlineAt)
        fail('Preflight allowance exhausted or clock moved backwards', 'budget')
      observedAt = checkedAt
      if ((await input.confirmQuiescence({ records })) !== true) fail('Independent quiescence confirmation failed')
      const before = snapshot(records.root)
      const common = { records, deadlineAt: report.deadlineAt, signal: input.signal, now }
      let result
      if (probe.kind === 'command') {
        const cwd = probe.cwd
          ? ownedPath(records.root, probe.cwd, `.scratch/${manifest.initiative}/preflight/${manifest.id}/fixtures`)
          : records.root
        if (probe.argv[0] === 'git') isolatedGit(cwd, probe.argv)
        result = await (input.observeProcess ?? observeProcess)({ ...common, argv: probe.argv, cwd })
      } else if (probe.kind === 'role') {
        const committed = (path) =>
          execFileSync('git', ['show', `${before.head}:${path}`], { cwd: records.root, encoding: 'utf8' })
        result = await (input.launchConfiguredRole ?? launchConfiguredRole)({
          ...common,
          root: records.root,
          role: probe.role,
          observation: { head: before.head },
          configurationIdentity: digest(committed(`.codex/agents/${probe.role.replaceAll('_', '-')}.toml`)),
          contractIdentity: digest(committed('docs/AGENT_ROLES.md')),
          preflightPrompt: prompt(manifest, probe),
        })
      } else {
        result = await (input.launchPrimary ?? launchPrimary)({
          ...common,
          resumeSession: probe.kind === 'resume' ? sessionId : undefined,
          preflightPrompt: prompt(manifest, probe),
        })
        if (!result.blocker) {
          if (!result.native?.sessionId || (probe.kind === 'resume' && result.native.sessionId !== sessionId))
            fail('Preflight native session identity was not preserved')
          sessionId = result.native.sessionId
        }
      }
      const processResult = result.process ?? result
      cleanupConfirmed = (await input.confirmQuiescence({ records, process: processResult })) === true
      const after = snapshot(records.root)
      const evidence = { id: probe.id, kind: probe.kind, before, after, result, cleanupConfirmed }
      report.probes.push(evidence)
      records.save('preflight.json', report)
      if (!cleanupConfirmed) fail('Independent owned-process cleanup remains unconfirmed')
      if (result.blocker || processResult.blocker) {
        const blocker = result.blocker ?? processResult.blocker
        fail(blocker.reason ?? blocker.message ?? 'Preflight probe blocked', blocker.kind)
      }
      if (before.head !== after.head || before.digest !== after.digest || before.indexIdentity !== after.indexIdentity)
        fail('Preflight changed application repository inputs')
      const finishedAt = now()
      if (!Number.isSafeInteger(finishedAt) || finishedAt < observedAt || finishedAt >= report.deadlineAt)
        fail('Preflight allowance exhausted or clock moved backwards', 'budget')
      observedAt = finishedAt
      if (probe.artifacts?.length) {
        evidence.artifacts = probe.artifacts.map((path) => records.artifact(join(records.root, path)))
        records.verifyArtifacts(evidence.artifacts)
        records.save('preflight.json', report)
      }
    }
    report.phase = 'completed'
    // Launch and retained evidence are not a claim that all acceptance
    // capabilities were exercised or that prompts will not recur.
    report.readiness = 'requires-evidence-review'
    return report
  } catch (error) {
    if (report) {
      report.phase = 'blocked'
      report.blocker = { kind: error.kind ?? 'capability', reason: error.message }
    }
    throw error
  } finally {
    // Native adapters may have failed before returning a result. Their cleanup
    // marker and independently inspected process table still gate release.
    try {
      cleanupConfirmed = (await input.confirmQuiescence({ records })) === true
    } catch (error) {
      cleanupConfirmed = false
      if (report) report.cleanupFailure = error.message
    }
    if (report) {
      report.finishedAt = now()
      report.cleanupConfirmed = cleanupConfirmed
      if (!cleanupConfirmed) {
        report.phase = 'blocked'
        report.cleanupBlocker = {
          kind: 'capability',
          reason: 'Preflight cleanup unconfirmed; exclusive ownership retained',
        }
        report.blocker ??= report.cleanupBlocker
      }
      records.save('preflight.json', report)
    }
    if (cleanupConfirmed) records.release()
    else fail('Preflight cleanup unconfirmed; exclusive ownership retained')
  }
}

export function readPreflightManifest(root, path) {
  repositoryPath(path)
  const absolute = resolve(root, path)
  if (
    !path.startsWith('.scratch/') ||
    realpathSync(absolute) !== absolute ||
    !lstatSync(absolute).isFile() ||
    lstatSync(absolute).size > 128 * 1024
  )
    fail('Expected a bounded native-edited scratch manifest')
  return JSON.parse(readFileSync(absolute, 'utf8'))
}
