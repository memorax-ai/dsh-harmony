import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

// A linked profile plugin can live outside the native Host resolver's profile scope.
// Only recover missing, explicitly declared Host peers; ordinary dependencies keep Node resolution.
export function missingHostPeerAnchor(
  specifier: string,
  parentUrl: string | undefined,
  plugins: ReadonlyMap<string, string>,
  dshEntry: string | undefined,
): string | undefined {
  if (!specifier.startsWith('@deepseek-ai/') || !parentUrl?.startsWith('file:') || dshEntry === undefined) return
  const name = specifier.split('/').slice(0, 2).join('/')
  let directory = dirname(fileURLToPath(parentUrl))
  const selected = new Set(plugins.values())
  while (true) {
    if (selected.has(directory)) {
      const manifest = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8')) as { peerDependencies?: Record<string, string> }
      if (Object.hasOwn(manifest.peerDependencies ?? {}, name)) return pathToFileURL(dshEntry).href
      return
    }
    // Do not attribute a nested dependency's imports to its containing plugin.
    try { readFileSync(join(directory, 'package.json')); return } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    const parent = dirname(directory)
    if (parent === directory) return
    directory = parent
  }
}
