---
name: use-dsh-harmony
description: Install and operate dsh-harmony, choose between Source, Semantic, Loader, React-aware, and Studio Patches, author Patch provider plugins, inspect transformed runtime source, control order and enablement, and troubleshoot failed or incompatible Patches. Use when an agent is asked to install Harmony, modify DeepSeek Harness Host or WebUI plugins without forks, create, review, or debug Harmony providers, integrate dsh-harmony-react or Studio previews, or diagnose Harmony status, ordering, reload, version, selector, or profile issues.
---

# Use dsh-harmony

Modify compiled DeepSeek Harness plugins at runtime through a separate Patch provider. Never edit or replace the installed target package.

## Decide first

Identify the active profile, target package, installed version, compiled target file, runtime side, and intended behavior before writing a Patch.

| Need | Choose |
| --- | --- |
| Patch a browser bundle such as `lib/client.js` | Source Patch |
| Match syntax, literals, imports, or arbitrary compiled structure | Source Patch |
| Decorate a named Node.js function or class method | Semantic Patch |
| Load a target package that publishes TypeScript instead of runnable JavaScript | Loader Patch, plus exact Source Patches when needed |
| Change one or more compiled React call sites | `dsh-harmony-react` `element()`, which produces a Source Patch |
| Decorate or replace one initialized variable or named function React component binding | `dsh-harmony-react` `component()`, which produces a Source Patch |
| Expose explicit preview elements or editable variables to dsh-webui-studio | `dsh-harmony-react/studio` |

Use a Source Patch for every browser target. Semantic handlers execute in Node.js and do not support browser bundles, generators, or non-identifier parameters.

## Install Harmony

Require Node.js `^22.15.0` or `>=23.5.0` and a current `@deepseek-ai/dsh` installation. Built-in DSH integrations are verified through `0.1.1-rc.2`. Harmony does not gate DSH versions during installation; Patch target ranges are advisory and newer releases are still attempted with drift warnings and exact-match checks.

```sh
node --version
npm install -g @deepseek-ai/dsh@0.1.1-rc.2
npm install -g dsh-harmony
dsh web
```

Verify the selected profile:

```sh
dsh harmony status
dsh harmony status --profile tui
```

Alternatively, install `dsh-harmony` through `dsh plugin --profile web add dsh-harmony`, then choose **Install and restart** on first boot. Use **Settings -> Harmony** in WebUI or `dsh harmony --profile <name>` in the terminal.

When working from a repository checkout, read its `package.json` first and follow its declared `engines` and `peerDependencies`; they supersede versions shown here.

## Author a provider

Create an ordinary DSH plugin. Declare CommonJS Patch modules under `dsh.harmony` in `package.json`:

```json
{
  "name": "my-harmony-provider",
  "dsh": {
    "plugin": {
      "compatibility": {
        "requires": {
          "base-plugin": "^2"
        },
        "conflicts": {
          "legacy-patches": "*"
        },
        "integrates": {
          "optional-renderer": "^1"
        }
      }
    },
    "harmony": {
      "patches": ["./patches/answer.patch.cjs"],
      "after": ["base-patches"],
      "before": ["ui-patches"]
    }
  }
}
```

Treat `before` and `after` as provider package ordering constraints, not dependencies. Any DSH plugin may describe package relationships in `dsh.plugin.compatibility`: `requires` reports unavailable required plugins, `conflicts` warns about incompatible active plugins, and `integrates` reports available optional integrations. Keys are package names and values are semver ranges. These declarations never change plugin state or block startup. Disabling a Patch does not disable its owning plugin. Add `inject = ['harmony']` only when the provider plugin itself requires the Harmony service.

Give each user-facing Patch a concise `description` of its effect. Harmony exposes it in status output and Settings.

### Source Patch

Inspect the installed target's compiled file. Select the narrowest stable TypeScript AST shape with TSQuery and edit the current in-memory source through MagicString:

```js
/** @type {import('dsh-harmony').HarmonyPatch} */
module.exports = {
  id: 'answer-value',
  description: 'Changes answer() to return 42.',
  target: {
    package: 'some-dsh-plugin',
    version: '^1.2.0',
    file: 'lib/index.js',
  },
  select: 'FunctionDeclaration[name.name="answer"] NumericLiteral',
  expect: 1,
  apply({ node, sourceFile, edit }) {
    edit.overwrite(node.getStart(sourceFile), node.getEnd(), '42')
  },
}
```

Always set a target version and an exact `expect` count. Positions passed to `edit` refer to the source produced by all earlier Patches. Keep edits local and non-overlapping; do not write target files.

### React Patch

Use `element()` for concrete compiled `jsx`/`jsxs` calls and `component()` for an initialized component variable whose value is shared by every call site. Both return ordinary Source Patches and use Harmony's normal ordering:

```js
const { element } = require('dsh-harmony-react')

module.exports = element({
  id: 'wrap-submit',
  description: 'Wraps the submit button with the provider boundary.',
  target: {
    package: 'some-dsh-plugin',
    version: '^1.2.0',
    file: 'lib/client.js',
  },
  select: { component: 'SubmitButton' },
  expect: 1,
  operation: {
    kind: 'wrap',
    with: { module: 'my-provider', export: 'SubmitBoundary' },
  },
})
```

Element operations are `replace`, `wrap`, `insert-before`, `insert-after`, `transform-props`, and `remove`. Component operations are `decorate` and `replace`; their selector must match a variable declaration with an initializer or a named function declaration with a body. Harmony React rewrites a matched function declaration into an initialized binding so every call site sees the same composed result. That binding is not hoisted: use a core Source Patch when the target reads the component before its declaration. Name-based Component selectors emit Preview call-path traces; raw TSQuery selectors cannot infer a binding name and do not. Use a core Source Patch for component internals, string literals, or any other arbitrary source change.

### Loader Patch

Use a Loader Patch only when the target package publishes TypeScript source that Node cannot load from `node_modules`. It enables Harmony's TypeScript transpiler for that package's `.ts`, `.tsx`, `.mts`, and `.cts` module graph before Node's default loader runs:

```js
/** @type {import('dsh-harmony').HarmonyPatch} */
module.exports = {
  id: 'load-published-typescript',
  target: {
    package: 'typescript-only-plugin',
    version: '^1.0.0',
    file: 'index.ts',
  },
  loader: 'typescript',
}
```

The target file is the compatibility anchor used for binding and status. Loading is limited to TypeScript files inside that exact package and version; unrelated packages retain Node's default behavior. Declare ordinary Source Patches separately when the source also needs modification. Harmony applies those exact-file edits before transpiling the module.

### Semantic Patch

Use a semantic operation only for a named Node.js function declaration or class method:

```js
/** @type {import('dsh-harmony').HarmonyPatch} */
module.exports = {
  id: 'answer-after',
  target: {
    package: 'some-dsh-plugin',
    version: '^1.2.0',
    file: 'lib/index.js',
    function: 'answer',
  },
  operation: 'after',
  expect: 1,
  handler({ result }) {
    return result + 1
  },
}
```

Choose the operation deliberately:

- `before`: optionally replace the argument array.
- `after`: optionally replace the sync or async result.
- `around`: call or skip `invoke(args?)` around the next layer.
- `replace`: own the function through `invoke(args?)`; only one enabled replacement may target it.

## Install and validate a provider

Install the provider into the same profile as its targets, then validate the runtime result:

```sh
dsh plugin --profile web add ./my-harmony-provider
dsh harmony status --profile web
dsh harmony status --json --profile web
dsh harmony inspect some-dsh-plugin --file lib/index.js --profile web
dsh harmony disable my-harmony-provider/optional-patch --profile web
dsh harmony enable-provider my-harmony-provider --profile web
dsh harmony patch-order show --profile web
dsh harmony patch-order move my-harmony-provider/optional-patch --after another-provider/base --profile web
dsh harmony patch-order auto --profile web
dsh harmony provider-order move my-harmony-provider --after another-provider --profile web
dsh harmony inspect some-dsh-plugin --patch my-harmony-provider/optional-patch --summary --profile web
dsh harmony reload my-harmony-provider --profile web
```

Require all intended Patches to reach `bound`. Treat `status` exit code `1` as a Patch, reload, or ordering failure. `patch-order show` and `provider-order show` also exit `1` when constraints are violated. Use `inspect` to compare the original source, every ordered intermediate result, and the final source; add `--summary` to omit source or `--patch <key>` to select one Patch. `reload` requires a live Host. Confirm hot reload or restart behavior through the target feature.

Use Settings or `dsh harmony` to reorder and enable or disable Patches. Do not edit `$DSH_HOME/profiles/<name>/harmony.json` while the profile is running; UI and CLI changes are preflighted and committed transactionally.

## Control a profile from another plugin

Use the Cordis service when already inside the running profile. `order` and `patchOrder` must be complete permutations of their current lists; omitted fields keep their current values. The result identifies the committed Patch generation and reload status:

```ts
export const inject = ['harmony']

export async function apply(ctx) {
  const current = ctx.harmony.profile()
  const result = await ctx.harmony.updateProfile({
    order: current.order,
    disabled: ['my-provider/optional-patch'],
  })
  ctx.logger.info(`Harmony generation ${result.generation}: ${result.reload.state}`)
}
```

Call the public profile update API from any other local process. It automatically uses the running Harness transaction when that profile is active, and otherwise validates and atomically updates the stopped profile on disk:

```ts
import {
  preflightHarmonyProfileUpdate,
  readHarmonyProfile,
  updateHarmonyProfile,
} from 'dsh-harmony'

const current = readHarmonyProfile(profileDir)
const candidate = preflightHarmonyProfileUpdate(profileDir, { order: current.order })
const saved = await updateHarmonyProfile(profileDir, { disabled: candidate.disabled })
console.log(saved.mode === 'live' ? saved.reload.state : 'saved for next start')
```

Offline preflight validates and normalizes profile state without writing it. It does not start a Host or bind target Patches; runtime binding still happens when that profile starts. Do not import internal control/profile modules or edit `harmony.json` directly.

## Diagnose failures

Check these in order:

1. Confirm the selected profile contains both the provider and target.
2. Review any `target.version` warning against the installed target version and confirm `file` names a compiled file that exists.
3. Compare `expect` with the actual selector match count against the current compiled shape.
4. Inspect earlier Patch outputs; a prior Patch may have changed or removed the selected node.
5. Replace a browser Semantic Patch with a Source Patch.
6. Resolve duplicate semantic `replace` ownership, overlapping source edits, or violated provider order.
7. Check `dsh.plugin.compatibility` findings for unmet requirements or conflicts, and treat contradictory `before`/`after` constraints as ordering problems.
8. When load or reload performance is in question, start DSH with `DSH_HARMONY_PERF=1` and compare the reported `prepareMs`, `transformMs`, `hostReloadMs`, `clientRebuildMs`, and `totalMs` fields. Node.js diagnostic tools may subscribe to the `dsh-harmony:load` diagnostics channel instead of enabling logs.

A `target.version` mismatch is advisory: Harmony warns and still attempts the Patch. Harmony skips an individual Patch only when it cannot match or apply, marks it `failed`, and continues with later Patches. Treat a compatibility warning or `status` exit code `1` as work to investigate even though the Host remains available. A provider declaration that cannot load or a target reload that cannot commit still rolls back the candidate generation. Never repair a failure by modifying the installed target package or weakening `expect` without verifying the new compiled structure.

## Completion check

- Keep Patch IDs stable and unique within the provider.
- Pin a compatible target version and compiled file.
- Require exact matches and inspect the final transformed source.
- Verify the intended behavior in the correct profile and runtime side.
- Confirm installed target files remain unchanged.

Use the current project documentation as the authority for details: [installation](https://ch4acko3.github.io/dsh-harmony/guide/installation), [Patch authoring](https://ch4acko3.github.io/dsh-harmony/patches/authoring), [operations](https://ch4acko3.github.io/dsh-harmony/guide/operations), [React integration](https://ch4acko3.github.io/dsh-harmony/integrations/react), [Studio integration](https://ch4acko3.github.io/dsh-harmony/integrations/studio), [CLI](https://ch4acko3.github.io/dsh-harmony/reference/cli), and [limitations](https://ch4acko3.github.io/dsh-harmony/reference/limitations).
