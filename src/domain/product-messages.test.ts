import { describe, expect, it } from 'vitest'
import {
  CUT_CONFLICT_ERROR,
  GENERIC_OPERATION_ERROR,
  IMAGE_LOAD_ERROR,
  MAX_DOCUMENT_DEPTH_ERROR,
  OPERATION_ERROR_PREFIX,
  QUIT_SAVE_ERROR,
  SAVE_ERROR_PREFIX,
} from './product-messages'

describe('product messages', () => {
  it('matches the approved user-visible text', () => {
    expect(MAX_DOCUMENT_DEPTH_ERROR).toBe('Nodes cannot be nested deeper than 20 levels.')
    expect(CUT_CONFLICT_ERROR).toBe('The cut could not finish because the text changed.')
    expect(IMAGE_LOAD_ERROR).toBe('Image could not be loaded.')
    expect(SAVE_ERROR_PREFIX).toBe('Changes could not be saved:')
    expect(OPERATION_ERROR_PREFIX).toBe('Operation failed:')
    expect(QUIT_SAVE_ERROR).toBe('The application could not finish saving before quit.')
    expect(GENERIC_OPERATION_ERROR).toBe('The editor could not complete the requested operation.')
  })
})
