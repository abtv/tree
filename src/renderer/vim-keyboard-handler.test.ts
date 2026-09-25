import { describe, expect, it } from 'vitest'
import { resolveLinkCrossing } from './vim-keyboard-handler'

describe('resolveLinkCrossing', () => {
  const link = { start: 5, end: 20, url: 'https://example.test' }

  it('leaves the target unchanged when there are no links', () => {
    expect(resolveLinkCrossing(undefined, 0, 10)).toBe(10)
  })

  it('leaves the target unchanged when it does not move', () => {
    expect(resolveLinkCrossing([link], 10, 10)).toBe(10)
  })

  it('leaves a target outside every link unchanged', () => {
    expect(resolveLinkCrossing([link], 0, 3)).toBe(3)
    expect(resolveLinkCrossing([link], 25, 22)).toBe(22)
  })

  it('leaves a target exactly at a link boundary unchanged', () => {
    expect(resolveLinkCrossing([link], 0, 5)).toBe(5)
    expect(resolveLinkCrossing([link], 25, 20)).toBe(20)
  })

  it('jumps to the far side of the link when moving forward into it', () => {
    expect(resolveLinkCrossing([link], 4, 6)).toBe(20)
    expect(resolveLinkCrossing([link], 5, 19)).toBe(20)
  })

  it('jumps to the near side of the link when moving backward into it', () => {
    expect(resolveLinkCrossing([link], 21, 19)).toBe(5)
    expect(resolveLinkCrossing([link], 20, 6)).toBe(5)
  })

  it('resolves against whichever link the target lands inside', () => {
    const second = { start: 30, end: 40, url: 'https://second.test' }
    expect(resolveLinkCrossing([link, second], 25, 35)).toBe(40)
    expect(resolveLinkCrossing([link, second], 45, 35)).toBe(30)
  })
})
