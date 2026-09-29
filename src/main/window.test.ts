import { describe, expect, it, vi } from 'vitest'
import type { Session, WebContents } from 'electron'
import {
  configureRendererSessionSecurity,
  configureSingleInstance,
  createWindowWebPreferences,
  isAllowedExternalUrl,
  isAllowedRendererUrl,
  reportMainProcessError,
  resolveRendererUrl,
  surfaceWindow,
} from './window'

describe('createWindowWebPreferences', () => {
  it('isolates the renderer with the secure Electron settings', () => {
    expect(createWindowWebPreferences('/app/preload/index.js')).toEqual({
      preload: '/app/preload/index.js',
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    })
  })
})

describe('configureSingleInstance', () => {
  it('registers second-instance handling when the lock is acquired', () => {
    const app = { requestSingleInstanceLock: vi.fn(() => true), on: vi.fn() }
    const onSecondInstance = vi.fn()

    expect(configureSingleInstance(app, onSecondInstance)).toBe(true)
    expect(app.on).toHaveBeenCalledWith('second-instance', onSecondInstance)
  })

  it('does not register second-instance handling when another process owns the lock', () => {
    const app = { requestSingleInstanceLock: vi.fn(() => false), on: vi.fn() }

    expect(configureSingleInstance(app, vi.fn())).toBe(false)
    expect(app.on).not.toHaveBeenCalled()
  })
})

describe('reportMainProcessError', () => {
  it('reports Error messages with context', () => {
    const report = vi.fn()

    reportMainProcessError('Could not start', new Error('startup failed'), report)

    expect(report).toHaveBeenCalledWith('[Tree] Could not start: startup failed')
  })

  it('reports a safe message for non-Error failures', () => {
    const report = vi.fn()

    reportMainProcessError('Could not start', 'bad failure', report)

    expect(report).toHaveBeenCalledWith('[Tree] Could not start: Unknown error.')
  })
})

describe('surfaceWindow', () => {
  it('does nothing for a destroyed window', () => {
    const window = {
      isDestroyed: () => true,
      isFocused: () => false,
      isMinimized: () => false,
      restore: vi.fn(),
      show: vi.fn(),
      focus: vi.fn(),
    }
    surfaceWindow(window)
    expect(window.show).not.toHaveBeenCalled()
    expect(window.focus).not.toHaveBeenCalled()
  })

  it('does nothing for an active window', () => {
    const window = {
      isDestroyed: () => false,
      isFocused: () => true,
      isMinimized: () => false,
      restore: vi.fn(),
      show: vi.fn(),
      focus: vi.fn(),
    }
    surfaceWindow(window)
    expect(window.show).not.toHaveBeenCalled()
  })

  it('restores and focuses a minimized inactive window', () => {
    const window = {
      isDestroyed: () => false,
      isFocused: () => false,
      isMinimized: () => true,
      restore: vi.fn(),
      show: vi.fn(),
      focus: vi.fn(),
    }
    surfaceWindow(window)
    expect(window.restore).toHaveBeenCalledOnce()
    expect(window.show).toHaveBeenCalledOnce()
    expect(window.focus).toHaveBeenCalledOnce()
  })
})

describe('isAllowedExternalUrl', () => {
  it('allows HTTP and HTTPS URLs only', () => {
    expect(isAllowedExternalUrl('http://example.com')).toBe(true)
    expect(isAllowedExternalUrl('https://example.com/path')).toBe(true)
    expect(isAllowedExternalUrl('javascript:alert(1)')).toBe(false)
    expect(isAllowedExternalUrl('file:///tmp/example')).toBe(false)
  })

  it('rejects values that are not valid URLs', () => {
    expect(isAllowedExternalUrl('not a url')).toBe(false)
    expect(isAllowedExternalUrl('')).toBe(false)
  })
})

describe('isAllowedRendererUrl', () => {
  it('allows only the configured renderer document', () => {
    expect(isAllowedRendererUrl('file:///app/renderer/index.html', 'file:///app/renderer/index.html')).toBe(true)
    expect(isAllowedRendererUrl('file:///app/renderer/other.html', 'file:///app/renderer/index.html')).toBe(false)
    expect(isAllowedRendererUrl('https://evil.example/', 'file:///app/renderer/index.html')).toBe(false)
  })

  it('rejects values that are not valid URLs', () => {
    expect(isAllowedRendererUrl('not a url', 'file:///app/renderer/index.html')).toBe(false)
    expect(isAllowedRendererUrl('file:///app/renderer/index.html', 'not a url')).toBe(false)
  })
})

describe('resolveRendererUrl', () => {
  const packagedDocumentUrl = 'file:///app/renderer/index.html'

  it('ignores the environment URL in a packaged build', () => {
    expect(resolveRendererUrl(true, 'https://attacker.example/', packagedDocumentUrl)).toEqual({
      url: packagedDocumentUrl,
      isDevelopment: false,
    })
  })

  it('uses the environment URL in an unpackaged build', () => {
    expect(resolveRendererUrl(false, 'http://localhost:5173/', packagedDocumentUrl)).toEqual({
      url: 'http://localhost:5173/',
      isDevelopment: true,
    })
  })

  it('uses the packaged document URL in an unpackaged build without an environment URL', () => {
    expect(resolveRendererUrl(false, undefined, packagedDocumentUrl)).toEqual({
      url: packagedDocumentUrl,
      isDevelopment: false,
    })
  })
})

describe('configureRendererSessionSecurity', () => {
  type RequestFilterListener = (details: { url: string }, callback: (response: { cancel: boolean }) => void) => void

  function createSession(): {
    session: Pick<
      Session,
      'setPermissionRequestHandler' | 'setPermissionCheckHandler' | 'setDevicePermissionHandler' | 'webRequest'
    >
    onBeforeRequest: ReturnType<typeof vi.fn<(filter: { urls: string[] }, listener: RequestFilterListener) => void>>
  } {
    const onBeforeRequest = vi.fn<(filter: { urls: string[] }, listener: RequestFilterListener) => void>()
    const session = {
      setPermissionRequestHandler: vi.fn(),
      setPermissionCheckHandler: vi.fn(),
      setDevicePermissionHandler: vi.fn(),
      webRequest: { onBeforeRequest },
    } as unknown as Pick<
      Session,
      'setPermissionRequestHandler' | 'setPermissionCheckHandler' | 'setDevicePermissionHandler' | 'webRequest'
    >
    return { session, onBeforeRequest }
  }

  it('denies permission requests, checks, and device permission', () => {
    const { session } = createSession()
    configureRendererSessionSecurity(session, {
      url: 'file:///app/renderer/index.html',
      isDevelopment: false,
    })

    const requestHandler = vi.mocked(session.setPermissionRequestHandler).mock.calls[0]?.[0]
    const checkHandler = vi.mocked(session.setPermissionCheckHandler).mock.calls[0]?.[0]
    const deviceHandler = vi.mocked(session.setDevicePermissionHandler).mock.calls[0]?.[0]
    const requestCallback = vi.fn()

    requestHandler?.({} as WebContents, 'media', requestCallback, {} as never)

    expect(requestCallback).toHaveBeenCalledWith(false)
    expect(checkHandler?.(null, 'geolocation', 'https://example.com', {} as never)).toBe(false)
    expect(deviceHandler?.({} as never)).toBe(false)
  })

  it('allows local renderer schemes and only allows the resolved development origin', () => {
    const { session, onBeforeRequest } = createSession()
    configureRendererSessionSecurity(session, {
      url: 'http://localhost:5173/',
      isDevelopment: true,
    })

    const [filter, listener] = onBeforeRequest.mock.calls[0] ?? []
    expect(filter).toEqual({ urls: ['<all_urls>'] })
    expect(listener).toBeTypeOf('function')
    if (listener === undefined) throw new Error('The request filter was not installed.')

    const decisions: Array<{ url: string; cancel?: boolean }> = []
    for (const url of [
      'file:///app/renderer/index.html',
      'devtools://devtools/bundled/inspector.html',
      'blob:http://localhost:5173/1234',
      'data:text/plain,local',
      'http://localhost:5173/src/main.tsx',
      'https://example.com/document',
      'http://localhost:5174/other-origin',
    ]) {
      listener({ url } as never, (response) => decisions.push({ url, cancel: response.cancel }))
    }

    expect(decisions).toEqual([
      { url: 'file:///app/renderer/index.html', cancel: false },
      { url: 'devtools://devtools/bundled/inspector.html', cancel: false },
      { url: 'blob:http://localhost:5173/1234', cancel: false },
      { url: 'data:text/plain,local', cancel: false },
      { url: 'http://localhost:5173/src/main.tsx', cancel: false },
      { url: 'https://example.com/document', cancel: true },
      { url: 'http://localhost:5174/other-origin', cancel: true },
    ])
  })

  it('does not allow a remote origin in packaged mode', () => {
    const { session, onBeforeRequest } = createSession()
    configureRendererSessionSecurity(session, {
      url: 'file:///app/renderer/index.html',
      isDevelopment: false,
    })

    const listener = onBeforeRequest.mock.calls[0]?.[1]
    expect(listener).toBeTypeOf('function')
    if (listener === undefined) throw new Error('The request filter was not installed.')
    const callback = vi.fn()

    listener({ url: 'https://example.com/document' } as never, callback)

    expect(callback).toHaveBeenCalledWith({ cancel: true })
  })
})
