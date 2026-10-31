import type { Plugin } from 'vite'
import { readFileSync } from 'node:fs'
import { packageVersion, parseVersion } from '../release-version.mts'
import { buildDateLabel } from '../build-info.mts'

export function appVersionLabel(version: string, builtAt: Date): string {
  parseVersion(version)

  return `Version ${version} · ${buildDateLabel(builtAt)}`
}

export function appVersionPlugin(): Plugin {
  const { version } = packageVersion(
    ['../../package.json', '../../package-lock.json'].map((path) =>
      readFileSync(new URL(path, import.meta.url), 'utf8'),
    ),
  )
  const label = appVersionLabel(version, new Date())

  return {
    name: 'browser-app-version',
    transformIndexHtml(html) {
      return html.replace('<span id="app-version"></span>', `<span id="app-version">${label}</span>`)
    },
  }
}
