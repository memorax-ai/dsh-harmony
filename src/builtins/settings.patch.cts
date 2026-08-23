import type ts from 'typescript'
import type { HarmonySourcePatch } from '../index.js'

function exactlyOne<T extends ts.Node>(nodes: T[], description: string): T {
  if (nodes.length !== 1) {
    throw new Error(`expected one ${description}, found ${nodes.length}`)
  }
  return nodes[0]!
}

const patch: HarmonySourcePatch = {
  id: 'settings-integration',
  description: 'Adds Harmony Patch management to the DSH Settings window.',
  target: {
    package: '@deepseek-ai/dsh-client-ui-settings-general',
    version: '>=0.1.0-rc.8',
    file: 'lib/client.js',
  },
  select: 'SourceFile',
  expect: 1,
  apply({ sourceFile, edit, ts: typescript, query }) {
    const settingsPanel = exactlyOne(
      query('FunctionDeclaration').filter((node) => {
        const declaration = node as ts.FunctionDeclaration
        return declaration.name?.text === 'SettingsPanel'
      }),
      'SettingsPanel declaration',
    )
    const panelClass = exactlyOne(
      query('PropertyAssignment', settingsPanel).filter((node) => {
        const property = node as ts.PropertyAssignment
        return property.name.getText(sourceFile) === 'className'
          && property.initializer.getText(sourceFile) === 'SettingsRoot_module_css_default.panel'
      }),
      'SettingsPanel className',
    ) as ts.PropertyAssignment
    edit.overwrite(
      panelClass.initializer.getStart(sourceFile),
      panelClass.initializer.getEnd(),
      'SettingsRoot_module_css_default.panel + " dshHarmonySettingsPanel"',
    )

    const navIcon = exactlyOne(
      query('FunctionDeclaration').filter((node) => {
        const declaration = node as ts.FunctionDeclaration
        return declaration.name?.text === 'navIcon'
      }),
      'navIcon declaration',
    ) as ts.FunctionDeclaration
    if (navIcon.body === undefined) throw new Error('navIcon has no body')
    edit.prependLeft(navIcon.body.getStart(sourceFile) + 1, `
\t\t\tif (id === "harmony") return (0, react_jsx_runtime.jsx)("span", {
\t\t\t\tclassName: SettingsRoot_module_css_default.navIcon + " dshHarmonyNavIcon",
\t\t\t\t"aria-hidden": true
\t\t\t});`)

    const close = exactlyOne(
      query('VariableDeclaration').filter((node) => {
        const declaration = node as ts.VariableDeclaration
        return typescript.isIdentifier(declaration.name) && declaration.name.text === 'close'
      }),
      'close declaration',
    )
    const closeCallback = exactlyOne(query('ArrowFunction', close), 'close callback') as ts.ArrowFunction
    edit.prependLeft(closeCallback.getStart(sourceFile), 'async ')
    edit.prependLeft(closeCallback.body.getStart(sourceFile) + 1, `
        const harmonyGuard = globalThis.__dshHarmonyBeforeSettingsClose;
        if (harmonyGuard && !await harmonyGuard()) return;`)

    const onSelect = exactlyOne(
      query('PropertyAssignment').filter((node) => {
        const property = node as ts.PropertyAssignment
        return property.name.getText(sourceFile) === 'onSelect'
          && property.initializer.getText(sourceFile) === 'setActiveId'
      }),
      'SettingsPanel onSelect property',
    ) as ts.PropertyAssignment
    edit.overwrite(onSelect.initializer.getStart(sourceFile), onSelect.initializer.getEnd(), `async (id) => {
          const harmonyGuard = globalThis.__dshHarmonyBeforeSettingsClose;
          if (harmonyGuard && !await harmonyGuard()) return;
          setActiveId(id);
        }`)
  },
}

module.exports = patch
