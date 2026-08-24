import type MagicString from 'magic-string'
import type ts from 'typescript'
import type { HarmonyReloadStatus } from './installer.js'
import type { HarmonyProfileUpdate, HarmonyProfileView } from './profile.js'
import type { HarmonyGenerationLoadPlan } from './orchestrator.js'

declare module '@deepseek-ai/cordis' {
  interface Context {
    harmony: HarmonyService
  }
}

export interface HarmonyService {
  profile(): HarmonyProfileView
  loadPlan(): HarmonyGenerationLoadPlan | undefined
  updateProfile(input: HarmonyProfileUpdate): Promise<HarmonyRuntimeProfileUpdateResult>
  inspect(input?: HarmonyInspectInput): HarmonyInspection
}

export interface HarmonyRuntimeProfileUpdateResult {
  mode: 'live'
  profile: HarmonyProfileView
  generation: number
  reload: HarmonyReloadStatus
}

export interface HarmonyOfflineProfileUpdateResult {
  mode: 'offline'
  profile: HarmonyProfileView
}

export type HarmonyProfileUpdateResult = HarmonyRuntimeProfileUpdateResult | HarmonyOfflineProfileUpdateResult

export interface HarmonyInspectInput {
  package?: string
  file?: string
}

export interface HarmonyInspection {
  patches: HarmonyPatchStatus[]
  targets: HarmonyPatchInspection[]
  loadPlan?: HarmonyGenerationLoadPlan
}

export interface HarmonyPatchTarget {
  package: string
  file: string
  version?: string
}

export interface HarmonyPatchOrder {
  /** Human-readable explanation of what this Patch changes. */
  description?: string
  /** Apply this Patch before every Patch owned by the named providers. Defining either field replaces the provider-wide rule. */
  before?: string[]
  /** Apply this Patch after every Patch owned by the named providers. Defining either field replaces the provider-wide rule. */
  after?: string[]
}

export interface HarmonySourcePatch extends HarmonyPatchOrder {
  id: string
  target: HarmonyPatchTarget
  select: string
  expect?: number
  trace?: HarmonySourceTrace
  apply(context: HarmonyPatchContext): void
}

export interface HarmonyLoaderPatch extends HarmonyPatchOrder {
  id: string
  target: HarmonyPatchTarget
  loader: 'typescript'
}

export interface HarmonySourceTrace {
  select: string
  effect:
    | 'replace-element'
    | 'wrap-element'
    | 'insert-before'
    | 'insert-after'
    | 'transform-props'
    | 'decorate-component'
    | 'replace-component'
  maxMatches: number
}

export type HarmonySemanticOperation = 'before' | 'after' | 'around' | 'replace'

export interface HarmonySemanticContext {
  args: unknown[]
  self: unknown
  result?: unknown
  invoke(args?: unknown[]): unknown
}

export interface HarmonySemanticPatch extends HarmonyPatchOrder {
  id: string
  target: HarmonyPatchTarget & { function: string }
  operation: HarmonySemanticOperation
  expect?: number
  handler(context: HarmonySemanticContext): unknown
}

export type HarmonyPatch = HarmonySourcePatch | HarmonySemanticPatch | HarmonyLoaderPatch

/**
 * A single ordered and toggleable Patch made from several ordinary Patches.
 * Members keep declaration order and commit atomically across their resolved targets.
 */
export interface HarmonyCompositePatch extends HarmonyPatchOrder {
  id: string
  patches: HarmonyPatch[]
}

export type HarmonyPatchDeclaration = HarmonyPatch | HarmonyCompositePatch

export interface HarmonyPatchContext {
  patch: { key: string; owner: string }
  source: string
  sourceFile: ts.SourceFile
  node: ts.Node
  edit: MagicString
  ts: typeof ts
  /** Query the current source AST, optionally restricted to one subtree. */
  query(selector: string, root?: ts.Node): ts.Node[]
}

export interface HarmonyPatchStatus {
  key: string
  id: string
  description?: string
  owner: string
  index: number
  before?: string[]
  after?: string[]
  targets: HarmonyPatchTarget[]
  kind: 'source' | 'semantic' | 'loader' | 'composite'
  operation?: HarmonySemanticOperation
  loader?: HarmonyLoaderPatch['loader']
  state: 'pending' | 'bound' | 'disabled' | 'failed'
  matches: number
  generation: number
  declaration: string
  members?: Array<{
    id: string
    description?: string
    target: HarmonyPatchTarget
    kind: 'source' | 'semantic' | 'loader'
    operation?: HarmonySemanticOperation
    loader?: HarmonyLoaderPatch['loader']
  }>
  warnings?: string[]
  error?: string
}

export interface HarmonyPatchInspection {
  package: string
  file: string
  original: string
  final: string
  steps: Array<{
    key: string
    owner: string
    matches: number
    source: string
  }>
}

export { apply, inject } from './plugin.js'
export type {
  HarmonyEntryLoadPlan,
  HarmonyGenerationLoadPlan,
  HarmonyModuleDependency,
  HarmonyModuleLoadPlan,
  HarmonyPackageLoadPlan,
  HarmonyPatchLoadPlan,
} from './orchestrator.js'
export {
  preflightHarmonyProfileUpdate,
  readHarmonyProfile,
} from './profile.js'
export { updateHarmonyProfile } from './control.js'
export type {
  HarmonyProfilePluginView,
  HarmonyProfileUpdate,
  HarmonyProfileView,
} from './profile.js'
export type {
  HarmonyPluginCompatibilityDeclarations,
  HarmonyPluginCompatibilityFinding,
  HarmonyPluginCompatibilityRanges,
  HarmonyPluginRef,
} from './compatibility.js'
export type { HarmonyReloadStatus } from './installer.js'
export type { HarmonyOrderViolation } from './order.js'
export type {
  HarmonyInstancePatchCheck,
  HarmonyInstancePatchProfile,
  HarmonySessionPatch,
  HarmonySessionPatchCheck,
  HarmonySessionPatchDifference,
  HarmonySessionPatchProfile,
} from './session-profile.js'
