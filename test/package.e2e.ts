import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { satisfies } from 'semver'

const root = mkdtempSync(join(tmpdir(), 'dsh-harmony-package-'))
const prefix = join(root, 'prefix')
const home = join(root, 'home')
const npmCli = process.env.npm_execpath ?? (() => {
  throw new Error('npm_execpath is required; run this test through npm')
})()
const binDir = process.platform === 'win32' ? prefix : join(prefix, 'bin')
const dsh = process.platform === 'win32' ? join(prefix, 'dsh') : join(binDir, 'dsh')
const manifest = JSON.parse(readFileSync('package.json', 'utf8')) as {
  name: string
  version: string
  devDependencies: Record<string, string>
}
const tarball = join(root, `${manifest.name}-${manifest.version}.tgz`)
const testedDshVersion = manifest.devDependencies['@deepseek-ai/dsh']!

function run(command: string, args: string[], env: NodeJS.ProcessEnv = process.env): string {
  const result = spawnSync(command, args, { cwd: resolve('.'), encoding: 'utf8', env })
  assert.equal(result.status, 0, `${command} ${args.join(' ')}\n${result.error ?? ''}${result.stdout}${result.stderr}`)
  return result.stdout
}

function runNpm(args: string[], env: NodeJS.ProcessEnv = process.env): string {
  return run(process.execPath, [npmCli, ...args], env)
}

function runDsh(args: string[], env: NodeJS.ProcessEnv): string {
  return process.platform === 'win32'
    ? run(process.execPath, [dsh, ...args], env)
    : run(dsh, args, env)
}

try {
  runNpm(['pack', '--pack-destination', root])
  assert.equal(existsSync(tarball), true)
  const installEnv = {
    ...process.env,
    DSH_HOME: home,
  }
  runNpm(['install', '--global', '--prefix', prefix, `@deepseek-ai/dsh@${testedDshVersion}`], installEnv)
  runNpm(['install', '--global', '--prefix', prefix, tarball], installEnv)

  const env = {
    ...installEnv,
    PATH: `${binDir}${delimiter}${process.env.PATH ?? ''}`,
  }
  const dshVersion = runDsh(['--version'], env).match(/\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?/)?.[0]
  assert.ok(dshVersion)
  assert.equal(satisfies(dshVersion, testedDshVersion), true)
  const config = runDsh(['web', '--dump-config'], env)
  assert.match(config, /dsh-harmony-bootstrap/)
  assert.match(config, /id: harmony\s+name: dsh-harmony/)
  assert.match(config, /id: harmony-settings\s+name: dsh-harmony\/settings/)
} finally {
  rmSync(root, { recursive: true })
}
