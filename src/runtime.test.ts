import { channel } from 'node:diagnostics_channel'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, realpathSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { Readable } from 'node:stream'
import { setTimeout as delay } from 'node:timers/promises'
import { pathToFileURL } from 'node:url'
import { afterAll, beforeAll, expect, test } from 'vitest'
import type { HarmonyService } from './index.js'
import { readHarmonyRuntime, reloadHarmonyRuntime, updateHarmonyProfile } from './control.js'
import { configuredProfileActivation, configuredProfileCandidates } from './dsh.js'
import {
  beginProfileUpdate,
  beginPluginUpdate,
  beginStartupUpdate,
  currentProfile,
  discoverPackage,
  discoverProfile,
  getPatchInspections,
  getPatchStatuses,
  inspectPatchTargets,
  inspectPatchTargetsAsync,
  installFileTransforms,
  retainedGenerationCount,
  resolveProfileDependency,
  synchronizePluginOrder,
  synchronizeProfile,
  watchProfile,
} from './runtime.js'
import { apply as applyHarmonyPlugin, reloadEntries } from './plugin.js'

const root = mkdtempSync(join(tmpdir(), 'dsh-harmony-'))
const WATCH_READY_DELAY = 750
const active = process.env.DSH_HARMONY_ACTIVE
beforeAll(() => {
  process.env.DSH_HARMONY_ACTIVE = '1'
  installFileTransforms()
})
afterAll(() => {
  if (active === undefined) delete process.env.DSH_HARMONY_ACTIVE
  else process.env.DSH_HARMONY_ACTIVE = active
  rmSync(root, { recursive: true })
})

test('preserves binary files byte for byte', async () => {
  const filename = join(root, 'session.jsonl.zstd')
  const source = Buffer.from([0x28, 0xb5, 0x2f, 0xfd, 0x80, 0xff, 0x00, 0x61])
  writeFileSync(filename, source)

  expect(readFileSync(filename)).toEqual(source)
  expect(await readFile(filename)).toEqual(source)
})

test('applies a declared patch while reading a plugin file', async () => {
  const target = join(root, 'target')
  const provider = join(root, 'provider')
  mkdirSync(join(target, 'lib'), { recursive: true })
  mkdirSync(provider)
  writeFileSync(join(target, 'package.json'), JSON.stringify({ name: 'target-plugin', type: 'module' }))
  writeFileSync(join(target, 'lib/index.js'), 'export function answer() { return 1 }\n')
  writeFileSync(join(provider, 'package.json'), JSON.stringify({
    name: 'patch-provider',
    dsh: { harmony: { patches: ['./answer.patch.cjs'] } },
  }))
  writeFileSync(join(provider, 'answer.patch.cjs'), `
module.exports = {
  id: 'test-patch',
  target: { package: 'target-plugin', file: 'lib/index.js' },
  select: 'NumericLiteral[text="1"]',
  apply({ node, sourceFile, edit }) {
    edit.overwrite(node.getStart(sourceFile), node.getEnd(), '2')
  },
}
`)

  discoverPackage(provider)

  expect(readFileSync(join(target, 'lib/index.js'), 'utf8')).toContain('return 2')
  expect(await readFile(join(target, 'lib/index.js'), 'utf8')).toContain('return 2')
})

test('loads a legacy Patch that declares ordered target file candidates', () => {
  const target = join(root, 'legacy-files-target')
  const provider = join(root, 'legacy-files-provider')
  mkdirSync(join(target, 'lib'), { recursive: true })
  mkdirSync(provider)
  writeFileSync(join(target, 'package.json'), JSON.stringify({ name: 'legacy-files-target' }))
  writeFileSync(join(target, 'lib/index.js'), 'export const value = 1\n')
  writeFileSync(join(provider, 'package.json'), JSON.stringify({
    name: 'legacy-files-provider',
    dsh: { harmony: { patches: ['./patch.cjs'] } },
  }))
  writeFileSync(join(provider, 'patch.cjs'), `
module.exports = {
  id: 'legacy-files',
  target: { package: 'legacy-files-target', files: ['missing.js', 'lib/index.js'] },
  select: 'NumericLiteral', expect: 1,
  apply({ node, edit }) { edit.overwrite(node.getStart(), node.getEnd(), '2') },
}
`)

  discoverPackage(provider)

  expect(readFileSync(join(target, 'lib/index.js'), 'utf8')).toContain('value = 2')
})

test('rejects a Patch without a target file at the Provider boundary', () => {
  const provider = join(root, 'invalid-target-provider')
  mkdirSync(provider)
  writeFileSync(join(provider, 'package.json'), JSON.stringify({
    name: 'invalid-target-provider',
    dsh: { harmony: { patches: ['./patch.cjs'] } },
  }))
  writeFileSync(join(provider, 'patch.cjs'), `
module.exports = {
  id: 'invalid-target', target: { package: 'target', files: [] },
  select: 'SourceFile', apply() {},
}
`)

  expect(() => discoverPackage(provider))
    .toThrow('patch "invalid-target-provider/invalid-target" target.file must be a non-empty string')
})

test('bypasses package discovery for unrelated JavaScript reads', () => {
  const profile = join(root, 'target-index-profile')
  const provider = join(profile, 'node_modules', 'target-index-provider')
  const target = join(profile, 'node_modules', 'target-index-target')
  const unrelated = join(profile, 'unrelated')
  mkdirSync(provider, { recursive: true })
  mkdirSync(join(target, 'lib'), { recursive: true })
  mkdirSync(join(unrelated, 'lib'), { recursive: true })
  writeFileSync(join(profile, 'package.json'), JSON.stringify({
    dependencies: { 'target-index-provider': '1', 'target-index-target': '1' },
  }))
  writeFileSync(join(provider, 'package.json'), JSON.stringify({
    name: 'target-index-provider',
    dsh: { harmony: { patches: ['./patch.cjs'] } },
  }))
  writeFileSync(join(provider, 'patch.cjs'), `
module.exports = {
  id: 'target-index',
  target: { package: 'target-index-target', file: 'lib/index.js' },
  select: 'SourceFile', expect: 1, apply() {},
}
`)
  writeFileSync(join(target, 'package.json'), JSON.stringify({ name: 'target-index-target' }))
  writeFileSync(join(target, 'lib/index.js'), 'export const value = 1\n')
  writeFileSync(join(unrelated, 'package.json'), '{ invalid json')
  writeFileSync(join(unrelated, 'lib/index.js'), 'export const unrelated = true\n')

  synchronizeProfile(profile)
  inspectPatchTargets()

  expect(readFileSync(join(unrelated, 'lib/index.js'), 'utf8')).toBe('export const unrelated = true\n')
})

test('does not repeat completed composite Patch inspection for unrelated module reads', () => {
  const profile = join(root, 'completed-composite-index-profile')
  const provider = join(profile, 'node_modules', 'completed-composite-index-provider')
  const target = join(profile, 'node_modules', 'completed-composite-index-target')
  const unrelated = join(profile, 'unrelated.js')
  mkdirSync(provider, { recursive: true })
  mkdirSync(target, { recursive: true })
  writeFileSync(join(profile, 'package.json'), JSON.stringify({ dependencies: {
    'completed-composite-index-provider': '1',
    'completed-composite-index-target': '1',
  } }))
  writeFileSync(join(provider, 'package.json'), JSON.stringify({
    name: 'completed-composite-index-provider', dsh: { harmony: { patches: ['./patch.cjs'] } },
  }))
  writeFileSync(join(provider, 'patch.cjs'), `
const replace = (id, file, from, to) => ({
  id, target: { package: 'completed-composite-index-target', file },
  select: 'NumericLiteral[text="' + from + '"]', expect: 1,
  apply({ node, edit }) {
    globalThis.__completedCompositeIndexCalls = (globalThis.__completedCompositeIndexCalls || 0) + 1
    edit.overwrite(node.getStart(), node.getEnd(), String(to))
  },
})
module.exports = { id: 'atomic', patches: [
  replace('first', 'a.js', 1, 2), replace('second', 'b.js', 3, 4),
] }
`)
  writeFileSync(join(target, 'package.json'), JSON.stringify({ name: 'completed-composite-index-target' }))
  writeFileSync(join(target, 'a.js'), 'export const a = 1\n')
  writeFileSync(join(target, 'b.js'), 'export const b = 3\n')
  writeFileSync(unrelated, 'export const unrelated = true\n')

  synchronizeProfile(profile)
  inspectPatchTargets()
  ;(globalThis as any).__completedCompositeIndexCalls = 0

  expect(readFileSync(unrelated, 'utf8')).toBe('export const unrelated = true\n')
  expect((globalThis as any).__completedCompositeIndexCalls).toBe(0)
  delete (globalThis as any).__completedCompositeIndexCalls
})

test('loads independent Source Patch file components with configured workers', async () => {
  const profile = join(root, 'parallel-inspection-profile')
  const provider = join(profile, 'node_modules', 'parallel-inspection-provider')
  const first = join(profile, 'node_modules', 'parallel-target-first')
  const second = join(profile, 'node_modules', 'parallel-target-second')
  for (const directory of [provider, first, second]) mkdirSync(join(directory, 'lib'), { recursive: true })
  writeFileSync(join(profile, 'package.json'), JSON.stringify({
    dependencies: {
      'parallel-inspection-provider': '1',
      'parallel-target-first': '1',
      'parallel-target-second': '1',
    },
  }))
  writeFileSync(join(profile, 'harmony.json'), JSON.stringify({
    workerThreads: 2, order: ['parallel-inspection-provider'], patchOrder: [], disabled: [],
  }))
  writeFileSync(join(provider, 'package.json'), JSON.stringify({
    name: 'parallel-inspection-provider',
    dsh: { harmony: { patches: ['./patch.cjs'] } },
  }))
  writeFileSync(join(provider, 'patch.cjs'), `
const { isMainThread } = require('node:worker_threads')
module.exports = ['first', 'second'].map((id) => ({
  id,
  target: { package: 'parallel-target-' + id, file: 'lib/index.js' },
  select: 'NumericLiteral[text="1"]', expect: 1,
  apply({ node, edit }) { edit.overwrite(node.getStart(), node.getEnd(), isMainThread ? '99' : id === 'first' ? '11' : '22') },
}))
`)
  for (const [directory, name] of [[first, 'parallel-target-first'], [second, 'parallel-target-second']] as const) {
    writeFileSync(join(directory, 'package.json'), JSON.stringify({ name, version: '1.0.0', type: 'module' }))
    writeFileSync(join(directory, 'lib/index.js'), 'export const value = 1\n')
  }

  discoverProfile(profile)
  const inspections = await inspectPatchTargetsAsync()

  expect(currentProfile().workerThreads).toBe(2)
  expect(inspections.map(item => item.final).sort()).toEqual([
    'export const value = 11\n',
    'export const value = 22\n',
  ])
  expect(getPatchStatuses().filter(status => status.owner === 'parallel-inspection-provider'))
    .toMatchObject([{ state: 'bound', matches: 1 }, { state: 'bound', matches: 1 }])
})

test('does not re-enter a transformation when a Patch reads its own target', () => {
  const target = join(root, 'reentrant-target')
  const provider = join(root, 'reentrant-provider')
  const filename = join(target, 'lib/index.js')
  mkdirSync(join(target, 'lib'), { recursive: true })
  mkdirSync(provider)
  writeFileSync(join(target, 'package.json'), JSON.stringify({ name: 'reentrant-target' }))
  writeFileSync(filename, 'export const value = 1\n')
  writeFileSync(join(provider, 'package.json'), JSON.stringify({
    name: 'reentrant-provider',
    dsh: { harmony: { patches: ['./patch.cjs'] } },
  }))
  writeFileSync(join(provider, 'patch.cjs'), `
module.exports = {
  id: 'self-read', target: { package: 'reentrant-target', file: 'lib/index.js' },
  select: 'NumericLiteral', expect: 1,
  apply({ node, edit }) {
    globalThis.__dshHarmonyReentrantApplications = (globalThis.__dshHarmonyReentrantApplications ?? 0) + 1
    if (globalThis.__dshHarmonyReentrantApplications === 1) {
      globalThis.__dshHarmonyReentrantSource = require('node:fs').readFileSync(${JSON.stringify(filename)}, 'utf8')
    }
    edit.overwrite(node.getStart(), node.getEnd(), '2')
  },
}
`)
  discoverPackage(provider)

  try {
    expect(readFileSync(filename, 'utf8')).toContain('value = 2')
    expect((globalThis as any).__dshHarmonyReentrantApplications).toBe(1)
    expect((globalThis as any).__dshHarmonyReentrantSource).toContain('value = 1')
  } finally {
    delete (globalThis as any).__dshHarmonyReentrantApplications
    delete (globalThis as any).__dshHarmonyReentrantSource
  }
})

test('skips a Patch with the wrong match count and continues applying later Patches', () => {
  const target = join(root, 'expect-target')
  const provider = join(root, 'expect-provider')
  mkdirSync(join(target, 'lib'), { recursive: true })
  mkdirSync(provider)
  writeFileSync(join(target, 'package.json'), JSON.stringify({ name: 'expect-target', version: '1.0.0' }))
  writeFileSync(join(target, 'lib/index.js'), 'export const values = [1, 2]\n')
  writeFileSync(join(provider, 'package.json'), JSON.stringify({
    name: 'expect-provider',
    dsh: { harmony: { patches: ['./patch.cjs'] } },
  }))
  writeFileSync(join(provider, 'patch.cjs'), `
module.exports = [{
  id: 'one-number',
  description: 'Requires exactly one numeric literal.',
  target: { package: 'expect-target', file: 'lib/index.js' },
  select: 'NumericLiteral',
  expect: 1,
  apply() {},
}, {
  id: 'replace-two',
  target: { package: 'expect-target', file: 'lib/index.js' },
  select: 'NumericLiteral[text="2"]',
  expect: 1,
  apply({ node, edit }) { edit.overwrite(node.getStart(), node.getEnd(), '3') },
}]
`)
  discoverPackage(provider)

  expect(readFileSync(join(target, 'lib/index.js'), 'utf8')).toContain('[1, 3]')
  expect(getPatchStatuses().find(patch => patch.key === 'expect-provider/one-number')).toMatchObject({
    index: 0,
    description: 'Requires exactly one numeric literal.',
    state: 'failed',
    matches: 2,
  })
  expect(getPatchStatuses().find(patch => patch.key === 'expect-provider/replace-two')).toMatchObject({ index: 1, state: 'bound' })
})

test('matches syntax introduced by the preceding Source Patch', () => {
  const target = join(root, 'incremental-ast-target')
  const provider = join(root, 'incremental-ast-provider')
  mkdirSync(target)
  mkdirSync(provider)
  writeFileSync(join(target, 'package.json'), JSON.stringify({ name: 'incremental-ast-target' }))
  writeFileSync(join(target, 'index.js'), 'export const value = marker\n')
  writeFileSync(join(provider, 'package.json'), JSON.stringify({
    name: 'incremental-ast-provider',
    dsh: { harmony: { patches: ['./patch.cjs'] } },
  }))
  writeFileSync(join(provider, 'patch.cjs'), `
module.exports = [{
  id: 'introduce', target: { package: 'incremental-ast-target', file: 'index.js' },
  select: 'Identifier[name="marker"]', expect: 1,
  apply({ node, edit }) { edit.overwrite(node.getStart(), node.getEnd(), '({ nested: "阶段🚀" })') },
}, {
  id: 'consume', target: { package: 'incremental-ast-target', file: 'index.js' },
  select: 'StringLiteral[text="阶段🚀"]', expect: 1,
  apply({ node, edit }) { edit.overwrite(node.getStart(), node.getEnd(), '"完成✅"') },
}]
`)

  discoverPackage(provider)

  expect(readFileSync(join(target, 'index.js'), 'utf8')).toContain('nested: "完成✅"')
  expect(getPatchInspections('incremental-ast-target', 'index.js')[0]?.steps.map(step => step.source)).toEqual([
    'export const value = ({ nested: "阶段🚀" })\n',
    'export const value = ({ nested: "完成✅" })\n',
  ])
})

test('uses provider constraints by default and lets a Patch override them', () => {
  const profile = join(root, 'expected-patch-order-profile')
  const target = join(profile, 'node_modules', 'expected-patch-order-target')
  const first = join(profile, 'node_modules', 'expected-first-provider')
  const second = join(profile, 'node_modules', 'expected-second-provider')
  for (const directory of [target, first, second]) mkdirSync(directory, { recursive: true })
  writeFileSync(join(profile, 'package.json'), JSON.stringify({ dependencies: {
    'expected-first-provider': '1',
    'expected-second-provider': '1',
    'expected-patch-order-target': '1',
  } }))
  writeFileSync(join(target, 'package.json'), JSON.stringify({ name: 'expected-patch-order-target' }))
  writeFileSync(join(target, 'index.js'), 'export const value = 1\n')
  writeFileSync(join(first, 'package.json'), JSON.stringify({
    name: 'expected-first-provider',
    dsh: { harmony: { patches: ['./patch.cjs'], before: ['expected-second-provider'] } },
  }))
  writeFileSync(join(first, 'patch.cjs'), `
const patch = (id, order) => ({
  id, ...(order || {}),
  target: { package: 'expected-patch-order-target', file: 'index.js' },
  select: 'SourceFile', apply() { globalThis.__expectedPatchOrder.push(id) },
})
module.exports = [patch('default'), patch('override', { after: ['expected-second-provider'] })]
`)
  writeFileSync(join(second, 'package.json'), JSON.stringify({
    name: 'expected-second-provider', dsh: { harmony: { patches: ['./patch.cjs'] } },
  }))
  writeFileSync(join(second, 'patch.cjs'), `
module.exports = {
  id: 'middle', target: { package: 'expected-patch-order-target', file: 'index.js' },
  select: 'SourceFile', apply() { globalThis.__expectedPatchOrder.push('middle') },
}
`)

  ;(globalThis as any).__expectedPatchOrder = []
  synchronizeProfile(profile)
  readFileSync(join(target, 'index.js'), 'utf8')

  expect((globalThis as any).__expectedPatchOrder).toEqual(['default', 'middle', 'override'])
  expect(currentProfile().patchOrder).toEqual([
    'expected-first-provider/default',
    'expected-second-provider/middle',
    'expected-first-provider/override',
  ])

  const added = join(profile, 'node_modules', 'expected-added-provider')
  mkdirSync(added)
  writeFileSync(join(added, 'package.json'), JSON.stringify({
    name: 'expected-added-provider',
    dsh: { harmony: { patches: ['./patch.cjs'], before: ['expected-second-provider'] } },
  }))
  writeFileSync(join(added, 'patch.cjs'), `
module.exports = {
  id: 'added', target: { package: 'expected-patch-order-target', file: 'index.js' },
  select: 'SourceFile', apply() { globalThis.__expectedPatchOrder.push('added') },
}
`)
  writeFileSync(join(profile, 'package.json'), JSON.stringify({ dependencies: {
    'expected-first-provider': '1',
    'expected-second-provider': '1',
    'expected-added-provider': '1',
    'expected-patch-order-target': '1',
  } }))
  synchronizeProfile(profile)
  ;(globalThis as any).__expectedPatchOrder = []
  readFileSync(join(target, 'index.js'), 'utf8')
  expect((globalThis as any).__expectedPatchOrder).toEqual(['default', 'added', 'middle', 'override'])
  delete (globalThis as any).__expectedPatchOrder
})

test('applies a complete user Patch order across provider boundaries', async () => {
  const profile = join(root, 'manual-patch-order-profile')
  const target = join(profile, 'node_modules', 'manual-patch-order-target')
  const first = join(profile, 'node_modules', 'manual-first-provider')
  const second = join(profile, 'node_modules', 'manual-second-provider')
  for (const directory of [target, first, second]) mkdirSync(directory, { recursive: true })
  writeFileSync(join(profile, 'package.json'), JSON.stringify({ dependencies: {
    'manual-first-provider': '1', 'manual-second-provider': '1', 'manual-patch-order-target': '1',
  } }))
  writeFileSync(join(target, 'package.json'), JSON.stringify({ name: 'manual-patch-order-target' }))
  writeFileSync(join(target, 'index.js'), 'export const value = 1\n')
  for (const [directory, name, ids] of [
    [first, 'manual-first-provider', ['a', 'c']],
    [second, 'manual-second-provider', ['b', 'd']],
  ] as const) {
    writeFileSync(join(directory, 'package.json'), JSON.stringify({
      name, dsh: { harmony: { patches: ['./patch.cjs'] } },
    }))
    writeFileSync(join(directory, 'patch.cjs'), `
module.exports = ${JSON.stringify(ids)}.map(id => ({
  id, target: { package: 'manual-patch-order-target', file: 'index.js' },
  select: 'SourceFile', apply() { globalThis.__manualPatchOrder.push(id) },
}))
`)
  }
  synchronizeProfile(profile)
  const desired = [
    'manual-first-provider/a',
    'manual-second-provider/b',
    'manual-first-provider/c',
    'manual-second-provider/d',
  ]
  const transaction = beginProfileUpdate({ patchOrder: desired })
  await transaction.commit()

  ;(globalThis as any).__manualPatchOrder = []
  readFileSync(join(target, 'index.js'), 'utf8')
  expect((globalThis as any).__manualPatchOrder).toEqual(['a', 'b', 'c', 'd'])
  expect(JSON.parse(readFileSync(join(profile, 'harmony.json'), 'utf8')).patchOrder).toEqual(desired)

  const providerMove = beginProfileUpdate({
    order: ['manual-second-provider', 'manual-first-provider', 'manual-patch-order-target'],
  })
  expect(providerMove.profile.patchOrder).toEqual([
    'manual-second-provider/b',
    'manual-second-provider/d',
    'manual-first-provider/a',
    'manual-first-provider/c',
  ])
  providerMove.rollback()
  delete (globalThis as any).__manualPatchOrder
})

test('rolls back every file when one member of a composite Patch fails', () => {
  const profile = join(root, 'failed-composite-profile')
  const provider = join(profile, 'node_modules', 'failed-composite-provider')
  const target = join(profile, 'node_modules', 'failed-composite-target')
  mkdirSync(provider, { recursive: true })
  mkdirSync(target, { recursive: true })
  writeFileSync(join(profile, 'package.json'), JSON.stringify({ dependencies: {
    'failed-composite-provider': '1', 'failed-composite-target': '1',
  } }))
  writeFileSync(join(provider, 'package.json'), JSON.stringify({
    name: 'failed-composite-provider', dsh: { harmony: { patches: ['./patch.cjs'] } },
  }))
  writeFileSync(join(provider, 'patch.cjs'), `
const replace = (id, file, from, to) => ({
  id, target: { package: 'failed-composite-target', file },
  select: 'NumericLiteral[text="' + from + '"]', expect: 1,
  apply({ node, edit }) {
    globalThis.__failedCompositeCalls = (globalThis.__failedCompositeCalls || 0) + 1
    edit.overwrite(node.getStart(), node.getEnd(), String(to))
  },
})
module.exports = [{
  id: 'atomic',
  patches: [replace('first', 'a.js', 1, 2), replace('second', 'b.js', 9, 4)],
}, {
  id: 'later', target: { package: 'failed-composite-target', file: 'a.js' },
  select: 'NumericLiteral[text="1"]', expect: 1,
  apply({ node, edit }) { edit.overwrite(node.getStart(), node.getEnd(), '5') },
}]
`)
  writeFileSync(join(target, 'package.json'), JSON.stringify({ name: 'failed-composite-target' }))
  writeFileSync(join(target, 'a.js'), 'export const a = 1\n')
  writeFileSync(join(target, 'b.js'), 'export const b = 3\n')
  synchronizeProfile(profile)

  expect(readFileSync(join(target, 'a.js'), 'utf8')).toContain('a = 5')
  expect(readFileSync(join(target, 'b.js'), 'utf8')).toContain('b = 3')
  expect((globalThis as any).__failedCompositeCalls).toBe(1)
  expect(getPatchStatuses().find(patch => patch.key === 'failed-composite-provider/atomic')).toMatchObject({
    kind: 'composite', state: 'failed', matches: 0,
    members: [{ id: 'first' }, { id: 'second' }],
  })
  expect(getPatchInspections('failed-composite-target', 'a.js')[0]?.steps.map(step => step.key)).toEqual([
    'failed-composite-provider/later',
  ])
  delete (globalThis as any).__failedCompositeCalls
})

test('toggles and reports a successful composite Patch as one unit', async () => {
  const profile = join(root, 'successful-composite-profile')
  const provider = join(profile, 'node_modules', 'successful-composite-provider')
  const target = join(profile, 'node_modules', 'successful-composite-target')
  mkdirSync(provider, { recursive: true })
  mkdirSync(target, { recursive: true })
  writeFileSync(join(profile, 'package.json'), JSON.stringify({ dependencies: {
    'successful-composite-provider': '1', 'successful-composite-target': '1',
  } }))
  writeFileSync(join(provider, 'package.json'), JSON.stringify({
    name: 'successful-composite-provider', dsh: { harmony: { patches: ['./patch.cjs'] } },
  }))
  writeFileSync(join(provider, 'patch.cjs'), `
const replace = (id, file, from, to) => ({
  id, target: { package: 'successful-composite-target', file },
  select: 'NumericLiteral[text="' + from + '"]', expect: 1,
  apply({ node, edit }) { edit.overwrite(node.getStart(), node.getEnd(), String(to)) },
})
module.exports = { id: 'atomic', patches: [
  replace('first', 'a.js', 1, 2), replace('second', 'b.js', 3, 4),
] }
`)
  writeFileSync(join(target, 'package.json'), JSON.stringify({ name: 'successful-composite-target' }))
  writeFileSync(join(target, 'a.js'), 'export const a = 1\n')
  writeFileSync(join(target, 'b.js'), 'export const b = 3\n')
  synchronizeProfile(profile)

  expect(readFileSync(join(target, 'a.js'), 'utf8')).toContain('a = 2')
  expect(readFileSync(join(target, 'b.js'), 'utf8')).toContain('b = 4')
  expect(getPatchStatuses().find(patch => patch.key === 'successful-composite-provider/atomic')).toMatchObject({
    kind: 'composite', state: 'bound', matches: 2,
  })

  const transaction = beginProfileUpdate({ disabled: ['successful-composite-provider/atomic'] })
  await transaction.commit()
  expect(readFileSync(join(target, 'a.js'), 'utf8')).toContain('a = 1')
  expect(readFileSync(join(target, 'b.js'), 'utf8')).toContain('b = 3')
  expect(getPatchStatuses().find(patch => patch.key === 'successful-composite-provider/atomic')).toMatchObject({ state: 'disabled' })
})

test('warns on target version drift and still attempts the exact target file', () => {
  const target = join(root, 'version-target')
  const provider = join(root, 'version-provider')
  mkdirSync(join(target, 'dist'), { recursive: true })
  mkdirSync(provider)
  writeFileSync(join(target, 'package.json'), JSON.stringify({ name: 'version-target', version: '2.3.0' }))
  writeFileSync(join(target, 'dist/index.js'), 'export const value = 1\n')
  writeFileSync(join(provider, 'package.json'), JSON.stringify({
    name: 'version-provider',
    dsh: { harmony: { patches: ['./patch.cjs'] } },
  }))
  writeFileSync(join(provider, 'patch.cjs'), `
module.exports = {
  id: 'versioned',
  target: { package: 'version-target', version: '^2.0.0', file: 'dist/index.js' },
  select: 'NumericLiteral',
  expect: 1,
  apply({ node, edit }) { edit.overwrite(node.getStart(), node.getEnd(), '2') },
}
`)
  discoverPackage(provider)

  expect(readFileSync(join(target, 'dist/index.js'), 'utf8')).toContain('value = 2')
  expect(getPatchStatuses().find(patch => patch.key === 'version-provider/versioned')).toMatchObject({
    state: 'bound', matches: 1,
  })

  writeFileSync(join(target, 'package.json'), JSON.stringify({ name: 'version-target', version: '3.0.0' }))
  writeFileSync(join(target, 'dist/index.js'), 'export const value = 3\n')
  expect(readFileSync(join(target, 'dist/index.js'), 'utf8')).toContain('value = 2')
  expect(getPatchStatuses().find(patch => patch.key === 'version-provider/versioned')).toMatchObject({
    state: 'bound', matches: 1,
    warnings: ['target version-target@3.0.0 does not satisfy ^2.0.0'],
  })

  writeFileSync(join(target, 'dist/index.js'), 'export const value = "three"\n')
  expect(readFileSync(join(target, 'dist/index.js'), 'utf8')).toContain('value = "three"')
  expect(getPatchStatuses().find(patch => patch.key === 'version-provider/versioned')).toMatchObject({
    state: 'failed', matches: 0,
    warnings: ['target version-target@3.0.0 does not satisfy ^2.0.0'],
    error: expect.stringContaining('the selector matched no code'),
  })
})

test('preflights a selected nested TypeScript target instead of a same-name profile dependency', () => {
  const profile = join(root, 'selected-loader-target-profile')
  const provider = join(root, 'selected-loader-target-provider')
  const selectedTarget = join(root, 'selected-loader-target-v2')
  const profileTarget = join(profile, 'node_modules', 'selected-loader-target')
  mkdirSync(profileTarget, { recursive: true })
  mkdirSync(provider)
  mkdirSync(selectedTarget)
  writeFileSync(join(profile, 'package.json'), JSON.stringify({ dependencies: { 'selected-loader-target': '1' } }))
  writeFileSync(join(profileTarget, 'package.json'), JSON.stringify({
    name: 'selected-loader-target', version: '1.0.0', type: 'module',
  }))
  writeFileSync(join(profileTarget, 'index.ts'), 'export const selected: string = "profile"\n')
  writeFileSync(join(selectedTarget, 'package.json'), JSON.stringify({
    name: 'selected-loader-target', version: '2.0.0', type: 'module',
  }))
  writeFileSync(join(selectedTarget, 'index.ts'), 'export const selected: string = "nested"\n')
  writeFileSync(join(provider, 'package.json'), JSON.stringify({
    name: 'selected-loader-provider', version: '1.0.0',
    dsh: { harmony: { patches: ['./patch.cjs'] } },
  }))
  writeFileSync(join(provider, 'patch.cjs'), `
module.exports = {
  id: 'loader',
  target: { package: 'selected-loader-target', version: '^2.0.0', file: 'index.ts' },
  loader: 'typescript',
}
`)

  synchronizeProfile(profile, [], undefined, [
    join(provider, 'package.json'),
    join(selectedTarget, 'package.json'),
  ])
  inspectPatchTargets()

  expect(resolveProfileDependency('selected-loader-target', import.meta.url)).toBe(realpathSync(selectedTarget))
  expect(getPatchStatuses().find(patch => patch.key === 'selected-loader-provider/loader')).toMatchObject({
    state: 'bound', warnings: undefined,
  })
  expect(getPatchInspections('selected-loader-target', 'index.ts')[0]?.original).toContain('"nested"')
})

test('creates a new generation when only the selected target package changes', () => {
  const profile = join(root, 'selected-target-update-profile')
  const provider = join(root, 'selected-target-update-provider')
  const target = join(root, 'selected-target-update-target')
  mkdirSync(profile)
  mkdirSync(provider)
  mkdirSync(target)
  writeFileSync(join(profile, 'package.json'), '{}')
  writeFileSync(join(provider, 'package.json'), JSON.stringify({
    name: 'selected-target-update-provider', version: '1.0.0',
    dsh: { harmony: { patches: ['./patch.cjs'] } },
  }))
  writeFileSync(join(provider, 'patch.cjs'), `
module.exports = {
  id: 'selected-target', target: { package: 'selected-target-update-target', file: 'index.js' },
  select: 'NumericLiteral', expect: 1,
  apply({ node, edit }) { edit.overwrite(node.getStart(), node.getEnd(), '3') },
}
`)
  const writeTarget = (version: number): void => {
    writeFileSync(join(target, 'package.json'), JSON.stringify({
      name: 'selected-target-update-target', version: `${version}.0.0`, type: 'module',
    }))
    writeFileSync(join(target, 'index.js'), `export const value = ${version}\n`)
  }
  writeTarget(1)

  synchronizeProfile(profile, [], undefined, [
    join(provider, 'package.json'),
    join(target, 'package.json'),
  ])
  inspectPatchTargets()
  const previousGeneration = getPatchStatuses()[0]!.generation
  expect(getPatchInspections('selected-target-update-target', 'index.js')[0]?.original).toContain('value = 1')

  writeTarget(2)
  const transaction = beginPluginUpdate(false, undefined, [
    join(provider, 'package.json'),
    join(target, 'package.json'),
  ])
  expect(transaction.generation).toBeGreaterThan(previousGeneration)
  expect([...transaction.targets.get('selected-target-update-target') ?? []]).toEqual(['index.js'])
  inspectPatchTargets()
  expect(getPatchInspections('selected-target-update-target', 'index.js')[0]?.original).toContain('value = 2')
  expect(getPatchStatuses()[0]?.generation).toBe(transaction.generation)
  transaction.rollback()
})

test('composes semantic before, around and after patches for sync and async functions', async () => {
  const target = join(root, 'semantic-target')
  const provider = join(root, 'semantic-provider')
  mkdirSync(join(target, 'lib'), { recursive: true })
  mkdirSync(provider)
  writeFileSync(join(target, 'package.json'), JSON.stringify({ name: 'semantic-target', version: '1.0.0' }))
  writeFileSync(join(target, 'lib/index.js'), `
function answer(value) { return value * 2 }
async function delayed(value) { return value + 1 }
function defaulted(value = 7) { return value }
module.exports = { answer, delayed, defaulted }
`)
  writeFileSync(join(provider, 'package.json'), JSON.stringify({
    name: 'semantic-provider',
    dsh: { harmony: { patches: ['./patch.cjs'] } },
  }))
  writeFileSync(join(provider, 'patch.cjs'), `
module.exports = [{
  id: 'answer-before',
  target: { package: 'semantic-target', file: 'lib/index.js', function: 'answer' },
  operation: 'before',
  handler({ args }) { return [args[0] + 1] },
}, {
  id: 'answer-around',
  target: { package: 'semantic-target', file: 'lib/index.js', function: 'answer' },
  operation: 'around',
  handler({ args, invoke }) { return invoke([args[0] + 1]) },
}, {
  id: 'answer-after',
  target: { package: 'semantic-target', file: 'lib/index.js', function: 'answer' },
  operation: 'after',
  handler({ result }) { return result + 1 },
}, {
  id: 'delayed-after',
  target: { package: 'semantic-target', file: 'lib/index.js', function: 'delayed' },
  operation: 'after',
  async handler({ result }) { return result * 3 },
}, {
  id: 'defaulted-after',
  target: { package: 'semantic-target', file: 'lib/index.js', function: 'defaulted' },
  operation: 'after',
  handler({ result }) { return result },
}]
`)
  discoverPackage(provider)
  const transformed = readFileSync(join(target, 'lib/index.js'), 'utf8')
  const module = { exports: {} as any }
  new Function('module', 'exports', transformed)(module, module.exports)

  expect(module.exports.answer(1)).toBe(7)
  await expect(module.exports.delayed(2)).resolves.toBe(9)
  expect(module.exports.defaulted()).toBe(7)
  expect(getPatchStatuses().filter(patch => patch.owner === 'semantic-provider').every(patch => patch.state === 'bound')).toBe(true)
  expect(getPatchInspections('semantic-target', 'lib/index.js')[0]?.steps).toHaveLength(5)
})

test('applies source and semantic patches in one global declaration order', () => {
  const target = join(root, 'mixed-order-target')
  const provider = join(root, 'mixed-order-provider')
  mkdirSync(join(target, 'lib'), { recursive: true })
  mkdirSync(provider)
  writeFileSync(join(target, 'package.json'), JSON.stringify({ name: 'mixed-order-target', version: '1.0.0' }))
  writeFileSync(join(target, 'lib/index.js'), 'function answer() { return 1 }\n')
  writeFileSync(join(provider, 'package.json'), JSON.stringify({
    name: 'mixed-order-provider', dsh: { harmony: { patches: ['./patch.cjs'] } },
  }))
  writeFileSync(join(provider, 'patch.cjs'), `
module.exports = [{
  id: 'semantic-first',
  target: { package: 'mixed-order-target', file: 'lib/index.js', function: 'answer' },
  operation: 'after',
  handler({ result }) { return result + 1 },
}, {
  id: 'source-second',
  target: { package: 'mixed-order-target', file: 'lib/index.js' },
  select: 'PropertyAccessExpression[name.text="__dshHarmonyInvoke"]',
  expect: 1,
  apply() {},
}]
`)
  discoverPackage(provider)

  expect(() => readFileSync(join(target, 'lib/index.js'), 'utf8')).not.toThrow()
  expect(getPatchStatuses().filter(patch => patch.owner === 'mixed-order-provider').every(patch => patch.state === 'bound')).toBe(true)
})

test('adds React provenance only after every business patch has composed', () => {
  const target = join(root, 'trace-target')
  const provider = join(root, 'trace-provider')
  const external = join(root, 'trace-external-provider')
  mkdirSync(join(target, 'lib'), { recursive: true })
  mkdirSync(provider)
  mkdirSync(external)
  writeFileSync(join(target, 'package.json'), JSON.stringify({ name: 'trace-target', version: '1.0.0' }))
  writeFileSync(join(target, 'lib/client.js'), 'const r={jsx(type,props,key){return {type,props,key}}};module.exports=(0,r.jsx)(Original,{},"stable-key")\n')
  writeFileSync(join(provider, 'package.json'), JSON.stringify({
    name: 'trace-provider', dsh: { harmony: { patches: ['./patch.cjs'] } },
  }))
  writeFileSync(join(provider, 'patch.cjs'), `
module.exports = [{
  id: 'replace', target: { package: 'trace-target', file: 'lib/client.js' },
  select: 'CallExpression[arguments.0.name="Original"]', expect: 1,
  trace: {
    select: 'CallExpression[arguments.0.expression.expression.name="require"][arguments.0.expression.arguments.0.text="plugin-a"][arguments.0.argumentExpression.text="A"]',
    effect: 'replace-element', maxMatches: 1,
  },
  apply({ node, sourceFile, edit }) {
    const type = node.arguments[0]
    edit.overwrite(type.getStart(sourceFile), type.getEnd(), 'require("plugin-a")["A"]')
  },
}, {
  id: 'wrap', target: { package: 'trace-target', file: 'lib/client.js' },
  select: 'CallExpression[arguments.0.expression.expression.name="require"][arguments.0.expression.arguments.0.text="plugin-a"][arguments.0.argumentExpression.text="A"]', expect: 1,
  trace: {
    select: 'CallExpression[arguments.0.expression.expression.name="require"][arguments.0.expression.arguments.0.text="plugin-b"][arguments.0.argumentExpression.text="B"]',
    effect: 'wrap-element', maxMatches: 1,
  },
  apply({ node, sourceFile, source, edit }) {
    const original = source.slice(node.getStart(sourceFile), node.getEnd())
    edit.overwrite(node.getStart(sourceFile), node.getEnd(), '(0,r.jsx)(require("plugin-b")["B"],{children:' + original + '},"wrapper-key")')
  },
}]
`)
  writeFileSync(join(external, 'package.json'), JSON.stringify({
    name: 'trace-external-provider', dsh: { harmony: { patches: ['./patch.cjs'] } },
  }))
  writeFileSync(join(external, 'patch.cjs'), `
module.exports = {
  id: 'external-props', target: { package: 'trace-target', file: 'lib/client.js' },
  select: 'CallExpression[arguments.0.expression.expression.name="require"][arguments.0.expression.arguments.0.text="plugin-b"][arguments.0.argumentExpression.text="B"]', expect: 1,
  trace: {
    select: 'CallExpression[arguments.0.expression.expression.name="require"][arguments.0.expression.arguments.0.text="plugin-b"][arguments.0.argumentExpression.text="B"]',
    effect: 'transform-props', maxMatches: 1,
  },
  apply() {},
}
`)
  discoverPackage(provider)
  discoverPackage(external)
  const previous = process.env.DSH_HARMONY_REACT_TRACE
  process.env.DSH_HARMONY_REACT_TRACE = '1'
  try {
    const transformed = readFileSync(join(target, 'lib/client.js'), 'utf8')
    expect(transformed).toContain('__dshHarmonyPatchTrace')
    expect(transformed).toContain('trace-provider/replace')
    expect(transformed).toContain('trace-provider/wrap')
    expect(transformed).toContain('trace-external-provider/external-props')
    const module = { exports: {} as any }
    new Function('module', 'exports', 'Original', 'require', transformed)(
      module,
      module.exports,
      function Original() {},
      (name: string) => function PluginComponent() { return name },
    )
    expect(module.exports.key).toBe('wrapper-key')
    expect(module.exports.props.children.key).toBe('wrapper-key')
    expect(module.exports.props.children.props.children.key).toBe('stable-key')
    const inspection = getPatchInspections('trace-target', 'lib/client.js')[0]!
    expect(inspection.steps).toHaveLength(3)
    expect(inspection.final).not.toContain('__dshHarmonyPatchTrace')
    expect(inspection.final).toContain('require("plugin-b")["B"]')
    expect(getPatchStatuses().find(patch => patch.key === 'trace-provider/wrap')).toMatchObject({
      declaration: 'patch.cjs',
    })
  } finally {
    if (previous === undefined) delete process.env.DSH_HARMONY_REACT_TRACE
    else process.env.DSH_HARMONY_REACT_TRACE = previous
  }
})

test('leaves normal Host browser output uninstrumented', () => {
  const target = join(root, 'normal-trace-target')
  const provider = join(root, 'normal-trace-provider')
  mkdirSync(join(target, 'lib'), { recursive: true })
  mkdirSync(provider)
  writeFileSync(join(target, 'package.json'), JSON.stringify({ name: 'normal-trace-target', version: '1.0.0' }))
  writeFileSync(join(target, 'lib/client.js'), 'module.exports=(0,r.jsx)(Original,{})\n')
  writeFileSync(join(provider, 'package.json'), JSON.stringify({
    name: 'normal-trace-provider', dsh: { harmony: { patches: ['./patch.cjs'] } },
  }))
  writeFileSync(join(provider, 'patch.cjs'), `
module.exports = {
  id: 'normal-trace', target: { package: 'normal-trace-target', file: 'lib/client.js' },
  select: 'CallExpression[arguments.0.name="Original"]', expect: 1,
  trace: { select: 'CallExpression[arguments.0.name="Original"]', effect: 'wrap-element', maxMatches: 1 },
  apply({ patch, node, sourceFile, edit }) {
    edit.appendRight(node.getEnd(), '/*' + patch.key + ':' + patch.owner + '*/')
  },
}
`)
  discoverPackage(provider)
  const previous = process.env.DSH_HARMONY_REACT_TRACE
  delete process.env.DSH_HARMONY_REACT_TRACE
  try {
    const transformed = readFileSync(join(target, 'lib/client.js'), 'utf8')
    expect(transformed).toContain('normal-trace-provider/normal-trace:normal-trace-provider')
    expect(transformed).not.toContain('__dshHarmonyPatchTrace')
  } finally {
    if (previous !== undefined) process.env.DSH_HARMONY_REACT_TRACE = previous
  }
})

test('keeps old semantic bindings unchanged while a candidate transaction is pending', () => {
  const profile = join(root, 'semantic-isolation-profile')
  const provider = join(profile, 'node_modules', 'semantic-isolation-provider')
  const target = join(profile, 'node_modules', 'semantic-isolation-target')
  mkdirSync(provider, { recursive: true })
  mkdirSync(join(target, 'lib'), { recursive: true })
  writeFileSync(join(profile, 'package.json'), JSON.stringify({
    dependencies: { 'semantic-isolation-provider': '1', 'semantic-isolation-target': '1' },
  }))
  writeFileSync(join(provider, 'package.json'), JSON.stringify({
    name: 'semantic-isolation-provider', version: '1.0.0', dsh: { harmony: { patches: ['./patch.cjs'] } },
  }))
  writeFileSync(join(provider, 'patch.cjs'), `
module.exports = {
  id: 'after',
  target: { package: 'semantic-isolation-target', file: 'lib/index.js', function: 'answer' },
  operation: 'after',
  handler({ result }) { return result + 1 },
}
`)
  writeFileSync(join(target, 'package.json'), JSON.stringify({ name: 'semantic-isolation-target', version: '1.0.0' }))
  writeFileSync(join(target, 'lib/index.js'), 'function answer() { return 1 }; module.exports = { answer }\n')
  synchronizeProfile(profile)
  const transformed = readFileSync(join(target, 'lib/index.js'), 'utf8')
  const module = { exports: {} as any }
  new Function('module', 'exports', transformed)(module, module.exports)
  expect(module.exports.answer()).toBe(2)

  const transaction = beginProfileUpdate({ disabled: ['semantic-isolation-provider/after'] })
  expect(module.exports.answer()).toBe(2)
  transaction.rollback()
  expect(module.exports.answer()).toBe(2)
})

test('keeps the first semantic replacement and skips later conflicts', () => {
  const target = join(root, 'replace-target')
  const provider = join(root, 'replace-provider')
  mkdirSync(join(target, 'lib'), { recursive: true })
  mkdirSync(provider)
  writeFileSync(join(target, 'package.json'), JSON.stringify({ name: 'replace-target', version: '1.0.0' }))
  writeFileSync(join(target, 'lib/index.js'), 'function answer() { return 1 }; module.exports = { answer }\n')
  writeFileSync(join(provider, 'package.json'), JSON.stringify({
    name: 'replace-provider',
    dsh: { harmony: { patches: ['./patch.cjs'] } },
  }))
  writeFileSync(join(provider, 'patch.cjs'), `
module.exports = ['first', 'second'].map(id => ({
  id,
  target: { package: 'replace-target', file: 'lib/index.js', function: 'answer' },
  operation: 'replace',
  handler() { return 2 },
}))
`)
  discoverPackage(provider)

  const transformed = readFileSync(join(target, 'lib/index.js'), 'utf8')
  const module = { exports: {} as any }
  new Function('module', 'exports', transformed)(module, module.exports)
  expect(module.exports.answer()).toBe(2)
  expect(getPatchStatuses().find(patch => patch.key === 'replace-provider/first')?.state).toBe('bound')
  expect(getPatchStatuses().find(patch => patch.key === 'replace-provider/second')).toMatchObject({
    state: 'failed', error: expect.stringContaining('replace conflict'),
  })
})

test('stages disabled patches and restores runtime and disk state on rollback', async () => {
  const profile = join(root, 'disabled-profile')
  const provider = join(profile, 'node_modules', 'toggle-provider')
  const target = join(profile, 'node_modules', 'toggle-target')
  mkdirSync(provider, { recursive: true })
  mkdirSync(join(target, 'lib'), { recursive: true })
  writeFileSync(join(profile, 'package.json'), JSON.stringify({
    dependencies: { 'toggle-provider': '1.0.0', 'toggle-target': '1.0.0' },
  }))
  writeFileSync(join(provider, 'package.json'), JSON.stringify({
    name: 'toggle-provider', version: '1.0.0', dsh: { harmony: { patches: ['./patch.cjs'] } },
  }))
  writeFileSync(join(provider, 'patch.cjs'), `
module.exports = {
  id: 'toggle',
  target: { package: 'toggle-target', file: 'lib/index.js' },
  select: 'NumericLiteral',
  expect: 1,
  apply({ node, edit }) { edit.overwrite(node.getStart(), node.getEnd(), '2') },
}
`)
  writeFileSync(join(target, 'package.json'), JSON.stringify({ name: 'toggle-target', version: '1.0.0' }))
  writeFileSync(join(target, 'lib/index.js'), 'export const value = 1\n')
  synchronizeProfile(profile)
  expect(retainedGenerationCount()).toBe(1)
  writeFileSync(join(profile, 'harmony.json'), JSON.stringify({
    order: currentProfile().order,
    patchOrder: currentProfile().patchOrder,
    disabled: currentProfile().disabled,
  }))

  expect(readFileSync(join(target, 'lib/index.js'), 'utf8')).toContain('value = 2')
  const state = readFileSync(join(profile, 'harmony.json'), 'utf8')
  const transaction = beginProfileUpdate({ disabled: ['toggle-provider/toggle'] })
  expect(retainedGenerationCount()).toBe(2)
  expect(readFileSync(join(target, 'lib/index.js'), 'utf8')).toContain('value = 1')
  transaction.rollback()
  expect(retainedGenerationCount()).toBe(1)
  expect(readFileSync(join(profile, 'harmony.json'), 'utf8')).toBe(state)
  expect(readFileSync(join(target, 'lib/index.js'), 'utf8')).toContain('value = 2')

  const retry = beginProfileUpdate({ disabled: ['toggle-provider/toggle'] })
  expect(retry.generation).toBeGreaterThan(transaction.generation)
  retry.rollback()
  expect(retainedGenerationCount()).toBe(1)

  const committed = beginProfileUpdate({ disabled: ['toggle-provider/toggle'] })
  await committed.commit()
  expect(retainedGenerationCount()).toBe(1)
  expect(getPatchStatuses().find(patch => patch.key === 'toggle-provider/toggle')?.state).toBe('disabled')
  expect(JSON.parse(readFileSync(join(profile, 'harmony.json'), 'utf8')).disabled).toEqual(['toggle-provider/toggle'])

  for (let index = 0; index < 32; index += 1) {
    const update = beginProfileUpdate({ disabled: index % 2 === 0 ? [] : ['toggle-provider/toggle'] })
    expect(retainedGenerationCount()).toBe(2)
    await update.commit()
    expect(retainedGenerationCount()).toBe(1)
  }
})

test('limits a Patch toggle transaction to its changed target pipeline', () => {
  const profile = join(root, 'incremental-target-profile')
  const provider = join(profile, 'node_modules', 'incremental-target-provider')
  const first = join(profile, 'node_modules', 'incremental-target-first')
  const second = join(profile, 'node_modules', 'incremental-target-second')
  for (const directory of [provider, first, second]) mkdirSync(join(directory, 'lib'), { recursive: true })
  writeFileSync(join(profile, 'package.json'), JSON.stringify({ dependencies: {
    'incremental-target-provider': '1',
    'incremental-target-first': '1',
    'incremental-target-second': '1',
  } }))
  writeFileSync(join(provider, 'package.json'), JSON.stringify({
    name: 'incremental-target-provider', dsh: { harmony: { patches: ['./patch.cjs'] } },
  }))
  const writeProvider = (firstValue: number): void => writeFileSync(join(provider, 'patch.cjs'), `
module.exports = [{
  id: 'first', target: { package: 'incremental-target-first', file: 'lib/index.js' },
  select: 'NumericLiteral', expect: 1,
  apply({ node, edit }) { edit.overwrite(node.getStart(), node.getEnd(), '${firstValue}') },
}, {
  id: 'second', target: { package: 'incremental-target-second', file: 'lib/index.js' },
  select: 'NumericLiteral', expect: 1,
  apply({ node, edit }) { edit.overwrite(node.getStart(), node.getEnd(), '3') },
}]
`)
  writeProvider(2)
  for (const [directory, name] of [[first, 'incremental-target-first'], [second, 'incremental-target-second']] as const) {
    writeFileSync(join(directory, 'package.json'), JSON.stringify({ name }))
    writeFileSync(join(directory, 'lib/index.js'), 'export const value = 1\n')
  }

  synchronizeProfile(profile)
  const transaction = beginProfileUpdate({ disabled: ['incremental-target-provider/first'] })
  expect([...transaction.targets].map(([name, files]) => [name, [...files]])).toEqual([
    ['incremental-target-first', ['lib/index.js']],
  ])
  transaction.rollback()

  writeProvider(4)
  const changedProvider = beginPluginUpdate(true)
  expect([...changedProvider.targets].map(([name, files]) => [name, [...files]])).toEqual([
    ['incremental-target-first', ['lib/index.js']],
  ])
  changedProvider.rollback()
})

test('applies providers in the persisted manual order', () => {
  const profile = join(root, 'ordered-profile')
  const target = join(root, 'ordered-target')
  const first = join(profile, 'node_modules', 'first-provider')
  const second = join(profile, 'node_modules', 'second-provider')
  mkdirSync(profile, { recursive: true })
  mkdirSync(join(target, 'lib'), { recursive: true })
  mkdirSync(first, { recursive: true })
  mkdirSync(second, { recursive: true })
  writeFileSync(join(profile, 'package.json'), JSON.stringify({
    dependencies: { 'first-provider': '1.0.0', 'second-provider': '1.0.0' },
  }))
  writeFileSync(join(profile, 'harmony.json'), JSON.stringify({
    order: ['second-provider', 'first-provider'], patchOrder: [], disabled: [],
  }))
  writeFileSync(join(target, 'package.json'), JSON.stringify({ name: 'ordered-target' }))
  writeFileSync(join(target, 'lib/index.js'), 'export const value = 1\n')
  writeFileSync(join(first, 'package.json'), JSON.stringify({
    name: 'first-provider',
    dsh: {
      plugin: { compatibility: { conflicts: { 'second-provider': '*' } } },
      harmony: { patches: ['./patch.cjs'], after: ['second-provider'] },
    },
  }))
  writeFileSync(join(second, 'package.json'), JSON.stringify({
    name: 'second-provider',
    dsh: { harmony: { patches: ['./patch.cjs'] } },
  }))
  writeFileSync(join(first, 'patch.cjs'), `
module.exports = {
  id: 'test-patch',
  target: { package: 'ordered-target', file: 'lib/index.js' },
  select: 'NumericLiteral',
  apply() { globalThis.__harmonyOrder.push('first') },
}
`)
  writeFileSync(join(second, 'patch.cjs'), `
module.exports = {
  id: 'test-patch',
  target: { package: 'ordered-target', file: 'lib/index.js' },
  select: 'NumericLiteral',
  apply() { globalThis.__harmonyOrder.push('second') },
}
`)

  ;(globalThis as any).__harmonyOrder = []
  synchronizeProfile(profile)
  readFileSync(join(target, 'lib/index.js'), 'utf8')

  expect((globalThis as any).__harmonyOrder).toEqual(['second', 'first'])
  expect(currentProfile().compatibility).toEqual([{
    kind: 'conflict',
    left: { package: 'first-provider', version: '0.0.0', entryIds: [] },
    right: { package: 'second-provider', version: '0.0.0', entryIds: [] },
    declaredBy: ['first-provider'],
  }])
})

test('publishes active plugin compatibility only when a plugin update commits', async () => {
  const profile = join(root, 'compatibility-transaction-profile')
  const alpha = join(profile, 'node_modules', 'compatibility-alpha')
  const beta = join(profile, 'node_modules', 'compatibility-beta')
  mkdirSync(alpha, { recursive: true })
  mkdirSync(beta, { recursive: true })
  writeFileSync(join(profile, 'package.json'), JSON.stringify({
    dependencies: { 'compatibility-alpha': '1', 'compatibility-beta': '1' },
  }))
  writeFileSync(join(alpha, 'package.json'), JSON.stringify({
    name: 'compatibility-alpha',
    version: '1.0.0',
    dsh: { plugin: { compatibility: {
      requires: { 'compatibility-beta': '*' },
      integrates: { 'compatibility-beta': '*' },
    } } },
  }))
  writeFileSync(join(beta, 'package.json'), JSON.stringify({
    name: 'compatibility-beta', version: '1.0.0',
  }))
  const installed = ['compatibility-alpha', 'compatibility-beta']
  const both = installed.map(name => ({ name, entryIds: [`${name}-entry`] }))
  synchronizeProfile(profile, installed, both)
  expect(currentProfile().compatibility).toEqual([expect.objectContaining({ kind: 'integration' })])

  const pending = beginPluginUpdate(false, both.slice(0, 1))
  expect(pending.profile.compatibility).toEqual([expect.objectContaining({
    kind: 'requirement', reason: 'inactive',
  })])
  expect(currentProfile().compatibility).toEqual([expect.objectContaining({ kind: 'integration' })])
  pending.rollback()
  expect(currentProfile().compatibility).toEqual([expect.objectContaining({ kind: 'integration' })])

  await beginPluginUpdate(false, both.slice(0, 1)).commit()
  expect(currentProfile().compatibility).toEqual([expect.objectContaining({
    kind: 'requirement', reason: 'inactive',
  })])
})

test('serves the active profile from its synchronized snapshot', () => {
  const profile = join(root, 'profile-snapshot')
  const plugin = join(profile, 'node_modules', 'snapshot-plugin')
  mkdirSync(plugin, { recursive: true })
  writeFileSync(join(profile, 'package.json'), JSON.stringify({ dependencies: { 'snapshot-plugin': '1' } }))
  const writeManifest = (version: string) => writeFileSync(join(plugin, 'package.json'), JSON.stringify({
    name: 'snapshot-plugin', version,
  }))
  writeManifest('1.0.0')

  synchronizeProfile(profile)
  expect(currentProfile().plugins.find(item => item.name === 'snapshot-plugin')?.version).toBe('1.0.0')

  writeManifest('2.0.0')
  expect(currentProfile().plugins.find(item => item.name === 'snapshot-plugin')?.version).toBe('1.0.0')

  synchronizeProfile(profile)
  expect(currentProfile().plugins.find(item => item.name === 'snapshot-plugin')?.version).toBe('2.0.0')
})

test('provides harmony and reloads a newly patched loader entry', async () => {
  const profile = join(root, 'live-provider-profile')
  const provider = join(root, 'live-provider')
  const laterProvider = join(root, 'later-live-provider')
  mkdirSync(provider)
  mkdirSync(laterProvider)
  writeFileSync(join(provider, 'package.json'), JSON.stringify({
    name: 'live-provider',
    dsh: { harmony: { patches: ['./patch.cjs'] } },
  }))
  writeFileSync(join(provider, 'patch.cjs'), `
module.exports = {
  id: 'test-patch',
  target: { package: 'live-target', file: 'lib/index.js' },
  select: 'SourceFile',
  apply() {},
}
`)
  writeFileSync(join(laterProvider, 'package.json'), JSON.stringify({
    name: 'later-live-provider',
    dsh: { harmony: { patches: ['./patch.cjs'] } },
  }))
  writeFileSync(join(laterProvider, 'patch.cjs'), `
module.exports = {
  id: 'test-patch',
  target: { package: 'live-target', file: 'lib/index.js' },
  select: 'SourceFile',
  apply() {},
}
`)
  mkdirSync(profile)
  writeFileSync(join(profile, 'package.json'), '{}')
  synchronizeProfile(profile)

  const previousPlugin = () => {}
  const nextPlugin = () => {}
  const imported: string[] = []
  const started: unknown[] = []
  const entry = {
    options: { id: 'live', name: 'live-target' },
    fiber: { uid: 1, runtime: { callback: previousPlugin } },
    loader: { unwrapExports(value: unknown) { return value } },
    parent: { tree: { async import(specifier: string) { imported.push(specifier); return nextPlugin } } },
    getOuterStack() { return [] },
    async _dispose() { this.fiber = undefined },
    async _start(plugin: unknown) {
      started.push(plugin)
      this.fiber = { uid: 2, runtime: { callback: plugin } }
    },
  } as any
  const provided: string[] = []
  const disposers: Array<() => void | Promise<void>> = []
  await applyHarmonyPlugin({
    provide(name: string) { provided.push(name) },
    logger: { error() {} },
    on() {},
    effect(start: () => () => void) { disposers.push(start()) },
    inject(services: string[], start: (ctx: any) => () => void) {
      const injected = services.includes('webServer')
        ? { webServer: { register() { return () => {} } } }
        : { clientModules: { rebuilt() {} } }
      disposers.push(start(injected))
    },
    loader: { *entries() { yield entry } },
  })

  discoverPackage(provider)
  discoverPackage(laterProvider)
  const latestGeneration = getPatchStatuses().find(patch => patch.owner === 'later-live-provider')!.generation
  await new Promise<void>(resolve => setImmediate(resolve))

  expect(provided).toEqual(['harmony'])
  expect(imported.at(-1)).toBe(`live-target?dsh-harmony=${latestGeneration}`)
  expect(entry.options.name).toBe('live-target')
  expect(started).toEqual([nextPlugin])
  for (const dispose of disposers) await dispose()
})

test('reconciles the existing Loader tree when Harmony activates', async () => {
  const profile = join(root, 'initial-loader-profile')
  const provider = join(profile, 'node_modules', 'initial-loader-provider')
  const incompatible = join(profile, 'node_modules', 'incompatible-loader-provider')
  const disabled = join(profile, 'node_modules', 'disabled-loader-plugin')
  const target = join(profile, 'node_modules', 'initial-loader-target')
  mkdirSync(provider, { recursive: true })
  mkdirSync(incompatible, { recursive: true })
  mkdirSync(disabled, { recursive: true })
  mkdirSync(join(target, 'lib'), { recursive: true })
  writeFileSync(join(profile, 'package.json'), JSON.stringify({
    dependencies: {
      'initial-loader-provider': '1',
      'initial-loader-target': '1',
      'incompatible-loader-provider': '1',
      'disabled-loader-plugin': '1',
    },
  }))
  writeFileSync(join(provider, 'package.json'), JSON.stringify({
    name: 'initial-loader-provider',
    dsh: {
      plugin: { compatibility: { conflicts: { 'incompatible-loader-provider': '*' } } },
      harmony: { patches: ['./patch.cjs'] },
    },
  }))
  writeFileSync(join(provider, 'patch.cjs'), `
module.exports = [{
  id: 'test-patch',
  target: { package: 'initial-loader-target', version: '^1.0.0', file: 'lib/index.js' },
  select: 'SourceFile',
  apply() {},
}, {
  id: 'wrong-count',
  target: { package: 'initial-loader-target', file: 'lib/index.js' },
  select: 'NumericLiteral',
  expect: 2,
  apply() {},
}, {
  id: 'missing-target',
  target: { package: 'initial-loader-target-absent', file: 'lib/index.js' },
  select: 'SourceFile',
  apply() {},
}]
`)
  writeFileSync(join(incompatible, 'package.json'), JSON.stringify({
    name: 'incompatible-loader-provider',
    version: '2.0.0',
  }))
  writeFileSync(join(disabled, 'package.json'), JSON.stringify({
    name: 'disabled-loader-plugin',
    version: '1.0.0',
    dsh: { plugin: { compatibility: { conflicts: { 'initial-loader-provider': '*' } } } },
  }))
  writeFileSync(join(target, 'package.json'), JSON.stringify({ name: 'initial-loader-target', version: '2.0.0' }))
  writeFileSync(join(target, 'lib/index.js'), 'export const value = 1\n')
  synchronizeProfile(profile)

  const previousPlugin = () => {}
  const nextPlugin = () => {}
  const started: unknown[] = []
  const targetEntry = {
    id: 'target-entry',
    options: { name: 'initial-loader-target' },
    fiber: { uid: 1, runtime: { callback: previousPlugin } },
    loader: { unwrapExports(value: unknown) { return value } },
    parent: { tree: { async import() { readFileSync(join(target, 'lib/index.js'), 'utf8'); return nextPlugin } } },
    getOuterStack() { return [] },
    async _dispose() { this.fiber = undefined },
    async _start(plugin: unknown) {
      started.push(plugin)
      this.fiber = { uid: 2, runtime: { callback: plugin } }
    },
  } as any
  const entries = [
    targetEntry,
    { id: 'provider-entry', options: { name: 'initial-loader-provider' }, disabled: false },
    { id: 'incompatible-entry', options: { name: 'incompatible-loader-provider' }, disabled: false },
    { id: 'disabled-entry', options: { name: 'disabled-loader-plugin' }, disabled: true },
    { id: 'harmony-entry', options: { name: 'dsh-harmony' }, disabled: false },
  ]
  const disposers: Array<() => void | Promise<void>> = []
  const warnings: string[] = []
  await applyHarmonyPlugin({
    provide() {},
    logger: { error() {}, warn(message: string) { warnings.push(message) } },
    on() {},
    effect(start: () => () => void) { disposers.push(start()) },
    inject(services: string[], start: (ctx: any) => () => void) {
      const injected = services.includes('webServer')
        ? { webServer: { register() { return () => {} } } }
        : { clientModules: { rebuilt() {} } }
      disposers.push(start(injected))
    },
    loader: { *entries() { yield* entries } },
  })

  expect(started).toEqual([])
  expect(targetEntry.fiber.runtime.callback).toBe(previousPlugin)
  await expect(reloadHarmonyRuntime(profile, 'dsh-harmony'))
    .rejects.toThrow('reloading "dsh-harmony" inside its own runtime is unsafe')
  expect(warnings[0]).toBe('dsh-harmony: incompatible-loader-provider@2.0.0 conflicts with initial-loader-provider@0.0.0; both remain enabled')
  expect(warnings[1]).toContain('Patch "initial-loader-provider/test-patch" compatibility warning')
  expect(warnings[1]).toContain('target initial-loader-target@2.0.0 does not satisfy ^1.0.0')
  expect(warnings[1]).toContain('application continues')
  expect(warnings[2]).toContain('skipped Patch "initial-loader-provider/wrong-count"')
  expect(warnings[2]).toContain('expected 2 match(es)')
  expect(warnings[3]).toContain('skipped Patch "initial-loader-provider/missing-target"')
  expect(warnings[3]).toContain('is not installed')
  for (const dispose of disposers) await dispose()
})

test('cancels a queued Loader synchronization when the Harmony fiber stops', async () => {
  const profile = join(root, 'stopped-runtime-profile')
  mkdirSync(profile)
  writeFileSync(join(profile, 'package.json'), '{}')
  synchronizeProfile(profile)

  let configUpdate = (): void => {}
  const effects = new Map<string, () => void | Promise<void>>()
  const records: Array<{ operation?: string }> = []
  const performanceChannel = channel('dsh-harmony:load')
  const capture = (message: unknown): void => { records.push(message as { operation?: string }) }
  performanceChannel.subscribe(capture)
  try {
    await applyHarmonyPlugin({
      provide() {},
      logger: { error() {} },
      on(event: string, listener: () => void) {
        if (event === 'loader/config-update') configUpdate = listener
      },
      effect(start: () => unknown, label?: string) {
        const dispose = start()
        if (typeof dispose === 'function' && label !== undefined) effects.set(label, dispose as () => void | Promise<void>)
      },
      inject() {},
      loader: { *entries() {} },
    } as any)
    records.length = 0
    configUpdate()
    await effects.get('dsh-harmony: runtime updates')!()
    await new Promise<void>(resolve => setImmediate(resolve))
    expect(records.some(record => record.operation === 'plugin-update')).toBe(false)
  } finally {
    performanceChannel.unsubscribe(capture)
    for (const [label, dispose] of [...effects].reverse()) {
      if (label !== 'dsh-harmony: runtime updates') await dispose()
    }
  }
})

test('sends client bundle changes through the official client HMR path', async () => {
  const profile = join(root, 'client-live-profile')
  const provider = join(root, 'client-provider')
  mkdirSync(provider)
  writeFileSync(join(provider, 'package.json'), JSON.stringify({
    name: 'client-provider',
    dsh: { harmony: { patches: ['./patch.cjs'] } },
  }))
  writeFileSync(join(provider, 'patch.cjs'), `
module.exports = {
  id: 'test-patch',
  target: { package: 'web-target', file: 'lib/client.js' },
  select: 'SourceFile',
  apply() {},
}
`)
  mkdirSync(profile)
  writeFileSync(join(profile, 'package.json'), '{}')
  synchronizeProfile(profile)

  const entry = { options: { id: 'web', name: 'web-target' } } as any
  const updates: any[][] = []
  const group = {
    data: [entry.options],
    async update(config: any[]) { updates.push(config) },
  }
  entry.parent = group
  const rebuilt: string[] = []
  const disposers: Array<() => void | Promise<void>> = []
  await applyHarmonyPlugin({
    provide() {},
    logger: { error() {} },
    on() {},
    effect(start: () => () => void) { disposers.push(start()) },
    inject(services: string[], start: (ctx: any) => () => void) {
      const injected = services.includes('webServer')
        ? { webServer: { register() { return () => {} } } }
        : { clientModules: { rebuilt(name: string) { rebuilt.push(name) } } }
      disposers.push(start(injected))
    },
    loader: { *entries() { yield entry } },
  })

  discoverPackage(provider)
  await new Promise<void>(resolve => setImmediate(resolve))

  expect(rebuilt).toEqual(['web-target'])
  expect(updates).toEqual([])
  for (const dispose of disposers) await dispose()
})

test('keeps the previous loader fiber when a patched replacement fails', async () => {
  const profile = join(root, 'failing-live-profile')
  const provider = join(root, 'failing-live-provider')
  mkdirSync(provider)
  writeFileSync(join(provider, 'package.json'), JSON.stringify({
    name: 'failing-live-provider',
    dsh: { harmony: { patches: ['./patch.cjs'] } },
  }))
  writeFileSync(join(provider, 'patch.cjs'), `
module.exports = {
  id: 'test-patch',
  target: { package: 'failing-live-target', file: 'lib/index.js' },
  select: 'SourceFile',
  apply() {},
}
`)
  mkdirSync(profile)
  writeFileSync(join(profile, 'package.json'), '{}')
  synchronizeProfile(profile)

  const previousPlugin = () => {}
  const nextPlugin = () => {}
  const errors: unknown[] = []
  const entry = {
    options: { id: 'failing-live', name: 'failing-live-target' },
    fiber: { uid: 1, runtime: { callback: previousPlugin } },
    loader: { unwrapExports(value: unknown) { return value } },
    parent: { tree: { async import() { return nextPlugin } } },
    getOuterStack() { return [] },
    async _dispose() { this.fiber = undefined },
    async _start(plugin: unknown) {
      if (plugin === nextPlugin) throw new Error('replacement failed')
      this.fiber = { uid: 2, runtime: { callback: plugin } }
    },
  } as any
  const disposers: Array<() => void | Promise<void>> = []
  await applyHarmonyPlugin({
    provide() {},
    logger: { error(error: unknown) { errors.push(error) } },
    on() {},
    effect(start: () => () => void) { disposers.push(start()) },
    inject(services: string[], start: (ctx: any) => () => void) {
      const injected = services.includes('webServer')
        ? { webServer: { register() { return () => {} } } }
        : { clientModules: { rebuilt() {} } }
      disposers.push(start(injected))
    },
    loader: { *entries() { yield entry } },
  })

  discoverPackage(provider)
  await new Promise<void>(resolve => setImmediate(resolve))

  expect(entry.options.name).toBe('failing-live-target')
  expect(entry.fiber.runtime.callback).toBe(previousPlugin)
  expect(errors).toHaveLength(1)
  for (const dispose of disposers) await dispose()
})

test('rolls back every loader entry when dispose fails midway', async () => {
  const oldFirst = () => {}
  const oldSecond = () => {}
  const nextFirst = () => {}
  const nextSecond = () => {}
  const makeEntry = (name: string, previous: () => void, next: () => void, failDispose = false): any => ({
    options: { name },
    fiber: { uid: 1, runtime: { callback: previous } },
    loader: { unwrapExports(value: unknown) { return value } },
    parent: { tree: { async import() { return next } } },
    getOuterStack() { return [] },
    async _dispose() {
      this.fiber = undefined
      if (failDispose) throw new Error('dispose failed')
    },
    async _start(plugin: unknown) {
      this.fiber = { uid: 2, runtime: { callback: plugin } }
    },
  })
  const first = makeEntry('multi-target', oldFirst, nextFirst)
  const second = makeEntry('multi-target', oldSecond, nextSecond, true)

  await expect(reloadEntries([first, second], 1)).rejects.toThrow('dispose failed')
  expect(first.fiber.runtime.callback).toBe(oldFirst)
  expect(second.fiber.runtime.callback).toBe(oldSecond)
})

test('reloads a changed patch file while the profile is running', async () => {
  const profile = join(root, 'watched-profile')
  const provider = join(profile, 'node_modules', 'watched-provider')
  const target = join(root, 'watched-target')
  mkdirSync(provider, { recursive: true })
  mkdirSync(join(target, 'lib'), { recursive: true })
  writeFileSync(join(profile, 'package.json'), JSON.stringify({ dependencies: { 'watched-provider': '1' } }))
  writeFileSync(join(provider, 'package.json'), JSON.stringify({
    name: 'watched-provider',
    dsh: { harmony: { patches: ['./patch.cjs'] } },
  }))
  const patchFile = join(provider, 'patch.cjs')
  const writePatch = (value: number): void => writeFileSync(patchFile, `
module.exports = {
  id: 'test-patch',
  target: { package: 'watched-target', file: 'lib/index.js' },
  select: 'NumericLiteral',
  apply({ node, edit }) { edit.overwrite(node.getStart(), node.getEnd(), '${value}') },
}
`)
  writePatch(2)
  writeFileSync(join(target, 'package.json'), JSON.stringify({ name: 'watched-target' }))
  writeFileSync(join(target, 'lib/index.js'), 'export const value = 1\n')

  synchronizeProfile(profile)
  const errors: unknown[] = []
  const stop = watchProfile(() => beginPluginUpdate().commit(), error => errors.push(error))
  try {
    await delay(WATCH_READY_DELAY)
    expect(readFileSync(join(target, 'lib/index.js'), 'utf8')).toContain('value = 2')
    writePatch(3)
    await expect.poll(
      () => readFileSync(join(target, 'lib/index.js'), 'utf8'),
      { timeout: 5000 },
    ).toContain('value = 3')
    writeFileSync(patchFile, 'throw new Error("invalid patch")\n')
    await expect.poll(() => errors.length, { timeout: 5000 }).toBeGreaterThan(0)
    expect(readFileSync(join(target, 'lib/index.js'), 'utf8')).toContain('value = 3')
  } finally {
    stop()
  }
})

test('retries a newly configured Provider after only its failed helper is fixed', async () => {
  const profile = join(root, 'watched-new-provider-profile')
  const provider = join(profile, 'node_modules', 'watched-new-provider')
  const target = join(profile, 'node_modules', 'watched-new-target')
  mkdirSync(provider, { recursive: true })
  mkdirSync(join(target, 'lib'), { recursive: true })
  writeFileSync(join(profile, 'package.json'), '{}')
  writeFileSync(join(provider, 'package.json'), JSON.stringify({
    name: 'watched-new-provider',
    dsh: { harmony: { patches: ['./patch.cjs'] } },
  }))
  const patchFile = join(provider, 'patch.cjs')
  const helperFile = join(provider, 'helper.cjs')
  writeFileSync(patchFile, `
const value = require('./helper.cjs')
module.exports = {
  id: 'recovered',
  target: { package: 'watched-new-target', file: 'lib/index.js' },
  select: 'NumericLiteral', expect: 1,
  apply({ node, edit }) { edit.overwrite(node.getStart(), node.getEnd(), String(value)) },
}
`)
  writeFileSync(join(target, 'package.json'), JSON.stringify({ name: 'watched-new-target' }))
  writeFileSync(join(target, 'lib/index.js'), 'export const value = 1\n')

  synchronizeProfile(profile)
  const errors: unknown[] = []
  const stop = watchProfile(() => beginPluginUpdate().commit(), error => errors.push(error))
  try {
    await delay(WATCH_READY_DELAY)
    writeFileSync(join(profile, 'package.json'), JSON.stringify({
      dependencies: { 'watched-new-provider': '1' },
    }))
    await expect.poll(() => errors.length, { timeout: 5000 }).toBeGreaterThan(0)
    expect(currentProfile().plugins.some(plugin => plugin.name === 'watched-new-provider')).toBe(false)
    expect(existsSync(helperFile)).toBe(false)

    writeFileSync(helperFile, 'module.exports = 2\n')
    await expect.poll(
      () => currentProfile().plugins.some(plugin => plugin.name === 'watched-new-provider'),
      { timeout: 5000 },
    ).toBe(true)
    expect(readFileSync(join(target, 'lib/index.js'), 'utf8')).toContain('value = 2')
  } finally {
    stop()
  }
})

test('discovers a configured Provider that is absent from profile dependencies', async () => {
  const profile = join(root, 'configured-provider-profile')
  const provider = join(profile, 'node_modules', 'configured-provider')
  const target = join(profile, 'node_modules', 'configured-target')
  mkdirSync(provider, { recursive: true })
  mkdirSync(join(target, 'lib'), { recursive: true })
  writeFileSync(join(profile, 'package.json'), '{}')
  writeFileSync(join(provider, 'package.json'), JSON.stringify({
    name: 'configured-provider',
    dsh: { harmony: { patches: ['./patch.cjs'] } },
  }))
  writeFileSync(join(provider, 'patch.cjs'), `
module.exports = {
  id: 'configured',
  target: { package: 'configured-target', file: 'lib/index.js' },
  select: 'NumericLiteral', expect: 1,
  apply({ node, edit }) { edit.overwrite(node.getStart(), node.getEnd(), '2') },
}
`)
  writeFileSync(join(target, 'package.json'), JSON.stringify({ name: 'configured-target' }))
  writeFileSync(join(target, 'lib/index.js'), 'export const value = 1\n')

  synchronizeProfile(profile)
  expect(currentProfile().plugins.some(plugin => plugin.name === 'configured-provider')).toBe(false)
  const transaction = beginPluginUpdate(
    false,
    [{ name: 'configured-provider', entryIds: ['configured-entry'] }],
    ['configured-provider'],
  )
  expect(transaction.profile.plugins.find(plugin => plugin.name === 'configured-provider')?.patches)
    .toEqual(['./patch.cjs'])
  await transaction.commit()
  expect(readFileSync(join(target, 'lib/index.js'), 'utf8')).toContain('value = 2')

  const removed = beginPluginUpdate(false, [], [])
  expect([...removed.targets].map(([name, files]) => [name, [...files]])).toEqual([
    ['configured-target', ['lib/index.js']],
  ])
  await removed.commit()
  expect(currentProfile().plugins.some(plugin => plugin.name === 'configured-provider')).toBe(false)
  expect(readFileSync(join(target, 'lib/index.js'), 'utf8')).toContain('value = 1')
  expect(JSON.parse(readFileSync(join(profile, 'harmony.json'), 'utf8')).order).toEqual([])
})

test('derives startup Provider candidates from the composed DSH profile', async () => {
  const home = join(root, 'composed-profile-home')
  const profile = join(home, 'profiles', 'custom')
  const provider = join(profile, 'node_modules', 'composed-provider')
  mkdirSync(provider, { recursive: true })
  writeFileSync(join(profile, 'package.json'), JSON.stringify({
    name: 'dsh-profile-custom',
    dsh: { profile: { bundles: [] } },
  }))
  writeFileSync(join(profile, 'cordis.patch.yml'), `
- insert:
    - id: composed-provider
      name: composed-provider
`)
  writeFileSync(join(provider, 'package.json'), JSON.stringify({ name: 'composed-provider' }))

  const configured = configuredProfileCandidates('custom', profile)
  expect(configured.some(candidate => realpathSync(candidate) === realpathSync(join(provider, 'package.json')))).toBe(true)
  expect(existsSync(join(home, 'profiles', 'node_modules'))).toBe(false)
  discoverProfile(profile, false, configured)
  expect(currentProfile().plugins.map(plugin => plugin.name)).toContain('composed-provider')
  await expect(beginStartupUpdate([{ name: 'composed-provider', entryIds: ['composed-provider'] }]).commit())
    .resolves.toBeUndefined()
})

test('activates required Harmony Provider bundles once without persisting profile layers', () => {
  const home = join(root, 'required-provider-home')
  const profile = join(home, 'profiles', 'custom')
  const fleet = join(profile, 'node_modules', 'fleet-plugin')
  const binding = join(fleet, 'node_modules', 'binding-provider')
  mkdirSync(binding, { recursive: true })
  writeFileSync(join(profile, 'package.json'), JSON.stringify({
    name: 'dsh-profile-custom',
    dependencies: { 'fleet-plugin': '1.0.0' },
    dsh: { profile: { bundles: ['fleet-plugin'] } },
  }))
  writeFileSync(join(fleet, 'package.json'), JSON.stringify({
    name: 'fleet-plugin',
    version: '1.0.0',
    dsh: {
      bundle: { patch: './cordis.patch.yml' },
      harmony: { requires: { 'binding-provider': '^2.0.0' }, patches: [] },
    },
  }))
  writeFileSync(join(fleet, 'cordis.patch.yml'), `
- insert:
    - id: fleet-plugin
      name: fleet-plugin
`)
  writeFileSync(join(binding, 'package.json'), JSON.stringify({
    name: 'binding-provider',
    version: '2.1.0',
    dsh: {
      bundle: { patch: './binding.patch.yml' },
      harmony: { patches: [] },
    },
  }))
  writeFileSync(join(binding, 'binding.patch.yml'), `
- insert:
    - id: binding-provider
      name: binding-provider
`)

  const manifestBefore = readFileSync(join(profile, 'package.json'), 'utf8')
  const nested = configuredProfileActivation('custom', profile)
  expect(nested.candidates.map(candidate => {
    try { return JSON.parse(readFileSync(candidate, 'utf8')).name } catch { return candidate }
  })).toEqual(expect.arrayContaining(['fleet-plugin', 'binding-provider']))
  expect(nested.patches.map(patch => realpathSync(patch))).toEqual([realpathSync(join(binding, 'binding.patch.yml'))])
  expect(readFileSync(join(profile, 'package.json'), 'utf8')).toBe(manifestBefore)

  symlinkSync(binding, join(profile, 'node_modules', 'binding-provider'), process.platform === 'win32' ? 'junction' : 'dir')
  writeFileSync(join(profile, 'package.json'), JSON.stringify({
    name: 'dsh-profile-custom',
    dependencies: { 'fleet-plugin': '1.0.0', 'binding-provider': '2.1.0' },
    dsh: { profile: { bundles: ['binding-provider', 'fleet-plugin'] } },
  }))
  expect(configuredProfileActivation('custom', profile).patches).toEqual([])
})

test('resolves a nested Provider from the real directory behind a pnpm-style bundle symlink', async () => {
  const home = join(root, 'symlinked-bundle-home')
  const profile = join(home, 'profiles', 'custom')
  const bundle = join(root, 'symlinked-bundle-real')
  const provider = join(bundle, 'node_modules', 'nested-provider')
  const providerStore = join(root, 'pnpm-store', 'nested-provider')
  mkdirSync(join(profile, 'node_modules'), { recursive: true })
  mkdirSync(dirname(provider), { recursive: true })
  mkdirSync(providerStore, { recursive: true })
  writeFileSync(join(profile, 'package.json'), JSON.stringify({
    name: 'dsh-profile-custom',
    dependencies: { 'symlinked-bundle': '1.0.0' },
    dsh: { profile: { bundles: ['symlinked-bundle'] } },
  }))
  writeFileSync(join(bundle, 'package.json'), JSON.stringify({
    name: 'symlinked-bundle',
    version: '1.0.0',
    dsh: { bundle: { patch: './cordis.patch.yml' } },
  }))
  writeFileSync(join(bundle, 'cordis.patch.yml'), `
- insert:
    - id: nested-provider
      name: nested-provider
`)
  writeFileSync(join(providerStore, 'package.json'), JSON.stringify({
    name: 'nested-provider',
    version: '1.0.0',
    main: './index.js',
    dsh: { harmony: { patches: [] } },
  }))
  writeFileSync(join(providerStore, 'index.js'), 'module.exports = { version: 1 }\n')
  symlinkSync(providerStore, provider, process.platform === 'win32' ? 'junction' : 'dir')
  symlinkSync(bundle, join(profile, 'node_modules', 'symlinked-bundle'), process.platform === 'win32' ? 'junction' : 'dir')

  const configured = configuredProfileCandidates('custom', profile)
  expect(configured.some(candidate => {
    try { return realpathSync(candidate) === realpathSync(join(providerStore, 'package.json')) } catch { return false }
  })).toBe(true)

  discoverProfile(profile, false, configured)
  const nestedDirectory = resolveProfileDependency(
    'nested-provider',
    pathToFileURL(join(profile, 'package.json')).href,
  )!
  expect(realpathSync(nestedDirectory)).toBe(realpathSync(providerStore))
  expect(resolveProfileDependency('nested-provider', import.meta.url)).toBe(nestedDirectory)
  expect(existsSync(join(home, 'profiles', 'node_modules'))).toBe(false)

  const update = beginPluginUpdate(
    false,
    [{ name: 'nested-provider', entryIds: ['nested-provider'] }],
    [join(providerStore, 'package.json')],
  )
  expect(update.profile.plugins.map(plugin => plugin.name)).toContain('nested-provider')
  update.rollback()
})

test('replaces transitive Provider resolution when the active profile changes', () => {
  const firstProfile = join(root, 'transitive-first-profile')
  const secondProfile = join(root, 'transitive-second-profile')
  const firstProvider = join(root, 'transitive-first-bundle', 'node_modules', 'switching-transitive-provider')
  const secondProvider = join(root, 'transitive-second-bundle', 'node_modules', 'switching-transitive-provider')
  for (const profile of [firstProfile, secondProfile]) {
    mkdirSync(profile, { recursive: true })
    writeFileSync(join(profile, 'package.json'), JSON.stringify({ name: 'transitive-profile' }))
  }
  for (const [provider, version] of [[firstProvider, 1], [secondProvider, 2]] as const) {
    mkdirSync(provider, { recursive: true })
    writeFileSync(join(provider, 'package.json'), JSON.stringify({
      name: 'switching-transitive-provider', version: `${version}.0.0`, main: './index.js',
    }))
    writeFileSync(join(provider, 'index.js'), `module.exports = { version: ${version} }\n`)
  }

  discoverProfile(firstProfile, false, [join(firstProvider, 'package.json')])
  const firstDirectory = resolveProfileDependency(
    'switching-transitive-provider',
    pathToFileURL(join(firstProfile, 'package.json')).href,
  )!
  expect(realpathSync(firstDirectory)).toBe(realpathSync(firstProvider))

  discoverProfile(secondProfile, false, [join(secondProvider, 'package.json')])
  const secondDirectory = resolveProfileDependency(
    'switching-transitive-provider',
    pathToFileURL(join(secondProfile, 'package.json')).href,
  )!
  expect(realpathSync(secondDirectory)).toBe(realpathSync(secondProvider))
})

test('stages transitive Provider resolution with plugin update commit and rollback', async () => {
  const profile = join(root, 'transitive-transaction-profile')
  const profileUrl = pathToFileURL(join(profile, 'package.json')).href
  const providers = [1, 2].map(version =>
    join(root, `transitive-transaction-v${version}`, 'node_modules', 'transaction-provider'))
  mkdirSync(profile, { recursive: true })
  writeFileSync(join(profile, 'package.json'), JSON.stringify({ name: 'transitive-transaction-profile' }))
  for (const [index, provider] of providers.entries()) {
    mkdirSync(provider, { recursive: true })
    writeFileSync(join(provider, 'package.json'), JSON.stringify({
      name: 'transaction-provider', version: `${index + 1}.0.0`, main: './index.js',
    }))
    writeFileSync(join(provider, 'index.js'), `module.exports = ${index + 1}\n`)
  }

  discoverProfile(profile, false, [join(providers[0]!, 'package.json')])
  const firstDirectory = resolveProfileDependency('transaction-provider', profileUrl)!
  expect(realpathSync(firstDirectory)).toBe(realpathSync(providers[0]!))

  const commit = beginPluginUpdate(true, [], [join(providers[1]!, 'package.json')])
  expect(commit.profile.plugins.find(plugin => plugin.name === 'transaction-provider')?.version).toBe('2.0.0')
  expect(realpathSync(resolveProfileDependency('transaction-provider', profileUrl, commit.generation)!))
    .toBe(realpathSync(providers[1]!))
  expect(realpathSync(resolveProfileDependency('transaction-provider', profileUrl, commit.generation - 1)!))
    .toBe(realpathSync(providers[0]!))
  await commit.commit()
  expect(realpathSync(resolveProfileDependency('transaction-provider', profileUrl)!))
    .toBe(realpathSync(providers[1]!))

  const rollback = beginPluginUpdate(true, [], [join(providers[0]!, 'package.json')])
  expect(rollback.profile.plugins.find(plugin => plugin.name === 'transaction-provider')?.version).toBe('1.0.0')
  expect(realpathSync(resolveProfileDependency('transaction-provider', profileUrl, rollback.generation)!))
    .toBe(realpathSync(providers[0]!))
  expect(realpathSync(resolveProfileDependency('transaction-provider', profileUrl, rollback.generation - 1)!))
    .toBe(realpathSync(providers[1]!))
  rollback.rollback()
  expect(realpathSync(resolveProfileDependency('transaction-provider', profileUrl)!))
    .toBe(realpathSync(providers[1]!))
})

test('reloads a Provider when the selected directory changes but its Patch files do not', () => {
  const profile = join(root, 'provider-directory-profile')
  const target = join(profile, 'node_modules', 'provider-directory-target')
  const candidates = [1, 2].map(version => join(root, `provider-directory-v${version}`))
  mkdirSync(join(target, 'lib'), { recursive: true })
  writeFileSync(join(profile, 'package.json'), JSON.stringify({
    dependencies: { 'provider-directory-target': '1.0.0' },
  }))
  writeFileSync(join(target, 'package.json'), JSON.stringify({ name: 'provider-directory-target', version: '1.0.0' }))
  writeFileSync(join(target, 'lib/index.js'), 'export const value = 1\n')
  const patchSource = `
const helper = require('provider-directory-helper')
module.exports = {
  id: 'directory', description: String(helper.value),
  target: { package: 'provider-directory-target', file: 'lib/index.js' },
  select: 'NumericLiteral', expect: 1,
  apply({ node, edit }) { edit.overwrite(node.getStart(), node.getEnd(), '2') },
}
`
  for (const [index, candidate] of candidates.entries()) {
    const helper = join(candidate, 'node_modules', 'provider-directory-helper')
    mkdirSync(helper, { recursive: true })
    writeFileSync(join(candidate, 'package.json'), JSON.stringify({
      name: 'provider-directory-provider', version: '1.0.0',
      dsh: { harmony: { patches: ['./patch.cjs'] } },
    }))
    writeFileSync(join(candidate, 'patch.cjs'), patchSource)
    writeFileSync(join(helper, 'package.json'), JSON.stringify({ name: 'provider-directory-helper', main: './index.cjs' }))
    writeFileSync(join(helper, 'index.cjs'), `module.exports = { value: ${index + 1} }\n`)
  }

  discoverProfile(profile, false, [join(candidates[0]!, 'package.json')])
  expect(getPatchStatuses().find(status => status.key === 'provider-directory-provider/directory')?.description).toBe('1')

  const update = beginPluginUpdate(true, [], [join(candidates[1]!, 'package.json')])
  expect(getPatchStatuses().find(status => status.key === 'provider-directory-provider/directory')?.description).toBe('2')
  update.rollback()
})

test('reloads a provider whose patch target changes', async () => {
  const profile = join(root, 'retarget-profile')
  const provider = join(profile, 'node_modules', 'retargeter')
  const firstTarget = join(root, 'retarget-first')
  const secondTarget = join(root, 'retarget-second')
  mkdirSync(provider, { recursive: true })
  mkdirSync(join(firstTarget, 'lib'), { recursive: true })
  mkdirSync(join(secondTarget, 'lib'), { recursive: true })
  writeFileSync(join(profile, 'package.json'), JSON.stringify({ dependencies: { retargeter: '1' } }))
  writeFileSync(join(provider, 'package.json'), JSON.stringify({
    name: 'retargeter',
    dsh: { harmony: { patches: ['./patch.cjs'] } },
  }))
  for (const [dir, name] of [[firstTarget, 'retarget-first'], [secondTarget, 'retarget-second']] as const) {
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name }))
    writeFileSync(join(dir, 'lib/index.js'), 'export const value = 1\n')
  }
  const writePatch = (target: string, value: number): void => writeFileSync(join(provider, 'patch.cjs'), `
module.exports = {
  id: 'test-patch',
  target: { package: '${target}', file: 'lib/index.js' },
  select: 'NumericLiteral',
  apply({ node, edit }) { edit.overwrite(node.getStart(), node.getEnd(), '${value}') },
}
`)

  writePatch('retarget-first', 2)
  synchronizeProfile(profile)
  expect(readFileSync(join(firstTarget, 'lib/index.js'), 'utf8')).toContain('value = 2')

  writePatch('retarget-second', 3)
  const transaction = beginPluginUpdate()
  expect([...transaction.targets].map(([name, files]) => [name, [...files]])).toEqual([
    ['retarget-first', ['lib/index.js']],
    ['retarget-second', ['lib/index.js']],
  ])
  await transaction.commit()
  expect(readFileSync(join(firstTarget, 'lib/index.js'), 'utf8')).toContain('value = 1')
  expect(readFileSync(join(secondTarget, 'lib/index.js'), 'utf8')).toContain('value = 3')
})

test('rejects a Patch graph change during plugin startup without advancing the generation', () => {
  const profile = join(root, 'startup-graph-drift-profile')
  const provider = join(profile, 'node_modules', 'startup-graph-provider')
  const target = join(profile, 'node_modules', 'startup-graph-target')
  mkdirSync(provider, { recursive: true })
  mkdirSync(join(target, 'lib'), { recursive: true })
  writeFileSync(join(profile, 'package.json'), JSON.stringify({
    dependencies: { 'startup-graph-provider': '1', 'startup-graph-target': '1' },
  }))
  writeFileSync(join(provider, 'package.json'), JSON.stringify({
    name: 'startup-graph-provider', dsh: { harmony: { patches: ['./patch.cjs'] } },
  }))
  const writePatch = (value: number): void => writeFileSync(join(provider, 'patch.cjs'), `
module.exports = {
  id: 'startup-graph', target: { package: 'startup-graph-target', file: 'lib/index.js' },
  select: 'NumericLiteral', expect: 1,
  apply({ node, edit }) { edit.overwrite(node.getStart(), node.getEnd(), '${value}') },
}
`)
  writeFileSync(join(target, 'package.json'), JSON.stringify({ name: 'startup-graph-target', version: '1.0.0' }))
  writeFileSync(join(target, 'lib/index.js'), 'export const value = 1\n')
  writePatch(2)
  synchronizeProfile(profile)
  const generationBefore = getPatchStatuses()[0].generation

  writePatch(3)
  expect(() => beginStartupUpdate([{ name: 'startup-graph-provider', entryIds: ['provider'] }]))
    .toThrow('Patch graph changed during startup; restart is required')
  expect(getPatchStatuses()[0].generation).toBe(generationBefore)
  expect(readFileSync(join(target, 'lib/index.js'), 'utf8')).toContain('value = 2')
})

test('reloads a provider when its local CommonJS helper changes', async () => {
  const profile = join(root, 'provider-helper-profile')
  const provider = join(profile, 'node_modules', 'provider-helper')
  const target = join(profile, 'node_modules', 'provider-helper-target')
  mkdirSync(provider, { recursive: true })
  mkdirSync(join(target, 'lib'), { recursive: true })
  writeFileSync(join(profile, 'package.json'), JSON.stringify({
    dependencies: { 'provider-helper': '1', 'provider-helper-target': '1' },
  }))
  const writeManifest = (version: string): void => writeFileSync(join(provider, 'package.json'), JSON.stringify({
    name: 'provider-helper', version, dsh: { harmony: { patches: ['./patch.cjs'] } },
  }))
  writeFileSync(join(provider, 'patch.cjs'), `
const value = require('./value.cjs')
module.exports = {
  id: 'helper', target: { package: 'provider-helper-target', file: 'lib/index.js' },
  select: 'NumericLiteral', expect: 1,
  apply({ node, edit }) { edit.overwrite(node.getStart(), node.getEnd(), String(value)) },
}
`)
  writeFileSync(join(target, 'package.json'), JSON.stringify({ name: 'provider-helper-target', version: '1.0.0' }))
  writeFileSync(join(target, 'lib/index.js'), 'export const value = 1\n')
  writeManifest('1.0.0')
  writeFileSync(join(provider, 'value.cjs'), 'module.exports = 2\n')
  synchronizeProfile(profile)
  expect(readFileSync(join(target, 'lib/index.js'), 'utf8')).toContain('value = 2')

  writeManifest('2.0.0')
  writeFileSync(join(provider, 'value.cjs'), 'module.exports = 3\n')
  await beginPluginUpdate(true).commit()
  expect(readFileSync(join(target, 'lib/index.js'), 'utf8')).toContain('value = 3')
})

test('restores the CommonJS module cache when a reload fails', async () => {
  const target = join(root, 'cjs-rollback-target')
  const entryFile = join(target, 'index.cjs')
  mkdirSync(target)
  writeFileSync(join(target, 'package.json'), JSON.stringify({ name: 'cjs-rollback-target' }))
  writeFileSync(entryFile, 'module.exports = { value: 2 }\n')
  const require = createRequire(import.meta.url)
  const previousPlugin = require(entryFile)
  writeFileSync(entryFile, 'module.exports = { value: 3 }\n')
  const entry = {
    options: { name: entryFile },
    fiber: { uid: 1, runtime: { callback: previousPlugin } },
    loader: { unwrapExports(value: unknown) { return value } },
    parent: { tree: { ctx: { baseUrl: import.meta.url }, async import() { return require(entryFile) } } },
    getOuterStack() { return [] },
    async _dispose() { this.fiber = undefined },
    async _start(plugin: any) {
      if (plugin.value === 3) throw new Error('candidate start failed')
      this.fiber = { uid: 2, runtime: { callback: plugin } }
    },
  } as any

  await expect(reloadEntries([entry], 1)).rejects.toThrow('candidate start failed')
  expect(entry.fiber.runtime.callback.value).toBe(2)
  expect(require(entryFile).value).toBe(2)
})

test('does not reload a Provider entry when only its Patch graph changes', async () => {
  const profile = join(root, 'provider-retry-profile')
  const provider = join(profile, 'node_modules', 'provider-retry')
  const target = join(profile, 'node_modules', 'provider-retry-target')
  mkdirSync(provider, { recursive: true })
  mkdirSync(join(target, 'lib'), { recursive: true })
  writeFileSync(join(profile, 'package.json'), JSON.stringify({
    dependencies: { 'provider-retry': '1', 'provider-retry-target': '1' },
  }))
  const writeManifest = (version: string): void => writeFileSync(join(provider, 'package.json'), JSON.stringify({
    name: 'provider-retry', version, main: './index.cjs', dsh: { harmony: { patches: ['./patch.cjs'] } },
  }))
  writeManifest('1.0.0')
  writeFileSync(join(provider, 'shared.cjs'), 'module.exports = { value: 1 }\n')
  writeFileSync(join(provider, 'index.cjs'), "module.exports = { shared: require('./shared.cjs') }\n")
  writeFileSync(join(provider, 'patch.cjs'), `
const shared = require('./shared.cjs')
module.exports = {
  id: 'retry', target: { package: 'provider-retry-target', file: 'lib/index.js' },
  select: 'NumericLiteral', expect: 1,
  apply({ node, edit }) { edit.overwrite(node.getStart(), node.getEnd(), String(shared.value)) },
}
`)
  writeFileSync(join(target, 'package.json'), JSON.stringify({ name: 'provider-retry-target', version: '1.0.0' }))
  writeFileSync(join(target, 'lib/index.js'), 'export const value = 0\n')
  synchronizeProfile(profile)
  const require = createRequire(import.meta.url)
  const runningProvider = require(provider)
  let notifyPlugin = (_fiber: any): void => {}
  let candidateStarts = 0
  const providerEntry = {
    options: { name: 'provider-retry' },
    fiber: { uid: 1, runtime: { callback: runningProvider } },
    loader: { unwrapExports(value: unknown) { return value } },
    parent: { tree: {
      ctx: { baseUrl: pathToFileURL(join(profile, 'package.json')).href },
      async import() { return require(provider) },
    } },
    getOuterStack() { return [] },
    async _dispose() {
      this.fiber = undefined
      if (candidateStarts < 4) notifyPlugin({ entry: this })
    },
    async _start(plugin: any) {
      if (plugin.shared.value === 2) candidateStarts += 1
      if (candidateStarts < 4) notifyPlugin({ entry: this })
      if (plugin.shared.value === 2) throw new Error('provider candidate rejected')
      this.fiber = { uid: 2, runtime: { callback: plugin } }
    },
  } as any
  const entries = [
    providerEntry,
    { options: { name: 'provider-retry-target' } },
    { options: { name: 'dsh-harmony' } },
  ]
  const disposers: Array<() => void | Promise<void>> = []
  await applyHarmonyPlugin({
    provide() {},
    logger: { error() {} },
    on(event: string, listener: (fiber: any) => void) {
      if (event === 'internal/plugin') notifyPlugin = listener
    },
    effect(start: () => any) {
      const dispose = start()
      if (typeof dispose === 'function') disposers.push(dispose)
    },
    inject(services: string[], start: (ctx: any) => any) {
      const injected = services.includes('webServer')
        ? { webServer: { host: '127.0.0.1', port: 0, register() { return () => {} } } }
        : { clientModules: { rebuilt() {} } }
      const dispose = start(injected)
      if (typeof dispose === 'function') disposers.push(dispose)
    },
    loader: { *entries() { yield* entries } },
  })
  await new Promise<void>(resolve => setImmediate(resolve))

  writeManifest('2.0.0')
  writeFileSync(join(provider, 'shared.cjs'), 'module.exports = { value: 2 }\n')
  notifyPlugin({})
  for (let index = 0; index < 8; index += 1) await new Promise<void>(resolve => setImmediate(resolve))
  expect(candidateStarts).toBe(0)
  expect(providerEntry.fiber.runtime.callback).toBe(runningProvider)
  for (const dispose of disposers.reverse()) await dispose()
})

test('keeps a selected nested Provider when Loader cannot resolve its bare package name', async () => {
  const profile = join(root, 'loader-inventory-profile')
  const provider = join(root, 'loader-inventory-bundle', 'node_modules', 'loader-inventory-provider')
  const fallback = join(profile, 'node_modules', 'loader-inventory-provider')
  mkdirSync(fallback, { recursive: true })
  mkdirSync(provider, { recursive: true })
  writeFileSync(join(profile, 'package.json'), '{}')
  writeFileSync(join(fallback, 'package.json'), JSON.stringify({
    name: 'loader-inventory-provider', version: '0.0.1',
  }))
  writeFileSync(join(provider, 'package.json'), JSON.stringify({
    name: 'loader-inventory-provider', version: '1.0.0',
    dsh: { harmony: { patches: ['./patch.cjs'] } },
  }))
  writeFileSync(join(provider, 'patch.cjs'), `
module.exports = {
  id: 'missing-target', target: { package: 'loader-inventory-missing-target', file: 'index.js' },
  select: 'SourceFile', apply() {},
}
`)
  synchronizeProfile(profile, undefined, undefined, [join(provider, 'package.json')])

  let notifyPlugin = (_fiber: any): void => {}
  const disposers: Array<() => void | Promise<void>> = []
  const entries = [{
    id: 'provider-entry',
    options: { name: 'loader-inventory-provider' },
    disabled: false,
    parent: { tree: { ctx: { baseUrl: pathToFileURL(join(profile, 'package.json')).href } } },
  }, {
    id: 'harmony-entry', options: { name: 'dsh-harmony' }, disabled: false,
  }]
  await applyHarmonyPlugin({
    provide() {},
    logger: { error() {}, warn() {} },
    on(event: string, listener: (fiber: any) => void) {
      if (event === 'internal/plugin') notifyPlugin = listener
    },
    effect(start: () => any) {
      const dispose = start()
      if (typeof dispose === 'function') disposers.push(dispose)
    },
    inject(services: string[], start: (ctx: any) => any) {
      const injected = services.includes('webServer')
        ? { webServer: { host: '127.0.0.1', port: 0, register() { return () => {} } } }
        : { clientModules: { rebuilt() {} } }
      const dispose = start(injected)
      if (typeof dispose === 'function') disposers.push(dispose)
    },
    loader: { *entries() { yield* entries } },
  })
  for (let index = 0; index < 4; index += 1) await new Promise<void>(resolve => setImmediate(resolve))

  notifyPlugin({})
  for (let index = 0; index < 4; index += 1) await new Promise<void>(resolve => setImmediate(resolve))
  const retainedProvider = currentProfile().plugins.find(plugin => plugin.name === 'loader-inventory-provider')
  expect(retainedProvider).toBeDefined()
  expect(realpathSync(retainedProvider!.dir)).toBe(realpathSync(provider))
  for (const dispose of disposers.reverse()) await dispose()
})

test('reloads typeless ESM through a generation URL', async () => {
  const target = join(root, 'typeless-esm-target')
  const entryFile = join(target, 'index.js')
  mkdirSync(target)
  writeFileSync(join(target, 'package.json'), JSON.stringify({ name: 'typeless-esm-target' }))
  writeFileSync(entryFile, 'export default { value: 1 }\n')
  const previousPlugin = (await import(`${pathToFileURL(entryFile).href}?generation=0`)).default
  writeFileSync(entryFile, 'export default { value: 2 }\n')
  let usedImport = false
  const entry = {
    options: { name: entryFile },
    fiber: { uid: 1, runtime: { callback: previousPlugin } },
    loader: { unwrapExports(value: any) { return value.default } },
    parent: { tree: {
      ctx: { baseUrl: import.meta.url },
      async import(specifier: string) {
        usedImport = true
        return import(`${pathToFileURL(specifier.replace(/\?dsh-harmony=\d+$/, '')).href}?generation=1`)
      },
    } },
    getOuterStack() { return [] },
    async _dispose() { this.fiber = undefined },
    async _start(plugin: unknown) { this.fiber = { uid: 2, runtime: { callback: plugin } } },
  } as any

  await reloadEntries([entry], 1)
  expect(usedImport).toBe(true)
  expect(entry.fiber.runtime.callback.value).toBe(2)
})

test('keeps the import branch of a conditional export during reload', async () => {
  const profile = join(root, 'conditional-export-profile')
  const target = join(profile, 'node_modules', 'conditional-export-target')
  mkdirSync(target, { recursive: true })
  writeFileSync(join(profile, 'package.json'), '{}')
  writeFileSync(join(target, 'package.json'), JSON.stringify({
    name: 'conditional-export-target',
    type: 'module',
    exports: { import: './index.js', require: './index.cjs' },
  }))
  writeFileSync(join(target, 'index.js'), "export default { kind: 'esm' }\n")
  writeFileSync(join(target, 'index.cjs'), "module.exports = { kind: 'cjs' }\n")
  const esmFile = pathToFileURL(join(target, 'index.js')).href
  const previousPlugin = (await import(`${esmFile}?generation=0`)).default
  const entry = {
    options: { name: 'conditional-export-target' },
    fiber: { uid: 1, runtime: { callback: previousPlugin } },
    loader: { unwrapExports(value: any) { return value.default ?? value } },
    parent: { tree: {
      ctx: { baseUrl: pathToFileURL(join(profile, 'package.json')).href },
      async import() { return import(`${esmFile}?generation=1`) },
    } },
    getOuterStack() { return [] },
    async _dispose() { this.fiber = undefined },
    async _start(plugin: unknown) { this.fiber = { uid: 2, runtime: { callback: plugin } } },
  } as any

  await reloadEntries([entry], 1)
  expect(entry.fiber.runtime.callback.kind).toBe('esm')
})

test('reloads a transitive CommonJS package from its selected profile directory', async () => {
  const profile = join(root, 'transitive-commonjs-profile')
  const target = join(root, 'transitive-commonjs-target')
  const fallback = join(root, 'node_modules', 'transitive-commonjs-target')
  mkdirSync(profile)
  mkdirSync(target)
  mkdirSync(fallback, { recursive: true })
  writeFileSync(join(profile, 'package.json'), '{}')
  writeFileSync(join(target, 'package.json'), JSON.stringify({
    name: 'transitive-commonjs-target', version: '1.0.0', main: './index.cjs',
  }))
  writeFileSync(join(target, 'index.cjs'), 'module.exports = { value: 1 }\n')
  writeFileSync(join(fallback, 'package.json'), JSON.stringify({
    name: 'transitive-commonjs-target', version: '0.0.1', main: './index.cjs',
  }))
  writeFileSync(join(fallback, 'index.cjs'), 'module.exports = { value: 99 }\n')
  synchronizeProfile(profile, undefined, undefined, [join(target, 'package.json')])
  const require = createRequire(import.meta.url)
  const previousPlugin = require(join(target, 'index.cjs'))
  writeFileSync(join(target, 'index.cjs'), 'module.exports = { value: 2 }\n')
  let usedImport = false
  const entry = {
    options: { name: 'transitive-commonjs-target' },
    fiber: { uid: 1, runtime: { callback: previousPlugin } },
    loader: { unwrapExports(value: any) { return value.default ?? value } },
    parent: { tree: {
      ctx: { baseUrl: import.meta.url },
      async import() { usedImport = true; return {} },
    } },
    getOuterStack() { return [] },
    async _dispose() { this.fiber = undefined },
    async _start(plugin: unknown) { this.fiber = { uid: 2, runtime: { callback: plugin } } },
  } as any

  await reloadEntries([entry], 1)
  expect(usedImport).toBe(false)
  expect(entry.fiber.runtime.callback.value).toBe(2)
})

test('reloads a CommonJS subpath from its selected profile directory', async () => {
  const profile = join(root, 'commonjs-subpath-profile')
  const target = join(root, 'commonjs-subpath-selected')
  const fallback = join(root, 'node_modules', 'commonjs-subpath-target')
  mkdirSync(profile)
  mkdirSync(target)
  mkdirSync(fallback, { recursive: true })
  writeFileSync(join(profile, 'package.json'), '{}')
  writeFileSync(join(target, 'package.json'), JSON.stringify({
    name: 'commonjs-subpath-target', version: '1.0.0', main: './root.cjs',
  }))
  writeFileSync(join(target, 'root.cjs'), 'module.exports = { value: 99 }\n')
  writeFileSync(join(target, 'plugin.cjs'), 'module.exports = { value: 1 }\n')
  writeFileSync(join(fallback, 'package.json'), JSON.stringify({
    name: 'commonjs-subpath-target', version: '0.0.1', main: './root.cjs',
  }))
  writeFileSync(join(fallback, 'root.cjs'), 'module.exports = { value: -1 }\n')
  writeFileSync(join(fallback, 'plugin.cjs'), 'module.exports = { value: -2 }\n')
  synchronizeProfile(profile, undefined, undefined, [join(target, 'package.json')])
  const require = createRequire(import.meta.url)
  const previousPlugin = require(join(target, 'plugin.cjs'))
  writeFileSync(join(target, 'plugin.cjs'), 'module.exports = { value: 2 }\n')
  let usedImport = false
  const entry = {
    options: { name: 'commonjs-subpath-target/plugin.cjs' },
    fiber: { uid: 1, runtime: { callback: previousPlugin } },
    loader: { unwrapExports(value: unknown) { return value } },
    parent: { tree: {
      ctx: { baseUrl: import.meta.url },
      async import() { usedImport = true; return {} },
    } },
    getOuterStack() { return [] },
    async _dispose() { this.fiber = undefined },
    async _start(plugin: unknown) { this.fiber = { uid: 2, runtime: { callback: plugin } } },
  } as any

  await reloadEntries([entry], 1)
  expect(usedImport).toBe(false)
  expect(entry.fiber.runtime.callback.value).toBe(2)
})

test('commits WebUI order updates only after loader reload succeeds', async () => {
  const profile = join(root, 'web-transaction-profile')
  const provider = join(profile, 'node_modules', 'web-transaction-provider')
  const target = join(profile, 'node_modules', 'web-transaction-target')
  const clientTarget = join(profile, 'node_modules', 'web-transaction-client')
  const secondClientTarget = join(profile, 'node_modules', 'web-transaction-client-b')
  mkdirSync(provider, { recursive: true })
  mkdirSync(join(target, 'lib'), { recursive: true })
  mkdirSync(join(clientTarget, 'lib'), { recursive: true })
  mkdirSync(join(secondClientTarget, 'lib'), { recursive: true })
  writeFileSync(join(profile, 'package.json'), JSON.stringify({
    dependencies: {
      'web-transaction-provider': '1',
      'web-transaction-target': '1',
      'web-transaction-client': '1',
      'web-transaction-client-b': '1',
    },
  }))
  writeFileSync(join(provider, 'package.json'), JSON.stringify({
    name: 'web-transaction-provider',
    version: '1.0.0',
    author: 'Patch Author',
    dsh: { harmony: { patches: ['./patch.cjs'] } },
  }))
  writeFileSync(join(provider, 'patch.cjs'), `
module.exports = [{
  id: 'transactional',
  target: { package: 'web-transaction-target', file: 'lib/index.js' },
  select: 'NumericLiteral',
  expect: 1,
  apply({ node, edit }) { edit.overwrite(node.getStart(), node.getEnd(), '2') },
}, {
  id: 'client',
  target: { package: 'web-transaction-client', file: 'lib/client.js' },
  select: 'NumericLiteral', expect: 1, apply() {},
}, {
  id: 'client-b',
  target: { package: 'web-transaction-client-b', file: 'lib/client.js' },
  select: 'NumericLiteral', expect: 1, apply() {},
}]
`)
  writeFileSync(join(target, 'package.json'), JSON.stringify({ name: 'web-transaction-target', version: '1.0.0' }))
  writeFileSync(join(target, 'lib/index.js'), 'export const value = 1\n')
  writeFileSync(join(clientTarget, 'package.json'), JSON.stringify({ name: 'web-transaction-client', version: '1.0.0' }))
  writeFileSync(join(clientTarget, 'lib/client.js'), 'export const value = 1\n')
  writeFileSync(join(secondClientTarget, 'package.json'), JSON.stringify({ name: 'web-transaction-client-b', version: '1.0.0' }))
  writeFileSync(join(secondClientTarget, 'lib/client.js'), 'export const value = 1\n')
  synchronizeProfile(profile, [
    'dsh-harmony',
    'web-transaction-provider',
    'web-transaction-target',
    'web-transaction-client',
    'web-transaction-client-b',
  ])
  writeFileSync(join(profile, 'harmony.json'), JSON.stringify({
    order: currentProfile().order,
    patchOrder: currentProfile().patchOrder,
    disabled: currentProfile().disabled,
  }))

  const previousPlugin = () => {}
  const nextPlugin = () => {}
  let failNext = false
  let failClient: string | undefined
  const clientRebuilds: Array<{ name: string; order: string[] }> = []
  let startGate: Promise<void> | undefined
  const entry = {
    options: { name: 'web-transaction-target' },
    fiber: { uid: 1, runtime: { callback: previousPlugin } },
    loader: { unwrapExports(value: unknown) { return value } },
    parent: { tree: { async import() { return nextPlugin } } },
    getOuterStack() { return [] },
    async _dispose() { this.fiber = undefined },
    async _start(plugin: unknown) {
      const gate = startGate
      startGate = undefined
      if (gate !== undefined) await gate
      if (failNext) {
        failNext = false
        throw new Error('transaction reload failed')
      }
      this.fiber = { uid: 2, runtime: { callback: plugin } }
    },
  } as any
  const entries = [
    entry,
    { options: { name: 'web-transaction-provider' } },
    { options: { name: 'dsh-harmony' } },
  ]
  const routes = new Map<string, any>()
  const disposers: Array<() => void | Promise<void>> = []
  let harmony!: HarmonyService
  await applyHarmonyPlugin({
    provide(name: string, service: HarmonyService) {
      if (name === 'harmony') harmony = service
    },
    logger: { error() {} },
    on() {},
    effect(start: () => any) {
      const dispose = start()
      if (typeof dispose === 'function') disposers.push(dispose)
    },
    inject(services: string[], start: (ctx: any) => any) {
      const injected = services.includes('webServer')
        ? { webServer: { register(route: any) { routes.set(route.path, route.handler); return () => {} } } }
        : { clientModules: {
            rebuilt(name: string) {
              if (failClient === name) throw new Error('client rebuild failed')
              clientRebuilds.push({ name, order: [...currentProfile().order] })
            },
          } }
      const dispose = start(injected)
      if (typeof dispose === 'function') disposers.push(dispose)
    },
    loader: { *entries() { yield* entries } },
  })
  await new Promise<void>(resolve => setImmediate(resolve))

  const stateBefore = readFileSync(join(profile, 'harmony.json'), 'utf8')
  const jsonRequest = (body: unknown) => Object.assign(
    Readable.from([Buffer.from(JSON.stringify(body))]),
    { method: 'POST' },
  )
  const request = (order: string[]) => jsonRequest({ order })
  const response = () => ({
    status: 0,
    body: '',
    writeHead(status: number) { this.status = status },
    end(body = '') { this.body = body },
  })
  const runtimeStatus = async () => {
    const result = response()
    await routes.get('/dsh-harmony/runtime')({ method: 'GET' }, result)
    return JSON.parse(result.body).reload
  }
  const desired = [
    'dsh-harmony',
    'web-transaction-target',
    'web-transaction-provider',
    'web-transaction-client',
    'web-transaction-client-b',
  ]
  expect(harmony.profile()).toMatchObject({
    revision: 0,
    dir: profile,
    order: [
      'dsh-harmony',
      'web-transaction-provider',
      'web-transaction-target',
      'web-transaction-client',
      'web-transaction-client-b',
    ],
    plugins: expect.arrayContaining([
      expect.objectContaining({ name: 'web-transaction-provider', patchCount: 3, patches: ['./patch.cjs'] }),
    ]),
  })
  await expect(harmony.updateProfile({ order: desired.filter(name => name !== 'web-transaction-provider') }))
    .rejects.toThrow('omits installed package "web-transaction-provider"')
  expect(readFileSync(join(profile, 'harmony.json'), 'utf8')).toBe(stateBefore)

  const stale = response()
  await routes.get('/dsh-harmony/profile')(jsonRequest({ expectedRevision: 1, order: desired }), stale)
  expect(stale.status).toBe(409)
  expect(JSON.parse(stale.body).error).toContain('expected revision 1, now 0')
  expect(readFileSync(join(profile, 'harmony.json'), 'utf8')).toBe(stateBefore)

  failNext = true
  const failed = response()
  await routes.get('/dsh-harmony/profile')(request(desired), failed)
  expect(failed.status).toBe(500)
  expect(await runtimeStatus()).toMatchObject({ state: 'failed', error: 'transaction reload failed' })
  expect(readFileSync(join(profile, 'harmony.json'), 'utf8')).toBe(stateBefore)
  expect(entry.fiber.runtime.callback).toBe(previousPlugin)

  const succeeded = response()
  await routes.get('/dsh-harmony/profile')(request(desired), succeeded)
  expect(succeeded.status).toBe(200)
  expect(await runtimeStatus()).toMatchObject({ state: 'succeeded' })
  expect(JSON.parse(succeeded.body).order).toEqual(desired)
  expect(JSON.parse(succeeded.body).plugins.find((plugin: any) => plugin.name === 'web-transaction-provider')).toMatchObject({
    author: 'Patch Author', patchCount: 3,
  })
  expect(JSON.parse(readFileSync(join(profile, 'harmony.json'), 'utf8')).order).toEqual(desired)

  const serviceUpdate = await harmony.updateProfile({ disabled: ['web-transaction-provider/transactional'] })
  expect(serviceUpdate).toMatchObject({
    generation: expect.any(Number),
    reload: { state: 'succeeded' },
    profile: {
      order: desired,
      disabled: ['web-transaction-provider/transactional'],
    },
  })
  expect(JSON.parse(readFileSync(join(profile, 'harmony.json'), 'utf8')).disabled)
    .toEqual(['web-transaction-provider/transactional'])

  const toggle = async (body: { key?: string; owner?: string; enabled: boolean }) => {
    const result = response()
    await routes.get('/dsh-harmony/patches')(jsonRequest(body), result)
    expect(result.status).toBe(200)
    return JSON.parse(result.body) as { patches: Array<{ key: string; state: string }> }
  }
  await toggle({ owner: 'web-transaction-provider', enabled: false })
  expect(currentProfile().disabled).toEqual([
    'web-transaction-provider/transactional',
    'web-transaction-provider/*',
  ])

  const enabledBelowProvider = await toggle({ key: 'web-transaction-provider/transactional', enabled: true })
  expect(currentProfile().disabled).toEqual(['web-transaction-provider/*'])
  expect(enabledBelowProvider.patches.find(patch => patch.key === 'web-transaction-provider/transactional')?.state)
    .toBe('disabled')

  await toggle({ key: 'web-transaction-provider/transactional', enabled: false })
  await toggle({ owner: 'web-transaction-provider', enabled: true })
  expect(currentProfile().disabled).toEqual(['web-transaction-provider/transactional'])
  expect(getPatchStatuses().find(patch => patch.key === 'web-transaction-provider/transactional')?.state)
    .toBe('disabled')
  expect(getPatchStatuses().find(patch => patch.key === 'web-transaction-provider/client')?.state)
    .toBe('bound')

  const reversedPatchOrder = [...currentProfile().patchOrder].reverse()
  const patchOrderUpdate = await harmony.updateProfile({ patchOrder: reversedPatchOrder })
  expect(patchOrderUpdate.profile.patchOrder).toEqual(reversedPatchOrder)
  expect(JSON.parse(readFileSync(join(profile, 'harmony.json'), 'utf8')).patchOrder).toEqual(reversedPatchOrder)

  const committedState = readFileSync(join(profile, 'harmony.json'), 'utf8')
  clientRebuilds.length = 0
  failClient = 'web-transaction-client-b'
  const clientFailed = response()
  await routes.get('/dsh-harmony/profile')(request(JSON.parse(stateBefore).order), clientFailed)
  failClient = undefined
  expect(clientFailed.status).toBe(500)
  expect(readFileSync(join(profile, 'harmony.json'), 'utf8')).toBe(committedState)
  expect(clientRebuilds.filter(item => item.name === 'web-transaction-client').map(item => item.order)).toEqual([
    JSON.parse(stateBefore).order,
    desired,
  ])

  let releaseStart!: () => void
  startGate = new Promise<void>(resolve => { releaseStart = resolve })
  failNext = true
  const first = response()
  const second = response()
  const firstUpdate = routes.get('/dsh-harmony/profile')(request(JSON.parse(stateBefore).order), first)
  await new Promise<void>(resolve => setImmediate(resolve))
  expect(await runtimeStatus()).toMatchObject({ state: 'reloading' })
  const secondUpdate = routes.get('/dsh-harmony/profile')(request(desired), second)
  releaseStart()
  await Promise.all([firstUpdate, secondUpdate])
  expect(first.status).toBe(500)
  expect(second.status).toBe(200)
  expect(JSON.parse(readFileSync(join(profile, 'harmony.json'), 'utf8')).order).toEqual(desired)
  for (const dispose of disposers) await dispose()
})

test('controls a running profile without a Web server', async () => {
  const profile = join(root, 'non-web-control-profile')
  const provider = join(profile, 'node_modules', 'non-web-provider')
  const target = join(profile, 'node_modules', 'non-web-target')
  mkdirSync(provider, { recursive: true })
  mkdirSync(join(target, 'lib'), { recursive: true })
  writeFileSync(join(profile, 'package.json'), JSON.stringify({
    dependencies: { 'non-web-provider': '1', 'non-web-target': '1' },
  }))
  writeFileSync(join(provider, 'package.json'), JSON.stringify({
    name: 'non-web-provider',
    version: '1.0.0',
    dsh: { harmony: { patches: ['./patch.cjs'] } },
  }))
  writeFileSync(join(provider, 'patch.cjs'), `
module.exports = {
  id: 'non-web',
  target: { package: 'non-web-target', file: 'lib/index.js' },
  select: 'NumericLiteral', expect: 1,
  apply() { globalThis.__nonWebStartupApplications = (globalThis.__nonWebStartupApplications ?? 0) + 1 },
}
`)
  writeFileSync(join(target, 'package.json'), JSON.stringify({ name: 'non-web-target', version: '1.0.0' }))
  writeFileSync(join(target, 'lib/index.js'), 'export const value = 1\n')
  synchronizeProfile(profile)
  ;(globalThis as any).__nonWebStartupApplications = 0
  inspectPatchTargets()
  expect((globalThis as any).__nonWebStartupApplications).toBe(1)

  const disposers: Array<() => void | Promise<void>> = []
  const performanceRecords: unknown[] = []
  const performanceChannel = channel('dsh-harmony:load')
  const capturePerformance = (message: unknown): void => { performanceRecords.push(message) }
  performanceChannel.subscribe(capturePerformance)
  try {
    await applyHarmonyPlugin({
      provide() {},
      logger: { error() {}, warn() {} },
      on() {},
      effect(start: () => unknown) {
        const dispose = start()
        if (typeof dispose === 'function') disposers.push(dispose as () => void | Promise<void>)
      },
      inject() {},
      loader: {
        *entries() {
          yield { options: { name: 'non-web-provider' } }
          yield { options: { name: 'non-web-target' } }
        },
      },
    } as any)
    await new Promise<void>(resolve => setImmediate(resolve))
  } finally {
    performanceChannel.unsubscribe(capturePerformance)
  }
  expect(performanceRecords).toContainEqual(expect.objectContaining({
    operation: 'startup',
    status: 'succeeded',
    generation: expect.any(Number),
    targetPackages: expect.any(Number),
    targetFiles: expect.any(Number),
    prepareMs: expect.any(Number),
    transformMs: expect.any(Number),
    hostReloadMs: expect.any(Number),
    clientRebuildMs: expect.any(Number),
    totalMs: expect.any(Number),
  }))
  expect((globalThis as any).__nonWebStartupApplications).toBe(1)

  const addressDirectory = join(profile, '.dsh-harmony-runtimes')
  const addressFile = join(addressDirectory, readdirSync(addressDirectory)[0]!)
  const address = JSON.parse(readFileSync(addressFile, 'utf8')) as { url: string }
  if (process.platform !== 'win32') expect(statSync(addressFile).mode & 0o777).toBe(0o600)
  expect((await fetch(`${address.url}/dsh-harmony/status`)).status).toBe(401)

  const status = await readHarmonyRuntime(profile)
  expect(status).toMatchObject({
    profile: { dir: profile },
    patches: [expect.objectContaining({ key: 'non-web-provider/non-web', state: 'bound' })],
  })
  const update = await updateHarmonyProfile(profile, { disabled: ['non-web-provider/non-web'] })
  expect(update).toMatchObject({
    mode: 'live',
    profile: { disabled: ['non-web-provider/non-web'] },
    reload: { state: 'succeeded' },
  })
  expect(JSON.parse(readFileSync(join(profile, 'harmony.json'), 'utf8')).disabled)
    .toEqual(['non-web-provider/non-web'])
  expect(await reloadHarmonyRuntime(profile, 'non-web-target')).toMatchObject({
    profile: { dir: profile },
    reload: { state: 'succeeded' },
  })
  await expect(reloadHarmonyRuntime(profile, 'missing-plugin')).rejects.toThrow('unknown plugin')

  for (const dispose of disposers.reverse()) await dispose()
  delete (globalThis as any).__nonWebStartupApplications
  expect(await reloadHarmonyRuntime(profile)).toBeUndefined()
})

test('applies the bundled Settings integration through the ordinary Patch pipeline', () => {
  const target = join(root, 'bundled-settings-target')
  const filename = join(target, 'lib/client.js')
  mkdirSync(join(target, 'lib'), { recursive: true })
  writeFileSync(join(target, 'package.json'), JSON.stringify({
    name: '@deepseek-ai/dsh-client-ui-settings-general',
    version: '0.1.0-rc.8',
  }))
  writeFileSync(filename, `
const SettingsRoot_module_css_default = { panel: 'panel', navIcon: 'icon', navCell: 'nav-cell', trigger: 'trigger' };
function clsx(...values) { return values.filter(Boolean).join(' '); }
function setActiveId(id) {}
function closeModal() {}
function SettingsPanel() {
  const close = () => { closeModal(); };
  function navIcon(id) { return id; }
  const row = { id: 'general' };
  const nav = { className: clsx(SettingsRoot_module_css_default.navCell) };
  return { className: SettingsRoot_module_css_default.panel, nav, onSelect: setActiveId };
}
function SettingsRoot() {
  return { className: clsx(SettingsRoot_module_css_default.trigger) };
}
`)

  discoverPackage(process.cwd())
  const transformed = readFileSync(filename, 'utf8')

  expect(transformed).toContain('dshHarmonySettingsPanel')
  expect(transformed).toContain('dshHarmonyNavIcon')
  expect(transformed.match(/__dshHarmonyBeforeSettingsClose/g)).toHaveLength(2)
  expect(getPatchStatuses()).toContainEqual(expect.objectContaining({
    key: 'dsh-harmony/settings-integration',
    state: 'bound',
    matches: 1,
  }))
})

test('applies the bundled session profile guard at the history loading boundary', () => {
  const target = join(root, 'bundled-session-runtime-target')
  const filename = join(target, 'lib/client.js')
  mkdirSync(join(target, 'lib'), { recursive: true })
  writeFileSync(join(target, 'package.json'), JSON.stringify({
    name: '@deepseek-ai/dsh-client-runtime',
    version: '0.1.0-rc.8',
  }))
  writeFileSync(filename, `
class Session {
  open() {
    if (this.openState === "open") return Promise.resolve();
    if (this.openPromise !== null) return this.openPromise;
    const promise = this.doOpen(this.openGeneration).finally(() => {
      if (this.openPromise === promise) this.openPromise = null;
    });
    this.openPromise = promise;
    return promise;
  }
}
`)

  discoverPackage(process.cwd())
  const transformed = readFileSync(filename, 'utf8')

  expect(transformed).toContain('__dshHarmonyBeforeSessionOpen?.(this.sessionId)')
  expect(getPatchStatuses()).toContainEqual(expect.objectContaining({
    key: 'dsh-harmony/session-profile-guard',
    state: 'bound',
    matches: 1,
  }))
})
