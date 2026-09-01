import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const harmony = fileURLToPath(new URL('../lib/bin.js', import.meta.url))
const packageRoot = fileURLToPath(new URL('..', import.meta.url))
assert.equal(require.resolve('dsh-harmony/bin'), harmony)

const root = mkdtempSync(join(tmpdir(), 'dsh harmony embedded-'))
const nodeModules = join(root, 'node_modules')
const embeddedHarmony = join(nodeModules, 'dsh-harmony')
const officialPackage = join(nodeModules, '@deepseek-ai/dsh')
const appBoot = join(nodeModules, '@deepseek-ai/dsh-app-boot')
const configuredModules = join(root, 'desktop-host/node_modules')
const configuredOfficialPackage = join(configuredModules, '@deepseek-ai/dsh')
const configuredAppBoot = join(configuredModules, '@deepseek-ai/dsh-app-boot')
const embeddedDshCompat = join(embeddedHarmony, 'lib/builtins/dsh-compat.cjs')
const home = join(root, 'home')
const profile = join(root, 'profile')
mkdirSync(embeddedHarmony, { recursive: true })
mkdirSync(join(officialPackage, 'lib'), { recursive: true })
mkdirSync(appBoot, { recursive: true })
cpSync(join(packageRoot, 'lib'), join(embeddedHarmony, 'lib'), { recursive: true })
writeFileSync(join(embeddedHarmony, 'package.json'), JSON.stringify({ name: 'dsh-harmony', type: 'module' }))
for (const dependency of [
  '@deepseek-ai/dsh-atomic-write',
  '@phenomnomnominal/tsquery',
  'magic-string',
  'semver',
  'typescript',
]) {
  const target = join(nodeModules, dependency)
  mkdirSync(dirname(target), { recursive: true })
  symlinkSync(join(packageRoot, 'node_modules', dependency), target, process.platform === 'win32' ? 'junction' : 'dir')
}
writeFileSync(join(officialPackage, 'package.json'), JSON.stringify({
  name: '@deepseek-ai/dsh',
  version: '0.1.1-rc.2',
  type: 'module',
  exports: { './lib/bin.js': './lib/bin.js' },
}))
writeFileSync(join(officialPackage, 'lib/bin.js'), `
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { activeDshVersion, sessionProfileTarget } = require(${JSON.stringify(embeddedDshCompat)})
const version = activeDshVersion()
process.stdout.write(JSON.stringify({
  entry: 'official', active: process.env.DSH_HARMONY_ACTIVE, version,
  sessionPackage: sessionProfileTarget(version).package,
}))
`)
writeFileSync(join(appBoot, 'package.json'), JSON.stringify({
  name: '@deepseek-ai/dsh-app-boot',
  type: 'module',
  exports: './index.js',
}))
writeFileSync(join(appBoot, 'index.js'), `
export const PROFILE_TEMPLATES = {}
export function initProfile() {}
export function resolveProfileDir() { return process.env.DSH_HARMONY_TEST_PROFILE }
`)
cpSync(officialPackage, configuredOfficialPackage, { recursive: true })
cpSync(appBoot, configuredAppBoot, { recursive: true })
const configuredEntry = join(configuredOfficialPackage, 'lib/bin.js')
writeFileSync(join(configuredOfficialPackage, 'package.json'), JSON.stringify({
  name: '@deepseek-ai/dsh',
  version: '0.1.2-alpha.4',
  type: 'module',
  exports: { './lib/bin.js': './lib/bin.js' },
}))
writeFileSync(configuredEntry, `
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { activeDshVersion, sessionProfileTarget } = require(${JSON.stringify(embeddedDshCompat)})
const version = activeDshVersion()
process.stdout.write(JSON.stringify({
  entry: 'configured', active: process.env.DSH_HARMONY_ACTIVE, version,
  sessionPackage: sessionProfileTarget(version).package,
}))
`)

try {
  const delegated = spawnSync(process.execPath, [
    join(embeddedHarmony, 'lib/bin.js'),
    '--version',
  ], {
    encoding: 'utf8',
    env: { ...process.env, DSH_HOME: home },
  })
  assert.equal(delegated.status, 0, delegated.stderr)
  assert.deepEqual(JSON.parse(delegated.stdout), {
    entry: 'official',
    active: '1',
    version: '0.1.1-rc.2',
    sessionPackage: '@deepseek-ai/dsh-client-runtime',
  })
  assert.equal(existsSync(home), false)

  const configured = spawnSync(process.execPath, [
    join(embeddedHarmony, 'lib/bin.js'),
    '--version',
  ], {
    encoding: 'utf8',
    env: { ...process.env, DSH_HOME: home, DSH_HARMONY_DSH_ENTRY: configuredEntry },
  })
  assert.equal(configured.status, 0, configured.stderr)
  assert.deepEqual(JSON.parse(configured.stdout), {
    entry: 'configured',
    active: '1',
    version: '0.1.2-alpha.4',
    sessionPackage: '@deepseek-ai/dsh-api-session-controller',
  })

  const profileModules = join(profile, 'node_modules')
  const provider = join(profileModules, 'large-provider')
  const target = join(profileModules, 'large-target')
  mkdirSync(join(target, 'lib'), { recursive: true })
  mkdirSync(provider, { recursive: true })
  writeFileSync(join(profile, 'package.json'), JSON.stringify({
    dependencies: { 'large-provider': '1.0.0', 'large-target': '1.0.0' },
  }))
  writeFileSync(join(target, 'package.json'), JSON.stringify({
    name: 'large-target', version: '1.0.0', type: 'module',
  }))
  writeFileSync(join(target, 'lib/client.js'), `${'// inspection padding\n'.repeat(5_000)}export const answer = 1\n`)
  writeFileSync(join(provider, 'package.json'), JSON.stringify({
    name: 'large-provider',
    dsh: { harmony: { patches: ['./patch.cjs'] } },
  }))
  writeFileSync(join(provider, 'patch.cjs'), `
module.exports = [{
  id: 'large-output',
  before: ['large-provider'],
  target: { package: 'large-target', version: '1.0.0', file: 'lib/client.js' },
  select: 'NumericLiteral[text="1"]',
  expect: 1,
  apply({ node, sourceFile, edit }) { edit.overwrite(node.getStart(sourceFile), node.getEnd(), '2') },
}, {
  id: 'stable-export',
  target: { package: 'large-target', version: '1.0.0', file: 'lib/client.js' },
  select: 'VariableDeclaration',
  expect: 1,
  apply() {},
}]
`)
  const cliEnv = {
    ...process.env,
    DSH_HOME: home,
    DSH_HARMONY_TEST_PROFILE: profile,
  }
  const inspection = spawnSync(process.execPath, [
    join(embeddedHarmony, 'lib/bin.js'),
    'harmony', 'inspect', 'large-target', '--file', 'lib/client.js', '--profile', 'web',
  ], {
    encoding: 'utf8',
    env: cliEnv,
    maxBuffer: 2 * 1024 * 1024,
  })
  assert.equal(inspection.status, 0, inspection.stderr)
  assert.ok(inspection.stdout.length > 64 * 1024)
  assert.match(inspection.stdout, /--- final ---/)
  assert.match(inspection.stdout, /export const answer = 2/)

  const inspectionSummary = spawnSync(process.execPath, [
    join(embeddedHarmony, 'lib/bin.js'),
    'harmony', 'inspect', 'large-target', '--patch', 'large-provider/large-output',
    '--summary', '--profile', 'web',
  ], { encoding: 'utf8', env: cliEnv })
  assert.equal(inspectionSummary.status, 0, inspectionSummary.stderr)
  assert.match(inspectionSummary.stdout, /large-provider\/large-output\(1\)/)
  assert.doesNotMatch(inspectionSummary.stdout, /--- original ---/)

  const inspectionSummaryJson = spawnSync(process.execPath, [
    join(embeddedHarmony, 'lib/bin.js'),
    'harmony', 'inspect', 'large-target', '--patch', 'large-provider/large-output',
    '--summary', '--json', '--profile', 'web',
  ], { encoding: 'utf8', env: cliEnv })
  assert.equal(inspectionSummaryJson.status, 0, inspectionSummaryJson.stderr)
  assert.equal(JSON.parse(inspectionSummaryJson.stdout).targets[0].original, undefined)
  assert.deepEqual(JSON.parse(inspectionSummaryJson.stdout).targets[0].steps[0], {
    key: 'large-provider/large-output', matches: 1,
  })

  const status = spawnSync(process.execPath, [
    join(embeddedHarmony, 'lib/bin.js'),
    'harmony', 'status', '--json', '--profile', 'web',
  ], { encoding: 'utf8', env: cliEnv })
  assert.equal(status.status, 0, status.stderr)
  const statusBody = JSON.parse(status.stdout)
  assert.equal(statusBody.mode, 'offline')
  assert.equal(statusBody.profile.dir, profile)
  assert.equal(statusBody.patches.length, 2)
  assert.equal(statusBody.targets, undefined)
  assert.equal(statusBody.patches[0].key, 'large-provider/large-output')
  assert.equal(statusBody.patches[0].matches, 1)

  const shownProviders = spawnSync(process.execPath, [
    join(embeddedHarmony, 'lib/bin.js'),
    'harmony', 'provider-order', 'show', '--json', '--profile', 'web',
  ], { encoding: 'utf8', env: cliEnv })
  assert.equal(shownProviders.status, 0, shownProviders.stderr)
  assert.deepEqual(JSON.parse(shownProviders.stdout).order, ['large-provider', 'large-target'])

  const movedProviders = spawnSync(process.execPath, [
    join(embeddedHarmony, 'lib/bin.js'),
    'harmony', 'provider-order', 'move', 'large-target',
    '--before', 'large-provider', '--json', '--profile', 'web',
  ], { encoding: 'utf8', env: cliEnv })
  assert.equal(movedProviders.status, 0, movedProviders.stderr)
  assert.deepEqual(JSON.parse(movedProviders.stdout).order, ['large-target', 'large-provider'])

  const sortedProviders = spawnSync(process.execPath, [
    join(embeddedHarmony, 'lib/bin.js'),
    'harmony', 'provider-order', 'auto', '--json', '--profile', 'web',
  ], { encoding: 'utf8', env: cliEnv })
  assert.equal(sortedProviders.status, 0, sortedProviders.stderr)
  assert.deepEqual(JSON.parse(sortedProviders.stdout).order, ['large-target', 'large-provider'])

  const shownOrder = spawnSync(process.execPath, [
    join(embeddedHarmony, 'lib/bin.js'),
    'harmony', 'patch-order', 'show', '--json', '--profile', 'web',
  ], { encoding: 'utf8', env: cliEnv })
  assert.equal(shownOrder.status, 0, shownOrder.stderr)
  assert.deepEqual(JSON.parse(shownOrder.stdout).patchOrder, [
    'large-provider/large-output',
    'large-provider/stable-export',
  ])

  const movedOrder = spawnSync(process.execPath, [
    join(embeddedHarmony, 'lib/bin.js'),
    'harmony', 'patch-order', 'move', 'large-provider/stable-export',
    '--before', 'large-provider/large-output', '--json', '--profile', 'web',
  ], { encoding: 'utf8', env: cliEnv })
  assert.equal(movedOrder.status, 0, movedOrder.stderr)
  assert.equal(JSON.parse(movedOrder.stdout).result.mode, 'offline')
  assert.deepEqual(JSON.parse(movedOrder.stdout).patchOrder, [
    'large-provider/stable-export',
    'large-provider/large-output',
  ])
  assert.equal(JSON.parse(movedOrder.stdout).violations.length, 1)

  const invalidOrder = spawnSync(process.execPath, [
    join(embeddedHarmony, 'lib/bin.js'),
    'harmony', 'patch-order', 'show', '--profile', 'web',
  ], { encoding: 'utf8', env: cliEnv })
  assert.notEqual(invalidOrder.status, 0)
  assert.match(invalidOrder.stdout, /1 order violation/)

  const unhealthyStatus = spawnSync(process.execPath, [
    join(embeddedHarmony, 'lib/bin.js'),
    'harmony', 'status', '--profile', 'web',
  ], { encoding: 'utf8', env: cliEnv })
  assert.notEqual(unhealthyStatus.status, 0)
  assert.match(unhealthyStatus.stdout, /warning  Patch large-provider\/large-output must precede large-provider\/stable-export/)

  const sortedOrder = spawnSync(process.execPath, [
    join(embeddedHarmony, 'lib/bin.js'),
    'harmony', 'patch-order', 'auto', '--json', '--profile', 'web',
  ], { encoding: 'utf8', env: cliEnv })
  assert.equal(sortedOrder.status, 0, sortedOrder.stderr)
  assert.deepEqual(JSON.parse(sortedOrder.stdout).patchOrder, [
    'large-provider/large-output',
    'large-provider/stable-export',
  ])
  assert.deepEqual(JSON.parse(sortedOrder.stdout).violations, [])

  const disabled = spawnSync(process.execPath, [
    join(embeddedHarmony, 'lib/bin.js'),
    'harmony', 'disable', 'large-provider/large-output', '--json', '--profile', 'web',
  ], { encoding: 'utf8', env: cliEnv })
  assert.equal(disabled.status, 0, disabled.stderr)
  assert.equal(JSON.parse(disabled.stdout).result.mode, 'offline')
  assert.equal(JSON.parse(disabled.stdout).patches[0].state, 'disabled')
  assert.deepEqual(JSON.parse(readFileSync(join(profile, 'harmony.json'), 'utf8')).disabled, [
    'large-provider/large-output',
  ])

  const offlineReload = spawnSync(process.execPath, [
    join(embeddedHarmony, 'lib/bin.js'),
    'harmony', 'reload', '--profile', 'web',
  ], { encoding: 'utf8', env: cliEnv })
  assert.notEqual(offlineReload.status, 0)
  assert.match(offlineReload.stderr, /reload requires a live Host/)

  const unknown = spawnSync(process.execPath, [
    join(embeddedHarmony, 'lib/bin.js'),
    'harmony', 'unknown', '--profile', 'web',
  ], { encoding: 'utf8', env: cliEnv })
  assert.notEqual(unknown.status, 0)
  assert.match(unknown.stderr, /unknown harmony command/)

  const missing = spawnSync(process.execPath, [
    join(embeddedHarmony, 'lib/bin.js'),
    'harmony', 'inspect', 'missing-target', '--profile', 'web',
  ], { encoding: 'utf8', env: cliEnv })
  assert.notEqual(missing.status, 0)
  assert.match(missing.stderr, /no matching Patch target was found/)
} finally {
  rmSync(root, { recursive: true })
}
