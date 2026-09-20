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
    'npm audit --omit=dev',
    'rm .opencode/plan.md',
    'rm -f .opencode/plan.md',
    'npx vitest run src/domain/tree.test.ts',
    'npx playwright test e2e/tree.spec.ts',
    'true',
    'find src -type d',
    'sort',
    'rg permission opencode.json',
    'rg TODO src',
    'sed -n 1,80p opencode.json',
    'pkill -f tree-e2e-example',
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
    'npm run unknown',
    'npm run unknown 2>&1',
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

console.log(`Checked ${checked} OpenCode permission expectations.`)
