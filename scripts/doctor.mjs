import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROOT = resolve(fileURLToPath(import.meta.url), '..', '..')

function parseVersion(version) {
  return version
    .replace(/^v/, '')
    .split('.')
    .map((part) => Number.parseInt(part, 10))
}

function compareVersions(left, right) {
  for (let index = 0; index < 3; index += 1) {
    const a = left[index] ?? 0
    const b = right[index] ?? 0
    if (a !== b) return a < b ? -1 : 1
  }
  return 0
}

export function meetsEngineRange(version, range) {
  const parsed = parseVersion(version)
  return range
    .trim()
    .split(/\s+/)
    .every((comparator) => {
      const match = /^(>=|<=|>|<|=)?(\d+(?:\.\d+){0,2})$/.exec(comparator)
      if (match === null) return false
      const comparison = compareVersions(parsed, parseVersion(match[2]))
      switch (match[1] ?? '=') {
        case '>':
          return comparison > 0
        case '>=':
          return comparison >= 0
        case '<':
          return comparison < 0
        case '<=':
          return comparison <= 0
        default:
          return comparison === 0
      }
    })
}

function commandVersion(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8' })
  if (result.status !== 0 || typeof result.stdout !== 'string') return undefined
  return result.stdout.trim()
}

async function checkRegistry(registry) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 5_000)
  try {
    const response = await globalThis.fetch(`${registry}/-/ping`, { signal: controller.signal })
    return response.ok
  } catch {
    return false
  } finally {
    clearTimeout(timeout)
  }
}

async function main() {
  const results = []
  const record = (level, label, detail) => results.push({ level, label, detail })

  const packageJson = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
  const engines = packageJson.engines ?? {}
  const expectedNode = existsSync(join(ROOT, '.nvmrc')) ? readFileSync(join(ROOT, '.nvmrc'), 'utf8').trim() : undefined

  const nodeVersion = process.versions.node
  if (engines.node !== undefined && !meetsEngineRange(nodeVersion, engines.node)) {
    record('FAIL', 'Node.js', `${nodeVersion} does not satisfy ${engines.node}`)
  } else if (expectedNode !== undefined && nodeVersion !== expectedNode.replace(/^v/, '')) {
    record('WARN', 'Node.js', `${nodeVersion} does not match .nvmrc (${expectedNode})`)
  } else {
    record('PASS', 'Node.js', nodeVersion)
  }

  const npmVersion = commandVersion('npm', ['--version'])
  if (npmVersion === undefined) record('FAIL', 'npm', 'not found on PATH')
  else if (engines.npm !== undefined && !meetsEngineRange(npmVersion, engines.npm))
    record('FAIL', 'npm', `${npmVersion} does not satisfy ${engines.npm}`)
  else record('PASS', 'npm', npmVersion)

  const gitVersion = commandVersion('git', ['--version'])
  record(gitVersion === undefined ? 'FAIL' : 'PASS', 'Git', gitVersion ?? 'not found on PATH')

  record('INFO', 'Platform', `${process.platform} ${process.arch} ${process.getSystemVersion?.() ?? ''}`.trim())

  const electronPackage = join(ROOT, 'node_modules', 'electron', 'package.json')
  if (existsSync(electronPackage)) {
    record('PASS', 'Electron', JSON.parse(readFileSync(electronPackage, 'utf8')).version)
  } else {
    record('FAIL', 'Electron', 'not installed; run npm install (do not skip lifecycle scripts)')
  }

  const playwrightInstalled = existsSync(join(ROOT, 'node_modules', '@playwright', 'test', 'package.json'))
  record(playwrightInstalled ? 'PASS' : 'FAIL', 'Playwright', playwrightInstalled ? 'installed' : 'not installed')

  if (process.platform === 'darwin') {
    record('PASS', 'Display', 'macOS provides a display; Electron end-to-end and performance suites can run')
  } else if ((process.env.DISPLAY ?? process.env.WAYLAND_DISPLAY) !== undefined) {
    record('PASS', 'Display', 'DISPLAY is set')
  } else {
    record('WARN', 'Display', 'no DISPLAY; Electron end-to-end and performance suites require a display')
  }

  const registry = commandVersion('npm', ['config', 'get', 'registry']) ?? 'https://registry.npmjs.org'
  const registryReachable = await checkRegistry(registry)
  record(
    registryReachable ? 'PASS' : 'WARN',
    'Registry',
    registryReachable
      ? `reachable (${registry}); npm audit can run`
      : `unreachable (${registry}); npm audit will fail offline`,
  )

  const buildEntry = join(ROOT, 'out', 'main', 'index.js')
  const built = existsSync(buildEntry)
  record(built ? 'PASS' : 'INFO', 'Build output', built ? 'out/main/index.js present' : 'not built; run npm run build')

  for (const result of results) console.log(`${result.level.padEnd(4)} ${result.label.padEnd(12)} ${result.detail}`)
  const failed = results.filter((result) => result.level === 'FAIL')
  if (failed.length > 0) {
    console.error(`\nDoctor found ${failed.length} blocking issue(s).`)
    process.exitCode = 1
    return
  }
  console.log('\nEnvironment is ready.')
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main()
}
