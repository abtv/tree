export type Bump = 'patch' | 'minor' | 'major'

export function parseVersion(version: string) {
  const match =
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+[0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*)?$/.exec(
      version,
    )
  if (!match || match[0] !== version) throw new Error(`Invalid semantic version: ${version}`)
  return { core: match.slice(1, 4).map(BigInt), prerelease: match[4] }
}

export function compareVersions(left: string, right: string) {
  const a = parseVersion(left)
  const b = parseVersion(right)
  for (let i = 0; i < 3; i++) {
    if (a.core[i] !== b.core[i]) return a.core[i]! > b.core[i]! ? 1 : -1
  }
  if (a.prerelease === b.prerelease) return 0
  if (a.prerelease === undefined) return 1
  if (b.prerelease === undefined) return -1
  const x = a.prerelease.split('.')
  const y = b.prerelease.split('.')
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    if (x[i] === y[i]) continue
    if (x[i] === undefined) return -1
    if (y[i] === undefined) return 1
    const xn = /^\d+$/.test(x[i]!)
    const yn = /^\d+$/.test(y[i]!)
    if (xn && yn) return BigInt(x[i]!) > BigInt(y[i]!) ? 1 : -1
    if (xn !== yn) return xn ? -1 : 1
    return x[i]! > y[i]! ? 1 : -1
  }
  return 0
}

export function packageVersion(texts: string[]) {
  const manifest = JSON.parse(texts[0]!) as { version: string }
  const lock = JSON.parse(texts[1]!) as { version: string; packages: Record<string, { version: string }> }
  parseVersion(manifest.version)
  if (lock.version !== manifest.version || lock.packages['']?.version !== manifest.version) {
    throw new Error('Package and lockfile versions must match')
  }
  return { manifest, lock, version: manifest.version }
}

export function bumpVersion(texts: string[], bump: Bump) {
  const { manifest, lock, version: previous } = packageVersion(texts)
  const [major, minor, patch] = parseVersion(previous).core as [bigint, bigint, bigint]
  const version =
    bump === 'major'
      ? `${major + 1n}.0.0`
      : bump === 'minor'
        ? `${major}.${minor + 1n}.0`
        : `${major}.${minor}.${patch + 1n}`
  manifest.version = lock.version = lock.packages['']!.version = version
  return { version, texts: [manifest, lock].map((value) => JSON.stringify(value, null, 2) + '\n') }
}
