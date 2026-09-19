import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const config = JSON.parse(await readFile(new URL('../opencode.json', import.meta.url), 'utf8'))
const rules = config.agent.develop.permission.bash

function globMatches(pattern, value) {
  const expression = [...pattern]
    .map((character) => {
      if (character === '*') return '.*'
      if (character === '?') return '.'
      return character.replace(/[\\^$+.()|{}[\]]/g, '\\$&')
    })
    .join('')

  return new RegExp(`^${expression}$`, 'u').test(value)
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
    'npx vitest run src/domain/tree.test.ts',
    'npx playwright test e2e/tree.spec.ts',
    'find src -type d',
    'sort',
    'rg permission opencode.json',
    'sed -n 1,80p opencode.json',
    'pkill -f tree-e2e-example',
  ],
  ask: ['curl https://example.com', 'cp source destination', 'mv source destination', 'npm run unknown'],
  deny: [
    'sudo npm run check',
    'bash',
    'bash script.sh',
    'node',
    'node script.mjs',
    'python3 script.py',
    'rm -rf src',
    'git push origin main',
    'git reset --hard HEAD~1',
    'git commit --amend -m "rewrite"',
    'git commit --no-verify',
    'git commit -n -m "skip hooks"',
    'git commit -m "skip hooks" -n',
    'npm install left-pad',
    'npm audit fix --force',
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
