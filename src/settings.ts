import type { Context } from '@deepseek-ai/cordis'
import type { SettingsNamespace } from '@deepseek-ai/dsh-settings'
import z from '@deepseek-ai/schemastery'

const Config = z.object({})

export const inject = ['settings']

export function apply(ctx: Context): void {
  const settings = ctx.settings as unknown as { configure?: (policy: { auto: boolean }) => () => void }
  if (typeof settings.configure === 'function') {
    ctx.effect(() => settings.configure!({ auto: false }))
    return
  }
  ctx.settings.register('dsh-harmony' as SettingsNamespace, Config, { applies: 'restart' })
}
