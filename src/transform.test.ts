import { createRequire } from 'node:module'
import { describe, expect, test } from 'vitest'
import type { HarmonySourcePatch } from './index.js'
import { applySourcePatch } from './transform.js'

const require = createRequire(import.meta.url)
const { sessionProfileTarget } = require('../lib/builtins/dsh-compat.cjs') as {
  sessionProfileTarget(version: string): import('./index.js').HarmonyPatchTarget
}

function selected(source: string, selector: string): string[] {
  const matches: string[] = []
  applySourcePatch(
    '/tmp/automaton.js',
    'fixture/automaton.js',
    source,
    source,
    { key: `fixture/${selector}`, owner: 'fixture', declaration: 'fixture' },
    {
      id: 'automaton',
      target: { package: 'fixture', file: 'automaton.js' },
      select: selector,
      apply({ node, sourceFile }) { matches.push(node.getText(sourceFile)) },
    },
    [],
    () => [],
  )
  return matches
}

describe('incremental query automaton', () => {
  const source = 'const values = [1, 2, 3]; const outside = 4\n'

  test.each([
    ['NumericLiteral[text="1"] + NumericLiteral', ['2']],
    ['NumericLiteral[text="1"] ~ NumericLiteral', ['2', '3']],
    ['NumericLiteral:nth-child(2)', ['2']],
    ['NumericLiteral:nth-last-child(1)', ['3']],
    ['ArrayLiteralExpression > .elements', ['1', '2', '3']],
  ])('matches complete TSQuery context for %s', (selector, expected) => {
    expect(selected(source, selector)).toEqual(expected)
  })

  test('relinks unchanged Merkle subtrees after an unrelated source change', () => {
    const selector = 'NumericLiteral[text="1"] ~ NumericLiteral'
    expect(selected(source, selector)).toEqual(['2', '3'])
    expect(selected(source.replace('outside = 4', 'outside = 400'), selector)).toEqual(['2', '3'])
  })
})

test('reuses an exact Patch transition until its fingerprint changes', () => {
  const source = 'export const value = 1\n'
  let applications = 0
  const patch = {
    id: 'transition',
    target: { package: 'fixture', file: 'transition.js' },
    select: 'NumericLiteral',
    expect: 1,
    apply({ node, edit }: Parameters<import('./index.js').HarmonySourcePatch['apply']>[0]) {
      applications += 1
      edit.overwrite(node.getStart(), node.getEnd(), '2')
    },
  }
  const apply = (fingerprint: string) => applySourcePatch(
    '/tmp/transition-cache.js',
    'fixture/transition.js',
    source,
    source,
    { key: 'fixture/transition', owner: 'fixture', declaration: 'fixture', fingerprint },
    patch,
    [],
    () => [],
  ).source

  expect(apply('v1')).toContain('value = 2')
  expect(apply('v1')).toContain('value = 2')
  expect(applications).toBe(1)
  expect(apply('v2')).toContain('value = 2')
  expect(applications).toBe(2)
})

test('keeps legacy and DSH 0.1.2 session targets in separate version lanes', () => {
  expect(sessionProfileTarget('0.1.1-rc.2')).toEqual({
    package: '@deepseek-ai/dsh-client-runtime',
    version: '>=0.1.0-rc.8 <0.1.2-0',
    file: 'lib/client.js',
  })
  expect(sessionProfileTarget('0.1.2-alpha.4')).toEqual({
    package: '@deepseek-ai/dsh-api-session-controller',
    version: '>=0.1.2-alpha.4 <0.1.3-0',
    file: 'lib/client.js',
  })
})

test('adapts the DSH 0.1.2 loader-aware client package resolver', () => {
  const patches = require('../lib/builtins/client-load-plan.patch.cjs') as HarmonySourcePatch[]
  const patch = patches.find(candidate => candidate.id === 'client-package-resolution')!
  const source = `
class ClientModules {
  resolveMeta(loaderName, baseUrl) {
    const located = this.locatePkgJson(loaderName, baseUrl)
    if (located === void 0) return null
    const { packageName, path: pkgPath } = located
    return { packageName, pkgPath }
  }
}
`
  const transformed = applySourcePatch(
    '/tmp/dsh-client-modules-012.js',
    '@deepseek-ai/dsh-client-modules/lib/index.js',
    source,
    source,
    { key: 'dsh-harmony/client-package-resolution', owner: 'dsh-harmony', declaration: 'fixture', fingerprint: '012' },
    patch,
    [],
    () => [],
  )
  expect(transformed.matches).toBe(1)
  expect(transformed.source).toContain('__dshHarmonyResolvePackageManifest?.(loaderName)')
  expect(transformed.source).toContain('this.locatePkgJson(loaderName, baseUrl)')
  expect(transformed.source).toContain('packageName: JSON.parse(readFileSync(harmonyPath, "utf8")).name')
})
