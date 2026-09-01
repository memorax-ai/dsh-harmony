import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { parse, stringify } from 'yaml'

const SHIM_MARKER = '// dsh-harmony shim'
const BOOTSTRAP_START = '# dsh-harmony bootstrap begin'
const BOOTSTRAP_END = '# dsh-harmony bootstrap end'

interface InstallationPaths {
  command: string
  harmony: string
  official: string
  platform?: NodeJS.Platform
}

interface BootstrapPatchEntry {
  insert?: Array<{ id?: string; name?: string }>
}

function resolveCommandPath(prefix: string, platform: NodeJS.Platform = process.platform): string {
  return platform === 'win32' ? join(prefix, 'dsh') : join(prefix, 'bin/dsh')
}

function resolveGlobalModules(prefix: string, platform: NodeJS.Platform = process.platform): string {
  return platform === 'win32' ? join(prefix, 'node_modules') : join(prefix, 'lib/node_modules')
}

function resolveDshHome(): string {
  const configured = process.env.DSH_HOME?.trim()
  if (configured === undefined || configured === '') return join(homedir(), '.dsh')
  if (configured === '~') return homedir()
  if (configured.startsWith('~/') || configured.startsWith('~\\')) {
    return resolve(homedir(), configured.slice(2))
  }
  return resolve(configured)
}

function shimSource({ harmony, official }: InstallationPaths): string {
  return `#!/usr/bin/env node
${SHIM_MARKER}
const { existsSync } = require('node:fs')
const { pathToFileURL } = require('node:url')

const harmony = ${JSON.stringify(harmony)}
const official = ${JSON.stringify(official)}
const target = existsSync(harmony) ? harmony : official

import(pathToFileURL(target).href).catch(error => {
  console.error(error)
  process.exitCode = 1
})
`
}

function cmdSource(): string {
  return `@ECHO off
SETLOCAL
SET "_prog=%~dp0node.exe"
IF NOT EXIST "%_prog%" SET "_prog=node"
"%_prog%" "%~dp0dsh" %*
EXIT /B %ERRORLEVEL%
`
}

function powershellSource(): string {
  return `#!/usr/bin/env pwsh
$node = Join-Path $PSScriptRoot 'node.exe'
if (-not (Test-Path $node)) { $node = 'node' }
& $node (Join-Path $PSScriptRoot 'dsh') @args
exit $LASTEXITCODE
`
}

function installShim(paths: InstallationPaths): void {
  if (!existsSync(paths.official)) {
    throw new Error('Install @deepseek-ai/dsh globally before installing dsh-harmony')
  }
  const temporary = `${paths.command}.${process.pid}.tmp`
  writeFileSync(temporary, shimSource(paths))
  if ((paths.platform ?? process.platform) !== 'win32') chmodSync(temporary, 0o755)
  renameSync(temporary, paths.command)
  if ((paths.platform ?? process.platform) === 'win32') {
    writeChanged(`${paths.command}.cmd`, cmdSource())
    writeChanged(`${paths.command}.ps1`, powershellSource())
  }
}

function removeBootstrapBlock(source: string): string {
  const start = source.indexOf(BOOTSTRAP_START)
  if (start === -1) return source
  const end = source.indexOf(BOOTSTRAP_END, start)
  if (end === -1) return source
  return `${source.slice(0, start)}${source.slice(end + BOOTSTRAP_END.length)}`.trim()
}

function writeChanged(filename: string, content: string): void {
  if (existsSync(filename) && readFileSync(filename, 'utf8') === content) return
  const temporary = `${filename}.${process.pid}.tmp`
  writeFileSync(temporary, content)
  renameSync(temporary, filename)
}

function ensureBootstrap({ home, ...paths }: InstallationPaths & { home: string }): void {
  const stateDir = join(home, 'node_modules/dsh-harmony-bootstrap')
  const bootstrap = join(stateDir, 'bootstrap.cjs')
  const client = join(stateDir, 'client.js')
  const installation = join(stateDir, 'installation.json')
  const manifest = join(stateDir, 'package.json')
  const patch = join(home, 'cordis.patch.yml')
  mkdirSync(stateDir, { recursive: true })

  const bootstrapSource = readFileSync(join(__dirname, 'bootstrap.cjs'), 'utf8')
  const clientSource = readFileSync(join(__dirname, '../browser-dist/bootstrap-client.js'), 'utf8')
  const restartSource = readFileSync(join(__dirname, 'restart.cjs'), 'utf8')
  writeChanged(bootstrap, bootstrapSource)
  writeChanged(client, clientSource)
  writeChanged(join(stateDir, 'restart.cjs'), restartSource)
  writeChanged(installation, `${JSON.stringify(paths, null, 2)}\n`)
  writeChanged(manifest, `${JSON.stringify({
    name: 'dsh-harmony-bootstrap',
    version: '0.1.0',
    main: './bootstrap.cjs',
    exports: { '.': './bootstrap.cjs', './client': './client.js', './package.json': './package.json' },
    dsh: {
      client: {
        inject: [
          '@deepseek-ai/dsh-client-locale',
          '@deepseek-ai/dsh-client-ui-layout',
        ],
        platform: 'web',
      },
    },
  }, null, 2)}\n`)

  const current = existsSync(patch) ? readFileSync(patch, 'utf8') : '[]\n'
  const cleaned = removeBootstrapBlock(current)
  const value = parse(cleaned || '[]') as unknown
  if (!Array.isArray(value)) throw new Error(`${patch} must contain a top-level YAML array`)
  const entries = value as BootstrapPatchEntry[]
  const firstContent = cleaned.split('\n').find(line => line.trim() !== '' && !line.trim().startsWith('#'))?.trim()
  const existing = entries.length === 0
    ? ''
    : firstContent?.startsWith('-') ? cleaned.trim() : stringify(entries).trim()
  const block = `${BOOTSTRAP_START}\n- insert:\n    - id: harmony-bootstrap\n      name: dsh-harmony-bootstrap\n${BOOTSTRAP_END}`
  writeChanged(patch, `${existing === '' ? '' : `${existing}\n`}${block}\n`)
}

export {
  BOOTSTRAP_END,
  BOOTSTRAP_START,
  SHIM_MARKER,
  ensureBootstrap,
  installShim,
  resolveCommandPath,
  resolveDshHome,
  resolveGlobalModules,
}
