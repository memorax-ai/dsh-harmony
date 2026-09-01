import type { HarmonySourcePatch } from '../index.js'
import { DSH_012_RANGE, LEGACY_CLIENT_RANGE } from './dsh-compat.cjs'

const clientVersion = `${LEGACY_CLIENT_RANGE} || ${DSH_012_RANGE}`

const packageResolution: HarmonySourcePatch = {
  id: 'client-package-resolution',
  description: 'Resolves activated client packages through the Harmony generation inventory.',
  target: {
    package: '@deepseek-ai/dsh-client-modules',
    version: clientVersion,
    file: 'lib/index.js',
  },
  select: 'MethodDeclaration[name.name="resolveMeta"]',
  expect: 1,
  apply({ node, sourceFile, edit, query }) {
    const calls = query('CallExpression', node)
    const legacy = calls.filter(call => call.getText(sourceFile) === 'this.resolvePkgJson(pkgName)')
    const current = calls.filter(call => call.getText(sourceFile) === 'this.locatePkgJson(loaderName, baseUrl)')
    if (legacy.length === 1 && current.length === 0) {
      edit.overwrite(
        legacy[0]!.getStart(sourceFile),
        legacy[0]!.getEnd(),
        'globalThis.__dshHarmonyResolvePackageManifest?.(pkgName) ?? this.resolvePkgJson(pkgName)',
      )
      return
    }
    if (current.length === 1 && legacy.length === 0) {
      edit.overwrite(current[0]!.getStart(sourceFile), current[0]!.getEnd(), `(() => {
			const harmonyPath = globalThis.__dshHarmonyResolvePackageManifest?.(loaderName);
			return harmonyPath === void 0 ? this.locatePkgJson(loaderName, baseUrl) : {
				path: harmonyPath,
				packageName: JSON.parse(readFileSync(harmonyPath, "utf8")).name
			};
		})()`)
      return
    }
    throw new Error(`expected one supported client package resolver, found ${legacy.length} legacy and ${current.length} current`)
  },
}

const moduleGraph: HarmonySourcePatch = {
  id: 'client-module-graph',
  description: 'Adds dependencies found in Patch-transformed client bundles to their arrival graph.',
  target: {
    package: '@deepseek-ai/dsh-client-modules',
    version: clientVersion,
    file: 'lib/index.js',
  },
  select: 'FunctionDeclaration[name.name="graphRow"]',
  expect: 1,
  apply({ node, sourceFile, edit, ts }) {
    if (!ts.isFunctionDeclaration(node) || node.body === undefined) {
      throw new Error('client module graphRow is not a function declaration')
    }
    edit.prependLeft(node.body.getStart(sourceFile) + 1, `
	fields = { ...fields, external: [...new Set([
		...fields.external,
		...(globalThis.__dshHarmonyClientDependencies?.(fields.clientPath) ?? []),
	])] };`)
  },
}

module.exports = [packageResolution, moduleGraph]
