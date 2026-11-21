import { readFile } from 'node:fs/promises'

import { claudeDecision, claudeRunsOutsideSandbox, readClaudeSettings } from './claude-permissions.mts'
import {
  CODEX_LIFECYCLE_SCRIPTS,
  codexForbids,
  codexPermitsScript,
  codexScriptArguments,
  declaredCodexRules,
} from './codex-rules.mts'
import {
  DEVELOPMENT_DOCUMENTS,
  documentedNpmWorkflows,
  findWorkflowApprovalIssues,
  type ToolDecision,
} from './documented-npm-workflows.mts'

// Checks that the Claude Code and Codex configurations keep the approval boundaries the development
// documents rely on. Configuration matching is evidence about declared rules, not proof that a
// running client loaded them.

const issues: string[] = []
let checked = 0

const claude = readClaudeSettings()
const codexRules = declaredCodexRules()
const claudeDecide = (command: string): ToolDecision => {
  const decision = claudeDecision(claude, command)
  if (decision === 'deny') return 'denied'
  return decision === 'ask' ? 'prompt' : 'permitted'
}
const codexDecide = (command: string): ToolDecision => {
  const name = command.slice('npm run '.length)
  if (codexForbids(codexRules, codexScriptArguments(name))) return 'denied'
  return codexPermitsScript(codexRules, name) ? 'permitted' : 'prompt'
}

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')) as {
  scripts: Record<string, string>
}
const lifecycle = new Set<string>(CODEX_LIFECYCLE_SCRIPTS)
const packageWorkflows = Object.keys(packageJson.scripts)
  .filter((name) => !lifecycle.has(name))
  .map((name) => `npm run ${name}`)

// Every npm workflow named in the development guide or its reference must be a package workflow and
// stay inside both tools' approval boundaries, so a newly documented workflow without a rule fails
// here instead of prompting later. Every other package workflow is held to the same boundary.
const developmentDocuments = await Promise.all(
  DEVELOPMENT_DOCUMENTS.map((path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')),
)
const documentedWorkflows = documentedNpmWorkflows(developmentDocuments)
for (const command of documentedWorkflows) {
  if (!packageWorkflows.includes(command)) issues.push(`documented workflow ${command} is not a package.json script`)
}
issues.push(...findWorkflowApprovalIssues('Claude Code', packageWorkflows, claudeDecide))
issues.push(...findWorkflowApprovalIssues('Codex', packageWorkflows, codexDecide))
checked += documentedWorkflows.length + packageWorkflows.length * 2

// Only the Product Owner runs a release. Every local entry point into the release or its parts is
// denied in both tools, including argument forms, the Make shortcut, direct script runs and the
// GitHub CLI release operations.
const ownerOnlyCommands = [
  'npm run release',
  'npm run release -- minor',
  'npm run release -- --help',
  'make release',
  'make release major',
  'make release BUMP=--help',
  'node scripts/release-tag.mts',
  'node scripts/release-draft.mts publish',
  'node scripts/release-artifact.mts verify',
  'node scripts/publication.mts dispatch',
  'node scripts/web-release/cli.mts prepare',
  'node scripts/web-release/publish.mts transfer',
  'gh release create v1.0.0',
  'gh workflow run release-new-app-version.yml',
]
for (const command of ownerOnlyCommands) {
  if (claudeDecision(claude, command) !== 'deny') issues.push(`Claude Code must deny owner-only command ${command}`)
  if (!codexForbids(codexRules, command.split(' '))) issues.push(`Codex must forbid owner-only command ${command}`)
  checked += 2
}

// Named host checks need both a Bash allowance and a sandbox exclusion in Claude Code, and the
// exclusion must not extend to lookalike names.
for (const name of ['test:mutation', 'test:safari']) {
  for (const suffix of ['', ' -- --help']) {
    const command = `npm run ${name}${suffix}`
    if (claudeDecision(claude, command) !== 'allow') issues.push(`Claude Code must allow ${command}`)
    if (!claudeRunsOutsideSandbox(claude, command)) issues.push(`Claude Code must run ${command} outside the sandbox`)
    checked += 2
  }
  if (claudeRunsOutsideSandbox(claude, `npm run ${name}-extra`)) {
    issues.push(`Claude Code sandbox exclusion must not include ${name}-extra`)
  }
  checked += 1
}

// AGENTS.md §4 requires repository edits to go through the agent's own file-editing tool. Claude Code
// enforces that by denying interpreters and in-place stream editing; read-only inspection stays
// available, because the requirement concerns writes.
const shellEditingCommands = [
  'python script.py',
  'python3 script.py',
  "python3 -c \"open('AGENTS.md','w')\"",
  "python3 - <<'PY'",
  'node',
  'node script.mjs',
  "node -e \"require('fs').writeFileSync('AGENTS.md','')\"",
  'perl -e 1',
  'perl -i -pe s/a/b/ AGENTS.md',
  'ruby script.rb',
  'osascript -e beep',
  'sh',
  'sh script.sh',
  'bash',
  'bash script.sh',
  'zsh',
  'zsh script.zsh',
  "sed -i '' s/a/b/ AGENTS.md",
  'sed -i.bak s/a/b/ AGENTS.md',
  'sed -e s/a/b/ -i AGENTS.md',
]
for (const command of shellEditingCommands) {
  if (claudeDecision(claude, command) !== 'deny') issues.push(`Claude Code must deny shell editing command ${command}`)
  checked += 1
}
for (const command of ['sed -n 1,80p AGENTS.md', "awk '{print}' AGENTS.md"]) {
  if (claudeDecision(claude, command) === 'deny') issues.push(`Claude Code must not deny read-only ${command}`)
  checked += 1
}

if (issues.length > 0) {
  console.error(issues.join('\n'))
  process.exit(1)
}
console.log(`Checked ${checked} agent permission expectations.`)
