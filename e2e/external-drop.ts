import { expect, type Locator, type Page } from '@playwright/test'

/** Exercise native Chromium insertion, not dispatchEvent (which has no default edit action). */
export async function expectExternalDropBlocked(page: Page, editor: Locator): Promise<void> {
  const initialUrl = page.url()
  const initialText = await editor.evaluate((element) =>
    element instanceof HTMLTextAreaElement ? element.value : element.textContent,
  )
  const requests: string[] = []
  const onRequest = (request: { url(): string }): void => {
    if (request.url().includes('drop-probe.invalid')) requests.push(request.url())
  }
  page.on('request', onRequest)
  await page.route('https://drop-probe.invalid/**', (route) => route.abort())
  const observation = await page.evaluateHandle(() => {
    const added: string[] = []
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        for (const child of record.addedNodes) {
          if (
            child instanceof Element &&
            (child.matches('img,script,svg,iframe') || child.querySelector('img,script,svg,iframe'))
          )
            added.push(child.outerHTML)
        }
      }
    })
    observer.observe(document.body, { childList: true, subtree: true })
    return { added, observer }
  })
  const session = await page.context().newCDPSession(page)
  try {
    const box = (await editor.boundingBox())!
    const data = {
      items: [
        { mimeType: 'text/plain', data: 'External content' },
        {
          mimeType: 'text/html',
          data: '<b>External content</b><img src="https://drop-probe.invalid/image"><svg></svg><iframe></iframe>',
        },
        { mimeType: 'text/uri-list', data: 'https://drop-probe.invalid/navigation' },
      ],
      dragOperationsMask: 1,
    }
    for (const type of ['dragEnter', 'dragOver', 'drop'] as const) {
      await session.send('Input.dispatchDragEvent', { type, x: box.x + box.width / 2, y: box.y + box.height / 2, data })
    }
    // Settle native input and MutationObserver delivery; no persistence timer is needed.
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())))
    expect(await observation.evaluate(({ added }) => added), 'No transient external markup').toEqual([])
    expect(requests, 'No external resource request, even one later blocked by CSP').toEqual([])
    expect(
      await editor.evaluate((element) =>
        element instanceof HTMLTextAreaElement ? element.value : element.textContent,
      ),
    ).toBe(initialText)
    expect(page.url()).toBe(initialUrl)
  } finally {
    await observation.evaluate(({ observer }) => observer.disconnect())
    await observation.dispose()
    await session.detach()
    page.off('request', onRequest)
    await page.unroute('https://drop-probe.invalid/**')
  }
}
