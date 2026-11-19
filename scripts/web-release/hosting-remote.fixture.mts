import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, symlink, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

// Creates a local bare repository whose main branch contains exactly these
// files. An entry `{ link }` becomes a symbolic link to that target.
export async function hostingRemote(files: Record<string, string | Buffer | { link: string }>) {
  await mkdir('.scratch/web-release/hosting-tests', { recursive: true })
  const base = resolve(await mkdtemp('.scratch/web-release/hosting-tests/case-'))
  const repository = join(base, 'hosting.git')
  const work = join(base, 'work')
  await mkdir(work)
  for (const [path, value] of Object.entries(files)) {
    await mkdir(dirname(join(work, path)), { recursive: true })
    if (typeof value === 'object' && 'link' in value) await symlink(value.link, join(work, path))
    else await writeFile(join(work, path), value)
  }

  execFileSync('git', ['init', '--bare', '--quiet', '--template=', repository])
  const git = (...args: string[]) =>
    execFileSync(
      'git',
      ['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', `--git-dir=${repository}`, ...args],
      { cwd: work, encoding: 'utf8' },
    ).trim()
  git(`--work-tree=${work}`, 'add', '--all')
  const tree = git('write-tree')
  const commit = git('commit-tree', tree, '-m', 'Hosting fixture')
  git('update-ref', 'refs/heads/main', commit)

  return { url: pathToFileURL(repository).href, commit, tree, git }
}
