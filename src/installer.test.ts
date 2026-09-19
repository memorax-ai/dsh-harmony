import type { Context } from '@deepseek-ai/cordis'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { Readable } from 'node:stream'
import { expect, it, vi } from 'vitest'
import { waitForRuntimeChoice } from './installer.js'

it.each([false, true])('preserves the installer gate and announces native authentication when available (%s)', async modern => {
  const argv = process.argv
  let handler!: (request: IncomingMessage, response: ServerResponse) => Promise<void>
  const register = vi.fn((route: { handler: typeof handler }) => { handler = route.handler; return () => {} })
  const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
  process.argv = [process.execPath, 'dsh', 'web']
  vi.stubEnv('DSH_HARMONY_IGNORE_ONCE', '')
  vi.stubEnv('DSH_DESKTOP', '')
  try {
    const services = {
      webServer: { port: 3081, register },
      connection: modern ? { authenticatedUrl: (url: string) => `${url}?token=test-only` } : {},
    }
    const ctx = {
      appExit: vi.fn(),
      inject: (_keys: string[], apply: (context: unknown) => void) => apply(services),
    } as unknown as Context
    let ready = false
    const setup = waitForRuntimeChoice(ctx).then(() => { ready = true })
    await Promise.resolve()
    expect(ready).toBe(false)
    expect(register).toHaveBeenCalledOnce()
    if (modern) expect(stdout).toHaveBeenCalledWith('dsh web: http://127.0.0.1:3081/?token=test-only\n')
    else expect(stdout).not.toHaveBeenCalled()
    const request = Object.assign(Readable.from([JSON.stringify({ action: 'ignore' })]), { method: 'POST' })
    await handler(request as IncomingMessage, { writeHead: vi.fn(), end: vi.fn() } as unknown as ServerResponse)
    await setup
    expect(ready).toBe(true)
    expect(ctx.appExit).not.toHaveBeenCalled()
  } finally {
    process.argv = argv
    vi.unstubAllEnvs()
    stdout.mockRestore()
  }
})
