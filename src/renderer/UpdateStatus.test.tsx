// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { UpdateStatus } from './UpdateStatus'
import type { TreeApi, UpdateCommandsState } from '../shared/ipc'

afterEach(cleanup)

it('keeps newer events over a late snapshot and restores progress after feedback', async () => {
  let listener!: (state: UpdateCommandsState) => void
  let resolve!: (state: UpdateCommandsState) => void
  const stop = vi.fn()
  window.treeApi = {
    getUpdateCommands: () =>
      new Promise((done) => {
        resolve = done
      }),
    onUpdateCommandsChanged: (changed: (state: UpdateCommandsState) => void) => {
      listener = changed
      return stop
    },
  } as unknown as TreeApi
  const state = { 'check-for-updates': false, 'update-app': false }
  const view = render(<UpdateStatus hidden={false} />)

  await act(async () => {
    listener({ ...state, status: 42 })
    resolve({ ...state, status: null })
  })
  expect(screen.getByText('Downloading update… 42%')).toBeTruthy()

  view.rerender(<UpdateStatus hidden />)
  expect(screen.queryByText('Downloading update… 42%')).toBeNull()
  act(() => listener({ ...state, status: 'ready' }))
  view.rerender(<UpdateStatus hidden={false} />)
  expect(screen.getByText('Update ready')).toBeTruthy()
  expect(screen.queryByRole('button')).toBeNull()

  view.unmount()
  expect(stop).toHaveBeenCalledOnce()
})
