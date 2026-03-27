<p align="center">
  <img src="docs/banner.svg" alt="Skills Hub" width="400">
</p>

<p align="center">
  <img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License">
  <img src="https://github.com/PotatoDog1669/skills-hub/actions/workflows/ci.yml/badge.svg" alt="CI">
  <img src="https://img.shields.io/badge/Tauri-2.x-24C8D8" alt="Tauri">
  <img src="https://img.shields.io/badge/TypeScript-5.0-blue" alt="TypeScript">
  <img src="https://img.shields.io/badge/status-active-success" alt="Status">
</p>

<p align="center">
  简体中文 | <a href="./README_en.md">English</a>
</p>

## 简介

**Skills Hub** 是一个本地优先的 AI Agent 能力管理中心，提供统一的 **Tauri 桌面端** 与 **CLI** 工作流，用来发现、导入、整理、同步 Skills，并进一步管理 **指令模板、skills 包、Kit、Provider** 与 **官方预设**。

| <img src="docs/dashboard.png" alt="Skills Hub Dashboard" width="100%">                                                                                                                                                                                                                                                              |
| :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Skills Hub Desktop UI** 是你的本地控制台。你可以在这里集中浏览 Hub 技能、导入 GitHub skills、管理项目与 Agent、组合 Kit、切换 Provider，并把能力同步到不同编码 Agent，而无需依赖云端托管。 |

## 当前已落地能力

- 以 **Central Hub** 作为单一事实来源，集中管理可复用 Skills。
- 支持从 GitHub 仓库、分支链接、`tree` 子目录链接导入 Skills，也支持在桌面端直接新建 Skill。
- 支持将 Hub 技能以 **copy** 或 **link** 模式同步到多个 Agent，并把项目侧的技能改动回写到 Hub。
- 项目发现流程为 **Git-only**：自动扫描与手动添加都要求目录位于 Git 工作树内；路径选择优先走系统文件夹选择器，失败时回退手动输入。
- 桌面端内置 **Skills Market** 入口，便于从常用技能市场复制链接回 Hub 导入。
- 支持管理 **Instruction 模板**（`AGENTS.md` / `CLAUDE.md`），包含拖拽导入、GitHub 导入与手动编辑。
- 支持从 Hub Skills 组合 **skills 包**，也支持通过 `kit package-import` 直接从仓库导入可复用 skills 包。
- 支持将模板与 skills 包组装成 **Kit**，并一键应用到目标项目与目标 Agent。
- 支持安装内置 **Official Presets**，把预设内容落地为本地可管理的模板、skills 包与 Kit；首次启动默认只预装少量精选通用 Kit，其余官方预设可按需手动安装；桌面端还支持对受管理官方 Kit 进行基线恢复。
- 支持管理 **Claude / Codex / Gemini** 的应用级 Provider，以及跨应用复用的 **Universal Provider**，包含切换、恢复、抓取当前 live 配置和重新应用流程。

## 支持的 Agent

Skills Hub 支持同步到多种主流 AI 编码助手，包括 Antigravity、Claude Code、Cursor、Codex、Gemini CLI、GitHub Copilot、Trae、Windsurf、Qwen Code 等。

👉 **[查看完整支持 Agent 列表及默认路径](./docs/supported-agents.md)**

## 下载与安装

### 系统要求

- Node.js 18+（CLI 与源码构建都需要）
- Rust 工具链（`rustup`，用于桌面版 Tauri 源码构建）
- 对应系统的 Tauri 依赖：[Tauri v2 prerequisites](https://v2.tauri.app/start/prerequisites/)

### App 安装（macOS）

```bash
curl -fLsS https://raw.githubusercontent.com/PotatoDog1669/skills-hub/main/install.sh | sh
```

升级：

```bash
curl -fLsS https://raw.githubusercontent.com/PotatoDog1669/skills-hub/main/install.sh | sh
```

### CLI 安装

#### 通过 Homebrew 安装 CLI（macOS/Linux）

```bash
brew tap PotatoDog1669/skillshub
brew install skills-hub
skills-hub --version
```

升级：

```bash
brew update
brew upgrade skills-hub
```

#### 通过 npm 安装 CLI

全局安装：

```bash
npm i -g @skillshub-labs/cli
skills-hub --help
```

不全局安装直接运行：

```bash
npx @skillshub-labs/cli --help
```

升级到最新版本：

```bash
npm i -g @skillshub-labs/cli@latest
```

### 从源码运行（桌面版）

```bash
git clone https://github.com/PotatoDog1669/skills-hub.git
cd skills-hub
npm ci
npm run tauri:dev
```

构建桌面安装产物：

```bash
npm run tauri:build
```

构建输出目录：

- `src-tauri/target/release/bundle/`

### Releases

- 最新版本发布页：[GitHub Releases](https://github.com/PotatoDog1669/skills-hub/releases)
- 当前 release 默认包含变更说明和源码压缩包（`zipball` / `tarball`）
- 桌面版 release 资产包含安装用归档包和备用 DMG：
  - `skills-hub_X.Y.Z_macos_aarch64.tar.gz`
  - `skills-hub_X.Y.Z_macos_x64.tar.gz`
  - `skills-hub_X.Y.Z_macos_aarch64.dmg`
  - `skills-hub_X.Y.Z_macos_x64.dmg`

## CLI 命令总览

| 命令 | 描述 |
| :--- | :--- |
| `skills-hub list` / `skills-hub ls` | 列出已安装技能（默认项目级；支持 `--global`、`--hub`） |
| `skills-hub remove` / `skills-hub rm` | 移除已安装技能（支持 `--all`、`--global`、`--hub`、`--agent`） |
| `skills-hub import <url>` | 导入到 Hub，或直接安装到指定 Agent（支持 `--branch`、`--list`、`-a/--agent`、`-g/--global`、`--copy`） |
| `skills-hub sync --all` / `skills-hub sync --target <name>` | 将 Hub 技能同步到所有已启用 Agent，或单独同步到指定 Agent |
| `skills-hub provider list/add/update/delete` | 管理 Claude / Codex / Gemini 的 Provider 档案 |
| `skills-hub provider switch/restore/capture` | 切换当前 Provider、恢复 live 备份、抓取当前 live 配置为 Provider |
| `skills-hub provider universal-list/add/apply/delete` | 管理并重用 Universal Provider |
| `skills-hub kit policy-*` | 管理本地 Instruction 模板（`policy-list/add/update/delete`） |
| `skills-hub kit package-*` | 管理本地 skills 包（`package-list/add/update/delete`） |
| `skills-hub kit package-import --url <repoOrTreeUrl>` | 从仓库导入一个 skills 包并写入本地 Hub/Kit 资产 |
| `skills-hub kit preset-list/search/inspect/install` | 浏览、搜索、查看并安装内置 Official Presets |
| `skills-hub kit add/update/delete/apply` | 管理本地 Kit，并应用到目标项目 + Agent |
| `skills-hub official list/search/inspect/install` | `kit preset-*` 的兼容别名 |

说明：

- `skills-hub kit ...` 是模板、skills 包、Kit 与官方预设的主入口。
- `package-*` 是当前面向用户的主叫法，`loadout-*` 仍保留为兼容别名。
- `official ...` 是 `kit preset-*` 的兼容入口；主推荐写法仍是 `skills-hub kit preset-*`。

### import / list / remove 快速示例

```bash
# 仅导入到 Hub（兼容旧行为）
skills-hub import https://github.com/owner/repo

# 只查看远程可安装技能，不执行导入
skills-hub import https://github.com/owner/repo --list

# 导入并安装到当前项目的 Codex（默认软链接）
skills-hub import https://github.com/owner/repo -a codex

# 安装到全局并使用复制模式
skills-hub import https://github.com/owner/repo -g -a codex --copy

# 冲突时不提示，直接覆盖
skills-hub import https://github.com/owner/repo -y

# 查看全局安装视角或 Hub 视角
skills-hub ls --global
skills-hub list --hub

# 移除安装技能或批量移除
skills-hub rm my-skill -a codex
skills-hub remove --all -g -a codex
skills-hub remove my-skill --hub
```

### Kit / Official Preset 快速示例

```bash
# 从仓库导入可复用 skills 包
skills-hub kit package-import --url https://github.com/owner/repo/tree/main/skills

# 查看官方预设
skills-hub kit preset-list
skills-hub kit preset-search nextjs
skills-hub kit preset-inspect --id demo-web

# 安装官方预设（兼容旧入口 official install）
skills-hub kit preset-install --id demo-web
skills-hub official install --id demo-web
```

## 开发指南

如果你想参与贡献或修改源码：

```bash
git clone https://github.com/PotatoDog1669/skills-hub.git
cd skills-hub
npm ci
npm run tauri:dev
```

质量检查：

```bash
npm run lint
npm run typecheck
npm run test -- --run
npm run build
```

如需构建桌面端：

```bash
npm run tauri:build
```

如果修改了 `src-tauri`，额外运行：

```bash
cargo check --manifest-path src-tauri/Cargo.toml
```

维护者可复用的 release notes 模板见：

- `docs/release-notes-template.md`
- `docs/homebrew-tap-setup.md`

## 参与贡献

我们欢迎社区贡献。请查看 [CONTRIBUTING.md](docs/CONTRIBUTING.md) 了解如何开始。

所有互动请遵守我们的 [行为准则](docs/CODE_OF_CONDUCT.md)。

如发现安全问题，请按照 [SECURITY.md](SECURITY.md) 私下报告，不要公开提交 issue。

## 许可证

本项目采用 MIT 许可证，详情请见 [LICENSE](LICENSE) 文件。
