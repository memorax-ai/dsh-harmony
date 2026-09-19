import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { expect, test } from 'vitest'
import { missingHostPeerAnchor } from './peer-resolution.js'

test('missing Host peers resolve from the selected DSH only for declared profile plugins', () => {
  const root = mkdtempSync(join(tmpdir(), 'harmony-peer-'))
  try {
    const plugin = join(root, 'linked-plugin')
    mkdirSync(join(plugin, 'lib'), { recursive: true })
    writeFileSync(join(plugin, 'package.json'), JSON.stringify({ peerDependencies: { '@deepseek-ai/cordis': '*' } }))
    const selected = new Map([['linked-plugin', plugin]])
    const parent = pathToFileURL(join(plugin, 'lib/index.js')).href
    const entry = join(root, 'upstream/bin.js')
    expect(missingHostPeerAnchor('@deepseek-ai/cordis', parent, selected, entry)).toBe(pathToFileURL(entry).href)
    expect(missingHostPeerAnchor('@deepseek-ai/cordis/subpath', parent, selected, entry)).toBe(pathToFileURL(entry).href)
    expect(missingHostPeerAnchor('@deepseek-ai/unlisted', parent, selected, entry)).toBeUndefined()
    expect(missingHostPeerAnchor('other', parent, selected, entry)).toBeUndefined()
    expect(missingHostPeerAnchor('@deepseek-ai/cordis', parent, new Map(), entry)).toBeUndefined()
    expect(missingHostPeerAnchor('@deepseek-ai/cordis', parent, selected, undefined)).toBeUndefined()
    const nested = join(plugin, 'node_modules/nested')
    mkdirSync(nested, { recursive: true })
    writeFileSync(join(nested, 'package.json'), '{}')
    expect(missingHostPeerAnchor('@deepseek-ai/cordis', pathToFileURL(join(nested, 'index.js')).href, selected, entry)).toBeUndefined()
  } finally { rmSync(root, { recursive: true, force: true }) }
})
