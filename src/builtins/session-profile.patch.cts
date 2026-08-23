import type ts from 'typescript'
import type { HarmonySourcePatch } from '../index.js'

const patch: HarmonySourcePatch = {
  id: 'session-profile-guard',
  description: 'Checks a session-bound Patch profile before its history is loaded.',
  target: {
    package: '@deepseek-ai/dsh-client-runtime',
    version: '>=0.1.0-rc.8',
    file: 'lib/client.js',
  },
  select: 'SourceFile',
  expect: 1,
  apply({ sourceFile, edit, query }) {
    const opens = query('MethodDeclaration').filter((node) => {
      const method = node as ts.MethodDeclaration
      return method.name.getText(sourceFile) === 'open'
        && method.body?.getText(sourceFile).includes('this.doOpen(this.openGeneration)') === true
    }) as ts.MethodDeclaration[]
    if (opens.length !== 1) throw new Error(`expected one Session.open declaration, found ${opens.length}`)
    const calls = query('CallExpression', opens[0]!).filter(node =>
      node.getText(sourceFile) === 'this.doOpen(this.openGeneration)') as ts.CallExpression[]
    if (calls.length !== 1) throw new Error(`expected one Session.doOpen call, found ${calls.length}`)
    edit.overwrite(calls[0]!.getStart(sourceFile), calls[0]!.getEnd(), `Promise.resolve(
          globalThis.__dshHarmonyBeforeSessionOpen?.(this.sessionId) ?? true
        ).then((allowed) => allowed ? this.doOpen(this.openGeneration) : undefined)`)
  },
}

module.exports = patch
