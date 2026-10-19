import type { Protocol } from 'electron'
import { join, resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  handleRendererProtocol,
  packagedRendererUrl,
  registerRendererScheme,
  rendererScheme,
  resolveRendererAssetPath,
} from './renderer-protocol'

const root = resolve('/app/out/renderer')

describe('registerRendererScheme', () => {
  it('registers one standard, secure scheme with fetch and code cache support', () => {
    const protocol = { registerSchemesAsPrivileged: vi.fn() }

    registerRendererScheme(protocol)

    expect(protocol.registerSchemesAsPrivileged).toHaveBeenCalledWith([
      { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, codeCache: true } },
    ])
    expect(packagedRendererUrl).toBe('app://tree/index.html')
  })
})

describe('resolveRendererAssetPath', () => {
  it('maps renderer URLs to files inside the renderer directory', () => {
    expect(resolveRendererAssetPath(root, 'app://tree/index.html')).toBe(join(root, 'index.html'))
    expect(resolveRendererAssetPath(root, 'app://tree/assets/index-abc.js?v=1#x')).toBe(
      join(root, 'assets', 'index-abc.js'),
    )
    expect(resolveRendererAssetPath(root, 'app://tree/assets/font%20name.ttf')).toBe(
      join(root, 'assets', 'font name.ttf'),
    )
  })

  it('keeps dot segments, which the URL parser collapses at the origin root, inside the directory', () => {
    expect(resolveRendererAssetPath(root, 'app://tree/../../data/index.js')).toBe(join(root, 'data', 'index.js'))
    expect(resolveRendererAssetPath(root, 'app://tree/assets/%2e%2e/%2e%2e/secret.js')).toBe(join(root, 'secret.js'))
  })

  it.each([
    'app://tree/',
    'app://tree/assets',
    'app://tree/assets/..%2F..%2F..%2Fdata%2Fdocument.json',
    'app://tree/assets/..%5C..%5Csecret.js',
    'app://tree/assets/name%00.js',
    'app://tree/%E0%A4%A.js',
    'app://tree/assets/archive.zip',
    'app://tree/assets/image.svg',
    'app://other/index.html',
    'file:///app/out/renderer/index.html',
    'not a url',
  ])('rejects %s', (url) => {
    expect(resolveRendererAssetPath(root, url)).toBeNull()
  })
})

describe('handleRendererProtocol', () => {
  type Handler = (request: Request) => Promise<Response>

  function install(readFile: (path: string) => Promise<Uint8Array>): Handler {
    const protocol = { handle: vi.fn() }
    handleRendererProtocol(protocol as unknown as Pick<Protocol, 'handle'>, root, readFile)
    expect(protocol.handle).toHaveBeenCalledWith(rendererScheme, expect.any(Function))
    return protocol.handle.mock.calls[0]![1] as Handler
  }

  it('serves a renderer file with its content type and nosniff', async () => {
    const readFile = vi.fn(async () => new TextEncoder().encode('body { }'))
    const handler = install(readFile)

    const response = await handler(new Request('app://tree/assets/index.css'))

    expect(readFile).toHaveBeenCalledWith(join(root, 'assets', 'index.css'))
    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('text/css; charset=utf-8')
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff')
    expect(await response.text()).toBe('body { }')
  })

  it('answers a network error without reading a file outside the renderer directory', async () => {
    const readFile = vi.fn(async () => new Uint8Array())
    const handler = install(readFile)

    const response = await handler(new Request('app://tree/assets/..%2F..%2Fdata%2Fdocument.js'))

    expect(response.type).toBe('error')
    expect(readFile).not.toHaveBeenCalled()
  })

  it('answers a network error when the file cannot be read', async () => {
    const handler = install(async () => {
      throw new Error('ENOENT')
    })

    const response = await handler(new Request('app://tree/missing.js'))

    expect(response.type).toBe('error')
  })
})
