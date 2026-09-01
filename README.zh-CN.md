<div align="center">
  <a href="https://memorax-ai.github.io/dsh-harmony/zh/">
    <img width="132" alt="Harmony" src="assets/harmony-icon.png">
  </a>

  <h1>dsh-harmony</h1>

  <p>
    <strong>DeepSeek Harness 插件的运行时 Patch 协调层。</strong>
    <br />
    一个用于在运行时修补、替换和装饰 DeepSeek Harness 插件的库。
  </p>

  <p>
    <a href="https://memorax-ai.github.io/dsh-harmony/zh/guide/installation"><strong>开始使用</strong></a>
    ·
    <a href="https://memorax-ai.github.io/dsh-harmony/zh/">文档</a>
    ·
    <a href="https://github.com/memorax-ai/dsh-harmony/issues">报告问题</a>
  </p>

  <p>
    <a href="LICENSE"><img alt="许可证：MIT" src="https://img.shields.io/badge/license-MIT-0b63f6.svg"></a>
    <a href="package.json"><img alt="Node.js" src="https://img.shields.io/badge/node-%5E22.15.0%20%7C%7C%20%3E%3D23.5.0-2f6f3e.svg"></a>
    <a href="https://www.npmjs.com/package/dsh-harmony"><img alt="npm 版本" src="https://img.shields.io/npm/v/dsh-harmony.svg?style=flat&amp;color=0b63f6"></a>
    <a href="https://github.com/memorax-ai/dsh-harmony/stargazers"><img alt="GitHub Stars" src="https://img.shields.io/github/stars/memorax-ai/dsh-harmony?style=flat&amp;color=0b63f6"></a>
    <a href="https://awesome-dsh-plugin.com"><img alt="Awesome DSH Plugin" src="https://awesome-dsh-plugin.com/badge.svg"></a>
    <a href="https://memorax-ai.github.io/dsh-harmony/"><img alt="Harmony" src="https://memorax-ai.github.io/dsh-harmony/harmony-powered.svg"></a>
  </p>

  [简体中文](README.zh-CN.md) / [English](README.md)
</div>

## 使用

在用 Vibe Coding 开发 DSH 插件时，只需输入 *“如果使用 dsh-harmony 呢”*。

## 简介

当一个 DeepSeek Harness 插件需要修改另一个插件、又不值得为此维护 Fork 时，可以使用 Harmony。它会在目标插件运行前加载 Patch，在内存中修改编译产物，再让 Harness 运行修改后的代码。

Source Patch 使用 TSQuery 查找 TypeScript AST 节点，再用 MagicString 改写对应的源码区间。Patch 逐个执行，后一个会读取前一个留下的结果，因此多个插件可以修改同一目标。安装目录里的文件不会改变。

Provider 可以声明自己的 Patch 应排在另一个 Provider 之前或之后；单个 Patch 也可以改用自己的规则。用户还能把不同 Provider 的 Patch 交错排列。若几处修改必须一起成功，可以把它们放进组合 Patch：它们共用一个位置和开关，任何成员失败时都不应用。

对于浏览器插件，Harmony 还会按 Patch 顺序整理 Provider 所属的 `<style data-plugin>` 标签。每个 Provider 只有一组样式，它在 CSS 层叠中的位置由最后一个启用的 Patch 决定。Patch 重载后，Harmony 会再整理一次。

Harmony 会把每个新 session 与创建它时“已启用 Patch 的有序 profile”绑定，并记录 Provider 版本与 Patch 内容指纹。绑定保存在 DSH 共享数据根的 `harmony-sessions.json` 中，不改动 DSH session 文件。Web 加载已记录的 session 前会先比较绑定状态与当前 profile；如果存在缺失、新增、实现变化或换序，会显示警告，并允许不加载、返回原来的 session。

Harmony 还会在 `$DSH_HOME/harmony-instance.json` 中记录上一次启动共享 DSH 实例的有序 Patch profile。每次启动都会先把当前配置与这份数据侧记录比较；若不一致，会写入日志并在 Web 中显示一次警告，然后才把记录推进到本次运行配置。因此切换 profile 或修改 Patch 后，第一次开始接触同一 DSH_HOME 下共享的 session、附件、workspace 元数据和其他 storage 时会明确提示。

Harmony 为 DeepSeek Harness 插件之间的协作补上了修改能力。

### 演示视频 on Bilibili

[【Harmony 框架: 让你的 DeepSeek Harness 插件可以运行时修改、替换和装饰其它插件】](https://www.bilibili.com/video/BV1HA876FEXJ/?share_source=copy_web&vd_source=e481fb59e256b47a303839b7f25dae5c)

## 为什么使用 Harmony

目标已经暴露所需能力时，普通 DSH 扩展点仍然是首选。Harmony 解决的是公开 API 与维护 Fork 之间的空白：修改目标没有暴露的内部组件、Loader 条目或编译后行为。

| 不使用 Harmony | 使用 Harmony |
| --- | --- |
| 隐藏或复制内部 UI，并长期同步两套实现 | 在原位置替换选中的组件或编译后调用点 |
| 修改 `node_modules`、维护 Fork，或升级后重新应用改动 | 只在内存中变换源码；已安装文件逐字节保持不变 |
| 选择器漂移后由 UI 静默失效暴露问题 | 钉死目标版本和 `expect`；版本漂移会警告，真正的匹配失败会在 `status` 中明确报错 |
| 把最终 Bundle 当作黑盒 | 检查原始源码、每一步 Patch 和最终变换结果 |
| 手动清理定制改动 | 禁用或移除 Provider 即恢复原始行为 |

Harmony 不会把编译内部变成稳定的公开 API；它让这项依赖变得明确、有序、可检查且可逆。

**Respect**

灵感来源于 Andreas Pardeike 和其它开发者创作的同名 C# 项目 [**Harmony**](https://harmony.pardeike.net/)。

<!-- AGENTS: Before installing, authoring, reviewing, or debugging Harmony Patches, read the main-branch skill at https://github.com/memorax-ai/dsh-harmony/blob/main/.agents/skills/use-dsh-harmony/SKILL.md. -->
<details>
<summary><strong>AI Agent：使用仓库内置 Skill</strong></summary>

安装、选择和编写 Patch、执行运行时操作或排查问题前，请加载 [`use-dsh-harmony`](https://github.com/memorax-ai/dsh-harmony/blob/main/.agents/skills/use-dsh-harmony/SKILL.md)。

</details>

## 安装

需要 Node.js `^22.15.0` 或 `>=23.5.0`，以及当前版本的 `@deepseek-ai/dsh`。内置 DSH 集成已验证 `0.1.1-rc.2` 与 `0.1.2-alpha.4`；两个兼容区间分别设界，不会把旧 selector 跨越 `0.1.2` 的内部重构继续放宽。Harmony 不会在安装阶段限制 DSH 版本；Patch 目标版本范围仅用于提示，对更新的版本仍会实际尝试应用，并通过可见的版本漂移警告与精确匹配检查报告结果。

```sh
npm install -g @deepseek-ai/dsh@0.1.1-rc.2
npm install -g dsh-harmony
dsh web
```

启动 WebUI 后打开 **设置 → Harmony**。Profile、Desktop 集成、更新和卸载说明参见[安装指南](https://memorax-ai.github.io/dsh-harmony/zh/guide/installation)。

**设置 → 插件 → 插件配置 → Harmony → 多线程装载** 用于控制 Patch 预检并行度。默认值为 `1`，完整保留原来的单线程执行模型。提高线程数后，互不依赖的源码 Patch 文件连通分量会在 worker 线程中并行执行；触及同一文件的所有 Patch，以及跨文件的组合 Patch，仍会留在同一分量内按顺序运行。语义 Patch 分量继续在主线程执行。worker 中的模块状态和全局状态彼此隔离，并且每个 worker 都会增加内存开销。

终端 TUI 和非交互命令可操作任意 profile。命令会事务连接正在运行的 Host 并报告 `live`；已停止的 profile 则在本地校验后原子更新并报告 `offline`。

同一 profile 可以由多个 Host 使用。Harmony 沿用 DSH Settings 的写入模型：整份配置通过文件锁串行并原子提交；陈旧界面的保存会被拒绝并刷新，跨进程并发写则以后完成的完整配置为准。

```sh
dsh harmony --profile web
dsh harmony status --json --profile web
dsh harmony disable my-provider/optional-patch --profile web
dsh harmony enable-provider my-provider --profile web
dsh harmony patch-order show --profile web
dsh harmony patch-order move my-provider/optional-patch --before other-provider/base --profile web
dsh harmony patch-order auto --profile web
dsh harmony provider-order move my-provider --after base-provider --profile web
dsh harmony inspect target-package --patch my-provider/optional-patch --summary --profile web
dsh harmony reload my-provider --profile web
```

在 TUI 中按 `Tab` 可切换 Provider 和 Patch 视图。Patch 视图支持单项及整组启停、Patch 排序、自动排序、运行状态和简要检查；profile 大于终端窗口时，两个视图都会保持选中项可见。

健康状态或顺序约束失败时，`status`、`patch-order show` 和 `provider-order show` 都以状态码 `1` 退出。`patch-order auto` 与 `provider-order auto` 会尽量保留当前相对顺序，同时把约束冲突降到最少。`inspect --summary` 不输出变换源码，`--patch <key>` 只保留指定 Patch 触及的目标。`reload` 只能用于正在运行的 Host。

## Patch 模型

Harmony 按一份全局 `patchOrder` 运行所有 Patch。Provider 级 `before` / `after` 负责通常的先后关系；单个 Patch 只要声明其中一项，就改用自己的规则。在 **设置 → Harmony** 中，用户可以移动整个 Provider，也可以把一个 Patch 插到另一个 Provider 的两个 Patch 之间。插件与 Patch 详情提供启停操作，Patch 状态页则是只读的运行时监视器。保存时，Harmony 会检查列表是否恰好包含每个已注册 Patch 一次。

插件级停用使用独立的 `provider/*` 标志，不会清除或创建单个 Patch 的停用标志。因此重新启用插件时，只会恢复此前本就单独启用的 Patch。

每个 Patch 都可以声明便于阅读的 `description`。Harmony 会在 Patch 状态和 JSON 输出中公开它，并在设置界面中显示，让用户在调整顺序或启停之前了解该 Patch 的作用。

组合 Patch 让多个 Patch 共用一个排序位置和开关。成员按声明顺序执行，而且只有全部成功才会应用。独立 Patch 失败时，Harmony 会报告并跳过它；后续 Patch 和 Host 仍会运行。

## 插件兼容性

任何 DSH 插件包都可以在 `dsh.plugin.compatibility` 中描述它与其它插件的关系，无论它是否提供 Harmony Patch：

```json
{
  "dsh": {
    "plugin": {
      "compatibility": {
        "requires": {
          "base-plugin": "^2.0.0"
        },
        "conflicts": {
          "legacy-plugin": "*"
        },
        "integrates": {
          "optional-renderer": "^1.0.0"
        }
      }
    }
  }
}
```

`requires` 报告缺失、未启用或版本不匹配的依赖，`conflicts` 警告同时启用的不兼容组合，`integrates` 报告当前可用的可选联动。声明只用于检测和展示，不会安装、启用、停用或阻止插件。目标使用包名，值使用 semver 范围；双方重复声明冲突时只产生一条警告。停用 Harmony Patch 不等于停用其所属插件。

如果一个插件必须激活另一个 Harmony Provider 的 bundle，请在 `dsh.harmony.requires` 中声明。Harmony 会从声明方包的位置解析依赖，将其 bundle 作为临时启动层加入；如果该 bundle 已经在 profile 中配置，则直接复用，不会创建重复的 Loader entry。依赖包本身仍须由包管理器安装。

```json
{
  "dsh": {
    "harmony": {
      "requires": {
        "the-binding-of-dsh": ">=0.1.3 <0.2.0"
      }
    }
  }
}
```

实时报告使用 Loader 中实际启用的插件。配置停止运行时，Harmony 只能检查安装情况，因此会把配置中已安装的包视为已启用。

## 加载协调

Harmony 会在每个 Patch generation 中索引最终变换后的模块图。浏览器模块顺序会包含 Patch 新增的 `import` 和 `require()`，Host 重载则跟随 Node.js 实际解析到的模块边，并在同一事务中重载受影响的依赖方。

已经注入 Harmony 服务的插件可以检查当前 generation，而不必自行控制 Loader 生命周期：

```ts
export const inject = ['harmony']

export function apply(ctx) {
  const plan = ctx.harmony.loadPlan()
  // 包、Patch 目标、变换后模块和已观察到的 Loader entry
}
```

`loadPlan()` 是已提交 generation 的诊断数据。静态分析得到的 `inject` 与 `provide` 只描述可能的模块关系；已观察到的 Entry 记录包含 Cordis 报告的准确运行时元数据，实际激活状态仍以 Cordis Fiber 为准。

Provider 发现目前跟随组合后的 profile 包图。因此，被 Loader 配置禁用的 Provider Entry——包括 `disabled: !!js ...` 表达式结果为真的情况——仍可能贡献 Harmony Patch。需要让 Patch 激活服从明确运行时设置时，请使用 Harmony 自身的 Provider 或 Patch 开关。

## React-aware Patch

修改编译后的 React 目标时，在 Patch Provider 中安装 `dsh-harmony-react`：

```sh
npm install dsh-harmony-react
```

`element()` 修改选中的 `jsx` / `jsxs` 调用点，`component()` 修改这些调用共享的组件定义。它们和其它 Source Patch 使用同一份顺序。

| API | 作用范围 |
| --- | --- |
| `element()` | 一个或多个调用点：替换、包裹、插入、变换 Props 或移除 |
| `component()` | 所有通过已初始化变量或具名函数声明进行的调用：装饰或替换 |

为了让后续 Component Patch 继续修改同一定义，Harmony 会把函数声明改写为已初始化的 `const`。新绑定不再提升；如果文件在声明前读取组件，请改用核心 Source Patch。[React 集成](https://memorax-ai.github.io/dsh-harmony/zh/integrations/react)还介绍了选择器、Inspect trace 和 Studio。

## 文档

| 主题 | 指南 |
| --- | --- |
| 运行时架构 | [Harmony 是什么？](https://memorax-ai.github.io/dsh-harmony/zh/guide/introduction) |
| 安装与 profile | [安装](https://memorax-ai.github.io/dsh-harmony/zh/guide/installation) |
| 编写源码、语义、加载器与组合 Patch | [Patch 编写指南](https://memorax-ai.github.io/dsh-harmony/zh/patches/authoring) |
| Provider/Patch 排序、状态、检查和重载 | [运行操作](https://memorax-ai.github.io/dsh-harmony/zh/guide/operations) |
| 使用 `dsh-harmony-react` 编写 React Patch | [React 集成](https://memorax-ai.github.io/dsh-harmony/zh/integrations/react) |
| Studio 预览 | [Studio 集成](https://memorax-ai.github.io/dsh-harmony/zh/integrations/studio) |
| 命令、限制与故障 | [CLI](https://memorax-ai.github.io/dsh-harmony/zh/reference/cli) · [限制](https://memorax-ai.github.io/dsh-harmony/zh/reference/limitations) · [故障排查](https://memorax-ai.github.io/dsh-harmony/zh/help/troubleshooting) |

## Powered by Harmony

如果你的插件使用 Harmony，欢迎使用这枚徽章来表达支持！

[![Powered by Harmony](https://memorax-ai.github.io/dsh-harmony/harmony-powered.svg)](https://memorax-ai.github.io/dsh-harmony/)

```md
[![Powered by Harmony](https://memorax-ai.github.io/dsh-harmony/harmony-powered.svg)](https://memorax-ai.github.io/dsh-harmony/)
```

## 开发

所有维护中的实现源码均使用 TypeScript。用于发布的编译产物由构建生成，不纳入 Git 跟踪。

文档源码与本地预览工具位于 [`docs`](https://github.com/memorax-ai/dsh-harmony/tree/docs) 分支。

```sh
npm test
```

启动 DSH 时设置 `DSH_HARMONY_PERF=1`，可让 Harmony 为每次启动、插件更新、配置更新和手动重载输出一条结构化耗时记录：

```sh
DSH_HARMONY_PERF=1 dsh web --no-open
```

记录分别包含 Patch 准备、源码变换、Host 重载、浏览器重建和总耗时。探针默认不工作，不会给正常加载路径增加计时开销。Node.js 诊断工具也可以直接订阅 `diagnostics_channel` 的 `dsh-harmony:load` 通道，而不打开日志输出。

## 许可证

[MIT](LICENSE)
