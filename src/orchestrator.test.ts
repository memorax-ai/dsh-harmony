import { expect, test } from 'vitest'
import { analyzeModuleLoad, observeEntryLoad } from './orchestrator.js'

test('indexes module dependencies and metadata from effective patched source', () => {
  const source = `
import { value } from 'static-package'
export { other } from 're-exported-package'
export const inject = ['patched-service', 'shared-service']
export const provide = ['remote']
const lazy = () => import('lazy-package')
const commonjs = require('commonjs-package')
export function apply(ctx) {
  ctx.inject(['scoped-service'], () => {})
  if (value) ctx.provide('conditional-service', {})
}
`
  const plan = analyzeModuleLoad('/plugin/lib/index.js', source)

  expect(plan.dependencies).toEqual([
    { kind: 'import', specifier: 'static-package' },
    { kind: 'import', specifier: 're-exported-package' },
    { kind: 'dynamic-import', specifier: 'lazy-package' },
    { kind: 'require', specifier: 'commonjs-package' },
  ])
  expect(plan.declaredInject).toEqual(['patched-service', 'shared-service'])
  expect(plan.declaredProvide).toEqual(['remote'])
  expect(plan.scopedInject).toEqual(['scoped-service'])
  expect(plan.possibleProvide).toEqual(['conditional-service'])
  expect(plan.dynamicMetadata).toBe(false)
})

test('recognizes export-list metadata and treats unsupported provide objects as dynamic', () => {
  const exported = analyzeModuleLoad('/plugin/lib/export-list.js', `
const required = ['service']
const supplied = 'answer'
export { required as inject, supplied as provide }
`)
  expect(exported.declaredInject).toEqual(['service'])
  expect(exported.declaredProvide).toEqual(['answer'])
  expect(exported.dynamicMetadata).toBe(false)

  const unsupported = analyzeModuleLoad('/plugin/lib/object-provide.js', `
export const provide = { answer: true }
`)
  expect(unsupported.declaredProvide).toEqual([])
  expect(unsupported.dynamicMetadata).toBe(true)
})

test('keeps dynamic metadata as a hint until the imported plugin is observed', () => {
  const module = analyzeModuleLoad('/plugin/lib/index.js', `
const services = getServices()
export const inject = services
`)
  expect(module.declaredInject).toEqual([])
  expect(module.dynamicMetadata).toBe(true)

  const plugin = Object.assign(() => {}, {
    inject: { patched: {}, runtime: null },
    provide: ['answer'],
  })
  const entry = observeEntryLoad({
    id: 'entry',
    name: 'plugin',
    generation: 4,
    entryInject: ['configured', 'patched'],
    plugin,
  })
  expect(entry.inject).toEqual(['patched', 'runtime', 'configured'])
  expect(entry.provide).toEqual(['answer'])
})

test('reuses analysis by effective source fingerprint across filenames and generations', () => {
  const source = `export const inject = ['service']\n`
  const first = analyzeModuleLoad('/first/index.js', source)
  const second = analyzeModuleLoad('/second/index.js', source)
  const changed = analyzeModuleLoad('/second/index.js', `${source}export const value = 1\n`)

  expect(second.fingerprint).toBe(first.fingerprint)
  expect(changed.fingerprint).not.toBe(first.fingerprint)
})
