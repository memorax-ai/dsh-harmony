import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { createInterface } from 'node:readline/promises'
import { fileURLToPath } from 'node:url'
import type { AppExit } from '@deepseek-ai/dsh-cmdline'
import type { WebServer } from '@deepseek-ai/dsh-host-webserver'
import type { Context } from '@deepseek-ai/cordis'
import { readJson, RequestBodyTooLargeError } from './http.js'
import { terminalLocale, terminalText } from './locale.js'

type RuntimeAction = 'install' | 'install-restart' | 'remove' | 'ignore'
type RuntimeState = 'missing' | 'desktop-inactive' | 'working' | 'installed' | 'removed' | 'ignored' | 'error'

interface RuntimeStatus {
  state: RuntimeState
  bootId: number
  error?: string
}

interface ActionResult {
  restartCommand?: string
}

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const restartScript = join(packageRoot, 'scripts/restart.cjs')
const manifest = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8')) as { name: string; version: string }
const packageName = manifest.name
const packageSpec = `${manifest.name}@${manifest.version}`
const require = createRequire(import.meta.url)
const locale = terminalLocale()
const text = (english: string, chinese: string): string => terminalText(locale, english, chinese)
const { resolveCommandPath } = require('../scripts/install-shim.cjs') as {
  resolveCommandPath(prefix: string, platform?: NodeJS.Platform): string
}

function sendJson(response: ServerResponse, value: unknown, status = 200): void {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  response.end(JSON.stringify(value))
}

function run(command: string, args: string[], inherit = false): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: inherit ? 'inherit' : ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout?.on('data', chunk => { stdout += chunk })
    child.stderr?.on('data', chunk => { stderr += chunk })
    child.once('error', reject)
    child.once('exit', (code) => {
      if (code === 0) resolve(stdout.trim())
      else reject(new Error(stderr.trim() || `${command} exited with code ${code}`))
    })
  })
}

function runNpm(args: string[], inherit = false): Promise<string> {
  if (process.platform !== 'win32') return run('npm', args, inherit)
  return run(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', `npm.cmd ${args.join(' ')}`], inherit)
}

function invocationProfile(): string {
  const args = process.argv.slice(2)
  if (args[0] === 'web') return 'web'
  const option = args.findIndex(arg => arg === '--profile' || arg.startsWith('--profile='))
  if (option === -1) throw new Error(text(
    'Cannot remove dsh-harmony without a profile name',
    '缺少 profile 名称，无法移除 dsh-harmony',
  ))
  return args[option] === '--profile' ? args[option + 1]! : args[option]!.slice('--profile='.length)
}

function webInvocation(): boolean {
  const args = process.argv.slice(2)
  if (args[0] === 'web') return true
  const option = args.findIndex(arg => arg === '--profile' || arg.startsWith('--profile='))
  const profile = option === -1 ? undefined
    : args[option] === '--profile' ? args[option + 1] : args[option]!.slice('--profile='.length)
  return profile === 'web'
}

async function installRuntime(): Promise<string> {
  await runNpm(['install', '--global', packageSpec], process.stdin.isTTY)
  const prefix = await runNpm(['prefix', '--global'])
  return resolveCommandPath(prefix)
}

async function removePlugin(): Promise<void> {
  await run(process.execPath, [process.argv[1]!, 'plugin', '--profile', invocationProfile(), 'remove', packageName], process.stdin.isTTY)
}

function restart(ctx: Context, command: string): void {
  if (ctx.appExit === undefined) throw new Error('dsh-harmony: appExit service is unavailable')
  const helper = spawn(process.execPath, [
    restartScript,
    String(process.pid),
    command,
    JSON.stringify(process.argv.slice(2)),
  ], { detached: true, env: process.env, stdio: 'inherit' })
  helper.unref()
  ctx.appExit(0)
}

async function terminalChoice(): Promise<RuntimeAction> {
  const input = createInterface({ input: process.stdin, output: process.stdout })
  try {
    process.stdout.write(`\n${text(
      'dsh-harmony is installed as a plugin, but its launcher is not active.',
      'dsh-harmony 已作为插件安装，但启动器尚未启用。',
    )}\n`)
    process.stdout.write(text(
      '  1. Install\n  2. Install and restart\n  3. Remove plugin\n  4. Ignore once\n',
      '  1. 安装\n  2. 安装并重启\n  3. 移除插件\n  4. 本次忽略\n',
    ))
    while (true) {
      const answer = (await input.question(text('Choose [1-4]: ', '请选择 [1-4]：'))).trim()
      const action = ({ 1: 'install', 2: 'install-restart', 3: 'remove', 4: 'ignore' } as Record<string, RuntimeAction>)[answer]
      if (action !== undefined) return action
    }
  } finally {
    input.close()
  }
}

export async function waitForRuntimeChoice(ctx: Context): Promise<void> {
  if (process.env.DSH_HARMONY_IGNORE_ONCE === '1') return
  if (ctx.appExit === undefined) throw new Error('dsh-harmony: appExit service is unavailable')
  const appExit = ctx.appExit

  const desktopInactive = process.env.DSH_DESKTOP === '1'
  let status: RuntimeStatus = { state: desktopInactive ? 'desktop-inactive' : 'missing', bootId: process.pid }
  let finish!: () => void
  const choice = new Promise<void>(resolve => { finish = resolve })

  const act = async (action: RuntimeAction): Promise<ActionResult> => {
    status = { state: 'working', bootId: process.pid }
    try {
      if (action === 'ignore') {
        process.env.DSH_HARMONY_IGNORE_ONCE = '1'
        status = { state: 'ignored', bootId: process.pid }
        finish()
        return {}
      }
      if (action === 'remove') {
        await removePlugin()
        status = { state: 'removed', bootId: process.pid }
        return {}
      }
      const command = await installRuntime()
      status = { state: 'installed', bootId: process.pid }
      if (action === 'install') return {}
      return { restartCommand: command }
    } catch (error) {
      status = {
        state: desktopInactive ? 'desktop-inactive' : 'error',
        bootId: process.pid,
        error: error instanceof Error ? error.message : String(error),
      }
      return {}
    }
  }

  ctx.inject(['webServer'], webCtx => webCtx.webServer.register({
    kind: 'exact',
    path: '/dsh-harmony/runtime',
    async handler(request: IncomingMessage, response: ServerResponse) {
      if (request.method === 'GET') return sendJson(response, status)
      if (request.method !== 'POST') {
        response.writeHead(405)
        response.end()
        return
      }
      let action: RuntimeAction
      try {
        const body = await readJson<{ action: RuntimeAction }>(request)
        action = body.action
      } catch (error) {
        if (error instanceof RequestBodyTooLargeError) return sendJson(response, { error: error.message }, 413)
        throw error
      }
      if (!['install', 'install-restart', 'remove', 'ignore'].includes(action)
        || (desktopInactive && (action === 'install' || action === 'install-restart'))) {
        response.writeHead(400)
        response.end()
        return
      }
      if (status.state === 'working') return sendJson(response, status, 409)
      const result = await act(action)
      sendJson(response, status)
      if (status.state === 'removed') setImmediate(() => appExit(0))
      if (status.state === 'installed' && action === 'install') setImmediate(() => appExit(0))
      if (result.restartCommand !== undefined) setImmediate(() => restart(ctx, result.restartCommand!))
    },
  }))

  if (webInvocation()) {
    ctx.inject(['webServer', 'connection'], webCtx => {
      const connection = (webCtx as unknown as {
        connection: { authenticatedUrl?: (url: string) => string }
      }).connection
      // New Hosts announce their authenticated URL only after plugin setup.
      // Publish the installer entry while preserving the runtime-choice gate.
      if (typeof connection.authenticatedUrl === 'function') {
        const url = connection.authenticatedUrl(`http://127.0.0.1:${webCtx.webServer.port}/`)
        process.stdout.write(`dsh web: ${url}\n`)
      }
    })
  } else {
    if (!process.stdin.isTTY) throw new Error(text(
      'dsh-harmony launcher is not active; run npm install -g dsh-harmony or start dsh in a terminal',
      'dsh-harmony 启动器尚未启用；请运行 npm install -g dsh-harmony，或在终端中启动 dsh',
    ))
    const action = await terminalChoice()
    const result = await act(action)
    if (status.state === 'error') throw new Error(status.error)
    if (action === 'remove') return appExit(0)
    if (result.restartCommand !== undefined) return restart(ctx, result.restartCommand)
    if (action === 'install') {
      process.stdout.write(`${text(
        'dsh-harmony installed. Run dsh again to enable patches.',
        'dsh-harmony 已安装。请重新运行 dsh 以启用 Patch。',
      )}\n`)
      return appExit(0)
    }
  }

  await choice
}

export interface HarmonyReloadStatus {
  sequence: number
  state: 'idle' | 'reloading' | 'succeeded' | 'failed'
  error?: string
}

export function registerActiveRuntimeRoute(ctx: Context, reloadStatus: () => HarmonyReloadStatus): void {
  ctx.inject(['webServer'], webCtx => webCtx.webServer.register({
    kind: 'exact',
    path: '/dsh-harmony/runtime',
    handler(request: IncomingMessage, response: ServerResponse) {
      if (request.method === 'GET') return sendJson(response, {
        state: 'active',
        bootId: process.pid,
        reload: reloadStatus(),
      })
      response.writeHead(405)
      response.end()
    },
  }))
}
