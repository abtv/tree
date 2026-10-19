import type { Protocol } from 'electron'
import { extname, resolve, sep } from 'node:path'

// The packaged renderer is served from this origin instead of file://, so renderer code shares an
// origin with its own bundle only and cannot address other local files.
export const rendererScheme = 'app'
export const packagedRendererUrl = `${rendererScheme}://tree/index.html`

// Only the asset types the renderer build emits; add a type when the build starts emitting it.
const contentTypes: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.ttf': 'font/ttf',
}

export function registerRendererScheme(protocol: Pick<Protocol, 'registerSchemesAsPrivileged'>): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: rendererScheme, privileges: { standard: true, secure: true, supportFetchAPI: true, codeCache: true } },
  ])
}

// Maps a renderer protocol URL to a file inside the renderer directory, or null when the URL names
// another origin, an unknown file type, or a path that would leave the directory.
export function resolveRendererAssetPath(rootDirectory: string, requestUrl: string): string | null {
  let url: URL
  let rendererUrl: URL
  let path: string
  try {
    url = new URL(requestUrl)
    rendererUrl = new URL(packagedRendererUrl)
    path = decodeURIComponent(url.pathname)
  } catch {
    return null
  }
  if (url.protocol !== rendererUrl.protocol || url.host !== rendererUrl.host) return null
  if (/[\\\0]/.test(path) || path.split('/').includes('..')) return null

  const root = resolve(rootDirectory)
  const file = resolve(root, `.${path}`)
  if (!file.startsWith(root + sep) || contentTypes[extname(file).toLowerCase()] === undefined) return null
  return file
}

export function handleRendererProtocol(
  protocol: Pick<Protocol, 'handle'>,
  rootDirectory: string,
  readFile: (path: string) => Promise<Uint8Array>,
): void {
  // A network error, unlike an HTTP 404 page, makes loadURL reject, so a missing renderer document
  // reaches the main process's report-and-quit path instead of leaving a blank window.
  protocol.handle(rendererScheme, async (request) => {
    const file = resolveRendererAssetPath(rootDirectory, request.url)
    if (file === null) return Response.error()
    try {
      const body = await readFile(file)
      return new Response(new Uint8Array(body), {
        headers: {
          'Content-Type': contentTypes[extname(file).toLowerCase()]!,
          'X-Content-Type-Options': 'nosniff',
        },
      })
    } catch {
      return Response.error()
    }
  })
}
