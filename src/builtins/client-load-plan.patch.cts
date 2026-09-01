import type { HarmonySourcePatch } from '../index.js'

const packageResolution: HarmonySourcePatch = {
  id: 'client-package-resolution',
  description: 'Resolves activated client packages through the Harmony generation inventory.',
  target: {
    package: '@deepseek-ai/dsh-client-modules',
    version: '>=0.1.1-rc.2 <0.1.2-0',
    file: 'lib/index.js',
  },
  select: 'MethodDeclaration[name.name="resolveMeta"] CallExpression[expression.name.name="resolvePkgJson"]',
  expect: 1,
  apply({ node, sourceFile, edit }) {
    edit.overwrite(
      node.getStart(sourceFile),
      node.getEnd(),
      'globalThis.__dshHarmonyResolvePackageManifest?.(pkgName) ?? this.resolvePkgJson(pkgName)',
    )
  },
}

const moduleGraph: HarmonySourcePatch = {
  id: 'client-module-graph',
  description: 'Adds dependencies found in Patch-transformed client bundles to their arrival graph.',
  target: {
    package: '@deepseek-ai/dsh-client-modules',
    version: '>=0.1.1-rc.2 <0.1.2-0',
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
