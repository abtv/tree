import { expect, it } from 'vitest'
import { assertMemoryBudget, memoryViolations } from './memory-budget'

const budget = { heap: { maxBytes: 200, growthBytes: 20 } }

it('accepts bounded noise and reclamation without requiring monotonic samples', () => {
  expect(memoryViolations([{ heap: 100 }, { heap: 115 }, { heap: 95 }, { heap: 120 }], budget)).toEqual([])
})

it('rejects a fast leak even when the final sample returns below the limit', () => {
  expect(() => assertMemoryBudget([{ heap: 100 }, { heap: 121 }, { heap: 100 }], budget)).toThrow('growth 21')
})

it('rejects a high starting footprint even with no growth', () => {
  expect(() => assertMemoryBudget([{ heap: 201 }, { heap: 201 }], budget)).toThrow('ceiling 200')
})

it('fails closed for absent, zero, negative or non-finite metrics', () => {
  for (const value of [undefined, 0, -1, NaN, Infinity]) {
    const sample = value === undefined ? {} : { heap: value }
    expect(() => assertMemoryBudget([sample], budget)).toThrow('invalid measurement')
  }
  expect(() => assertMemoryBudget([], budget)).toThrow('No memory samples')
})

it('checks every process metric and rejects invalid budgets', () => {
  expect(() => assertMemoryBudget([{ heap: 100 }], {})).toThrow('No memory budgets')
  expect(() => assertMemoryBudget([{ heap: 100, main: 500 }], { ...budget, main: { maxBytes: 400 } })).toThrow('main')
  for (const maxBytes of [0, -1, Infinity, NaN]) {
    expect(() => assertMemoryBudget([{ heap: 1 }], { heap: { maxBytes } })).toThrow('Invalid memory budget')
  }
})
