import { describe, expect, test } from 'vitest'
import { applySourcePatch } from './transform.js'

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
