# Skills Hub 仓库解析

## 1. 仓库定位

`skills-hub` 是一个围绕 AI Agent Skills 管理构建的多入口项目，目标是把“技能发现、导入、同步、配置切换、Kit 装配、官方预设安装”统一到一个本地工具里。它同时提供两种主要使用形态：

- Desktop App：基于 `Tauri 2 + React + Vite`
- CLI：基于 Node.js 的单文件命令入口 `bin/skills-hub`

从仓库结构看，这不是一个“纯前端”或“纯命令行”项目，而是一个“共享业务逻辑 + 两套交互入口 + 一个桌面原生壳”的复合型工具仓库。

## 2. 顶层目录作用

按当前仓库内容，最核心的目录分工如下：

| 目录 | 作用 |
| --- | --- |
| `bin/` | CLI 入口，负责参数解析、命令路由、用户输出 |
| `lib/` | 共享逻辑层，包含配置、导入、同步、扫描、GitHub 解析等 |
| `lib/core/` | 更偏领域模型与底层核心能力，尤其是 provider / kit 相关类型与实现 |
| `lib/services/` | 面向功能编排的服务导出，给 CLI / 桌面端复用 |
| `components/` | React 组件，承载桌面 UI 的主要界面 |
| `apps/desktop-ui/src/` | 桌面前端入口、状态管理、Tauri action 封装 |
| `src-tauri/` | Rust 侧 Tauri 外壳与本地命令实现 |
| `__tests__/` | Vitest 测试，覆盖 CLI、核心逻辑与部分 UI 行为 |
| `data/official-presets/` | 官方预设目录与 catalog 数据源 |
| `docs/` | 项目文档、PRD、支持的 agent 列表、发布辅助文档 |
| `.codex/skills/` | 仓库自带的 Skills Hub Skill 定义，用于被代理系统消费 |

文件量上，当前仓库重点集中在：

- `components/`：20 个文件
- `lib/`：22 个文件
- `__tests__/`：18 个文件
- `data/official-presets/`：19 个文件
- `src-tauri/src/`：Rust 主逻辑集中在单个 `main.rs`

这说明仓库的复杂度主要来自“桌面交互层 + 本地业务逻辑 + Tauri 单体后端”三部分，而不是大量的独立子包。

## 3. 技术栈与构建形态

### JavaScript / TypeScript 侧

- React 19
- Vite 7
- TypeScript 5
- Vitest
- ESLint
- Tailwind CSS
- `simple-git`
- `fs-extra`
- `better-sqlite3`
- `gray-matter`

`tsconfig.json` 采用严格模式，路径别名统一通过 `@/* -> ./*` 暴露。测试配置 `vitest.config.ts` 使用 `jsdom`，因此 UI 与部分共享逻辑可以共用一套测试基线。

### 桌面端 / 原生侧

- Tauri 2
- Rust 2021
- `notify`：文件监听
- `serde / serde_json / serde_yaml`
- `tauri-plugin-dialog`

Rust 侧承担了大量真实本地能力，不只是一个薄壳。它不仅负责窗口生命周期，还直接实现配置读写、技能扫描、provider 切换、kit 应用、官方预设安装等命令。

## 4. 产品能力拆解

从 README、CLI 帮助和代码结构综合来看，这个仓库当前承载 5 条主线能力：

### 4.1 Skills 基础管理

- 扫描本地项目中的 skills
- 从 Hub 同步到 agent 目录或项目目录
- 从远程 Git 仓库导入 skill
- 创建本地 skill
- 删除 skill

相关核心文件：

- `lib/scanner.ts`
- `lib/sync.ts`
- `lib/import-skill.ts`
- `lib/remote.ts`
- `src-tauri/src/main.rs`

### 4.2 Provider 管理

这部分是仓库的一个重要扩展点，不只是“技能同步工具”。

能力包括：

- 维护 Claude / Codex / Gemini 的 provider 配置
- 标记当前 provider
- 从 live config 捕获 provider
- 做 provider 切换与备份恢复
- 管理 Universal Provider，并分发到多个 app

相关核心文件：

- `lib/core/provider-core.mjs`
- `lib/core/provider-types.ts`
- `lib/services/provider-service.mjs`
- `components/ProviderPanel.tsx`
- `src-tauri/src/main.rs`

### 4.3 Kit 体系

Kit 是本仓库的第二条主业务线，用于把策略文件和技能集合打包后应用到目标项目。

Kit 由 3 个基本对象构成：

- `Policy`：说明类文件模板，通常对应 `AGENTS.md` / `CLAUDE.md`
- `Loadout`：skills 包
- `Kit`：Policy + Loadout 的组合

能力包括：

- 新增 / 更新 / 删除 policy
- 新增 / 更新 / 删除 loadout
- 从 Git 仓库导入 loadout
- 新增 / 更新 / 删除 kit
- 将 kit 应用到某个项目和 agent

相关核心文件：

- `lib/core/kit-types.ts`
- `lib/core/kit-core.mjs`
- `lib/services/kit-service.mjs`
- `lib/services/kit-loadout-import.mjs`
- `components/KitPanel.tsx`
- `src-tauri/src/main.rs`

### 4.4 Official Presets

仓库内置一套官方预设目录 `data/official-presets/`，实质上是可安装的“策划好的 policy + source repo + selected skills”的组合。

这部分能力包括：

- 列出官方预设
- 搜索官方预设
- 查看预设详情
- 安装单个预设
- 批量安装托管预设
- 将预设恢复到托管基线

这使仓库不仅能做“工具”，也承担了“官方内容分发平台”的角色。

### 4.5 Project / Agent 发现与配置

项目发现遵循 README 中强调的 Git-only 规则：

- Scan Root 只扫描 Git 工作树
- 手工添加项目也要求是 Git 仓库
- 支持系统目录选择器和手工路径兜底

相关文件：

- `lib/config.ts`
- `lib/git.ts`
- `lib/path-picker.ts`
- `lib/scanner.ts`
- `components/Sidebar.tsx`
- `src-tauri/src/main.rs`

## 5. 关键分层与调用路径

### 5.1 CLI 路径

CLI 入口是 `bin/skills-hub`。它负责：

- 识别一级命令：`import/list/remove/sync/provider/kit/official`
- 解析 flag 与别名
- 打印帮助与用户可读输出
- 懒加载 provider / kit service

它本身不是最核心的业务实现层，更像“命令分发器 + 输出适配器”。

### 5.2 Desktop 路径

桌面端调用链大致是：

1. `apps/desktop-ui/src/App.tsx` 启动
2. `hydrateTauriState()` 拉取配置、skills、providers、kits、official presets
3. React 组件通过 `tauri-actions.ts` 调用 Tauri commands
4. Rust 侧命令读写本地状态并回传结果

`components/Dashboard.tsx` 是桌面 UI 的主路由容器，`ProviderPanel.tsx` 与 `KitPanel.tsx` 是两块功能最重的界面。

### 5.3 Tauri / Rust 路径

`src-tauri/src/main.rs` 是整个桌面端的本地业务中枢。它暴露了大量 `#[tauri::command]`，包括：

- 配置类：`config_get`、`project_add`、`scan_projects`
- skill 类：`skill_list`、`skill_sync`、`skill_import`、`skill_create`
- provider 类：`provider_list`、`provider_switch`、`provider_capture_live`
- universal provider 类：`universal_provider_*`
- kit 类：`kit_policy_*`、`kit_loadout_*`、`kit_*`
- official preset 类：`official_preset_*`

也就是说，桌面版并不是简单复用 Node 侧逻辑，而是在 Rust 中实现了一套相对完整的本地业务执行层。

## 6. 数据模型与持久化

### 6.1 用户配置

主配置文件位于：

- `~/.skills-hub/config.json`

`lib/config.ts` 中定义的核心结构：

- `hubPath`
- `projects`
- `scanRoots`
- `agents`

其中 `agents` 预置了大量目标代理，包括：

- Antigravity
- Claude Code
- Cursor
- Codex
- Gemini CLI
- GitHub Copilot
- Trae
- Windsurf
- Qoder
- Qwen Code

### 6.2 Provider 数据

Provider 相关逻辑在 `provider-core.mjs` 中落地，使用 `better-sqlite3` 管理数据，并结合本地 live config、备份快照、Codex auth snapshot 等文件一起工作。这一层是仓库中“持久化最复杂”的部分之一。

### 6.3 Official Preset 数据

官方预设内容直接放在仓库内：

- `data/official-presets/catalog.json`
- `data/official-presets/policies/*.md`

这意味着预设是“随版本发布”的静态资源，而不是运行时在线拉取的服务端配置。

## 7. 核心实现亮点

### 7.1 GitHub AGENTS 解析

`lib/github-agents.ts` 专门处理 GitHub URL 解析，支持：

- `github.com`
- `raw.githubusercontent.com`
- `blob/tree` 链接
- 分支与子路径推断
- 借助 GitHub API 自动寻找 `AGENTS.md / AGENT.md / CLAUDE.md`

这说明仓库对“把外部仓库中的 agent policy 拉进本地 kit 体系”做了专门设计。

### 7.2 远程 skill 稀疏下载

`lib/remote.ts` 使用 `simple-git + sparse-checkout` 下载指定子目录，而不是整仓克隆。对 skill 仓库来说这是合理优化，能减少导入时的带宽和临时目录压力。

### 7.3 本地目录选择器兼容

`lib/path-picker.ts` 针对不同平台封装了目录选择：

- macOS：`osascript`
- Windows：PowerShell FolderBrowserDialog
- Linux：`zenity` / `kdialog`

这让 CLI/桌面功能对“手工输入路径”之外多了一层系统原生体验。

### 7.4 Skill 视图分组与过滤

`lib/core/skill-filter.ts` 提供：

- 按 skill name 聚合多实例
- 按 hub / agent / project 视图过滤
- 按 agent 标签过滤
- 按搜索词过滤

这部分说明 UI 设计上不是简单地平铺文件夹，而是在做统一技能视图。

## 8. 测试与质量保障

仓库显式要求的质量门禁是：

```bash
npm run lint
npm run typecheck
npm run test -- --run
```

CI 目前也会执行：

- `npm ci`
- `npm run lint`
- `npm run typecheck`
- `npm run test -- --run`
- `npm run build`

测试覆盖面看起来比较均衡，既有核心逻辑测试，也有 CLI 和 UI 测试。例如：

- `__tests__/provider-core.test.ts`
- `__tests__/kit-cli.test.ts`
- `__tests__/official-presets-cli.test.ts`
- `__tests__/kit-panel-loadout-import.test.tsx`
- `__tests__/path-entry-ui.test.tsx`

这说明项目并不只是依赖人工点击验证，而是在关键能力上做了回归测试。

## 9. 发布与交付形态

发布有两条线：

### 9.1 npm CLI

`package.json` 的发布名是：

- `@skillshub-labs/cli`

`files` 字段只发布 CLI 必需内容与部分共享模块，说明 npm 包目标主要是 CLI 分发，而不是完整桌面源代码分发。

### 9.2 Tauri Desktop

桌面版通过：

- `npm run tauri:dev`
- `npm run tauri:build`

产出安装包与 bundle。README 中明确提到了 macOS 的安装脚本与 release 资产命名。

## 10. 阅读这个仓库时最值得关注的几条主线

如果后续要继续深入代码，我建议优先沿着下面几条链路阅读：

### 10.1 Skill 导入链路

`bin/skills-hub` / UI 动作
-> `lib/import-skill.ts`
-> `lib/remote.ts`
-> metadata 写回 `SKILL.md`
-> `lib/sync.ts` 或 Tauri 同步命令

### 10.2 Provider 切换链路

UI / CLI
-> `lib/services/provider-service.mjs`
-> `lib/core/provider-core.mjs`
-> 本地 live config / backup / snapshot

### 10.3 Kit 应用链路

UI / CLI
-> `kit-service`
-> 读取 policy + loadout + kit
-> 根据 agent 解析 instruction file name
-> 写入目标项目并同步 skill

### 10.4 Official Preset 安装链路

catalog
-> policy 模板
-> source repo 选择
-> 生成托管 loadout / kit
-> 后续 restore baseline

## 11. 当前工程状态观察

从代码结构看，这个仓库已经从“单纯的 skills 管理器”演化成了“本地 agent 工具平台”，并且把以下职责都压在同一个仓库中：

- 内容分发
- 本地配置管理
- agent 适配
- desktop UI
- CLI
- provider 切换
- kit 编排

这样做的优点是功能集成度高、单仓库交付体验完整；代价是核心业务逻辑同时存在于 Node/TS 与 Rust/Tauri 两侧，长期维护时需要特别关注一致性。

一个明显的阅读重点是“默认 agent 配置”在多个位置都出现了相似定义，例如：

- `lib/config.ts`
- `apps/desktop-ui/src/desktop-state.ts`
- `src-tauri/src/main.rs`

这有利于各入口独立运行，但也意味着后续演进时要警惕多处同步问题。

## 12. 总结

`skills-hub` 的本质不是一个单点功能仓库，而是一个围绕 AI agent 生态的本地工作台：

- 用 CLI 提供自动化入口
- 用 Tauri Desktop 提供可视化操作入口
- 用 official presets / kits / providers 形成“内容 + 配置 + 执行”的闭环

如果把仓库按“最重要的资产”排序，我会这样理解：

1. `src-tauri/src/main.rs`：桌面端本地业务大脑
2. `bin/skills-hub`：CLI 分发总入口
3. `lib/core/provider-core.mjs`：provider 能力中枢
4. `lib/core/kit-core.mjs` + `lib/services/kit-service.mjs`：kit / preset 能力中枢
5. `components/` + `apps/desktop-ui/src/`：桌面交互壳
6. `data/official-presets/`：官方内容资产

因此，若后续要继续维护或二次开发这个仓库，最有效的切入方式不是只盯某个页面，而是先理解这 6 块资产之间的边界与数据流。
