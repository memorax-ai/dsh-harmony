import { createHash } from 'node:crypto'
import MagicString from 'magic-string'
import ts from 'typescript'
import { tsquery, type Selector } from '@phenomnomnominal/tsquery'
import { findMatches, getProperties } from '@phenomnomnominal/tsquery/dist/src/traverse.js'
import { getVisitorKeys } from '@phenomnomnominal/tsquery/dist/src/matchers/sibling.js'
import type { HarmonyPatch, HarmonySemanticPatch, HarmonySourcePatch } from './index.js'

export interface PatchIdentity {
  key: string
  owner: string
  declaration: string
  fingerprint?: string
}

export interface BoundSemanticPatch<T extends PatchIdentity = PatchIdentity> {
  registered: T
  patch: HarmonySemanticPatch
}

export interface BoundSourceTrace<T extends PatchIdentity = PatchIdentity> {
  registered: T
  patch: HarmonySourcePatch
}

function sourceScriptKind(filename: string): ts.ScriptKind {
  return filename.endsWith('.tsx')
    ? ts.ScriptKind.TSX
    : /\.(?:cts|mts|ts)$/.test(filename)
      ? ts.ScriptKind.TS
      : ts.ScriptKind.JS
}

export function parseSource(filename: string, source: string): ts.SourceFile {
  return ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true, sourceScriptKind(filename))
}

export interface SourceDelta {
  start: number
  removed: number
  inserted: string
}

function copyStringRange(source: string, start: number, end: number): string {
  let copied = ''
  for (let offset = start; offset < end; offset += 8_192) {
    const length = Math.min(8_192, end - offset)
    const codes = new Uint16Array(length)
    for (let index = 0; index < length; index += 1) codes[index] = source.charCodeAt(offset + index)
    copied += String.fromCharCode(...codes)
  }
  return copied
}

export function sourceDelta(before: string, after: string): SourceDelta {
  if (before === after) return { start: before.length, removed: 0, inserted: '' }
  let start = 0
  const shared = Math.min(before.length, after.length)
  while (start < shared && before.charCodeAt(start) === after.charCodeAt(start)) start += 1
  let beforeEnd = before.length
  let afterEnd = after.length
  while (beforeEnd > start && afterEnd > start
    && before.charCodeAt(beforeEnd - 1) === after.charCodeAt(afterEnd - 1)) {
    beforeEnd -= 1
    afterEnd -= 1
  }
  return {
    start,
    removed: beforeEnd - start,
    inserted: copyStringRange(after, start, afterEnd),
  }
}

export function applySourceDelta(source: string, delta: SourceDelta): string {
  if (delta.removed === 0 && delta.inserted.length === 0) return source
  return source.slice(0, delta.start) + delta.inserted + source.slice(delta.start + delta.removed)
}

interface TrackedEdit {
  edit: MagicString
  delta(rendered: string): SourceDelta
}

function trackedEdit(source: string): TrackedEdit {
  const target = new MagicString(source)
  let start = source.length
  let end = 0
  let complete = true
  const insertionMethods = new Set(['appendLeft', 'appendRight', 'prependLeft', 'prependRight', 'insertLeft', 'insertRight'])
  const rangeMethods = new Set(['overwrite', 'update', 'remove', 'reset'])
  const safeMethods = new Set([
    'addSourcemapLocation', 'clone', 'generateDecodedMap', 'generateMap', 'getIndentString', 'hasChanged',
    'isEmpty', 'lastChar', 'lastLine', 'length', 'slice', 'snip', 'toString',
  ])
  let edit: MagicString
  edit = new Proxy(target, {
    get(current, property) {
      const value = Reflect.get(current, property, current) as unknown
      if (typeof property !== 'string' || typeof value !== 'function') return value
      return (...args: unknown[]) => {
        if (property === 'prepend') start = 0
        else if (property === 'append') {
          start = Math.min(start, source.length)
          end = Math.max(end, source.length)
        } else if (insertionMethods.has(property)) {
          const index = Number(args[0])
          start = Math.min(start, index)
          end = Math.max(end, index)
        } else if (rangeMethods.has(property)) {
          let rangeStart = Number(args[0])
          let rangeEnd = Number(args[1])
          while (rangeStart < 0 && source.length > 0) rangeStart += source.length
          while (rangeEnd < 0 && source.length > 0) rangeEnd += source.length
          start = Math.min(start, rangeStart)
          end = Math.max(end, rangeEnd)
        } else if (!safeMethods.has(property)) {
          complete = false
        }
        const result = Reflect.apply(value as (...values: unknown[]) => unknown, current, args)
        return result === current ? edit : result
      }
    },
    set(current, property, value) {
      complete = false
      return Reflect.set(current, property, value, current)
    },
  }) as MagicString
  return {
    edit,
    delta(rendered) {
      if (rendered === source) return { start: source.length, removed: 0, inserted: '' }
      if (!complete || start > end) return sourceDelta(source, rendered)
      const removed = end - start
      const insertedLength = rendered.length - source.length + removed
      return {
        start,
        removed,
        inserted: copyStringRange(rendered, start, start + insertedLength),
      }
    },
  }
}

const SELECTOR_CACHE_LIMIT = 256

interface QueryAttribute {
  name: string
  value: unknown
}

interface QuerySegment {
  selector: Selector
  kinds?: ts.SyntaxKind[]
  attributes: QueryAttribute[]
}

interface QueryBranch {
  key: string
  selector: Selector
  segments?: QuerySegment[]
  merkleSafe: boolean
}

interface QueryDependencies {
  ancestors: boolean
  siblings: boolean
  childPosition: boolean
  siblingCount: boolean
  source: boolean
}

interface QueryPlan {
  key: string
  selector: Selector
  branches: QueryBranch[]
  indexable: boolean
  sourceFile: boolean
  dependencies: QueryDependencies
  observedProperties: string[]
}

const selectorCache = new Map<string, QueryPlan>()

interface MatchLocator {
  kind: ts.SyntaxKind
  pos: number
  end: number
  occurrence: number
}

interface QueryCacheEntry {
  queries: Map<string, MatchLocator[]>
}

const QUERY_CACHE_LIMIT = 512
const queryCache = new Map<string, QueryCacheEntry>()
const SOURCE_AST_CACHE_LIMIT = 64
const sourceAstCache = new Map<string, SourceAst>()

interface PatchTransitionCacheEntry {
  sourceFile: ts.SourceFile
  output: string
  matches: number
  delta: SourceDelta
}

const PATCH_TRANSITION_CACHE_LIMIT = 64
const patchTransitionCache = new Map<string, PatchTransitionCacheEntry>()
const sourcePatchFingerprints = new WeakMap<HarmonySourcePatch, string>()

interface RelativeMatchLocator {
  kind: ts.SyntaxKind
  start: number
  end: number
  occurrence: number
}

const MERKLE_QUERY_CACHE_LIMIT = 4_096
const merkleQueryCache = new Map<string, RelativeMatchLocator[]>()
const automatonCache = new Map<string, RelativeMatchLocator[]>()

function selectorKinds(selector: Selector): ts.SyntaxKind[] | undefined {
  const value = selector as Selector & {
    type: string
    value?: string
    selectors?: Selector[]
    right?: Selector
  }
  if (value.type === 'identifier') {
    const kind = ts.SyntaxKind[value.value as keyof typeof ts.SyntaxKind]
    return typeof kind === 'number' ? [kind] : undefined
  }
  if (value.type === 'compound') {
    for (const child of value.selectors ?? []) {
      const kinds = selectorKinds(child)
      if (kinds !== undefined) return kinds
    }
    return undefined
  }
  if (value.type === 'child' || value.type === 'descendant'
    || value.type === 'adjacent' || value.type === 'sibling') {
    return value.right === undefined ? undefined : selectorKinds(value.right)
  }
  if (value.type === 'matches') {
    const groups = (value.selectors ?? []).map(selectorKinds)
    return groups.some(group => group === undefined)
      ? undefined
      : [...new Set(groups.flatMap(group => group!))]
  }
  return undefined
}

function selectorAttributes(selector: Selector): QueryAttribute[] {
  const value = selector as Selector & { type: string; selectors?: Selector[] }
  const selectors = value.type === 'compound' ? value.selectors ?? [] : [selector]
  return selectors.flatMap(child => {
    const attribute = child as Selector & {
      type: string
      name?: string
      operator?: string
      value?: { type: string; value: unknown }
    }
    return attribute.type === 'attribute' && attribute.operator === '='
      && attribute.name !== undefined && attribute.value?.type === 'literal'
      ? [{ name: attribute.name, value: attribute.value.value }]
      : []
  })
}

function selectorSegments(selector: Selector): QuerySegment[] | undefined {
  const value = selector as Selector & { type: string; left?: Selector; right?: Selector }
  if (value.type === 'adjacent' || value.type === 'sibling') return undefined
  if (value.type === 'child' || value.type === 'descendant') {
    if (value.left === undefined || value.right === undefined) return undefined
    const left = selectorSegments(value.left)
    const right = selectorSegments(value.right)
    return left === undefined || right === undefined ? undefined : [...left, ...right]
  }
  return [{ selector, kinds: selectorKinds(selector), attributes: selectorAttributes(selector) }]
}

function merkleSafeSelector(selector: Selector): boolean {
  const value = selector as Selector & {
    type: string
    name?: string
    selectors?: Selector[]
    left?: Selector
    right?: Selector
  }
  if (value.type === 'identifier' || value.type === 'wildcard' || value.type === 'class'
    || value.type === 'type') return true
  if (value.type === 'attribute') {
    return value.name?.split('.').every(key => key !== 'parent' && key !== 'pos' && key !== 'end'
      && key !== 'getSourceFile') === true
  }
  if (value.type === 'compound' || value.type === 'matches' || value.type === 'has' || value.type === 'not') {
    return value.selectors?.every(merkleSafeSelector) === true
  }
  if (value.type === 'child' || value.type === 'descendant') {
    return value.left !== undefined && value.right !== undefined
      && merkleSafeSelector(value.left) && merkleSafeSelector(value.right)
  }
  return false
}

function mergeDependencies(left: QueryDependencies, right: QueryDependencies): QueryDependencies {
  return {
    ancestors: left.ancestors || right.ancestors,
    siblings: left.siblings || right.siblings,
    childPosition: left.childPosition || right.childPosition,
    siblingCount: left.siblingCount || right.siblingCount,
    source: left.source || right.source,
  }
}

function selectorDependencies(selector: Selector): QueryDependencies {
  const value = selector as Selector & {
    type: string
    name?: string
    selectors?: Selector[]
    left?: Selector
    right?: Selector
  }
  let own: QueryDependencies = {
    ancestors: false,
    siblings: false,
    childPosition: false,
    siblingCount: false,
    source: false,
  }
  if (value.type === 'child' || value.type === 'descendant' || value.type === 'field') {
    own.ancestors = true
  } else if (value.type === 'adjacent' || value.type === 'sibling') {
    own.siblings = true
    own.childPosition = true
    own.siblingCount = true
  } else if (value.type === 'nth-child') {
    own.childPosition = true
  } else if (value.type === 'nth-last-child') {
    own.childPosition = true
    own.siblingCount = true
  } else if (value.type === 'attribute') {
    const keys = value.name?.split('.') ?? []
    own.ancestors = keys.includes('parent')
    own.childPosition = keys.includes('pos') || keys.includes('end')
    own.source = keys.includes('getSourceFile') || keys.includes('sourceFile')
  }
  for (const child of value.selectors ?? []) own = mergeDependencies(own, selectorDependencies(child))
  if (value.left !== undefined) own = mergeDependencies(own, selectorDependencies(value.left))
  if (value.right !== undefined) own = mergeDependencies(own, selectorDependencies(value.right))
  return own
}

function observedSelectorProperties(selector: Selector, properties = new Set<string>()): Set<string> {
  const value = selector as Selector & {
    type: string
    name?: string
    selectors?: Selector[]
    left?: Selector
    right?: Selector
  }
  if (value.type === 'attribute' && value.name !== undefined) properties.add(value.name)
  for (const child of value.selectors ?? []) observedSelectorProperties(child, properties)
  if (value.left !== undefined) observedSelectorProperties(value.left, properties)
  if (value.right !== undefined) observedSelectorProperties(value.right, properties)
  return properties
}

function compileQuery(selectorText: string, selector: Selector): QueryPlan {
  const value = selector as Selector & { type: string; selectors?: Selector[] }
  const selectors = value.type === 'matches' ? value.selectors ?? [] : [selector]
  const branches = selectors.map((branch, index) => ({
    key: `${selectorText}\0${index}`,
    selector: branch,
    segments: selectorSegments(branch),
    merkleSafe: merkleSafeSelector(branch),
  }))
  return {
    key: selectorText,
    selector,
    branches,
    indexable: branches.every(branch => branch.segments?.at(-1)?.kinds !== undefined),
    sourceFile: selectors.length === 1 && selectors[0]!.type === 'identifier'
      && selectorKinds(selectors[0]!)?.[0] === ts.SyntaxKind.SourceFile,
    dependencies: selectorDependencies(selector),
    observedProperties: [...observedSelectorProperties(selector)],
  }
}

function queryPlan(selector: string): QueryPlan {
  const cached = selectorCache.get(selector)
  if (cached !== undefined) {
    selectorCache.delete(selector)
    selectorCache.set(selector, cached)
    return cached
  }
  const parsed = compileQuery(selector, tsquery.parse.ensure(selector))
  if (selectorCache.size >= SELECTOR_CACHE_LIMIT) selectorCache.delete(selectorCache.keys().next().value!)
  selectorCache.set(selector, parsed)
  return parsed
}

function sourceFingerprint(filename: string, source: string): string {
  return createHash('sha256')
    .update(String(sourceScriptKind(filename)))
    .update('\0')
    .update(source)
    .digest('base64url')
}

function sourcePatchFingerprint(patch: HarmonySourcePatch): string {
  const cached = sourcePatchFingerprints.get(patch)
  if (cached !== undefined) return cached
  const fingerprint = createHash('sha256')
    .update(JSON.stringify({
      id: patch.id,
      target: patch.target,
      select: patch.select,
      expect: patch.expect,
      trace: patch.trace,
      before: patch.before,
      after: patch.after,
    }))
    .update('\0')
    .update(Function.prototype.toString.call(patch.apply))
    .digest('base64url')
  sourcePatchFingerprints.set(patch, fingerprint)
  return fingerprint
}

function patchTransitionKey(
  registered: PatchIdentity,
  patch: HarmonySourcePatch,
  fingerprint: string,
): string {
  return `${fingerprint}\0${registered.key}\0${registered.fingerprint ?? ''}\0${sourcePatchFingerprint(patch)}`
}

function rememberPatchTransition(key: string, entry: PatchTransitionCacheEntry): void {
  patchTransitionCache.delete(key)
  if (patchTransitionCache.size >= PATCH_TRANSITION_CACHE_LIMIT) {
    patchTransitionCache.delete(patchTransitionCache.keys().next().value!)
  }
  patchTransitionCache.set(key, entry)
}

function sourceOrder(left: ts.Node, right: ts.Node): number {
  return left.pos - right.pos || right.end - left.end
}

function nodeRoot(node: ts.Node): ts.Node {
  while (node.parent !== undefined) node = node.parent
  return node
}

interface NodeMerkleHash {
  left: number
  right: number
  key: string
  nodes: number
}

function mixHash(hash: number, value: number, prime: number): number {
  return Math.imul(hash ^ value, prime) >>> 0
}

class AstIndex {
  private readonly known = new WeakSet<ts.Node>()
  private readonly byKind = new Map<ts.SyntaxKind, ts.Node[]>()
  private readonly cleanedGeneration = new Map<ts.SyntaxKind, number>()
  private readonly dirtyKinds = new Set<ts.SyntaxKind>()
  private readonly merkleHashes = new WeakMap<ts.Node, NodeMerkleHash>()
  private generation = 0
  private updating = false

  constructor(public sourceFile: ts.SourceFile) {
    this.addNewNodes(sourceFile)
    for (const kind of this.byKind.keys()) this.cleanedGeneration.set(kind, this.generation)
  }

  update(sourceFile: ts.SourceFile): void {
    this.sourceFile = sourceFile
    this.generation += 1
    this.updating = true
    this.addNewNodes(sourceFile)
    this.updating = false
  }

  query(plan: QueryPlan, root: ts.Node = this.sourceFile): ts.Node[] {
    if (plan.sourceFile) return root.kind === ts.SyntaxKind.SourceFile ? [root] : []
    if (!plan.indexable || plan.dependencies.siblings || plan.dependencies.childPosition
      || plan.dependencies.siblingCount || plan.dependencies.source) {
      return this.queryAutomaton(plan, root)
    }
    const matches = plan.branches.flatMap(branch => this.queryBranch(branch, root))
    return [...new Set(matches)].sort(sourceOrder)
  }

  resolve(locators: ReadonlyArray<MatchLocator>): ts.Node[] {
    const indexed = new Map<string, ts.Node[]>()
    for (const kind of new Set(locators.map(locator => locator.kind))) {
      const nodes = this.nodes(kind)
      if (nodes === undefined) return resolveLocators(this.sourceFile, locators)
      for (const node of nodes) {
        const key = `${kind}\0${node.pos}\0${node.end}`
        const nodes = indexed.get(key) ?? []
        nodes.push(node)
        indexed.set(key, nodes)
      }
    }
    return locators.map(locator => (
      indexed.get(`${locator.kind}\0${locator.pos}\0${locator.end}`)![locator.occurrence]!
    ))
  }

  private nodes(kind: ts.SyntaxKind): ts.Node[] | undefined {
    let bucket = this.byKind.get(kind)
    if (bucket === undefined) return undefined
    if (this.cleanedGeneration.get(kind) !== this.generation) {
      bucket = bucket.filter(node => nodeRoot(node) === this.sourceFile)
      this.byKind.set(kind, bucket)
      this.cleanedGeneration.set(kind, this.generation)
    }
    if (this.dirtyKinds.delete(kind)) bucket.sort(sourceOrder)
    return bucket
  }

  private addNewNodes(node: ts.Node): void {
    if (this.known.has(node)) return
    this.known.add(node)
    const bucket = this.byKind.get(node.kind) ?? []
    bucket.push(node)
    this.byKind.set(node.kind, bucket)
    if (this.updating) this.dirtyKinds.add(node.kind)
    ts.forEachChild(node, child => this.addNewNodes(child))
  }

  private queryBranch(branch: QueryBranch, root: ts.Node): ts.Node[] {
    const segments = branch.segments
    if (segments === undefined || segments.length === 0) return tsquery(root, branch.selector)
    const targetKinds = segments.at(-1)!.kinds
    if (targetKinds === undefined) return tsquery(root, branch.selector)

    const choices = segments.flatMap((segment, index) => {
      const candidates = this.segmentCandidates(segment, root)
      return candidates === undefined ? [] : [{ index, candidates }]
    })
    if (choices.length === 0) return tsquery(root, branch.selector)
    const best = choices.reduce((left, right) => right.candidates.length < left.candidates.length ? right : left)
    if (best.index === 0 && segments.length > 1 && branch.merkleSafe) {
      return best.candidates.flatMap(anchor => this.queryMerkleBranch(branch, anchor, targetKinds))
    }
    let candidates: ts.Node[]
    if (best.index === segments.length - 1) {
      candidates = best.candidates
    } else {
      const kinds = new Set(targetKinds)
      const found = new Set<ts.Node>()
      const visit = (node: ts.Node): void => {
        if (kinds.has(node.kind)) found.add(node)
        for (const child of node.getChildren()) visit(child)
      }
      for (const anchor of best.candidates) visit(anchor)
      candidates = [...found]
    }
    return candidates.filter(node => findMatches(node, branch.selector, nodeAncestors(node)))
  }

  private segmentCandidates(segment: QuerySegment, root: ts.Node): ts.Node[] | undefined {
    if (segment.kinds === undefined) return undefined
    const buckets = segment.kinds.map(kind => this.nodes(kind))
    if (buckets.some(bucket => bucket === undefined)) return undefined
    const candidates = buckets.flatMap(bucket => bucket!)
    const nodes = segment.kinds.length === 1 ? candidates : [...new Set(candidates)]
    return nodes.filter(node => nodeWithin(node, root)
      && segment.attributes.every(attribute => {
        const value = selectorProperty(node, attribute.name)
        return value !== undefined && `${value}` === `${attribute.value}`
      }))
  }

  private queryMerkleBranch(branch: QueryBranch, anchor: ts.Node, targetKinds: ts.SyntaxKind[]): ts.Node[] {
    const key = `${branch.key}\0${this.merkleHash(anchor).key}`
    const cached = merkleQueryCache.get(key)
    if (cached !== undefined) {
      merkleQueryCache.delete(key)
      merkleQueryCache.set(key, cached)
      return resolveRelativeLocators(anchor, cached, this.sourceFile)
    }

    const kinds = new Set(targetKinds)
    const matches: ts.Node[] = []
    const visit = (node: ts.Node): void => {
      if (kinds.has(node.kind) && findMatches(node, branch.selector, nodeAncestors(node))) matches.push(node)
      for (const child of node.getChildren()) visit(child)
    }
    visit(anchor)
    const locators = relativeLocators(anchor, matches, this.sourceFile)
    if (merkleQueryCache.size >= MERKLE_QUERY_CACHE_LIMIT) {
      merkleQueryCache.delete(merkleQueryCache.keys().next().value!)
    }
    merkleQueryCache.set(key, locators)
    return matches
  }

  private merkleHash(node: ts.Node): NodeMerkleHash {
    const cached = this.merkleHashes.get(node)
    if (cached !== undefined) return cached
    let left = mixHash(2_166_136_261, node.kind, 16_777_619)
    let right = mixHash(2_654_435_761, node.kind, 2_246_822_519)
    let nodes = 1
    const children = node.getChildren()
    let cursor = node.getStart(this.sourceFile)
    const mixRange = (start: number, end: number): void => {
      left = mixHash(left, end - start, 16_777_619)
      right = mixHash(right, end - start, 2_246_822_519)
      for (let offset = start; offset < end; offset += 1) {
        const code = this.sourceFile.text.charCodeAt(offset)
        left = mixHash(left, code, 16_777_619)
        right = mixHash(right, code, 2_246_822_519)
      }
    }
    for (const child of children) {
      const childStart = child.getStart(this.sourceFile)
      if (childStart > cursor) mixRange(cursor, childStart)
      const childHash = this.merkleHash(child)
      nodes += childHash.nodes
      left = mixHash(mixHash(left, childHash.left, 16_777_619), childHash.right, 16_777_619)
      right = mixHash(mixHash(right, childHash.right, 2_246_822_519), childHash.left, 2_246_822_519)
      cursor = Math.max(cursor, child.getEnd())
    }
    if (cursor < node.getEnd()) mixRange(cursor, node.getEnd())
    const hash = {
      left,
      right,
      nodes,
      key: `${node.kind}:${node.getEnd() - node.getStart(this.sourceFile)}:${left}:${right}`,
    }
    this.merkleHashes.set(node, hash)
    return hash
  }

  private queryAutomaton(plan: QueryPlan, root: ts.Node): ts.Node[] {
    const evaluate = (node: ts.Node): ts.Node[] => {
      const hash = this.merkleHash(node)
      const key = `${plan.key}\0${hash.key}\0${this.automatonContext(node, plan)}`
      if (hash.nodes >= 16) {
        const cached = automatonCache.get(key)
        if (cached !== undefined) {
          automatonCache.delete(key)
          automatonCache.set(key, cached)
          return resolveRelativeLocators(node, cached, this.sourceFile)
        }
      }
      const matches = findMatches(node, plan.selector, nodeAncestors(node)) ? [node] : []
      for (const child of node.getChildren()) matches.push(...evaluate(child))
      if (hash.nodes >= 16 && matches.length <= 128) {
        if (automatonCache.size >= MERKLE_QUERY_CACHE_LIMIT) {
          automatonCache.delete(automatonCache.keys().next().value!)
        }
        automatonCache.set(key, relativeLocators(node, matches, this.sourceFile))
      }
      return matches
    }
    return evaluate(root).sort(sourceOrder)
  }

  private automatonContext(node: ts.Node, plan: QueryPlan): string {
    const { dependencies, observedProperties } = plan
    const parts = observedProperties.map(property => `${property}=${String(selectorProperty(node, property))}`)
    if (dependencies.childPosition || dependencies.siblingCount || dependencies.siblings) {
      parts.push(`position=${visitorPosition(node, dependencies.siblingCount)}`)
    }
    if (dependencies.siblings && node.parent !== undefined) {
      parts.push(`siblings=${this.merkleHash(node.parent).key}`)
    }
    if (dependencies.ancestors) {
      for (let ancestor = node.parent; ancestor !== undefined; ancestor = ancestor.parent) {
        parts.push(`ancestor=${this.merkleHash(ancestor).key}`)
        for (const property of observedProperties) {
          parts.push(`${property}=${String(selectorProperty(ancestor, property))}`)
        }
        parts.push(`path=${visitorPosition(ancestor, true)}`)
      }
    }
    if (dependencies.source) parts.push(`source=${this.merkleHash(this.sourceFile).key}`)
    return parts.join('|')
  }
}

function nodeAncestors(node: ts.Node): ts.Node[] {
  const ancestors: ts.Node[] = []
  for (let parent = node.parent; parent !== undefined; parent = parent.parent) ancestors.push(parent)
  return ancestors
}

function nodeWithin(node: ts.Node, root: ts.Node): boolean {
  if (node === root) return true
  if (node.pos < root.pos || node.end > root.end) return false
  for (let parent = node.parent; parent !== undefined; parent = parent.parent) {
    if (parent === root) return true
  }
  return false
}

function selectorProperty(node: ts.Node, path: string): unknown {
  let value: unknown = node
  for (const key of path.split('.')) {
    if (value == null) return value
    const properties = typeof (value as ts.Node).getSourceFile === 'function'
      ? getProperties(value as ts.Node) as unknown as Record<string, unknown>
      : {}
    const record = value as Record<string, unknown>
    value = key in properties ? properties[key] : record[key]
  }
  return value
}

function visitorPosition(node: ts.Node, includeLength: boolean): string {
  const parent = node.parent as (ts.Node & Record<string, unknown>) | undefined
  if (parent === undefined) return 'root'
  for (const key of getVisitorKeys(parent)) {
    const value = parent[key]
    if (!Array.isArray(value)) continue
    const index = value.indexOf(node)
    if (index >= 0) return includeLength ? `${key}:${index}:${value.length}` : `${key}:${index}`
  }
  return 'property'
}

function relativeLocators(
  root: ts.Node,
  matches: ReadonlyArray<ts.Node>,
  sourceFile: ts.SourceFile,
): RelativeMatchLocator[] {
  const rootStart = root.getStart(sourceFile)
  const occurrences = new Map<string, number>()
  return matches.map(node => {
    const start = node.getStart(sourceFile) - rootStart
    const end = node.getEnd() - rootStart
    const key = `${node.kind}\0${start}\0${end}`
    const occurrence = occurrences.get(key) ?? 0
    occurrences.set(key, occurrence + 1)
    return { kind: node.kind, start, end, occurrence }
  })
}

function resolveRelativeLocators(
  root: ts.Node,
  locators: ReadonlyArray<RelativeMatchLocator>,
  sourceFile: ts.SourceFile,
): ts.Node[] {
  if (locators.length === 0) return []
  const rootStart = root.getStart(sourceFile)
  const results = new Array<ts.Node>(locators.length)
  const occurrences = new Map<string, number>()
  const visit = (node: ts.Node, indexes: number[]): void => {
    const start = node.getStart(sourceFile) - rootStart
    const end = node.getEnd() - rootStart
    const matching = indexes.filter(index => {
      const locator = locators[index]!
      return node.kind === locator.kind && start === locator.start && end === locator.end
    })
    if (matching.length > 0) {
      const key = `${node.kind}\0${start}\0${end}`
      const occurrence = occurrences.get(key) ?? 0
      occurrences.set(key, occurrence + 1)
      for (const index of matching) {
        if (locators[index]!.occurrence === occurrence) results[index] = node
      }
    }
    for (const child of node.getChildren()) {
      const childStart = child.getStart(sourceFile) - rootStart
      const childEnd = child.getEnd() - rootStart
      const contained = indexes.filter(index => {
        const locator = locators[index]!
        return locator.start >= childStart && locator.end <= childEnd
      })
      if (contained.length > 0) visit(child, contained)
    }
  }
  visit(root, locators.map((_, index) => index))
  return results
}

export interface SourceAst {
  sourceFile: ts.SourceFile
  index?: AstIndex
  fingerprint: string
  incremental?: boolean
}

function rememberSourceAst(filename: string, sourceAst: SourceAst): SourceAst {
  sourceAstCache.delete(filename)
  if (sourceAstCache.size >= SOURCE_AST_CACHE_LIMIT) sourceAstCache.delete(sourceAstCache.keys().next().value!)
  sourceAstCache.set(filename, sourceAst)
  return sourceAst
}

function createSourceAst(filename: string, source: string, persistent = true): SourceAst {
  const fingerprint = sourceFingerprint(filename, source)
  const cached = persistent ? sourceAstCache.get(filename) : undefined
  if (cached !== undefined) {
    if (cached.fingerprint === fingerprint) return rememberSourceAst(filename, cached)
    const delta = sourceDelta(cached.sourceFile.text, source)
    if (cached.incremental === false
      || delta.removed + delta.inserted.length > Math.max(4_096, source.length / 4)) {
      return rememberSourceAst(filename, {
        sourceFile: parseSource(filename, source), fingerprint, incremental: true,
      })
    }
    cached.incremental = false
    const sourceFile = ts.updateSourceFile(cached.sourceFile, source, ts.createTextChangeRange(
      ts.createTextSpan(delta.start, delta.removed),
      delta.inserted.length,
    ))
    cached.index?.update(sourceFile)
    return rememberSourceAst(filename, { sourceFile, index: cached.index, fingerprint, incremental: true })
  }
  const sourceAst = { sourceFile: parseSource(filename, source), fingerprint, incremental: true }
  return persistent ? rememberSourceAst(filename, sourceAst) : sourceAst
}

function resolveLocators(sourceFile: ts.SourceFile, locators: ReadonlyArray<MatchLocator>): ts.Node[] {
  if (locators.length === 0) return []
  const results = new Array<ts.Node>(locators.length)
  const occurrences = new Map<string, number>()
  const visit = (node: ts.Node, indexes: number[]): void => {
    const matching = indexes.filter(index => {
      const locator = locators[index]!
      return node.kind === locator.kind && node.pos === locator.pos && node.end === locator.end
    })
    if (matching.length > 0) {
      const key = `${node.kind}\0${node.pos}\0${node.end}`
      const occurrence = occurrences.get(key) ?? 0
      occurrences.set(key, occurrence + 1)
      for (const index of matching) {
        if (locators[index]!.occurrence === occurrence) results[index] = node
      }
    }
    for (const child of node.getChildren()) {
      const contained = indexes.filter(index => {
        const locator = locators[index]!
        return locator.pos >= child.pos && locator.end <= child.end
      })
      if (contained.length > 0) visit(child, contained)
    }
  }
  visit(sourceFile, locators.map((_, index) => index))
  return results
}

function query(sourceAst: SourceAst, selectorText: string): ts.Node[] {
  const plan = queryPlan(selectorText)
  if (plan.sourceFile) return [sourceAst.sourceFile]
  let cached = queryCache.get(sourceAst.fingerprint)
  if (cached !== undefined) {
    queryCache.delete(sourceAst.fingerprint)
    queryCache.set(sourceAst.fingerprint, cached)
    const locators = cached.queries.get(selectorText)
    if (locators !== undefined) {
      return sourceAst.index === undefined
        ? resolveLocators(sourceAst.sourceFile, locators)
        : sourceAst.index.resolve(locators)
    }
  }

  const nodes = (sourceAst.index ??= new AstIndex(sourceAst.sourceFile)).query(plan)
  if (cached === undefined) {
    if (queryCache.size >= QUERY_CACHE_LIMIT) queryCache.delete(queryCache.keys().next().value!)
    cached = { queries: new Map() }
    queryCache.set(sourceAst.fingerprint, cached)
  }
  const occurrences = new Map<string, number>()
  cached.queries.set(selectorText, nodes.map(node => {
    const key = `${node.kind}\0${node.pos}\0${node.end}`
    const occurrence = occurrences.get(key) ?? 0
    occurrences.set(key, occurrence + 1)
    return { kind: node.kind, pos: node.pos, end: node.end, occurrence }
  }))
  return nodes
}

function queryWithin(sourceAst: SourceAst, selectorText: string, root: ts.Node): ts.Node[] {
  if (root === sourceAst.sourceFile) return query(sourceAst, selectorText)
  const plan = queryPlan(selectorText)
  return (sourceAst.index ??= new AstIndex(sourceAst.sourceFile)).query(plan, root)
}

function sourceAstFor(
  filename: string,
  source: string,
  previous?: SourceAst,
  previousDelta?: SourceDelta,
): SourceAst {
  if (previous === undefined) return createSourceAst(filename, source)
  if (previous.sourceFile.text === source) return rememberSourceAst(filename, previous)
  if (previous.incremental === false) return createSourceAst(filename, source)
  const delta = previousDelta ?? sourceDelta(previous.sourceFile.text, source)
  previous.incremental = false
  const sourceFile = ts.updateSourceFile(previous.sourceFile, source, ts.createTextChangeRange(
    ts.createTextSpan(delta.start, delta.removed),
    delta.inserted.length,
  ))
  previous.index?.update(sourceFile)
  return rememberSourceAst(filename, {
    sourceFile,
    index: previous.index,
    fingerprint: sourceFingerprint(filename, source),
    incremental: true,
  })
}

function matches(filename: string, source: string, selector: string): boolean {
  return query(createSourceAst(filename, source, false), selector).length > 0
}

function conflictOwner(filename: string, original: string, selector: string, history: ReadonlyArray<{ owner: string; source: string }>): string | undefined {
  let hadMatch = matches(filename, original, selector)
  let conflict: string | undefined
  for (const step of history) {
    const hasMatch = matches(filename, step.source, selector)
    if (hadMatch && !hasMatch) conflict = step.owner
    hadMatch = hasMatch
  }
  return conflict
}

function expectedMatches(registered: PatchIdentity, patch: HarmonyPatch, count: number, target: string): void {
  const expected = 'expect' in patch ? patch.expect : undefined
  if (expected === undefined && count > 0 || expected === count) return
  const wanted = expected === undefined ? 'at least 1' : String(expected)
  throw new Error(`dsh-harmony: patch ${JSON.stringify(registered.key)} expected ${wanted} match(es) in ${target}, found ${count}`)
}

export function applySourcePatch(
  filename: string,
  target: string,
  source: string,
  original: string,
  registered: PatchIdentity,
  patch: HarmonySourcePatch,
  history: ReadonlyArray<{ owner: string }>,
  historySources: () => ReadonlyArray<{ owner: string; source: string }>,
  previousSourceAst?: SourceAst,
  previousDelta?: SourceDelta,
): { source: string; matches: number; sourceAst: SourceAst; delta: SourceDelta } {
  const fingerprint = sourceFingerprint(filename, source)
  const transitionKey = patchTransitionKey(registered, patch, fingerprint)
  const cachedTransition = patchTransitionCache.get(transitionKey)
  if (cachedTransition !== undefined) {
    patchTransitionCache.delete(transitionKey)
    patchTransitionCache.set(transitionKey, cachedTransition)
    return {
      source: cachedTransition.output,
      matches: cachedTransition.matches,
      sourceAst: previousSourceAst?.sourceFile.text === source
        ? previousSourceAst
        : { sourceFile: cachedTransition.sourceFile, fingerprint, incremental: false },
      delta: cachedTransition.delta,
    }
  }
  const sourceAst = sourceAstFor(filename, source, previousSourceAst, previousDelta)
  const { sourceFile } = sourceAst
  const nodes = query(sourceAst, patch.select)
  try {
    expectedMatches(registered, patch, nodes.length, target)
  } catch (error) {
    if (nodes.length === 0) {
      const conflicting = conflictOwner(filename, original, patch.select, historySources())
      const reason = conflicting === undefined
        ? 'the selector matched no code in the original target'
        : `plugin ${JSON.stringify(conflicting)} removed or changed the selected code`
      throw Object.assign(new Error([
        `dsh-harmony: patch ${JSON.stringify(registered.key)} could not patch ${target}`,
        `  selector: ${patch.select}`,
        `  conflict: ${reason}`,
      ].join('\n')), { matches: nodes.length })
    }
    throw Object.assign(error as Error, { matches: nodes.length })
  }
  const tracked = trackedEdit(source)
  const { edit } = tracked
  try {
    for (const node of nodes) patch.apply({
      patch: { key: registered.key, owner: registered.owner },
      source,
      sourceFile,
      node,
      edit,
      ts,
      query: (selector, root = sourceFile) => queryWithin(sourceAst, selector, root),
    })
  } catch (cause) {
    const applied = [...new Set(history.map(step => step.owner))]
    throw new Error([
      `dsh-harmony: patch ${JSON.stringify(registered.key)} failed while patching ${target}`,
      `  selector: ${patch.select}`,
      `  already applied: ${applied.length === 0 ? '(none)' : applied.join(', ')}`,
      `  error: ${cause instanceof Error ? cause.message : String(cause)}`,
    ].join('\n'), { cause })
  }
  const rendered = edit.toString()
  const nextSource = rendered === source ? source : rendered
  const delta = tracked.delta(nextSource)
  if (nextSource !== source) {
    rememberPatchTransition(transitionKey, {
      sourceFile,
      output: nextSource,
      matches: nodes.length,
      delta,
    })
  }
  return { source: nextSource, matches: nodes.length, sourceAst, delta }
}

interface SourceTraceMetadata {
  key: string
  owner: string
  effect: NonNullable<HarmonySourcePatch['trace']>['effect']
  declaration: string
  target: { package: string; file: string }
  confidence: 'candidate'
}

function jsxRuntimeExpression(sourceFile: ts.SourceFile, node: ts.Node, source: string): string | undefined {
  if (!ts.isCallExpression(node)) return undefined
  let expression: ts.Expression = node.expression
  while (ts.isParenthesizedExpression(expression)) expression = expression.expression
  if (!ts.isBinaryExpression(expression) || expression.operatorToken.kind !== ts.SyntaxKind.CommaToken
    || !ts.isPropertyAccessExpression(expression.right)
    || (expression.right.name.text !== 'jsx' && expression.right.name.text !== 'jsxs')) return undefined
  return source.slice(expression.right.expression.getStart(sourceFile), expression.right.expression.getEnd())
}

function uniqueIdentifier(node: ts.Node, base: string): string {
  const names = new Set<string>()
  const visit = (current: ts.Node): void => {
    if (ts.isIdentifier(current)) names.add(current.text)
    ts.forEachChild(current, visit)
  }
  visit(node)
  let name = base
  let suffix = 0
  while (names.has(name)) name = `${base}${++suffix}`
  return name
}

export function instrumentSourceTraces<T extends PatchIdentity>(
  filename: string,
  source: string,
  target: { package: string; file: string },
  patches: BoundSourceTrace<T>[],
): string {
  if (process.env.DSH_HARMONY_REACT_TRACE !== '1' || patches.length === 0) return source
  const sourceAst = createSourceAst(filename, source)
  const { sourceFile } = sourceAst
  const traced = new Map<string, { node: ts.CallExpression; runtime: string; traces: SourceTraceMetadata[] }>()
  for (const { registered, patch } of patches) {
    const trace = patch.trace
    if (trace === undefined) continue
    let nodes: ts.Node[]
    try {
      nodes = query(sourceAst, trace.select)
    } catch {
      continue
    }
    if (nodes.length === 0 || nodes.length > trace.maxMatches) continue
    for (const node of nodes) {
      const runtime = jsxRuntimeExpression(sourceFile, node, source)
      if (!ts.isCallExpression(node) || runtime === undefined) continue
      const key = `${node.getStart(sourceFile)}:${node.getEnd()}`
      const current = traced.get(key) ?? { node, runtime, traces: [] }
      current.traces.push({
        key: registered.key,
        owner: registered.owner,
        effect: trace.effect,
        declaration: registered.declaration,
        target,
        confidence: 'candidate',
      })
      traced.set(key, current)
    }
  }
  if (traced.size === 0) return source

  const helper = uniqueIdentifier(sourceFile, '__dshHarmonyPatchTrace')
  const edit = new MagicString(source)
  for (const { node, runtime, traces } of traced.values()) {
    const key = node.arguments[2]
    const keyArgument = key === undefined ? '' : `, ${source.slice(key.getStart(sourceFile), key.getEnd())}`
    edit.prependLeft(node.getStart(sourceFile), `(0, ${runtime}.jsx)(${helper}, { traces: ${JSON.stringify(traces)}, children: `)
    edit.appendRight(node.getEnd(), ` }${keyArgument})`)
  }
  const firstStatement = sourceFile.statements.find(statement => !ts.isExpressionStatement(statement)
    || !ts.isStringLiteral(statement.expression))
  const insertion = firstStatement?.getStart(sourceFile) ?? source.length
  edit.appendLeft(insertion, `function ${helper}(props){return props.children}\n${helper}.__dshHarmonyPatchTrace=true;\n`)
  return edit.toString()
}

type SemanticFunction = ts.FunctionDeclaration | ts.MethodDeclaration

function semanticName(node: SemanticFunction): string | undefined {
  if (ts.isFunctionDeclaration(node)) return node.name?.text
  const name = node.name && (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name)) ? node.name.text : undefined
  if (name === undefined) return undefined
  const parent = node.parent
  if (ts.isClassDeclaration(parent) || ts.isClassExpression(parent)) return parent.name === undefined ? name : `${parent.name.text}.${name}`
  return name
}

function semanticFunctions(sourceFile: ts.SourceFile, requested: string): SemanticFunction[] {
  const found: SemanticFunction[] = []
  const visit = (node: ts.Node): void => {
    if ((ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node))
      && (semanticName(node) === requested || !requested.includes('.') && node.name?.getText(sourceFile) === requested)) found.push(node)
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return found
}

export function semanticMatchCount(
  filename: string,
  source: string,
  target: string,
  functionName: string,
  registered: PatchIdentity,
  patch: HarmonySemanticPatch,
): number {
  const count = semanticFunctions(parseSource(filename, source), functionName).length
  expectedMatches(registered, patch, count, target)
  return count
}

export function assertNoReplaceConflict<T extends PatchIdentity>(functionName: string, registered: BoundSemanticPatch<T>[]): void {
  const replacements = registered.filter(item => item.patch.operation === 'replace')
  if (replacements.length > 1) {
    throw new Error(`dsh-harmony: replace conflict in ${functionName}: ${replacements.map(item => item.registered.key).join(', ')}`)
  }
}

export function instrumentSemantic(
  filename: string,
  source: string,
  target: string,
  functionName: string,
  registered: PatchIdentity,
  patch: HarmonySemanticPatch,
  bindingKey: string,
): { source: string; matches: number; bindingKey: string } {
  const sourceFile = parseSource(filename, source)
  const nodes = semanticFunctions(sourceFile, functionName)
  expectedMatches(registered, patch, nodes.length, target)
  const edit = new MagicString(source)
  for (const node of nodes) {
    if (node.asteriskToken !== undefined) throw new Error(`dsh-harmony: semantic patches do not support generator ${functionName}`)
    if (node.body === undefined) throw new Error(`dsh-harmony: semantic target ${functionName} has no body`)
    const argsName = uniqueIdentifier(node, '__dshHarmonyArgs')
    const indexName = uniqueIdentifier(node, '__dshHarmonyIndex')
    const lengthName = uniqueIdentifier(node, '__dshHarmonyLength')
    const changedName = uniqueIdentifier(node, '__dshHarmonyChanged')
    const assignments = node.parameters.map((parameter, index) => {
      if (!ts.isIdentifier(parameter.name)) throw new Error(`dsh-harmony: semantic target ${functionName} requires named parameters`)
      return parameter.dotDotDotToken === undefined
        ? `${parameter.name.text} = ${parameter.initializer === undefined
          ? `${argsName}[${index}]`
          : `${argsName}[${index}] === undefined ? ${parameter.initializer.getText(sourceFile)} : ${argsName}[${index}]`};`
        : `${parameter.name.text} = ${argsName}.slice(${index});`
    }).join('')
    const synchronizeArguments = `const ${lengthName}=arguments.length;for(let ${indexName}=${argsName}.length;${indexName}<${lengthName};${indexName}++)delete arguments[${indexName}];for(let ${indexName}=0;${indexName}<${argsName}.length;${indexName}++)arguments[${indexName}]=${argsName}[${indexName}];arguments.length=${argsName}.length;`
    const synchronizeParameters = `const ${changedName}=${argsName}.length!==arguments.length||${argsName}.some((${argsName},${indexName})=>${argsName}!==arguments[${indexName}]);if(${changedName}){${synchronizeArguments}${assignments}}`
    const body = source.slice(node.body.getStart(sourceFile) + 1, node.body.getEnd() - 1)
    const callback = node.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.AsyncKeyword) ? 'async ' : ''
    edit.overwrite(node.body.getStart(sourceFile) + 1, node.body.getEnd() - 1,
      `return globalThis.__dshHarmonyInvoke(${JSON.stringify(bindingKey)}, this, Array.from(arguments), ${callback}(${argsName}) => {${synchronizeParameters}${body}});`)
  }
  return { source: edit.toString(), matches: nodes.length, bindingKey }
}
