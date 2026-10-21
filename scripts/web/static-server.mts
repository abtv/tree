import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { resolve, sep, extname } from 'node:path'
import { pathToFileURL } from 'node:url'

const root = resolve(import.meta.dirname, '../../out/web')
const types: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.ttf': 'font/ttf',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
}

export function createStaticServer() {
  return createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url!, 'http://localhost').pathname)
      const file = resolve(root, `.${pathname.endsWith('/') ? `${pathname}index.html` : pathname}`)
      if (!file.startsWith(`${root}${sep}`)) {
        response.writeHead(403).end()
        return
      }
      const bytes = await readFile(file)
      response.writeHead(200, {
        'Content-Type': types[extname(file)] ?? 'application/octet-stream',
        'Cache-Control': 'no-store',
      })
      response.end(bytes)
    } catch {
      response.writeHead(404).end()
    }
  })
}

if (import.meta.url === pathToFileURL(process.argv[1]!).href) {
  const server = createStaticServer()
  server.listen(5175, '127.0.0.1', () => console.log('Built Tree: http://127.0.0.1:5175/'))
}
