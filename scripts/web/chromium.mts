import { lstatSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { currentDependencyImage } from './chromium-image.mts'

const root = resolve(import.meta.dirname, '../..')

export function containerArguments(imageID: string, smoke = false) {
  if (!/^sha256:[a-f0-9]{64}$/.test(imageID)) throw new Error('Expected a local immutable image ID')
  return [
    'run',
    '--rm',
    '--pull=never',
    '--platform',
    'linux/arm64',
    '--network',
    'none',
    '--cap-drop',
    'ALL',
    '--security-opt',
    'no-new-privileges',
    '--pids-limit',
    '2048',
    '--memory',
    '4g',
    '--cpus',
    '4',
    '-i',
    imageID,
    ...(smoke ? ['smoke'] : []),
  ]
}

function sourceFiles(directory: string): string[] {
  return readdirSync(resolve(root, directory)).flatMap((name) => {
    const path = `${directory}/${name}`
    const stat = lstatSync(resolve(root, path))
    if (stat.isSymbolicLink()) throw new Error(`Source symlinks are not supported: ${path}`)
    if (stat.isDirectory()) return sourceFiles(path)
    if (!stat.isFile()) throw new Error(`Unsupported source file: ${path}`)
    return [path]
  })
}

export function run(args: string[]) {
  if (args.length) throw new Error('test:web:chromium accepts no arguments; it runs the full built-browser suite')
  return runContainer(false)
}

export function runSmoke(args: string[]) {
  if (args.length) throw new Error('test:smoke:linux accepts no arguments; it runs Electron and Chromium smoke checks')
  return runContainer(true)
}

export function runElectron(args: string[]) {
  if (args.length) throw new Error('test:e2e:linux accepts no arguments; it runs the selected Linux Electron suite')
  return runContainer(false, 'electron')
}

export function runMemory(args: string[]) {
  if (args.length) throw new Error('test:e2e:memory accepts no arguments; it runs the Linux Electron memory suite')
  return runContainer(false, 'memory')
}

export function containerSourceFiles(smoke = false) {
  return [
    'package.json',
    'package-lock.json',
    'config/testing/playwright.web.config.ts',
    'e2e/external-drop.ts',
    'tsconfig.json',
    'scripts/release-version.mts',
    'scripts/build-info.mts',
    'assets/icons/tree-icon-source.png',
    ...sourceFiles('config/typescript'),
    ...sourceFiles('src'),
    ...sourceFiles('scripts/web'),
    ...sourceFiles('e2e/web'),
    ...(smoke
      ? [
          'config/build/electron.vite.config.ts',
          'scripts/rename-dev-app.mts',
          'scripts/build-image-to-text.mts',
          'config/testing/playwright.smoke.config.ts',
          ...sourceFiles('e2e/smoke'),
          // Only the launch/menu/cleanup dependencies of the smoke spec, never screenshot baselines.
          ...[
            'fixtures.ts',
            'platform-expect.ts',
            'electron-process.ts',
            'clipboard-lock.ts',
            'electron-entry.cjs',
            'hidden-windows.cjs',
            'shortcut-stub.cjs',
          ].map((name) => `e2e/electron/${name}`),
        ]
      : []),
  ]
}

function runContainer(smoke: boolean, electron?: 'electron' | 'memory') {
  const image = currentDependencyImage()
  const inspected = spawnSync('docker', ['image', 'inspect', '--format', '{{.Id}}', image], { encoding: 'utf8' })
  if (inspected.error || inspected.status !== 0) {
    throw new Error(
      `Linux test dependency image is unavailable. Ask the owner to run: make setup\nAgents must not build, pull, or install dependencies.\n${inspected.error?.message ?? inspected.stderr}`,
    )
  }
  const dockerArgs = containerArguments(inspected.stdout.trim(), smoke)
  if (electron) dockerArgs.push(electron)
  const files = electron
    ? [
        ...new Set([
          ...containerSourceFiles(true),
          'config/testing/playwright.config.ts',
          'config/testing/playwright.linux.config.ts',
          'config/testing/playwright.memory.config.ts',
          'config/testing/electron-platforms.ts',
          ...(electron === 'memory'
            ? [
                'perf/results.ts',
                'perf/memory-budget.ts',
                ...[
                  'fixtures',
                  'state.spec',
                  'search.spec',
                  'expansion.spec',
                  'memory-detector.spec',
                  'memory-probe',
                  'memory-processes',
                ].map((name) => `perf/electron/${name}.ts`),
              ]
            : []),
          ...sourceFiles('e2e/electron').filter((path) => /\.(?:ts|cjs)$/.test(path)),
        ]),
      ]
    : containerSourceFiles(smoke)
  // Only these source paths enter the container. No .git, credentials, scratch,
  // host dependencies, Docker socket, ports, or host environment are forwarded.
  // Match the image's root user without needing CAP_CHOWN during extraction.
  // ustar and COPYFILE_DISABLE omit host ACLs, xattrs and AppleDouble entries.
  const ownership =
    process.platform === 'darwin' ? ['--uid=0', '--gid=0', '--uname=root', '--gname=root'] : ['--owner=0', '--group=0']
  const archive = spawnSync('tar', ['-cf', '-', '--format=ustar', ...ownership, '--', ...files], {
    cwd: root,
    env: { ...process.env, COPYFILE_DISABLE: '1' },
    maxBuffer: 64 * 1024 * 1024,
  })
  if (archive.error || archive.status !== 0)
    throw new Error(`Source archive failed: ${archive.error?.message ?? archive.stderr.toString()}`)
  const result = spawnSync('docker', dockerArgs, {
    input: archive.stdout,
    ...(electron === 'memory'
      ? { encoding: 'utf8' as const, maxBuffer: 64 * 1024 * 1024 }
      : { stdio: ['pipe', 'inherit', 'inherit'] as const }),
  })
  if (electron === 'memory') {
    const directory = resolve(root, 'reports/electron-memory')
    mkdirSync(directory, { recursive: true })
    const path = resolve(directory, `${Date.now()}-${randomUUID()}.log`)
    const stdout = result.stdout?.toString() ?? ''
    const stderr = result.stderr?.toString() ?? ''
    writeFileSync(path, `${stdout}\n${stderr}\n${result.error?.message ?? ''}`, { flag: 'wx' })
    process.stdout.write(stdout)
    process.stderr.write(stderr)
    console.log(`Linux memory evidence: ${path}`)
  }
  if (result.error) throw result.error
  return result.status ?? 1
}

if (import.meta.url === pathToFileURL(process.argv[1]!).href) {
  try {
    process.exitCode = run(process.argv.slice(2))
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  }
}
