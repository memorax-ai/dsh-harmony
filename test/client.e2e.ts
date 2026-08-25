import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'

type Dictionaries = Record<'zh' | 'en', Record<string, string>>

interface Registration {
  options: { id?: string; key?: string; name?: string; label?: () => string; locale?: string }
  component: unknown
}

interface ClientContext {
  effect(register: () => unknown): void
  get(name: string): unknown
  locale: {
    register(namespace: string, value: Dictionaries): () => void
    bind(namespace: string): (key: string) => string
  }
  slots: {
    inject(name: string, mount: () => void): void
    register(options: Registration['options'], component: unknown): void
  }
}

interface ClientModule {
  inject: string[]
  apply(ctx: ClientContext): void
}

interface ClientRecord {
  id: string
  factory(require: (name: string) => unknown): ClientModule
}

let record: ClientRecord | undefined
const effects: Promise<unknown>[] = []
type FetchInit = { method?: string; body?: string }
let handleFetch = async (url: string, _init?: FetchInit): Promise<{ ok: boolean; json(): Promise<unknown> }> => ({
  ok: true,
  json: async () => url === '/dsh-harmony/profile'
    ? { revision: 0, workerThreads: 1, order: [], patchOrder: ['alpha/first', 'beta/only', 'alpha/last'], disabled: [], plugins: [{ name: 'alpha', harmony: true }, { name: 'beta', harmony: true }], orderViolations: [], patchOrderViolations: [], compatibility: [] }
    : { state: 'active' },
})
type FakeStyle = {
  dataset: { plugin: string }
  before(value: FakeMarker): void
}
type FakeMarker = { replaceWith(value: FakeStyle): void }
const style = (plugin: string): FakeStyle => ({
  dataset: { plugin },
  before(marker) {
    const index = headStyles.indexOf(this)
    marker.replaceWith = value => {
      const current = headStyles.indexOf(value)
      if (current >= 0) headStyles.splice(current, 1)
      const target = headStyles.indexOf(marker as unknown as FakeStyle)
      headStyles.splice(target, 1, value)
    }
    headStyles.splice(index, 0, marker as unknown as FakeStyle)
  },
})
const alphaFirst = style('alpha')
const unowned = style('ordinary')
const beta = style('beta')
const alphaSecond = style('alpha')
const headStyles = [alphaFirst, unowned, beta, alphaSecond]
const existingPluginStyle = { textContent: 'stale' }
const fakeHead = {
  querySelectorAll() { return [...headStyles] },
}
const fakeWindow = {
  __ModuleLoader__: { load(value: unknown) { record = value as ClientRecord } },
  addEventListener() {},
  removeEventListener() {},
  matchMedia() { return { matches: false } },
  setTimeout,
  clearTimeout,
  location: { reload() {} },
}
runInNewContext(readFileSync(new URL('../browser-dist/client.js', import.meta.url), 'utf8'), {
  window: fakeWindow,
  document: {
    querySelector(selector: string) { return selector === 'style[data-plugin-css="dsh-harmony/client.css"]' ? existingPluginStyle : {} },
    head: fakeHead,
    createComment() { return { replaceWith() {} } },
  },
  MutationObserver: class {
    observe() {}
    disconnect() {}
  },
  queueMicrotask,
  requestAnimationFrame(callback: () => void) { queueMicrotask(callback); return 1 },
  URLSearchParams,
  fetch: (url: string, init?: FetchInit) => handleFetch(url, init),
  navigator: { language: 'zh-CN' },
})

const loaded = record
assert.ok(loaded !== undefined)
assert.equal(loaded.id, 'dsh-harmony')
const client = loaded.factory(name => {
  assert.equal(name, 'react')
  return {
    createElement() {},
    useEffect() {},
    useLayoutEffect() {},
    useMemo() {},
    useRef() {},
    useState() {},
  }
})
assert.match(existingPluginStyle.textContent, /dshHarmonySourceSummary\{position:sticky/)
assert.deepEqual(Array.from(client.inject), ['slots', 'locale'])

const registrations: Registration[] = []
let dictionaries: Dictionaries | undefined
client.apply({
  effect(register) {
    effects.push(Promise.resolve(register()))
  },
  get() { return undefined },
  locale: {
    register(namespace, value) {
      assert.equal(namespace, 'dsh-harmony')
      dictionaries = value
      return () => {}
    },
    bind(namespace) {
      assert.equal(namespace, 'dsh-harmony')
      return key => dictionaries?.en[key] ?? key
    },
  },
  slots: {
    inject(name, mount) {
      assert.ok(['shell.overlay', 'settings.section', 'settings.plugin.item'].includes(name))
      mount()
    },
    register(options, component) {
      registrations.push({ options, component })
    },
  },
})
await Promise.all(effects)
await new Promise(resolve => setImmediate(resolve))
assert.deepEqual(headStyles, [beta, unowned, alphaFirst, alphaSecond])

const registration = registrations.find(value => value.options.id === 'harmony')
assert.ok(registration !== undefined)
assert.ok(registration.options.label !== undefined)
assert.equal(registration.options.id, 'harmony')
assert.equal(registration.options.label(), 'Harmony')
assert.equal(registration.options.locale, 'dsh-harmony')
assert.ok(dictionaries !== undefined)
assert.deepEqual(Object.keys(dictionaries.zh), Object.keys(dictionaries.en))
assert.equal(dictionaries.zh.patchKindSource, '源码 Patch')
assert.equal(dictionaries.zh.patchBound, '已启用')
assert.equal(dictionaries.zh.viewPatchDetails, '查看详情')
assert.equal(dictionaries.zh.workerThreadsTitle, '多线程装载')
assert.equal(dictionaries.en.patchOperationReplace, 'Replace')
assert.equal(typeof registration.component, 'function')
const workerRegistration = registrations.find(value => value.options.key === 'dsh-harmony')
assert.equal(workerRegistration?.options.name, 'settings.plugin.item')
assert.equal(workerRegistration?.options.locale, 'dsh-harmony')
assert.equal(registrations.find(value => value.options.id === 'harmony-runtime')?.options.name, 'shell.overlay')
assert.equal(registrations.find(value => value.options.id === 'harmony-reload-notifications')?.options.name, 'shell.overlay')
assert.equal(registrations.find(value => value.options.id === 'harmony-session-patch-profile'), undefined)
assert.equal(registrations.find(value => value.options.id === 'harmony-instance-patch-profile')?.options.name, 'shell.overlay')

const profile = {
  revision: 4,
  workerThreads: 1,
  order: ['alpha'],
  patchOrder: ['alpha/first'],
  disabled: ['alpha/first'],
  plugins: [{
    name: 'alpha', version: '1.0.0', description: '', harmony: true, patches: ['patch.cjs'], patchCount: 1,
    before: [], after: [], compatibility: {
      requires: { base: '^2' }, conflicts: { legacy: '*' }, integrates: { renderer: '^1' },
    }, author: '', contributors: [], homepage: '', bugs: '', license: '',
  }],
  orderViolations: [], patchOrderViolations: [], compatibility: [{
    kind: 'conflict' as const,
    left: { package: 'alpha', version: '1.0.0', entryIds: ['alpha-entry'] },
    right: { package: 'legacy', version: '1.0.0', entryIds: ['legacy-entry'] },
    declaredBy: ['alpha'],
  }, {
    kind: 'requirement' as const,
    owner: { package: 'alpha', version: '1.0.0', entryIds: ['alpha-entry'] },
    target: { package: 'base', range: '^2', version: null, entryIds: [] },
    reason: 'missing' as const,
  }, {
    kind: 'integration' as const,
    owner: { package: 'alpha', version: '1.0.0', entryIds: ['alpha-entry'] },
    target: { package: 'renderer', version: '1.2.0', entryIds: ['renderer-entry'] },
    range: '^1',
  }],
}
const patch = {
  key: 'alpha/first', id: 'first', owner: 'alpha', index: 0,
  targets: [{ package: 'target', file: 'lib/client.js' }], kind: 'source',
  state: 'disabled', matches: 0, generation: 1, declaration: 'patch.cjs',
}
const updates: Array<{ expectedRevision: number; patchOrder: string[]; disabled: string[] }> = []
const workerUpdates: Array<{ expectedRevision: number; workerThreads: number }> = []
const highlighted: string[] = []
let inspectLargeDiff = false
let emptyCompatibilityDeclarations = false
const largeBefore = Array.from({ length: 1000 }, (_, index) => `const before${index} = ${index}`).join('\n')
const largeAfter = Array.from({ length: 1000 }, (_, index) => `const after${index} = ${index}`).join('\n')
const syntaxHighlighter = {
  highlight({ code }: { code: string }) {
    highlighted.push(code)
    return {
      lines: code.split('\n').map(content => [{
        content,
        color: 'var(--shiki-token-keyword)',
        style: { bold: true as const },
      }]),
    }
  },
}
handleFetch = async (url, init) => {
  if (url === '/dsh-harmony/runtime') return { ok: true, json: async () => ({ state: 'active' }) }
  if (url === '/dsh-harmony/patches') return { ok: true, json: async () => ({ patches: [patch] }) }
  if (url.startsWith('/dsh-harmony/inspect?')) return {
    ok: true,
    json: async () => ({
      inspections: [{
        original: inspectLargeDiff ? largeBefore : 'const answer = 1',
        steps: [{ key: patch.key, matches: 1, source: inspectLargeDiff ? largeAfter : 'const answer = 2' }],
        final: inspectLargeDiff ? largeAfter : 'const answer = 2',
      }],
    }),
  }
  if (url !== '/dsh-harmony/profile') throw new Error(`unexpected request: ${url}`)
  if (init?.method === 'POST') {
    const update = JSON.parse(init.body ?? '{}') as {
      expectedRevision: number
      workerThreads?: number
      patchOrder?: string[]
      disabled?: string[]
    }
    if (update.workerThreads !== undefined) {
      workerUpdates.push({ expectedRevision: update.expectedRevision, workerThreads: update.workerThreads })
      profile.workerThreads = update.workerThreads
    } else {
      updates.push({
        expectedRevision: update.expectedRevision,
        patchOrder: update.patchOrder!,
        disabled: update.disabled!,
      })
      profile.patchOrder = [...update.patchOrder!]
      profile.disabled = [...update.disabled!]
    }
    profile.revision += 1
    patch.state = profile.disabled.includes(patch.key) ? 'disabled' : 'bound'
  }
  return { ok: true, json: async () => emptyCompatibilityDeclarations ? {
    ...profile,
    compatibility: [],
    plugins: profile.plugins.map(plugin => ({
      ...plugin,
      before: [],
      after: [],
      compatibility: { requires: {}, conflicts: {}, integrates: {} },
    })),
  } : profile }
}

const nodeRequire = createRequire(import.meta.url)
const React = nodeRequire('react') as {
  createElement(type: unknown, props?: Record<string, unknown>): unknown
}
const testRenderer = nodeRequire('react-test-renderer') as {
  act(callback: () => void | Promise<void>): Promise<void>
  create(element: unknown): {
    root: {
      find(predicate: (node: { type: unknown; props: Record<string, unknown>; children: unknown[] }) => boolean): {
        type: unknown
        props: Record<string, unknown>
        children: unknown[]
      }
      findAll(predicate: (node: { type: unknown; props: Record<string, unknown>; children: unknown[] }) => boolean): Array<{
        type: unknown
        props: Record<string, unknown>
        children: unknown[]
      }>
    }
  }
}
const behaviorClient = loaded.factory(name => {
  assert.equal(name, 'react')
  return nodeRequire('react')
})
const behaviorRegistrations: Registration[] = []
const behaviorEffects: Promise<unknown>[] = []
behaviorClient.apply({
  effect(register) { behaviorEffects.push(Promise.resolve(register())) },
  get(name) {
    assert.equal(name, 'syntaxHighlighter')
    return syntaxHighlighter
  },
  locale: {
    register() { return () => {} },
    bind() { return key => dictionaries!.en[key] ?? key },
  },
  slots: {
    inject(_name, mount) { mount() },
    register(options, component) { behaviorRegistrations.push({ options, component }) },
  },
})
await Promise.all(behaviorEffects)
const behaviorComponent = behaviorRegistrations.find(value => value.options.id === 'harmony')?.component
assert.ok(behaviorComponent !== undefined)

let rendered!: ReturnType<typeof testRenderer.create>
await testRenderer.act(async () => {
  rendered = testRenderer.create(React.createElement(behaviorComponent, {
    t: (key: string) => dictionaries!.en[key] ?? key,
  }))
  await new Promise(resolve => setImmediate(resolve))
})
const find = (predicate: (node: { type: unknown; props: Record<string, unknown>; children: unknown[] }) => boolean) => rendered.root.find(predicate)
const button = (label: string) => find(node => node.type === 'button' && node.children.join('') === label)
const compatibilityWarning = find(node => node.props.className === 'dshHarmonyWarning').children.join('')
assert.match(compatibilityWarning, /alpha@1\.0\.0 ↔ legacy@1\.0\.0/)
assert.match(compatibilityWarning, /alpha@1\.0\.0 → base@\^2 \(missing\)/)
assert.doesNotMatch(compatibilityWarning, /renderer/)
const compatibilityDeclarations = find(node => node.props.className === 'dshHarmonyConstraint').children.join('')
assert.match(compatibilityDeclarations, /Requires plugins: base@\^2/)
assert.match(compatibilityDeclarations, /Conflicts with plugins: legacy/)
assert.match(compatibilityDeclarations, /Integrates with plugins: renderer@\^1/)
assert.match(find(node => node.props.className === 'dshHarmonyStackMeta').children.join(''), /1 Patch/)

await testRenderer.act(async () => {
  const stack = find(node => node.props.className === 'dshHarmonyStack')
  ;(stack.props.onClick as (event: { detail: number; clientY: number }) => void)({ detail: 1, clientY: 0 })
})
await testRenderer.act(async () => {
  const card = find(node => node.type === 'button' && node.props['data-patch-key'] === patch.key)
  let prevented = false
  let stopped = false
  ;(card.props.onKeyDown as (event: { key: string; altKey: boolean; preventDefault(): void; stopPropagation(): void }) => void)({
    key: 'Escape', altKey: false,
    preventDefault() { prevented = true },
    stopPropagation() { stopped = true },
  })
  assert.equal(prevented, true)
  assert.equal(stopped, true)
})
await testRenderer.act(async () => {
  const stack = find(node => node.props.className === 'dshHarmonyStack')
  ;(stack.props.onClick as (event: { detail: number; clientY: number }) => void)({ detail: 1, clientY: 0 })
})
await testRenderer.act(async () => {
  const card = find(node => node.type === 'button' && node.props['data-patch-key'] === patch.key)
  assert.match(String(card.props['aria-label']), /alpha\/first · Disabled · 1\/1/)
  ;(card.props.onClick as () => void)()
})
await testRenderer.act(async () => { (button('Enable this Patch').props.onClick as () => void)() })
assert.equal(updates.length, 0)
assert.equal(button('Save').props.disabled, false)

await testRenderer.act(async () => { (button('Undo').props.onClick as () => void)() })
assert.equal(updates.length, 0)
assert.equal(button('Enable this Patch').type, 'button')
assert.equal(button('Save').props.disabled, true)

await testRenderer.act(async () => { (button('Enable this Patch').props.onClick as () => void)() })
await testRenderer.act(async () => {
  ;(button('Save').props.onClick as () => void)()
  await new Promise(resolve => setImmediate(resolve))
})
assert.deepEqual(updates, [{ expectedRevision: 4, patchOrder: ['alpha/first'], disabled: [] }])
assert.equal(button('Disable this Patch').type, 'button')
assert.equal(button('Save').props.disabled, true)

await testRenderer.act(async () => {
  ;(button('Patch status').props.onClick as () => void)()
  await new Promise(resolve => setImmediate(resolve))
  await new Promise(resolve => setImmediate(resolve))
})
assert.deepEqual(highlighted, ['const answer = 1', 'const answer = 2'])
const highlightedTokens = rendered.root.findAll(node => {
  const style = node.props.style as { color?: string } | undefined
  return node.type === 'span' && style?.color === 'var(--shiki-token-keyword)'
})
assert.ok(highlightedTokens.length > 0)
assert.ok(highlightedTokens.every(token => (token.props.style as { fontWeight?: string }).fontWeight === 'bold'))
assert.equal(rendered.root.findAll(node => node.props.role === 'option').length, 0)
assert.equal(find(node => node.props['data-patch-key'] === patch.key && node.props.className === 'dshHarmonyPatchRow').props['aria-current'], 'true')
const diffAccessibility = rendered.root.findAll(node => node.props.className === 'dshHarmonySrOnly').flatMap(node => node.children).join(' ')
assert.match(diffAccessibility, /Added line/)
assert.match(diffAccessibility, /Removed line/)

inspectLargeDiff = true
await testRenderer.act(async () => { (button('Apply order').props.onClick as () => void)() })
await testRenderer.act(async () => {
  ;(button('Patch status').props.onClick as () => void)()
  await new Promise(resolve => setImmediate(resolve))
  await new Promise(resolve => setImmediate(resolve))
})
assert.match(find(node => node.props.className === 'dshHarmonyDiffEmpty').children.join(''), /too large to diff safely/)

emptyCompatibilityDeclarations = true
let emptyCompatibilityRendered!: ReturnType<typeof testRenderer.create>
await testRenderer.act(async () => {
  emptyCompatibilityRendered = testRenderer.create(React.createElement(behaviorComponent, {
    t: (key: string) => dictionaries!.en[key] ?? key,
  }))
  await new Promise(resolve => setImmediate(resolve))
})
emptyCompatibilityDeclarations = false
assert.equal(emptyCompatibilityRendered.root.findAll(node => node.props.className === 'dshHarmonyConstraint').length, 0)

const instanceComponent = behaviorRegistrations.find(value => value.options.id === 'harmony-instance-patch-profile')?.component
assert.ok(instanceComponent !== undefined)
const previousFetch = handleFetch
handleFetch = async url => {
  assert.equal(url, '/dsh-harmony/instance-profile')
  return {
    ok: true,
    json: async () => ({
      state: 'mismatch',
      recorded: { profile: 'previous', recordedAt: 1, patches: [] },
      current: { profile: 'current', recordedAt: 2, patches: [] },
      difference: {
        missing: ['@scope/provider/first', 'alpha/second'],
        added: ['beta/only'],
        changed: ['gamma/changed'],
        reordered: true,
      },
    }),
  }
}
let instanceRendered!: ReturnType<typeof testRenderer.create>
await testRenderer.act(async () => {
  instanceRendered = testRenderer.create(React.createElement(instanceComponent, {
    t: (key: string) => dictionaries!.en[key] ?? key,
  }))
  await new Promise(resolve => setImmediate(resolve))
})
assert.equal(instanceRendered.root.find(node => node.props.role === 'alertdialog').props.className, 'dshHarmonyRuntimeDialog dshHarmonyPatchDialog')
const instanceCards = instanceRendered.root.findAll(node => node.props.className === 'dshHarmonySessionDiffCard')
assert.deepEqual(instanceCards.map(node => node.props['data-kind']), ['profile', 'missing', 'added', 'changed', 'reordered'])
assert.deepEqual(
  instanceRendered.root.findAll(node => node.props.className === 'dshHarmonySessionPatchName').map(node => node.children.join('')),
  ['first', 'second', 'only', 'changed'],
)
assert.deepEqual(
  instanceRendered.root.findAll(node => node.props.className === 'dshHarmonySessionPatchOwner').map(node => node.children.join('')),
  ['@scope/provider', 'alpha', 'beta', 'gamma'],
)
assert.deepEqual(
  instanceRendered.root.findAll(node => node.props.className === 'dshHarmonySessionPatch').map(node => node.props['aria-label']),
  ['@scope/provider/first', 'alpha/second', 'beta/only', 'gamma/changed'],
)
assert.deepEqual(
  instanceRendered.root.findAll(node => node.props.className === 'dshHarmonySessionDiffCount').map(node => node.children.join('')),
  ['2', '1', '1'],
)
assert.deepEqual(instanceRendered.root.findAll(node => node.type === 'code').map(node => node.children.join('')), ['previous', 'current'])
assert.match(instanceRendered.root.find(node => node.props.className === 'dshHarmonySessionReordered').children.join(''), /application order differs/)
handleFetch = previousFetch

const workerComponent = behaviorRegistrations.find(value => value.options.key === 'dsh-harmony')?.component
assert.ok(workerComponent !== undefined)
let workerRendered!: ReturnType<typeof testRenderer.create>
await testRenderer.act(async () => {
  workerRendered = testRenderer.create(React.createElement(workerComponent, {
    t: (key: string) => dictionaries!.en[key] ?? key,
  }))
  await new Promise(resolve => setImmediate(resolve))
})
const workerCard = workerRendered.root.find(node => node.props.className === 'dshHarmonyWorkerCard')
assert.equal(workerCard.type, 'li')
assert.equal(workerCard.props['data-open'], 'false')
assert.equal(workerRendered.root.find(node => node.props.className === 'dshHarmonyWorkerTitle').children.join(''), 'Harmony')
const workerToggle = workerRendered.root.find(node => node.props.className === 'dshHarmonyWorkerHeaderButton')
let workerOwner = workerRendered.root.find(node => node.props.className === 'dshHarmonyWorkerPlugin')
assert.equal(workerOwner.type, 'a')
assert.equal(workerOwner.props.href, 'https://github.com/memorax-ai/dsh-harmony')
assert.equal(workerOwner.props.target, '_blank')
assert.equal(workerOwner.props.rel, 'noreferrer')
assert.equal(workerOwner.props['data-ready'], 'false')
await testRenderer.act(async () => {
  ;(workerOwner.props.onPointerEnter as () => void)()
  let prevented = false
  ;(workerOwner.props.onClick as (event: { detail: number; preventDefault(): void }) => void)({
    detail: 1,
    preventDefault() { prevented = true },
  })
  assert.equal(prevented, true)
})
assert.equal(workerRendered.root.find(node => node.props.className === 'dshHarmonyWorkerCard').props['data-open'], 'true')
await testRenderer.act(async () => {
  ;(workerToggle.props.onClick as () => void)()
})
assert.equal(workerRendered.root.find(node => node.props.className === 'dshHarmonyWorkerCard').props['data-open'], 'false')
await testRenderer.act(async () => {
  workerOwner = workerRendered.root.find(node => node.props.className === 'dshHarmonyWorkerPlugin')
  ;(workerOwner.props.onPointerEnter as () => void)()
  await new Promise(resolve => setTimeout(resolve, 310))
})
workerOwner = workerRendered.root.find(node => node.props.className === 'dshHarmonyWorkerPlugin')
assert.equal(workerOwner.props['data-ready'], 'true')
await testRenderer.act(async () => {
  let prevented = false
  ;(workerOwner.props.onClick as (event: { detail: number; preventDefault(): void }) => void)({
    detail: 1,
    preventDefault() { prevented = true },
  })
  assert.equal(prevented, false)
  ;(workerOwner.props.onPointerLeave as () => void)()
})
assert.equal(workerRendered.root.find(node => node.props.className === 'dshHarmonyWorkerCard').props['data-open'], 'false')
await testRenderer.act(async () => {
  ;(workerToggle.props.onClick as () => void)()
})
assert.equal(workerRendered.root.find(node => node.props.className === 'dshHarmonyWorkerCard').props['data-open'], 'true')
assert.equal(workerRendered.root.find(node => node.props.className === 'dshHarmonyWorkerSettingTitle').children.join(''), 'Multithreaded loading')
const workerSelect = workerRendered.root.find(node => node.type === 'select')
assert.equal(workerSelect.props.value, '1')
await testRenderer.act(async () => {
  ;(workerSelect.props.onChange as (event: { currentTarget: { value: string } }) => void)({ currentTarget: { value: '4' } })
  await new Promise(resolve => setImmediate(resolve))
})
assert.deepEqual(workerUpdates, [{ expectedRevision: 5, workerThreads: 4 }])
assert.equal(workerRendered.root.find(node => node.type === 'select').props.value, '4')
