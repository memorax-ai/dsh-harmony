#!/usr/bin/env node

import { existsSync } from 'node:fs'
import { enableCompileCache } from 'node:module'
import { join } from 'node:path'
import { terminalLocale, terminalText } from './locale.js'
import type { HarmonyInspection, HarmonyProfileUpdateResult } from './index.js'
import type { HarmonyPatchOrderItem } from './order.js'

enableCompileCache()

const locale = terminalLocale()
const text = (english: string, chinese: string): string => terminalText(locale, english, chinese)
const label = (value: string, chinese: Record<string, string>): string => locale === 'zh' ? chinese[value] ?? value : value
const modeLabel = (value: string): string => label(value, { live: '在线', offline: '离线' })
const patchStateLabel = (value: string): string => label(value, {
  bound: '已绑定', disabled: '已停用', failed: '失败', pending: '等待中', shadowed: '被覆盖', skipped: '已跳过',
})
const patchKindLabel = (value: string): string => label(value, {
  source: '源码', semantic: '语义', loader: '加载器', composite: '组合',
})
const reloadStateLabel = (value: string): string => label(value, {
  idle: '空闲', reloading: '重载中', succeeded: '成功', failed: '失败',
})
const writeStdout = (output: string) => new Promise<void>((resolve, reject) => {
  process.stdout.write(output, error => error === null || error === undefined ? resolve() : reject(error))
})
const HARMONY_HELP = `${text('Usage:', '用法：')}
  dsh harmony [--profile <name>]
  dsh harmony status [--json] [--profile <name>]
  dsh harmony inspect [package] [--file <file>] [--patch <key>] [--summary] [--json] [--profile <name>]
  dsh harmony enable <provider/id> [--json] [--profile <name>]
  dsh harmony disable <provider/id> [--json] [--profile <name>]
  dsh harmony enable-provider <provider> [--json] [--profile <name>]
  dsh harmony disable-provider <provider> [--json] [--profile <name>]
  dsh harmony patch-order show [--json] [--profile <name>]
  dsh harmony patch-order move <patch> (--before|--after) <patch> [--json] [--profile <name>]
  dsh harmony patch-order auto [--json] [--profile <name>]
  dsh harmony provider-order show [--json] [--profile <name>]
  dsh harmony provider-order move <provider> (--before|--after) <provider> [--json] [--profile <name>]
  dsh harmony provider-order auto [--json] [--profile <name>]
  dsh harmony reload [provider] [--json] [--profile <name>]
`

function fail(message: string): never {
  process.stderr.write(`${text('error', '错误')}: ${message}\n`)
  process.exit(1)
}
const args = process.argv.slice(2)
const isHarmonyCommand = args[0] === 'harmony'
const profileOption = args.findIndex(argument => argument === '--profile' || argument.startsWith('--profile='))
if (isHarmonyCommand && profileOption !== -1 && args[profileOption] === '--profile'
  && (args[profileOption + 1] === undefined || args[profileOption + 1]!.startsWith('-'))) {
  process.stderr.write(`${text('error', '错误')}: ${text(
    "option '--profile <name>' argument missing",
    "选项 '--profile <name>' 缺少参数",
  )}\n`)
  process.exit(1)
}
const declaredProfile = profileOption === -1
  ? undefined
  : args[profileOption] === '--profile' ? args[profileOption + 1] : args[profileOption]!.slice('--profile='.length)
const profile = args[0] === 'web' || isHarmonyCommand && declaredProfile === undefined
  ? 'web'
  : declaredProfile

if (isHarmonyCommand) {
  const harmonyArgs = []
  for (let index = 1; index < args.length; index += 1) {
    if (args[index] === '--profile') {
      index += 1
      continue
    }
    if (!args[index]!.startsWith('--profile=')) harmonyArgs.push(args[index]!)
  }
  const command = harmonyArgs[0]
  const json = harmonyArgs.includes('--json')
  if (command === '--help' || command === '-h' || command === 'help') {
    if (harmonyArgs.length !== 1) fail(text('help takes no arguments', 'help 不接受参数'))
    await writeStdout(HARMONY_HELP)
    process.exit(0)
  }
  const [{ configuredProfileCandidates, initProfile, PROFILE_TEMPLATES, resolveProfileDir }, {
    inspectHarmonyRuntime,
    readHarmonyRuntime,
    reloadHarmonyRuntime,
    updateHarmonyProfile,
    updateRuntimePatch,
  }, {
    createHarmonyProfileView,
    HARMONY_PLUGIN,
    pinHarmonyOrder,
  }, {
    autoSortOrder,
    autoSortPatchOrder,
    orderViolations,
    patchOrderViolations,
  }] = await Promise.all([
    import('./dsh.js'),
    import('./control.js'),
    import('./profile.js'),
    import('./order.js'),
  ])
  const profileDir = resolveProfileDir(profile!)
  if (!existsSync(join(profileDir!, 'package.json')) && PROFILE_TEMPLATES[profile!] !== undefined) {
    initProfile(profileDir!, PROFILE_TEMPLATES[profile!])
  }
  if (!existsSync(join(profileDir!, 'package.json'))) {
    fail(text(
      `profile ${JSON.stringify(profile)} does not exist; create it with dsh plugin --profile ${profile} add <package>`,
      `profile ${JSON.stringify(profile)} 不存在；请使用 dsh plugin --profile ${profile} add <package> 创建`,
    ))
  }
  const offlineCandidates = configuredProfileCandidates(profile!, profileDir!)
  const offlineInspection = async (): Promise<{
    mode: 'offline'
    profile: ReturnType<typeof createHarmonyProfileView>
  } & HarmonyInspection> => {
    const {
      currentProfile,
      discoverProfile,
      getPatchInspections,
      getPatchOrderViolations,
      getPatchStatuses,
      inspectPatchTargetsAsync,
      installModuleHooks,
    } = await import('./runtime.js')
    installModuleHooks()
    discoverProfile(profileDir!, false, offlineCandidates)
    await inspectPatchTargetsAsync()
    const patches = getPatchStatuses()
    const patchCounts = new Map(currentProfile().plugins.map(plugin => [plugin.name, 0]))
    for (const patch of patches) patchCounts.set(patch.owner, (patchCounts.get(patch.owner) ?? 0) + 1)
    return {
      mode: 'offline',
      profile: createHarmonyProfileView(currentProfile(), patchCounts, getPatchOrderViolations()),
      patches,
      targets: getPatchInspections(),
    }
  }
  const patchOrderItems = (patches: HarmonyInspection['patches']): HarmonyPatchOrderItem[] => patches.map(patch => ({
    key: patch.key,
    owner: patch.owner,
    index: patch.index,
    ...(patch.before === undefined ? {} : { before: patch.before }),
    ...(patch.after === undefined ? {} : { after: patch.after }),
  }))

  if (command === 'status') {
    if (harmonyArgs.some((arg, index) => index > 0 && arg !== '--json')) {
      fail(text('status accepts only --json', 'status 只接受 --json'))
    }
    const live = await readHarmonyRuntime(profileDir!)
    const offline = live === undefined ? await offlineInspection() : undefined
    const status = offline === undefined
      ? { mode: 'live' as const, ...live! }
      : { mode: 'offline' as const, profile: offline.profile, patches: offline.patches }
    if (json) {
      await writeStdout(`${JSON.stringify(status, null, 2)}\n`)
    } else {
      await writeStdout(`${text('profile', '配置')}  ${status.profile.dir.split('/').at(-1)} (${modeLabel(status.mode)})\n`)
      for (const finding of status.profile.compatibility) {
        if (finding.kind === 'conflict') {
          await writeStdout(text(
            `warning  ${finding.left.package}@${finding.left.version} conflicts with ${finding.right.package}@${finding.right.version}\n`,
            `警告  ${finding.left.package}@${finding.left.version} 与 ${finding.right.package}@${finding.right.version} 冲突\n`,
          ))
        } else if (finding.kind === 'requirement') {
          await writeStdout(text(
            `warning  ${finding.owner.package}@${finding.owner.version} requires ${finding.target.package}@${finding.target.range} (${finding.reason})\n`,
            `警告  ${finding.owner.package}@${finding.owner.version} 需要 ${finding.target.package}@${finding.target.range}（${finding.reason}）\n`,
          ))
        } else {
          await writeStdout(text(
            `linked   ${finding.owner.package}@${finding.owner.version} integrates with ${finding.target.package}@${finding.target.version}\n`,
            `联动  ${finding.owner.package}@${finding.owner.version} 与 ${finding.target.package}@${finding.target.version}\n`,
          ))
        }
      }
      for (const violation of status.profile.orderViolations) {
        await writeStdout(text(
          `warning  ${violation.before} must precede ${violation.after} (declared by ${violation.declaredBy})\n`,
          `警告  ${violation.before} 必须位于 ${violation.after} 之前（由 ${violation.declaredBy} 声明）\n`,
        ))
      }
      for (const violation of status.profile.patchOrderViolations) {
        await writeStdout(text(
          `warning  Patch ${violation.before} must precede ${violation.after} (declared by ${violation.declaredBy})\n`,
          `警告  Patch ${violation.before} 必须位于 ${violation.after} 之前（由 ${violation.declaredBy} 声明）\n`,
        ))
      }
      if (status.mode === 'live' && status.reload.state === 'failed') {
        await writeStdout(text(
          `failed   reload sequence ${status.reload.sequence}: ${status.reload.error ?? 'unknown error'}\n`,
          `失败   重载序列 ${status.reload.sequence}：${status.reload.error ?? '未知错误'}\n`,
        ))
      }
      for (const patch of status.patches) {
        const targets = patch.targets.map(target => `${target.package}/${target.file}`).join(', ')
        await writeStdout(`${patchStateLabel(patch.state).padEnd(8)} ${patch.key} [${patchKindLabel(patch.kind)}] -> ${targets}\n`)
        await writeStdout(text(
          `  matches=${patch.matches} generation=${patch.generation}${patch.error === undefined ? '' : `\n  ${patch.error}`}\n`,
          `  匹配数=${patch.matches} 代次=${patch.generation}${patch.error === undefined ? '' : `\n  ${patch.error}`}\n`,
        ))
        for (const warning of patch.warnings ?? []) {
          await writeStdout(text(`  warning: ${warning}\n`, `  警告：${warning}\n`))
        }
      }
    }
    const unhealthy = status.patches.some(patch => patch.state === 'failed')
      || status.profile.orderViolations.length > 0
      || status.profile.patchOrderViolations.length > 0
      || status.mode === 'live' && status.reload.state === 'failed'
    process.exit(unhealthy ? 1 : 0)
  }

  if (command === 'inspect') {
    let packageName: string | undefined
    let file: string | undefined
    let patchKey: string | undefined
    const summary = harmonyArgs.includes('--summary')
    for (let index = 1; index < harmonyArgs.length; index += 1) {
      const argument = harmonyArgs[index]!
      if (argument === '--json' || argument === '--summary') continue
      if (argument === '--file') {
        file = harmonyArgs[++index]
        if (file === undefined || file.startsWith('-')) fail(text('--file requires a value', '--file 需要一个值'))
        continue
      }
      if (argument === '--patch') {
        patchKey = harmonyArgs[++index]
        if (patchKey === undefined || patchKey.startsWith('-')) fail(text('--patch requires a value', '--patch 需要一个值'))
        continue
      }
      if (argument.startsWith('-')) fail(text(
        `unknown option ${JSON.stringify(argument)}`,
        `未知选项 ${JSON.stringify(argument)}`,
      ))
      if (packageName !== undefined) fail(text('inspect accepts at most one package', 'inspect 最多接受一个 package'))
      packageName = argument
    }
    const live = await inspectHarmonyRuntime(profileDir!, packageName, file)
    const inspected = live ?? await (async () => {
      const offline = await offlineInspection()
      return {
        patches: offline.patches,
        targets: offline.targets.filter(target => (packageName === undefined || target.package === packageName)
          && (file === undefined || target.file === file)),
      }
    })()
    if (patchKey !== undefined && !inspected.patches.some(patch => patch.key === patchKey)) {
      fail(text(`unknown Patch ${JSON.stringify(patchKey)}`, `未知 Patch ${JSON.stringify(patchKey)}`))
    }
    const inspection = patchKey === undefined ? inspected : {
      patches: inspected.patches.filter(patch => patch.key === patchKey),
      targets: inspected.targets.filter(target => target.steps.some(step => step.key === patchKey)),
    }
    if (inspection.targets.length === 0) fail(text('no matching Patch target was found', '未找到匹配的 Patch 目标'))
    if (json) {
      const output = summary ? {
        patches: inspection.patches,
        targets: inspection.targets.map(target => ({
          package: target.package,
          file: target.file,
          steps: target.steps.map(step => ({ key: step.key, matches: step.matches })),
        })),
      } : inspection
      await writeStdout(`${JSON.stringify(output, null, 2)}\n`)
    } else if (summary) {
      for (const target of inspection.targets) {
        await writeStdout(`${target.package}/${target.file}\n`)
        await writeStdout(`  ${target.steps.map(step => `${step.key}(${step.matches})`).join(' -> ')}\n`)
      }
    } else {
      for (const target of inspection.targets) {
        await writeStdout(`=== ${target.package}/${target.file} ===\n`)
        await writeStdout(`--- ${text('original', '原始')} ---\n${target.original}\n`)
        for (const step of target.steps) {
          await writeStdout(`--- ${step.key} (${step.matches} ${text('match', '次匹配')}) ---\n${step.source}\n`)
        }
        await writeStdout(`--- ${text('final', '最终')} ---\n${target.final}\n`)
      }
    }
    process.exit(0)
  }

  if (command === 'reload') {
    const positional = harmonyArgs.slice(1).filter(argument => argument !== '--json')
    if (positional.length > 1 || positional[0]?.startsWith('-')) {
      fail(text('reload accepts at most one provider', 'reload 最多接受一个 Provider'))
    }
    if (harmonyArgs.slice(1).some(argument => argument.startsWith('-') && argument !== '--json')) {
      fail(text('reload accepts only --json', 'reload 只接受 --json'))
    }
    const result = await reloadHarmonyRuntime(profileDir!, positional[0])
    if (result === undefined) fail(text(
      'profile is not running; reload requires a live Host',
      'profile 未运行；reload 需要在线 Host',
    ))
    if (json) await writeStdout(`${JSON.stringify(result, null, 2)}\n`)
    else await writeStdout(text(
      `Harmony reload ${result.reload.state} (sequence ${result.reload.sequence})\n`,
      `Harmony 重载${reloadStateLabel(result.reload.state)}（序列 ${result.reload.sequence}）\n`,
    ))
    process.exit(result.reload.state === 'failed' || result.patches.some(patch => patch.state === 'failed') ? 1 : 0)
  }

  if (['enable', 'disable', 'enable-provider', 'disable-provider'].includes(command ?? '')) {
    const positional = harmonyArgs.slice(1).filter(argument => argument !== '--json')
    if (positional.length !== 1 || positional[0]!.startsWith('-')) fail(text(
      `${command} requires exactly one target`,
      `${command} 需要且仅需要一个目标`,
    ))
    if (harmonyArgs.slice(1).some(argument => argument.startsWith('-') && argument !== '--json')) {
      fail(text(`unknown option for ${command}`, `${command} 包含未知选项`))
    }
    const target = positional[0]!
    const provider = command!.endsWith('-provider')
    const enabled = command!.startsWith('enable')
    const toggle = provider ? { owner: target, enabled } : { key: target, enabled }
    const live = await updateRuntimePatch(profileDir!, toggle)
    let result: HarmonyProfileUpdateResult
    let patches: HarmonyInspection['patches']
    if (live !== undefined) {
      result = live.result
      patches = live.patches
    } else {
      const offline = await offlineInspection()
      const matches = provider
        ? offline.patches.filter(patch => patch.owner === target)
        : offline.patches.filter(patch => patch.key === target)
      if (matches.length === 0) fail(text(
        `unknown ${provider ? 'Provider' : 'Patch'} ${JSON.stringify(target)}`,
        `未知${provider ? ' Provider' : ' Patch'} ${JSON.stringify(target)}`,
      ))
      const disabled = new Set(offline.profile.disabled)
      if (provider) {
        if (enabled) disabled.delete(`${target}/*`)
        else disabled.add(`${target}/*`)
      } else {
        if (enabled) disabled.delete(target)
        else disabled.add(target)
      }
      result = await updateHarmonyProfile(profileDir!, { disabled: [...disabled] }, offlineCandidates)
      patches = (await offlineInspection()).patches
    }
    if (json) await writeStdout(`${JSON.stringify({ result, patches }, null, 2)}\n`)
    else await writeStdout(text(
      `${provider ? 'Provider' : 'Patch'} ${target} ${enabled ? 'enabled' : 'disabled'} (${result.mode})\n`,
      `${provider ? 'Provider' : 'Patch'} ${target} 已${enabled ? '启用' : '停用'}（${modeLabel(result.mode)}）\n`,
    ))
    process.exit(0)
  }

  if (command === 'patch-order') {
    const action = harmonyArgs[1]
    if (!['show', 'move', 'auto'].includes(action ?? '')) {
      fail(text('patch-order requires one of show, move, or auto', 'patch-order 需要 show、move 或 auto'))
    }
    const live = await readHarmonyRuntime(profileDir!)
    const status = live ?? await offlineInspection()
    const items = patchOrderItems(status.patches)
    const violationsOf = (order: string[]) => patchOrderViolations(order, items, status.profile.plugins)

    if (action === 'show') {
      if (harmonyArgs.some((argument, index) => index > 1 && argument !== '--json')) {
        fail(text('patch-order show accepts only --json', 'patch-order show 只接受 --json'))
      }
      const violations = violationsOf(status.profile.patchOrder)
      if (json) {
        await writeStdout(`${JSON.stringify({
          mode: live === undefined ? 'offline' : 'live',
          patchOrder: status.profile.patchOrder,
          violations,
        }, null, 2)}\n`)
      } else {
        for (const [index, key] of status.profile.patchOrder.entries()) {
          await writeStdout(`${String(index + 1).padStart(3)}  ${key}\n`)
        }
        await writeStdout(text(
          `\n${violations.length} order violation${violations.length === 1 ? '' : 's'} (${live === undefined ? 'offline' : 'live'})\n`,
          `\n${violations.length} 条顺序约束未满足（${modeLabel(live === undefined ? 'offline' : 'live')}）\n`,
        ))
      }
      process.exit(violations.length > 0 ? 1 : 0)
    }

    let next: string[]
    if (action === 'auto') {
      if (harmonyArgs.some((argument, index) => index > 1 && argument !== '--json')) {
        fail(text('patch-order auto accepts only --json', 'patch-order auto 只接受 --json'))
      }
      next = autoSortPatchOrder(status.profile.patchOrder, items, status.profile.plugins)
    } else {
      const moveArgs = harmonyArgs.slice(2).filter(argument => argument !== '--json')
      const [key, relation, reference] = moveArgs
      if (moveArgs.length !== 3 || !['--before', '--after'].includes(relation ?? '')
        || key === undefined || key.startsWith('-') || reference === undefined || reference.startsWith('-')) {
        fail(text(
          'patch-order move requires <patch> and exactly one of --before <patch> or --after <patch>',
          'patch-order move 需要 <patch>，以及 --before <patch> 或 --after <patch> 中的一项',
        ))
      }
      if (key === reference) fail(text('a Patch cannot be moved relative to itself', 'Patch 不能相对于自身移动'))
      const known = new Set(status.profile.patchOrder)
      if (!known.has(key)) fail(text(`unknown Patch ${JSON.stringify(key)}`, `未知 Patch ${JSON.stringify(key)}`))
      if (!known.has(reference)) fail(text(`unknown Patch ${JSON.stringify(reference)}`, `未知 Patch ${JSON.stringify(reference)}`))
      next = status.profile.patchOrder.filter(item => item !== key)
      const referenceIndex = next.indexOf(reference)
      next.splice(referenceIndex + (relation === '--before' ? 0 : 1), 0, key)
    }

    const result = await updateHarmonyProfile(profileDir!, { patchOrder: next }, offlineCandidates)
    const violations = violationsOf(next)
    if (json) {
      await writeStdout(`${JSON.stringify({ result, patchOrder: next, violations }, null, 2)}\n`)
    } else {
      await writeStdout(text(
        `Patch order ${action === 'auto' ? 'auto-sorted' : 'updated'} (${result.mode}); ${violations.length} violation${violations.length === 1 ? '' : 's'} remain\n`,
        `Patch 顺序已${action === 'auto' ? '自动排序' : '更新'}（${modeLabel(result.mode)}）；仍有 ${violations.length} 条约束未满足\n`,
      ))
    }
    process.exit(0)
  }

  if (command === 'provider-order') {
    const action = harmonyArgs[1]
    if (!['show', 'move', 'auto'].includes(action ?? '')) {
      fail(text('provider-order requires one of show, move, or auto', 'provider-order 需要 show、move 或 auto'))
    }
    const live = await readHarmonyRuntime(profileDir!)
    const status = live ?? await offlineInspection()
    const violationsOf = (order: string[]) => orderViolations(order, status.profile.plugins)

    if (action === 'show') {
      if (harmonyArgs.some((argument, index) => index > 1 && argument !== '--json')) {
        fail(text('provider-order show accepts only --json', 'provider-order show 只接受 --json'))
      }
      const violations = violationsOf(status.profile.order)
      if (json) {
        await writeStdout(`${JSON.stringify({
          mode: live === undefined ? 'offline' : 'live',
          order: status.profile.order,
          violations,
        }, null, 2)}\n`)
      } else {
        for (const [index, name] of status.profile.order.entries()) {
          await writeStdout(`${String(index + 1).padStart(3)}  ${name}${name === HARMONY_PLUGIN ? text(' [pinned]', ' [固定]') : ''}\n`)
        }
        await writeStdout(text(
          `\n${violations.length} order violation${violations.length === 1 ? '' : 's'} (${live === undefined ? 'offline' : 'live'})\n`,
          `\n${violations.length} 条顺序约束未满足（${modeLabel(live === undefined ? 'offline' : 'live')}）\n`,
        ))
      }
      process.exit(violations.length > 0 ? 1 : 0)
    }

    let next: string[]
    if (action === 'auto') {
      if (harmonyArgs.some((argument, index) => index > 1 && argument !== '--json')) {
        fail(text('provider-order auto accepts only --json', 'provider-order auto 只接受 --json'))
      }
      next = pinHarmonyOrder(autoSortOrder(status.profile.order, status.profile.plugins))
    } else {
      const moveArgs = harmonyArgs.slice(2).filter(argument => argument !== '--json')
      const [name, relation, reference] = moveArgs
      if (moveArgs.length !== 3 || !['--before', '--after'].includes(relation ?? '')
        || name === undefined || name.startsWith('-') || reference === undefined || reference.startsWith('-')) {
        fail(text(
          'provider-order move requires <provider> and exactly one of --before <provider> or --after <provider>',
          'provider-order move 需要 <provider>，以及 --before <provider> 或 --after <provider> 中的一项',
        ))
      }
      if (name === reference) fail(text('a Provider cannot be moved relative to itself', 'Provider 不能相对于自身移动'))
      if (name === HARMONY_PLUGIN) fail(text(`${HARMONY_PLUGIN} is pinned first`, `${HARMONY_PLUGIN} 固定在首位`))
      if (reference === HARMONY_PLUGIN && relation === '--before') {
        fail(text(`${HARMONY_PLUGIN} is pinned first`, `${HARMONY_PLUGIN} 固定在首位`))
      }
      const known = new Set(status.profile.order)
      if (!known.has(name)) fail(text(`unknown Provider ${JSON.stringify(name)}`, `未知 Provider ${JSON.stringify(name)}`))
      if (!known.has(reference)) fail(text(`unknown Provider ${JSON.stringify(reference)}`, `未知 Provider ${JSON.stringify(reference)}`))
      next = status.profile.order.filter(item => item !== name)
      const referenceIndex = next.indexOf(reference)
      next.splice(referenceIndex + (relation === '--before' ? 0 : 1), 0, name)
      next = pinHarmonyOrder(next)
    }

    const result = await updateHarmonyProfile(profileDir!, { order: next }, offlineCandidates)
    const violations = violationsOf(next)
    if (json) await writeStdout(`${JSON.stringify({ result, order: next, violations }, null, 2)}\n`)
    else await writeStdout(text(
      `Provider order ${action === 'auto' ? 'auto-sorted' : 'updated'} (${result.mode}); ${violations.length} violation${violations.length === 1 ? '' : 's'} remain\n`,
      `Provider 顺序已${action === 'auto' ? '自动排序' : '更新'}（${modeLabel(result.mode)}）；仍有 ${violations.length} 条约束未满足\n`,
    ))
    process.exit(0)
  }

  if (command !== undefined) fail(text(
    `unknown harmony command ${JSON.stringify(command)}\n${HARMONY_HELP}`,
    `未知 harmony 命令 ${JSON.stringify(command)}\n${HARMONY_HELP}`,
  ))
  const live = await readHarmonyRuntime(profileDir!)
  const { runHarmonyTui } = await import('./tui.js')
  if (live === undefined) {
    const { discoverProfile, installModuleHooks } = await import('./runtime.js')
    installModuleHooks()
    discoverProfile(profileDir!, false, offlineCandidates)
  }
  await runHarmonyTui(profileDir!, process.stdin, process.stdout, locale, offlineCandidates)
  process.exit(0)
}

const { resolveProfileDir } = await import('./dsh.js')
const profileDir = profile === undefined ? undefined : resolveProfileDir(profile)
const { launchDsh } = await import('./launcher.js')
await launchDsh(args, profile, profileDir)
