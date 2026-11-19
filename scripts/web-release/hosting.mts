import { execFile } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { devNull, tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import type { Request } from './types.mts'

export const HOSTING_REMOTE = 'https://github.com/tree-editor/tree-editor.github.io.git'
const root = '/repos/tree-editor/tree-editor.github.io'
const MAX_OUTPUT_BYTES = 16 * 1024 * 1024
const UNREADABLE = 'Could not read the public hosting repository'

function git(args: string[], cwd: string, timeout = 15000): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    execFile(
      'git',
      args,
      {
        cwd,
        encoding: 'buffer',
        // Ignore checkout, user and system Git configuration such as URL rewrites.
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: devNull },
        maxBuffer: MAX_OUTPUT_BYTES,
        timeout,
      },
      (error, stdout) => {
        // Keep remote and local Git diagnostics out of release logs.
        if (error) reject(Object.assign(new Error(UNREADABLE), { transient: error.killed || error.code === 128 }))
        else resolve(stdout)
      },
    )
  })
}

// Like REST reads, network reads retry timeouts and Git failures twice, after
// one and two seconds. A missing branch (exit code 2) fails immediately.
async function remoteGit(args: string[], cwd: string, timeout?: number) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await git(args, cwd, timeout)
    } catch (error) {
      if (attempt === 2 || !(error as { transient: boolean }).transient) throw error
      const delay = 1000 * 2 ** attempt
      console.error(`Hosting repository read failed; retrying in ${delay}ms`)
      await sleep(delay)
    }
  }
}

function blob(bytes: Buffer) {
  return { encoding: 'base64', size: bytes.length, content: bytes.toString('base64') }
}

// GitHub-hosted runners share outbound addresses, so another tenant can exhaust
// the anonymous REST budget before a release job starts. Read the public hosting
// repository over Git instead: it needs no credential and no REST quota. The
// reader answers the read-only REST paths that release code uses, so the same
// validation runs on its results.
export async function withHostingRepository<T>(
  use: (request: Request) => Promise<T>,
  remote = HOSTING_REMOTE,
): Promise<T> {
  const directory = await mkdtemp(join(tmpdir(), 'tree-hosting-'))
  try {
    await git(['init', '--bare', '--quiet', '--template=', directory], directory)
    return await use(hostingRequest(directory, remote))
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

function hostingRequest(directory: string, remote: string): Request {
  const local = (...args: string[]) => git([`--git-dir=${directory}`, ...args], directory)
  const fetched = new Set<string>()
  const fetchCommit = async (sha: string) => {
    if (fetched.has(sha)) return
    const args = [`--git-dir=${directory}`, '-c', 'maintenance.auto=false', 'fetch', '--quiet', '--depth=1']
    await remoteGit([...args, '--no-tags', remote, sha], directory, 60000)
    fetched.add(sha)
  }

  return async (path, { method = 'GET' } = {}) => {
    const route = method === 'GET' && path.startsWith(`${root}/`) ? path.slice(root.length) : ''
    let match: RegExpExecArray | null

    if (route === '/git/ref/heads/main') {
      const refs = await remoteGit(['ls-remote', '--exit-code', remote, 'refs/heads/main'], directory)
      const sha = /^([a-f0-9]{40})\trefs\/heads\/main$/.exec(refs.toString('utf8').trim())?.[1]
      if (!sha) throw new Error('Invalid hosting commit')
      return { object: { sha } }
    }

    if ((match = /^\/git\/commits\/([a-f0-9]{40})$/.exec(route))) {
      await fetchCommit(match[1]!)
      const tree = (await local('rev-parse', '--verify', `${match[1]}^{tree}`)).toString('utf8').trim()
      if (!/^[a-f0-9]{40}$/.test(tree)) throw new Error('Invalid hosting tree')
      return { tree: { sha: tree } }
    }

    if ((match = /^\/git\/trees\/([a-f0-9]{40})\?recursive=1$/.exec(route))) {
      const output = (await local('ls-tree', '-r', '-l', '-z', '--full-tree', match[1]!)).toString('utf8')
      const tree = output
        .split('\0')
        .filter(Boolean)
        .map((record) => {
          const entry = /^(\d{6}) ([a-z]+) ([a-f0-9]{40}) +(\d+|-)\t(.+)$/s.exec(record)
          if (!entry) throw new Error('Invalid hosting tree')
          const [, mode, type, sha, size, path] = entry
          return { path: path!, mode: mode!, type: type!, sha: sha!, size: size === '-' ? -1 : Number(size) }
        })
      return { truncated: false, tree }
    }

    if ((match = /^\/git\/blobs\/([a-f0-9]{40})$/.exec(route))) {
      return blob(await local('cat-file', 'blob', match[1]!))
    }

    if ((match = /^\/contents\/([A-Za-z0-9_][A-Za-z0-9_.-]*)\?ref=([a-f0-9]{40})$/.exec(route))) {
      await fetchCommit(match[2]!)
      const listing = (await local('ls-tree', '-z', match[2]!, '--', match[1]!)).toString('utf8')
      if (!listing) throw new Error(UNREADABLE)
      // Like the Contents API, return content only for a regular file.
      const entry = /^100644 blob ([a-f0-9]{40})\t/.exec(listing)
      if (!entry) throw new Error('Invalid hosting file')
      return blob(await local('cat-file', 'blob', entry[1]!))
    }

    throw new Error('Unsupported hosting repository request')
  }
}
