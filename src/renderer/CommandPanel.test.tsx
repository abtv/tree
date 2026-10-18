// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { commandRegistry, type CommandContext } from '../application/command-registry'
import { CommandPanel } from './CommandPanel'
import { APPLE_SHORTCUTS } from './shortcut-profile'

const originalScrollIntoView = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollIntoView')

beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() })
})

afterEach(() => {
  cleanup()
  if (originalScrollIntoView === undefined) Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView')
  else Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', originalScrollIntoView)
})

const context: CommandContext = { alwaysOnTop: false, appearance: 'system', vimEnabled: false, view: 'tree' }

describe('command panel presentation', () => {
  // @requirement PRODUCT.md §20.2.28
  it('shows the quit shortcut with the Apple profile by default and no label for other commands', () => {
    render(<CommandPanel matches={commandRegistry} selected={0} context={context} run={vi.fn()} />)
    const rows = screen.getAllByRole('option')
    const labels = new Map(rows.map((row) => [row.querySelector('.command-name')?.textContent, row]))
    expect(labels.get('quit')?.querySelector('.command-shortcut')?.textContent).toBe('⌘Q')
    expect(labels.get('show-tree')?.querySelector('.command-shortcut')?.textContent).toBe('')
  })

  // @requirement PRODUCT.md §20.2.28
  it('formats the shortcut with the injected profile', () => {
    const shortcuts = { ...APPLE_SHORTCUTS, format: () => 'formatted' }
    render(
      <CommandPanel matches={commandRegistry} selected={0} context={context} run={vi.fn()} shortcuts={shortcuts} />,
    )
    const quit = screen.getAllByRole('option').find((row) => row.id === 'command-quit')!
    expect(quit.querySelector('.command-shortcut')?.textContent).toBe('formatted')
  })
})
