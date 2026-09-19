import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const config = JSON.parse(await readFile(new URL('../opencode.json', import.meta.url), 'utf8'))
const rules = config.agent.develop.permission.bash

function globMatches(pattern, value) {
  let expression = [...pattern]
    .map((character) => {
      if (character === '*') return '.*'
      if (character === '?') return '.'
      return character.replace(/[\\^$+.()|{}[\]]/g, '\\$&')
    })
    .join('')

  // OpenCode treats a trailing " *" as optional, so "foo *" also matches "foo".
  if (expression.endsWith(' .*')) expression = `${expression.slice(0, -3)}( .*)?`

  return new RegExp(`^${expression}$`, 'us').test(value)
}

function permissionFor(command) {
  let permission

  for (const [pattern, effect] of Object.entries(rules)) {
    if (globMatches(pattern, command)) permission = effect
  }

  return permission
}

const cases = {
  allow: [
    'git status --short',
    'git diff --check',
    'git add opencode.json docs/DEVELOPMENT.md',
    'git commit -m "chore(agents): refine permissions"',
    'npm run dev',
    'npm run start',
    'npm run test:watch',
    'npm run check:full',
    'npm run typecheck 2>&1',
    'npm run typecheck:node 2>&1',
    'npm run test -- src/domain/document.test.ts',
    'npm run build 2>&1',
    'npm run check 2>&1',
    'npm run check:full 2>&1',
    'npm audit --omit=dev',
    'rm .opencode/plan.md',
    'rm -f .opencode/plan.md',
    'npx vitest run src/domain/tree.test.ts',
    'npx playwright test e2e/tree.spec.ts',
    'find src -type d',
    'sort',
    'rg permission opencode.json',
    'sed -n 1,80p opencode.json',
    'pkill -f tree-e2e-example',
  ],
  ask: [
    'curl https://example.com',
    'cp source destination',
    'mv source destination',
    'npm run unknown',
    'npm run unknown 2>&1',
  ],
  deny: [
    'sudo npm run check',
    'bash',
    'bash script.sh',
    'node',
    'node script.mjs',
    'python3 script.py',
    'rm -rf src',
    'rm -rf .opencode/plan.md',
    'rm .opencode/plan.md.bak',
    'git push origin main',
    'git reset --hard HEAD~1',
    'git commit --amend -m "rewrite"',
    'git commit --no-verify',
    'git commit -n -m "skip hooks"',
    'git commit -m "skip hooks" -n',
    'npm install left-pad',
    'npm audit fix --force',
    'npm audit fix 2>&1',
    'npm audit -- fix',
    'npm run check fix',
    'npm run check -- fix --force',
    'npm run audit -- fix',
    'npx cowsay hello',
    'npx vitest-malicious',
    'npx playwright test-malicious',
    'pkill -f Electron',
    'find src -delete',
    'find src -exec rm {} +',
    "rg --pre 'node helper.js' pattern",
    "sed -i '' s/a/b/ file.txt",
  ],
}

for (const [expected, commands] of Object.entries(cases)) {
  for (const command of commands) {
    assert.equal(permissionFor(command), expected, `${command} should resolve to ${expected}`)
  }
}

// OpenCode checks every parsed command in a pipeline; all segments must be allowed.
for (const command of ['find src -type d', 'sort']) {
  assert.equal(permissionFor(command), 'allow', `pipeline segment should be allowed: ${command}`)
}

for (const command of ['rg TODO src', 'curl https://example.com']) {
  const expected = command.startsWith('rg ') ? 'allow' : 'ask'
  assert.equal(permissionFor(command), expected, `mixed pipeline segment should resolve to ${expected}`)
}

console.log(`Checked ${Object.values(cases).flat().length + 4} OpenCode permission expectations.`)
