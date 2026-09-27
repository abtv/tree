import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const config = JSON.parse(await readFile(new URL('../opencode.json', import.meta.url), 'utf8'))

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

function permissionFor(rules, command) {
  let permission

  for (const [pattern, effect] of Object.entries(rules)) {
    if (globMatches(pattern, command)) permission = effect
  }

  return permission
}

// OpenCode checks every parsed command in a pipeline or chain and applies the strongest
// effect across the segments. Split on unquoted &&, ||, ;, |, and newlines, so quoted separators
// such as -E "flake|retry" and awk '$1 == "a" || $2 == "b"' stay inside one segment.
function chainedPermissionFor(rules, command) {
  const segments = []
  let current = ''
  let quote

  for (let index = 0; index < command.length; index += 1) {
    const character = command[index]

    if (quote !== undefined) {
      current += character
      if (character === quote) quote = undefined
      continue
    }

    if (character === '"' || character === "'") {
      quote = character
      current += character
      continue
    }

    const next = command[index + 1]
    if (character === '&' && next === '&') {
      segments.push(current.trim())
      current = ''
      index += 1
      continue
    }
    if (character === '|') {
      segments.push(current.trim())
      current = ''
      if (next === '|') index += 1
      continue
    }
    if (character === ';' || character === '\n') {
      segments.push(current.trim())
      current = ''
      continue
    }
    if (character === '\r') continue

    current += character
  }
  segments.push(current.trim())

  const effects = segments.filter((segment) => segment !== '').map((segment) => permissionFor(rules, segment))
  if (effects.includes('deny')) return 'deny'
  if (effects.includes('ask')) return 'ask'
  return 'allow'
}

const developCases = {
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
    // Canonical scoped formatting check and validation-evidence snapshot from docs/DEVELOPMENT.md §9.
    'npm run format:check:changed',
    'npm run format:check:changed 2>&1',
    'npm run format:check:changed src/renderer/NodeList.tsx',
    'npm run format:check:changed; git status --short',
    'npm run validation:snapshot',
    'npm run validation:snapshot 2>&1',
    // Guardrailed deletion of one tracked file; the script enforces the path checks.
    'npm run retire:file -- e2e/vim-editing.spec.ts',
    'npm run retire:file -- src/renderer/editor-dom.ts 2>&1',
    'npm audit --omit=dev',
    'rm WORKING_PLAN.md',
    'rm -f WORKING_PLAN.md',
    'npx vitest run src/domain/tree.test.ts',
    'npx playwright test e2e/tree.spec.ts',
    'true',
    'find src -type d',
    'sort',
    'rg permission opencode.json',
    'rg TODO src',
    'sed -n 1,80p opencode.json',
    // Read-only wrapping for inspecting a line longer than the file reader returns.
    'fold -w 190 plans/interaction-state-ownership.md',
    'fold',
    'pkill -f tree-e2e-example',
    // Read-only process inspection used to answer fixture and cleanup questions.
    'ps',
    'ps -p 15003 -o pid,ppid,etime,command',
    'ps ax -o pid,command | grep -c "tree-perf-"',
    'pgrep',
    'pgrep -fl tree-e2e-p1234-',
    'pgrep -fl tree-perf-12345',
    'pgrep -af "tree-perf-" || echo "no tree-perf electron processes"',
    'pgrep -fl tree-e2e- 2>&1; pgrep -fl Electron 2>&1',
    'unzip -l test-results/example/trace.zip',
    'unzip -q -o test-results/example/trace.zip -d test-results/trace-unpacked',
    'grep -i flake src/renderer/NodeList.tsx',
    'xxd test-results/example/trace.zip',
    'shasum test-results/example/trace.zip',
    'cksum test-results/example/trace.zip',
    'md5 test-results/example/trace.zip',
    'tmutil listlocalsnapshots /',
    'mkdir -p test-results/trace-unpacked',
    'npx tsc --noEmit -p tsconfig.e2e.json',
    'git grep permission',
    'git ls-files e2e',
    'git rev-parse HEAD',
    'git blame src/renderer/NodeList.tsx',
    'cp test-results/example/trace.zip test-results/keep.zip',
    'cp -R test-results/example test-results/keep',
    'mv e2e/_drag-diagnostic.spec.ts test-results/',
    'mv perf/_probe.spec.ts test-results/',
    'mv perf/_probe-a.spec.ts perf/_probe-b.spec.ts test-results/',
    'mv test-results/keep.zip test-results/archive.zip',
    // Chained commands from real sessions: each segment must resolve to allow.
    'ls -la .opencode; git stash list; git branch -a',
    'rg pattern . || true',
    "rg -il \"concentration|three-part|editor-store split|Task 3\" . --hidden -g '!node_modules' -g '!.git' || true",
    "find src -name '*.ts' -o -name '*.tsx' | xargs wc -l | sort -rn | head -40",
    'find src -type d | xargs wc -l | sort -rn | head -40',
    "awk 'NR>=1 && NR<=5' file.ts",
    "awk 'NR>=18825 && NR<=19200 && /waitForEvent/' node_modules/playwright-core/types/types.d.ts",
    // Quoted separators stay inside one segment: logical || and --field-separator are allowed.
    'awk \'$1 == "a" || $2 == "b"\' file.ts',
    "awk --field-separator=: '{print $1}' file.ts",
    // The awk execution denies must not over-block benign programs on spacing or filenames.
    "awk -F' | ' '{print $1}' file.ts",
    "awk '{print}' system.log",
    'git log --grep="wip; fix" --oneline',
    'git log --oneline --all | grep -i -E "flake|retry|stabil|hold" | head -20',
    'git branch',
    'git branch -a',
    'git branch -v',
    'git branch -vv',
    'git branch --list',
    'git branch --show-current',
    'git stash list',
    'git stash list --oneline',
    // Documented environment-prefixed workflow commands are inside the approval boundary.
    'TREE_E2E_VISIBLE=1 npm run test:e2e',
    'TREE_E2E_VISIBLE=1 npm run test:e2e 2>&1',
    'TREE_E2E_VISIBLE=1 npm run test:e2e -- window-visibility',
    'TREE_E2E_VISIBLE=1 npx playwright test',
    'TREE_E2E_VISIBLE=1 npx playwright test persistence-reliability --workers=1 --reporter=list',
    'TREE_PERSISTENCE_DEBUG=1 npm run dev',
    'TREE_PERSISTENCE_DEBUG=1 npm run dev 2>&1',
    'PERF_RESULTS="test-results/perf-after.json" npm run test:perf',
    'PERF_BASELINE="perf-baseline.json" npm run test:perf 2>&1',
    'PERF_REGRESSION_TOLERANCE="2" npm run test:perf',
    'TREE_E2E_VISIBLE=1 npm run test:e2e; git status --short',
  ],
  ask: [
    'curl https://example.com',
    'cp source destination',
    'mv source destination',
    'cp test-results/example/trace.zip ~/.ssh/authorized_keys',
    'mv src/domain test-results/domain',
    'mv e2e/history.spec.ts test-results/',
    // Only underscore-prefixed perf probe files may move into the scratch directory.
    'mv perf/foo.spec.ts src/',
    'mv perf/foo.spec.ts',
    'mv perf/foo.spec.ts test-results/',
    'mv perf/_probe.spec.ts test-results',
    'mv perf/_probe.spec.ts ~/Desktop/',
    // Ad-hoc environment prefixes stay approval-gated for the new inspection tools.
    'PROBE_PID=1 pgrep -af "tree-perf-"',
    'npm run unknown',
    'npm run unknown 2>&1',
    // Workflow allowances stay anchored to the exact script names and documented environment prefixes.
    'npm run format:check:changed-extra',
    'npm run validation:snapshot-extra',
    'npm run retire:file-extra',
    'FOO=1 npm run validation:snapshot',
    'TREE_E2E_VISIBLE=1 npm run format:check:changed',
    'unzip archive.zip',
    'unzip -q -o test-results/example/trace.zip -d src',
    // One asking segment makes the whole chain ask.
    'npm run build && curl https://example.com',
    'git stash list; curl https://example.com',
    'git log --oneline|curl https://example.com',
    // Generic xargs is not allowlisted; only xargs wc * is.
    'xargs rm -rf src',
    'xargs sh -c "git push"',
    // Unfamiliar or ad-hoc environment prefixes still require approval.
    'FAKE_ENV=1 npm run test:e2e',
    'TREE_E2E_VISIBLE=2 npm run test:e2e',
    'TREE_E2E_VISIBLE=1 npm run unknown',
    'TREE_E2E_VISIBLE=1 npm run test:e2e-malicious',
    'TREE_E2E_VISIBLE=1 npx playwright test-malicious',
    'TREE_PERSISTENCE_DEBUG=1 npm run test:e2e',
    'PROBE_NO_BT=1 npx playwright test _hidden-probe.spec --workers=1 --reporter=list',
    'TREE_E2E_FORCE_BYPASS=1 npx playwright test window-visibility --workers=1 --reporter=list',
    'TREE_E2E_HIDDEN=1 npx playwright test window-visibility',
    // Perf artifact overrides are allowed only as a single quoted value.
    'PERF_BASELINE=perf-baseline.json npm run test:perf',
    'PERF_BASELINE=x rm -rf src npm run test:perf',
    'PERF_RESULTS="perf-after.json" npm run test:perf',
    // An env prefix turns an anchored deny into an ask; this pins the pre-existing behavior.
    'TREE_E2E_VISIBLE=1 rm -rf src',
    'TREE_E2E_VISIBLE=1 npm run test:e2e && curl https://example.com',
    'TREE_E2E_VISIBLE=1 npm run test:e2e\ncurl https://example.com',
  ],
  deny: [
    'sudo npm run check',
    'bash',
    'bash script.sh',
    'node',
    'node script.mjs',
    'python3 script.py',
    'rm -rf src',
    'rm -rf WORKING_PLAN.md',
    'rm WORKING_PLAN.md.bak',
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
    // Read-only inspection must not weaken termination, escalation, or history denies.
    'pkill -9 -f tree-perf-',
    'ps ax | sudo cat /etc/hosts',
    'pgrep -f Electron; git push origin main',
    'find src -delete',
    'find src -exec rm {} +',
    "rg --pre 'node helper.js' pattern",
    "sed -i '' s/a/b/ file.txt",
    'git grep --open-files-in-pager=less pattern',
    'git grep --open=sh pattern',
    'git grep -O less pattern',
    // Only read-only branch and stash forms are allowlisted.
    'git branch -d feature',
    'git branch -D main',
    'git branch -m old new',
    'git branch -M old new',
    'git branch --delete main',
    'git branch --move old new',
    'git branch --list -D main',
    'git stash',
    'git stash drop',
    'git stash pop',
    'git stash clear',
    'git stash apply',
    'git stash push -m wip',
    // One denied segment makes the whole chain deny.
    'ls; git push origin main',
    'git log --oneline && git push',
    'git log --oneline | sudo cat /etc/hosts',
    // awk system() calls and program file loading are denied.
    'awk \'BEGIN{system("id")}\'',
    'awk \'BEGIN{system ("id")}\'',
    'awk -f script.awk file.ts',
    "awk '{print}' --file=script.awk",
    // Allowed environment-prefixed segments still combine with denied segments.
    'TREE_E2E_VISIBLE=1 npm run test:e2e; rm -rf src',
    'TREE_PERSISTENCE_DEBUG=1 npm run dev && git push origin main',
    'PERF_BASELINE="perf-baseline.json" npm run test:perf && sudo rm -rf /',
    'TREE_E2E_VISIBLE=1 npm run test:e2e | sudo cat /etc/hosts',
    'TREE_E2E_VISIBLE=1 npm run test:e2e\nrm -rf src',
  ],
}

const productVerifierCases = {
  allow: ['npm test', 'npm run test:e2e', 'npm run test:perf', 'npm run build', 'TREE_E2E_VISIBLE=1 npm run test:e2e'],
  deny: [
    'TREE_E2E_VISIBLE=1 npm run test:e2e -- persistence-reliability',
    'TREE_E2E_VISIBLE=2 npm run test:e2e',
    'TREE_E2E_VISIBLE=1 npx playwright test',
    'TREE_E2E_VISIBLE=1 npm run check:full',
    'TREE_PERSISTENCE_DEBUG=1 npm run dev',
    'TREE_E2E_VISIBLE=1 npm run test:e2e && curl https://example.com',
  ],
}

const agents = [
  { name: 'develop', rules: config.agent.develop.permission.bash, cases: developCases },
  {
    name: 'product-verifier',
    rules: config.agent['product-verifier'].permission.bash,
    cases: productVerifierCases,
  },
]

let checked = 0
for (const { name, rules, cases } of agents) {
  for (const [expected, commands] of Object.entries(cases)) {
    for (const command of commands) {
      assert.equal(chainedPermissionFor(rules, command), expected, `${name}: ${command} should resolve to ${expected}`)
      checked += 1
    }
  }
}

// Every npm workflow named in docs/DEVELOPMENT.md must stay inside the develop approval boundary.
// A newly documented workflow without a matching rule fails this check instead of prompting later.
const development = await readFile(new URL('../docs/DEVELOPMENT.md', import.meta.url), 'utf8')
const documentedWorkflows = [...new Set([...development.matchAll(/npm run [A-Za-z0-9:_-]+/g)].map((match) => match[0]))]
for (const command of documentedWorkflows) {
  assert.equal(
    chainedPermissionFor(config.agent.develop.permission.bash, command),
    'allow',
    `develop: documented workflow ${command} should resolve to allow`,
  )
  checked += 1
}

// AGENTS.md §4 requires repository edits to go through the agent's own file-editing tool. Both
// OpenCode and Claude Code enforce that by denying interpreters and in-place stream editing, and
// the two configurations previously drifted: OpenCode denied them while Claude Code did not. This
// asserts parity for that category only; OpenCode's other denials are its own approval boundary,
// because a Claude Code session keeps the Product Owner in the loop for them.
const claudeSettings = JSON.parse(await readFile(new URL('../.claude/settings.json', import.meta.url), 'utf8'))
const claudeDeny = claudeSettings.permissions?.deny ?? []

// Claude Code matches a whole Bash command against the pattern inside `Bash(...)`, treating `*` as
// a wildcard. It has no trailing-" *" leniency, so this matcher deliberately omits the OpenCode
// special case in globMatches rather than passing a rule Claude Code would not actually apply.
function claudeDenies(command) {
  return claudeDeny.some((entry) => {
    const pattern = /^Bash\((.*)\)$/su.exec(entry)?.[1]
    if (pattern === undefined) return false
    const expression = [...pattern]
      .map((character) => {
        if (character === '*') return '.*'
        if (character === '?') return '.'
        return character.replace(/[\\^$+.()|{}[\]]/g, '\\$&')
      })
      .join('')
    return new RegExp(`^${expression}$`, 'us').test(command)
  })
}

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
  assert.equal(
    chainedPermissionFor(config.agent.develop.permission.bash, command),
    'deny',
    `develop: shell editing command ${command} should resolve to deny`,
  )
  assert.ok(
    claudeDenies(command),
    `Claude Code: shell editing command ${command} should be denied by .claude/settings.json`,
  )
  checked += 2
}

// Read-only stream editing and search stay available in both tools; a parity rule must not
// over-block them, because the file-editing requirement is about writes, not reads.
const readOnlyInspectionCommands = ['sed -n 1,80p AGENTS.md', "awk '{print}' AGENTS.md"]
for (const command of readOnlyInspectionCommands) {
  assert.notEqual(
    chainedPermissionFor(config.agent.develop.permission.bash, command),
    'deny',
    `develop: read-only inspection ${command} should not be denied`,
  )
  assert.ok(!claudeDenies(command), `Claude Code: read-only inspection ${command} should not be denied`)
  checked += 2
}

console.log(`Checked ${checked} agent permission expectations.`)
