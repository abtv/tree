import type { Plugin } from 'vite'

export function appVersionLabel(runNumber: string | undefined, builtAt: Date): string {
  if (runNumber !== undefined && !/^[1-9]\d*$/.test(runNumber)) {
    throw new Error('GITHUB_RUN_NUMBER must be a positive integer')
  }

  const date = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(builtAt)

  return `${runNumber === undefined ? 'Local build' : `Version ${runNumber}`} · ${date}`
}

export function appVersionPlugin(): Plugin {
  const label = appVersionLabel(process.env.GITHUB_RUN_NUMBER, new Date())

  return {
    name: 'browser-app-version',
    transformIndexHtml(html) {
      return html.replace('<span id="app-version"></span>', `<span id="app-version">${label}</span>`)
    },
  }
}
