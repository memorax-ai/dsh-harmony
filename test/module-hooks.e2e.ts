import assert from 'node:assert/strict'
import fs, { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { registerHooks } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { apply as harmonyApply } from '../lib/index.js'
import {
  beginProfileUpdate,
  getPatchStatuses,
  installFileTransforms,
  installModuleHooks,
  synchronizeProfile,
} from '../lib/runtime.js'

const profile = mkdtempSync(join(tmpdir(), 'dsh-harmony-module-hooks-'))
const target = join(profile, 'node_modules/module-hook-target')
const provider = join(profile, 'node_modules/module-hook-provider')
const unrelated = join(profile, 'node_modules/unrelated-typescript-target')
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
  mkdirSync(unrelated)
  writeFileSync(join(profile, 'package.json'), JSON.stringify({ dependencies: {
    'module-hook-provider': '1',
    'module-hook-target': '1',
    'unrelated-typescript-target': '1',
  } }))
  writeFileSync(join(target, 'package.json'), JSON.stringify({
    name: 'module-hook-target', version: '1.0.0', type: 'module',
  }))
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
    id: 'typescript-loader', target: { package: 'module-hook-target', file: 'index.ts' },
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

  synchronizeProfile(profile)
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

  const array = await import(`${urls.array}?dsh-harmony=${generation}`)
  const typed = await import(`${urls.typed}?dsh-harmony=${generation}`)
  if (aliasSymlink) await import(`${urls.aliasLink}?dsh-harmony=${generation}`)
  await import(`${urls.idempotent}?dsh-harmony=${generation}`)
  const typescript = await import(`${urls.typescriptEntry}?dsh-harmony=${generation}`)

  assert.equal(array.value, 2)
  assert.equal(typed.value, 2)
  assert.equal(typescript.value, 3)
  if (aliasSymlink) assert.equal((globalThis as any).__dshHarmonyAliasApplications, 1)
  assert.equal((globalThis as any).__dshHarmonyIdempotentApplications, 1)
  assert.equal(getPatchStatuses().find(patch => patch.key === 'module-hook-provider/typescript-loader')?.state, 'bound')
  assert.equal(getPatchStatuses().find(patch => patch.key === 'module-hook-provider/typescript-source')?.state, 'bound')

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
}
