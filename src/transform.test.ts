import { createRequire } from 'node:module'
import { describe, expect, test } from 'vitest'
import { tsquery } from '@phenomnomnominal/tsquery'
import type { HarmonySourcePatch } from './index.js'
import { applySourceDelta, applySourcePatch, parseSource, type SourceAst } from './transform.js'

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

test('isolates cached Patch outputs by target filename', () => {
  const source = 'export const value = 1\n'
  const patch: HarmonySourcePatch = {
    id: 'filename',
    target: { package: 'fixture', file: 'index.js' },
    select: 'SourceFile', expect: 1,
    apply({ sourceFile, edit }) { edit.append(`// ${sourceFile.fileName}\n`) },
  }
  const apply = (filename: string) => applySourcePatch(
    filename, 'fixture/index.js', source, source,
    { key: 'fixture/filename', owner: 'fixture', declaration: 'fixture' },
    patch, [], () => [],
  ).source
  expect(apply('/tmp/profile-a/index.js')).toContain('// /tmp/profile-a/index.js')
  expect(apply('/tmp/profile-b/index.js')).toContain('// /tmp/profile-b/index.js')
})

test.each(['appendLeft', 'appendRight', 'prependLeft', 'prependRight'] as const)(
  'reconstructs the output of %s outside the source range', method => {
    const source = 'const value = 1\n'
    const result = applySourcePatch(
      `/tmp/outside-${method}.js`, 'fixture/index.js', source, source,
      { key: `fixture/outside-${method}`, owner: 'fixture', declaration: 'fixture' },
      {
        id: method, target: { package: 'fixture', file: 'index.js' },
        select: 'SourceFile', expect: 1,
        apply({ edit }) { edit[method](-1, '// inserted\n') },
      }, [], () => [],
    )
    expect(applySourceDelta(source, result.delta)).toBe(result.source)
  },
)

test('invalidates position-dependent queries when leading trivia shifts nodes', () => {
  const source = 'const values = [1, 2, 3, 4, 5, 6, 7, 8];\n'
  const selector = `NumericLiteral[pos=${source.indexOf('1')}]`
  const apply = (text: string, count: number) => applySourcePatch(
    '/tmp/positions.js', 'fixture/index.js', text, text,
    { key: 'fixture/positions', owner: 'fixture', declaration: 'fixture' },
    {
      id: 'positions', target: { package: 'fixture', file: 'index.js' },
      select: selector, expect: count, apply() {},
    }, [], () => [],
  ).matches
  expect(apply(source, 1)).toBe(1)
  expect(apply(`// prefix\n${source}`, 0)).toBe(0)
})

test.each(['NumericLiteral', 'Identifier', 'SyntaxList', '*'])(
  'resolves cached %s nodes in a fresh AST in source order', selector => {
    const filename = `/tmp/cached-locators-${selector}.js`
    const source = Array.from({ length: 200 }, (_, index) =>
      `const value${index} = [${index}, () => ({})];`).join('\n')
    const coordinates = (node: import('typescript').Node) => [node.kind, node.pos, node.end]
    const expected = tsquery(parseSource(filename, source), selector)
      .sort((left, right) => left.pos - right.pos || right.end - left.end).map(coordinates)
    const apply = (ast?: SourceAst) => {
      const nodes: number[][] = []
      const result = applySourcePatch(
        filename, 'fixture/index.js', source, source,
        { key: `fixture/locators-${selector}`, owner: 'fixture', declaration: 'fixture' },
        {
          id: 'locators', target: { package: 'fixture', file: 'index.js' },
          select: selector, expect: expected.length,
          apply({ node }) { nodes.push(coordinates(node)) },
        }, [], () => [], ast,
      )
      expect(nodes).toEqual(expected)
      return result.sourceAst
    }
    const first = apply()
    apply({ sourceFile: parseSource(filename, source), fingerprint: first.fingerprint })
  },
)

test('keeps legacy and modern DSH session targets in separate version lanes', () => {
  expect(sessionProfileTarget('0.1.1-rc.2')).toEqual({
    package: '@deepseek-ai/dsh-client-runtime',
    version: '>=0.1.0-rc.8 <0.1.2-0',
    file: 'lib/client.js',
  })
  for (const version of ['0.1.2-alpha.4', '0.1.3-alpha.2', '0.1.5-rc.2', '0.1.6-alpha.2', '0.1.7-rc.2', '0.2.0-rc.1']) {
    expect(sessionProfileTarget(version)).toEqual({
      package: '@deepseek-ai/dsh-api-session-controller',
      version: '>=0.1.2-alpha.4 <0.1.8-0 || >=0.2.0-rc.1 <0.2.1-0 || 0.2.1-alpha.2',
      file: 'lib/client.js',
    })
  }
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
