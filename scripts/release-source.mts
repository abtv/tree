import { api } from './web-release/github.mts'
import type { Request } from './web-release/types.mts'
import { compareVersions, parseVersion } from './release-version.mts'
import { isNewWebVersion } from './web-release/version.mts'

const root = '/repos/abtv/tree'
type Tag = { name: string; commit: { sha: string } }
type Release = { tag_name: string }

async function list<T>(path: string, request: Request, token?: string): Promise<T[]> {
  const values: T[] = []
  for (let page = 1; page <= 100; page++) {
    const result = await request(`${root}/${path}?per_page=100&page=${page}`, { token })
    if (!Array.isArray(result)) throw new Error('Invalid release state')
    values.push(...result)
    if (result.length < 100) return values
  }
  throw new Error('Too much release state')
}

export async function releaseSourceState(version: string, sha: string, request: Request = api, token?: string) {
  parseVersion(version)
  if (!/^[a-f0-9]{40}$/.test(sha)) throw new Error('Invalid release source SHA')
  const tags = await list<Tag>('tags', request, token)
  const releases = await list<Release>('releases', request, token)
  const name = `v${version}`
  for (const other of [...tags.map((tag) => tag.name), ...releases.map((release) => release.tag_name)]) {
    if (typeof other !== 'string') throw new Error('Invalid release version name')
    if (!other.startsWith('v')) continue
    try {
      parseVersion(other.slice(1))
    } catch {
      continue
    }
    const order = compareVersions(other.slice(1), version)
    if (order > 0 || (order === 0 && other !== name)) return 'unavailable'
  }
  const tag = tags.find((tag) => tag.name === name)
  if (tag) return tag.commit?.sha === sha ? 'reserved' : 'unavailable'
  if (releases.some((release) => release.tag_name === name)) return 'unavailable'
  return 'new'
}

export async function requireReleaseSource(version: string, sha: string, request: Request = api, token?: string) {
  if ((await releaseSourceState(version, sha, request, token)) !== 'reserved') {
    throw new Error('Release version is not reserved for this source commit')
  }
}

export async function reserveReleaseSource(version: string, sha: string, request: Request = api, token?: string) {
  const head = (await request(`${root}/git/ref/heads/main`, { token })) as { object: { sha: string } }
  if (head.object?.sha !== sha) throw new Error('Release source is stale')
  const state = await releaseSourceState(version, sha, request, token)
  if (state === 'unavailable') throw new Error('Release version belongs to another source or is obsolete')
  if (state === 'new') {
    // Legacy web releases may predate the shared tag reservation.
    if (!(await isNewWebVersion(version, { request, token, sourceSha: sha }))) {
      throw new Error('Unreserved version is not newer than the web release')
    }
    // Never update a ref. A competing reservation fails closed; retry reconciles it.
    await request(`${root}/git/refs`, {
      token,
      method: 'POST',
      body: { ref: `refs/tags/v${version}`, sha },
    })
  }
  await requireReleaseSource(version, sha, request, token)
}
