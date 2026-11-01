import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'

const dependencyFields = ['dependencies', 'devDependencies', 'optionalDependencies'] as const

type Manifest = Partial<Record<(typeof dependencyFields)[number], Record<string, string>>>

const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as Manifest
const lockfile = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8')) as {
  packages: Record<string, Manifest & { version?: string }>
}

it('declares exact versions for every direct dependency under ADR 0006', () => {
  for (const field of dependencyFields) {
    for (const [name, version] of Object.entries(manifest[field] ?? {})) {
      expect(version, `${field}.${name} must use an exact version`).toMatch(
        /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/,
      )
    }
  }
})

it('keeps direct dependency declarations and resolved lockfile versions synchronized', () => {
  for (const field of dependencyFields) {
    expect(lockfile.packages['']?.[field] ?? {}, `lockfile ${field}`).toEqual(manifest[field] ?? {})

    for (const [name, version] of Object.entries(manifest[field] ?? {})) {
      expect(lockfile.packages[`node_modules/${name}`]?.version, `locked ${name}`).toBe(version)
    }
  }
})
