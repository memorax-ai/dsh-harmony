import { readFileSync } from 'node:fs'
import { createRequire, findPackageJSON } from 'node:module'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import semver from 'semver'
import type { HarmonyPatchTarget } from '../index.js'

export const LEGACY_CLIENT_RANGE = '>=0.1.1-rc.2 <0.1.2-0'
export const LEGACY_SHARED_RANGE = '>=0.1.0-rc.8 <0.1.2-0'
export const DSH_012_RANGE = '>=0.1.2-alpha.4 <0.1.3-0'

export function activeDshVersion(): string {
  const entry = process.env.DSH_HARMONY_ACTIVE_DSH_ENTRY ?? process.env.DSH_HARMONY_DSH_ENTRY
  if (entry !== undefined) {
    const manifestPath = findPackageJSON('@deepseek-ai/dsh', pathToFileURL(resolve(entry)))
    if (manifestPath === undefined) {
      throw new Error('dsh-harmony: cannot locate the active @deepseek-ai/dsh package')
    }
    return (JSON.parse(readFileSync(manifestPath, 'utf8')) as { version: string }).version
  }
  const require = createRequire(__filename)
  return (require('@deepseek-ai/dsh/package.json') as { version: string }).version
}

export function sessionProfileTarget(version: string): HarmonyPatchTarget {
  return semver.gte(version, '0.1.2-0')
    ? {
        package: '@deepseek-ai/dsh-api-session-controller',
        version: DSH_012_RANGE,
        file: 'lib/client.js',
      }
    : {
        package: '@deepseek-ai/dsh-client-runtime',
        version: LEGACY_SHARED_RANGE,
        file: 'lib/client.js',
      }
}
