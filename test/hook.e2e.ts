import assert from 'node:assert/strict'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'
import { reloadEntries } from '../lib/plugin.js'
import {
  beginProfileUpdate,
  getPatchStatuses,
  installFileTransforms,
  installModuleHooks,
  synchronizeProfile,
} from '../lib/runtime.js'

const fixtures = join(dirname(fileURLToPath(import.meta.url)), 'fixtures')
const profile = mkdtempSync(join(tmpdir(), 'dsh-harmony-hook-'))
const modules = join(profile, 'node_modules')
mkdirSync(modules)
const packageNames: Record<string, string> = {
  provider: 'hook-provider',
  'provider-cjs': 'hook-provider-cjs',
  target: 'hook-target',
  'target-cjs': 'hook-target-cjs',
}
for (const name of ['provider', 'provider-cjs', 'target', 'target-cjs']) {
  const packageName = packageNames[name]!
  cpSync(join(fixtures, name), join(modules, packageName), { recursive: true })
}
writeFileSync(join(profile, 'package.json'), JSON.stringify({ dependencies: {
  'hook-provider': '1', 'hook-provider-cjs': '1', 'hook-target': '1', 'hook-target-cjs': '1',
} }))
installModuleHooks()
installFileTransforms()

const targetEntry = pathToFileURL(join(modules, 'hook-target/lib/index.js')).href
const cjsEntry = join(modules, 'hook-target-cjs/lib/index.cjs')
const original = await import(`${targetEntry}?dsh-harmony=0`)
assert.equal(original.answer(), 1)
const originalCjs = await import(`${pathToFileURL(cjsEntry).href}?dsh-harmony=0`)
assert.equal(originalCjs.default.answer(), 1)

synchronizeProfile(profile)
const generation = getPatchStatuses().find(patch => patch.owner === 'hook-provider')?.generation
assert.ok(generation !== undefined)
const target = await import(`${targetEntry}?dsh-harmony=${generation}`)
assert.equal(target.answer(), 2)
const targetStatus = getPatchStatuses().find(patch => patch.key === 'hook-provider/test-patch')
assert.equal(targetStatus?.state, 'bound')
assert.equal(targetStatus?.matches, 1)
assert.match(readFileSync(join(modules, 'hook-target/lib/helper.js'), 'utf8'), /return 2/)
const candidate = beginProfileUpdate({ disabled: ['hook-provider/lazy-patch'] })
assert.equal(await target.lazyAnswer(), 2)
candidate.rollback()
assert.equal(await target.lazyAnswer(), 2)
const entry: {
  options: { name: string }
  fiber?: { uid: number; runtime: { callback: { answer(): number } } }
  loader: { unwrapExports(value: unknown): unknown }
  parent: { tree: { ctx: { baseUrl: string }; import(): Promise<unknown> } }
  getOuterStack(): never[]
  _dispose(): Promise<void>
  _start(plugin: { answer(): number }): Promise<void>
} = {
  options: { name: cjsEntry },
  fiber: { uid: 1, runtime: { callback: originalCjs.default } },
  loader: { unwrapExports(value: unknown) {
    const candidate = value as { default?: unknown; __esModule?: boolean } | null | undefined
    const unwrapped = candidate?.default ?? candidate
    if (typeof unwrapped !== 'object' || unwrapped === null) return unwrapped
    const module = unwrapped as { default?: unknown; __esModule?: boolean }
    return module.__esModule ? module.default ?? module : module
  } },
  parent: { tree: { ctx: { baseUrl: import.meta.url }, import() { return import(`${pathToFileURL(cjsEntry).href}?dsh-harmony=${generation}`) } } },
  getOuterStack() { return [] },
  async _dispose() { this.fiber = undefined },
  async _start(plugin: { answer(): number }) { this.fiber = { uid: 2, runtime: { callback: plugin } } },
}
await reloadEntries([entry], 1)
assert.equal(entry.fiber?.runtime.callback.answer(), 2)

// A circular ESM importer may invoke an exported function before the target's
// top-level dispatcher binding has initialized.
const semanticTarget = join(modules, 'semantic-cycle-target')
const semanticProvider = join(modules, 'semantic-cycle-provider')
mkdirSync(semanticTarget)
mkdirSync(semanticProvider)
writeFileSync(join(semanticTarget, 'package.json'), JSON.stringify({ name: 'semantic-cycle-target', type: 'module' }))
writeFileSync(join(semanticTarget, 'index.js'), `
import { result } from './consumer.js'
export function answer(value) { return value }
export { result }
`)
writeFileSync(join(semanticTarget, 'consumer.js'), `
import { answer } from './index.js'
export const result = answer(3)
`)
writeFileSync(join(semanticProvider, 'package.json'), JSON.stringify({
  name: 'semantic-cycle-provider', dsh: { harmony: { patches: ['./patch.cjs'] } },
}))
writeFileSync(join(semanticProvider, 'patch.cjs'), `module.exports = {
  id: 'after', target: { package: 'semantic-cycle-target', file: 'index.js', function: 'answer' },
  operation: 'after', handler({ result }) { return result + 1 },
}`)
synchronizeProfile(profile, ['semantic-cycle-provider', 'semantic-cycle-target'])
const cycleGeneration = getPatchStatuses()[0]!.generation
const cycle = await import(`${pathToFileURL(join(semanticTarget, 'index.js')).href}?dsh-harmony=${cycleGeneration}`)
assert.equal(cycle.result, 4)
const settingsOnly = beginProfileUpdate({ workerThreads: 2 })
await settingsOnly.commit()
assert.equal(cycle.answer(3), 4)
rmSync(profile, { recursive: true })
