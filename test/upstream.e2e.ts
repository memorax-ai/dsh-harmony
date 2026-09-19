import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { HarmonyPatchStatus } from '../src/index.ts'

// Set DSH_HARMONY_DSH_ENTRY to test an isolated upstream installation.
const home = mkdtempSync(join(tmpdir(), 'harmony-upstream-'))
const env = { ...process.env, DSH_HOME: home }
const child = spawn(process.execPath, ['lib/bin.js', 'web', '--port', '0', '--no-open'], {
  env, stdio: ['ignore', 'pipe', 'pipe'],
})
let output = ''
try {
  const url = await new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`upstream boot timed out:\n${output}`)), 60_000)
    const read = (chunk: Buffer) => {
      output += chunk
      const match = output.match(/dsh web: (http:\/\/127\.0\.0\.1:\d+)(?:\/\?token=([^\s]+))?/)
      if (!match) return
      clearTimeout(timer)
      resolve(match[1]! + (match[2] ? `/?token=${match[2]}` : '/'))
    }
    child.stdout.on('data', read)
    child.stderr.on('data', read)
    child.once('error', error => { clearTimeout(timer); reject(error) })
    child.once('exit', code => { clearTimeout(timer); reject(new Error(`upstream exited ${code}:\n${output}`)) })
  })
  const api = async (path: string) => {
    const address = new URL(url)
    address.pathname = path
    const response = await fetch(address, { signal: AbortSignal.timeout(15_000) })
    assert.equal(response.status, 200, path)
    return response.json()
  }
  const { patches } = await api('/dsh-harmony/patches') as { patches: HarmonyPatchStatus[] }
  assert.equal(patches.length, 5)
  for (const patch of patches) {
    assert.equal(patch.state, 'bound', JSON.stringify(patch))
    assert.equal(patch.matches, 1, patch.key)
    assert.deepEqual(patch.warnings ?? [], [], patch.key)
  }
  const status = spawnSync(process.execPath, ['lib/bin.js', 'harmony', 'status', '--json'], {
    env, encoding: 'utf8', timeout: 30_000,
  })
  assert.equal(status.status, 0, status.stderr || status.stdout)
  assert.equal(JSON.parse(status.stdout).mode, 'live')
  for (const action of ['disable', 'enable']) {
    const result = spawnSync(process.execPath, ['lib/bin.js', 'harmony', action,
      'dsh-harmony/settings-integration', '--json'], { env, encoding: 'utf8', timeout: 30_000 })
    assert.equal(result.status, 0, result.stderr || result.stdout)
    const current = await api('/dsh-harmony/patches') as { patches: HarmonyPatchStatus[] }
    assert.equal(current.patches.find(patch => patch.id === 'settings-integration')?.state,
      action === 'disable' ? 'disabled' : 'bound')
  }
  console.log('upstream: Web startup, 5 bound patches, live CLI, and client patch disable/enable passed')
} finally {
  if (child.exitCode === null) {
    const exited = new Promise(resolve => child.once('exit', resolve))
    child.kill()
    await exited
  }
  rmSync(home, { recursive: true, force: true })
}
