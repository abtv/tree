import { lstatSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { currentDependencyImage } from './chromium-image.mts'

const root = resolve(import.meta.dirname, '../..')

export function containerArguments(imageID: string) {
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
  const image = currentDependencyImage()
  const inspected = spawnSync('docker', ['image', 'inspect', '--format', '{{.Id}}', image], { encoding: 'utf8' })
  if (inspected.error || inspected.status !== 0) {
    throw new Error(
      `Chromium dependency image is unavailable. Ask the owner to run: make setup\nAgents must not build, pull, or install dependencies.\n${inspected.error?.message ?? inspected.stderr}`,
    )
  }
  const dockerArgs = containerArguments(inspected.stdout.trim())
  const files = [
    'package.json',
    'package-lock.json',
    'playwright.web.config.ts',
    ...readdirSync(root).filter((name) => /^tsconfig[^/]*\.json$/.test(name)),
    ...sourceFiles('src'),
    ...sourceFiles('scripts/web'),
    ...sourceFiles('e2e/web'),
  ]
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
  const result = spawnSync('docker', dockerArgs, { input: archive.stdout, stdio: ['pipe', 'inherit', 'inherit'] })
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
