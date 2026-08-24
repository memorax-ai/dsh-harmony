import { randomBytes } from 'node:crypto'
import { channel } from 'node:diagnostics_channel'
import { readFileSync } from 'node:fs'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { findPackageJSON } from 'node:module'
import type { AddressInfo } from 'node:net'
import { basename, join } from 'node:path'
import type { ClientModuleRegistry } from '@deepseek-ai/dsh-client-modules'
import type { WebServer } from '@deepseek-ai/dsh-host-webserver'
import type { Session } from '@deepseek-ai/dsh-session'
import type { Context, Fiber } from '@deepseek-ai/cordis'
import type { Loader } from '@deepseek-ai/cordis-plugin-loader'
import { publishRuntimeAddress } from './control.js'
import { readJson, RequestBodyTooLargeError } from './http.js'
import { registerActiveRuntimeRoute, waitForRuntimeChoice } from './installer.js'
import type { HarmonyReloadStatus } from './installer.js'
import type { HarmonyProfileUpdate, HarmonyProfileView, HarmonyRuntimeProfileUpdateResult } from './index.js'
import {
  createHarmonyProfileView,
  HARMONY_PLUGIN,
  HARMONY_STATE_FILE,
  HarmonyProfileConflictError,
  prepareHarmonyProfileUpdate,
} from './profile.js'
import {
  beginProfileUpdate,
  beginPluginUpdate,
  beginStartupUpdate,
  consumeStartupPerformance,
  currentSessionPatchProfile,
  currentProfile,
  dependentPackages,
  getPatchInspections,
  getLoadPlan,
  getPatchOrderViolations,
  getPatchStatuses,
  inspectPatchTargetsAsync,
  inspectUnresolvedPatchTargetsAsync,
  packageNameOf,
  prepareModuleReload,
  recordEntryLoad,
  removeEntryLoad,
  resolveProfileDependency,
  subscribe,
  subscribePatchStatuses,
  watchProfile,
} from './runtime.js'
import type { PatchTargets, ProfileTransaction } from './runtime.js'
import type { HarmonyActivePlugin } from './compatibility.js'
import { harmonyDataRoot, HarmonySessionProfileStore } from './session-profile.js'

const imageAssets = [
  ['/dsh-harmony/assets/harmony-icon-mono.png', new URL('../assets/harmony-icon-mono.png', import.meta.url), 'image/png'],
  ['/dsh-harmony/assets/harmony-preview.webp', new URL('../assets/harmony-preview.webp', import.meta.url), 'image/webp'],
  ['/dsh-harmony/assets/harmony-preview-light.webp', new URL('../assets/harmony-preview-light.webp', import.meta.url), 'image/webp'],
] as const

interface ReloadFiber {
  uid: number | null
  inject?: unknown
  runtime: { callback: unknown } | null
}

interface ReloadableEntry {
  id?: string
  options: { name: string; inject?: unknown }
  fiber?: ReloadFiber
  parent: { tree: { ctx?: { baseUrl?: string }; import(name: string, getOuterStack?: () => string[]): unknown } }
  loader: { unwrapExports(value: unknown): unknown }
  getOuterStack(): string[]
  _dispose(fiber?: ReloadFiber): Promise<void>
  _start(plugin: unknown): Promise<void>
}

interface HarmonyLoadPerformance {
  operation: 'startup' | 'plugin-update' | 'profile-update' | 'manual-reload'
  generation?: number
  status: 'succeeded' | 'failed'
  targetPackages: number
  targetFiles: number
  prepareMs: number
  transformMs: number
  hostReloadMs: number
  clientRebuildMs: number
  totalMs: number
  error?: string
}

interface HarmonyLoadProbe {
  operation: HarmonyLoadPerformance['operation']
  started: bigint
  prepareMs: number
  transformMs: number
  hostReloadMs: number
  clientRebuildMs: number
  targetPackages?: number
  targetFiles?: number
}

const loadPerformanceChannel = channel('dsh-harmony:load')

function elapsedMilliseconds(started: bigint): number {
  return Math.round(Number(process.hrtime.bigint() - started) / 1e3) / 1e3
}

function loaderInventory(ctx: Context): { packages: string[]; active: HarmonyActivePlugin[] } {
  const packages = new Set<string>()
  const active = new Map<string, string[]>()
  for (const entry of ctx.loader.entries()) {
    const name = packageNameOf(entry.options.name)
    if (name === undefined) continue
    const baseUrl = entry.parent?.tree?.ctx?.baseUrl
    const selectedDirectory = resolveProfileDependency(name, baseUrl)
    let candidate = selectedDirectory === undefined ? name : join(selectedDirectory, 'package.json')
    if (selectedDirectory === undefined && baseUrl !== undefined) {
      try { candidate = findPackageJSON(name, baseUrl) ?? name } catch {}
    }
    packages.add(candidate)
    if (entry.options.group || entry.disabled) continue
    const running = entry as typeof entry & {
      id: string
      options: { name: string; inject?: unknown }
      fiber?: { runtime?: { callback?: unknown } }
    }
    if (running.fiber?.runtime?.callback !== undefined) {
      recordEntryLoad({
        id: running.id,
        name: running.options.name,
        entryInject: running.fiber.inject ?? running.options.inject,
        plugin: running.fiber.runtime.callback,
      })
    }
    const entryIds = active.get(name) ?? []
    entryIds.push(entry.id)
    active.set(name, entryIds)
  }
  return {
    packages: [...packages],
    active: [...active].map(([name, entryIds]) => ({ name, entryIds })),
  }
}

function loaderInventoryFingerprint(inventory: ReturnType<typeof loaderInventory>): string {
  return JSON.stringify([inventory.packages, inventory.active])
}

interface ReloadAction {
  host: Set<string>
  client: Set<string>
}

function profileView(revision = 0): HarmonyProfileView {
  const profile = currentProfile()
  const patchCounts = new Map(profile.plugins.map(plugin => [plugin.name, 0]))
  for (const patch of getPatchStatuses()) patchCounts.set(patch.owner, (patchCounts.get(patch.owner) ?? 0) + 1)
  return createHarmonyProfileView(profile, patchCounts, getPatchOrderViolations(), revision)
}

function sendJson(response: ServerResponse, value: unknown): void {
  response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
  response.end(JSON.stringify(value))
}

function sendError(response: ServerResponse, error: unknown): void {
  response.writeHead(error instanceof RequestBodyTooLargeError
    ? 413
    : error instanceof HarmonyProfileConflictError ? 409 : 500, {
    'content-type': 'application/json; charset=utf-8',
  })
  response.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }))
}

function sendAsset(request: IncomingMessage, response: ServerResponse, image: Buffer, contentType: string): void {
  response.writeHead(200, {
    'cache-control': 'public, max-age=3600',
    'content-length': image.length,
    'content-type': contentType,
  })
  response.end(request.method === 'HEAD' ? undefined : image)
}

export async function reloadEntries(
  entries: ReloadableEntry[],
  generation: number,
  invalidatedPackages: Iterable<string> = [],
): Promise<() => Promise<void>> {
  const plans: Array<{ entry: ReloadableEntry; previous: ReloadFiber; previousPlugin: unknown; next: unknown }> = []
  const commonjsPackages = new Map<string, () => void>()
  const commonjsRestores = new Set<() => void>()
  const restoreCommonJS = (): void => {
    const errors = []
    for (const restore of [...commonjsRestores].reverse()) {
      try {
        restore()
      } catch (error) {
        errors.push(error)
      }
    }
    if (errors.length > 0) throw new AggregateError(errors, 'dsh-harmony: CommonJS cache rollback failed')
  }
  try {
    for (const packageName of invalidatedPackages) {
      const prepared = prepareModuleReload(packageName, undefined, commonjsPackages)
      if (prepared !== undefined) commonjsRestores.add(prepared.restore)
    }
    for (const entry of entries) {
      const previous = entry.fiber
      if (previous?.uid == null || previous.runtime === null) continue
      const baseUrl = entry.parent.tree.ctx?.baseUrl
      const prepared = prepareModuleReload(entry.options.name, baseUrl, commonjsPackages)
      if (prepared !== undefined) commonjsRestores.add(prepared.restore)
      const imported = prepared?.load === undefined
        ? await entry.parent.tree.import(`${entry.options.name}?dsh-harmony=${generation}`, entry.getOuterStack)
        : prepared.load()
      const next = entry.loader.unwrapExports(imported)
      plans.push({ entry, previous, previousPlugin: previous.runtime.callback, next })
    }
  } catch (error) {
    try {
      restoreCommonJS()
    } catch (rollbackError) {
      throw new AggregateError([error, rollbackError], 'dsh-harmony: loader rollback failed')
    }
    throw error
  }

  const restore = async (touched: typeof plans): Promise<void> => {
    const rollbackErrors = []
    try {
      restoreCommonJS()
    } catch (rollbackError) {
      rollbackErrors.push(rollbackError)
    }
    for (const plan of [...touched].reverse()) {
      try {
        if (plan.entry.fiber?.runtime?.callback === plan.previousPlugin) continue
        if (plan.entry.fiber !== undefined) await plan.entry._dispose()
        if (plan.entry.fiber === undefined) await plan.entry._start(plan.previousPlugin)
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError)
      }
    }
    if (rollbackErrors.length > 0) throw new AggregateError(rollbackErrors, 'dsh-harmony: loader rollback failed')
  }

  const touched = []
  try {
    for (const plan of plans) {
      touched.push(plan)
      await plan.entry._dispose(plan.previous)
      await plan.entry._start(plan.next)
      recordEntryLoad({
        id: plan.entry.id ?? plan.entry.options.name,
        name: plan.entry.options.name,
        entryInject: plan.entry.fiber?.inject ?? plan.entry.options.inject,
        plugin: plan.next,
        generation,
      })
    }
  } catch (error) {
    try {
      await restore(touched)
    } catch (rollbackError) {
      throw new AggregateError([error, rollbackError], 'dsh-harmony: loader rollback failed')
    }
    throw error
  }
  return () => restore(plans)
}

export async function apply(ctx: Context): Promise<void> {
  if (process.env.DSH_HARMONY_ACTIVE !== '1') return waitForRuntimeChoice(ctx)

  const profileDir = currentProfile().dir
  const sessionProfiles = new HarmonySessionProfileStore(harmonyDataRoot(profileDir))
  const instanceProfileCheck = await sessionProfiles.startInstance(basename(profileDir), currentSessionPatchProfile())
  if (instanceProfileCheck.state === 'mismatch') {
    const difference = instanceProfileCheck.difference
    ctx.logger.warn?.([
      `dsh-harmony: instance Patch profile changed from ${JSON.stringify(instanceProfileCheck.recorded.profile)} to ${JSON.stringify(instanceProfileCheck.current.profile)}`,
      difference.missing.length === 0 ? undefined : `missing: ${difference.missing.join(', ')}`,
      difference.added.length === 0 ? undefined : `added: ${difference.added.join(', ')}`,
      difference.changed.length === 0 ? undefined : `changed: ${difference.changed.join(', ')}`,
      difference.reordered ? 'application order changed' : undefined,
    ].filter(Boolean).join('; '))
  }
  ctx.on('session/created', (session: Session) => {
    void sessionProfiles.bind(session.id, currentSessionPatchProfile())
      .catch(error => ctx.logger.error(error))
  })
  ctx.on('session/flush', () => sessionProfiles.flush())
  const pendingHost = new Set<string>()
  const pendingClient = new Set<string>()
  let pendingGeneration = 0
  let clientModules: ClientModuleRegistry | undefined
  let queued = false
  let syncQueued = false
  let stopped = false
  let syncImmediate: NodeJS.Immediate | undefined
  let inventoryTimeout: NodeJS.Timeout | undefined
  let observedLoaderInventory = ''
  let reloadImmediate: NodeJS.Immediate | undefined
  let updateTail = Promise.resolve()
  const reloadingEntries = new Set<object>()
  const selfEntry = (ctx as Context & { fiber?: { entry?: object } }).fiber?.entry
  const selfPackage = selfEntry === undefined
    ? HARMONY_PLUGIN
    : packageNameOf((selfEntry as ReloadableEntry).options.name) ?? HARMONY_PLUGIN
  let warnedCompatibility = new Set<string>()
  let patchFailures = new Map<string, string>()
  let patchWarnings = new Map<string, string>()
  let reloadSequence = 0
  let reloadStatus: HarmonyReloadStatus = { sequence: 0, state: 'idle' }
  let profileRevision = 0
  let profileText: string | undefined
  const logPerformance = process.env.DSH_HARMONY_PERF === '1'
  const readProfileText = (): string | undefined => {
    try {
      return readFileSync(join(profileDir, HARMONY_STATE_FILE), 'utf8')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
      throw error
    }
  }
  const reconcileProfileRevision = (): void => {
    const next = readProfileText()
    if (next === profileText) return
    profileText = next
    profileRevision += 1
  }

  const startLoadProbe = (operation: HarmonyLoadProbe['operation']): HarmonyLoadProbe | undefined => {
    const startup = operation === 'startup' ? consumeStartupPerformance() : undefined
    if (!logPerformance && !loadPerformanceChannel.hasSubscribers) return undefined
    return {
      operation,
      started: startup?.started ?? process.hrtime.bigint(),
      prepareMs: startup?.prepareMs ?? 0,
      transformMs: startup?.transformMs ?? 0,
      hostReloadMs: 0,
      clientRebuildMs: 0,
      targetPackages: startup?.targetPackages,
      targetFiles: startup?.targetFiles,
    }
  }

  const finishLoadProbe = (
    probe: HarmonyLoadProbe | undefined,
    transaction: ProfileTransaction | undefined,
    status: HarmonyLoadPerformance['status'],
    error?: unknown,
  ): void => {
    if (probe === undefined) return
    const record: HarmonyLoadPerformance = {
      operation: probe.operation,
      generation: transaction?.generation,
      status,
      targetPackages: probe.targetPackages ?? transaction?.targets.size ?? 0,
      targetFiles: probe.targetFiles ?? (transaction === undefined
        ? 0
        : [...transaction.targets.values()].reduce((count, files) => count + files.size, 0)),
      prepareMs: probe.prepareMs,
      transformMs: probe.transformMs,
      hostReloadMs: probe.hostReloadMs,
      clientRebuildMs: probe.clientRebuildMs,
      totalMs: elapsedMilliseconds(probe.started),
      ...(error === undefined ? {} : { error: error instanceof Error ? error.message : String(error) }),
    }
    loadPerformanceChannel.publish(record)
    if (logPerformance) process.stderr.write(`dsh-harmony: performance ${JSON.stringify(record)}\n`)
  }

  const warnCompatibility = (profile: ProfileTransaction['profile']): void => {
    const next = new Set<string>()
    for (const item of profile.compatibility) {
      if (item.kind === 'integration') continue
      const key = JSON.stringify(item)
      next.add(key)
      if (warnedCompatibility.has(key)) continue
      ctx.logger.warn?.(item.kind === 'conflict'
        ? `dsh-harmony: ${item.left.package}@${item.left.version} conflicts with ${item.right.package}@${item.right.version}; both remain enabled`
        : `dsh-harmony: ${item.owner.package}@${item.owner.version} requires ${item.target.package}@${item.target.range} (${item.reason})`)
    }
    warnedCompatibility = next
  }

  const warnPatchStatuses = (): void => {
    const patches = getPatchStatuses()
    const warnings = patches.filter(patch => patch.warnings !== undefined)
    const nextWarnings = new Map(warnings.map(patch => [patch.key, patch.warnings!.join('; ')]))
    for (const patch of warnings) {
      if (patchWarnings.get(patch.key) === nextWarnings.get(patch.key)) continue
      ctx.logger.warn?.(`dsh-harmony: Patch ${JSON.stringify(patch.key)} compatibility warning: ${nextWarnings.get(patch.key)}; application continues`)
    }
    patchWarnings = nextWarnings
    const failures = patches.filter(patch => patch.state === 'failed')
    const next = new Map(failures.map(patch => [patch.key, patch.error ?? 'unknown error']))
    for (const patch of failures) {
      if (patchFailures.get(patch.key) === next.get(patch.key)) continue
      ctx.logger.warn?.(`dsh-harmony: skipped Patch ${JSON.stringify(patch.key)}: ${patch.error ?? 'unknown error'}`)
    }
    patchFailures = next
  }

  const enqueueUpdate = <T>(task: () => Promise<T>): Promise<T> => {
    if (stopped) return Promise.reject(new Error('dsh-harmony: runtime is stopping'))
    const result = updateTail.then(async () => {
      if (stopped) throw new Error('dsh-harmony: runtime is stopping')
      const sequence = ++reloadSequence
      reloadStatus = { sequence, state: 'reloading' }
      try {
        const value = await task()
        reloadStatus = { sequence, state: 'succeeded' }
        return value
      } catch (error) {
        reloadStatus = {
          sequence,
          state: 'failed',
          error: error instanceof Error ? error.message : String(error),
        }
        throw error
      }
    })
    updateTail = result.then(() => undefined, () => undefined)
    return result
  }

  const hostPackages = (targets: PatchTargets, action?: ReloadAction): Set<string> => dependentPackages([
    ...(action?.host ?? []),
    ...[...targets].filter(([, files]) => [...files].some(file => file !== 'lib/client.js')).map(([name]) => name),
  ])
  const hostEntries = (packages: ReadonlySet<string>): ReloadableEntry[] => [...ctx.loader.entries()].filter((entry) => {
    if (entry === selfEntry) return false
    const packageName = packageNameOf(entry.options.name)
    return packageName !== undefined && packages.has(packageName)
  }) as unknown as ReloadableEntry[]
  const assertNoSelfHostReload = (packages: ReadonlySet<string>): void => {
    if (packages.has(selfPackage)) {
      throw new Error(`dsh-harmony: reloading ${JSON.stringify(selfPackage)} inside its own runtime is unsafe; restart DSH to apply this change`)
    }
  }
  const reload = async (
    entries: ReloadableEntry[],
    nextGeneration: number,
    invalidatedPackages: Iterable<string> = [],
  ): Promise<() => Promise<void>> => {
    for (const entry of entries) reloadingEntries.add(entry)
    try {
      const restore = await reloadEntries(entries, nextGeneration, invalidatedPackages)
      return async () => {
        for (const entry of entries) reloadingEntries.add(entry)
        try {
          await restore()
        } finally {
          for (const entry of entries) reloadingEntries.delete(entry)
        }
      }
    } finally {
      for (const entry of entries) reloadingEntries.delete(entry)
    }
  }
  const applyTransaction = async (
    transaction: ProfileTransaction,
    probe?: HarmonyLoadProbe,
    action?: ReloadAction,
  ): Promise<void> => {
    let restoreEntries: (() => Promise<void>) | undefined
    const rebuiltClients: string[] = []
    const modules = clientModules
    let failure: unknown
    try {
      if (transaction.targets.size === 0 && action === undefined) {
        await transaction.commit()
        warnCompatibility(transaction.profile)
        warnPatchStatuses()
        return
      }
      const packages = hostPackages(transaction.targets, action)
      assertNoSelfHostReload(packages)
      const transformStarted = probe === undefined ? undefined : process.hrtime.bigint()
      try {
        await inspectPatchTargetsAsync()
      } finally {
        if (probe !== undefined && transformStarted !== undefined) probe.transformMs += elapsedMilliseconds(transformStarted)
      }
      const hostReloadStarted = probe === undefined ? undefined : process.hrtime.bigint()
      try {
        restoreEntries = await reload(hostEntries(packages), transaction.generation, packages)
      } finally {
        if (probe !== undefined && hostReloadStarted !== undefined) probe.hostReloadMs = elapsedMilliseconds(hostReloadStarted)
      }
      const clientRebuildStarted = probe === undefined ? undefined : process.hrtime.bigint()
      try {
        const clientPackages = new Set(action?.client)
        for (const [packageName, files] of transaction.targets) {
          if (files.has('lib/client.js')) clientPackages.add(packageName)
        }
        for (const packageName of clientPackages) {
          if (modules === undefined) continue
          rebuiltClients.push(packageName)
          modules.rebuilt(packageName)
        }
      } finally {
        if (probe !== undefined && clientRebuildStarted !== undefined) {
          probe.clientRebuildMs = elapsedMilliseconds(clientRebuildStarted)
        }
      }
      await transaction.commit()
      warnCompatibility(transaction.profile)
      warnPatchStatuses()
    } catch (error) {
      failure = error
      const rollbackErrors = []
      try {
        await restoreEntries?.()
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError)
      }
      try {
        transaction.rollback()
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError)
      }
      for (const packageName of rebuiltClients.reverse()) {
        try {
          modules?.rebuilt(packageName)
        } catch (rollbackError) {
          rollbackErrors.push(rollbackError)
        }
      }
      if (rollbackErrors.length > 0) throw new AggregateError([error, ...rollbackErrors], 'dsh-harmony: transaction rollback failed')
      throw error
    } finally {
      finishLoadProbe(probe, transaction, failure === undefined ? 'succeeded' : 'failed', failure)
    }
  }

  const runTransaction = async (
    operation: HarmonyLoadProbe['operation'],
    prepare: () => ProfileTransaction,
    action?: ReloadAction,
  ): Promise<ProfileTransaction> => {
    const probe = startLoadProbe(operation)
    const prepareStarted = probe === undefined ? undefined : process.hrtime.bigint()
    let transaction: ProfileTransaction | undefined
    try {
      transaction = prepare()
    } catch (error) {
      if (probe !== undefined && prepareStarted !== undefined) probe.prepareMs += elapsedMilliseconds(prepareStarted)
      finishLoadProbe(probe, undefined, 'failed', error)
      throw error
    }
    if (probe !== undefined && prepareStarted !== undefined) probe.prepareMs += elapsedMilliseconds(prepareStarted)
    await applyTransaction(transaction, probe, action)
    return transaction
  }

  const refreshPatches = (
    force = true,
    reload?: string,
    preparedInventory?: ReturnType<typeof loaderInventory>,
  ): Promise<void> => enqueueUpdate(async () => {
    const action = reload === undefined ? undefined : {
      host: new Set([reload]),
      client: new Set([reload]),
    }
    const inventory = preparedInventory ?? loaderInventory(ctx)
    await runTransaction(reload === undefined ? 'plugin-update' : 'manual-reload', () => (
      beginPluginUpdate(force, inventory.active, inventory.packages)
    ), action)
    reconcileProfileRevision()
  })

  const reconcileStartup = (): Promise<void> => enqueueUpdate(async () => {
    const probe = startLoadProbe('startup')
    const prepareStarted = probe === undefined ? undefined : process.hrtime.bigint()
    let transaction: ProfileTransaction | undefined
    let failure: unknown
    try {
      const inventory = loaderInventory(ctx)
      observedLoaderInventory = loaderInventoryFingerprint(inventory)
      transaction = beginStartupUpdate(inventory.active)
      if (probe !== undefined && prepareStarted !== undefined) probe.prepareMs += elapsedMilliseconds(prepareStarted)
      const transformStarted = probe === undefined ? undefined : process.hrtime.bigint()
      const inspections = await inspectUnresolvedPatchTargetsAsync()
      if (probe !== undefined) {
        if (transformStarted !== undefined) probe.transformMs += elapsedMilliseconds(transformStarted)
        probe.targetPackages = new Set(inspections.map(item => item.package)).size
        probe.targetFiles = inspections.length
      }
      await transaction.commit()
      warnCompatibility(transaction.profile)
      warnPatchStatuses()
    } catch (error) {
      failure = error
      if (probe !== undefined && prepareStarted !== undefined && transaction === undefined) {
        probe.prepareMs += elapsedMilliseconds(prepareStarted)
      }
      transaction?.rollback()
      throw error
    } finally {
      finishLoadProbe(probe, transaction, failure === undefined ? 'succeeded' : 'failed', failure)
    }
  })

  const updateProfile = async (input: () => HarmonyProfileUpdate): Promise<HarmonyRuntimeProfileUpdateResult> => {
    const generation = await enqueueUpdate(async () => {
      const transaction = await runTransaction('profile-update', () => {
        const requested = input()
        const candidate = prepareHarmonyProfileUpdate(currentProfile(), requested)
        if (requested.expectedRevision !== undefined && requested.expectedRevision !== profileRevision) {
          throw new HarmonyProfileConflictError(requested.expectedRevision, profileRevision)
        }
        return beginProfileUpdate({
          ...(requested.workerThreads === undefined ? {} : { workerThreads: candidate.workerThreads }),
          ...(requested.order === undefined ? {} : { order: candidate.order }),
          ...(requested.patchOrder === undefined ? {} : { patchOrder: candidate.patchOrder }),
          ...(requested.disabled === undefined ? {} : { disabled: candidate.disabled }),
        })
      })
      reconcileProfileRevision()
      return transaction.generation
    })
    return {
      mode: 'live',
      profile: profileView(profileRevision),
      generation,
      reload: { ...reloadStatus },
    }
  }

  const updatePatch = async (input: { key?: string; owner?: string; enabled?: unknown }) => {
    const { key, owner, enabled } = input
    if (typeof enabled !== 'boolean' || (key === undefined) === (owner === undefined)) {
      throw new TypeError('dsh-harmony: patch update requires enabled and exactly one of key or owner')
    }
    const patches = getPatchStatuses()
    if (key !== undefined && !patches.some(patch => patch.key === key)) {
      throw new Error(`dsh-harmony: unknown Patch ${JSON.stringify(key)}`)
    }
    if (owner !== undefined && !patches.some(patch => patch.owner === owner)) {
      throw new Error(`dsh-harmony: unknown Provider ${JSON.stringify(owner)}`)
    }
    const result = await updateProfile(() => {
      const disabled = new Set(currentProfile().disabled)
      if (owner !== undefined) {
        const providerKey = `${owner}/*`
        if (enabled) disabled.delete(providerKey)
        else disabled.add(providerKey)
      } else {
        if (enabled) disabled.delete(key!)
        else disabled.add(key!)
      }
      return { disabled: [...disabled] }
    })
    return { result, patches: getPatchStatuses() }
  }

  const operations = {
    status: () => ({
      profile: profileView(profileRevision),
      patches: getPatchStatuses(),
      reload: { ...reloadStatus },
    }),
    updateProfile: (input: HarmonyProfileUpdate) => updateProfile(() => input),
    updatePatch,
    inspect: (input: { package?: string; file?: string } = {}) => ({
      patches: getPatchStatuses(),
      targets: getPatchInspections(input.package, input.file),
      loadPlan: getLoadPlan(),
    }),
    reload: async (provider?: string) => {
      if (provider === selfPackage) {
        throw new Error(`dsh-harmony: reloading ${JSON.stringify(selfPackage)} inside its own runtime is unsafe; restart DSH instead`)
      }
      if (provider !== undefined && !currentProfile().plugins.some(plugin => plugin.name === provider)) {
        throw new Error(`dsh-harmony: unknown plugin ${JSON.stringify(provider)}`)
      }
      await refreshPatches(true, provider)
      return operations.status()
    },
  }

  await reconcileStartup()
  profileText = readProfileText()
  ctx.effect(() => async () => {
    stopped = true
    if (syncImmediate !== undefined) clearImmediate(syncImmediate)
    if (inventoryTimeout !== undefined) clearTimeout(inventoryTimeout)
    if (reloadImmediate !== undefined) clearImmediate(reloadImmediate)
    syncImmediate = undefined
    inventoryTimeout = undefined
    reloadImmediate = undefined
    syncQueued = false
    queued = false
    pendingClient.clear()
    pendingHost.clear()
    await updateTail
  }, 'dsh-harmony: runtime updates')
  registerActiveRuntimeRoute(ctx, () => reloadStatus)

  ctx.inject(['clientModules'], (clientCtx) => {
    clientModules = clientCtx.clientModules
    return () => { clientModules = undefined }
  })

  ctx.provide('harmony', {
    profile: () => profileView(profileRevision),
    loadPlan: getLoadPlan,
    updateProfile: operations.updateProfile,
    inspect: operations.inspect,
  })

  const controlToken = randomBytes(32).toString('hex')
  const controlServer = createServer((request, response) => {
    void (async () => {
      if (request.headers.authorization !== `Bearer ${controlToken}`) {
        response.writeHead(401)
        response.end()
        return
      }
      const path = new URL(request.url ?? '/', 'http://localhost').pathname
      if (path === '/dsh-harmony/status' && request.method === 'GET') {
        return sendJson(response, operations.status())
      }
      if (path === '/dsh-harmony/profile' && request.method === 'POST') {
        const input = await readJson<HarmonyProfileUpdate>(request)
        return sendJson(response, await operations.updateProfile(input))
      }
      if (path === '/dsh-harmony/patches' && request.method === 'POST') {
        return sendJson(response, await operations.updatePatch(await readJson<{
          key?: string
          owner?: string
          enabled?: unknown
        }>(request)))
      }
      if (path === '/dsh-harmony/reload' && request.method === 'POST') {
        const { provider } = await readJson<{ provider?: unknown }>(request)
        if (provider !== undefined && typeof provider !== 'string') {
          throw new TypeError('dsh-harmony: reload provider must be a string')
        }
        return sendJson(response, await operations.reload(provider))
      }
      if (path === '/dsh-harmony/inspect' && request.method === 'GET') {
        const url = new URL(request.url ?? '/', 'http://localhost')
        return sendJson(response, operations.inspect({
          package: url.searchParams.get('package') ?? undefined,
          file: url.searchParams.get('file') ?? undefined,
        }))
      }
      if (path === '/dsh-harmony/session-profile' && request.method === 'GET') {
        const url = new URL(request.url ?? '/', 'http://localhost')
        const sessionId = url.searchParams.get('sessionId')
        if (sessionId === null || sessionId.length === 0) throw new TypeError('dsh-harmony: sessionId is required')
        return sendJson(response, sessionProfiles.check(sessionId, currentSessionPatchProfile()))
      }
      if (path === '/dsh-harmony/instance-profile' && request.method === 'GET') {
        return sendJson(response, instanceProfileCheck)
      }
      response.writeHead(404)
      response.end()
    })().catch(error => sendError(response, error))
  })
  controlServer.unref()
  let disposeRuntimeAddress: (() => void) | undefined
  const controlReady = new Promise<void>((resolve, reject) => {
    controlServer.once('error', reject)
    controlServer.listen(0, '127.0.0.1', () => {
      controlServer.off('error', reject)
      try {
        const port = (controlServer.address() as AddressInfo).port
        disposeRuntimeAddress = publishRuntimeAddress(profileDir, `http://127.0.0.1:${port}`, controlToken)
        resolve()
      } catch (error) {
        reject(error)
      }
    })
  })
  ctx.effect(() => async () => {
    disposeRuntimeAddress?.()
    if (!controlServer.listening) return
    await new Promise<void>((resolve, reject) => controlServer.close(error => error ? reject(error) : resolve()))
  }, 'dsh-harmony: runtime control')

  ctx.inject(['webServer'], (webCtx) => {
    const dispose = [webCtx.webServer.register({
      kind: 'exact',
      path: '/dsh-harmony/profile',
      async handler(request: IncomingMessage, response: ServerResponse) {
        if (request.method === 'GET') return sendJson(response, profileView(profileRevision))
        if (request.method === 'POST') {
          try {
            const input = await readJson(request) as HarmonyProfileUpdate
            const result = await operations.updateProfile(input)
            return sendJson(response, result.profile)
          } catch (error) {
            return sendError(response, error)
          }
        }
        response.writeHead(405)
        response.end()
      },
    }), webCtx.webServer.register({
      kind: 'exact',
      path: '/dsh-harmony/patches',
      async handler(request: IncomingMessage, response: ServerResponse) {
        if (request.method === 'GET') return sendJson(response, { patches: getPatchStatuses() })
        if (request.method === 'POST') {
          try {
            const result = await operations.updatePatch(await readJson(request))
            return sendJson(response, { patches: result.patches })
          } catch (error) {
            return sendError(response, error)
          }
        }
        response.writeHead(405)
        response.end()
      },
    }), webCtx.webServer.register({
      kind: 'exact',
      path: '/dsh-harmony/inspect',
      handler(request: IncomingMessage, response: ServerResponse) {
        if (request.method !== 'GET') {
          response.writeHead(405)
          response.end()
          return
        }
        const url = new URL(request.url ?? '/', 'http://localhost')
        const inspection = operations.inspect({
          package: url.searchParams.get('package') ?? undefined,
          file: url.searchParams.get('file') ?? undefined,
        })
        return sendJson(response, {
          inspections: inspection.targets,
          loadPlan: inspection.loadPlan,
        })
      },
    }), webCtx.webServer.register({
      kind: 'exact',
      path: '/dsh-harmony/session-profile',
      handler(request: IncomingMessage, response: ServerResponse) {
        if (request.method !== 'GET') {
          response.writeHead(405)
          response.end()
          return
        }
        try {
          const url = new URL(request.url ?? '/', 'http://localhost')
          const sessionId = url.searchParams.get('sessionId')
          if (sessionId === null || sessionId.length === 0) throw new TypeError('dsh-harmony: sessionId is required')
          return sendJson(response, sessionProfiles.check(sessionId, currentSessionPatchProfile()))
        } catch (error) {
          return sendError(response, error)
        }
      },
    }), webCtx.webServer.register({
      kind: 'exact',
      path: '/dsh-harmony/instance-profile',
      handler(request: IncomingMessage, response: ServerResponse) {
        if (request.method !== 'GET') {
          response.writeHead(405)
          response.end()
          return
        }
        return sendJson(response, instanceProfileCheck)
      },
    })]
    for (const [path, url, contentType] of imageAssets) {
      const image = readFileSync(url)
      dispose.push(webCtx.webServer.register({
        kind: 'exact',
        path,
        handler(request: IncomingMessage, response: ServerResponse) {
          if (request.method === 'GET' || request.method === 'HEAD') return sendAsset(request, response, image, contentType)
          response.writeHead(405)
          response.end()
        },
      }))
    }
    return () => dispose.forEach(stop => stop())
  })

  const synchronizeLoader = (): void => {
    if (stopped || syncQueued) return
    syncQueued = true
    syncImmediate = setImmediate(() => {
      syncImmediate = undefined
      syncQueued = false
      if (stopped) return
      if (readProfileText() === profileText) return
      void refreshPatches(false).catch(error => ctx.logger.error(error))
    })
  }
  const synchronizeLoaderInventory = (): void => {
    if (stopped) return
    if (inventoryTimeout !== undefined) clearTimeout(inventoryTimeout)
    inventoryTimeout = setTimeout(() => {
      inventoryTimeout = undefined
      if (stopped) return
      const inventory = loaderInventory(ctx)
      const fingerprint = loaderInventoryFingerprint(inventory)
      if (fingerprint === observedLoaderInventory) return
      const previous = observedLoaderInventory
      observedLoaderInventory = fingerprint
      void refreshPatches(false, undefined, inventory).catch(error => {
        observedLoaderInventory = previous
        ctx.logger.error(error)
      })
    }, 10)
  }
  ctx.effect(() => watchProfile(synchronizeLoader, (error) => ctx.logger.error(error)), 'dsh-harmony: profile order watch')
  ctx.effect(() => subscribePatchStatuses(warnPatchStatuses), 'dsh-harmony: Patch status warnings')
  ctx.on('loader/config-update', synchronizeLoaderInventory)
  ctx.on('internal/plugin', (fiber: Fiber) => {
    const entry = fiber.entry as undefined | {
      id: string
      options: { name: string; inject?: unknown }
    }
    if (entry !== undefined && fiber.parent.fiber?.entry !== entry) {
      if (fiber.uid === null) removeEntryLoad(entry.id)
      else recordEntryLoad({
        id: entry.id,
        name: entry.options.name,
        entryInject: (fiber as Fiber & { inject?: unknown }).inject ?? entry.options.inject,
        plugin: (fiber as Fiber & { runtime?: { callback?: unknown } }).runtime?.callback,
      })
    }
    if (fiber.entry === undefined || !reloadingEntries.has(fiber.entry)) synchronizeLoaderInventory()
  })

  ctx.effect(() => subscribe((targets, generation) => {
    if (stopped) return
    pendingGeneration = generation
    for (const [target, files] of targets) {
      if (files.has('lib/client.js')) pendingClient.add(target)
      if ([...files].some(file => file !== 'lib/client.js')) pendingHost.add(target)
    }
    if (queued) return
    queued = true
    reloadImmediate = setImmediate(() => {
      reloadImmediate = undefined
      if (stopped) return
      void enqueueUpdate(async () => {
        queued = false
        const clientTargets = [...pendingClient]
        const hostTargets = new Set(pendingHost)
        const generation = pendingGeneration
        pendingClient.clear()
        pendingHost.clear()
        if (hostTargets.has(selfPackage)) {
          throw new Error(`dsh-harmony: reloading ${JSON.stringify(selfPackage)} inside its own runtime is unsafe; restart DSH to apply this change`)
        }
        const entries = [...ctx.loader.entries()].filter((entry) => {
          if (entry === selfEntry) return false
          const packageName = packageNameOf(entry.options.name)
          return packageName !== undefined && hostTargets.has(packageName)
        }) as unknown as ReloadableEntry[]
        await reload(entries, generation)
        for (const target of clientTargets) clientModules?.rebuilt(target)
      }).catch(error => ctx.logger.error(error))
    })
  }), 'dsh-harmony: patch reload')
  await controlReady
}

export const inject = ['appExit']
