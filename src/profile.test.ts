import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import {
  preflightHarmonyProfileUpdate,
  readHarmonyProfile,
  updateHarmonyProfile,
} from './index.js'
import { groupHarmonyPatchOrder, synchronizeHarmonyProfile } from './profile.js'

test('groups Patch order in one pass while preserving scoped and overlapping owners', () => {
  expect(groupHarmonyPatchOrder(
    ['@scope/pkg/extra', 'plain', '@scope/pkg'],
    [
      '@scope/pkg/first',
      'plain/first',
      '@scope/pkg/extra/only',
      '@scope/pkg/nested/id',
      'unknown/ignored',
      'plain/second',
    ],
  )).toEqual([
    '@scope/pkg/extra/only',
    'plain/first',
    'plain/second',
    '@scope/pkg/first',
    '@scope/pkg/nested/id',
  ])
})

test('profile discovery reconciles installed providers without writing', () => {
  const profile = mkdtempSync(join(tmpdir(), 'dsh-harmony-profile-'))
  mkdirSync(join(profile, 'node_modules', 'first'), { recursive: true })
  mkdirSync(join(profile, 'node_modules', 'second'), { recursive: true })
  mkdirSync(join(profile, 'node_modules', 'ordinary'), { recursive: true })
  for (const name of ['first', 'second']) {
    writeFileSync(join(profile, 'node_modules', name, 'package.json'), JSON.stringify({
      name,
      version: '1.0.0',
      dsh: {
        plugin: { compatibility: { conflicts: name === 'first' ? { second: '*', ordinary: '^1', first: '*' } : {} } },
        harmony: { patches: ['./patch.cjs'] },
      },
    }))
  }
  writeFileSync(join(profile, 'node_modules', 'ordinary', 'package.json'), JSON.stringify({
    name: 'ordinary',
    version: '1.2.3',
    description: 'No patches here.',
    author: { name: 'Example Author' },
    contributors: ['One', { name: 'Two' }],
    homepage: 'https://example.com',
    bugs: { url: 'https://example.com/issues' },
    license: 'MIT',
  }))
  writeFileSync(join(profile, 'package.json'), JSON.stringify({ dependencies: { first: '1', second: '1', ordinary: '1' } }))
  writeFileSync(join(profile, 'harmony.json'), JSON.stringify({ order: ['second'], patchOrder: [], disabled: [] }))

  const synchronized = synchronizeHarmonyProfile(profile)
  expect(synchronized.order).toEqual(['second', 'first', 'ordinary'])
  expect(synchronized.plugins.find(plugin => plugin.name === 'first')?.compatibility).toEqual({
    requires: {}, conflicts: { second: '*', ordinary: '^1', first: '*' }, integrates: {},
  })
  const expectedConflicts = [{
    kind: 'conflict',
    left: { package: 'first', version: '1.0.0', entryIds: [] },
    right: { package: 'ordinary', version: '1.2.3', entryIds: [] },
    declaredBy: ['first'],
  }, {
    kind: 'conflict',
    left: { package: 'first', version: '1.0.0', entryIds: [] },
    right: { package: 'second', version: '1.0.0', entryIds: [] },
    declaredBy: ['first'],
  }]
  expect(synchronized.compatibility).toEqual(expectedConflicts)
  expect(synchronized.plugins.find(plugin => plugin.name === 'ordinary')).toMatchObject({
    patches: [],
    version: '1.2.3',
    description: 'No patches here.',
    author: 'Example Author',
    contributors: ['One', 'Two'],
    homepage: 'https://example.com',
    bugs: 'https://example.com/issues',
    license: 'MIT',
  })

  writeFileSync(join(profile, 'harmony.json'), JSON.stringify({ order: synchronized.order, patchOrder: [], disabled: ['first/*'] }))
  expect(synchronizeHarmonyProfile(profile).compatibility).toEqual(expectedConflicts)
  writeFileSync(join(profile, 'harmony.json'), JSON.stringify({ order: synchronized.order, patchOrder: [], disabled: ['second/*'] }))
  expect(synchronizeHarmonyProfile(profile).compatibility).toEqual(expectedConflicts)
  writeFileSync(join(profile, 'harmony.json'), JSON.stringify({ order: synchronized.order, patchOrder: [], disabled: ['first/test'] }))
  expect(synchronizeHarmonyProfile(profile).compatibility).toEqual(expectedConflicts)
  writeFileSync(join(profile, 'harmony.json'), JSON.stringify({ order: synchronized.order, patchOrder: [], disabled: [] }))

  writeFileSync(join(profile, 'package.json'), JSON.stringify({ dependencies: { first: '1' } }))
  rmSync(join(profile, 'node_modules', 'second'), { recursive: true })
  rmSync(join(profile, 'node_modules', 'ordinary'), { recursive: true })
  expect(synchronizeHarmonyProfile(profile).order).toEqual(['first'])
  expect(JSON.parse(readFileSync(join(profile, 'harmony.json'), 'utf8'))).toEqual({
    order: ['second', 'first', 'ordinary'], patchOrder: [], disabled: [],
  })
  rmSync(profile, { recursive: true })
})

test('detects compatibility between ordinary active plugins', () => {
  const profile = mkdtempSync(join(tmpdir(), 'dsh-harmony-ordinary-conflicts-'))
  for (const name of ['ordinary-alpha', 'ordinary-beta']) {
    mkdirSync(join(profile, 'node_modules', name), { recursive: true })
  }
  writeFileSync(join(profile, 'package.json'), JSON.stringify({
    dependencies: { 'ordinary-alpha': '1', 'ordinary-beta': '1' },
  }))
  writeFileSync(join(profile, 'node_modules', 'ordinary-alpha', 'package.json'), JSON.stringify({
    name: 'ordinary-alpha',
    version: '1.0.0',
    dsh: { plugin: { compatibility: { conflicts: { 'ordinary-beta': '^2' } } } },
  }))
  writeFileSync(join(profile, 'node_modules', 'ordinary-beta', 'package.json'), JSON.stringify({
    name: 'ordinary-beta', version: '2.1.0',
  }))

  const active = [
    { name: 'ordinary-alpha', entryIds: ['alpha-entry'] },
    { name: 'ordinary-beta', entryIds: ['beta-entry'] },
  ]
  expect(synchronizeHarmonyProfile(profile, undefined, active).compatibility).toEqual([{
    kind: 'conflict',
    left: { package: 'ordinary-alpha', version: '1.0.0', entryIds: ['alpha-entry'] },
    right: { package: 'ordinary-beta', version: '2.1.0', entryIds: ['beta-entry'] },
    declaredBy: ['ordinary-alpha'],
  }])
  expect(synchronizeHarmonyProfile(profile, undefined, active.slice(0, 1)).compatibility).toEqual([])
  rmSync(profile, { recursive: true })
})

test('pins dsh-harmony above every installed plugin', () => {
  const profile = mkdtempSync(join(tmpdir(), 'dsh-harmony-profile-'))
  mkdirSync(join(profile, 'node_modules', 'ordinary'), { recursive: true })
  writeFileSync(join(profile, 'package.json'), '{}')
  writeFileSync(join(profile, 'node_modules', 'ordinary', 'package.json'), JSON.stringify({ name: 'ordinary' }))
  writeFileSync(join(profile, 'harmony.json'), JSON.stringify({
    order: ['ordinary', 'dsh-harmony'], patchOrder: [], disabled: [],
  }))

  expect(synchronizeHarmonyProfile(profile, ['ordinary', 'dsh-harmony']).order).toEqual(['dsh-harmony', 'ordinary'])
  expect(JSON.parse(readFileSync(join(profile, 'harmony.json'), 'utf8'))).toEqual({
    order: ['ordinary', 'dsh-harmony'],
    patchOrder: [],
    disabled: [],
  })
  rmSync(profile, { recursive: true })
})

test('declares the built-in Settings Patch when its target plugin is present', () => {
  const profile = mkdtempSync(join(tmpdir(), 'dsh-harmony-web-profile-'))
  const settings = '@deepseek-ai/dsh-client-ui-settings-general'
  const settingsDir = join(profile, 'node_modules', ...settings.split('/'))
  const bundle = join(profile, 'node_modules', 'custom-web-bundle')
  mkdirSync(settingsDir, { recursive: true })
  mkdirSync(bundle, { recursive: true })
  writeFileSync(join(settingsDir, 'package.json'), JSON.stringify({ name: settings }))
  writeFileSync(join(bundle, 'package.json'), JSON.stringify({
    name: 'custom-web-bundle', dependencies: { [settings]: '1' },
  }))
  const writeProfile = (dependencies: Record<string, string>, bundles: string[] = []): void => writeFileSync(join(profile, 'package.json'), JSON.stringify({
    dependencies,
    dsh: { profile: { bundles } },
  }))

  writeProfile({ 'dsh-harmony': '1' }, ['custom-web-bundle'])
  expect(synchronizeHarmonyProfile(profile).plugins[0].patches)
    .toEqual([
      './lib/builtins/client-load-plan.patch.cjs',
      './lib/builtins/cordis-service-index.patch.cjs',
      './lib/builtins/settings.patch.cjs',
      './lib/builtins/session-profile.patch.cjs',
    ])

  rmSync(settingsDir, { recursive: true })
  writeFileSync(join(bundle, 'package.json'), JSON.stringify({ name: 'custom-web-bundle' }))
  expect(synchronizeHarmonyProfile(profile, ['dsh-harmony']).plugins[0].patches).toEqual([
    './lib/builtins/client-load-plan.patch.cjs',
    './lib/builtins/cordis-service-index.patch.cjs',
  ])
  rmSync(profile, { recursive: true })
})

test('reads persisted Harmony state from before Patch ordering was introduced', () => {
  const profile = mkdtempSync(join(tmpdir(), 'dsh-harmony-profile-'))
  writeFileSync(join(profile, 'package.json'), '{}')
  writeFileSync(join(profile, 'harmony.json'), JSON.stringify({ order: [], disabled: [] }))

  expect(synchronizeHarmonyProfile(profile).patchOrder).toEqual([])
  rmSync(profile, { recursive: true })
})

test('rejects persisted Harmony state without a disabled list', () => {
  const profile = mkdtempSync(join(tmpdir(), 'dsh-harmony-profile-'))
  writeFileSync(join(profile, 'package.json'), '{}')
  writeFileSync(join(profile, 'harmony.json'), JSON.stringify({ order: [], patchOrder: [] }))

  expect(() => synchronizeHarmonyProfile(profile)).toThrow('disabled must be an array')
  rmSync(profile, { recursive: true })
})

test('reads, preflights, and atomically updates a stopped profile', async () => {
  const profile = mkdtempSync(join(tmpdir(), 'dsh-harmony-profile-api-'))
  for (const name of ['first', 'second']) {
    mkdirSync(join(profile, 'node_modules', name), { recursive: true })
    writeFileSync(join(profile, 'node_modules', name, 'package.json'), JSON.stringify({
      name,
      version: '1.0.0',
      dsh: { harmony: { patches: [`./${name}.patch.cjs`], after: name === 'first' ? ['second'] : [] } },
    }))
  }
  writeFileSync(join(profile, 'package.json'), JSON.stringify({ dependencies: { first: '1', second: '1' } }))
  writeFileSync(join(profile, 'harmony.json'), JSON.stringify({
    order: ['first'],
    patchOrder: ['first/b', 'second/only', 'first/a'],
    disabled: [],
  }))

  const before = readFileSync(join(profile, 'harmony.json'), 'utf8')
  const view = readHarmonyProfile(profile)
  expect(view).toMatchObject({
    dir: profile,
    order: ['first', 'second'],
    disabled: [],
    orderViolations: [{ before: 'second', after: 'first', declaredBy: 'first' }],
  })
  expect(view.plugins.find(plugin => plugin.name === 'first')).toMatchObject({
    harmony: true,
    patches: ['./first.patch.cjs'],
  })
  expect(readFileSync(join(profile, 'harmony.json'), 'utf8')).toBe(before)

  expect(preflightHarmonyProfileUpdate(profile, {
    order: ['second', 'first'],
    disabled: ['first/*', 'first/*'],
  })).toMatchObject({
    order: ['second', 'first'],
    patchOrder: ['second/only', 'first/b', 'first/a'],
    disabled: ['first/*'],
    orderViolations: [],
    compatibility: [],
  })
  expect(readFileSync(join(profile, 'harmony.json'), 'utf8')).toBe(before)

  expect(() => preflightHarmonyProfileUpdate(profile, { order: ['first', 'first'] }))
    .toThrow('duplicate package "first"')
  expect(() => preflightHarmonyProfileUpdate(profile, { order: ['first'] }))
    .toThrow('omits installed package "second"')
  expect(() => preflightHarmonyProfileUpdate(profile, { order: ['first', 'unknown'] }))
    .toThrow('unknown package "unknown"')
  expect(() => preflightHarmonyProfileUpdate(profile, { disabled: [1] as unknown as string[] }))
    .toThrow('disabled must be an array of non-empty strings')

  const updated = await updateHarmonyProfile(profile, { order: ['second', 'first'], disabled: ['first/*'] })
  expect(updated).toMatchObject({
    mode: 'offline',
    profile: {
      order: ['second', 'first'],
      patchOrder: ['second/only', 'first/b', 'first/a'],
      disabled: ['first/*'],
    },
  })
  expect(JSON.parse(readFileSync(join(profile, 'harmony.json'), 'utf8'))).toEqual({
    order: ['second', 'first'],
    workerThreads: 1,
    patchOrder: ['second/only', 'first/b', 'first/a'],
    disabled: ['first/*'],
  })
  rmSync(profile, { recursive: true })
})

test('preserves Providers discovered from the composed DSH configuration', async () => {
  const profile = mkdtempSync(join(tmpdir(), 'dsh-harmony-configured-provider-'))
  const provider = join(profile, 'node_modules', 'configured-provider')
  mkdirSync(provider, { recursive: true })
  writeFileSync(join(profile, 'package.json'), '{}')
  writeFileSync(join(provider, 'package.json'), JSON.stringify({
    name: 'configured-provider',
    version: '1.0.0',
    dsh: { harmony: { patches: ['./patch.cjs'] } },
  }))
  writeFileSync(join(provider, 'patch.cjs'), 'module.exports = []\n')
  writeFileSync(join(profile, 'harmony.json'), JSON.stringify({
    order: ['configured-provider'], patchOrder: [], disabled: [],
  }))
  const configured = [join(provider, 'package.json')]

  expect(readHarmonyProfile(profile, configured).order).toEqual(['configured-provider'])
  await updateHarmonyProfile(profile, { disabled: ['configured-provider/*'] }, configured)
  expect(JSON.parse(readFileSync(join(profile, 'harmony.json'), 'utf8'))).toEqual({
    order: ['configured-provider'],
    workerThreads: 1,
    patchOrder: [],
    disabled: ['configured-provider/*'],
  })
  rmSync(profile, { recursive: true })
})

test('serializes concurrent whole-profile writes without producing mixed state', async () => {
  const profile = mkdtempSync(join(tmpdir(), 'dsh-harmony-concurrent-writers-'))
  for (const name of ['first', 'second']) {
    mkdirSync(join(profile, 'node_modules', name), { recursive: true })
    writeFileSync(join(profile, 'node_modules', name, 'package.json'), JSON.stringify({ name }))
  }
  writeFileSync(join(profile, 'package.json'), JSON.stringify({ dependencies: { first: '1', second: '1' } }))
  writeFileSync(join(profile, 'harmony.json'), JSON.stringify({
    order: ['first', 'second'], patchOrder: [], disabled: [],
  }))

  await Promise.all([
    updateHarmonyProfile(profile, { order: ['first', 'second'], disabled: ['first/*'] }),
    updateHarmonyProfile(profile, { order: ['second', 'first'], disabled: ['second/*'] }),
  ])
  const state = JSON.parse(readFileSync(join(profile, 'harmony.json'), 'utf8'))
  expect([
    { order: ['first', 'second'], workerThreads: 1, patchOrder: [], disabled: ['first/*'] },
    { order: ['second', 'first'], workerThreads: 1, patchOrder: [], disabled: ['second/*'] },
  ]).toContainEqual(state)
  rmSync(profile, { recursive: true })
})

test('defaults worker loading to one thread and validates persisted updates', async () => {
  const profile = mkdtempSync(join(tmpdir(), 'dsh-harmony-worker-profile-'))
  writeFileSync(join(profile, 'package.json'), '{}')

  expect(readHarmonyProfile(profile).workerThreads).toBe(1)
  expect(preflightHarmonyProfileUpdate(profile, { workerThreads: 4 }).workerThreads).toBe(4)
  expect(() => preflightHarmonyProfileUpdate(profile, { workerThreads: 0 })).toThrow('integer from 1 to 32')
  expect(() => preflightHarmonyProfileUpdate(profile, { workerThreads: 1.5 })).toThrow('integer from 1 to 32')

  const updated = await updateHarmonyProfile(profile, { workerThreads: 4 })
  expect(updated.profile.workerThreads).toBe(4)
  expect(JSON.parse(readFileSync(join(profile, 'harmony.json'), 'utf8')).workerThreads).toBe(4)
  rmSync(profile, { recursive: true })
})
