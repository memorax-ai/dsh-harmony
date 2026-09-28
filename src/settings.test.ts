import { expect, test, vi } from 'vitest'
import { apply, inject } from './settings.js'

test('registers the Harmony plugin-page namespace after settings is available', () => {
  const register = vi.fn()
  apply({ settings: { register } } as never)

  expect(inject).toEqual(['settings'])
  expect(register).toHaveBeenCalledOnce()
  expect(String(register.mock.calls[0]![0])).toBe('dsh-harmony')
  expect(register.mock.calls[0]![2]).toEqual({ applies: 'restart' })
})

test('suppresses the empty generated form with the modern settings service', () => {
  const dispose = vi.fn()
  const configure = vi.fn(() => dispose)
  const effect = vi.fn((register: () => () => void) => register())
  apply({ settings: { configure }, effect } as never)

  expect(configure).toHaveBeenCalledWith({ auto: false })
  expect(effect).toHaveBeenCalledOnce()
})
