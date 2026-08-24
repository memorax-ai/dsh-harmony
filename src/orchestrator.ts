import { createHash } from 'node:crypto'
import { extname } from 'node:path'
import ts from 'typescript'
import { parseSource } from './transform.js'

export interface HarmonyModuleDependency {
  kind: 'import' | 'require' | 'dynamic-import'
  specifier: string
}

export interface HarmonyModuleLoadPlan {
  filename: string
  fingerprint: string
  dependencies: HarmonyModuleDependency[]
  declaredInject: string[]
  declaredProvide: string[]
  scopedInject: string[]
  possibleProvide: string[]
  dynamicMetadata: boolean
}

export interface HarmonyEntryLoadPlan {
  id: string
  name: string
  generation: number
  inject: string[]
  provide: string[]
  fingerprint: string
}

export interface HarmonyPackageLoadPlan {
  name: string
  directory: string
  version: string
}

export interface HarmonyPatchLoadPlan {
  key: string
  owner: string
  targets: Array<{ package: string; file: string }>
}

export interface HarmonyGenerationLoadPlan {
  generation: number
  packages: HarmonyPackageLoadPlan[]
  patches: HarmonyPatchLoadPlan[]
  modules: HarmonyModuleLoadPlan[]
  entries: HarmonyEntryLoadPlan[]
}

interface ModuleAnalysis {
  dependencies: HarmonyModuleDependency[]
  declaredInject: string[]
  declaredProvide: string[]
  scopedInject: string[]
  possibleProvide: string[]
  dynamicMetadata: boolean
}

const moduleAnalysisCache = new Map<string, ModuleAnalysis>()
const MODULE_ANALYSIS_CACHE_LIMIT = 512

function fingerprint(value: string): string {
  return createHash('sha256').update(value).digest('base64url')
}

function propertyName(node: ts.PropertyName): string | undefined {
  if (ts.isIdentifier(node) || ts.isStringLiteralLike(node) || ts.isNumericLiteral(node)) return node.text
}

function literalNames(
  node: ts.Expression | undefined,
  options: { string?: boolean; object?: boolean } = {},
): string[] | undefined {
  if (node === undefined) return undefined
  if (options.string && ts.isStringLiteralLike(node)) return [node.text]
  if (ts.isArrayLiteralExpression(node)) {
    const names: string[] = []
    for (const element of node.elements) {
      if (!ts.isStringLiteralLike(element)) return undefined
      names.push(element.text)
    }
    return names
  }
  if (options.object && ts.isObjectLiteralExpression(node)) {
    const names: string[] = []
    for (const property of node.properties) {
      if (!ts.isPropertyAssignment(property) && !ts.isShorthandPropertyAssignment(property)
        && !ts.isMethodDeclaration(property)) return undefined
      const name = propertyName(property.name)
      if (name === undefined) return undefined
      names.push(name)
    }
    return names
  }
}

function isExported(node: ts.Node): boolean {
  return ts.canHaveModifiers(node)
    && ts.getModifiers(node)?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword) === true
}

function assignmentMetadataName(node: ts.Expression): 'inject' | 'provide' | undefined {
  if (!ts.isPropertyAccessExpression(node)) return undefined
  if (node.name.text !== 'inject' && node.name.text !== 'provide') return undefined
  if (ts.isIdentifier(node.expression) && node.expression.text === 'exports') return node.name.text
  if (ts.isPropertyAccessExpression(node.expression)
    && ts.isIdentifier(node.expression.expression) && node.expression.expression.text === 'module'
    && node.expression.name.text === 'exports') return node.name.text
}

function objectMetadata(node: ts.ObjectLiteralExpression, name: 'inject' | 'provide'): {
  found: boolean
  names?: string[]
} {
  for (const property of node.properties) {
    if (!ts.isPropertyAssignment(property) || propertyName(property.name) !== name) continue
    return { found: true, names: literalNames(property.initializer, {
      string: name === 'provide',
      object: name === 'inject',
    }) }
  }
  return { found: false }
}

function analyzeSource(filename: string, source: string, supplied?: ts.SourceFile): ModuleAnalysis {
  const sourceFile = supplied?.text === source ? supplied : parseSource(filename, source)
  const dependencies = new Map<string, HarmonyModuleDependency>()
  const declaredInject = new Set<string>()
  const declaredProvide = new Set<string>()
  const scopedInject = new Set<string>()
  const possibleProvide = new Set<string>()
  let dynamicMetadata = false

  const metadataBindings = new Map<string, ts.Expression | undefined>()
  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue
    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name)) metadataBindings.set(declaration.name.text, declaration.initializer)
    }
  }

  const addDependency = (kind: HarmonyModuleDependency['kind'], specifier: string): void => {
    dependencies.set(`${kind}\0${specifier}`, { kind, specifier })
  }
  const addMetadata = (name: 'inject' | 'provide', names: string[] | undefined): void => {
    if (names === undefined) {
      dynamicMetadata = true
      return
    }
    const target = name === 'inject' ? declaredInject : declaredProvide
    for (const value of names) target.add(value)
  }

  for (const statement of sourceFile.statements) {
    if (ts.isImportDeclaration(statement) && ts.isStringLiteralLike(statement.moduleSpecifier)
      && statement.importClause?.isTypeOnly !== true) {
      addDependency('import', statement.moduleSpecifier.text)
    } else if (ts.isExportDeclaration(statement) && statement.moduleSpecifier !== undefined
      && ts.isStringLiteralLike(statement.moduleSpecifier) && statement.isTypeOnly !== true) {
      addDependency('import', statement.moduleSpecifier.text)
    } else if (ts.isVariableStatement(statement) && isExported(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name)) continue
        if (declaration.name.text === 'inject' || declaration.name.text === 'provide') {
          addMetadata(declaration.name.text, literalNames(declaration.initializer, {
            string: declaration.name.text === 'provide',
            object: declaration.name.text === 'inject',
          }))
        }
      }
    } else if (ts.isExportDeclaration(statement) && statement.moduleSpecifier === undefined
      && statement.exportClause !== undefined && ts.isNamedExports(statement.exportClause)) {
      for (const element of statement.exportClause.elements) {
        const exported = element.name.text
        if (exported !== 'inject' && exported !== 'provide') continue
        const local = element.propertyName?.text ?? exported
        addMetadata(exported, literalNames(metadataBindings.get(local), {
          string: exported === 'provide',
          object: exported === 'inject',
        }))
      }
    } else if (ts.isExportAssignment(statement) && ts.isObjectLiteralExpression(statement.expression)) {
      for (const name of ['inject', 'provide'] as const) {
        const metadata = objectMetadata(statement.expression, name)
        if (metadata.found) addMetadata(name, metadata.names)
      }
    } else if (ts.isExpressionStatement(statement) && ts.isBinaryExpression(statement.expression)
      && statement.expression.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
      const assignment = statement.expression
      const name = assignmentMetadataName(assignment.left)
      if (name !== undefined) addMetadata(name, literalNames(assignment.right, {
        string: name === 'provide',
        object: name === 'inject',
      }))
      if (ts.isPropertyAccessExpression(assignment.left)
        && ts.isIdentifier(assignment.left.expression) && assignment.left.expression.text === 'module'
        && assignment.left.name.text === 'exports' && ts.isObjectLiteralExpression(assignment.right)) {
        for (const metadataName of ['inject', 'provide'] as const) {
          const metadata = objectMetadata(assignment.right, metadataName)
          if (metadata.found) addMetadata(metadataName, metadata.names)
        }
      }
    }
  }

  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const argument = node.arguments[0]
      if (argument !== undefined && ts.isStringLiteralLike(argument)) {
        if (node.expression.kind === ts.SyntaxKind.ImportKeyword) addDependency('dynamic-import', argument.text)
        else if (ts.isIdentifier(node.expression) && node.expression.text === 'require') {
          addDependency('require', argument.text)
        } else if (ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'provide') {
          possibleProvide.add(argument.text)
        }
      } else if (ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'inject') {
        const names = literalNames(argument, { object: true })
        if (names !== undefined) for (const name of names) scopedInject.add(name)
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)

  return {
    dependencies: [...dependencies.values()],
    declaredInject: [...declaredInject],
    declaredProvide: [...declaredProvide],
    scopedInject: [...scopedInject],
    possibleProvide: [...possibleProvide],
    dynamicMetadata,
  }
}

export function analyzeModuleLoad(
  filename: string,
  source: string,
  sourceFile?: ts.SourceFile,
  knownFingerprint?: string,
): HarmonyModuleLoadPlan {
  const sourceFingerprint = knownFingerprint ?? fingerprint(source)
  const cacheKey = `${extname(filename)}\0${sourceFingerprint}`
  let analysis = moduleAnalysisCache.get(cacheKey)
  if (analysis === undefined) {
    analysis = analyzeSource(filename, source, sourceFile)
    if (moduleAnalysisCache.size >= MODULE_ANALYSIS_CACHE_LIMIT) {
      moduleAnalysisCache.delete(moduleAnalysisCache.keys().next().value!)
    }
    moduleAnalysisCache.set(cacheKey, analysis)
  } else {
    moduleAnalysisCache.delete(cacheKey)
    moduleAnalysisCache.set(cacheKey, analysis)
  }
  return { filename, fingerprint: sourceFingerprint, ...analysis }
}

export function dependencyNames(value: unknown): string[] {
  if (Array.isArray(value)) return [...new Set(value.filter((name): name is string => typeof name === 'string'))]
  if (value === null || typeof value !== 'object') return []
  const names = new Set<string>()
  for (const name in value) names.add(name)
  return [...names]
}

export function observeEntryLoad(input: {
  id: string
  name: string
  generation: number
  entryInject?: unknown
  plugin: unknown
}): HarmonyEntryLoadPlan {
  const plugin = input.plugin as { inject?: unknown; provide?: unknown } | undefined
  const inject = [...new Set([
    ...dependencyNames(plugin?.inject),
    ...dependencyNames(input.entryInject),
  ])]
  const provide = typeof plugin?.provide === 'string'
    ? [plugin.provide]
    : Array.isArray(plugin?.provide) ? dependencyNames(plugin.provide) : []
  return {
    id: input.id,
    name: input.name,
    generation: input.generation,
    inject,
    provide,
    fingerprint: fingerprint(JSON.stringify([input.name, inject, provide])),
  }
}

export function clearModuleAnalysisCache(): void {
  moduleAnalysisCache.clear()
}
