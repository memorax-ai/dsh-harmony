import { channel } from 'node:diagnostics_channel'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { configuredProfileActivation, dshEntry, initProfile, PROFILE_TEMPLATES } from './dsh.js'
import {
  discoverProfile,
  inspectPatchTargetsAsync,
  installFileTransforms,
  installModuleHooks,
  recordStartupPerformance,
} from './runtime.js'

const loadPerformanceChannel = channel('dsh-harmony:load')

function elapsedMilliseconds(started: bigint, finished: bigint): number {
  return Math.round(Number(finished - started) / 1e3) / 1e3
}

function launcherPatchFiles(args: string[]): string[] {
  const patches: string[] = []
  let index = args[0] === 'web' ? 1 : 0
  while (index < args.length) {
    const argument = args[index]!
    if (argument === '--patch') {
      if (args[index + 1] !== undefined) patches.push(args[index + 1]!)
      index += 2
      continue
    }
    if (argument.startsWith('--patch=')) {
      patches.push(argument.slice('--patch='.length))
      index += 1
      continue
    }
    if (argument === '--profile') {
      index += 2
      continue
    }
    if (argument.startsWith('--profile=') || argument === '--dump-config' || argument === '--dump-default-config') {
      index += 1
      continue
    }
    break
  }
  return patches
}

export async function launchDsh(args: string[], profile: string | undefined, profileDir: string | undefined): Promise<void> {
  const isPluginCommand = args[0] === 'plugin'
  const isDefaultDump = args.includes('--dump-default-config')
  const overlay = join(dirname(dirname(fileURLToPath(import.meta.url))), 'harmony.patch.yml')
  const hasHarmonyBundle = profileDir !== undefined && existsSync(join(profileDir, 'package.json'))
    && (JSON.parse(readFileSync(join(profileDir, 'package.json'), 'utf8')) as {
      dsh?: { profile?: { bundles?: string[] } }
    }).dsh?.profile?.bundles?.includes('dsh-harmony') === true
  const injectHarmony = !isPluginCommand && !isDefaultDump && profile !== undefined && !hasHarmonyBundle

  installModuleHooks()
  installFileTransforms()

  if (!isPluginCommand && profileDir !== undefined && !existsSync(join(profileDir, 'package.json'))
    && profile !== undefined && PROFILE_TEMPLATES[profile] !== undefined) {
    initProfile(profileDir, PROFILE_TEMPLATES[profile])
  }

  let requiredProviderPatches: string[] = []
  if (!isPluginCommand && profileDir !== undefined && existsSync(join(profileDir, 'package.json'))) {
    const measure = process.env.DSH_HARMONY_PERF === '1' || loadPerformanceChannel.hasSubscribers
    const started = measure ? process.hrtime.bigint() : undefined
    const activation = configuredProfileActivation(profile!, profileDir, launcherPatchFiles(args), !isDefaultDump)
    requiredProviderPatches = activation.patches
    discoverProfile(profileDir, injectHarmony, activation.candidates)
    const transformed = measure ? process.hrtime.bigint() : undefined
    const inspections = await inspectPatchTargetsAsync()
    if (started !== undefined && transformed !== undefined) {
      const finished = process.hrtime.bigint()
      recordStartupPerformance({
        started,
        prepareMs: elapsedMilliseconds(started, transformed),
        transformMs: elapsedMilliseconds(transformed, finished),
        targetPackages: new Set(inspections.map(item => item.package)).size,
        targetFiles: inspections.length,
      })
    }
  }

  const harmonyPatches = [
    ...requiredProviderPatches,
    ...(injectHarmony ? [overlay] : []),
  ]
  if (harmonyPatches.length > 0) {
    const index = args[0] === 'web' ? 3 : 2
    process.argv.splice(index, 0, ...harmonyPatches.flatMap(patch => ['--patch', patch]))
  }

  await import(pathToFileURL(dshEntry).href)
}
