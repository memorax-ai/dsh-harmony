import assert from 'node:assert/strict'
import fs, { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { registerHooks } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import { apply as harmonyApply } from '../lib/index.js'
import {
  beginProfileUpdate,
  dependentPackages,
  getPatchStatuses,
  installFileTransforms,
  installModuleHooks,
  resolveProfileDependency,
  synchronizeProfile,
} from '../lib/runtime.js'

const profile = mkdtempSync(join(tmpdir(), 'dsh-harmony-module-hooks-'))
const external = mkdtempSync(join(tmpdir(), 'dsh-harmony-module-hooks-external-'))
const target = join(profile, 'node_modules/module-hook-target')
const provider = join(profile, 'node_modules/module-hook-provider')
const consumer = join(profile, 'node_modules/module-hook-consumer')
const unrelated = join(profile, 'node_modules/unrelated-typescript-target')
const transitiveFallback = join(profile, 'node_modules/module-hook-transitive')
const transitive = join(profile, 'bundle/node_modules/module-hook-transitive')
const importOnly = join(profile, 'bundle/node_modules/module-hook-import-only')
const arbitrary = join(profile, 'arbitrary-package-directory')
const arbitraryCommonJS = join(profile, 'arbitrary-commonjs-package-directory')
const arbitraryFallback = join(profile, 'node_modules/module-hook-arbitrary')
const esmProbe = join(profile, 'transitive-probe.mjs')
const cjsProbe = join(profile, 'transitive-probe.cjs')
const importOnlyProbe = join(profile, 'import-only-probe.mjs')
const arbitraryProbe = join(external, 'arbitrary-probe.mjs')
const arbitraryCommonJSProbe = join(external, 'arbitrary-commonjs-probe.cjs')
const files = {
  array: join(target, 'lib/array.js'),
  typed: join(target, 'lib/typed.js'),
  alias: join(target, 'lib/alias.js'),
  aliasLink: join(target, 'lib/alias-link.js'),
  idempotent: join(target, 'lib/idempotent.js'),
  typescriptEntry: join(target, 'index.ts'),
  typescriptHelper: join(target, 'lib/helper.ts'),
  typescriptValue: join(target, 'lib/value.ts'),
}
let aliasSymlink = false

try {
  mkdirSync(join(target, 'lib'), { recursive: true })
  mkdirSync(provider)
  mkdirSync(consumer)
  mkdirSync(unrelated)
  mkdirSync(transitiveFallback)
  mkdirSync(transitive, { recursive: true })
  mkdirSync(importOnly)
  mkdirSync(arbitrary)
  mkdirSync(arbitraryCommonJS)
  mkdirSync(arbitraryFallback)
  writeFileSync(join(profile, 'package.json'), JSON.stringify({ dependencies: {
    'module-hook-provider': '1',
    'module-hook-target': '1',
    'module-hook-consumer': '1',
    'unrelated-typescript-target': '1',
  } }))
  writeFileSync(join(target, 'package.json'), JSON.stringify({
    name: 'module-hook-target', version: '1.0.0', type: 'module',
  }))
  writeFileSync(join(consumer, 'package.json'), JSON.stringify({
    name: 'module-hook-consumer', version: '1.0.0', type: 'module', main: './index.js',
  }))
  writeFileSync(join(consumer, 'index.js'), `
import { value } from 'module-hook-target/lib/array.js'
export { value }
`)
  for (const filename of [files.array, files.typed, files.alias, files.idempotent]) {
    writeFileSync(filename, 'export const value = 1\n')
  }
  writeFileSync(files.typescriptEntry, `
import { helper } from './lib/helper.js'
export const value: number = helper() + 1
`)
  writeFileSync(files.typescriptHelper, `
import { value } from './value'
export function helper(): number { return value }
`)
  writeFileSync(files.typescriptValue, 'export const value: number = 1\n')
  writeFileSync(join(unrelated, 'package.json'), JSON.stringify({
    name: 'unrelated-typescript-target', version: '1.0.0', type: 'module', main: 'index.ts',
  }))
  writeFileSync(join(unrelated, 'index.ts'), 'export const value: number = 1\n')
  writeFileSync(join(transitiveFallback, 'package.json'), JSON.stringify({
    name: 'module-hook-transitive', version: '0.0.1', type: 'module', exports: './index.js',
  }))
  writeFileSync(join(transitiveFallback, 'index.js'), 'export const selected = "fallback"\n')
  writeFileSync(join(transitive, 'package.json'), JSON.stringify({
    name: 'module-hook-transitive', version: '1.0.0', type: 'module',
    exports: { '.': { import: './import.js', require: './require.cjs' } },
  }))
  writeFileSync(join(transitive, 'import.js'), 'export const selected = "import"\n')
  writeFileSync(join(transitive, 'require.cjs'), 'module.exports = { selected: "require" }\n')
  writeFileSync(join(importOnly, 'package.json'), JSON.stringify({
    name: 'module-hook-import-only', version: '1.0.0', type: 'module',
    exports: { '.': { import: './index.js' } },
  }))
  writeFileSync(join(importOnly, 'index.js'), 'export const selected = "import-only"\n')
  writeFileSync(join(arbitrary, 'package.json'), JSON.stringify({
    name: 'module-hook-arbitrary', version: '1.0.0', type: 'module', main: './index.js',
  }))
  writeFileSync(join(arbitrary, 'index.js'), 'export const selected = "arbitrary"\n')
  writeFileSync(join(arbitraryCommonJS, 'package.json'), JSON.stringify({
    name: 'module-hook-arbitrary-commonjs', version: '1.0.0', main: './index.cjs',
  }))
  writeFileSync(join(arbitraryCommonJS, 'index.cjs'), 'module.exports = { selected: "arbitrary-commonjs" }\n')
  writeFileSync(join(arbitraryFallback, 'package.json'), JSON.stringify({
    name: 'module-hook-arbitrary', version: '0.0.1', type: 'module', main: './index.js',
  }))
  writeFileSync(join(arbitraryFallback, 'index.js'), 'export const selected = "fallback"\n')
  writeFileSync(esmProbe, 'export { selected } from "module-hook-transitive"\n')
  writeFileSync(cjsProbe, 'module.exports = require("module-hook-transitive")\n')
  writeFileSync(importOnlyProbe, 'export { selected } from "module-hook-import-only"\n')
  writeFileSync(arbitraryProbe, 'export { selected } from "module-hook-arbitrary"\n')
  writeFileSync(arbitraryCommonJSProbe, 'module.exports = require("module-hook-arbitrary-commonjs")\n')
  try {
    symlinkSync(files.alias, files.aliasLink)
    aliasSymlink = true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EPERM') throw error
    writeFileSync(files.aliasLink, readFileSync(files.alias))
  }
  writeFileSync(join(provider, 'package.json'), JSON.stringify({
    name: 'module-hook-provider', version: '1.0.0',
    dsh: { harmony: { patches: ['./patch.cjs'] } },
  }))
  writeFileSync(join(provider, 'patch.cjs'), `
const replaceValue = (id, file) => ({
  id, target: { package: 'module-hook-target', file },
  select: 'NumericLiteral', expect: 1,
  apply({ node, edit }) { edit.overwrite(node.getStart(), node.getEnd(), '2') },
})
module.exports = [
  replaceValue('array-source', 'lib/array.js'),
  replaceValue('typed-source', 'lib/typed.js'),
  {
    id: 'typescript-loader', target: { package: 'module-hook-target', version: '^2.0.0', file: 'index.ts' },
    loader: 'typescript',
  },
  {
    id: 'typescript-source', target: { package: 'module-hook-target', file: 'index.ts' },
    select: 'NumericLiteral[text="1"]', expect: 1,
    apply({ node, edit }) { edit.overwrite(node.getStart(), node.getEnd(), '2') },
  },
  {
    id: 'alias-source', target: { package: 'module-hook-target', file: 'lib/alias.js' },
    select: 'SourceFile', expect: 1,
    apply({ edit }) {
      globalThis.__dshHarmonyAliasApplications = (globalThis.__dshHarmonyAliasApplications ?? 0) + 1
      edit.append('\\n// alias transformed')
    },
  },
  {
    id: 'idempotent', target: { package: 'module-hook-target', file: 'lib/idempotent.js' },
    select: 'SourceFile', expect: 1,
    apply({ edit }) {
      globalThis.__dshHarmonyIdempotentApplications = (globalThis.__dshHarmonyIdempotentApplications ?? 0) + 1
      edit.append('\\n// idempotent transformed')
    },
  },
]
`)

  synchronizeProfile(profile, undefined, undefined, [
    join(transitive, 'package.json'),
    join(importOnly, 'package.json'),
    join(arbitrary, 'package.json'),
    join(arbitraryCommonJS, 'package.json'),
  ])
  const generation = getPatchStatuses().find(patch => patch.owner === 'module-hook-provider')?.generation
  assert.ok(generation !== undefined)
  const original = Object.fromEntries(Object.entries(files).map(([key, filename]) => [key, readFileSync(filename)]))
  const urls = Object.fromEntries(Object.entries(files).map(([key, filename]) => [key, pathToFileURL(filename).href]))

  registerHooks({
    load(url, context, nextLoad) {
      const cleanUrl = new URL(url)
      cleanUrl.search = ''
      if (cleanUrl.href === urls.array) {
        const source = original.array
        return {
          format: 'module',
          source: source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength),
          shortCircuit: true,
        }
      }
      if (cleanUrl.href === urls.typed) {
        return { format: 'module', source: Uint8Array.from(original.typed), shortCircuit: true }
      }
      if (cleanUrl.href === urls.aliasLink) {
        return { format: 'module', source: fs.readFileSync(files.alias, 'utf8'), shortCircuit: true }
      }
      if (cleanUrl.href === urls.idempotent) {
        return { format: 'module', source: original.idempotent.toString('utf8'), shortCircuit: true }
      }
      return nextLoad(url, context)
    },
  })
  installModuleHooks()
  installModuleHooks()
  installFileTransforms()

  const versionedRuntime = await import(`${new URL('../lib/runtime.js', import.meta.url).href}?dsh-harmony=${generation}`)
  assert.equal(versionedRuntime.getPatchStatuses, getPatchStatuses)
  const versionedPackage = await import(`dsh-harmony?dsh-harmony=${generation}`)
  assert.equal(versionedPackage.apply, harmonyApply)
  const transitiveSpecifier = 'module-hook-transitive'
  assert.equal((await import(transitiveSpecifier)).selected, 'import')
  assert.equal(
    fs.realpathSync(resolveProfileDependency(transitiveSpecifier, pathToFileURL(esmProbe).href)!),
    fs.realpathSync(transitive),
  )
  const transitiveModule = await import(pathToFileURL(esmProbe).href)
  assert.equal(transitiveModule.selected, 'import')
  const transitiveCommonJS = await import(pathToFileURL(cjsProbe).href)
  assert.equal(transitiveCommonJS.default.selected, 'require')
  const importOnlyModule = await import(pathToFileURL(importOnlyProbe).href)
  assert.equal(importOnlyModule.selected, 'import-only')
  assert.equal(
    fs.realpathSync(resolveProfileDependency('module-hook-arbitrary', pathToFileURL(arbitraryProbe).href)!),
    fs.realpathSync(arbitrary),
  )
  const arbitraryModule = await import(pathToFileURL(arbitraryProbe).href)
  assert.equal(arbitraryModule.selected, 'arbitrary')
  const arbitraryCommonJSModule = await import(pathToFileURL(arbitraryCommonJSProbe).href)
  assert.equal(arbitraryCommonJSModule.default.selected, 'arbitrary-commonjs')

  const loaderContext = new Context()
  loaderContext.baseUrl = `${pathToFileURL(profile).href}/`
  await loaderContext.plugin(Loader)
  try {
    const loaded = await loaderContext.loader.internal!.import(transitiveSpecifier, loaderContext.baseUrl, {})
    assert.equal(loaded.selected, 'import')
  } finally {
    await loaderContext.fiber.dispose()
  }

  const array = await import(`${urls.array}?dsh-harmony=${generation}`)
  const typed = await import(`${urls.typed}?dsh-harmony=${generation}`)
  if (aliasSymlink) await import(`${urls.aliasLink}?dsh-harmony=${generation}`)
  await import(`${urls.idempotent}?dsh-harmony=${generation}`)
  const typescript = await import(`${urls.typescriptEntry}?dsh-harmony=${generation}`)

  assert.equal(array.value, 2)
  const consumerModule = await import(pathToFileURL(join(consumer, 'index.js')).href)
  assert.equal(consumerModule.value, 2)
  assert.ok(dependentPackages(['module-hook-target']).has('module-hook-consumer'))
  assert.equal(typed.value, 2)
  assert.equal(typescript.value, 3)
  if (aliasSymlink) assert.equal((globalThis as any).__dshHarmonyAliasApplications, 1)
  assert.equal((globalThis as any).__dshHarmonyIdempotentApplications, 1)
  const loaderStatus = getPatchStatuses().find(patch => patch.key === 'module-hook-provider/typescript-loader')
  assert.equal(loaderStatus?.state, 'bound')
  assert.deepEqual(loaderStatus?.warnings, ['target module-hook-target@1.0.0 does not satisfy ^2.0.0'])
  assert.equal(getPatchStatuses().find(patch => patch.key === 'module-hook-provider/typescript-source')?.state, 'bound')

  const dependencyCandidate = beginProfileUpdate({ disabled: ['module-hook-provider/array-source'] })
  const reloadedConsumer = await import(`${pathToFileURL(join(consumer, 'index.js')).href}?dsh-harmony=${dependencyCandidate.generation}`)
  assert.equal(reloadedConsumer.value, 1)
  dependencyCandidate.rollback()

  const candidate = beginProfileUpdate({ disabled: ['module-hook-provider/typescript-loader'] })
  await assert.rejects(
    import(`${urls.typescriptEntry}?dsh-harmony=${candidate.generation}`),
    (error: any) => error?.code === 'ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING',
  )
  candidate.rollback()
  await assert.rejects(
    import(`${pathToFileURL(join(unrelated, 'index.ts')).href}?unrelated=1`),
    (error: any) => error?.code === 'ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING',
  )
} finally {
  delete (globalThis as any).__dshHarmonyAliasApplications
  delete (globalThis as any).__dshHarmonyIdempotentApplications
  rmSync(profile, { recursive: true })
  rmSync(external, { recursive: true })
}
