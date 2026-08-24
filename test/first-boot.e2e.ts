import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const home = mkdtempSync(join(tmpdir(), 'dsh-harmony-first-boot-'))
const child = spawn(process.execPath, ['lib/bin.js', 'web', '--port', '0', '--no-open'], {
  env: { ...process.env, DSH_HOME: home, DSH_HARMONY_PERF: '1' },
  stdio: ['ignore', 'pipe', 'pipe'],
})
let output = ''
try {
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`first boot timed out:\n${output}`)), 30_000)
    const read = (chunk: Buffer) => {
      output += chunk
      if (!output.includes('dsh web: http://127.0.0.1:') || !output.includes('dsh-harmony: performance ')) return
      clearTimeout(timer)
      resolve()
    }
    child.stdout.on('data', read)
    child.stderr.on('data', read)
    child.once('exit', code => {
      clearTimeout(timer)
      reject(new Error(`first boot exited ${code}:\n${output}`))
    })
  })

  assert.match(output, /dsh web: http:\/\/127\.0\.0\.1:/)
  const performanceRecord = output.match(/dsh-harmony: performance (\{[^\n]+\})/)
  assert.ok(performanceRecord)
  const performance = JSON.parse(performanceRecord[1]) as {
    operation: string
    targetPackages: number
    targetFiles: number
    prepareMs: number
    transformMs: number
  }
  assert.equal(performance.operation, 'startup')
  assert.equal(performance.targetPackages, 4)
  assert.equal(performance.targetFiles, 4)
  assert.ok(performance.prepareMs >= 0)
  assert.ok(performance.transformMs >= 0)

  const url = output.match(/dsh web: (http:\/\/127\.0\.0\.1:\d+)/)?.[1]
  assert.ok(url)
  const inspection = await fetch(`${url}/dsh-harmony/inspect`).then(response => response.json() as Promise<{
    inspections: Array<{ package: string; file: string }>
  }>)
  assert.deepEqual(inspection.inspections.map(item => `${item.package}/${item.file}`).sort(), [
    '@deepseek-ai/cordis/lib/index.js',
    '@deepseek-ai/dsh-client-modules/lib/index.js',
    '@deepseek-ai/dsh-client-runtime/lib/client.js',
    '@deepseek-ai/dsh-client-ui-settings-general/lib/client.js',
  ].sort())
} finally {
  if (child.exitCode === null) {
    const exited = new Promise(resolve => child.once('exit', resolve))
    child.kill()
    await exited
  }
  rmSync(home, { recursive: true })
}

const equalsHome = mkdtempSync(join(tmpdir(), 'dsh-harmony-profile-equals-'))
const dump = spawnSync(process.execPath, ['lib/bin.js', '--profile=web', '--dump-config'], {
  encoding: 'utf8',
  env: { ...process.env, DSH_HOME: equalsHome },
})
assert.equal(dump.status, 0, dump.stderr)
assert.match(dump.stdout, /id: harmony\s+name: dsh-harmony/)
rmSync(equalsHome, { recursive: true })

const tuiHome = mkdtempSync(join(tmpdir(), 'dsh-harmony-first-tui-'))
const tui = spawnSync(process.execPath, ['lib/bin.js', 'harmony'], {
  encoding: 'utf8',
  env: { ...process.env, DSH_HOME: tuiHome },
})
assert.notEqual(tui.status, 0)
assert.equal(existsSync(join(tuiHome, 'profiles', 'web', 'package.json')), true)
rmSync(tuiHome, { recursive: true })

const missingProfileHome = mkdtempSync(join(tmpdir(), 'dsh-harmony-missing-profile-'))
const missingProfile = spawnSync(process.execPath, ['lib/bin.js', 'harmony', '--profile'], {
  encoding: 'utf8',
  env: { ...process.env, DSH_HOME: missingProfileHome, LC_ALL: 'zh_CN.UTF-8' },
})
assert.notEqual(missingProfile.status, 0)
assert.match(missingProfile.stderr, /错误: 选项 '--profile <name>' 缺少参数/)
assert.equal(existsSync(join(missingProfileHome, 'profiles', 'web', 'package.json')), false)
rmSync(missingProfileHome, { recursive: true })
