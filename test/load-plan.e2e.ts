import assert from 'node:assert/strict'
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import {
  getPatchInspections,
  getPatchStatuses,
  inspectPatchTargets,
  installFileTransforms,
  installModuleHooks,
  plannedClientDependencies,
  resolveProfilePackageManifest,
  synchronizeProfile,
} from '../lib/runtime.js'

const root = mkdtempSync(join(tmpdir(), 'dsh-harmony-load-plan-'))
try {
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'load-plan-profile', version: '1.0.0' }))
  installModuleHooks()
  installFileTransforms()
  synchronizeProfile(root, [join(dirname(import.meta.dirname), 'package.json')])
  inspectPatchTargets()

  const statuses = getPatchStatuses()
  for (const id of ['client-package-resolution', 'client-module-graph', 'cordis-service-waiter-index']) {
    const status = statuses.find(item => item.id === id)
    assert.equal(status?.state, 'bound', status?.error)
    assert.equal(status.matches, 1)
  }

  const clientInspection = getPatchInspections('@deepseek-ai/dsh-client-modules', 'lib/index.js')[0]
  assert.match(clientInspection.final, /__dshHarmonyResolvePackageManifest/)
  assert.match(clientInspection.final, /__dshHarmonyClientDependencies/)
  const clientFilename = createRequire(import.meta.url).resolve('@deepseek-ai/dsh-client-modules')
  assert.ok(plannedClientDependencies(clientFilename).includes('@deepseek-ai/cordis'))

  const cordisManifest = createRequire(import.meta.url).resolve('@deepseek-ai/cordis/package.json')
  assert.equal(realpathSync(resolveProfilePackageManifest('@deepseek-ai/cordis')!), realpathSync(cordisManifest))

  const generation = statuses[0]!.generation
  const { Context } = await import(`@deepseek-ai/cordis?dsh-harmony=${generation}`)
  const ctx = new Context()
  const order: string[] = []
  const firstPlugin = { inject: ['plannedService'], apply() { order.push('first') } }
  const secondPlugin = { inject: ['plannedService'], apply() { order.push('second') } }
  const first = ctx.plugin(firstPlugin)
  const second = ctx.plugin(secondPlugin)
  const repeated = ctx.plugin(firstPlugin)
  await Promise.all([first.await(), second.await(), repeated.await()])
  assert.deepEqual(order, [])

  const dispose = ctx.provide('plannedService', {})
  await Promise.all([first.await(), second.await(), repeated.await()])
  assert.deepEqual(order, ['first', 'first', 'second'])
  await dispose()

  let staleLoads = 0
  const doomed = { inject: ['lateService'], apply() { staleLoads += 1 } }
  const stop = ctx.on('internal/plugin', (fiber: any) => {
    if (fiber.runtime?.callback === doomed.apply && fiber.uid !== null) void fiber.dispose()
  })
  ctx.plugin(doomed)
  const disposeLate = ctx.provide('lateService', {})
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(staleLoads, 0)
  stop()
  await disposeLate()
} finally {
  rmSync(root, { recursive: true })
}
